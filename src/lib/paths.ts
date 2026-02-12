/**
 * Path normalization and file mtime utilities.
 */

import { statSync, readdirSync } from 'fs';
import { join, relative, isAbsolute } from 'path';

/**
 * Convert to relative path and normalize separators to forward slashes.
 */
export function normalizePath(filePath: string, cwd: string): string {
  try {
    if (isAbsolute(filePath)) {
      try {
        filePath = relative(cwd, filePath);
      } catch {
        // If relative() fails (different drives on Windows), keep absolute
      }
    }
    return filePath.replace(/\\/g, '/');
  } catch {
    return filePath.replace(/\\/g, '/');
  }
}

/**
 * Get mtime of a file in HH:MM format. Returns null if file doesn't exist.
 */
export function getFileMtime(cwd: string, filePath: string): string | null {
  try {
    const fullPath = join(cwd, filePath);
    const stat = statSync(fullPath);
    return formatTime(stat.mtimeMs);
  } catch {
    return null;
  }
}

/**
 * Get files modified since a given ISO timestamp, with their mtime (HH:MM format).
 * Returns at most `limit` files, sorted by most recent first.
 */
export function getRecentFilesWithMtime(
  cwd: string,
  sinceTimestamp: string,
  limit = 15,
): Array<{ path: string; mtime: string }> {
  try {
    const sinceMs = new Date(sinceTimestamp).getTime();
    const results: Array<{ path: string; mtimeMs: number; mtime: string }> = [];

    walkDir(cwd, cwd, sinceMs, results);

    results.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return results.slice(0, limit).map((r) => ({ path: r.path, mtime: r.mtime }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['.git', '.claude', 'node_modules', '__pycache__', 'venv', '.venv']);

function walkDir(
  baseDir: string,
  currentDir: string,
  sinceMs: number,
  results: Array<{ path: string; mtimeMs: number; mtime: string }>,
): void {
  let entries: string[];
  try {
    entries = readdirSync(currentDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.startsWith('.') && currentDir === baseDir) continue; // skip dotfiles at root
    if (SKIP_DIRS.has(entry)) continue;

    const fullPath = join(currentDir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(baseDir, fullPath, sinceMs, results);
      } else if (stat.isFile() && stat.mtimeMs >= sinceMs) {
        const relPath = relative(baseDir, fullPath).replace(/\\/g, '/');
        results.push({ path: relPath, mtimeMs: stat.mtimeMs, mtime: formatTime(stat.mtimeMs) });
      }
    } catch {
      // Permission error or symlink issue — skip
    }
  }
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
