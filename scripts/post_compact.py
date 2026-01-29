#!/usr/bin/env python3
"""SessionStart hook - Contexte post-compaction + metacognition.

Deux rôles :
1. Injection du contexte mécanique :
   - Prompt initial, interventions, fichiers accédés, fichiers modifiés par d'autres
2. Rappels métacognitifs :
   - Questions de reformulation, conscience du contexte partiel

Problèmes adressés :
- Perte du POURQUOI après compaction (seul le QUOI survit)
- Vision tunnel sur "ma tâche" sans contexte global
- Traitement du travail pré-existant comme secondaire
"""

import json
import sys
from datetime import datetime
from pathlib import Path

# Add lib to path
sys.path.insert(0, str(__file__).rsplit("scripts", 1)[0] + "scripts")

from lib.context import (
    fix_stdin_encoding,
    load_hook_input,
    repeat_message,
    # Metacognition state
    load_state,
    save_state,
    # Task context tracking
    load_context,
    save_context,
)

fix_stdin_encoding()


# ---------------------------------------------------------------------------
# File detection utilities
# ---------------------------------------------------------------------------

def get_recent_files_with_mtime(cwd: str, since_timestamp: str, limit: int = 15) -> list[tuple[str, str]]:
    """Get files modified since timestamp with their mtime (HH:MM format)."""
    try:
        cwd_path = Path(cwd)
        since_dt = datetime.fromisoformat(since_timestamp)
        since_ts = since_dt.timestamp()
        files_with_mtime = []

        for f in cwd_path.rglob("*"):
            if f.is_file():
                parts = f.relative_to(cwd_path).parts
                if any(p.startswith(".") or p in ("node_modules", "__pycache__", "venv", ".venv") for p in parts):
                    continue
                try:
                    mtime = f.stat().st_mtime
                    if mtime >= since_ts:
                        rel_path = str(f.relative_to(cwd_path)).replace("\\", "/")
                        mtime_str = datetime.fromtimestamp(mtime).strftime("%H:%M")
                        files_with_mtime.append((rel_path, mtime, mtime_str))
                except OSError:
                    pass

        files_with_mtime.sort(key=lambda x: x[1], reverse=True)
        return [(f, t) for f, _, t in files_with_mtime[:limit]]
    except Exception:
        return []


def get_file_mtime(cwd: str, file_path: str) -> str | None:
    """Get mtime of a file in HH:MM format."""
    try:
        full_path = Path(cwd) / file_path
        if full_path.exists():
            mtime = full_path.stat().st_mtime
            return datetime.fromtimestamp(mtime).strftime("%H:%M")
    except OSError:
        pass
    return None


def reset_context(cwd: str, session_id: str) -> None:
    """Reset the task context file for a new session."""
    context = {
        "initial_prompt": None,
        "initial_timestamp": None,
        "interventions": []
    }
    save_context(cwd, session_id, context)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

POST_COMPACTION_METACOG = """
Pendant ton travail, tu DOIS régulièrement te demander :
- Comprends-tu encore le POURQUOI de ce que tu fais ?
- Es-tu en train de simplifier ou couper des coins ?
- Risques-tu de casser quelque chose qui existait avant ?

Si une réponse t'inquiète → ARRÊTE et fais un point avec l'utilisateur :
- Qu'est-ce qui a été complètement fait ?
- Que reste-t-il à faire ?
- Qu'est-ce que tu n'es pas sûr de comprendre ?

Rappel : Après compaction, tu as tendance à devenir hyper-focalisé sur "la tâche" en oubliant le contexte global. Résiste à cette tendance.
""".strip()

