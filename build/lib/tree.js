"use strict";
/**
 * Compact project tree builder for session start context.
 *
 * Walks the filesystem at limited depth and produces a Unicode tree string.
 * Designed to give Claude a quick structural overview of the workspace.
 *
 * Beyond maxDepth, directories show:
 * - Extension breakdown: [4 .ts, 2 .json, 1 .md]
 * - Most recent modification: (modifié: 14:32) or (modifié: 2026-02-10)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProjectTree = buildProjectTree;
const fs_1 = require("fs");
const path_1 = require("path");
const SKIP_DIRS = new Set([
    '.git', '.claude', 'node_modules', 'build', 'dist',
    '__pycache__', 'venv', '.venv', '.godot', '.import',
    'coverage', '.next', '.nuxt', '.output', 'target',
]);
const SKIP_FILES = new Set([
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    '.DS_Store', 'Thumbs.db', 'desktop.ini',
]);
/**
 * Build a compact project tree string.
 * @param cwd Root directory to walk
 * @param maxDepth Maximum directory depth (default 2)
 */
function buildProjectTree(cwd, maxDepth = 2) {
    const entries = scanDir(cwd, 0, maxDepth);
    if (entries.length === 0)
        return '(vide)';
    return renderTree(entries, '');
}
function scanDir(dir, depth, maxDepth) {
    let names;
    try {
        names = (0, fs_1.readdirSync)(dir);
    }
    catch {
        return [];
    }
    const entries = [];
    // Sort: directories first, then files, alphabetically
    const sorted = names
        .filter((n) => !n.startsWith('.') || n === '.claude-plugin')
        .filter((n) => !SKIP_FILES.has(n))
        .sort((a, b) => {
        const aIsDir = isDirectory((0, path_1.join)(dir, a));
        const bIsDir = isDirectory((0, path_1.join)(dir, b));
        if (aIsDir !== bIsDir)
            return aIsDir ? -1 : 1;
        return a.localeCompare(b);
    });
    for (const name of sorted) {
        const fullPath = (0, path_1.join)(dir, name);
        const isDir = isDirectory(fullPath);
        if (isDir && SKIP_DIRS.has(name))
            continue;
        if (isDir) {
            if (depth < maxDepth) {
                const children = scanDir(fullPath, depth + 1, maxDepth);
                entries.push({ name: name + '/', isDir: true, children });
            }
            else {
                // Beyond maxDepth: analyze contents (extensions + mtime)
                const summary = analyzeDirContents(fullPath);
                entries.push({ name: name + '/', isDir: true, summary });
            }
        }
        else {
            entries.push({ name, isDir: false });
        }
    }
    return entries;
}
function renderTree(entries, prefix) {
    const lines = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';
        let label = entry.name;
        if (entry.summary) {
            label += ' ' + formatSummary(entry.summary);
        }
        lines.push(prefix + connector + label);
        if (entry.children && entry.children.length > 0) {
            lines.push(renderTree(entry.children, prefix + childPrefix));
        }
    }
    return lines.join('\n');
}
function formatSummary(summary) {
    if (summary.totalFiles === 0)
        return '(vide)';
    // Extension breakdown: sorted by count descending, top 4
    const extEntries = Object.entries(summary.extensions)
        .sort((a, b) => b[1] - a[1]);
    const shown = extEntries.slice(0, 4);
    const extParts = shown.map(([ext, count]) => `${count} ${ext}`);
    if (extEntries.length > 4) {
        const rest = extEntries.slice(4).reduce((sum, [, c]) => sum + c, 0);
        extParts.push(`+${rest}`);
    }
    // Modification time
    const timeStr = formatMtime(summary.newestMtimeMs);
    return `[${extParts.join(', ')}] (${timeStr})`;
}
function formatMtime(ms) {
    if (ms === 0)
        return '?';
    const d = new Date(ms);
    const now = new Date();
    const isToday = d.getFullYear() === now.getFullYear()
        && d.getMonth() === now.getMonth()
        && d.getDate() === now.getDate();
    if (isToday) {
        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
/**
 * Recursively analyze directory contents: count files by extension + newest mtime.
 */
function analyzeDirContents(dir) {
    const summary = { extensions: {}, newestMtimeMs: 0, totalFiles: 0 };
    walkForSummary(dir, summary);
    return summary;
}
function walkForSummary(dir, summary) {
    let names;
    try {
        names = (0, fs_1.readdirSync)(dir);
    }
    catch {
        return;
    }
    for (const name of names) {
        if (name.startsWith('.'))
            continue;
        if (SKIP_DIRS.has(name))
            continue;
        if (SKIP_FILES.has(name))
            continue;
        const fullPath = (0, path_1.join)(dir, name);
        try {
            const stat = (0, fs_1.statSync)(fullPath);
            if (stat.isDirectory()) {
                walkForSummary(fullPath, summary);
            }
            else if (stat.isFile()) {
                summary.totalFiles++;
                const ext = (0, path_1.extname)(name) || name; // files without extension use filename
                summary.extensions[ext] = (summary.extensions[ext] ?? 0) + 1;
                if (stat.mtimeMs > summary.newestMtimeMs) {
                    summary.newestMtimeMs = stat.mtimeMs;
                }
            }
        }
        catch {
            // Permission error — skip
        }
    }
}
function isDirectory(path) {
    try {
        return (0, fs_1.statSync)(path).isDirectory();
    }
    catch {
        return false;
    }
}
function pad2(n) {
    return String(n).padStart(2, '0');
}
