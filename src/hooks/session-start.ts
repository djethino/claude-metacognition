/**
 * SessionStart hook — Post-compaction context + metacognition.
 *
 * Two roles:
 * 1. Mechanical context injection:
 *    - Initial prompt, interventions, files accessed, files modified by others
 * 2. Metacognitive reminders:
 *    - Reformulation questions, partial context awareness
 *
 * Problems addressed:
 * - Loss of the WHY after compaction (only the WHAT survives)
 * - Tunnel vision on "my task" without global context
 * - Treating pre-existing work as secondary
 */

import { loadHookInput, outputContext } from '../lib/io.js';
import { loadState, saveState, resetState } from '../lib/state.js';
import { getFileMtime, getRecentFilesWithMtime, getGitSubdirectories } from '../lib/paths.js';
import { repeatMessage, POST_COMPACTION_METACOG, NEW_SESSION_MESSAGE } from '../lib/messages.js';
import { isSouvenirAvailable } from '../lib/souvenir.js';
import { buildProjectTree } from '../lib/tree.js';
import type { SessionState, GitRepoInfo } from '../lib/types.js';

// ---------------------------------------------------------------------------
// Build the compaction message
// ---------------------------------------------------------------------------

function buildCompactionMessage(cwd: string, state: SessionState): string {
  const now = new Date();
  const nowStr = formatTime(now);

  const lines: string[] = [
    '\u26A0\uFE0F CONTEXT COMPACTED',
    '',
    'Le contexte a \u00E9t\u00E9 compress\u00E9. Tu as re\u00E7u un r\u00E9sum\u00E9, mais il capture le QUOI, rarement le POURQUOI.',
    '',
  ];

  if (state.initial_prompt !== null) {
    // Timestamps
    const initialTs = state.initial_timestamp;
    if (initialTs) {
      try {
        const startTime = formatTime(new Date(initialTs));
        lines.push(`\uD83D\uDCC5 T\u00E2che d\u00E9marr\u00E9e \u00E0 : ${startTime}`);
        lines.push(`\uD83D\uDCC5 Compaction \u00E0 : ${nowStr}`);
        lines.push('');
      } catch {
        // Invalid date — skip
      }
    }

    // Initial prompt
    lines.push('\uD83D\uDCCB DEMANDE INITIALE :');
    lines.push(state.initial_prompt!);
    lines.push('');

    // User interventions
    const interventions = state.interventions ?? [];
    if (interventions.length > 0) {
      lines.push('\uD83D\uDCAC INTERVENTIONS UTILISATEUR :');
      for (const interv of interventions.slice(-5)) {
        lines.push(`  - ${interv.prompt ?? ''}`);
      }
      lines.push('');
    }

    // Files accessed during this task
    if (initialTs) {
      const fileAccess = state.file_access ?? {};
      const fileAccessEntries = Object.entries(fileAccess);

      if (fileAccessEntries.length > 0) {
        lines.push('\uD83D\uDCC1 FICHIERS ACC\u00C9D\u00C9S PENDANT CETTE T\u00C2CHE :');
        const accessOrder: Record<string, number> = { read: 0, update: 1, write: 2 };
        for (const [f, accesses] of fileAccessEntries) {
          const mtime = getFileMtime(cwd, f);
          const sorted = [...accesses].sort((a, b) => (accessOrder[a] ?? 3) - (accessOrder[b] ?? 3));
          const accessStr = sorted.join('+');
          const timeStr = mtime ? ` (${mtime})` : '';
          lines.push(`  - ${f} [${accessStr}]${timeStr}`);
        }
        lines.push('');
      }

      // Other files modified since task start (mtime-based)
      const trackedFiles = new Set(Object.keys(fileAccess));
      const allRecentFiles = getRecentFilesWithMtime(cwd, initialTs);
      const otherFiles = allRecentFiles.filter((f) => !trackedFiles.has(f.path));

      if (otherFiles.length > 0) {
        lines.push('\uD83D\uDCC1 AUTRES FICHIERS MODIFI\u00C9S DEPUIS LE D\u00C9BUT DE LA T\u00C2CHE :');
        lines.push('   (subagents, autres instances, outils externes)');
        for (const f of otherFiles) {
          lines.push(`  - ${f.path} (${f.mtime})`);
        }
        lines.push('');
      }
    }
  } else {
    lines.push('(Pas de contexte de t\u00E2che captur\u00E9)');
    lines.push('');
  }

  // Metacognitive reminder
  lines.push(POST_COMPACTION_METACOG);

  // Souvenir integration (if available)
  if (isSouvenirAvailable()) {
    lines.push('');
    lines.push('\uD83D\uDD0D Le r\u00E9sum\u00E9 et le contexte ci-dessus sont-ils suffisants pour continuer ?');
    lines.push('Si non \u2192 `souvenir_search` pour retrouver les discussions et d\u00E9cisions perdues. Ne demande pas \u00E0 l\'utilisateur de r\u00E9p\u00E9ter ce qui a d\u00E9j\u00E0 \u00E9t\u00E9 dit.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  const input = loadHookInput();
  if (!input) return 0;

  const { cwd, session_id } = input;
  const source = input.source ?? '';

  if (!cwd || !session_id) return 0;

  const state = loadState(cwd, session_id);

  if (source === 'compact') {
    // --- Compaction detected ---
    state.compaction_count = (state.compaction_count ?? 0) + 1;
    saveState(cwd, session_id, state);

    // Build and inject full context message
    const message = buildCompactionMessage(cwd, state);
    outputContext('SessionStart', message);
  } else if (source === 'resume') {
    // --- Session resumed (claude -c / claude -r) ---
    // Claude already has the conversation history loaded.
    // Don't reset state or context — the user is continuing their work.
    // Don't inject "new session" message — it would be misleading.
  } else {
    // --- New session (startup) or clear ---
    resetState(cwd, session_id);

    // Repeated metacognitive message (appears REPETITION_COUNT times)
    const repeatedMsg = repeatMessage(NEW_SESSION_MESSAGE);

    // Factual context (appears once — no need to repeat data)
    const contextParts: string[] = [];

    // Souvenir: project tree + hints
    if (isSouvenirAvailable()) {
      const tree = buildProjectTree(cwd);
      contextParts.push('📂 STRUCTURE DU PROJET (aperçu `souvenir_tree`) :\n' + tree);
      contextParts.push('🔍 Si l\'utilisateur fait référence à du travail passé → `souvenir_search` avant de demander des précisions.\nPour découvrir le projet en détail → `souvenir_tree` offre plus d\'options (filtres, compteurs de lignes, etc.).');
    }

    // Git subdirectories: listing + status (independent of souvenir)
    const gitDirs = getGitSubdirectories(cwd);
    if (gitDirs.length > 0) {
      let gitSection = '📦 DÉPÔTS GIT DANS LE WORKSPACE :';
      for (const repo of gitDirs) {
        gitSection += `\n  - ${repo.path}/ [${repo.branch}] (${repo.lastActivity}) — ${formatGitStatus(repo)}`;
      }
      gitSection += '\n\n⚠️ Si la synchronisation d\'un dépôt n\'est pas à jour, préviens l\'utilisateur dans ta prochaine réponse. Ne fais AUCUNE action git (commit, push, pull) sans demande explicite de l\'utilisateur.';
      contextParts.push(gitSection);
    }

    const fullMsg = contextParts.length > 0
      ? repeatedMsg + '\n\n' + contextParts.join('\n\n')
      : repeatedMsg;

    outputContext('SessionStart', fullMsg);
  }

  return 0;
}

process.exit(main());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatGitStatus(repo: GitRepoInfo): string {
  const parts: string[] = [];
  if (repo.uncommitted > 0) {
    parts.push(`${repo.uncommitted} fichier${repo.uncommitted > 1 ? 's' : ''} non commité${repo.uncommitted > 1 ? 's' : ''}`);
  }
  if (repo.unpushed > 0) {
    parts.push(`${repo.unpushed} commit${repo.unpushed > 1 ? 's' : ''} non poussé${repo.unpushed > 1 ? 's' : ''}`);
  }
  if (repo.unpulled > 0) {
    parts.push(`${repo.unpulled} commit${repo.unpulled > 1 ? 's' : ''} non pullé${repo.unpulled > 1 ? 's' : ''}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'OK';
}
