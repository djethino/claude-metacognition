/**
 * TypeScript interfaces for Metacognition hooks.
 */

/** Input received by hooks from stdin. */
export interface HookInput {
  cwd: string;
  session_id: string;
  // SessionStart
  source?: string;
  // UserPromptSubmit
  prompt?: string;
  // PostToolUse
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

/** Unified session state (.claude/metacognition/{session_id}.json) */
export interface SessionState {
  // Metacognition
  task_started: boolean;
  compaction_count: number;
  // Task context
  initial_prompt: string | null;
  initial_timestamp: string | null;
  interventions: Intervention[];
  task_completed: boolean;
  file_access?: Record<string, string[]>;
}

export interface Intervention {
  timestamp: string;
  prompt: string;
}

/** Git repository status info for session start context. */
export interface GitRepoInfo {
  path: string;
  branch: string;
  lastActivity: string;  // YYYY-MM-DD HH:MM
  uncommitted: number;   // files with uncommitted changes
  unpushed: number;      // commits ahead of upstream
  unpulled: number;      // commits behind upstream (from last fetch)
}

/** Hook JSON output to stdout. */
export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    additionalContext?: string;
    systemMessage?: string;
  };
}
