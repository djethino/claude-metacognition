"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const io_js_1 = require("../lib/io.js");
const state_js_1 = require("../lib/state.js");
const messages_js_1 = require("../lib/messages.js");
const fs_1 = require("fs");
// Prefixes of the messages Claude Code itself queues as prompts
const NOTIFICATION_PREFIXES = ['<task-notification>', '<agent-message'];
function isNotification(prompt) {
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
function isAssistantMidTask(transcriptPath) {
    if (!transcriptPath)
        return false;
    try {
        const fd = (0, fs_1.openSync)(transcriptPath, 'r');
        try {
            const stats = (0, fs_1.fstatSync)(fd);
            if (stats.size === 0)
                return false;
            // Read last 64KB — enough for several transcript entries
            const chunkSize = Math.min(65536, stats.size);
            const buffer = Buffer.alloc(chunkSize);
            (0, fs_1.readSync)(fd, buffer, 0, chunkSize, Math.max(0, stats.size - chunkSize));
            const content = buffer.toString('utf-8');
            const lines = content.split('\n');
            // Scan from the end to find the most recent assistant entry
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (!line)
                    continue;
                try {
                    const entry = JSON.parse(line);
                    if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
                        return entry.message.content.some((block) => block.type === 'tool_use');
                    }
                }
                catch {
                    // Truncated first line in chunk or invalid JSON — skip
                    continue;
                }
            }
        }
        finally {
            (0, fs_1.closeSync)(fd);
        }
    }
    catch {
        // Can't read transcript — safe default: not mid-task
    }
    return false;
}
(0, io_js_1.runHook)('UserPromptSubmit', (input, projectDir) => {
    const { prompt, session_id } = input;
    if (!prompt || !session_id)
        return;
    if (isNotification(prompt))
        return;
    const timestamp = new Date().toISOString();
    let isNewTask = false;
    (0, state_js_1.updateState)(projectDir, session_id, (state) => {
        // New task = Stop fired (task_completed) AND Claude is NOT mid-tool-chain
        isNewTask = state.task_completed && !isAssistantMidTask(input.transcript_path);
        if (isNewTask) {
            // New task — reset context fields, save as initial prompt
            state.initial_prompt = prompt;
            state.initial_timestamp = timestamp;
            state.interventions = [];
            state.task_completed = false;
        }
        else {
            // Same task — add as intervention
            state.interventions.push({ timestamp, prompt });
        }
    });
    (0, state_js_1.cleanupOldStates)(projectDir);
    if (isNewTask) {
        (0, io_js_1.outputContext)('UserPromptSubmit', messages_js_1.PRE_TASK_REFLECTION);
    }
});
