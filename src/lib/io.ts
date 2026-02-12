/**
 * Stdin/stdout I/O for hooks.
 */

import { readFileSync } from 'fs';
import type { HookInput, HookOutput } from './types.js';

/**
 * Load and parse JSON input from stdin.
 * Returns null on error.
 */
export function loadHookInput(): HookInput | null {
  try {
    const raw = readFileSync(0, 'utf-8');
    return JSON.parse(raw) as HookInput;
  } catch {
    return null;
  }
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
