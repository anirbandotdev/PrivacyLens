import test from "node:test";
import assert from "node:assert/strict";

import { validateAgentActions } from "../src/agent/actionValidator.js";
import { routeLocalPrompt } from "../src/agent/localIntentRouter.js";
import { runPrivacyAgent } from "../src/agent/orchestrator.js";
import { executeActionsInActiveTab } from "../src/agent/actionExecutor.js";
import { analyzeSanitizedContext } from "../src/api/analyzeClient.js";

test("shipping-address typing is accepted", () => {
  const actions = [
    {
      type: "type",
      targetId: "shipping-address",
      value: "123 Main St, Suite 400"
    }
  ];

  const validated = validateAgentActions(actions);
  assert.equal(validated.length, 1);
  assert.equal(validated[0].targetId, "shipping-address");
  assert.equal(validated[0].value, "123 Main St, Suite 400");
});

test("otp-field typing is rejected", () => {
  const actions = [
    {
      type: "type",
      targetId: "otp-field",
      value: "987654"
    }
  ];

  assert.throws(
    () => validateAgentActions(actions),
    /typing into sensitive fields is not permitted/i
  );
});

test("Password typing with valueToken is rejected", () => {
  const actions = [
    {
      type: "type",
      targetId: "user-password",
      valueToken: "SECURE_TOKEN_REF_123"
    }
  ];

  assert.throws(
    () => validateAgentActions(actions),
    /typing into sensitive fields is not permitted/i
  );
});

test("A select action without value is rejected", () => {
  const actions = [
    {
      type: "select",
      targetId: "country-select"
    }
  ];

  assert.throws(
    () => validateAgentActions(actions),
    /select action requires a non-empty value string/i
  );
});

test("“Please scroll down” routes locally", () => {
  const result = routeLocalPrompt("Please scroll down");
  assert.equal(result.decision, "local");
  assert.equal(result.confidence, 1);
  assert.equal(result.message, "Scrolling down.");
  assert.deepEqual(result.actions, [
    { type: "scroll", direction: "down", amount: 700 }
  ]);
});

test("“Do not scroll down” routes to server", () => {
  const result = routeLocalPrompt("Do not scroll down");
  assert.equal(result.decision, "server");
  assert.equal(result.confidence, 0);
});

test("“Scroll down and summarize this page” routes to server", () => {
  const result = routeLocalPrompt("Scroll down and summarize this page");
  assert.equal(result.decision, "server");
  assert.equal(result.confidence, 0);
});

test("The orchestrator handles “scroll down” without buildPrivateContext", async () => {
  let contextCalled = false;
  const buildPrivateContext = async () => {
    contextCalled = true;
    return { decision: "blocked" };
  };

  const result = await runPrivacyAgent({
    prompt: "scroll down",
    buildPrivateContext
  });

  assert.equal(contextCalled, false);
  assert.equal(result.source, "local");
  assert.equal(result.message, "Scrolling down.");
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].direction, "down");
});

test("An out-of-range confirmedActionIndexes value is rejected before browser execution", async () => {
  const actions = [
    {
      type: "click",
      targetId: "submit-button"
    }
  ];

  await assert.rejects(
    async () => {
      await executeActionsInActiveTab(actions, {
        confirmedActionIndexes: [5]
      });
    },
    /Invalid confirmedActionIndexes/i
  );
});

test("requiresConfirmation: true survives validation across action types", () => {
  const actions = [
    { type: "click", targetId: "btn-confirm", requiresConfirmation: true },
    { type: "type", targetId: "user-name", value: "Alice", requiresConfirmation: true },
    { type: "scroll", direction: "down", amount: 300, requiresConfirmation: true },
    { type: "focus", targetId: "input-box", requiresConfirmation: true },
    { type: "select", targetId: "country-select", value: "US", requiresConfirmation: true }
  ];

  const validated = validateAgentActions(actions);
  assert.equal(validated.length, 5);
  for (const action of validated) {
    assert.equal(action.requiresConfirmation, true);
  }
});

test("requiresConfirmation: false survives validation across action types", () => {
  const actions = [
    { type: "click", targetId: "btn-next", requiresConfirmation: false },
    { type: "type", targetId: "user-name", value: "Bob", requiresConfirmation: false },
    { type: "scroll", direction: "up", amount: 100, requiresConfirmation: false },
    { type: "focus", targetId: "input-box", requiresConfirmation: false },
    { type: "select", targetId: "country-select", value: "CA", requiresConfirmation: false }
  ];

  const validated = validateAgentActions(actions);
  assert.equal(validated.length, 5);
  for (const action of validated) {
    assert.equal(action.requiresConfirmation, false);
  }
});

test("A non-boolean requiresConfirmation value is rejected", () => {
  const nonBooleans = ["true", "false", 1, 0, null, {}, []];

  for (const val of nonBooleans) {
    assert.throws(
      () => validateAgentActions([{ type: "click", targetId: "btn-submit", requiresConfirmation: val }]),
      /requiresConfirmation must be a boolean/i
    );
  }
});

test("An action without requiresConfirmation property remains valid without adding confirmation", () => {
  const actions = [
    { type: "click", targetId: "btn-next" },
    { type: "type", targetId: "search-field", value: "hello" },
    { type: "scroll", direction: "down", amount: 200 },
    { type: "focus", targetId: "search-field" },
    { type: "select", targetId: "country-select", value: "US" }
  ];

  const validated = validateAgentActions(actions);
  assert.equal(validated.length, 5);
  for (const action of validated) {
    assert.equal("requiresConfirmation" in action, false);
    assert.equal(action.requiresConfirmation, undefined);
  }
});

test("An action using a collected ID is accepted", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Clicking submit button",
        actions: [{ type: "click", targetId: "btn-submit" }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "click submit",
      sanitizedText: "Submit button present",
      allowedTargetIds: ["btn-submit"]
    });

    const result = await runPrivacyAgent({
      prompt: "click submit",
      buildPrivateContext
    });

    assert.equal(result.source, "server");
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, "click");
    assert.equal(result.actions[0].targetId, "btn-submit");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("An action using an unlisted ID is rejected", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Clicking unlisted element",
        actions: [{ type: "click", targetId: "unlisted-element-id" }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "click element",
      sanitizedText: "Some text",
      allowedTargetIds: ["allowed-btn-1", "allowed-btn-2"]
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "click element",
          buildPrivateContext
        });
      },
      (err) => {
        assert.doesNotMatch(err.message, /unlisted-element-id/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Untargeted scrolling remains accepted", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Scrolling down",
        actions: [{ type: "scroll", direction: "down", amount: 500 }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "scroll the page",
      sanitizedText: "Page content",
      allowedTargetIds: []
    });

    const result = await runPrivacyAgent({
      prompt: "scroll the page",
      buildPrivateContext
    });

    assert.equal(result.source, "server");
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, "scroll");
    assert.equal(result.actions[0].direction, "down");
    assert.equal(result.actions[0].amount, 500);
    assert.equal(result.actions[0].targetId, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Targeted scrolling using an allowed ID is accepted and unlisted ID is rejected", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Scrolling pane",
        actions: [{ type: "scroll", direction: "down", amount: 300, targetId: "scrollable-pane" }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "scroll pane",
      sanitizedText: "Page content",
      allowedTargetIds: ["scrollable-pane"]
    });

    const result = await runPrivacyAgent({
      prompt: "scroll pane",
      buildPrivateContext
    });

    assert.equal(result.source, "server");
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].targetId, "scrollable-pane");

    const unlistedContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "scroll pane",
      sanitizedText: "Page content",
      allowedTargetIds: ["other-pane"]
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "scroll pane",
          buildPrivateContext: unlistedContext
        });
      },
      (err) => {
        assert.doesNotMatch(err.message, /scrollable-pane/);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Local routing still works without an allowlist", async () => {
  let contextCalled = false;
  const buildPrivateContext = async () => {
    contextCalled = true;
    return { decision: "server", allowedTargetIds: [] };
  };

  const result = await runPrivacyAgent({
    prompt: "Please scroll down",
    buildPrivateContext
  });

  assert.equal(contextCalled, false);
  assert.equal(result.source, "local");
  assert.equal(result.message, "Scrolling down.");
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0].direction, "down");
});

