/**
 * Stdin/stdout I/O for hooks.
 */

import { readFileSync } from 'fs';
import type { HookInput, HookOutput } from './types.js';

/**
 * Load and parse JSON input from stdin.
 */
export function loadHookInput(): HookInput {
  return JSON.parse(readFileSync(0, 'utf-8')) as HookInput;
}

/**
 * Run a hook and exit. A failure is reported on stderr with exit code 1: Claude Code shows
 * it as a non-blocking hook error instead of the hook silently doing nothing.
 */
export function runHook(name: string, main: (input: HookInput) => void): void {
  try {
    main(loadHookInput());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[metacognition] ${name}: ${message}\n`);
    process.exit(1);
  }
  process.exit(0);
}

/**
 * Write hook output to stdout.
 */
export function writeOutput(output: HookOutput): void {
  process.stdout.write(JSON.stringify(output, null, 0) + '\n');
}

/**
 * Output additionalContext for a given hook event.
 */
export function outputContext(hookEventName: string, message: string): void {
  writeOutput({
    hookSpecificOutput: {
      hookEventName,
      additionalContext: message,
    },
  });
}
