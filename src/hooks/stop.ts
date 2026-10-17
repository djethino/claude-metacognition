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

import { runHook } from '../lib/io.js';
import { updateState } from '../lib/state.js';

runHook('Stop', ({ cwd, session_id }) => {
  if (!cwd || !session_id) return;

  updateState(cwd, session_id, (state) => {
    state.task_completed = true;
  });
});