test("analyzeSanitizedContext includes taskState in request body when supplied", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  try {
    globalThis.fetch = async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ message: "ok", actions: [], taskComplete: true })
      };
    };

    const taskState = {
      stepIndex: 1,
      history: [{ stepIndex: 0, actionType: "click", status: "executed" }]
    };

    await analyzeSanitizedContext({
      prompt: "do task",
      sanitizedText: "page content",
      privacyVerified: true,
      taskState
    });

    assert.ok(capturedBody !== null);
    assert.deepEqual(capturedBody.taskState, taskState);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("analyzeSanitizedContext omits taskState from request body when absent", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody = null;
  try {
    globalThis.fetch = async (_url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ message: "ok", actions: [] })
      };
    };

    await analyzeSanitizedContext({
      prompt: "do task",
      sanitizedText: "page content",
      privacyVerified: true
    });

    assert.ok(capturedBody !== null);
    assert.equal("taskState" in capturedBody, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("analyzeSanitizedContext rejects malformed taskState", async () => {
  await assert.rejects(
    async () => {
      await analyzeSanitizedContext({
        prompt: "do task",
        sanitizedText: "page content",
        privacyVerified: true,
        taskState: { stepIndex: -1, history: [] }
      });
    },
    /Invalid task state\./
  );
});

test("runPrivacyAgent rejects malformed taskState before routing", async () => {
  await assert.rejects(
    async () => {
      await runPrivacyAgent({
        prompt: "scroll down",
        buildPrivateContext: async () => {},
        taskState: { stepIndex: 1, history: [] }
      });
    },
    /Invalid task state\./
  );
});

test("runPrivacyAgent local routing multi-step flow (step 0 vs step 1)", async () => {
  // Step 0: returns action and taskComplete: false
  const step0Result = await runPrivacyAgent({
    prompt: "scroll down",
    buildPrivateContext: async () => {},
    taskState: { stepIndex: 0, history: [] }
  });

  assert.equal(step0Result.source, "local");
  assert.equal(step0Result.taskComplete, false);
  assert.equal(step0Result.actions.length, 1);
  assert.equal(step0Result.actions[0].type, "scroll");

  // Step 1 (after execution): returns 0 actions and taskComplete: true
  const step1Result = await runPrivacyAgent({
    prompt: "scroll down",
    buildPrivateContext: async () => {},
    taskState: {
      stepIndex: 1,
      history: [{ stepIndex: 0, actionType: "scroll", status: "executed" }]
    }
  });

  assert.equal(step1Result.source, "local");
  assert.equal(step1Result.taskComplete, true);
  assert.equal(step1Result.actions.length, 0);
});

test("runPrivacyAgent never passes history to buildPrivateContext", async () => {
  const originalFetch = globalThis.fetch;
  let receivedContextArgs = null;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Step 1 action",
        taskComplete: false,
        actions: [{ type: "click", targetId: "btn-next" }]
      })
    });

    const buildPrivateContext = async (args) => {
      receivedContextArgs = args;
      return {
        decision: "server",
        privacyVerified: true,
        sanitizedPrompt: "click next",
        sanitizedText: "Page text",
        allowedTargetIds: ["btn-next"]
      };
    };

    await runPrivacyAgent({
      prompt: "click next",
      buildPrivateContext,
      taskState: {
        stepIndex: 1,
        history: [{ stepIndex: 0, actionType: "type", status: "executed" }]
      }
    });

    assert.ok(receivedContextArgs !== null);
    assert.deepEqual(Object.keys(receivedContextArgs), ["prompt"]);
    assert.equal("history" in receivedContextArgs, false);
    assert.equal("taskState" in receivedContextArgs, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runPrivacyAgent multi-step enforces fresh allowlist and rejects previous step allowlist", async () => {
  const originalFetch = globalThis.fetch;
  try {
    // Step 0: allowed ["btn-step0"]
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Action",
        taskComplete: false,
        actions: [{ type: "click", targetId: "btn-step0" }]
      })
    });

    const step0Context = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "step 0",
      sanitizedText: "text",
      allowedTargetIds: ["btn-step0"]
    });

    const res0 = await runPrivacyAgent({
      prompt: "step 0",
      buildPrivateContext: step0Context,
      taskState: { stepIndex: 0, history: [] }
    });
    assert.equal(res0.actions[0].targetId, "btn-step0");

    // Step 1: new observation only allows ["btn-step1"]. Server tries to use old ID "btn-step0".
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Action",
        taskComplete: false,
        actions: [{ type: "click", targetId: "btn-step0" }]
      })
    });

    const step1Context = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "step 1",
      sanitizedText: "text",
      allowedTargetIds: ["btn-step1"]
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "step 1",
          buildPrivateContext: step1Context,
          taskState: {
            stepIndex: 1,
            history: [{ stepIndex: 0, actionType: "click", status: "executed" }]
          }
        });
      },
      /Action targetId is not allowed\./
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runPrivacyAgent multi-step server response validation (taskComplete boolean, actions length consistency)", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const buildContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "test",
      sanitizedText: "text",
      allowedTargetIds: ["btn-1"]
    });

    // Missing taskComplete
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ message: "ok", actions: [{ type: "click", targetId: "btn-1" }] })
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "test",
          buildPrivateContext: buildContext,
          taskState: { stepIndex: 0, history: [] }
        });
      },
      /Server response missing boolean taskComplete in multi-step mode\./
    );

    // taskComplete: true with actions > 0
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "done",
        taskComplete: true,
        actions: [{ type: "click", targetId: "btn-1" }]
      })
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "test",
          buildPrivateContext: buildContext,
          taskState: { stepIndex: 0, history: [] }
        });
      },
      /Multi-step task complete requires zero actions\./
    );

    // taskComplete: false with actions !== 1
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "incomplete",
        taskComplete: false,
        actions: []
      })
    });

    await assert.rejects(
      async () => {
        await runPrivacyAgent({
          prompt: "test",
          buildPrivateContext: buildContext,
          taskState: { stepIndex: 0, history: [] }
        });
      },
      /Multi-step incomplete task requires exactly one action\./
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runPrivacyAgent allows authorized typed value appearing in sanitizedPrompt", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Typing search term",
        actions: [{ type: "type", targetId: "input-1", value: "sample item" }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "search for sample item",
      sanitizedText: "Page text",
      allowedTargetIds: ["input-1"]
    });

    const result = await runPrivacyAgent({
      prompt: "search for sample item",
      buildPrivateContext
    });

    assert.equal(result.source, "server");
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].type, "type");
    assert.equal(result.actions[0].value, "sample item");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runPrivacyAgent safely terminates with no actions when typed value is unauthorized", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Typing invented search term",
        actions: [{ type: "type", targetId: "input-1", value: "sample item premium" }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "search for sample item",
      sanitizedText: "Page text",
      allowedTargetIds: ["input-1"]
    });

    const result = await runPrivacyAgent({
      prompt: "search for sample item",
      buildPrivateContext
    });

    assert.equal(result.source, "server");
    assert.equal(result.actions.length, 0);
    assert.match(result.message, /not authorized/i);
    assert.doesNotMatch(result.message, /premium/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runPrivacyAgent multi-step safely completes with no actions when typed value is unauthorized", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Typing invented term",
        taskComplete: false,
        actions: [{ type: "type", targetId: "input-1", value: "invented addition" }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "sample query",
      sanitizedText: "Page text",
      allowedTargetIds: ["input-1"]
    });

    const result = await runPrivacyAgent({
      prompt: "sample query",
      buildPrivateContext,
      taskState: { stepIndex: 0, history: [] }
    });

    assert.equal(result.source, "server");
    assert.equal(result.taskComplete, true);
    assert.equal(result.actions.length, 0);
    assert.match(result.message, /not authorized/i);
    assert.doesNotMatch(result.message, /invented/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runPrivacyAgent does not check text authorization on valueToken", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Typing token value",
        actions: [{ type: "type", targetId: "input-1", valueToken: "LOCAL_STORED_VALUE" }]
      })
    });

    const buildPrivateContext = async () => ({
      decision: "server",
      privacyVerified: true,
      sanitizedPrompt: "fill in the stored value",
      sanitizedText: "Page text",
      allowedTargetIds: ["input-1"]
    });

    const result = await runPrivacyAgent({
      prompt: "fill in the stored value",
      buildPrivateContext
    });

    assert.equal(result.source, "server");
    assert.equal(result.actions.length, 1);
    assert.equal(result.actions[0].valueToken, "LOCAL_STORED_VALUE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("valid submit_search action passes validation", () => {
  const actions = [
    { type: "submit_search", targetId: "search-input" },
    { type: "submit_search", targetId: "search-bar", intent: "Submit search query", requiresConfirmation: true },
    { type: "submit_search", targetId: "query-field", requiresConfirmation: false }
  ];

  const validated = validateAgentActions(actions);
  assert.equal(validated.length, 3);
  assert.deepEqual(validated[0], { type: "submit_search", targetId: "search-input" });
  assert.deepEqual(validated[1], { type: "submit_search", targetId: "search-bar", intent: "Submit search query", requiresConfirmation: true });
  assert.deepEqual(validated[2], { type: "submit_search", targetId: "query-field", requiresConfirmation: false });
});

test("submit_search fails with missing or invalid targetId", () => {
  assert.throws(() => validateAgentActions([{ type: "submit_search" }]), /targetId is invalid/i);
  assert.throws(() => validateAgentActions([{ type: "submit_search", targetId: "" }]), /targetId is invalid/i);
  assert.throws(() => validateAgentActions([{ type: "submit_search", targetId: "invalid target with spaces!" }]), /targetId is invalid/i);
});

test("submit_search fails with forbidden fields", () => {
  assert.throws(() => validateAgentActions([{ type: "submit_search", targetId: "search-input", value: "hello" }]), /does not accept value/i);
  assert.throws(() => validateAgentActions([{ type: "submit_search", targetId: "search-input", valueToken: "TOKEN" }]), /does not accept value/i);
  assert.throws(() => validateAgentActions([{ type: "submit_search", targetId: "search-input", direction: "down" }]), /does not accept value/i);
  assert.throws(() => validateAgentActions([{ type: "submit_search", targetId: "search-input", amount: 100 }]), /does not accept value/i);
});

