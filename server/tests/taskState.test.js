import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskState } from "../src/validation/taskState.js";

describe("normalizeTaskState", () => {
  it("returns undefined when taskState is undefined", () => {
    assert.equal(normalizeTaskState(undefined), undefined);
  });

  it("normalizes valid initial taskState at step 0", () => {
    const validState = {
      stepIndex: 0,
      history: [],
    };
    const result = normalizeTaskState(validState);
    assert.deepEqual(result, {
      stepIndex: 0,
      history: [],
    });
  });

  it("normalizes valid multi-step taskState with all allowed action types", () => {
    const validState = {
      stepIndex: 6,
      history: [
        { stepIndex: 0, actionType: "click", status: "executed" },
        { stepIndex: 1, actionType: "type", status: "executed" },
        { stepIndex: 2, actionType: "scroll", status: "executed" },
        { stepIndex: 3, actionType: "focus", status: "executed" },
        { stepIndex: 4, actionType: "select", status: "executed" },
        { stepIndex: 5, actionType: "submit_search", status: "executed" },
      ],
    };
    const result = normalizeTaskState(validState);
    assert.deepEqual(result, validState);
  });

  it("normalizes valid state at max stepIndex 9 with 9 history entries", () => {
    const history = Array.from({ length: 9 }, (_, i) => ({
      stepIndex: i,
      actionType: "click",
      status: "executed",
    }));
    const result = normalizeTaskState({ stepIndex: 9, history });
    assert.equal(result.stepIndex, 9);
    assert.equal(result.history.length, 9);
  });

  // Rejection tests: non-object / primitives
  it("rejects null", () => {
    assert.throws(() => normalizeTaskState(null), /Invalid task state\./);
  });

  it("rejects strings, numbers, booleans, arrays", () => {
    assert.throws(() => normalizeTaskState("state"), /Invalid task state\./);
    assert.throws(() => normalizeTaskState(123), /Invalid task state\./);
    assert.throws(() => normalizeTaskState(true), /Invalid task state\./);
    assert.throws(() => normalizeTaskState([]), /Invalid task state\./);
  });

  // Rejection tests: stepIndex bounds and types
  it("rejects stepIndex < 0", () => {
    assert.throws(() => normalizeTaskState({ stepIndex: -1, history: [] }), /Invalid task state\./);
  });

  it("rejects stepIndex > 9", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      stepIndex: i,
      actionType: "click",
      status: "executed",
    }));
    assert.throws(() => normalizeTaskState({ stepIndex: 10, history }), /Invalid task state\./);
  });

  it("rejects non-integer stepIndex", () => {
    assert.throws(() => normalizeTaskState({ stepIndex: 1.5, history: [] }), /Invalid task state\./);
    assert.throws(() => normalizeTaskState({ stepIndex: "0", history: [] }), /Invalid task state\./);
  });

  // Rejection tests: history length vs stepIndex mismatch
  it("rejects history length not matching stepIndex", () => {
    assert.throws(
      () => normalizeTaskState({ stepIndex: 1, history: [] }),
      /Invalid task state\./
    );
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 0,
          history: [{ stepIndex: 0, actionType: "click", status: "executed" }],
        }),
      /Invalid task state\./
    );
  });

  // Rejection tests: non-sequential history
  it("rejects non-sequential history stepIndex", () => {
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 2,
          history: [
            { stepIndex: 0, actionType: "click", status: "executed" },
            { stepIndex: 2, actionType: "click", status: "executed" },
          ],
        }),
      /Invalid task state\./
    );
  });

  // Rejection tests: invalid action types
  it("rejects unsupported action types", () => {
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 1,
          history: [{ stepIndex: 0, actionType: "hover", status: "executed" }],
        }),
      /Invalid task state\./
    );
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 1,
          history: [{ stepIndex: 0, actionType: "navigate", status: "executed" }],
        }),
      /Invalid task state\./
    );
  });

  // Rejection tests: invalid status
  it("rejects non-executed status", () => {
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 1,
          history: [{ stepIndex: 0, actionType: "click", status: "failed" }],
        }),
      /Invalid task state\./
    );
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 1,
          history: [{ stepIndex: 0, actionType: "click", status: "requires_confirmation" }],
        }),
      /Invalid task state\./
    );
  });

  // Rejection tests: extra keys on root object
  it("rejects extra keys on root object (e.g. targetId, value, labels, prompt)", () => {
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 0,
          history: [],
          targetId: "btn-1",
        }),
      /Invalid task state\./
    );
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 0,
          history: [],
          value: "secret",
        }),
      /Invalid task state\./
    );
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 0,
          history: [],
          screenshot: "data:image/png;base64,...",
        }),
      /Invalid task state\./
    );
  });

  // Rejection tests: extra keys on history entries
  it("rejects extra keys on history entries (e.g. targetId, value, labels, page content)", () => {
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 1,
          history: [
            {
              stepIndex: 0,
              actionType: "click",
              status: "executed",
              targetId: "btn-1",
            },
          ],
        }),
      /Invalid task state\./
    );
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 1,
          history: [
            {
              stepIndex: 0,
              actionType: "type",
              status: "executed",
              value: "password123",
            },
          ],
        }),
      /Invalid task state\./
    );
    assert.throws(
      () =>
        normalizeTaskState({
          stepIndex: 1,
          history: [
            {
              stepIndex: 0,
              actionType: "click",
              status: "executed",
              label: "Submit Button",
            },
          ],
        }),
      /Invalid task state\./
    );
  });

  // Rejection tests: generic validation error without leaked data
  it("uses a generic validation error that does not leak submitted data", () => {
    try {
      normalizeTaskState({
        stepIndex: 0,
        history: [],
        sensitiveSecretData: "super-secret-token",
      });
      assert.fail("Should have thrown");
    } catch (err) {
      assert.equal(err.message, "Invalid task state.");
      assert.ok(!err.message.includes("super-secret-token"));
      assert.ok(!err.message.includes("sensitiveSecretData"));
    }
  });
});
