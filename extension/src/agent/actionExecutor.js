import { validateAgentActions } from "./actionValidator.js";

function runInjectedActions(actions, confirmedActionIndexes = []) {
  const confirmedSet = new Set(
    Array.isArray(confirmedActionIndexes) ? confirmedActionIndexes : []
  );

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

  function isElementVisible(el) {
    if (!el || !(el instanceof Element)) {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isElementDisabled(el) {
    if (!el) {
      return true;
    }
    return (
      Boolean(el.disabled) ||
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true"
    );
  }

  function isSensitiveField(el) {
    if (!el) {
      return false;
    }
    const typeAttr = el.getAttribute("type") || el.type || "";
    if (typeAttr.toLowerCase() === "password") {
      return true;
    }

    const autocompleteAttr = el.getAttribute("autocomplete") || "";
    const nameAttr = el.getAttribute("name") || "";
    const idAttr = el.getAttribute("id") || el.id || "";
    const combined = `${typeAttr} ${autocompleteAttr} ${nameAttr} ${idAttr}`;

    return SENSITIVE_FIELD_REGEX.test(normalizeDescriptor(combined));
  }

  const HIGH_IMPACT_CLICK_REGEX = new RegExp(
    [
      "\\b(?:delete|remove)\\b",
      "\\b(?:pay|payment|purchase|buy(?:\\s+now)?)\\b",
      "\\b(?:place(?:\\s+an?)?\\s+order|confirm(?:\\s+an?)?\\s+order|order(?:\\s+now)?)\\b",
      "\\b(?:transfer|withdraw(?:al)?)\\b",
      "\\b(?:send(?:\\s+(?:message|email|mail))?)\\b",
      "\\bupload\\b",
      "\\b(?:book(?:ing)?|book(?:\\s+now)?)\\b",
      "\\b(?:submit(?:\\s+(?:an?\\s+)?(?:application|form|order|payment|request))?)\\b"
    ].join("|"),
    "i"
  );

  function isHighImpactClick(element, action) {
    if (!element) {
      return false;
    }
    const intent = typeof action?.intent === "string" ? action.intent : "";
    const idAttr = element.id || element.getAttribute("id") || "";
    const nameAttr = element.getAttribute("name") || "";
    const ariaLabel = element.getAttribute("aria-label") || "";
    const titleAttr = element.getAttribute("title") || "";
    const val = typeof element.value === "string" ? element.value : "";
    const text = element.innerText || element.textContent || "";

    const combined = `${intent} ${idAttr} ${nameAttr} ${ariaLabel} ${titleAttr} ${val} ${text}`;
    return HIGH_IMPACT_CLICK_REGEX.test(combined);
  }

  const results = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const isExplicitlyConfirmed = confirmedSet.has(i);

    if (action.requiresConfirmation === true && !isExplicitlyConfirmed) {
      results.push({
        actionIndex: i,
        type: action.type,
        status: "requires_confirmation"
      });
      continue;
    }

    if (action.type === "scroll") {
      let scrollTarget = window;
      if (action.targetId) {
        const el = document.getElementById(action.targetId);
        if (!el) {
          results.push({
            actionIndex: i,
            type: action.type,
            status: "target_not_found"
          });
          continue;
        }
        if (!isElementVisible(el)) {
          results.push({
            actionIndex: i,
            type: action.type,
            status: "target_not_visible"
          });
          continue;
        }
        scrollTarget = el;
      }

      const amount = Number(action.amount) || 0;
      let top = 0;
      let left = 0;
      if (action.direction === "up") top = -amount;
      else if (action.direction === "down") top = amount;
      else if (action.direction === "left") left = -amount;
      else if (action.direction === "right") left = amount;

      if (scrollTarget === window) {
        window.scrollBy({ top, left, behavior: "smooth" });
      } else {
        scrollTarget.scrollBy({ top, left, behavior: "smooth" });
      }

      results.push({
        actionIndex: i,
        type: action.type,
        status: "executed"
      });
      continue;
    }

    const targetEl = document.getElementById(action.targetId);
    if (!targetEl) {
      results.push({
        actionIndex: i,
        type: action.type,
        status: "target_not_found"
      });
      continue;
    }

    if (!isElementVisible(targetEl)) {
      results.push({
        actionIndex: i,
        type: action.type,
        status: "target_not_visible"
      });
      continue;
    }

    if (isElementDisabled(targetEl)) {
      results.push({
        actionIndex: i,
        type: action.type,
        status: "target_disabled"
      });
      continue;
    }

    if (action.type === "click") {
      if (isHighImpactClick(targetEl, action) && !isExplicitlyConfirmed) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "requires_confirmation"
        });
        continue;
      }

      targetEl.click();
      results.push({
        actionIndex: i,
        type: action.type,
        status: "executed"
      });
    } else if (action.type === "focus") {
      targetEl.focus();
      results.push({
        actionIndex: i,
        type: action.type,
        status: "executed"
      });
    } else if (action.type === "select") {
      if (!(targetEl instanceof HTMLSelectElement)) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "unsupported_target"
        });
        continue;
      }

      const hasMatchingOption = Array.from(targetEl.options).some(
        (option) => option.value === action.value
      );

      if (!hasMatchingOption) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "option_not_found"
        });
        continue;
      }

      const proto = window.HTMLSelectElement?.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(targetEl, action.value);
      } else {
        targetEl.value = action.value;
      }

      targetEl.dispatchEvent(new Event("input", { bubbles: true }));
      targetEl.dispatchEvent(new Event("change", { bubbles: true }));

      results.push({
        actionIndex: i,
        type: action.type,
        status: "executed"
      });
    } else if (action.type === "type") {
      if (
        !(targetEl instanceof HTMLInputElement) &&
        !(targetEl instanceof HTMLTextAreaElement)
      ) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "unsupported_target"
        });
        continue;
      }

      if (action.valueToken !== undefined && action.value === undefined) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "requires_local_value"
        });
        continue;
      }

      if (isSensitiveField(targetEl)) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "blocked_sensitive_field"
        });
        continue;
      }

      targetEl.focus();

      const previousValue = targetEl.value || "";
      const proto =
        targetEl instanceof HTMLInputElement
          ? window.HTMLInputElement?.prototype
          : window.HTMLTextAreaElement?.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

      if (nativeSetter) {
        nativeSetter.call(targetEl, action.value);
      } else {
        targetEl.value = action.value;
      }

      // Reset any framework value tracker so the dispatched event
      // is recognized as an actual value change.
      if (targetEl._valueTracker && typeof targetEl._valueTracker.setValue === "function") {
        targetEl._valueTracker.setValue(previousValue);
      }

      targetEl.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      targetEl.dispatchEvent(new Event("change", { bubbles: true }));

      results.push({
        actionIndex: i,
        type: action.type,
        status: "executed"
      });
    } else if (action.type === "submit_search") {
      if (!(targetEl instanceof HTMLInputElement)) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "unsupported_target"
        });
        continue;
      }

      const inputType = (targetEl.getAttribute("type") || targetEl.type || "").toLowerCase();
      const role = (targetEl.getAttribute("role") || "").toLowerCase();
      
      const isSearchType = inputType === "search" || role === "searchbox";
      const isInsideSearchLandmark = !!targetEl.closest('search, [role="search"], form[role="search"]');

      if (!isSearchType && !isInsideSearchLandmark) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "unsupported_target"
        });
        continue;
      }

      if (isSensitiveField(targetEl)) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "blocked_sensitive_field"
        });
        continue;
      }

      targetEl.focus();

      const eventInit = {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      };

      targetEl.dispatchEvent(new KeyboardEvent("keydown", eventInit));
      targetEl.dispatchEvent(new KeyboardEvent("keypress", eventInit));
      targetEl.dispatchEvent(new KeyboardEvent("keyup", eventInit));

      results.push({
        actionIndex: i,
        type: action.type,
        status: "executed"
      });
    } else if (action.type === "search") {
      if (!(targetEl instanceof HTMLInputElement)) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "unsupported_target"
        });
        continue;
      }

      const inputType = (targetEl.getAttribute("type") || targetEl.type || "").toLowerCase();
      const role = (targetEl.getAttribute("role") || "").toLowerCase();

      const isSearchType = inputType === "search" || role === "searchbox";
      const isInsideSearchLandmark = !!targetEl.closest('search, [role="search"], form[role="search"]');

      if (!isSearchType && !isInsideSearchLandmark) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "unsupported_target"
        });
        continue;
      }

      if (isSensitiveField(targetEl)) {
        results.push({
          actionIndex: i,
          type: action.type,
          status: "blocked_sensitive_field"
        });
        continue;
      }

      targetEl.focus();

      const previousValue = targetEl.value || "";
      const proto = window.HTMLInputElement?.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

      if (nativeSetter) {
        nativeSetter.call(targetEl, action.value);
      } else {
        targetEl.value = action.value;
      }

      if (targetEl._valueTracker && typeof targetEl._valueTracker.setValue === "function") {
        targetEl._valueTracker.setValue(previousValue);
      }

      targetEl.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      targetEl.dispatchEvent(new Event("change", { bubbles: true }));

      const searchForm =
        targetEl.closest('form[role="search"]') ||
        targetEl.closest('search form') ||
        (targetEl.form && (targetEl.form.getAttribute("role") === "search" || !!targetEl.form.closest('search, [role="search"]'))) ||
        null;

      let submitted = false;
      if (searchForm && typeof searchForm.requestSubmit === "function") {
        try {
          searchForm.requestSubmit();
          submitted = true;
        } catch {
          submitted = false;
        }
      }

      if (!submitted) {
        const eventInit = {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        };

        targetEl.dispatchEvent(new KeyboardEvent("keydown", eventInit));
        targetEl.dispatchEvent(new KeyboardEvent("keypress", eventInit));
        targetEl.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      }

      results.push({
        actionIndex: i,
        type: action.type,
        status: "executed"
      });
    }
  }

  return results;
}

