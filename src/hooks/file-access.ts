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

import { loadHookInput } from '../lib/io.js';
import { loadContext, saveContext } from '../lib/context.js';
import { normalizePath } from '../lib/paths.js';
import type { TaskContext } from '../lib/types.js';

function main(): number {
  const input = loadHookInput();
  if (!input) return 0;

  const { cwd, session_id, tool_name, tool_input } = input;
  if (!cwd || !session_id) return 0;

  // Only track file-related tools
  const trackedTools = new Set(['Read', 'Edit', 'Write', 'MultiEdit']);
  if (!tool_name || !trackedTools.has(tool_name)) return 0;

  const filePath = (tool_input?.file_path as string) ?? '';
  if (!filePath) return 0;

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

  // Update context with file access
  const context: TaskContext = loadContext(cwd, session_id) ?? {
    initial_prompt: null,
    initial_timestamp: null,
    interventions: [],
  };

  if (!context.file_access) {
    context.file_access = {};
  }

  // Normalize existing paths (handle backslash inconsistencies)
  const normalizedAccess: Record<string, string[]> = {};
  for (const [path, accesses] of Object.entries(context.file_access)) {
    const normPath = path.replace(/\\/g, '/');
    if (normPath in normalizedAccess) {
      const merged = new Set([...normalizedAccess[normPath], ...accesses]);
      normalizedAccess[normPath] = [...merged];
    } else {
      normalizedAccess[normPath] = accesses;
    }
  }
  context.file_access = normalizedAccess;

  // Add this access
  if (!context.file_access[normalizedPath]) {
    context.file_access[normalizedPath] = [];
  }
  if (!context.file_access[normalizedPath].includes(accessType)) {
    context.file_access[normalizedPath].push(accessType);
  }

  saveContext(cwd, session_id, context);
  return 0;
}

process.exit(main());
