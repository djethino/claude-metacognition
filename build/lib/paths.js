"use strict";
/**
 * Path normalization, file mtime utilities, and git repository detection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePath = normalizePath;
exports.getFileMtime = getFileMtime;
exports.getRecentFilesWithMtime = getRecentFilesWithMtime;
exports.getGitSubdirectories = getGitSubdirectories;
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
/**
 * Convert to relative path and normalize separators to forward slashes.
 */
function normalizePath(filePath, cwd) {
    try {
        if ((0, path_1.isAbsolute)(filePath)) {
            try {
                filePath = (0, path_1.relative)(cwd, filePath);
            }
            catch {
                // If relative() fails (different drives on Windows), keep absolute
            }
        }
        return filePath.replace(/\\/g, '/');
    }
    catch {
        return filePath.replace(/\\/g, '/');
    }
}
/**
 * Get mtime of a file in HH:MM format. Returns null if file doesn't exist.
 */
function getFileMtime(cwd, filePath) {
    try {
        const fullPath = (0, path_1.join)(cwd, filePath);
        const stat = (0, fs_1.statSync)(fullPath);
        return formatTime(stat.mtimeMs);
    }
    catch {
        return null;
    }
}
/**
 * Get files modified since a given ISO timestamp, with their mtime (HH:MM format).
 * Returns at most `limit` files, sorted by most recent first.
 */
function getRecentFilesWithMtime(cwd, sinceTimestamp, limit = 15) {
    try {
        const sinceMs = new Date(sinceTimestamp).getTime();
        const results = [];
        walkDir(cwd, cwd, sinceMs, results);
        results.sort((a, b) => b.mtimeMs - a.mtimeMs);
        return results.slice(0, limit).map((r) => ({ path: r.path, mtime: r.mtime }));
    }
    catch {
        return [];
    }
}
/**
 * Scan cwd for immediate subdirectories containing a .git folder.
 * Returns git status info for each repo found.
 */
function getGitSubdirectories(cwd) {
    const results = [];
    let entries;
    try {
        entries = (0, fs_1.readdirSync)(cwd);
    }
    catch {
        return results;
    }
    for (const entry of entries) {
        const fullPath = (0, path_1.join)(cwd, entry);
        const gitDir = (0, path_1.join)(fullPath, '.git');
        try {
            const entryStat = (0, fs_1.statSync)(fullPath);
            if (!entryStat.isDirectory())
                continue;
            const gitStat = (0, fs_1.statSync)(gitDir);
            if (!gitStat.isDirectory())
                continue; // skip .git files (worktrees)
        }
        catch {
            continue;
        }
        const branch = readGitBranch(gitDir);
        const lastActivity = getGitLastActivity(gitDir);
        const uncommitted = gitCountUncommitted(fullPath);
        const unpushed = gitCountRevDiff(fullPath, '@{u}..HEAD');
        const unpulled = gitCountRevDiff(fullPath, 'HEAD..@{u}');
        results.push({
            path: entry,
            branch,
            lastActivity,
            uncommitted,
            unpushed,
            unpulled,
        });
    }
    // Sort by most recent activity first
    results.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
    return results;
}
// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------
function readGitBranch(gitDir) {
    try {
        const head = (0, fs_1.readFileSync)((0, path_1.join)(gitDir, 'HEAD'), 'utf-8').trim();
        const match = head.match(/^ref: refs\/heads\/(.+)$/);
        return match ? match[1] : 'detached';
    }
    catch {
        return 'unknown';
    }
}
function getGitLastActivity(gitDir) {
    try {
        // Try refs/heads/ for most recent branch ref
        const refsDir = (0, path_1.join)(gitDir, 'refs', 'heads');
        let newestMs = 0;
        try {
            const refs = (0, fs_1.readdirSync)(refsDir);
            for (const ref of refs) {
                const refStat = (0, fs_1.statSync)((0, path_1.join)(refsDir, ref));
                if (refStat.mtimeMs > newestMs)
                    newestMs = refStat.mtimeMs;
            }
        }
        catch {
            // No refs/heads — fall through
        }
        // Fallback to HEAD mtime
        if (newestMs === 0) {
            newestMs = (0, fs_1.statSync)((0, path_1.join)(gitDir, 'HEAD')).mtimeMs;
        }
        return formatDateTime(newestMs);
    }
    catch {
        return 'unknown';
    }
}
function gitCountUncommitted(repoPath) {
    try {
        const output = (0, child_process_1.execSync)('git status --porcelain', {
            cwd: repoPath,
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe'],
        }).toString().trim();
        return output ? output.split('\n').length : 0;
    }
    catch {
        return 0;
    }
}
function gitCountRevDiff(repoPath, revRange) {
    try {
        const output = (0, child_process_1.execSync)(`git rev-list --count ${revRange}`, {
            cwd: repoPath,
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe'],
        }).toString().trim();
        return parseInt(output, 10) || 0;
    }
    catch {
        // No upstream tracking, or other error
        return 0;
    }
}
function formatDateTime(ms) {
    const d = new Date(ms);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
const SKIP_DIRS = new Set(['.git', '.claude', 'node_modules', '__pycache__', 'venv', '.venv']);
function walkDir(baseDir, currentDir, sinceMs, results) {
    let entries;
    try {
        entries = (0, fs_1.readdirSync)(currentDir);
    }
    catch {
        return;
    }
    for (const entry of entries) {
        if (entry.startsWith('.') && currentDir === baseDir)
            continue; // skip dotfiles at root
        if (SKIP_DIRS.has(entry))
            continue;
        const fullPath = (0, path_1.join)(currentDir, entry);
        try {
            const stat = (0, fs_1.statSync)(fullPath);
            if (stat.isDirectory()) {
                walkDir(baseDir, fullPath, sinceMs, results);
            }
            else if (stat.isFile() && stat.mtimeMs >= sinceMs) {
                const relPath = (0, path_1.relative)(baseDir, fullPath).replace(/\\/g, '/');
                results.push({ path: relPath, mtimeMs: stat.mtimeMs, mtime: formatTime(stat.mtimeMs) });
            }
        }
        catch {
            // Permission error or symlink issue — skip
        }
    }
}
function formatTime(ms) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
