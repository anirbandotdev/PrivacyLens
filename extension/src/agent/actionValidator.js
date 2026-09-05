const ALLOWED_ACTION_TYPES = new Set([
  "click",
  "type",
  "scroll",
  "focus",
  "select",
  "submit_search",
  "search"
]);

const ALLOWED_SCROLL_DIRECTIONS = new Set([
  "up",
  "down",
  "left",
  "right"
]);

const TARGET_ID_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;

const SENSITIVE_FIELD_REGEX = /\b(?:password\d*|passwd\d*|passcode\d*|pwd\d*|otp\d*|pin\d*|cvv\d*|cvc\d*|cid\d*|one\s+time\s+(?:code|password)|security\s+code|card\s+number|credit\s+card|debit\s+card|cc\s+number|cc\s+csc|cc\s+cvc|cc\s+cvv)\b/i;

function normalizeDescriptor(str) {
  if (typeof str !== "string") {
    return "";
  }
  return str
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z\d])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSensitiveFieldDescriptor(descriptor) {
  const normalized = normalizeDescriptor(descriptor);
  return SENSITIVE_FIELD_REGEX.test(normalized);
}

const SENSITIVE_VALUE_REGEX = new RegExp(
  [
    "\\b(?:password|passwd|passcode|pwd)\\b",
    "\\b(?:otp|one[- ]?time[- ]?password|verification[- ]?code)\\b",
    "\\b(?:pin|mpin)\\b",
    "\\b(?:cvv|cvc|cid|security[- ]?code)\\b",
    "\\b(?:credit[- ]?card|debit[- ]?card|card[- ]?number|payment|billing)\\b",
    "\\b(?:\\d[ -]*?){13,19}\\b"
  ].join("|"),
  "i"
);

function validateTargetId(targetId) {
  if (typeof targetId !== "string" || !TARGET_ID_REGEX.test(targetId)) {
    throw new Error("Invalid action: targetId is invalid.");
  }
}

export function validateAgentActions(actions) {
  if (!Array.isArray(actions) || actions.length > 10) {
    throw new Error("Invalid actions: expected an array with at most 10 items.");
  }

  const normalizedActions = [];

  for (const action of actions) {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      throw new Error("Invalid action: action must be an object.");
    }

    const { type } = action;

    if (!ALLOWED_ACTION_TYPES.has(type)) {
      throw new Error("Invalid action: unsupported action type.");
    }

    if (action.requiresConfirmation !== undefined && typeof action.requiresConfirmation !== "boolean") {
      throw new Error("Invalid action: requiresConfirmation must be a boolean.");
    }

    const confirmation = action.requiresConfirmation !== undefined
      ? { requiresConfirmation: action.requiresConfirmation }
      : {};

    if (["click", "type", "focus", "select", "submit_search", "search"].includes(type)) {
      validateTargetId(action.targetId);
    }

    if (type === "click") {
      normalizedActions.push({
        type: "click",
        targetId: action.targetId,
        ...(action.intent ? { intent: action.intent } : {}),
        ...confirmation
      });
    } else if (type === "focus") {
      normalizedActions.push({
        type: "focus",
        targetId: action.targetId,
        ...(action.intent ? { intent: action.intent } : {}),
        ...confirmation
      });
    } else if (type === "select") {
      if (action.valueToken !== undefined) {
        throw new Error("Invalid action: select action does not permit valueToken.");
      }

      if (typeof action.value !== "string" || action.value.trim().length === 0) {
        throw new Error("Invalid action: select action requires a non-empty value string.");
      }

      if (SENSITIVE_VALUE_REGEX.test(action.value)) {
        throw new Error("Invalid action: sensitive values must require local user entry.");
      }

      const normalizedSelect = {
        type: "select",
        targetId: action.targetId,
        value: action.value
      };

      if (action.intent) {
        normalizedSelect.intent = action.intent;
      }
      if (action.requiresConfirmation !== undefined) {
        normalizedSelect.requiresConfirmation = action.requiresConfirmation;
      }
      normalizedActions.push(normalizedSelect);
    } else if (type === "type") {
      const fieldDescriptor = `${action.targetId || ""} ${action.intent || ""}`;
      if (isSensitiveFieldDescriptor(fieldDescriptor)) {
        throw new Error("Invalid action: typing into sensitive fields is not permitted.");
      }

      const hasValue = typeof action.value === "string" && action.value.length > 0;
      const hasToken = typeof action.valueToken === "string" && action.valueToken.length > 0;

      if ((hasValue && hasToken) || (!hasValue && !hasToken)) {
        throw new Error("Invalid action: type action must contain exactly one of value or valueToken.");
      }

      if (hasValue) {
        if (SENSITIVE_VALUE_REGEX.test(action.value)) {
          throw new Error("Invalid action: sensitive values must require local user entry.");
        }
        normalizedActions.push({
          type: "type",
          targetId: action.targetId,
          value: action.value,
          ...(action.intent ? { intent: action.intent } : {}),
          ...confirmation
        });
      } else {
        normalizedActions.push({
          type: "type",
          targetId: action.targetId,
          valueToken: action.valueToken,
          ...(action.intent ? { intent: action.intent } : {}),
          ...confirmation
        });
      }
    } else if (type === "scroll") {
      if (!ALLOWED_SCROLL_DIRECTIONS.has(action.direction)) {
        throw new Error("Invalid action: scroll direction must be up, down, left, or right.");
      }

      if (
        typeof action.amount !== "number" ||
        !Number.isFinite(action.amount) ||
        action.amount < 1 ||
        action.amount > 2000
      ) {
        throw new Error("Invalid action: scroll amount must be between 1 and 2000.");
      }

      const normalizedScroll = {
        type: "scroll",
        direction: action.direction,
        amount: action.amount
      };

      if (action.targetId !== undefined) {
        validateTargetId(action.targetId);
        normalizedScroll.targetId = action.targetId;
      }

      if (action.intent) {
        normalizedScroll.intent = action.intent;
      }

      if (action.requiresConfirmation !== undefined) {
        normalizedScroll.requiresConfirmation = action.requiresConfirmation;
      }

      normalizedActions.push(normalizedScroll);
    } else if (type === "submit_search") {
      if (
        action.value !== undefined ||
        action.valueToken !== undefined ||
        action.direction !== undefined ||
        action.amount !== undefined
      ) {
        throw new Error("Invalid action: submit_search does not accept value, valueToken, direction, or amount.");
      }

      normalizedActions.push({
        type: "submit_search",
        targetId: action.targetId,
        ...(action.intent ? { intent: action.intent } : {}),
        ...confirmation
      });
    } else if (type === "search") {
      const fieldDescriptor = `${action.targetId || ""} ${action.intent || ""}`;
      if (isSensitiveFieldDescriptor(fieldDescriptor)) {
        throw new Error("Invalid action: searching in sensitive fields is not permitted.");
      }

      if (
        action.valueToken !== undefined ||
        action.direction !== undefined ||
        action.amount !== undefined
      ) {
        throw new Error("Invalid action: search action does not permit valueToken, direction, or amount.");
      }

      if (typeof action.value !== "string" || action.value.length === 0) {
        throw new Error("Invalid action: search action requires a non-empty value string.");
      }

      if (SENSITIVE_VALUE_REGEX.test(action.value)) {
        throw new Error("Invalid action: sensitive values must require local user entry.");
      }

      normalizedActions.push({
        type: "search",
        targetId: action.targetId,
        value: action.value,
        ...(action.intent ? { intent: action.intent } : {}),
        ...confirmation
      });
    }
  }

  return normalizedActions;
}
