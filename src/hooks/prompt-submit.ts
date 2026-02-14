/**
 * UserPromptSubmit hook — Metacognition + prompt capture.
 *
 * Two roles:
 * 1. Capture initial prompt and user interventions (for post-compaction context)
 * 2. Inject reflection questions when a new task begins
 *
 * Capture logic:
 * - If task_completed flag is true AND Claude is NOT mid-task -> new task
 * - Mid-task detection: read last transcript entries, check for tool_use in last assistant message
 * - Otherwise -> intervention on current task, append to list
 *
 * Reflection logic:
 * - At first prompt or after compaction -> inject reflection questions
 */

import { loadHookInput, outputContext } from '../lib/io.js';
import { loadState, saveState, cleanupOldStates } from '../lib/state.js';
import { buildInterleaved, PRE_TASK_REFLECTION } from '../lib/messages.js';
import { openSync, fstatSync, readSync, closeSync } from 'fs';

/**
 * Check if the last assistant message in the transcript contains tool_use blocks,
 * indicating Claude is mid-task (between tool calls).
 *
 * Reads only the last 64KB of the JSONL file for performance.
 * Returns false (safe default) if transcript is unavailable or unreadable.
 */
function isAssistantMidTask(transcriptPath: string | undefined): boolean {
  if (!transcriptPath) return false;

  try {
    const fd = openSync(transcriptPath, 'r');
    try {
      const stats = fstatSync(fd);
      if (stats.size === 0) return false;

      // Read last 64KB — enough for several transcript entries
      const chunkSize = Math.min(65536, stats.size);
      const buffer = Buffer.alloc(chunkSize);
      readSync(fd, buffer, 0, chunkSize, Math.max(0, stats.size - chunkSize));

      const content = buffer.toString('utf-8');
      const lines = content.split('\n');

      // Scan from the end to find the most recent assistant entry
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const entry = JSON.parse(line);
          if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
            return entry.message.content.some(
              (block: { type: string }) => block.type === 'tool_use',
            );
          }
        } catch {
          // Truncated first line in chunk or invalid JSON — skip
          continue;
        }
      }
    } finally {
      closeSync(fd);
    }
  } catch {
    // Can't read transcript — safe default: not mid-task
  }

  return false;
}

function main(): number {
  const input = loadHookInput();
  if (!input) return 0;

  const { cwd, prompt, session_id } = input;
  if (!cwd || !prompt || !session_id) return 0;

  const timestamp = new Date().toISOString();

  // --- Single state load ---
  const state = loadState(cwd, session_id);

  // New task = Stop fired (task_completed) AND Claude is NOT mid-tool-chain
  const isNewTask = state.task_completed && !isAssistantMidTask(input.transcript_path);

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
