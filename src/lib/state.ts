/**
 * Unified session state CRUD (.claude/metacognition/{session_id}.json).
 *
 * Single file per session containing both metacognition state (task_started,
 * compaction_count) and task context (initial_prompt, interventions, file_access).
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { SessionState } from './types.js';

const MAX_STATE_FILES = 10;

const DEFAULT_STATE: SessionState = {
  task_started: false,
  compaction_count: 0,
  initial_prompt: null,
  initial_timestamp: null,
  interventions: [],
  task_completed: true, // Default true so first prompt starts a new task
};

function getStateDir(cwd: string): string {
  return join(cwd, '.claude', 'metacognition');
}

function getStateFile(cwd: string, sessionId: string): string {
  return join(getStateDir(cwd), `${sessionId}.json`);
}

/**
 * Load session state. Merges with defaults to handle old/partial files gracefully.
 */
export function loadState(cwd: string, sessionId: string): SessionState {
  try {
    const raw = readFileSync(getStateFile(cwd, sessionId), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/**
 * Save session state atomically (temp file + rename).
 */
export function saveState(cwd: string, sessionId: string, state: SessionState): boolean {
  try {
    const dir = getStateDir(cwd);
    mkdirSync(dir, { recursive: true });
    const target = getStateFile(cwd, sessionId);
    const tmp = target + '.' + randomBytes(4).toString('hex') + '.tmp';
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tmp, target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset session state to defaults (new session / new task).
 */
export function resetState(cwd: string, sessionId: string): void {
  saveState(cwd, sessionId, { ...DEFAULT_STATE });
}

/**
 * Keep only the MAX_STATE_FILES most recent state files.
 */
export function cleanupOldStates(cwd: string): void {
  const dir = getStateDir(cwd);
  try {
    const entries = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const fullPath = join(dir, f);
        return { path: fullPath, mtime: statSync(fullPath).mtimeMs };
      });

    if (entries.length <= MAX_STATE_FILES) return;

    entries.sort((a, b) => a.mtime - b.mtime);
    const toDelete = entries.slice(0, entries.length - MAX_STATE_FILES);
    for (const entry of toDelete) {
      unlinkSync(entry.path);
    }
  } catch {
    // Directory doesn't exist or other OS error — ignore
  }
}