NEW_SESSION_MESSAGE = """
🆕 NOUVELLE SESSION

Tu démarres une nouvelle session. Tu n'as pas d'historique avec cet utilisateur dans ce projet.

Si l'utilisateur fait référence à du travail précédent, tu DOIS te poser ces questions :
- De quoi parle-t-il exactement ? (ne suppose pas)
- Quel existant dois-tu vérifier ? (fichiers, documents, contexte projet)
- Qu'est-ce qui te manque pour comprendre ?
""".strip()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build_compaction_message(cwd: str, session_id: str) -> str:
    """Build the full post-compaction message with context + metacog reminder."""
    now = datetime.now()
    now_str = now.strftime("%H:%M")

    lines = [
        "⚠️ CONTEXT COMPACTED",
        "",
        "Le contexte a été compressé. Tu as reçu un résumé, mais il capture le QUOI, rarement le POURQUOI.",
        ""
    ]

    context = load_context(cwd, session_id)

    if context:
        # Timestamps
        initial_ts = context.get("initial_timestamp")
        if initial_ts:
            try:
                start_time = datetime.fromisoformat(initial_ts).strftime("%H:%M")
                lines.append(f"📅 Tâche démarrée à : {start_time}")
                lines.append(f"📅 Compaction à : {now_str}")
                lines.append("")
            except ValueError:
                pass

        # Initial prompt
        if context.get("initial_prompt"):
            lines.append("📋 DEMANDE INITIALE :")
            lines.append(context["initial_prompt"])
            lines.append("")

        # User interventions
        interventions = context.get("interventions", [])
        if interventions:
            lines.append("💬 INTERVENTIONS UTILISATEUR :")
            for interv in interventions[-5:]:
                lines.append(f"  - {interv.get('prompt', '')}")
            lines.append("")

        # Files accessed during this task (tracked via PostToolUse hook)
        if initial_ts:
            file_access = context.get("file_access", {})
            if file_access:
                lines.append("📁 FICHIERS ACCÉDÉS PENDANT CETTE TÂCHE :")
                for f, accesses in file_access.items():
                    mtime = get_file_mtime(cwd, f)
                    access_str = "+".join(sorted(accesses, key=lambda x: {"read": 0, "update": 1, "write": 2}.get(x, 3)))
                    time_str = f" ({mtime})" if mtime else ""
                    lines.append(f"  - {f} [{access_str}]{time_str}")
                lines.append("")

            # Other files modified since task start (mtime-based)
            tracked_files = set(file_access.keys())
            all_recent_files = get_recent_files_with_mtime(cwd, initial_ts)
            other_files = [(f, t) for f, t in all_recent_files if f not in tracked_files]
            if other_files:
                lines.append("📁 AUTRES FICHIERS MODIFIÉS DEPUIS LE DÉBUT DE LA TÂCHE :")
                lines.append("   (subagents, autres instances, outils externes)")
                for f, mtime in other_files:
                    lines.append(f"  - {f} ({mtime})")
                lines.append("")
    else:
        lines.append("(Pas de contexte de tâche capturé)")
        lines.append("")

    # Metacognitive reminder
    lines.append(POST_COMPACTION_METACOG)

    return "\n".join(lines)


def output_context(message: str) -> None:
    """Output additionalContext for SessionStart hook."""
    output = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": message,
        }
    }
    print(json.dumps(output, ensure_ascii=False))


def main() -> int:
    input_data = load_hook_input()
    if not input_data:
        return 0

    source = input_data.get("source", "")
    cwd = input_data.get("cwd", "")
    session_id = input_data.get("session_id", "")

    if not cwd or not session_id:
        return 0

    state = load_state(cwd, session_id)

    if source == "compact":
        # --- Compaction detected ---
        # Metacognition state
        state["compaction_count"] = state.get("compaction_count", 0) + 1
        save_state(cwd, session_id, state)

        # Build and inject full context message
        message = build_compaction_message(cwd, session_id)
        output_context(message)
    else:
        # --- New session ---
        # Reset metacognition state
        state = {"task_started": False, "compaction_count": 0}
        save_state(cwd, session_id, state)

        # Reset task context
        reset_context(cwd, session_id)

        # Inject new session message (repeated REPETITION_COUNT times)
        output_context(repeat_message(NEW_SESSION_MESSAGE))

    return 0


if __name__ == "__main__":
    sys.exit(main())
