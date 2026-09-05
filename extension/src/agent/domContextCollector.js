function extractInteractiveDomContext() {
  const SENSITIVE_FIELD_REGEX =
    /\b(?:password\d*|passwd\d*|passcode\d*|pwd\d*|otp\d*|pin\d*|cvv\d*|cvc\d*|cid\d*|one\s+time\s+(?:code|password)|security\s+code|card\s+number|credit\s+card|debit\s+card|cc\s+number|cc\s+csc|cc\s+cvc|cc\s+cvv)\b/i;

  function normalizeDescriptor(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z\d])/g, "$1 $2")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function isElementVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isElementDisabled(el) {
    if (!el) return true;
    return (
      Boolean(el.disabled) ||
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true"
    );
  }

  function isSensitiveField(el) {
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") {
      const typeAttr = el.getAttribute("type") || el.type || "";
      if (typeAttr.toLowerCase() === "password") return true;
      const autocompleteAttr = el.getAttribute("autocomplete") || "";
      const nameAttr = el.getAttribute("name") || "";
      const idAttr = el.getAttribute("id") || el.id || "";
      const combined = `${typeAttr} ${autocompleteAttr} ${nameAttr} ${idAttr}`;
      return SENSITIVE_FIELD_REGEX.test(normalizeDescriptor(combined));
    }
    return false;
  }

  function cleanLabel(raw) {
    if (typeof raw !== "string") return "";
    return raw.replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function getElementLabel(el) {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) {
      return cleanLabel(ariaLabel);
    }

    if (el.labels && el.labels.length > 0) {
      const labelText = el.labels[0].innerText || el.labels[0].textContent;
      if (labelText && labelText.trim()) {
        return cleanLabel(labelText);
      }
    }

    if (el.id) {
      try {
        const labelEl = document.querySelector(
          `label[for="${CSS.escape(el.id)}"]`
        );
        if (labelEl) {
          const labelText = labelEl.innerText || labelEl.textContent;
          if (labelText && labelText.trim()) {
            return cleanLabel(labelText);
          }
        }
      } catch {}
    }

    const parentLabel = el.closest("label");
    if (parentLabel) {
      const labelText = parentLabel.innerText || parentLabel.textContent;
      if (labelText && labelText.trim()) {
        return cleanLabel(labelText);
      }
    }

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");
    if (tag === "input") {
      const inputType = (
        el.getAttribute("type") ||
        el.type ||
        ""
      ).toLowerCase();
      if (
        inputType === "submit" ||
        inputType === "button" ||
        inputType === "reset"
      ) {
        const val = el.getAttribute("value");
        if (val && val.trim()) {
          return cleanLabel(val);
        }
      }
    } else if (
      tag === "button" ||
      tag === "a" ||
      role === "button" ||
      role === "link"
    ) {
      const visibleText = el.innerText || el.textContent;
      if (visibleText && visibleText.trim()) {
        return cleanLabel(visibleText);
      }
    }

    const placeholder = el.getAttribute("placeholder") || el.placeholder;
    if (placeholder && placeholder.trim()) {
      return cleanLabel(placeholder);
    }

    const title = el.getAttribute("title") || el.title;
    if (title && title.trim()) {
      return cleanLabel(title);
    }

    return "";
  }

  const elements = document.querySelectorAll(
    'button, a[href], input, textarea, select, [role="button"], [role="link"]'
  );

  const candidates = [];
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;

  for (let i = 0; i < elements.length && i < 1500; i++) {
    const el = elements[i];

    if (!isElementVisible(el) || isElementDisabled(el)) {
      continue;
    }

    if (isSensitiveField(el)) {
      continue;
    }

    let targetId = el.id ? el.id.trim() : "";
    if (targetId) {
      if (targetId.length > 200) {
        continue;
      }
      try {
        const matching = document.querySelectorAll(
          `[id="${CSS.escape(targetId)}"]`
        );
        if (matching.length > 1) {
          continue;
        }
      } catch {
        if (document.getElementById(targetId) !== el) {
          continue;
        }
      }
    }

    const rect = el.getBoundingClientRect();
    const inViewport =
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < viewportHeight &&
      rect.left < viewportWidth;

    let label = getElementLabel(el);
    if (label) {
      const container = el.parentElement
        ? el.parentElement.closest(
            '[role="row"], [role="listitem"], [role="option"], li, article'
          )
        : null;
      if (container) {
        const containerText = (container.innerText || container.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        if (containerText && !label.includes(containerText)) {
          label = cleanLabel(`${label} — ${containerText}`);
        }
      }
    }
    const hasLabel = Boolean(label);

    candidates.push({
      el,
      targetId,
      inViewport,
      hasLabel,
      label,
      index: i,
    });
  }

  candidates.sort((a, b) => {
    if (a.inViewport !== b.inViewport) {
      return a.inViewport ? -1 : 1;
    }
    if (a.hasLabel !== b.hasLabel) {
      return a.hasLabel ? -1 : 1;
    }
    return a.index - b.index;
  });

  const selected = candidates.slice(0, 100);
  const results = [];
  let generatedIdCounter = 1;

  for (const item of selected) {
    const el = item.el;
    let targetId = item.targetId;

    if (!targetId) {
      while (
        document.getElementById(`privacylens-target-${generatedIdCounter}`)
      ) {
        generatedIdCounter++;
      }
      targetId = `privacylens-target-${generatedIdCounter}`;
      el.id = targetId;
      generatedIdCounter++;
    }

    const elementType = el.tagName.toLowerCase();
    const controlType =
      elementType === "input"
        ? (el.getAttribute("type") || el.type || "text").toLowerCase()
        : null;
    const role = el.getAttribute("role") || null;

    results.push({
      targetId,
      elementType,
      controlType,
      role,
      label: item.label,
    });
  }

  return results;
}

export async function collectSafeDomContextInActiveTab() {
  const browserApi = globalThis.browser ?? globalThis.chrome;
  if (!browserApi?.tabs?.query || !browserApi?.scripting?.executeScript) {
    throw new Error("Browser scripting APIs unavailable.");
  }

  const tabs = await browserApi.tabs.query({
    active: true,
    currentWindow: true,
  });
  const activeTab = tabs?.[0];
  if (!activeTab?.id) {
    throw new Error("No active tab found.");
  }

  const executionResults = await browserApi.scripting.executeScript({
    target: { tabId: activeTab.id },
    func: extractInteractiveDomContext,
  });

  const rawResults = executionResults?.[0]?.result;
  if (!Array.isArray(rawResults)) {
    throw new Error("Failed to collect DOM context.");
  }

  const normalizedResults = [];
  for (const item of rawResults) {
    if (normalizedResults.length >= 100) {
      break;
    }
    if (!item || typeof item !== "object") {
      continue;
    }
    const targetId =
      typeof item.targetId === "string" ? item.targetId.trim().slice(0, 200) : "";
    if (!targetId) {
      continue;
    }
    const elementType =
      typeof item.elementType === "string" ? item.elementType.trim() : "";
    const controlType =
      typeof item.controlType === "string" && item.controlType.trim()
        ? item.controlType.trim()
        : null;
    const role =
      typeof item.role === "string" && item.role.trim()
        ? item.role.trim()
        : null;
    const label =
      typeof item.label === "string"
        ? item.label.replace(/\s+/g, " ").trim().slice(0, 120)
        : "";

    normalizedResults.push({
      targetId,
      elementType,
      controlType,
      role,
      label,
    });
  }

  return normalizedResults;
}
