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
 * - Notifications Claude Code delivers through the prompt queue (background task finished,
 *   subagent report) are not user prompts: ignored
 *
 * Reflection logic:
 * - At every new task -> inject reflection questions
 */

import { runHook, outputContext } from '../lib/io.js';
import { updateState, cleanupOldStates } from '../lib/state.js';
import { PRE_TASK_REFLECTION } from '../lib/messages.js';
import { openSync, fstatSync, readSync, closeSync } from 'fs';

// Prefixes of the messages Claude Code itself queues as prompts
const NOTIFICATION_PREFIXES = ['<task-notification>', '<agent-message'];

function isNotification(prompt: string): boolean {
  const start = prompt.trimStart();
  return NOTIFICATION_PREFIXES.some((prefix) => start.startsWith(prefix));
}

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

runHook('UserPromptSubmit', (input) => {
  const { cwd, prompt, session_id } = input;
  if (!cwd || !prompt || !session_id) return;
  if (isNotification(prompt)) return;

  const timestamp = new Date().toISOString();
  let isNewTask = false;

  updateState(cwd, session_id, (state) => {
    // New task = Stop fired (task_completed) AND Claude is NOT mid-tool-chain
    isNewTask = state.task_completed && !isAssistantMidTask(input.transcript_path);

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
  });
  cleanupOldStates(cwd);

  if (isNewTask) {
    outputContext('UserPromptSubmit', PRE_TASK_REFLECTION);
  }
});
