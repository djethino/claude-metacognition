# Claude Metacognition

Claude Code plugin for metacognitive reflection and post-compaction context preservation. Hooks-only, zero runtime dependencies.

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

The Stop hook fires after each complete response, setting `task_completed = true`. The next UserPromptSubmit sees this flag and treats the prompt as a new task (reset + capture). Prompts sent *during* Claude's work (system-reminders) are not captured as interventions — only explicit user messages between responses.

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
- **Project tree** (if claude-souvenir is installed): filesystem structure at depth 2, with extension breakdown and last modified date for collapsed directories
- **Git repository status** (always, if subdirectories contain `.git`): branch, last activity, uncommitted files, unpushed/unpulled commits
- Instruction to warn the user about git desync without taking action

This context only appears on fresh sessions — not on resume (`-c`/`-r`) or compaction.

### Claude-Souvenir Integration

If [claude-souvenir](https://github.com/djethino/claude-souvenir) is installed, the session start message includes the project tree and souvenir hints. The post-compaction message includes souvenir tool references so Claude can recover deep context from past sessions.

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

- **New session**: metacognition injects a project tree and suggests `souvenir_search` for past context, `souvenir_tree` for deeper exploration
- **After compaction**: metacognition reminds Claude that `souvenir_search` can recover discussions and decisions lost in the summary

Without souvenir, metacognition works identically — it just skips the tree and the souvenir-specific hints. Without metacognition, souvenir is available but Claude rarely thinks to use it after compaction, which is precisely when it's most needed.

In short: metacognition is the reflex, souvenir is the memory. One without the other works, but together they cover the gap between "I should look this up" and "here's where to look."

## License

MIT — Copyright (c) 2025 ASymptOmatik
