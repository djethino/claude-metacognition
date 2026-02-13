# Claude Metacognition

Claude Code plugin for metacognitive reflection and post-compaction context preservation. Hooks-only, zero runtime dependencies.

## What It Does

Claude Metacognition injects behavioral guidance into Claude Code via hooks:

- **Pre-task reflection** forces Claude to decompose the request, identify unknowns, and check existing work before starting
- **Post-task verification** prompts Claude to check what was missed, what assumptions were made, and what remains
- **Post-compaction context** restores the original prompt, user interventions, and accessed files after context compression
- **File access tracking** records every file read/written/edited during the task with operation type

### Problems It Addresses

| Problem | How it helps |
|---------|-------------|
| Rushing without analysis | Reflection questions before starting |
| Plausible gap-filling | Forces Claude to state what it doesn't know |
| Context loss after compaction | Restores full original prompt + interventions |
| Post-compaction tunnel vision | Metacognitive reminders about partial context |
| Silent assumptions | Prompts Claude to declare hypotheses explicitly |

## Installation

### From Marketplace

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
npm install
npm run build
node deploy.mjs
# Restart Claude Code
```

## How It Works

| Hook | Trigger | Action |
|------|---------|--------|
| **UserPromptSubmit** | User sends a prompt | Captures prompt + injects pre-task reflection questions |
| **Stop** | Response complete | Sets `task_completed` flag for new-task detection |
| **PostToolUse** | After Read/Edit/Write/MultiEdit | Tracks file access with operation type |
| **SessionStart** | New session or compaction | Injects captured context + metacognitive reminders |

### Task Detection Logic

The Stop hook fires after each complete response, setting `task_completed = true`. The next UserPromptSubmit sees this flag and treats the prompt as a new task (reset + capture). Prompts sent *during* Claude's work (system-reminders) are not captured as interventions — only explicit user messages between responses.

### Post-Compaction Injection

After context compaction, the SessionStart hook injects:
- Task start time and compaction time
- Full original prompt text
- Last 5 user interventions
- Files accessed during the task (with read/write/update type and mtime)
- Other files modified since task start (by subagents, external tools)
- Metacognitive reminder about partial context risks

### Claude-Souvenir Integration

If [claude-souvenir](https://github.com/djethino/claude-souvenir) is installed, the post-compaction message includes souvenir tool references so Claude can recover deep context from past sessions.

## Architecture

```
src/
├── hooks/
│   ├── session-start.ts    # Post-compaction context + metacog reminders
│   ├── prompt-submit.ts    # Pre-task reflection + prompt capture
│   ├── stop.ts             # Task completion flag
│   └── file-access.ts      # File operation tracking
└── lib/
    ├── types.ts            # TypeScript interfaces (SessionState unified)
    ├── io.ts               # Hook stdin/stdout I/O
    ├── state.ts            # SessionState CRUD (.claude/ASymptOmatik/metacognition/)
    ├── paths.ts            # Path normalization + mtime utilities
    ├── messages.ts         # Message constants + interleaving
    └── souvenir.ts         # claude-souvenir plugin detection
```

### Data Storage (per project)

```
.claude/ASymptOmatik/metacognition/{session_id}.json
```

Single unified `SessionState` per session: `{ task_started, compaction_count, initial_prompt, interventions, task_completed, file_access }`. Writes are atomic (temp file + rename). Automatically cleaned up (max 10 per project).

## Technical Details

- **Language**: TypeScript compiled to CommonJS
- **Runtime dependencies**: None (Node.js built-ins only)
- **Node.js**: >= 18.0.0
- **Hook variable**: `${CLAUDE_PLUGIN_ROOT}` for path resolution
- **Message technique**: Google Research repetition (REPETITION_COUNT=2) for improved LLM adherence

## See Also

- **[claude-souvenir](https://github.com/djethino/claude-souvenir)** — Semantic search across conversation history and project files. Complements metacognition by enabling deep context recovery after compaction.
- **[claude-code-safety-net](https://github.com/kenryu42/claude-code-safety-net)** — Blocks destructive commands (`rm -rf`, `git reset --hard`, `git push --force`). Metacognition focuses on reflection; safety-net on protection.

## License

MIT — Copyright (c) 2025 ASymptOmatik
