"""Shared utilities for Metacognition hooks.

Provides two storage systems:
- Metacognition state: .claude/metacognition/{session_id}.json
  Tracks: task_started, compaction_count (for reflection prompts)
- Task context: .claude/task-contexts/{session_id}.json
  Tracks: initial_prompt, interventions, file_access, task_completed
"""

import json
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Number of times to repeat messages (Google Research technique for LLM adherence)
# - For simple messages: message repeated REPETITION_COUNT times
# - For interleaved (prompt + nudge): prompt appears (REPETITION_COUNT - 1) times in additionalContext
REPETITION_COUNT = 2


# ---------------------------------------------------------------------------
# Common utilities
# ---------------------------------------------------------------------------

def fix_stdin_encoding() -> None:
    """Fix stdin/stdout encoding for Windows (defaults to CP1252, not UTF-8)."""
    if sys.platform == "win32":
        sys.stdin.reconfigure(encoding='utf-8')
        sys.stdout.reconfigure(encoding='utf-8')


def load_hook_input() -> dict | None:
    """Load and parse JSON input from stdin. Returns None on error."""
    try:
        return json.load(sys.stdin)
    except json.JSONDecodeError:
        return None


def repeat_message(message: str) -> str:
    """Repeat a message REPETITION_COUNT times, separated by ---."""
    parts = [message] * REPETITION_COUNT
    return "\n\n---\n\n".join(parts)


def build_interleaved(nudge: str, prompt: str) -> str:
    """Build interleaved nudge + prompt pattern.

    With REPETITION_COUNT=2: nudge + prompt + nudge (prompt appears 1 time)
    With REPETITION_COUNT=3: nudge + prompt + nudge + prompt + nudge (prompt appears 2 times)
    With REPETITION_COUNT=1: nudge only (prompt appears 0 times)
    """
    if REPETITION_COUNT <= 1:
        return nudge

    parts = []
    for i in range(REPETITION_COUNT):
        parts.append(nudge)
        if i < REPETITION_COUNT - 1:
            parts.append(f"PROMPT UTILISATEUR :\n{prompt}")
    return "\n\n---\n\n".join(parts)


def normalize_path(file_path: str, cwd: str) -> str:
    """Convert to relative path and normalize separators."""
    try:
        cwd_path = Path(cwd)
        file_path_obj = Path(file_path)
        if file_path_obj.is_absolute():
            try:
                file_path = str(file_path_obj.relative_to(cwd_path))
            except ValueError:
                pass
        return file_path.replace("\\", "/")
    except Exception:
        return file_path.replace("\\", "/")


# ---------------------------------------------------------------------------
# Metacognition state (.claude/metacognition/)
# ---------------------------------------------------------------------------

def get_context_dir(cwd: str) -> Path:
    """Get path to metacognition state directory."""
    return Path(cwd) / ".claude" / "metacognition"


def get_state_file(cwd: str, session_id: str) -> Path:
    """Get path to state file for this session."""
    return get_context_dir(cwd) / f"{session_id}.json"


def load_state(cwd: str, session_id: str) -> dict:
    """Load session state or return default."""
    state_file = get_state_file(cwd, session_id)
    if state_file.exists():
        try:
            return json.loads(state_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {"task_started": False, "compaction_count": 0}


def save_state(cwd: str, session_id: str, state: dict) -> bool:
    """Save session state. Returns True on success."""
    state_file = get_state_file(cwd, session_id)
    try:
        state_file.parent.mkdir(parents=True, exist_ok=True)
        state_file.write_text(
            json.dumps(state, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        return True
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Task context tracking (.claude/task-contexts/)
# ---------------------------------------------------------------------------

def get_contexts_dir(cwd: str) -> Path:
    """Get path to task-contexts directory."""
    return Path(cwd) / ".claude" / "task-contexts"


def get_context_file(cwd: str, session_id: str) -> Path:
    """Get path to context file for this session."""
    return get_contexts_dir(cwd) / f"{session_id}.json"


def load_context(cwd: str, session_id: str) -> dict | None:
    """Load task context if it exists."""
    context_file = get_context_file(cwd, session_id)
    if context_file.exists():
        try:
            return json.loads(context_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return None


def save_context(cwd: str, session_id: str, context: dict) -> bool:
    """Save task context to file. Returns True on success."""
    context_file = get_context_file(cwd, session_id)
    try:
        context_file.parent.mkdir(parents=True, exist_ok=True)
        context_file.write_text(
            json.dumps(context, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        return True
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Plugin detection
# ---------------------------------------------------------------------------

_souvenir_available: bool | None = None


def is_souvenir_available() -> bool:
    """Check if claude-souvenir plugin is installed and enabled.

    Reads ~/.claude/settings.json and checks enabledPlugins for a key
    containing 'claude-souvenir' with value True. Result is cached for the
    lifetime of the process (one hook invocation).
    """
    global _souvenir_available
    if _souvenir_available is not None:
        return _souvenir_available
    try:
        settings_path = Path.home() / ".claude" / "settings.json"
        if not settings_path.exists():
            _souvenir_available = False
            return False
        settings = json.loads(settings_path.read_text(encoding="utf-8"))
        enabled = settings.get("enabledPlugins", {})
        _souvenir_available = any(
            "claude-souvenir" in key and val is True
            for key, val in enabled.items()
        )
    except Exception:
        _souvenir_available = False
    return _souvenir_available
