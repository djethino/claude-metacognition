"use strict";
/**
 * Plugin detection for asymptomatik-souvenir.
 *
 * Checks the user settings (settings.json in the Claude config directory) for an enabled
 * asymptomatik-souvenir plugin, from any marketplace.
 * Result is cached for the lifetime of the process (one hook invocation).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSouvenirAvailable = isSouvenirAvailable;
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
const SOUVENIR_PLUGIN = 'asymptomatik-souvenir';
let _souvenirAvailable = null;
/**
 * Check if the asymptomatik-souvenir plugin is installed and enabled.
 */
function isSouvenirAvailable() {
    if (_souvenirAvailable !== null)
        return _souvenirAvailable;
    try {
        // CLAUDE_CONFIG_DIR is set when Claude Code runs with a relocated config directory
        const configDir = process.env.CLAUDE_CONFIG_DIR || (0, path_1.join)((0, os_1.homedir)(), '.claude');
        const settingsPath = (0, path_1.join)(configDir, 'settings.json');
        if (!(0, fs_1.existsSync)(settingsPath)) {
            _souvenirAvailable = false;
            return false;
        }
        const settings = JSON.parse((0, fs_1.readFileSync)(settingsPath, 'utf-8'));
        const enabled = settings.enabledPlugins ?? {};
        // Plugin ids are "<plugin>@<marketplace>"
        _souvenirAvailable = Object.entries(enabled).some(([id, val]) => id.split('@')[0] === SOUVENIR_PLUGIN && val === true);
    }
    catch {
        _souvenirAvailable = false;
    }
    return _souvenirAvailable;
}
