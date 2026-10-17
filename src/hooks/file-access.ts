/**
 * PostToolUse hook for tracking file access.
 *
 * Records files accessed by Read/Edit/Write/MultiEdit in the session's
 * task context.
 *
 * Access types:
 * - read: file read (for context/analysis)
 * - write: file created (new file)
 * - update: file modified (Edit/MultiEdit)
 *
 * Provides precise tracking of files accessed by THIS session,
 * independent of filesystem mtime (important for multi-agent scenarios).
 */

import { runHook } from '../lib/io.js';
import { updateState } from '../lib/state.js';
import { normalizePath } from '../lib/paths.js';

const TRACKED_TOOLS = new Set(['Read', 'Edit', 'Write', 'MultiEdit']);

runHook('PostToolUse', ({ cwd, session_id, tool_name, tool_input }) => {
  if (!cwd || !session_id) return;
  if (!tool_name || !TRACKED_TOOLS.has(tool_name)) return;

  const filePath = (tool_input?.file_path as string) ?? '';
  if (!filePath) return;

  const normalizedPath = normalizePath(filePath, cwd);

  // Determine access type
  let accessType: string;
  if (tool_name === 'Read') {
    accessType = 'read';
  } else if (tool_name === 'Write') {
    accessType = 'write';
  } else {
    // Edit or MultiEdit
    accessType = 'update';
  }

  updateState(cwd, session_id, (state) => {
    // Normalize existing paths (handle backslash inconsistencies)
    const normalizedAccess: Record<string, string[]> = {};
    for (const [path, accesses] of Object.entries(state.file_access ?? {})) {
      const normPath = path.replace(/\\/g, '/');
      if (normPath in normalizedAccess) {
        const merged = new Set([...normalizedAccess[normPath], ...accesses]);
        normalizedAccess[normPath] = [...merged];
      } else {
        normalizedAccess[normPath] = accesses;
      }
    }

    // Add this access
    const accesses = (normalizedAccess[normalizedPath] ??= []);
    if (!accesses.includes(accessType)) {
      accesses.push(accessType);
    }
    state.file_access = normalizedAccess;
  });
});