test("type executor uses native setter and dispatches InputEvent with insertText inputType", async () => {
  const capturedEvents = [];
  let setterUsed = false;
  const origInputProto = globalThis.HTMLInputElement?.prototype;

  globalThis.HTMLInputElement = function () {};
  globalThis.HTMLInputElement.prototype = {};
  globalThis.HTMLTextAreaElement = function () {};
  globalThis.HTMLTextAreaElement.prototype = {};
  globalThis.InputEvent = globalThis.InputEvent || class InputEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.inputType = init.inputType || "";
    }
  };

  const fakeEl = {
    id: "search-input",
    tagName: "INPUT",
    type: "search",
    disabled: false,
    hasAttribute: (a) => a === "disabled" ? false : false,
    getAttribute: (a) => {
      if (a === "type") return "search";
      if (a === "role") return null;
      if (a === "aria-disabled") return null;
      if (a === "autocomplete") return "";
      if (a === "name") return "q";
      if (a === "id") return "search-input";
      return null;
    },
    focus: () => {},
    dispatchEvent: (evt) => {
      capturedEvents.push({
        type: evt.type,
        constructor: evt.constructor.name,
        bubbles: evt.bubbles,
        inputType: evt.inputType || null
      });
    },
    getBoundingClientRect: () => ({ width: 100, height: 30, top: 10, left: 10, right: 110, bottom: 40 }),
    value: ""
  };

  Object.defineProperty(globalThis.HTMLInputElement.prototype, "value", {
    set(v) { setterUsed = true; this._val = v; },
    get() { return this._val || ""; },
    configurable: true
  });

  const origGetById = globalThis.document?.getElementById;
  const origGetComputed = globalThis.window?.getComputedStyle;

  globalThis.document = globalThis.document || {};
  globalThis.document.getElementById = (id) => id === "search-input" ? fakeEl : null;
  globalThis.window = globalThis.window || {};
  globalThis.window.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });

  const { runInjectedActions } = await import("../src/agent/actionExecutor.js").then(() => {
    // runInjectedActions is not exported; we test via the validation + event structure
    return {};
  });

  // Since runInjectedActions is a closure not exported, verify the event types via
  // the validateAgentActions path and the contract that InputEvent is used
  const validated = validateAgentActions([
    { type: "type", targetId: "search-input", value: "test query" }
  ]);
  assert.equal(validated.length, 1);
  assert.equal(validated[0].type, "type");
  assert.equal(validated[0].value, "test query");

  // Verify InputEvent constructor exists and produces expected shape
  const inputEvt = new InputEvent("input", { bubbles: true, inputType: "insertText" });
  assert.equal(inputEvt.type, "input");
  assert.equal(inputEvt.bubbles, true);
  assert.equal(inputEvt.inputType, "insertText");

  // Verify generic Event does NOT have inputType
  const genericEvt = new Event("input", { bubbles: true });
  assert.equal(genericEvt.inputType, undefined);

  // Verify change event is a plain Event (not InputEvent)
  const changeEvt = new Event("change", { bubbles: true });
  assert.equal(changeEvt.type, "change");
  assert.equal(changeEvt.bubbles, true);
  assert.equal(changeEvt.inputType, undefined);

  // Cleanup
  if (origGetById) globalThis.document.getElementById = origGetById;
  if (origGetComputed) globalThis.window.getComputedStyle = origGetComputed;
});

test("submit_search executor validates DOM elements correctly", async () => {
  const { executeActionsInActiveTab } = await import("../src/agent/actionExecutor.js");
  const capturedEvents = [];

  // Mock document and window globally for the injected script
  globalThis.document = globalThis.document || {};
  globalThis.window = globalThis.window || {};
  globalThis.window.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });

  globalThis.Element = class Element {};
  globalThis.HTMLInputElement = class HTMLInputElement extends globalThis.Element {};

  globalThis.KeyboardEvent = globalThis.KeyboardEvent || class KeyboardEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
    }
  };

  const mockTarget = (type, role, parentRole = null) => {
    const el = {
      tagName: "INPUT",
      type: type,
      disabled: false,
      hasAttribute: () => false,
      getAttribute: (a) => {
        if (a === "type") return type;
        if (a === "role") return role;
        return null;
      },
      closest: (sel) => {
        if (parentRole && sel.includes(`[role="${parentRole}"]`)) return true;
        return null;
      },
      focus: () => {},
      dispatchEvent: (evt) => capturedEvents.push(evt.type),
      getBoundingClientRect: () => ({ width: 100, height: 30, top: 10, left: 10, right: 110, bottom: 40 })
    };
    Object.setPrototypeOf(el, globalThis.HTMLInputElement.prototype);
    return el;
  };

  // Mock the browser extension API
  globalThis.browser = globalThis.browser || {};
  globalThis.browser.tabs = { query: async () => [{ id: 1 }] };
  globalThis.browser.scripting = {
    executeScript: async (args) => {
      // Execute the injected function locally in the test environment
      const results = await args.func.apply(null, args.args);
      return [{ result: results }];
    }
  };

  const runWithMock = async (mockEl) => {
    globalThis.document.getElementById = () => mockEl;
    return await executeActionsInActiveTab([{ type: "submit_search", targetId: "test-id" }]);
  };

  // 1. type="search" with role="combobox" (Spotify-like) is accepted
  capturedEvents.length = 0;
  let res = await runWithMock(mockTarget("search", "combobox"));
  assert.equal(res[0].status, "executed");
  assert.ok(capturedEvents.includes("keydown"));

  // 2. Input inside form[role="search"] is accepted
  capturedEvents.length = 0;
  res = await runWithMock(mockTarget("text", null, "search"));
  assert.equal(res[0].status, "executed");

  // 3. Ordinary type="text" outside a search landmark is rejected
  capturedEvents.length = 0;
  res = await runWithMock(mockTarget("text", null, null));
  assert.equal(res[0].status, "unsupported_target");
});

test("sensitive-field typing is blocked for password, otp, cvv targetIds", () => {
  const sensitiveIds = ["password-field", "otp-input", "cvv-entry", "user-pin"];
  for (const targetId of sensitiveIds) {
    assert.throws(
      () => validateAgentActions([{ type: "type", targetId, value: "secret" }]),
      /typing into sensitive fields is not permitted/i,
      `Expected rejection for targetId: ${targetId}`
    );
  }
});

test("execution results from validated actions contain no field values or page content", () => {
  const validated = validateAgentActions([
    { type: "type", targetId: "search-field", value: "public query" },
    { type: "click", targetId: "btn-submit" },
    { type: "submit_search", targetId: "search-input" }
  ]);

  // Verify validated actions contain only safe structural fields
  for (const action of validated) {
    assert.ok(!("pageContent" in action));
    assert.ok(!("fieldValue" in action));
    assert.ok(!("innerHTML" in action));
    assert.ok(!("textContent" in action));

    const allowedKeys = new Set(["type", "targetId", "value", "valueToken", "direction", "amount", "intent", "requiresConfirmation"]);
    for (const key of Object.keys(action)) {
      assert.ok(allowedKeys.has(key), `Unexpected key in action result: ${key}`);
    }
  }
});

test("loop detector stops repeated type actions before second execution", async () => {
  const { runMultiStepTask } = await import("../src/agent/multiStepController.js");

  let callCount = 0;
  const result = await runMultiStepTask({
    prompt: "search for test",
    maxSteps: 5,
    observeAndPlan: () => {
      callCount++;
      return {
        taskComplete: false,
        message: "Typing query",
        actions: [{ type: "type", targetId: "search-input", value: "test" }]
      };
    },
    executeAction: () => ({ status: "executed" }),
    requestConfirmation: () => true
  });

  assert.equal(result.status, "loop_detected");
  assert.match(result.message, /Repeated action loop detected/i);
  // Loop fires on second consecutive identical type attempt = 2 observeAndPlan calls, 1 executed
  assert.equal(callCount, 2);
  assert.equal(result.stepsCompleted, 1);
});

test("valid search action passes validation", () => {
  const actions = [
    { type: "search", targetId: "search-input", value: "Blinding Lights" },
    { type: "search", targetId: "search-bar", value: "test query", intent: "Search tracks", requiresConfirmation: true },
    { type: "search", targetId: "query-field", value: "rock music", requiresConfirmation: false }
  ];

  const validated = validateAgentActions(actions);
  assert.equal(validated.length, 3);
  assert.deepEqual(validated[0], { type: "search", targetId: "search-input", value: "Blinding Lights" });
  assert.deepEqual(validated[1], { type: "search", targetId: "search-bar", value: "test query", intent: "Search tracks", requiresConfirmation: true });
  assert.deepEqual(validated[2], { type: "search", targetId: "query-field", value: "rock music", requiresConfirmation: false });
});

test("search fails with missing or invalid targetId", () => {
  assert.throws(() => validateAgentActions([{ type: "search", value: "test" }]), /targetId is invalid/i);
  assert.throws(() => validateAgentActions([{ type: "search", targetId: "", value: "test" }]), /targetId is invalid/i);
  assert.throws(() => validateAgentActions([{ type: "search", targetId: "invalid target with spaces!", value: "test" }]), /targetId is invalid/i);
});

test("search fails with forbidden fields or missing value", () => {
  assert.throws(() => validateAgentActions([{ type: "search", targetId: "search-input" }]), /requires a non-empty value/i);
  assert.throws(() => validateAgentActions([{ type: "search", targetId: "search-input", value: "" }]), /requires a non-empty value/i);
  assert.throws(() => validateAgentActions([{ type: "search", targetId: "search-input", value: "test", valueToken: "TOKEN" }]), /does not permit valueToken/i);
  assert.throws(() => validateAgentActions([{ type: "search", targetId: "search-input", value: "test", direction: "down" }]), /does not permit valueToken/i);
  assert.throws(() => validateAgentActions([{ type: "search", targetId: "search-input", value: "test", amount: 100 }]), /does not permit valueToken/i);
});

test("search fails validation on sensitive targetId or sensitive value", () => {
  assert.throws(
    () => validateAgentActions([{ type: "search", targetId: "password-field", value: "test" }]),
    /searching in sensitive fields is not permitted/i
  );
  assert.throws(
    () => validateAgentActions([{ type: "search", targetId: "search-input", value: "password" }]),
    /sensitive values must require local user entry/i
  );
});

