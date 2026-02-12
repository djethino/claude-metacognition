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
import { loadState, saveState } from '../lib/state.js';

function main(): number {
  const input = loadHookInput();
  if (!input) return 0;

  const { cwd, session_id } = input;
  if (!cwd || !session_id) return 0;

  const state = loadState(cwd, session_id);
  state.task_completed = true;
  saveState(cwd, session_id, state);

  return 0;
}

process.exit(main());
