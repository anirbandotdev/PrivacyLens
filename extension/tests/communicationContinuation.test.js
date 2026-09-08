import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { enforceCommunicationContinuation } from "../src/agent/communicationContinuation.js";

describe("enforceCommunicationContinuation", () => {
  const defaultHistory = [
    { type: "type", effect: "message_composed" }
  ];

  const defaultDomContext = [
    { targetId: "composer1", hasContent: true, role: "textbox" },
    { targetId: "send_btn", purpose: "send" }
  ];

  const defaultPlan = {
    message: "I will type the message.",
    taskComplete: false,
    actions: [{ type: "type", targetId: "composer1", value: "Hello" }]
  };

  test("converts repeated type action to confirmed send when conditions are met", () => {
    const result = enforceCommunicationContinuation({
      prompt: "Send a message saying hello",
      history: defaultHistory,
      domContext: defaultDomContext,
      plan: defaultPlan
    });

    assert.notEqual(result, defaultPlan);
    assert.strictEqual(result.taskComplete, false);
    assert.ok(result.message.includes("Confirmation is required before sending"));
    assert.strictEqual(result.actions.length, 1);
    assert.deepEqual(result.actions[0], {
      type: "click",
      targetId: "send_btn",
      requiresConfirmation: true
    });
  });

  test("returns original plan if missing send control", () => {
    const domContext = [
      { targetId: "composer1", hasContent: true, role: "textbox" }
    ];
    const result = enforceCommunicationContinuation({
      prompt: "Send a message saying hello",
      history: defaultHistory,
      domContext: domContext,
      plan: defaultPlan
    });

    assert.strictEqual(result, defaultPlan);
  });

  test("returns original plan if multiple send controls present", () => {
    const domContext = [
      { targetId: "composer1", hasContent: true, role: "textbox" },
      { targetId: "send_btn1", purpose: "send" },
      { targetId: "send_btn2", purpose: "reply" }
    ];
    const result = enforceCommunicationContinuation({
      prompt: "Send a message saying hello",
      history: defaultHistory,
      domContext: domContext,
      plan: defaultPlan
    });

    assert.strictEqual(result, defaultPlan);
  });

  test("returns original plan if negated request (don't send)", () => {
    const result = enforceCommunicationContinuation({
      prompt: "Draft a message but don't send it",
      history: defaultHistory,
      domContext: defaultDomContext,
      plan: defaultPlan
    });

    assert.strictEqual(result, defaultPlan);
  });

  test("returns original plan if history lacks message_composed", () => {
    const history = [
      { type: "click", effect: "button_clicked" }
    ];
    const result = enforceCommunicationContinuation({
      prompt: "Send a message",
      history: history,
      domContext: defaultDomContext,
      plan: defaultPlan
    });

    assert.strictEqual(result, defaultPlan);
  });

  test("returns original plan if dom lacks hasContent composer", () => {
    const domContext = [
      { targetId: "composer1", hasContent: false, role: "textbox" },
      { targetId: "send_btn", purpose: "send" }
    ];
    const result = enforceCommunicationContinuation({
      prompt: "Send a message",
      history: defaultHistory,
      domContext: domContext,
      plan: defaultPlan
    });

    assert.strictEqual(result, defaultPlan);
  });

  test("returns original plan for unrelated intent (Spotify search)", () => {
    const plan = {
      message: "Searching Spotify",
      taskComplete: false,
      actions: [{ type: "type", targetId: "searchbox", value: "song" }]
    };
    const result = enforceCommunicationContinuation({
      prompt: "Play a song on Spotify",
      history: [{ type: "click", effect: "button_clicked" }],
      domContext: [{ targetId: "searchbox", hasContent: false }],
      plan: plan
    });

    assert.strictEqual(result, plan);
  });
});
