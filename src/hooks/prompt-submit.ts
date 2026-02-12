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
import { loadState, saveState } from '../lib/state.js';
import { loadContext, saveContext, cleanupOldContexts } from '../lib/context.js';
import { buildInterleaved, PRE_TASK_REFLECTION } from '../lib/messages.js';
import type { TaskContext } from '../lib/types.js';

function main(): number {
  const input = loadHookInput();
  if (!input) return 0;

  const { cwd, prompt, session_id } = input;
  if (!cwd || !prompt || !session_id) return 0;

  const timestamp = new Date().toISOString();

  // --- Task context tracking ---
  let context: TaskContext = loadContext(cwd, session_id) ?? {
    initial_prompt: null,
    initial_timestamp: null,
    interventions: [],
    task_completed: true, // Default to true so first prompt starts a task
  };

  const isNewTask = context.task_completed ?? true;

  if (isNewTask) {
    // New task — reset and save as initial prompt
    context = {
      initial_prompt: prompt,
      initial_timestamp: timestamp,
      interventions: [],
      task_completed: false,
    };
  } else {
    // Same task — add as intervention
    context.interventions.push({ timestamp, prompt });
  }

  saveContext(cwd, session_id, context);
  cleanupOldContexts(cwd);

  // --- Metacognition reflection ---
  const state = loadState(cwd, session_id);

  // Only trigger reflection at task start (first prompt or after compaction)
  if (state.task_started && state.compaction_count === 0) {
    return 0;
  }

  state.task_started = true;
  if (state.compaction_count > 0) {
    state.compaction_count = 0;
  }
  saveState(cwd, session_id, state);

  // Interleaved message: nudge + prompt + nudge (with REPETITION_COUNT=2)
  const interleaved = buildInterleaved(PRE_TASK_REFLECTION, prompt);
  outputContext('UserPromptSubmit', interleaved);

  return 0;
}

process.exit(main());
