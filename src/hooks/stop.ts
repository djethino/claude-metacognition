/**
 * Stop hook — Flag task_completed.
 *
 * Sets task_completed=true in the task context.
 * Allows prompt-submit.ts to distinguish new task vs intervention.
 *
 * Note: The Stop hook fires AFTER the complete response. A systemMessage here
 * shows on the user side, not the agent side. End-of-task checks are in
 * PRE_TASK_REFLECTION in prompt-submit.ts ("AVANT DE CONCLURE" section).
 */

import { loadHookInput } from '../lib/io.js';
import { loadContext, saveContext } from '../lib/context.js';

function main(): number {
  const input = loadHookInput();
  if (!input) return 0;

  const { cwd, session_id } = input;
  if (!cwd || !session_id) return 0;

  const context = loadContext(cwd, session_id) ?? ({} as Record<string, unknown>);
  (context as Record<string, unknown>).task_completed = true;
  saveContext(cwd, session_id, context as any);

  return 0;
}

process.exit(main());
