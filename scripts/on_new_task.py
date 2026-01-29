#!/usr/bin/env python3
"""UserPromptSubmit hook - Metacognition + capture de prompts.

Deux rôles :
1. Capture le prompt initial et les interventions utilisateur (pour post-compaction)
2. Injecte des questions de réflexion quand une nouvelle tâche commence

Logique de capture (portée de guardian-coach) :
- Si task_completed flag est True → nouvelle tâche, reset et sauvegarde comme initial prompt
- Sinon → intervention sur la tâche en cours, ajout à la liste

Logique de réflexion (metacognition originale) :
- Au premier prompt ou après compaction → injecte les questions de réflexion
"""

import json
import sys
from datetime import datetime

# Add lib to path
sys.path.insert(0, str(__file__).rsplit("scripts", 1)[0] + "scripts")

from lib.context import (
    fix_stdin_encoding,
    load_hook_input,
    build_interleaved,
    # Metacognition state
    load_state,
    save_state,
    # Task context tracking
    get_contexts_dir,
    load_context,
    save_context,
)

fix_stdin_encoding()

MAX_CONTEXT_FILES = 10

# Message de réflexion pré-tâche (inclut aussi les rappels de fin)
PRE_TASK_REFLECTION = """
🧠 RÉFLEXION — AVANT ET APRÈS

**AVANT DE COMMENCER**, tu DOIS formuler explicitement :
1. Quels sont **TOUS les éléments** de la demande ? (aucun n'est optionnel)
2. Que **comprends-tu** de chaque élément ?
3. Qu'est-ce que tu **INTERPRÈTES** ? (termes ambigus, contexte supposé)
4. Que **NE SAIS-TU PAS** qui pourrait être nécessaire ?
5. Quel **existant** dois-tu consulter ? (documents, travail précédent, contexte projet)

→ Si le point 4 contient des éléments critiques : **demande clarification** avant de foncer.

**AVANT DE CONCLURE**, tu DOIS vérifier :
1. Qu'est-ce que tu n'as **PAS traité** dans le prompt ? (aucun élément n'est optionnel)
2. As-tu produit quelque chose d'**UTILISABLE** ou juste d'**esquissé** ?
3. Que **reste-t-il à faire** pour que ce soit complet ?
4. Y a-t-il des éléments **en attente** d'autre chose ? (dépendances, validations)
5. Quelles **hypothèses** as-tu faites qui mériteraient d'être signalées ?

→ Si tu as été sélectif ou si tu as fait des hypothèses : **dis-le explicitement**.

Rappel : Le "plausible" est ton piège. Un senior traiterait TOUT le prompt, demanderait plutôt que de supposer, et signalerait ce qui reste flou.
""".strip()


def cleanup_old_contexts(cwd: str) -> None:
    """Keep only the MAX_CONTEXT_FILES most recent context files."""
    contexts_dir = get_contexts_dir(cwd)
    if not contexts_dir.exists():
        return
    try:
        files = list(contexts_dir.glob("*.json"))
        if len(files) <= MAX_CONTEXT_FILES:
            return
        files.sort(key=lambda f: f.stat().st_mtime)
        for f in files[:-MAX_CONTEXT_FILES]:
            f.unlink()
    except OSError:
        pass


def main() -> int:
    input_data = load_hook_input()
    if not input_data:
        return 0

    cwd = input_data.get("cwd", "")
    prompt = input_data.get("prompt", "")
    session_id = input_data.get("session_id", "")

    if not cwd or not prompt or not session_id:
        return 0

    timestamp = datetime.now().isoformat()

    # --- Task context tracking (porté de guardian-coach) ---
    context = load_context(cwd, session_id) or {
        "initial_prompt": None,
        "initial_timestamp": None,
        "interventions": [],
        "task_completed": True  # Default to True so first prompt starts a task
    }

    is_new_task = context.get("task_completed", True)

    if is_new_task:
        # New task - reset and save as initial prompt
        context = {
            "initial_prompt": prompt,
            "initial_timestamp": timestamp,
            "interventions": [],
            "task_completed": False
        }
    else:
        # Same task - add as intervention
        context["interventions"].append({
            "timestamp": timestamp,
            "prompt": prompt
        })

    save_context(cwd, session_id, context)
    cleanup_old_contexts(cwd)

    # --- Metacognition reflection (existant) ---
    state = load_state(cwd, session_id)

    # Ne déclencher la réflexion qu'au début d'une tâche (premier prompt ou après compaction)
    if state.get("task_started") and state.get("compaction_count", 0) == 0:
        return 0

    state["task_started"] = True
    if state.get("compaction_count", 0) > 0:
        state["compaction_count"] = 0
    save_state(cwd, session_id, state)

    # Message intercalé : nudge + prompt + nudge (avec REPETITION_COUNT=2)
    interleaved = build_interleaved(PRE_TASK_REFLECTION, prompt)

    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": interleaved,
        }
    }
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
