const ALLOWED_ACTION_TYPES = new Set([
  "click",
  "type",
  "scroll",
  "focus",
  "select"
]);

const ALLOWED_SCROLL_DIRECTIONS = new Set([
  "up",
  "down",
  "left",
  "right"
]);

const TARGET_ID_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;

const SENSITIVE_FIELD_REGEX = /(?:password|passwd|passcode|otp|one[-_ ]?time[-_ ]?code|pin|cvv|cvc|security[-_ ]?code|card[-_ ]?number|credit[-_ ]?card|debit[-_ ]?card)/i;

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

    if (["click", "type", "focus", "select"].includes(type)) {
      validateTargetId(action.targetId);
    }

    if (type === "click") {
      normalizedActions.push({
        type: "click",
        targetId: action.targetId,
        ...(action.intent ? { intent: action.intent } : {})
      });
    } else if (type === "focus") {
      normalizedActions.push({
        type: "focus",
        targetId: action.targetId,
        ...(action.intent ? { intent: action.intent } : {})
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
      normalizedActions.push(normalizedSelect);
    } else if (type === "type") {
      const fieldDescriptor = `${action.targetId || ""} ${action.intent || ""}`.toLowerCase();
      if (SENSITIVE_FIELD_REGEX.test(fieldDescriptor)) {
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
          ...(action.intent ? { intent: action.intent } : {})
        });
      } else {
        normalizedActions.push({
          type: "type",
          targetId: action.targetId,
          valueToken: action.valueToken,
          ...(action.intent ? { intent: action.intent } : {})
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

      normalizedActions.push(normalizedScroll);
    }
  }

  return normalizedActions;
}
