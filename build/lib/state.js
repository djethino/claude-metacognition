"use strict";
/**
 * Unified session state CRUD (.claude/ASymptOmatik/metacognition/{session_id}.json).
 *
 * Single file per session containing the task context (initial_prompt, interventions,
 * task_completed, file_access).
 *
 * Several hook processes write the same file concurrently (parallel tool calls, subagents
 * sharing the session id, a prompt sent while tools run): every read-modify-write goes
 * through updateState(), which holds an exclusive lock file so no update is lost.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadState = loadState;
exports.updateState = updateState;
exports.resetState = resetState;
exports.cleanupOldStates = cleanupOldStates;
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
const MAX_STATE_FILES = 10;
// A hook holds the lock for a few milliseconds; waiting longer means something is wrong
const LOCK_TIMEOUT_MS = 3000;
// A lock older than this was left by a killed process
const STALE_LOCK_MS = 10000;
// Windows: antivirus/indexers briefly hold freshly written files, making rename fail
const RENAME_RETRIES = 5;
const RETRY_DELAY_MS = 20;
const DEFAULT_STATE = {
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
function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function errorCode(err) {
    return err.code;
}
function acquireLock(lockPath) {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
        try {
            (0, fs_1.closeSync)((0, fs_1.openSync)(lockPath, 'wx'));
            return;
        }
        catch (err) {
            if (errorCode(err) !== 'EEXIST')
                throw err;
        }
        try {
            if (Date.now() - (0, fs_1.statSync)(lockPath).mtimeMs > STALE_LOCK_MS) {
                (0, fs_1.unlinkSync)(lockPath);
                continue;
            }
        }
        catch (err) {
            // Released between our open and stat: try again at once
            if (errorCode(err) === 'ENOENT')
                continue;
            throw err;
        }
        if (Date.now() > deadline) {
            throw new Error(`state file still locked after ${LOCK_TIMEOUT_MS} ms: ${lockPath}`);
        }
        sleep(RETRY_DELAY_MS);
    }
}
function readState(file) {
    let raw;
    try {
        raw = (0, fs_1.readFileSync)(file, 'utf-8');
    }
    catch (err) {
        if (errorCode(err) === 'ENOENT')
            return { ...DEFAULT_STATE };
        throw err;
    }
    // Merge with defaults so files written by older versions stay readable
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
}
/** Write atomically (temp file + rename); the temp file never outlives a failure. */
function writeState(file, state) {
    const tmp = `${file}.${(0, crypto_1.randomBytes)(4).toString('hex')}.tmp`;
    (0, fs_1.writeFileSync)(tmp, JSON.stringify(state, null, 2), 'utf-8');
    try {
        for (let attempt = 1;; attempt++) {
            try {
                (0, fs_1.renameSync)(tmp, file);
                return;
            }
            catch (err) {
                const code = errorCode(err);
                const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
                if (!transient || attempt >= RENAME_RETRIES)
                    throw err;
                sleep(RETRY_DELAY_MS * attempt);
            }
        }
    }
    catch (err) {
        (0, fs_1.unlinkSync)(tmp);
        throw err;
    }
}
function withLock(cwd, sessionId, fn) {
    (0, fs_1.mkdirSync)(getStateDir(cwd), { recursive: true });
    const file = getStateFile(cwd, sessionId);
    const lock = `${file}.lock`;
    acquireLock(lock);
    try {
        return fn(file);
    }
    finally {
        (0, fs_1.unlinkSync)(lock);
    }
}
/**
 * Read the session state (defaults if none was saved yet).
 */
function loadState(cwd, sessionId) {
    return withLock(cwd, sessionId, readState);
}
/**
 * Read-modify-write the session state under an exclusive lock.
 * `mutate` changes the state in place; the saved state is returned.
 */
function updateState(cwd, sessionId, mutate) {
    return withLock(cwd, sessionId, (file) => {
        const state = readState(file);
        mutate(state);
        writeState(file, state);
        return state;
    });
}
/**
 * Reset session state to defaults (new session).
 */
function resetState(cwd, sessionId) {
    updateState(cwd, sessionId, (state) => {
        Object.assign(state, DEFAULT_STATE, { interventions: [] });
        delete state.file_access;
    });
}
/**
 * Keep only the MAX_STATE_FILES most recent state files, and remove temp/lock files
 * left behind by killed processes.
 */
function cleanupOldStates(cwd) {
    const dir = getStateDir(cwd);
    const now = Date.now();
    const stateFiles = [];
    for (const name of (0, fs_1.readdirSync)(dir)) {
        const fullPath = (0, path_1.join)(dir, name);
        ignoreVanished(() => {
            const mtime = (0, fs_1.statSync)(fullPath).mtimeMs;
            if (name.endsWith('.json')) {
                stateFiles.push({ path: fullPath, mtime });
            }
            else if ((name.endsWith('.tmp') || name.endsWith('.lock')) && now - mtime > STALE_LOCK_MS) {
                (0, fs_1.unlinkSync)(fullPath);
            }
        });
    }
    if (stateFiles.length <= MAX_STATE_FILES)
        return;
    stateFiles.sort((a, b) => a.mtime - b.mtime);
    for (const entry of stateFiles.slice(0, stateFiles.length - MAX_STATE_FILES)) {
        ignoreVanished(() => (0, fs_1.unlinkSync)(entry.path));
    }
}
/** Another hook process may delete the same file first: that is not an error. */
function ignoreVanished(fn) {
    try {
        fn();
    }
    catch (err) {
        if (errorCode(err) !== 'ENOENT')
            throw err;
    }
}