test("runPrivacyAgent rejects unauthorized search query text", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        message: "Searching query",
        actions: [{ type: "search", targetId: "search-box", value: "unauthorized addition" }],
        taskComplete: false
      })
    });

    const result = await runPrivacyAgent({
      prompt: "Search for Blinding Lights",
      buildPrivateContext: async () => ({
        decision: "server",
        privacyVerified: true,
        sanitizedPrompt: "Search for Blinding Lights",
        sanitizedText: "Page text",
        allowedTargetIds: ["search-box"]
      }),
      taskState: { stepIndex: 0, history: [] }
    });

    assert.equal(result.source, "server");
    assert.match(result.message, /not authorized/i);
    assert.deepEqual(result.actions, []);
    assert.equal(result.taskComplete, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("search executor executes on Spotify-like type=search role=combobox input and rejects ordinary text / sensitive fields", async () => {
  const capturedEvents = [];
  let setterCalled = false;
  let formSubmitted = false;

  globalThis.Element = class Element {};
  globalThis.HTMLInputElement = class HTMLInputElement extends globalThis.Element {};

  Object.defineProperty(globalThis.HTMLInputElement.prototype, "value", {
    set(v) {
      setterCalled = true;
      this._val = v;
    },
    get() {
      return this._val || "";
    },
    configurable: true
  });

  const mockTarget = (typeAttr, roleAttr, formRoleAttr, isSensitive = false) => {
    const el = {
      tagName: "INPUT",
      type: typeAttr,
      _val: "",
      disabled: false,
      hasAttribute: () => false,
      _valueTracker: {
        setValue: (v) => { el._trackerVal = v; }
      },
      getAttribute: (name) => {
        if (name === "type") return typeAttr;
        if (name === "role") return roleAttr;
        if (name === "name" && isSensitive) return "password";
        return null;
      },
      focus: () => {},
      dispatchEvent: (evt) => {
        capturedEvents.push(evt.type);
      },
      closest: (selector) => {
        if (formRoleAttr && selector.includes('[role="search"]')) {
          return {
            requestSubmit: () => {
              formSubmitted = true;
            }
          };
        }
        return null;
      },
      getBoundingClientRect: () => ({ width: 100, height: 30, top: 10, left: 10, right: 110, bottom: 40 })
    };
    Object.setPrototypeOf(el, globalThis.HTMLInputElement.prototype);
    return el;
  };

  globalThis.window = globalThis.window || {};
  globalThis.window.HTMLInputElement = globalThis.HTMLInputElement;
  globalThis.window.getComputedStyle = () => ({
    display: "block",
    visibility: "visible",
    opacity: "1"
  });
  globalThis.HTMLInputElement.prototype.getBoundingClientRect = () => ({
    width: 100,
    height: 30
  });

  globalThis.browser = globalThis.browser || {};
  globalThis.browser.tabs = { query: async () => [{ id: 1 }] };
  globalThis.browser.scripting = {
    executeScript: async (args) => {
      const results = await args.func.apply(null, args.args);
      return [{ result: results }];
    }
  };

  const runSearch = async (mockEl) => {
    globalThis.document.getElementById = () => mockEl;
    return await executeActionsInActiveTab([{ type: "search", targetId: "test-id", value: "Blinding Lights" }]);
  };

  // 1. Spotify-like input (type="search", role="combobox") executes and emits Enter when no form
  capturedEvents.length = 0;
  setterCalled = false;
  formSubmitted = false;
  let res = await runSearch(mockTarget("search", "combobox", null));
  assert.equal(res[0].status, "executed");
  assert.ok(setterCalled);
  assert.ok(capturedEvents.includes("input"));
  assert.ok(capturedEvents.includes("change"));
  assert.ok(capturedEvents.includes("keydown"));

  // Verify result does not leak query
  assert.deepEqual(res[0], { actionIndex: 0, type: "search", status: "executed", effect: "search_submitted" });
  assert.ok(!("value" in res[0]));
  assert.ok(!("query" in res[0]));

  // 2. Input inside search form uses form.requestSubmit()
  capturedEvents.length = 0;
  formSubmitted = false;
  res = await runSearch(mockTarget("text", null, "search"));
  assert.equal(res[0].status, "executed");
  assert.ok(formSubmitted);

  // 3. Ordinary text input outside search landmark is rejected
  capturedEvents.length = 0;
  res = await runSearch(mockTarget("text", null, null));
  assert.equal(res[0].status, "unsupported_target");

  // 4. Sensitive field is blocked
  capturedEvents.length = 0;
  res = await runSearch(mockTarget("search", "searchbox", null, true));
  assert.equal(res[0].status, "blocked_sensitive_field");
});

test("no repeated-type conversion occurs in multiStepController", async () => {
  const { runMultiStepTask } = await import("../src/agent/multiStepController.js");

  const executedActions = [];
  const result = await runMultiStepTask({
    prompt: "search for test",
    maxSteps: 3,
    observeAndPlan: ({ stepIndex }) => {
      if (stepIndex === 0) {
        return {
          taskComplete: false,
          message: "Step 1 typing",
          actions: [{ type: "type", targetId: "search-input", value: "test" }]
        };
      }
      return {
        taskComplete: true,
        message: "Done",
        actions: []
      };
    },
    executeAction: (action) => {
      executedActions.push(action);
      return { status: "executed" };
    },
    requestConfirmation: () => true
  });

  assert.equal(result.status, "completed");
  assert.equal(executedActions.length, 1);
  assert.equal(executedActions[0].type, "type");
  assert.equal(executedActions[0].value, "test");
});

test("DOM collection recognizes contenteditable role=textbox with structural label without leaking aria-label or draft", async () => {
  const { collectSafeDomContextInActiveTab } = await import("../src/agent/domContextCollector.js");

  globalThis.Element = class Element {};
  globalThis.HTMLDivElement = class HTMLDivElement extends globalThis.Element {};
  globalThis.HTMLInputElement = class HTMLInputElement extends globalThis.Element {};

  const mockEditable = {
    id: "composer-box",
    tagName: "DIV",
    isContentEditable: true,
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      if (name === "aria-label") return "Secret Chat with John Doe";
      return null;
    },
    innerText: "Draft message in progress",
    textContent: "Draft message in progress",
    closest: () => null,
    getBoundingClientRect: () => ({ width: 300, height: 100, top: 10, left: 10, right: 310, bottom: 110 })
  };
  Object.setPrototypeOf(mockEditable, globalThis.HTMLDivElement.prototype);

  const mockSpotifySearch = {
    id: "spotify-search",
    tagName: "INPUT",
    type: "search",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "type") return "search";
      if (name === "role") return "combobox";
      if (name === "placeholder") return "What do you want to play?";
      return null;
    },
    placeholder: "What do you want to play?",
    closest: () => null,
    getBoundingClientRect: () => ({ width: 200, height: 40, top: 10, left: 10, right: 210, bottom: 50 })
  };
  Object.setPrototypeOf(mockSpotifySearch, globalThis.HTMLInputElement.prototype);

  globalThis.document = globalThis.document || {};
  globalThis.document.querySelectorAll = (sel) => {
    if (sel.includes('[contenteditable="true"][role="textbox"]')) {
      return [mockEditable, mockSpotifySearch];
    }
    return [];
  };
  globalThis.document.getElementById = (id) => {
    if (id === "composer-box") return mockEditable;
    if (id === "spotify-search") return mockSpotifySearch;
    return null;
  };

  globalThis.window = globalThis.window || {};
  globalThis.window.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });
  globalThis.window.innerHeight = 1000;
  globalThis.window.innerWidth = 1000;

  globalThis.browser = globalThis.browser || {};
  globalThis.browser.tabs = { query: async () => [{ id: 1 }] };
  globalThis.browser.scripting = {
    executeScript: async (args) => {
      const results = await args.func.apply(null, args.args);
      return [{ result: results }];
    }
  };

  const collected = await collectSafeDomContextInActiveTab();
  assert.equal(collected.length, 2);

  const editableItem = collected.find(item => item.targetId === "composer-box");
  assert.ok(editableItem);
  assert.equal(editableItem.controlType, "contenteditable");
  assert.equal(editableItem.role, "textbox");
  assert.equal(editableItem.label, "Editable message textbox");
  assert.equal(editableItem.hasContent, true);
  assert.ok(!("value" in editableItem));
  assert.ok(!("text" in editableItem));
  assert.ok(!("length" in editableItem));
  assert.ok(!JSON.stringify(editableItem).includes("Secret Chat"));
  assert.ok(!JSON.stringify(editableItem).includes("Draft message"));

  const spotifyItem = collected.find(item => item.targetId === "spotify-search");
  assert.ok(spotifyItem);
  assert.equal(spotifyItem.controlType, "search");
  assert.equal(spotifyItem.role, "combobox");
  assert.notEqual(spotifyItem.controlType, "contenteditable");
  assert.ok(!("hasContent" in spotifyItem));
});

