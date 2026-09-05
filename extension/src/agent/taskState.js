const ALLOWED_ACTION_TYPES = new Set(["click", "type", "scroll", "focus", "select", "submit_search", "search"]);
const ALLOWED_ROOT_KEYS = new Set(["stepIndex", "history"]);
const ALLOWED_HISTORY_KEYS = new Set(["stepIndex", "actionType", "status", "effect"]);
const ALLOWED_EFFECTS = new Set(["search_submitted", "message_composed", "media_started", "message_sent"]);

export function normalizeTaskState(taskState) {
  if (taskState === undefined) {
    return undefined;
  }

  if (
    typeof taskState !== "object" ||
    taskState === null ||
    Array.isArray(taskState)
  ) {
    throw new Error("Invalid task state.");
  }

  const rootKeys = Object.keys(taskState);
  if (
    rootKeys.length !== 2 ||
    !rootKeys.every((key) => ALLOWED_ROOT_KEYS.has(key))
  ) {
    throw new Error("Invalid task state.");
  }

  const { stepIndex, history } = taskState;

  if (
    typeof stepIndex !== "number" ||
    !Number.isInteger(stepIndex) ||
    stepIndex < 0 ||
    stepIndex > 9
  ) {
    throw new Error("Invalid task state.");
  }

  if (!Array.isArray(history) || history.length > 10 || history.length !== stepIndex) {
    throw new Error("Invalid task state.");
  }

  const normalizedHistory = [];

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];

    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry)
    ) {
      throw new Error("Invalid task state.");
    }

    const entryKeys = Object.keys(entry);
    if (
      (entryKeys.length !== 3 && entryKeys.length !== 4) ||
      !entryKeys.every((key) => ALLOWED_HISTORY_KEYS.has(key))
    ) {
      throw new Error("Invalid task state.");
    }

    const { stepIndex: entryStepIndex, actionType, status } = entry;

    if (
      typeof entryStepIndex !== "number" ||
      !Number.isInteger(entryStepIndex) ||
      entryStepIndex !== i
    ) {
      throw new Error("Invalid task state.");
    }

    if (typeof actionType !== "string" || !ALLOWED_ACTION_TYPES.has(actionType)) {
      throw new Error("Invalid task state.");
    }

    if (status !== "executed") {
      throw new Error("Invalid task state.");
    }

    if ("effect" in entry) {
      if (typeof entry.effect !== "string" || !ALLOWED_EFFECTS.has(entry.effect)) {
        throw new Error("Invalid task state.");
      }
    }

    const normalizedEntry = {
      stepIndex: entryStepIndex,
      actionType,
      status: "executed",
    };

    if (entry.effect) {
      normalizedEntry.effect = entry.effect;
    }

    normalizedHistory.push(normalizedEntry);
  }

  return {
    stepIndex,
    history: normalizedHistory,
  };
}
