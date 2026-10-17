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
 * Run a hook and exit. A failure is reported on stderr with exit code 1: Claude Code shows
 * it as a non-blocking hook error instead of the hook silently doing nothing.
 */
function runHook(name, main) {
    try {
        main(loadHookInput());
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
