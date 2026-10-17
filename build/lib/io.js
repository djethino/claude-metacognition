"use strict";
/**
 * Stdin/stdout I/O for hooks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadHookInput = loadHookInput;
exports.runHook = runHook;
exports.writeOutput = writeOutput;
exports.outputContext = outputContext;
const fs_1 = require("fs");
/**
 * Load and parse JSON input from stdin.
 */
function loadHookInput() {
    return JSON.parse((0, fs_1.readFileSync)(0, 'utf-8'));
}
/**
 * Project root where the session started. The input's `cwd` follows every `cd` Claude runs,
 * so state keyed on it was scattered across subfolders; CLAUDE_PROJECT_DIR never moves.
 */
function getProjectDir() {
    const dir = process.env.CLAUDE_PROJECT_DIR;
    if (!dir)
        throw new Error('CLAUDE_PROJECT_DIR is not set (Claude Code exports it to hook commands)');
    return dir;
}
/**
 * Run a hook and exit. A failure is reported on stderr with exit code 1: Claude Code shows
 * it as a non-blocking hook error instead of the hook silently doing nothing.
 */
function runHook(name, main) {
    try {
        main(loadHookInput(), getProjectDir());
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[metacognition] ${name}: ${message}\n`);
        process.exit(1);
    }
    process.exit(0);
}
/**
 * Write hook output to stdout.
 */
function writeOutput(output) {
    process.stdout.write(JSON.stringify(output, null, 0) + '\n');
}
/**
 * Output additionalContext for a given hook event.
 */
function outputContext(hookEventName, message) {
    writeOutput({
        hookSpecificOutput: {
            hookEventName,
            additionalContext: message,
        },
    });
}
