"use strict";
/**
 * Stop hook — Flag task_completed.
 *
 * Sets task_completed=true in the task context.
 * Allows prompt-submit.ts to distinguish new task vs intervention.
 *
 * Note: The Stop hook fires AFTER the complete response. A systemMessage here
 * shows on the user side, not the agent side. End-of-task checks are in
 * PRE_TASK_REFLECTION in prompt-submit.ts ("AVANT DE CONCLURE" section).
 */
Object.defineProperty(exports, "__esModule", { value: true });
const io_js_1 = require("../lib/io.js");
const state_js_1 = require("../lib/state.js");
(0, io_js_1.runHook)('Stop', ({ session_id }, projectDir) => {
    if (!session_id)
        return;
    (0, state_js_1.updateState)(projectDir, session_id, (state) => {
        state.task_completed = true;
    });
});
