/**
 * UserPromptSubmit hook — Metacognition + prompt capture.
 *
 * Two roles:
 * 1. Capture initial prompt and user interventions (for post-compaction context)
 * 2. Inject reflection questions when a new task begins
 *
 * Capture logic:
 * - If task_completed flag is true -> new task, reset and save as initial prompt
 * - Otherwise -> intervention on current task, append to list
 *
 * Reflection logic:
 * - At first prompt or after compaction -> inject reflection questions
 */

import { loadHookInput, outputContext } from '../lib/io.js';
import { loadState, saveState, cleanupOldStates } from '../lib/state.js';
import { buildInterleaved, PRE_TASK_REFLECTION } from '../lib/messages.js';

function main(): number {
  const input = loadHookInput();
  if (!input) return 0;

  const { cwd, prompt, session_id } = input;
  if (!cwd || !prompt || !session_id) return 0;

  const timestamp = new Date().toISOString();

  // --- Single state load ---
  const state = loadState(cwd, session_id);

  const isNewTask = state.task_completed;

  if (isNewTask) {
    // New task — reset context fields, save as initial prompt
    state.initial_prompt = prompt;
    state.initial_timestamp = timestamp;
    state.interventions = [];
    state.task_completed = false;
  } else {
    // Same task — add as intervention
    state.interventions.push({ timestamp, prompt });
  }

  // --- Metacognition reflection ---
  // Only trigger reflection at task start (first prompt or after compaction)
  const shouldReflect = !state.task_started || state.compaction_count > 0;

  state.task_started = true;
  if (state.compaction_count > 0) {
    state.compaction_count = 0;
  }

  saveState(cwd, session_id, state);
  cleanupOldStates(cwd);

  if (!shouldReflect) {
    return 0;
  }

  // Interleaved message: nudge + prompt + nudge (with REPETITION_COUNT=2)
  const interleaved = buildInterleaved(PRE_TASK_REFLECTION, prompt);
  outputContext('UserPromptSubmit', interleaved);

  return 0;
}

process.exit(main());
