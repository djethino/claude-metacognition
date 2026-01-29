#!/usr/bin/env python3
"""Stop hook - Flag task_completed.

Set task_completed=True dans le task-context (porté de guardian-coach).
Permet à on_new_task.py de distinguer nouvelle tâche / intervention.

Note: Le hook Stop fire APRÈS la réponse complète. Un systemMessage ici
s'affiche côté utilisateur, pas côté agent. Les vérifications de fin de
tâche sont dans le PRE_TASK_REFLECTION de on_new_task.py (section
"AVANT DE CONCLURE").
"""

import sys

# Add lib to path
sys.path.insert(0, str(__file__).rsplit("scripts", 1)[0] + "scripts")

from lib.context import (
    fix_stdin_encoding,
    load_hook_input,
    load_context,
    save_context,
)

fix_stdin_encoding()


def main() -> int:
    input_data = load_hook_input()
    if not input_data:
        return 0

    cwd = input_data.get("cwd", "")
    session_id = input_data.get("session_id", "")

    if not cwd or not session_id:
        return 0

    context = load_context(cwd, session_id) or {}
    context["task_completed"] = True
    save_context(cwd, session_id, context)

    return 0


if __name__ == "__main__":
    sys.exit(main())