export async function executeActionsInActiveTab(actions, options = {}) {
  const validatedActions = validateAgentActions(actions);

  if (options !== null && typeof options !== "object") {
    throw new Error("Invalid options: options must be an object.");
  }

  let confirmedActionIndexes = [];
  if (options?.confirmedActionIndexes !== undefined) {
    if (!Array.isArray(options.confirmedActionIndexes)) {
      throw new Error("Invalid confirmedActionIndexes: must be an array.");
    }

    const seen = new Set();
    for (const idx of options.confirmedActionIndexes) {
      if (
        typeof idx !== "number" ||
        !Number.isInteger(idx) ||
        idx < 0 ||
        idx >= validatedActions.length
      ) {
        throw new Error("Invalid confirmedActionIndexes: index must be a non-negative integer within bounds.");
      }

      if (seen.has(idx)) {
        throw new Error("Invalid confirmedActionIndexes: duplicate index found.");
      }

      seen.add(idx);
    }

    confirmedActionIndexes = Array.from(seen);
  }

  const browserApi = globalThis.browser ?? globalThis.chrome;
  if (!browserApi?.tabs?.query || !browserApi?.scripting?.executeScript) {
    throw new Error("Browser extension scripting API is not available.");
  }

  const tabs = await browserApi.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs?.[0];
  if (!activeTab?.id) {
    throw new Error("No active tab found to execute actions.");
  }

  const executionResults = await browserApi.scripting.executeScript({
    target: { tabId: activeTab.id },
    func: runInjectedActions,
    args: [validatedActions, confirmedActionIndexes]
  });

  return executionResults?.[0]?.result ?? [];
}