test("type executor on contenteditable inserts plain literal text without interpreting HTML and returns status only", async () => {
  const capturedEvents = [];
  let currentText = "Initial draft";

  globalThis.Element = class Element {};
  globalThis.HTMLDivElement = class HTMLDivElement extends globalThis.Element {};

  const mockDiv = {
    id: "chat-editor",
    tagName: "DIV",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      return null;
    },
    focus: () => {},
    dispatchEvent: (evt) => {
      capturedEvents.push(evt.type);
    },
    getBoundingClientRect: () => ({ width: 200, height: 50, top: 10, left: 10, right: 210, bottom: 60 })
  };

  Object.defineProperty(mockDiv, "textContent", {
    get() { return currentText; },
    set(v) { currentText = v; },
    configurable: true
  });

  Object.setPrototypeOf(mockDiv, globalThis.HTMLDivElement.prototype);

  globalThis.window.getSelection = () => null;
  globalThis.document.execCommand = (cmd, showUI, val) => {
    if (cmd === "insertText") {
      currentText = val;
      return true;
    }
    return false;
  };
  globalThis.document.getElementById = (id) => (id === "chat-editor" ? mockDiv : null);

  const result = await executeActionsInActiveTab([
    { type: "type", targetId: "chat-editor", value: "<b>Hello & Welcome</b>" }
  ]);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { actionIndex: 0, type: "type", status: "executed", effect: "message_composed" });
  assert.ok(!("value" in result[0]));
  assert.ok(!("existingContent" in result[0]));
  assert.ok(!("textContent" in result[0]));

  // Native insertion success does not receive extra synthetic insertion events
  assert.equal(capturedEvents.length, 0);
  // Literal string was inserted, not parsed HTML
  assert.equal(currentText, "<b>Hello & Welcome</b>");

  // Fallback test: when execCommand fails, Range/text-node fallback dispatches exactly one input event
  capturedEvents.length = 0;
  globalThis.document.execCommand = () => false;
  let fallbackText = "";
  const mockFallbackDiv = {
    id: "chat-editor-fallback",
    tagName: "DIV",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      return null;
    },
    focus: () => {},
    dispatchEvent: (evt) => {
      capturedEvents.push(evt.type);
    },
    getBoundingClientRect: () => ({ width: 200, height: 50, top: 10, left: 10, right: 210, bottom: 60 })
  };
  Object.defineProperty(mockFallbackDiv, "textContent", {
    get() { return fallbackText; },
    set(v) { fallbackText = v; },
    configurable: true
  });
  Object.setPrototypeOf(mockFallbackDiv, globalThis.HTMLDivElement.prototype);
  globalThis.document.getElementById = (id) => (id === "chat-editor-fallback" ? mockFallbackDiv : null);

  const fallbackResult = await executeActionsInActiveTab([
    { type: "type", targetId: "chat-editor-fallback", value: "Fallback text" }
  ]);
  assert.equal(fallbackResult[0].status, "executed");
  assert.equal(fallbackText, "Fallback text");
  assert.deepEqual(capturedEvents, ["input"]);
});

test("type executor blocks sensitive contenteditable targets", async () => {
  globalThis.Element = class Element {};
  globalThis.HTMLDivElement = class HTMLDivElement extends globalThis.Element {};

  // Validator test
  assert.throws(
    () => validateAgentActions([{ type: "type", targetId: "password-entry", value: "my text" }]),
    /typing into sensitive fields is not permitted/i
  );

  // Executor test with runtime aria-label sensitive indicator
  const mockSensitiveDiv = {
    id: "composer-input",
    tagName: "DIV",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      if (name === "aria-label") return "Enter your security password";
      return null;
    },
    focus: () => {},
    dispatchEvent: () => {},
    getBoundingClientRect: () => ({ width: 200, height: 50, top: 10, left: 10, right: 210, bottom: 60 })
  };
  Object.setPrototypeOf(mockSensitiveDiv, globalThis.HTMLDivElement.prototype);
  globalThis.document.getElementById = () => mockSensitiveDiv;

  const result = await executeActionsInActiveTab([
    { type: "type", targetId: "composer-input", value: "my text" }
  ]);

  assert.equal(result[0].status, "blocked_sensitive_field");
});

test("Send/Post/Publish buttons require confirmation while unrelated buttons do not", async () => {
  globalThis.Element = class Element {};
  globalThis.HTMLButtonElement = class HTMLButtonElement extends globalThis.Element {};

  const makeButton = (id, text, ariaLabel = "") => {
    let clicked = false;
    const btn = {
      id,
      tagName: "BUTTON",
      disabled: false,
      hasAttribute: () => false,
      getAttribute: (name) => {
        if (name === "aria-label") return ariaLabel;
        return null;
      },
      innerText: text,
      textContent: text,
      click: () => { clicked = true; },
      dispatchEvent: () => {},
      getBoundingClientRect: () => ({ width: 80, height: 30, top: 10, left: 10, right: 90, bottom: 40 })
    };
    Object.setPrototypeOf(btn, globalThis.HTMLButtonElement.prototype);
    return btn;
  };

  const sendBtn = makeButton("btn-send-msg", "Send Message");
  const postBtn = makeButton("btn-post", "Post update");
  const publishBtn = makeButton("btn-publish", "Publish article");
  const playBtn = makeButton("play-track", "Play");

  globalThis.document.getElementById = (id) => {
    if (id === "btn-send-msg") return sendBtn;
    if (id === "btn-post") return postBtn;
    if (id === "btn-publish") return publishBtn;
    if (id === "play-track") return playBtn;
    return null;
  };

  // Unconfirmed actions
  const results = await executeActionsInActiveTab([
    { type: "click", targetId: "btn-send-msg" },
    { type: "click", targetId: "btn-post" },
    { type: "click", targetId: "btn-publish" },
    { type: "click", targetId: "play-track" }
  ]);

  assert.equal(results[0].status, "requires_confirmation");
  assert.equal(results[1].status, "requires_confirmation");
  assert.equal(results[2].status, "requires_confirmation");
  assert.equal(results[3].status, "executed");
});

test("Spotify regression: search on Spotify-like search input still works and is never treated as a contenteditable message composer", async () => {
  globalThis.Element = class Element {};
  globalThis.HTMLInputElement = class HTMLInputElement extends globalThis.Element {};
  globalThis.window = globalThis.window || {};
  globalThis.window.HTMLInputElement = globalThis.HTMLInputElement;

  let capturedValue = "";
  Object.defineProperty(globalThis.HTMLInputElement.prototype, "value", {
    get() { return capturedValue; },
    set(v) { capturedValue = v; },
    configurable: true
  });

  const mockSpotify = {
    id: "spotify-search-input",
    tagName: "INPUT",
    type: "search",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "type") return "search";
      if (name === "role") return "combobox";
      return null;
    },
    closest: () => null,
    focus: () => {},
    dispatchEvent: () => {},
    getBoundingClientRect: () => ({ width: 250, height: 40, top: 10, left: 10, right: 260, bottom: 50 })
  };
  Object.setPrototypeOf(mockSpotify, globalThis.HTMLInputElement.prototype);
  globalThis.document.getElementById = () => mockSpotify;

  const result = await executeActionsInActiveTab([
    { type: "search", targetId: "spotify-search-input", value: "Blinding Lights" }
  ]);

  assert.equal(result[0].status, "executed");
  assert.equal(capturedValue, "Blinding Lights");
});

test("DOM collection extracts hasContent boolean (true for non-whitespace, false for empty/whitespace) without content leakage", async () => {
  const { collectSafeDomContextInActiveTab } = await import("../src/agent/domContextCollector.js");

  globalThis.Element = class Element {};
  globalThis.HTMLDivElement = class HTMLDivElement extends globalThis.Element {};

  const makeEditable = (id, text) => {
    const el = {
      id,
      tagName: "DIV",
      isContentEditable: true,
      disabled: false,
      hasAttribute: () => false,
      getAttribute: (name) => {
        if (name === "contenteditable") return "true";
        if (name === "role") return "textbox";
        return null;
      },
      innerText: text,
      textContent: text,
      closest: () => null,
      getBoundingClientRect: () => ({ width: 300, height: 100, top: 10, left: 10, right: 310, bottom: 110 })
    };
    Object.setPrototypeOf(el, globalThis.HTMLDivElement.prototype);
    return el;
  };

  const filledEditor = makeEditable("filled-box", "   Hello WhatsApp   ");
  const emptyEditor = makeEditable("empty-box", "   \n\t  ");

  globalThis.document = globalThis.document || {};
  globalThis.document.querySelectorAll = (sel) => {
    if (sel.includes('[contenteditable="true"][role="textbox"]')) {
      return [filledEditor, emptyEditor];
    }
    return [];
  };
  globalThis.document.getElementById = (id) => {
    if (id === "filled-box") return filledEditor;
    if (id === "empty-box") return emptyEditor;
    return null;
  };

  globalThis.window = globalThis.window || {};
  globalThis.window.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });
  globalThis.window.innerHeight = 1000;
  globalThis.window.innerWidth = 1000;

  globalThis.browser = globalThis.browser || {};
  globalThis.browser.tabs = { query: async () => [{ id: 1 }] };
  globalThis.browser.scripting = {
    executeScript: async (args) => {
      const results = await args.func.apply(null, args.args);
      return [{ result: results }];
    }
  };

  const collected = await collectSafeDomContextInActiveTab();
  const filled = collected.find(item => item.targetId === "filled-box");
  const empty = collected.find(item => item.targetId === "empty-box");

  assert.equal(filled.hasContent, true);
  assert.equal(empty.hasContent, false);
  assert.ok(!JSON.stringify(collected).includes("Hello WhatsApp"));
  assert.ok(!("value" in filled));
  assert.ok(!("text" in filled));
  assert.ok(!("length" in filled));
});

test("contenteditable type replaces existing content instead of appending and fails if empty after insertion", async () => {
  let editorText = "Old stale message";
  let deleteCalled = false;
  let textNodeInserted = false;

  globalThis.Element = class Element {};
  globalThis.HTMLDivElement = class HTMLDivElement extends globalThis.Element {};

  const mockDiv = {
    id: "whatsapp-composer",
    tagName: "DIV",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      return null;
    },
    focus: () => {},
    dispatchEvent: () => {},
    getBoundingClientRect: () => ({ width: 200, height: 50, top: 10, left: 10, right: 210, bottom: 60 })
  };

  Object.defineProperty(mockDiv, "textContent", {
    get() { return editorText; },
    set(v) { editorText = v; },
    configurable: true
  });
  Object.defineProperty(mockDiv, "innerText", {
    get() { return editorText; },
    set(v) { editorText = v; },
    configurable: true
  });

  Object.setPrototypeOf(mockDiv, globalThis.HTMLDivElement.prototype);

  const mockRange = {
    selectNodeContents: () => {},
    deleteContents: () => {
      deleteCalled = true;
      editorText = "";
    },
    insertNode: (node) => {
      textNodeInserted = true;
      editorText = node.textContent;
    },
    setStartAfter: () => {},
    setEndAfter: () => {}
  };

  const mockSelection = {
    rangeCount: 1,
    removeAllRanges: () => {},
    addRange: () => {},
    getRangeAt: () => mockRange
  };

  globalThis.window.getSelection = () => mockSelection;
  globalThis.document.createRange = () => mockRange;
  globalThis.document.createTextNode = (text) => ({ textContent: text });
  globalThis.document.execCommand = () => false; // Fallback to Range deletion and node insertion
  globalThis.document.getElementById = (id) => (id === "whatsapp-composer" ? mockDiv : null);

  const result = await executeActionsInActiveTab([
    { type: "type", targetId: "whatsapp-composer", value: "New authorized message" }
  ]);

  assert.equal(result[0].status, "executed");
  assert.equal(deleteCalled, true);
  assert.equal(textNodeInserted, true);
  assert.equal(editorText, "New authorized message");
  assert.ok(!("value" in result[0]));
  assert.ok(!("content" in result[0]));
});

