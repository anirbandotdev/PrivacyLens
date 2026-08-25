export const ALLOWED_ACTION_TYPES = new Set([
  "click",
  "type",
  "scroll",
  "focus",
  "select",
]);

const SENSITIVE_INTENTS = new Set([
  "submit",
  "send",
  "payment",
  "upload",
  "delete",
]);

const TARGETLESS_ACTIONS = new Set(["scroll"]);

function invalid(reason) {
  return {
    valid: false,
    reason,
  };
}

export function validateAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return invalid("Action must be an object");
  }

  if (!ALLOWED_ACTION_TYPES.has(action.type)) {
    return invalid(`Unsupported action type: ${action.type}`);
  }

  if (
    !TARGETLESS_ACTIONS.has(action.type) &&
    (typeof action.targetId !== "string" || !action.targetId.trim())
  ) {
    return invalid("A valid targetId is required");
  }

  if (action.type === "type") {
    const hasValue = typeof action.value === "string";
    const hasToken = typeof action.valueToken === "string";

    if (!hasValue && !hasToken) {
      return invalid("Typing actions require a value or valueToken");
    }

    if (hasValue && hasToken) {
      return invalid("Use either value or valueToken, not both");
    }

    if (hasValue && action.value.length > 2000) {
      return invalid("Typing value is too long");
    }
  }

  if (action.type === "scroll") {
    const validDirections = ["up", "down", "left", "right"];

    if (!validDirections.includes(action.direction)) {
      return invalid("Invalid scroll direction");
    }

    if (
      typeof action.amount !== "number" ||
      action.amount <= 0 ||
      action.amount > 2000
    ) {
      return invalid("Scroll amount must be between 1 and 2000");
    }
  }

  return {
    valid: true,
    reason: null,
  };
}

export function requiresConfirmation(action) {
  return (
    action?.requiresConfirmation === true ||
    SENSITIVE_INTENTS.has(action?.intent)
  );
}