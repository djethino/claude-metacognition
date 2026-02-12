/**
 * Metacognition state CRUD (.claude/metacognition/{session_id}.json).
 *
 * Tracks: task_started, compaction_count (for reflection prompts).
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { MetacogState } from './types.js';

const DEFAULT_STATE: MetacogState = { task_started: false, compaction_count: 0 };

function getStateDir(cwd: string): string {
  return join(cwd, '.claude', 'metacognition');
}

function getStateFile(cwd: string, sessionId: string): string {
  return join(getStateDir(cwd), `${sessionId}.json`);
}

/**
 * Load session state or return default.
 */
export function loadState(cwd: string, sessionId: string): MetacogState {
  try {
    const raw = readFileSync(getStateFile(cwd, sessionId), 'utf-8');
    return JSON.parse(raw) as MetacogState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/**
 * Save session state. Returns true on success.
 */
export function saveState(cwd: string, sessionId: string, state: MetacogState): boolean {
  try {
    const dir = getStateDir(cwd);
    mkdirSync(dir, { recursive: true });
    const target = getStateFile(cwd, sessionId);
    // Atomic write: temp file + rename (prevents partial reads by concurrent hooks)
    const tmp = target + '.' + randomBytes(4).toString('hex') + '.tmp';
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tmp, target);
    return true;
  } catch {
    return false;
  }
}
