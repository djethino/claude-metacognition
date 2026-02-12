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
import { loadState, saveState } from '../lib/state.js';
import { loadContext, resetContext } from '../lib/context.js';
import { getFileMtime, getRecentFilesWithMtime } from '../lib/paths.js';
import { repeatMessage, POST_COMPACTION_METACOG, NEW_SESSION_MESSAGE } from '../lib/messages.js';
import { isSouvenirAvailable } from '../lib/souvenir.js';
import type { MetacogState, TaskContext } from '../lib/types.js';

// ---------------------------------------------------------------------------
// Build the compaction message
// ---------------------------------------------------------------------------

function buildCompactionMessage(cwd: string, sessionId: string): string {
  const now = new Date();
  const nowStr = formatTime(now);

  const lines: string[] = [
    '\u26A0\uFE0F CONTEXT COMPACTED',
    '',
    'Le contexte a \u00E9t\u00E9 compress\u00E9. Tu as re\u00E7u un r\u00E9sum\u00E9, mais il capture le QUOI, rarement le POURQUOI.',
    '',
  ];

  const context = loadContext(cwd, sessionId);

  if (context) {
    // Timestamps
    const initialTs = context.initial_timestamp;
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
    if (context.initial_prompt) {
      lines.push('\uD83D\uDCCB DEMANDE INITIALE :');
      lines.push(context.initial_prompt);
      lines.push('');
    }

    // User interventions
    const interventions = context.interventions ?? [];
    if (interventions.length > 0) {
      lines.push('\uD83D\uDCAC INTERVENTIONS UTILISATEUR :');
      for (const interv of interventions.slice(-5)) {
        lines.push(`  - ${interv.prompt ?? ''}`);
      }
      lines.push('');
    }

    // Files accessed during this task
    if (initialTs) {
      const fileAccess = context.file_access ?? {};
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
    lines.push('\uD83D\uDD0D R\u00C9CUP\u00C9RATION DE CONTEXTE PROFOND (claude-souvenir disponible)');
    lines.push('Si le r\u00E9sum\u00E9 ci-dessus est insuffisant, tu as acc\u00E8s aux outils :');
    lines.push('- `souvenir_search` : Chercher dans TOUTES les sessions pass\u00E9es (text, semantic, hybrid) ET dans les docs/code du projet (source="project")');
    lines.push('- `souvenir_read` : Lire le transcript complet d\'une session');
    lines.push('- `souvenir_sessions` : Lister les sessions de ce projet');
    lines.push('- `souvenir_docs` : G\u00E9rer l\'indexation des fichiers du projet');
    lines.push('Utilise-les AVANT de demander \u00E0 l\'utilisateur de r\u00E9p\u00E9ter ce qui a d\u00E9j\u00E0 \u00E9t\u00E9 dit.');
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
    const updatedState: MetacogState = {
      ...state,
      compaction_count: (state.compaction_count ?? 0) + 1,
    };
    saveState(cwd, session_id, updatedState);

    // Build and inject full context message
    const message = buildCompactionMessage(cwd, session_id);
    outputContext('SessionStart', message);
  } else if (source === 'resume') {
    // --- Session resumed (claude -c / claude -r) ---
    // Claude already has the conversation history loaded.
    // Don't reset state or context — the user is continuing their work.
    // Don't inject "new session" message — it would be misleading.
  } else {
    // --- New session (startup) or clear ---
    const freshState: MetacogState = { task_started: false, compaction_count: 0 };
    saveState(cwd, session_id, freshState);

    // Reset task context
    resetContext(cwd, session_id);

    // Build session message (with optional souvenir section)
    let sessionMsg = NEW_SESSION_MESSAGE;
    if (isSouvenirAvailable()) {
      sessionMsg += '\n\n\uD83D\uDD0D HISTORIQUE DISPONIBLE (claude-souvenir)\n';
      sessionMsg += 'Tu peux consulter les sessions pr\u00E9c\u00E9dentes et les fichiers du projet :\n';
      sessionMsg += '- `souvenir_sessions` pour lister les sessions\n';
      sessionMsg += '- `souvenir_search` pour chercher dans l\'historique et les docs\n';
      sessionMsg += '- `souvenir_read` pour lire une session sp\u00E9cifique\n';
      sessionMsg += '- `souvenir_docs` pour g\u00E9rer l\'indexation des fichiers du projet';
    }

    // Inject new session message (repeated REPETITION_COUNT times)
    outputContext('SessionStart', repeatMessage(sessionMsg));
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
