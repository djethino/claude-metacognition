#!/usr/bin/env python3
"""PreCompact hook - Metacognition pré-compaction.

Rappel avant compaction de ce qui est critique à préserver.
Ce hook ne peut pas bloquer la compaction mais peut logger.

Problème adressé:
- La compaction perd le POURQUOI des décisions
- Les nuances et l'état d'avancement sont perdus
"""

import sys

# Add lib to path
sys.path.insert(0, str(__file__).rsplit("scripts", 1)[0] + "scripts")

from lib.context import (
    fix_stdin_encoding,
    load_hook_input,
)

fix_stdin_encoding()

# Note: PreCompact ne supporte pas additionalContext de la même façon
# Il sert surtout à logger ou préparer des données avant compaction
# Le vrai travail se fait dans post_compact.py


def main() -> int:
    input_data = load_hook_input()
    if not input_data:
        return 0

    # PreCompact est limité dans ce qu'il peut faire
    # On pourrait logger ici mais le message sera perdu dans la compaction
    # Le vrai rappel se fait dans SessionStart post-compaction
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
