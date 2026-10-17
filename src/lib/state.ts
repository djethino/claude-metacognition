/**
 * Unified session state CRUD (.claude/ASymptOmatik/metacognition/{session_id}.json).
 *
 * Single file per session containing the task context (initial_prompt, interventions,
 * task_completed, file_access).
 *
 * Several hook processes write the same file concurrently (parallel tool calls, subagents
 * sharing the session id, a prompt sent while tools run): every read-modify-write goes
 * through updateState(), which holds an exclusive lock file so no update is lost.
 */

import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  openSync,
  closeSync,
} from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { SessionState } from './types.js';

const MAX_STATE_FILES = 10;

// A hook holds the lock for a few milliseconds; waiting longer means something is wrong
const LOCK_TIMEOUT_MS = 3000;
// A lock older than this was left by a killed process
const STALE_LOCK_MS = 10000;
// Windows: antivirus/indexers briefly hold freshly written files, making rename fail
const RENAME_RETRIES = 5;
const RETRY_DELAY_MS = 20;

const DEFAULT_STATE: SessionState = {
  initial_prompt: null,
  initial_timestamp: null,
  interventions: [],
  task_completed: true, // Default true so first prompt starts a new task
};

function getStateDir(cwd: string): string {
  return join(cwd, '.claude', 'ASymptOmatik', 'metacognition');
}

function getStateFile(cwd: string, sessionId: string): string {
  return join(getStateDir(cwd), `${sessionId}.json`);
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function errorCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException).code;
}

function acquireLock(lockPath: string): void {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      closeSync(openSync(lockPath, 'wx'));
      return;
    } catch (err) {
      if (errorCode(err) !== 'EEXIST') throw err;
    }

    try {
      if (Date.now() - statSync(lockPath).mtimeMs > STALE_LOCK_MS) {
        unlinkSync(lockPath);
        continue;
      }
    } catch (err) {
      // Released between our open and stat: try again at once
      if (errorCode(err) === 'ENOENT') continue;
      throw err;
    }

    if (Date.now() > deadline) {
      throw new Error(`state file still locked after ${LOCK_TIMEOUT_MS} ms: ${lockPath}`);
    }
    sleep(RETRY_DELAY_MS);
  }
}

function readState(file: string): SessionState {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf-8');
  } catch (err) {
    if (errorCode(err) === 'ENOENT') return { ...DEFAULT_STATE };
    throw err;
  }
  // Merge with defaults so files written by older versions stay readable
  return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<SessionState>) };
}

/** Write atomically (temp file + rename); the temp file never outlives a failure. */
function writeState(file: string, state: SessionState): void {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        renameSync(tmp, file);
        return;
      } catch (err) {
        const code = errorCode(err);
        const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
        if (!transient || attempt >= RENAME_RETRIES) throw err;
        sleep(RETRY_DELAY_MS * attempt);
      }
    }
  } catch (err) {
    unlinkSync(tmp);
    throw err;
  }
}

function withLock<T>(cwd: string, sessionId: string, fn: (file: string) => T): T {
  mkdirSync(getStateDir(cwd), { recursive: true });
  const file = getStateFile(cwd, sessionId);
  const lock = `${file}.lock`;

  acquireLock(lock);
  try {
    return fn(file);
  } finally {
    unlinkSync(lock);
  }
}

/**
 * Read the session state (defaults if none was saved yet).
 */
export function loadState(cwd: string, sessionId: string): SessionState {
  return withLock(cwd, sessionId, readState);
}

/**
 * Read-modify-write the session state under an exclusive lock.
 * `mutate` changes the state in place; the saved state is returned.
 */
export function updateState(
  cwd: string,
  sessionId: string,
  mutate: (state: SessionState) => void,
): SessionState {
  return withLock(cwd, sessionId, (file) => {
    const state = readState(file);
    mutate(state);
    writeState(file, state);
    return state;
  });
}

/**
 * Reset session state to defaults (new session).
 */
export function resetState(cwd: string, sessionId: string): void {
  updateState(cwd, sessionId, (state) => {
    Object.assign(state, DEFAULT_STATE, { interventions: [] });
    delete state.file_access;
  });
}

/**
 * Keep only the MAX_STATE_FILES most recent state files, and remove temp/lock files
 * left behind by killed processes.
 */
export function cleanupOldStates(cwd: string): void {
  const dir = getStateDir(cwd);
  const now = Date.now();
  const stateFiles: { path: string; mtime: number }[] = [];

  for (const name of readdirSync(dir)) {
    const fullPath = join(dir, name);
    ignoreVanished(() => {
      const mtime = statSync(fullPath).mtimeMs;
      if (name.endsWith('.json')) {
        stateFiles.push({ path: fullPath, mtime });
      } else if ((name.endsWith('.tmp') || name.endsWith('.lock')) && now - mtime > STALE_LOCK_MS) {
        unlinkSync(fullPath);
      }
    });
  }

  if (stateFiles.length <= MAX_STATE_FILES) return;

  stateFiles.sort((a, b) => a.mtime - b.mtime);
  for (const entry of stateFiles.slice(0, stateFiles.length - MAX_STATE_FILES)) {
    ignoreVanished(() => unlinkSync(entry.path));
  }
}

/** Another hook process may delete the same file first: that is not an error. */
function ignoreVanished(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    if (errorCode(err) !== 'ENOENT') throw err;
  }
}