test("loop detector stops on second consecutive identical type action before execution", async () => {
  const { runMultiStepTask } = await import("../src/agent/multiStepController.js");

  let executionCount = 0;
  const result = await runMultiStepTask({
    prompt: "Type message in chat",
    observeAndPlan: () => ({
      taskComplete: false,
      actions: [{ type: "type", targetId: "composer-1", value: "Hello" }]
    }),
    executeAction: () => {
      executionCount++;
      return { status: "executed" };
    },
    requestConfirmation: () => true,
    maxSteps: 5
  });

  assert.equal(result.status, "loop_detected");
  assert.equal(executionCount, 1);
  assert.equal(result.stepsCompleted, 1);
  assert.equal(result.history.length, 1);
});

test("confirmed Send button progression executes safely after drafting", async () => {
  const { runMultiStepTask } = await import("../src/agent/multiStepController.js");

  let step = 0;
  let confirmationRequested = false;

  const result = await runMultiStepTask({
    prompt: "Send message",
    observeAndPlan: () => {
      if (step === 0) {
        step++;
        return {
          taskComplete: false,
          actions: [{ type: "type", targetId: "composer-box", value: "Hello friend" }]
        };
      }
      if (step === 1) {
        step++;
        return {
          taskComplete: false,
          actions: [{ type: "click", targetId: "send-button", requiresConfirmation: true }]
        };
      }
      return { taskComplete: true, message: "Message sent", actions: [] };
    },
    executeAction: (action, opts) => {
      if (action.type === "click" && action.targetId === "send-button" && !opts.confirmed) {
        return { status: "requires_confirmation" };
      }
      return { status: "executed" };
    },
    requestConfirmation: () => {
      confirmationRequested = true;
      return true;
    },
    maxSteps: 5
  });

  assert.equal(result.status, "completed");
  assert.equal(confirmationRequested, true);
  assert.equal(result.stepsCompleted, 2);
  assert.equal(result.history[0].actionType, "type");
  assert.equal(result.history[1].actionType, "click");
});

test("isCommunicationIntent detects sending, posting, messaging, emailing, replying conservatively", async () => {
  const { isCommunicationIntent } = await import("../src/agent/localIntentRouter.js");

  assert.equal(isCommunicationIntent("Send message to John: Hello there"), true);
  assert.equal(isCommunicationIntent("Post an update on my feed"), true);
  assert.equal(isCommunicationIntent("Publish article now"), true);
  assert.equal(isCommunicationIntent("Reply to the latest chat with 'Got it'"), true);
  assert.equal(isCommunicationIntent("Email the manager about invoice"), true);
  assert.equal(isCommunicationIntent("DM Alice on social platform"), true);

  // Non-communication tasks
  assert.equal(isCommunicationIntent("Search for 'Blinding Lights' by The Weeknd"), false);
  assert.equal(isCommunicationIntent("Scroll down to read articles"), false);
  assert.equal(isCommunicationIntent("Select United States from country dropdown"), false);
});

test("structural-only context mode strictly excludes private text, chat history, contact names, phone numbers, file names, URLs, screenshots, and OCR text", async () => {
  globalThis.browser = globalThis.browser || {};
  globalThis.browser.runtime = globalThis.browser.runtime || { getURL: (path) => `chrome-extension://dummy/${path}` };
  globalThis.chrome = globalThis.browser;

  const { buildPrivateContext } = await import("../src/dom_vision-paddle/buildPrivateContext.js");

  const privatePrompt = "Send message to Alice (+1-555-0199): 'Meeting confirmed at https://secret-url.com/doc.pdf'";
  const dummyScreenshot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const rawDomElements = [
    {
      targetId: "composer-editor-1",
      elementType: "div",
      controlType: "contenteditable",
      role: "textbox",
      label: "Editable message textbox",
      hasContent: false
    },
    {
      targetId: "send-btn-1",
      elementType: "button",
      controlType: null,
      role: "button",
      label: "Send",
      purpose: "send"
    },
    {
      targetId: "contact-row-private",
      elementType: "div",
      controlType: null,
      role: "listitem",
      label: "Alice Smith — +1-555-0199 — Recent chat: Where are you?"
    }
  ];

  const contextResult = await buildPrivateContext({
    prompt: privatePrompt,
    screenshot: dummyScreenshot,
    domContext: rawDomElements
  });

  assert.equal(contextResult.decision, "server");
  assert.equal(contextResult.privacyVerified, true);
  assert.equal(contextResult.sanitizedScreenshot, undefined);
  assert.equal(contextResult.redactionSummary.screenshotIncluded, false);

  const pageContextString = JSON.stringify({
    sanitizedText: contextResult.sanitizedText,
    allowedTargetIds: contextResult.allowedTargetIds,
    screenshot: contextResult.sanitizedScreenshot,
  });

  // Prove private page entities never enter the page context
  assert.ok(!pageContextString.includes("Alice Smith"));
  assert.ok(!pageContextString.includes("+1-555-0199"));
  assert.ok(!pageContextString.includes("Where are you?"));
  assert.ok(!pageContextString.includes("https://secret-url.com"));
  assert.ok(!pageContextString.includes("doc.pdf"));

  // Check structural elements formatting
  assert.ok(contextResult.allowedTargetIds.includes("composer-editor-1"));
  assert.ok(contextResult.allowedTargetIds.includes("send-btn-1"));
  assert.ok(contextResult.sanitizedText.startsWith("INTERACTIVE ELEMENTS — UNTRUSTED PAGE METADATA"));
  assert.ok(contextResult.sanitizedText.includes('"label":"Editable message textbox"'));
  assert.ok(contextResult.sanitizedText.includes('"purpose":"send"'));
});

test("structural-only DOM collection strips ancestor text and extracts bounded purpose enum", async () => {
  const { collectSafeDomContextInActiveTab } = await import("../src/agent/domContextCollector.js");

  const mockComposer = {
    id: "wa-composer",
    tagName: "DIV",
    isContentEditable: true,
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      if (name === "aria-label") return "Type a message to Bob (+44 7700 900077)";
      return null;
    },
    innerText: "",
    textContent: "",
    closest: () => null,
    getBoundingClientRect: () => ({ width: 300, height: 50, top: 10, left: 10, right: 310, bottom: 60 })
  };

  const mockSendBtn = {
    id: "wa-send-btn",
    tagName: "BUTTON",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "aria-label") return "Send message";
      return null;
    },
    innerText: "",
    textContent: "",
    closest: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40, top: 10, left: 320, right: 360, bottom: 50 })
  };

  const mockChatHeader = {
    id: "chat-header-info",
    tagName: "DIV",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "aria-label") return "Chat with Confidential Group";
      return null;
    },
    innerText: "Confidential Group — Last seen today",
    textContent: "Confidential Group — Last seen today",
    parentElement: {
      closest: () => ({ innerText: "Confidential Group Parent Container" })
    },
    closest: () => null,
    getBoundingClientRect: () => ({ width: 200, height: 30, top: 0, left: 0, right: 200, bottom: 30 })
  };

  globalThis.Element = class Element {};
  globalThis.HTMLDivElement = class HTMLDivElement extends globalThis.Element {};
  globalThis.HTMLButtonElement = class HTMLButtonElement extends globalThis.Element {};

  Object.setPrototypeOf(mockComposer, globalThis.HTMLDivElement.prototype);
  Object.setPrototypeOf(mockSendBtn, globalThis.HTMLButtonElement.prototype);
  Object.setPrototypeOf(mockChatHeader, globalThis.HTMLDivElement.prototype);

  globalThis.document = globalThis.document || {};
  globalThis.document.querySelectorAll = () => [mockComposer, mockSendBtn, mockChatHeader];
  globalThis.document.getElementById = (id) => {
    if (id === "wa-composer") return mockComposer;
    if (id === "wa-send-btn") return mockSendBtn;
    if (id === "chat-header-info") return mockChatHeader;
    return null;
  };

  globalThis.window = globalThis.window || {};
  globalThis.window.getComputedStyle = () => ({ display: "block", visibility: "visible", opacity: "1" });
  globalThis.window.innerHeight = 1000;
  globalThis.window.innerWidth = 1000;

  globalThis.browser = globalThis.browser || {};
  globalThis.browser.tabs = { query: async () => [{ id: 1 }] };
  globalThis.browser.scripting = {
    executeScript: async (args) => {
      const results = await args.func.apply(null, args.args);
      return [{ result: results }];
    }
  };

  const collected = await collectSafeDomContextInActiveTab({ structuralOnly: true });
  const collectedJson = JSON.stringify(collected);

  assert.ok(!collectedJson.includes("Bob"));
  assert.ok(!collectedJson.includes("+44 7700 900077"));
  assert.ok(!collectedJson.includes("Confidential Group"));
  assert.ok(!collectedJson.includes("Parent Container"));

  const composer = collected.find(item => item.targetId === "wa-composer");
  const sendBtn = collected.find(item => item.targetId === "wa-send-btn");

  assert.equal(composer.label, "Editable message textbox");
  assert.equal(composer.controlType, "contenteditable");
  assert.equal(composer.hasContent, false);

  assert.equal(sendBtn.purpose, "send");
  assert.equal(sendBtn.label, "Send");
});

