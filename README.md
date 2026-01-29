# Claude Metacognition

Claude Code plugin for metacognitive reflection and context preservation.

## Purpose

Claude Metacognition addresses cognitive pitfalls in Claude Code usage:

1. **Rushing without reflection** — Claude tends to start immediately without analyzing the full request
2. **Plausible filling** — Gaps in understanding get filled with "plausible" assumptions instead of questions
3. **Context loss after compaction** — Automatic summaries capture the "what" but rarely the "why"
4. **Post-compaction tunnel vision** — After compaction, Claude becomes hyper-focused on "the task" and forgets global context
5. **Silent assumptions** — Hypotheses are made but never communicated to the user

## Philosophy

- **Questions over rules** — Non-blocking prompts use questions to force thinking; lists of "do this" are ignored
- **Universal applicability** — Works for any project type (code, writing, design, analysis)
- **Reformulation reveals gaps** — Asking Claude to reformulate what it knows exposes missing context
- **Mechanical + cognitive** — Combines context tracking (what happened) with metacognitive prompts (why it matters)

## Features

### Pre-Task Reflection
Before starting work, prompts Claude to formulate:
- All elements of the request (nothing is optional)
- What is understood vs. interpreted vs. unknown
- Existing work to consult

### Post-Task Verification
Before concluding, prompts Claude to verify:
- What was NOT addressed in the original request
- Whether the output is usable or just sketched
- What remains to be done
- What assumptions were made

### Post-Compaction Context
After context compaction, injects:
- The initial task prompt (full text)
- User interventions during the task
- Files accessed with operation type (read/write/update) and timestamps
- Files modified by other processes (subagents, parallel sessions)
- Metacognitive reminder about partial context

### File Tracking
Tracks all file operations during a task:
- **Direct access**: Files you read/write/edit are tracked with operation type
- **Other modifications**: Files modified by subagents or external tools are detected via mtime

### Multi-Session Support
- Each Claude session gets its own context file
- Multiple Claude instances can run in parallel without conflicts

## Installation

### From GitHub Marketplace

```bash
/plugin marketplace add djethino/asymptomatik-claude-plugins
/plugin install claude-metacognition
```

### From Plugin Repository

```bash
/plugin marketplace add djethino/claude-metacognition
/plugin install claude-metacognition
```

### Local Development

```bash
git clone https://github.com/djethino/claude-metacognition.git
cd claude-metacognition
# Make changes...
# Reinstall plugin and restart Claude Code
```

## Structure

```
scripts/
  lib/
    context.py                # Shared utilities (state + context tracking)
  on_new_task.py              # Pre-task reflection + prompt capture
  on_task_end.py              # Task completion detection
  on_file_access.py           # File tracking (PostToolUse)
  post_compact.py             # Post-compaction context + metacog reminder
  pre_compact.py              # Reserved (no-op)
hooks/
  hooks.json                  # Hook configuration
```

## How It Works

| Hook | Trigger | Action |
|------|---------|--------|
| **UserPromptSubmit** | New prompt received | Captures prompt, injects pre-task reflection |
| **Stop** | Response complete | Sets `task_completed` flag for next task detection |
| **PostToolUse** | After Read/Edit/Write | Tracks file access with operation type |
| **SessionStart** | Session starts or compaction | Injects captured context + metacognitive reminder |

### Data Storage

```
.claude/
├── metacognition/          # Metacognition state
│   └── {session_id}.json   # {task_started, compaction_count}
└── task-contexts/          # Task context tracking
    └── {session_id}.json   # {initial_prompt, interventions, file_access, ...}
```

## Example Messages

### Pre-Task Reflection (injected at task start)

```
🧠 RÉFLEXION — AVANT ET APRÈS

AVANT DE COMMENCER, formule explicitement :
1. TOUS les éléments de la demande
2. Ce que tu comprends
3. Ce que tu INTERPRÈTES
4. Ce que tu NE SAIS PAS
5. L'existant à consulter

AVANT DE CONCLURE, vérifie :
1. Qu'est-ce que tu n'as PAS traité ?
2. As-tu produit quelque chose d'UTILISABLE ?
3. Qu'est-ce qui reste à faire ?
4. Éléments en attente ?
5. Hypothèses faites ?
```

### Post-Compaction Context (injected after compaction)

```
⚠️ CONTEXT COMPACTED

📅 Tâche démarrée à : 14:32
📅 Compaction à : 15:47

📋 DEMANDE INITIALE :
[Full original prompt]

💬 INTERVENTIONS UTILISATEUR :
  - "Can you also add validation?"
  - "Use TypeScript instead"

📁 FICHIERS ACCÉDÉS PENDANT CETTE TÂCHE :
  - src/api/handler.ts [read+update] (15:45)
  - src/types/index.ts [write] (15:40)

📁 AUTRES FICHIERS MODIFIÉS :
  - tests/api.test.ts (15:46) [by subagent]
```

## License

MIT — Copyright (c) 2025 ASymptOmatik

---

## See Also

**[claude-code-safety-net](https://github.com/kenryu42/claude-code-safety-net)** — Complementary plugin for security. Blocks destructive commands (`rm -rf`, `git reset --hard`, `git push --force`, etc.). Metacognition focuses on reflection; safety-net on protection.
