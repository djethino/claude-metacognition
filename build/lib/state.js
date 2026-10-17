"use strict";
/**
 * Unified session state CRUD (.claude/ASymptOmatik/metacognition/{session_id}.json).
 *
 * Single file per session containing both metacognition state (task_started,
 * compaction_count) and task context (initial_prompt, interventions, file_access).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadState = loadState;
exports.saveState = saveState;
exports.resetState = resetState;
exports.cleanupOldStates = cleanupOldStates;
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const MAX_STATE_FILES = 10;
const DEFAULT_STATE = {
    task_started: false,
    compaction_count: 0,
    initial_prompt: null,
    initial_timestamp: null,
    interventions: [],
    task_completed: true, // Default true so first prompt starts a new task
};
function getStateDir(cwd) {
    return (0, path_1.join)(cwd, '.claude', 'ASymptOmatik', 'metacognition');
}
function getStateFile(cwd, sessionId) {
    return (0, path_1.join)(getStateDir(cwd), `${sessionId}.json`);
}
/**
 * Load session state. Merges with defaults to handle old/partial files gracefully.
 */
function loadState(cwd, sessionId) {
    try {
        const raw = (0, fs_1.readFileSync)(getStateFile(cwd, sessionId), 'utf-8');
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_STATE, ...parsed };
    }
    catch {
        return { ...DEFAULT_STATE };
    }
}
/**
 * Save session state atomically (temp file + rename).
 */
function saveState(cwd, sessionId, state) {
    try {
        const dir = getStateDir(cwd);
        (0, fs_1.mkdirSync)(dir, { recursive: true });
        const target = getStateFile(cwd, sessionId);
        const tmp = target + '.' + (0, crypto_1.randomBytes)(4).toString('hex') + '.tmp';
        (0, fs_1.writeFileSync)(tmp, JSON.stringify(state, null, 2), 'utf-8');
        (0, fs_1.renameSync)(tmp, target);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Reset session state to defaults (new session / new task).
 */
function resetState(cwd, sessionId) {
    saveState(cwd, sessionId, { ...DEFAULT_STATE });
}
/**
 * Keep only the MAX_STATE_FILES most recent state files.
 */
function cleanupOldStates(cwd) {
    const dir = getStateDir(cwd);
    try {
        const entries = (0, fs_1.readdirSync)(dir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => {
            const fullPath = (0, path_1.join)(dir, f);
            return { path: fullPath, mtime: (0, fs_1.statSync)(fullPath).mtimeMs };
        });
        if (entries.length <= MAX_STATE_FILES)
            return;
        entries.sort((a, b) => a.mtime - b.mtime);
        const toDelete = entries.slice(0, entries.length - MAX_STATE_FILES);
        for (const entry of toDelete) {
            (0, fs_1.unlinkSync)(entry.path);
        }
    }
    catch {
        // Directory doesn't exist or other OS error — ignore
    }
}
