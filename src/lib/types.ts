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

/** Metacognition state (.claude/metacognition/{session_id}.json) */
export interface MetacogState {
  task_started: boolean;
  compaction_count: number;
}

/** Task context (.claude/task-contexts/{session_id}.json) */
export interface TaskContext {
  initial_prompt: string | null;
  initial_timestamp: string | null;
  interventions: Intervention[];
  task_completed?: boolean;
  file_access?: Record<string, string[]>;
}

export interface Intervention {
  timestamp: string;
  prompt: string;
}

/** Hook JSON output to stdout. */
export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    additionalContext?: string;
    systemMessage?: string;
  };
}
