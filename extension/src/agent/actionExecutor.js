import { validateAgentActions } from "./actionValidator.js";

function runInjectedActions(actions, confirmedActionIndexes = []) {
  const confirmedSet = new Set(
    Array.isArray(confirmedActionIndexes) ? confirmedActionIndexes : []
  );

  const SENSITIVE_DOM_REGEX = /(?:password|passwd|passcode|pwd|otp|one[-_ ]?time[-_ ]?code|pin|cvv|cvc|security[-_ ]?code|card[-_ ]?number|credit[-_ ]?card|debit[-_ ]?card|cc[-_ ]?number|cc[-_ ]?csc)/i;

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
    const typeAttr = (el.getAttribute("type") || el.type || "").toLowerCase();
    if (typeAttr === "password") {
      return true;
    }

    const autocompleteAttr = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (
      autocompleteAttr.includes("password") ||
      autocompleteAttr.includes("one-time-code") ||
      autocompleteAttr.includes("cc-")
    ) {
      return true;
    }

    const nameAttr = (el.getAttribute("name") || "").toLowerCase();
    const idAttr = (el.getAttribute("id") || el.id || "").toLowerCase();
    const combined = `${typeAttr} ${autocompleteAttr} ${nameAttr} ${idAttr}`;

    return SENSITIVE_DOM_REGEX.test(combined);
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

      targetEl.dispatchEvent(new Event("input", { bubbles: true }));
      targetEl.dispatchEvent(new Event("change", { bubbles: true }));

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
