#!/usr/bin/env python3
"""PostToolUse hook for tracking file access.

Porté de guardian-coach. Enregistre les fichiers accédés par Read/Edit/Write
dans le fichier de contexte de la session.

Types d'accès trackés :
- read: fichier lu (pour contexte/analyse)
- write: fichier créé (nouveau fichier)
- update: fichier modifié (Edit)

Permet un tracking précis des fichiers accédés par CETTE session,
indépendant du mtime filesystem (important pour les scénarios multi-agents).
"""

import sys

# Add lib to path
sys.path.insert(0, str(__file__).rsplit("scripts", 1)[0] + "scripts")

from lib.context import (
    fix_stdin_encoding,
    load_context,
    save_context,
    normalize_path,
    load_hook_input,
)

fix_stdin_encoding()


def main() -> int:
    input_data = load_hook_input()
    if not input_data:
        return 0

    cwd = input_data.get("cwd", "")
    session_id = input_data.get("session_id", "")
    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    if not cwd or not session_id:
        return 0

    # Only track Read, Edit, and Write tools
    if tool_name not in ("Read", "Edit", "Write"):
        return 0

    file_path = tool_input.get("file_path", "")
    if not file_path:
        return 0

    # Normalize the path
    file_path = normalize_path(file_path, cwd)

    # Determine access type
    if tool_name == "Read":
        access_type = "read"
    elif tool_name == "Write":
        access_type = "write"
    else:  # Edit
        access_type = "update"

    # Update context file with file access
    context = load_context(cwd, session_id) or {}

    # Initialize file_access if not present
    # Structure: {"path": ["read", "update"], "path2": ["write"]}
    if "file_access" not in context:
        context["file_access"] = {}

    # Normalize existing paths
    normalized_access = {}
    for path, accesses in context["file_access"].items():
        norm_path = path.replace("\\", "/")
        if norm_path in normalized_access:
            normalized_access[norm_path] = list(set(normalized_access[norm_path] + accesses))
        else:
            normalized_access[norm_path] = accesses
    context["file_access"] = normalized_access

    # Add this access
    if file_path not in context["file_access"]:
        context["file_access"][file_path] = []

    if access_type not in context["file_access"][file_path]:
        context["file_access"][file_path].append(access_type)

    save_context(cwd, session_id, context)
    return 0


if __name__ == "__main__":
    sys.exit(main())
