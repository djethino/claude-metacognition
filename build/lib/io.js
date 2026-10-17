"use strict";
/**
 * Stdin/stdout I/O for hooks.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadHookInput = loadHookInput;
exports.writeOutput = writeOutput;
exports.outputContext = outputContext;
const fs_1 = require("fs");
/**
 * Load and parse JSON input from stdin.
 * Returns null on error.
 */
function loadHookInput() {
    try {
        const raw = (0, fs_1.readFileSync)(0, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
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
