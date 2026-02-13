/**
 * Path normalization, file mtime utilities, and git repository detection.
 */

import { statSync, readdirSync, readFileSync } from 'fs';
import { join, relative, isAbsolute } from 'path';
import { execSync } from 'child_process';
import type { GitRepoInfo } from './types.js';

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

/**
 * Scan cwd for immediate subdirectories containing a .git folder.
 * Returns git status info for each repo found.
 */
export function getGitSubdirectories(cwd: string): GitRepoInfo[] {
  const results: GitRepoInfo[] = [];

  let entries: string[];
  try {
    entries = readdirSync(cwd);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(cwd, entry);
    const gitDir = join(fullPath, '.git');

    try {
      const entryStat = statSync(fullPath);
      if (!entryStat.isDirectory()) continue;

      const gitStat = statSync(gitDir);
      if (!gitStat.isDirectory()) continue; // skip .git files (worktrees)
    } catch {
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

function readGitBranch(gitDir: string): string {
  try {
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf-8').trim();
    const match = head.match(/^ref: refs\/heads\/(.+)$/);
    return match ? match[1] : 'detached';
  } catch {
    return 'unknown';
  }
}

function getGitLastActivity(gitDir: string): string {
  try {
    // Try refs/heads/ for most recent branch ref
    const refsDir = join(gitDir, 'refs', 'heads');
    let newestMs = 0;

    try {
      const refs = readdirSync(refsDir);
      for (const ref of refs) {
        const refStat = statSync(join(refsDir, ref));
        if (refStat.mtimeMs > newestMs) newestMs = refStat.mtimeMs;
      }
    } catch {
      // No refs/heads — fall through
    }

    // Fallback to HEAD mtime
    if (newestMs === 0) {
      newestMs = statSync(join(gitDir, 'HEAD')).mtimeMs;
    }

    return formatDateTime(newestMs);
  } catch {
    return 'unknown';
  }
}

function gitCountUncommitted(repoPath: string): number {
  try {
    const output = execSync('git status --porcelain', {
      cwd: repoPath,
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    return output ? output.split('\n').length : 0;
  } catch {
    return 0;
  }
}

function gitCountRevDiff(repoPath: string, revRange: string): number {
  try {
    const output = execSync(`git rev-list --count ${revRange}`, {
      cwd: repoPath,
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim();
    return parseInt(output, 10) || 0;
  } catch {
    // No upstream tracking, or other error
    return 0;
  }
}

function formatDateTime(ms: number): string {
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
