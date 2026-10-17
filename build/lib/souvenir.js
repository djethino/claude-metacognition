"use strict";
/**
 * Plugin detection for claude-souvenir.
 *
 * Checks ~/.claude/settings.json for enabledPlugins containing 'claude-souvenir'.
 * Result is cached for the lifetime of the process (one hook invocation).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSouvenirAvailable = isSouvenirAvailable;
const fs_1 = require("fs");
const path_1 = require("path");
const os_1 = require("os");
let _souvenirAvailable = null;
/**
 * Check if claude-souvenir plugin is installed and enabled.
 */
function isSouvenirAvailable() {
    if (_souvenirAvailable !== null)
        return _souvenirAvailable;
    try {
        const settingsPath = (0, path_1.join)((0, os_1.homedir)(), '.claude', 'settings.json');
        if (!(0, fs_1.existsSync)(settingsPath)) {
            _souvenirAvailable = false;
            return false;
        }
        const settings = JSON.parse((0, fs_1.readFileSync)(settingsPath, 'utf-8'));
        const enabled = settings.enabledPlugins ?? {};
        _souvenirAvailable = Object.entries(enabled).some(([key, val]) => key.includes('claude-souvenir') && val === true);
    }
    catch {
        _souvenirAvailable = false;
    }
    return _souvenirAvailable;
}
