# Claude Metacognition

Claude Code plugin that eliminates the repetitive startup and recovery steps Claude does at every session. Hooks-only, zero runtime dependencies.

## Why

Every Claude Code session follows the same pattern: Claude asks what the project is, reads files to orient itself, runs `git status`, and only then starts working. After context compaction, it's worse — Claude re-reads everything, forgets the original request, and fills gaps with plausible guesses instead of asking.

These are not edge cases. They happen on every session, every compaction, every task switch.

Metacognition addresses this by giving Claude the information it would spend the first few minutes gathering on its own:

| Without | With metacognition |
|---------|--------------------|
| "What's this project about?" → user explains | Project tree + git status injected at startup |
| After compaction: "What was I doing?" | Original prompt + interventions + accessed files restored |
| Rushes into code, delivers partial work | Reflection questions force decomposition before starting |
| Assumes when unsure, doesn't say so | Must declare unknowns and hypotheses explicitly |

The plugin was built by observing Claude's actual failure patterns — not theoretical problems, but things that happened repeatedly in real sessions and cost real time.

## What It Does

Claude Metacognition injects behavioral guidance into Claude Code via hooks:

- **Pre-task reflection** forces Claude to decompose the request, identify unknowns, and check existing work before starting
- **Post-task verification** prompts Claude to check what was missed, what assumptions were made, and what remains
- **Post-compaction context** restores the original prompt, user interventions, and accessed files after context compression
- **New session orientation** provides project tree (with extension breakdown and mtime) and git repository status (uncommitted/unpushed/unpulled) at session start
- **File access tracking** records every file read/written/edited during the task with operation type

### Problems It Addresses

| Problem | How it helps |
|---------|-------------|
| Rushing without analysis | Reflection questions before starting |
| Plausible gap-filling | Forces Claude to state what it doesn't know |
| Context loss after compaction | Restores full original prompt + interventions |
| Post-compaction tunnel vision | Metacognitive reminders about partial context |
| Silent assumptions | Prompts Claude to declare hypotheses explicitly |
| Starting blind on a project | Project tree + git status at session start |

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
| **SessionStart** | New session or compaction | New session: project tree + git status + metacog reminders. Compaction: restores captured context. |

### Task Detection Logic

The Stop hook fires after each complete response, setting `task_completed = true`. The next UserPromptSubmit checks two things before treating a prompt as a new task:

1. **Flag check**: `task_completed` must be `true` (Stop fired since last prompt)
2. **Transcript check**: The last assistant message in the JSONL transcript must NOT contain `tool_use` blocks

If the last assistant message has `tool_use` blocks, Claude is mid-task (between tool calls) — the prompt is treated as an intervention, not a new task. This prevents the false positive where Stop fires between tool calls and a user message resets the session state.

The transcript analysis reads only the last 64KB of the file for performance. If the transcript is unavailable, behavior falls back to the flag-only check.

### Post-Compaction Injection

After context compaction, the SessionStart hook injects:
- Task start time and compaction time
- Full original prompt text
- Last 5 user interventions
- Files accessed during the task (with read/write/update type and mtime)
- Other files modified since task start (by subagents, external tools)
- Metacognitive reminder about partial context risks

### New Session Context

On startup or `/clear`, the SessionStart hook injects:
- **Project tree**: filesystem structure at depth 2, with extension breakdown and last modified date for collapsed directories. When claude-souvenir is installed, the tree is presented as a `souvenir_tree` preview — Claude can use `souvenir_tree` for deeper exploration (filters, line counts, etc.)
- **Git repository status** (if subdirectories contain `.git`): branch, last activity, uncommitted files, unpushed/unpulled commits
- Instruction to warn the user about git desync without taking action

This context only appears on fresh sessions — not on resume (`-c`/`-r`) or compaction.

### Claude-Souvenir Integration