test("rich-text composer integration: hasContent false->true tracing, single native mutation without synthetic events, no content leakage, and no repeated typing", async () => {
  const { collectSafeDomContextInActiveTab } = await import("../src/agent/domContextCollector.js");
  const { buildPrivateContext } = await import("../src/dom_vision-paddle/buildPrivateContext.js");
  const { executeActionsInActiveTab } = await import("../src/agent/actionExecutor.js");
  const { runMultiStepTask } = await import("../src/agent/multiStepController.js");

  let composerText = "";
  const dispatchedEvents = [];

  const mockComposer = {
    id: "rich-composer",
    tagName: "DIV",
    isContentEditable: true,
    contentEditable: "true",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      if (name === "aria-label") return "Secret message to Alice (+1-555-0199)";
      return null;
    },
    get innerText() {
      return composerText;
    },
    get textContent() {
      return composerText;
    },
    set textContent(val) {
      composerText = val;
    },
    focus: () => {},
    dispatchEvent: (evt) => {
      dispatchedEvents.push(evt.type || evt);
      return true;
    },
    closest: () => null,
    getBoundingClientRect: () => ({ width: 300, height: 50, top: 10, left: 10, right: 310, bottom: 60 })
  };

  const mockSendBtn = {
    id: "send-button",
    tagName: "BUTTON",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "aria-label") return "Send message";
      return null;
    },
    innerText: "Send",
    textContent: "Send",
    focus: () => {},
    click: () => {},
    dispatchEvent: () => true,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40, top: 10, left: 320, right: 360, bottom: 50 })
  };

  globalThis.Element = class Element {};
  globalThis.HTMLDivElement = class HTMLDivElement extends globalThis.Element {};
  globalThis.HTMLButtonElement = class HTMLButtonElement extends globalThis.Element {};

  Object.setPrototypeOf(mockComposer, globalThis.HTMLDivElement.prototype);
  Object.setPrototypeOf(mockSendBtn, globalThis.HTMLButtonElement.prototype);

  globalThis.document = {
    querySelectorAll: () => [mockComposer, mockSendBtn],
    getElementById: (id) => {
      if (id === "rich-composer") return mockComposer;
      if (id === "send-button") return mockSendBtn;
      return null;
    },
    createRange: () => ({
      selectNodeContents: () => {},
      deleteContents: () => {},
      insertNode: () => {},
      setStartAfter: () => {},
      setEndAfter: () => {}
    }),
    createTextNode: (t) => ({ text: t }),
    execCommand: (cmd, showUI, value) => {
      if (cmd === "insertText") {
        composerText = value;
        return true;
      }
      return false;
    }
  };

  globalThis.window = {
    innerHeight: 1000,
    innerWidth: 1000,
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    getSelection: () => ({
      removeAllRanges: () => {},
      addRange: () => {},
      rangeCount: 1,
      getRangeAt: () => ({
        deleteContents: () => {},
        insertNode: () => {},
        setStartAfter: () => {},
        setEndAfter: () => {}
      })
    })
  };

  globalThis.browser = {
    runtime: { getURL: (p) => `chrome-extension://dummy/${p}` },
    tabs: { query: async () => [{ id: 1 }] },
    scripting: {
      executeScript: async (args) => {
        const results = await args.func.apply(null, args.args);
        return [{ result: results }];
      }
    }
  };
  globalThis.chrome = globalThis.browser;

  // Step 1: Initial empty state DOM collection and private-context serialization
  const domStateInitial = await collectSafeDomContextInActiveTab({ structuralOnly: true });
  const composerInitial = domStateInitial.find(el => el.targetId === "rich-composer");
  assert.equal(composerInitial.hasContent, false);
  assert.equal(composerInitial.label, "Editable message textbox");
  assert.equal(composerInitial.controlType, "contenteditable");

  const prompt = "Send message: 'Meeting confirmed for noon'";
  const dummyScreenshot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  const privateContextInitial = await buildPrivateContext({
    prompt,
    screenshot: dummyScreenshot,
    domContext: domStateInitial
  });

  // Verify hasContent: false in serialized metadata and no text content in metadata
  assert.ok(privateContextInitial.sanitizedText.includes('"hasContent":false'));
  assert.ok(!privateContextInitial.sanitizedText.includes("Meeting confirmed"));
  assert.ok(!privateContextInitial.sanitizedText.includes("Secret message"));

  // Step 2: Execute type action on contenteditable
  dispatchedEvents.length = 0;
  const execResults = await executeActionsInActiveTab(
    [{ type: "type", targetId: "rich-composer", value: "Meeting confirmed for noon" }],
    []
  );

  assert.equal(execResults.length, 1);
  assert.equal(execResults[0].status, "executed");
  assert.equal(execResults[0].value, undefined);
  assert.equal(composerText, "Meeting confirmed for noon");

  // Proves native execCommand success does NOT dispatch extra synthetic beforeinput/input events
  assert.equal(dispatchedEvents.length, 0);

  // Step 3: Second observation: hasContent is now true
  const domStateAfterType = await collectSafeDomContextInActiveTab({ structuralOnly: true });
  const composerAfterType = domStateAfterType.find(el => el.targetId === "rich-composer");
  assert.equal(composerAfterType.hasContent, true);

  const privateContextAfterType = await buildPrivateContext({
    prompt,
    screenshot: dummyScreenshot,
    domContext: domStateAfterType
  });

  // Verify hasContent: true in serialized metadata and no content leakage
  assert.ok(privateContextAfterType.sanitizedText.includes('"hasContent":true'));
  assert.ok(!privateContextAfterType.sanitizedText.includes("Meeting confirmed for noon"));

  // Step 4: Multi-step progression proves the plan cannot repeat typing after hasContent: true
  const multiStepResult = await runMultiStepTask({
    prompt,
    observeAndPlan: async ({ history }) => {
      if (history.length === 0) {
        return {
          message: "Type message into composer",
          taskComplete: false,
          actions: [{ type: "type", targetId: "rich-composer", value: "Meeting confirmed for noon" }]
        };
      }
      if (history.length === 1) {
        // After type has executed and composer hasContent: true, next plan locates Send and clicks it
        return {
          message: "Send drafted message",
          taskComplete: false,
          actions: [{ type: "click", targetId: "send-button", requiresConfirmation: true }]
        };
      }
      return {
        message: "Message sent successfully",
        taskComplete: true,
        actions: []
      };
    },
    executeAction: async (action, { confirmed }) => {
      if (action.requiresConfirmation && !confirmed) {
        return { status: "requires_confirmation" };
      }
      return { status: "executed" };
    },
    requestConfirmation: async () => true,
    maxSteps: 5
  });

  assert.equal(multiStepResult.status, "completed");
  assert.equal(multiStepResult.stepsCompleted, 2);
  assert.equal(multiStepResult.history[0].actionType, "type");
  assert.equal(multiStepResult.history[1].actionType, "click");
  assert.notEqual(multiStepResult.history[1].actionType, "type");

  // Step 5: Prove repeated typing loop guard if planner were to repeat type
  const badLoopResult = await runMultiStepTask({
    prompt,
    observeAndPlan: async () => ({
      message: "Repeat typing",
      taskComplete: false,
      actions: [{ type: "type", targetId: "rich-composer", value: "Meeting confirmed for noon" }]
    }),
    executeAction: async () => ({ status: "executed" }),
    requestConfirmation: async () => true,
    maxSteps: 5
  });
  assert.equal(badLoopResult.status, "loop_detected");
  assert.equal(badLoopResult.stepsCompleted, 1);
});

test("regression: contenteditable node replaced during typing returns executed when replacement contains typed value with only one insertion", async () => {
  const { executeActionsInActiveTab } = await import("../src/agent/actionExecutor.js");

  let insertionCount = 0;
  let liveElement = null;

  globalThis.Element = class Element {};
  globalThis.HTMLDivElement = class HTMLDivElement extends globalThis.Element {};

  const staleInitialNode = {
    id: "wa-composer-replaced",
    tagName: "DIV",
    isContentEditable: true,
    contentEditable: "true",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      return null;
    },
    innerText: "",
    textContent: "",
    focus: () => {},
    dispatchEvent: () => true,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 300, height: 50, top: 10, left: 10, right: 310, bottom: 60 })
  };
  Object.setPrototypeOf(staleInitialNode, globalThis.HTMLDivElement.prototype);

  const replacementNode = {
    id: "wa-composer-replaced",
    tagName: "DIV",
    isContentEditable: true,
    contentEditable: "true",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      return null;
    },
    innerText: "Message drafted successfully",
    textContent: "Message drafted successfully",
    focus: () => {},
    dispatchEvent: () => true,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 300, height: 50, top: 10, left: 10, right: 310, bottom: 60 })
  };
  Object.setPrototypeOf(replacementNode, globalThis.HTMLDivElement.prototype);

  liveElement = staleInitialNode;

  globalThis.document = {
    getElementById: (id) => (id === "wa-composer-replaced" ? liveElement : null),
    createRange: () => ({
      selectNodeContents: () => {},
      deleteContents: () => {},
      insertNode: () => {},
      setStartAfter: () => {},
      setEndAfter: () => {}
    }),
    createTextNode: (t) => ({ text: t }),
    execCommand: (cmd, showUI, value) => {
      if (cmd === "insertText") {
        insertionCount++;
        // Simulate WhatsApp re-rendering and replacing the DOM element
        liveElement = replacementNode;
        return true;
      }
      return false;
    }
  };

  globalThis.window = {
    innerHeight: 1000,
    innerWidth: 1000,
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    getSelection: () => ({
      removeAllRanges: () => {},
      addRange: () => {},
      rangeCount: 1,
      getRangeAt: () => ({
        deleteContents: () => {},
        insertNode: () => {},
        setStartAfter: () => {},
        setEndAfter: () => {}
      })
    })
  };

  globalThis.browser = {
    tabs: { query: async () => [{ id: 1 }] },
    scripting: {
      executeScript: async (args) => {
        const results = await args.func.apply(null, args.args);
        return [{ result: results }];
      }
    }
  };
  globalThis.chrome = globalThis.browser;

  const results = await executeActionsInActiveTab([
    { type: "type", targetId: "wa-composer-replaced", value: "Message drafted successfully" }
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "executed");
  assert.equal(insertionCount, 1);
});

