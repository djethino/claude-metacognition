/**
 * Task context CRUD (.claude/task-contexts/{session_id}.json) + cleanup.
 *
 * Tracks: initial_prompt, interventions, file_access, task_completed.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { TaskContext } from './types.js';

const MAX_CONTEXT_FILES = 10;

function getContextsDir(cwd: string): string {
  return join(cwd, '.claude', 'task-contexts');
}

function getContextFile(cwd: string, sessionId: string): string {
  return join(getContextsDir(cwd), `${sessionId}.json`);
}

/**
 * Load task context if it exists. Returns null on error or missing.
 */
export function loadContext(cwd: string, sessionId: string): TaskContext | null {
  try {
    const raw = readFileSync(getContextFile(cwd, sessionId), 'utf-8');
    return JSON.parse(raw) as TaskContext;
  } catch {
    return null;
  }
}

/**
 * Save task context. Returns true on success.
 */
export function saveContext(cwd: string, sessionId: string, context: TaskContext): boolean {
  try {
    const dir = getContextsDir(cwd);
    mkdirSync(dir, { recursive: true });
    const target = getContextFile(cwd, sessionId);
    // Atomic write: write to temp file then rename (prevents partial reads by concurrent hooks)
    const tmp = target + '.' + randomBytes(4).toString('hex') + '.tmp';
    writeFileSync(tmp, JSON.stringify(context, null, 2), 'utf-8');
    renameSync(tmp, target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset the task context for a new session.
 */
export function resetContext(cwd: string, sessionId: string): void {
  const context: TaskContext = {
    initial_prompt: null,
    initial_timestamp: null,
    interventions: [],
  };
  saveContext(cwd, sessionId, context);
}

/**
 * Keep only the MAX_CONTEXT_FILES most recent context files.
 */
export function cleanupOldContexts(cwd: string): void {
  const dir = getContextsDir(cwd);
  try {
    const entries = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const fullPath = join(dir, f);
        return { path: fullPath, mtime: statSync(fullPath).mtimeMs };
      });

    if (entries.length <= MAX_CONTEXT_FILES) return;

    entries.sort((a, b) => a.mtime - b.mtime);
    const toDelete = entries.slice(0, entries.length - MAX_CONTEXT_FILES);
    for (const entry of toDelete) {
      unlinkSync(entry.path);
    }
  } catch {
    // Directory doesn't exist or other OS error — ignore
  }
}