If [claude-souvenir](https://github.com/djethino/claude-souvenir) is installed:
- **New session**: the project tree is presented as a `souvenir_tree` preview, with hints to use `souvenir_search` for past context and `souvenir_tree` for deeper exploration
- **After compaction**: the context message includes `souvenir_search` references so Claude can recover discussions and decisions lost in the summary

Without souvenir, the project tree still appears (without the souvenir framing), and compaction context is still restored — only the souvenir-specific hints are omitted.

## Architecture

```
src/
├── hooks/
│   ├── session-start.ts    # Post-compaction context + metacog reminders
│   ├── prompt-submit.ts    # Pre-task reflection + prompt capture
│   ├── stop.ts             # Task completion flag
│   └── file-access.ts      # File operation tracking
└── lib/
    ├── types.ts            # TypeScript interfaces (SessionState, GitRepoInfo)
    ├── io.ts               # Hook stdin/stdout I/O
    ├── state.ts            # SessionState CRUD (.claude/ASymptOmatik/metacognition/)
    ├── paths.ts            # Path normalization, mtime utilities, git repo detection
    ├── tree.ts             # Project tree builder (extensions + mtime per dir)
    ├── messages.ts         # Message constants + interleaving
    └── souvenir.ts         # claude-souvenir plugin detection
```

### Data Storage (per project)

```
.claude/ASymptOmatik/metacognition/{session_id}.json
```

Single unified `SessionState` per session: `{ task_started, compaction_count, initial_prompt, interventions, task_completed, file_access }`. Writes are atomic (temp file + rename). Automatically cleaned up (max 10 per project).

### Multi-Agent & Multi-Project

Metacognition is designed for environments where multiple Claude instances (main agent, subagents, parallel sessions) may work on the same project simultaneously.

- **Per-session isolation**: Each session gets its own state file (`{session_id}.json`). Agents never read or write each other's state — no cross-contamination.
- **Atomic writes**: State is written to a temp file and renamed in a single OS operation. If two hooks fire at the same time (e.g., two agents completing simultaneously), neither corrupts the other's state file.
- **Cross-agent awareness**: After compaction, the SessionStart hook detects files modified by *other* agents or external tools (via filesystem mtime comparison against tracked file access). This gives Claude visibility into work done outside its own session.
- **Multi-project workspaces**: State is stored per-project (in the project's `.claude/` directory). A workspace containing multiple projects (each with its own `.git`) works naturally — git status and tree scan the workspace root, each project's state stays independent.

## Technical Details

- **Language**: TypeScript compiled to CommonJS
- **Runtime dependencies**: None (Node.js built-ins only, including `child_process` for git status)
- **Node.js**: >= 18.0.0
- **Hook variable**: `${CLAUDE_PLUGIN_ROOT}` for path resolution
- **Message technique**: Google Research repetition (REPETITION_COUNT=2) for improved LLM adherence

## Ecosystem

Metacognition is part of a plugin suite designed around a simple idea: Claude is capable, but has structural blind spots that plugins can address at different layers.

| Layer | Plugin | Role |
|-------|--------|------|
| **Behavior** | **claude-metacognition** (this plugin) | Decides *when* to think, *when* to search, *when* to stop and ask. Injects reflection at the right moments. |
| **Memory** | **[claude-souvenir](https://github.com/djethino/claude-souvenir)** | Provides *what* to remember. Semantic search across past conversations and project files. |
| **Safety** | **[claude-code-safety-net](https://github.com/kenryu42/claude-code-safety-net)** | Blocks *what not to do*. Prevents destructive commands (`rm -rf`, `git push --force`). |

### How metacognition and souvenir interact

Metacognition detects whether souvenir is installed (by reading `~/.claude/settings.json`). When it is:

- **New session**: the project tree is framed as a `souvenir_tree` preview with hints to use `souvenir_search` and `souvenir_tree` for deeper context
- **After compaction**: metacognition reminds Claude that `souvenir_search` can recover discussions and decisions lost in the summary

Without souvenir, metacognition still provides a project tree and git status at startup, but without the souvenir-specific hints. Without metacognition, souvenir is available but Claude rarely thinks to use it after compaction, which is precisely when it's most needed.

In short: metacognition is the reflex, souvenir is the memory. One without the other works, but together they cover the gap between "I should look this up" and "here's where to look."

## License

MIT — Copyright (c) 2025 ASymptOmatik