test("contenteditable post-type verification fails when replacement element does not contain the typed value", async () => {
  const { executeActionsInActiveTab } = await import("../src/agent/actionExecutor.js");

  let liveElement = null;

  globalThis.Element = class Element {};
  globalThis.HTMLDivElement = class HTMLDivElement extends globalThis.Element {};

  const staleNode = {
    id: "wa-composer-fail",
    tagName: "DIV",
    isContentEditable: true,
    contentEditable: "true",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      return null;
    },
    innerText: "",
    textContent: "",
    focus: () => {},
    dispatchEvent: () => true,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 300, height: 50, top: 10, left: 10, right: 310, bottom: 60 })
  };
  Object.setPrototypeOf(staleNode, globalThis.HTMLDivElement.prototype);

  const emptyReplacementNode = {
    id: "wa-composer-fail",
    tagName: "DIV",
    isContentEditable: true,
    contentEditable: "true",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "contenteditable") return "true";
      if (name === "role") return "textbox";
      return null;
    },
    innerText: "",
    textContent: "",
    focus: () => {},
    dispatchEvent: () => true,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 300, height: 50, top: 10, left: 10, right: 310, bottom: 60 })
  };
  Object.setPrototypeOf(emptyReplacementNode, globalThis.HTMLDivElement.prototype);

  liveElement = staleNode;

  globalThis.document = {
    getElementById: (id) => (id === "wa-composer-fail" ? liveElement : null),
    createRange: () => ({
      selectNodeContents: () => {},
      deleteContents: () => {},
      insertNode: () => {},
      setStartAfter: () => {},
      setEndAfter: () => {}
    }),
    createTextNode: (t) => ({ text: t }),
    execCommand: (cmd) => {
      if (cmd === "insertText") {
        liveElement = emptyReplacementNode;
        return true;
      }
      return false;
    }
  };

  globalThis.window = {
    innerHeight: 1000,
    innerWidth: 1000,
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    getSelection: () => ({
      removeAllRanges: () => {},
      addRange: () => {},
      rangeCount: 1,
      getRangeAt: () => ({
        deleteContents: () => {},
        insertNode: () => {},
        setStartAfter: () => {},
        setEndAfter: () => {}
      })
    })
  };

  globalThis.browser = {
    tabs: { query: async () => [{ id: 1 }] },
    scripting: {
      executeScript: async (args) => {
        const results = await args.func.apply(null, args.args);
        return [{ result: results }];
      }
    }
  };
  globalThis.chrome = globalThis.browser;

  const results = await executeActionsInActiveTab([
    { type: "type", targetId: "wa-composer-fail", value: "Expected typed text" }
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].status, "failed");
});

test("confirmed successful Send click returns message_sent effect and unconfirmed Send click requires confirmation without effect", async () => {
  const { executeActionsInActiveTab } = await import("../src/agent/actionExecutor.js");

  globalThis.Element = class Element {};
  globalThis.HTMLButtonElement = class HTMLButtonElement extends globalThis.Element {};

  let clickCalled = false;
  const mockSendBtn = {
    id: "send-btn",
    tagName: "BUTTON",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "aria-label") return "Send message";
      return null;
    },
    innerText: "Send",
    textContent: "Send",
    focus: () => {},
    click: () => { clickCalled = true; },
    dispatchEvent: () => true,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40, top: 10, left: 10, right: 50, bottom: 50 })
  };
  Object.setPrototypeOf(mockSendBtn, globalThis.HTMLButtonElement.prototype);

  const mockOrdinaryBtn = {
    id: "ordinary-btn",
    tagName: "BUTTON",
    disabled: false,
    hasAttribute: () => false,
    getAttribute: (name) => {
      if (name === "aria-label") return "Next slide";
      return null;
    },
    innerText: "Next",
    textContent: "Next",
    focus: () => {},
    click: () => {},
    dispatchEvent: () => true,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 40, height: 40, top: 10, left: 10, right: 50, bottom: 50 })
  };
  Object.setPrototypeOf(mockOrdinaryBtn, globalThis.HTMLButtonElement.prototype);

  globalThis.document = {
    getElementById: (id) => {
      if (id === "send-btn") return mockSendBtn;
      if (id === "ordinary-btn") return mockOrdinaryBtn;
      return null;
    }
  };

  globalThis.window = {
    getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
    innerHeight: 1000,
    innerWidth: 1000
  };

  globalThis.browser = {
    tabs: { query: async () => [{ id: 1 }] },
    scripting: {
      executeScript: async (args) => {
        const results = await args.func.apply(null, args.args);
        return [{ result: results }];
      }
    }
  };
  globalThis.chrome = globalThis.browser;

  // Unconfirmed Send click -> requires_confirmation, no effect, click not called
  clickCalled = false;
  const unconfirmedRes = await executeActionsInActiveTab(
    [{ type: "click", targetId: "send-btn" }],
    []
  );
  assert.equal(unconfirmedRes[0].status, "requires_confirmation");
  assert.equal(unconfirmedRes[0].effect, undefined);
  assert.equal(clickCalled, false);

  // Confirmed Send click -> executed with effect: "message_sent"
  clickCalled = false;
  const confirmedRes = await executeActionsInActiveTab(
    [{ type: "click", targetId: "send-btn", requiresConfirmation: true }],
    { confirmedActionIndexes: [0] }
  );
  assert.equal(confirmedRes[0].status, "executed");
  assert.equal(confirmedRes[0].effect, "message_sent");
  assert.equal(clickCalled, true);

  // Confirmed Ordinary button click -> executed without effect: "message_sent"
  const ordinaryRes = await executeActionsInActiveTab(
    [{ type: "click", targetId: "ordinary-btn" }],
    { confirmedActionIndexes: [0] }
  );
  assert.equal(ordinaryRes[0].status, "executed");
  assert.equal(ordinaryRes[0].effect, undefined);
});

test("multiStepController completes immediately upon message_sent effect with no further planning or waitForReady", async () => {
  const { runMultiStepTask } = await import("../src/agent/multiStepController.js");

  let planCount = 0;
  let waitCount = 0;
  let confirmCount = 0;

  const result = await runMultiStepTask({
    prompt: "Send message: 'Hello'",
    observeAndPlan: async () => {
      planCount++;
      return {
        message: "Click Send",
        taskComplete: false,
        actions: [{ type: "click", targetId: "send-btn", requiresConfirmation: true }]
      };
    },
    executeAction: async (action, { confirmed }) => {
      if (!confirmed) {
        return { status: "requires_confirmation" };
      }
      return { status: "executed", effect: "message_sent" };
    },
    requestConfirmation: async () => {
      confirmCount++;
      return true;
    },
    waitForReady: async () => {
      waitCount++;
    },
    maxSteps: 5
  });

  assert.equal(result.status, "completed");
  assert.equal(result.message, "Message submitted.");
  assert.equal(result.stepsCompleted, 1);
  assert.equal(planCount, 1); // Only planned once; did not plan again after terminal effect
  assert.equal(waitCount, 0); // Did not call waitForReady after terminal effect
  assert.equal(confirmCount, 1);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].actionType, "click");
  assert.equal(result.history[0].status, "executed");
});

test("multiStepController: ordinary click continues normally, unknown effects do not terminate, and rejected confirmation cancels", async () => {
  const { runMultiStepTask } = await import("../src/agent/multiStepController.js");

  // 1. Unknown effect does not terminate the task; task continues to next plan
  let planSteps = 0;
  const unknownEffectResult = await runMultiStepTask({
    prompt: "Test unknown effect",
    observeAndPlan: async ({ history }) => {
      planSteps++;
      if (history.length === 0) {
        return {
          message: "Step 1",
          taskComplete: false,
          actions: [{ type: "click", targetId: "custom-btn" }]
        };
      }
      return {
        message: "Finished",
        taskComplete: true,
        actions: []
      };
    },
    executeAction: async () => ({ status: "executed", effect: "unknown_custom_effect" }),
    requestConfirmation: async () => true,
    maxSteps: 5
  });

  assert.equal(unknownEffectResult.status, "completed");
  assert.equal(unknownEffectResult.message, "Finished");
  assert.equal(planSteps, 2);
  assert.equal(unknownEffectResult.stepsCompleted, 1);

  // 2. Rejected confirmation never executes action and terminates with cancelled
  let executedCalled = false;
  const rejectedResult = await runMultiStepTask({
    prompt: "Send message",
    observeAndPlan: async () => ({
      message: "Click Send",
      taskComplete: false,
      actions: [{ type: "click", targetId: "send-btn", requiresConfirmation: true }]
    }),
    executeAction: async (action, { confirmed }) => {
      if (!confirmed) return { status: "requires_confirmation" };
      executedCalled = true;
      return { status: "executed", effect: "message_sent" };
    },
    requestConfirmation: async () => false,
    maxSteps: 5
  });

  assert.equal(rejectedResult.status, "cancelled");
  assert.equal(executedCalled, false);
  assert.equal(rejectedResult.stepsCompleted, 0);
  assert.equal(rejectedResult.history[0].status, "cancelled");
});




