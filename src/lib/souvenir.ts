/**
 * Plugin detection for claude-souvenir.
 *
 * Checks ~/.claude/settings.json for enabledPlugins containing 'claude-souvenir'.
 * Result is cached for the lifetime of the process (one hook invocation).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

let _souvenirAvailable: boolean | null = null;

/**
 * Check if claude-souvenir plugin is installed and enabled.
 */
export function isSouvenirAvailable(): boolean {
  if (_souvenirAvailable !== null) return _souvenirAvailable;

  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json');
    if (!existsSync(settingsPath)) {
      _souvenirAvailable = false;
      return false;
    }

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const enabled: Record<string, boolean> = settings.enabledPlugins ?? {};

    _souvenirAvailable = Object.entries(enabled).some(
      ([key, val]) => key.includes('claude-souvenir') && val === true,
    );
  } catch {
    _souvenirAvailable = false;
  }

  return _souvenirAvailable!;
}
