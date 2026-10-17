/**
 * Plugin detection for asymptomatik-souvenir.
 *
 * Checks the user settings (settings.json in the Claude config directory) for an enabled
 * asymptomatik-souvenir plugin, from any marketplace.
 * Result is cached for the lifetime of the process (one hook invocation).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SOUVENIR_PLUGIN = 'asymptomatik-souvenir';

let _souvenirAvailable: boolean | null = null;

/**
 * Check if the asymptomatik-souvenir plugin is installed and enabled.
 */
export function isSouvenirAvailable(): boolean {
  if (_souvenirAvailable !== null) return _souvenirAvailable;

  try {
    // CLAUDE_CONFIG_DIR is set when Claude Code runs with a relocated config directory
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    const settingsPath = join(configDir, 'settings.json');
    if (!existsSync(settingsPath)) {
      _souvenirAvailable = false;
      return false;
    }

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const enabled: Record<string, boolean> = settings.enabledPlugins ?? {};

    // Plugin ids are "<plugin>@<marketplace>"
    _souvenirAvailable = Object.entries(enabled).some(
      ([id, val]) => id.split('@')[0] === SOUVENIR_PLUGIN && val === true,
    );
  } catch {
    _souvenirAvailable = false;
  }

  return _souvenirAvailable!;
}
