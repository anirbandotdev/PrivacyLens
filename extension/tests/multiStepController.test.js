import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runMultiStepTask } from '../src/agent/multiStepController.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlan(actions, taskComplete = false, message) {
  const p = { actions, taskComplete };
  if (message !== undefined) p.message = message;
  return p;
}

function action(type, targetId = 'syn-el-1', extras = {}) {
  return { type, targetId, value: 'secret-value', label: 'Secret Label', ...extras };
}

function executed() {
  return { status: 'executed' };
}

function requiresConfirmation() {
  return { status: 'requires_confirmation' };
}

function baseOpts(overrides = {}) {
  return {
    prompt: 'test prompt',
    observeAndPlan: () => makePlan([], true),
    executeAction: () => executed(),
    requestConfirmation: () => true,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runMultiStepTask', () => {

  // === Existing behaviour tests ============================================

  it('executes two actions from three observations then completes', async () => {
    let observeCount = 0;
    const observeAndPlan = ({ stepIndex }) => {
      observeCount++;
      if (stepIndex === 0) return makePlan([action('click', 'syn-btn-1')]);
      if (stepIndex === 1) return makePlan([action('type', 'syn-input-1')]);
      return makePlan([], true);
    };

    let execCount = 0;
    const executeAction = () => { execCount++; return executed(); };

    const result = await runMultiStepTask(baseOpts({ observeAndPlan, executeAction }));

    assert.equal(result.status, 'completed');
    assert.equal(result.stepsCompleted, 2);
    assert.equal(observeCount, 3);
    assert.equal(execCount, 2);
    assert.equal(result.history.length, 2);
    assert.equal(result.history[0].actionType, 'click');
    assert.equal(result.history[1].actionType, 'type');
  });

  it('rejects plans containing multiple actions', async () => {
    const observeAndPlan = () => makePlan([
      action('click', 'syn-a'),
      action('type', 'syn-b')
    ]);

    const result = await runMultiStepTask(baseOpts({ observeAndPlan }));

    assert.equal(result.status, 'invalid_plan');
    assert.equal(result.stepsCompleted, 0);
  });

  it('continues after confirmation approval', async () => {
    let step = 0;
    const observeAndPlan = () => {
      if (step++ === 0) return makePlan([action('delete', 'syn-item-1')]);
      return makePlan([], true);
    };

    const calls = [];
    const executeAction = (_a, opts) => {
      calls.push(opts.confirmed);
      return opts.confirmed ? executed() : requiresConfirmation();
    };

    const result = await runMultiStepTask(baseOpts({ observeAndPlan, executeAction }));

    assert.equal(result.status, 'completed');
    assert.equal(result.stepsCompleted, 1);
    assert.deepEqual(calls, [false, true]);
  });

  it('cancels when user rejects confirmation', async () => {
    const observeAndPlan = () => makePlan([action('delete', 'syn-item-2')]);

    const result = await runMultiStepTask(baseOpts({
      observeAndPlan,
      executeAction: () => requiresConfirmation(),
      requestConfirmation: () => false
    }));

    assert.equal(result.status, 'cancelled');
    assert.equal(result.stepsCompleted, 0);
    assert.equal(result.history.length, 1);
    assert.equal(result.history[0].status, 'cancelled');
  });

  it('stops on execution failure and sets safe message for known status', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => makePlan([action('click', 'syn-btn-x')]),
      executeAction: () => ({ status: 'target_not_found' })
    }));

    assert.equal(result.status, 'execution_failed');
    assert.equal(result.message, 'Action execution failed: target_not_found.');
    assert.equal(result.stepsCompleted, 0);
    assert.equal(result.history[0].status, 'target_not_found');
  });

  it('sets fallback safe message for unknown execution failure status', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => makePlan([action('click', 'syn-btn-x')]),
      executeAction: () => ({ status: 'custom_unexpected_error_status' })
    }));

    assert.equal(result.status, 'execution_failed');
    assert.equal(result.message, 'Action execution failed: failed.');
    assert.equal(result.history[0].status, 'custom_unexpected_error_status');
  });

  it('formats safe controller messages for all allowed fail statuses', async () => {
    const allowed = [
      'target_not_found',
      'target_not_visible',
      'target_disabled',
      'unsupported_target',
      'option_not_found',
      'blocked_sensitive_field',
      'requires_local_value',
      'failed',
      'invalid'
    ];

    for (const status of allowed) {
      const result = await runMultiStepTask(baseOpts({
        observeAndPlan: () => makePlan([action('click', 'syn-btn-x')]),
        executeAction: () => ({ status })
      }));
      assert.equal(result.status, 'execution_failed');
      assert.equal(result.message, `Action execution failed: ${status}.`);
    }
  });

  it('enforces step limit', async () => {
    let idx = 0;
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => makePlan([action('scroll', `syn-pane-${idx++}`)]),
      maxSteps: 3
    }));

    assert.equal(result.status, 'step_limit_reached');
    assert.equal(result.stepsCompleted, 3);
    assert.equal(result.history.length, 3);
  });

  it('detects repeated action loops before third execution', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => makePlan([action('scroll', 'syn-container-1', { direction: 'down' })]),
      maxSteps: 10
    }));

    assert.equal(result.status, 'loop_detected');
    assert.equal(result.stepsCompleted, 2);
  });


  it('respects an already-aborted signal', async () => {
    const ac = new AbortController();
    ac.abort();

    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => { throw new Error('unreachable'); },
      signal: ac.signal
    }));

    assert.equal(result.status, 'aborted');
    assert.equal(result.stepsCompleted, 0);
  });

  it('aborts between observe and execute', async () => {
    const ac = new AbortController();
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => { ac.abort(); return makePlan([action('click', 'syn-btn-5')]); },
      executeAction: () => { throw new Error('unreachable'); },
      signal: ac.signal
    }));

    assert.equal(result.status, 'aborted');
  });

  it('history contains only stepIndex, actionType, and status', async () => {
    const sensitiveAction = {
      type: 'type',
      targetId: 'syn-password-field',
      value: 'hunter2',
      label: 'Password Input',
      selector: '#password',
      textContent: 'Enter password'
    };

    let step = 0;
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => {
        if (step++ === 0) return makePlan([sensitiveAction]);
        return makePlan([], true);
      }
    }));

    assert.equal(result.status, 'completed');
    for (const entry of result.history) {
      assert.deepEqual(Object.keys(entry).sort(), ['actionType', 'status', 'stepIndex']);
      assert.equal(entry.targetId, undefined);
      assert.equal(entry.value, undefined);
      assert.equal(entry.label, undefined);
      assert.equal(entry.selector, undefined);
      assert.equal(entry.textContent, undefined);
    }
  });

  it('throws on invalid prompt', async () => {
    await assert.rejects(
      () => runMultiStepTask(baseOpts({ prompt: '' })),
      TypeError
    );
  });

  it('throws on missing callbacks', async () => {
    await assert.rejects(
      () => runMultiStepTask({ prompt: 'test' }),
      TypeError
    );
  });

  // === maxSteps validation =================================================

  it('throws when maxSteps is 0', async () => {
    await assert.rejects(
      () => runMultiStepTask(baseOpts({ maxSteps: 0 })),
      RangeError
    );
  });

  it('throws when maxSteps is 11', async () => {
    await assert.rejects(
      () => runMultiStepTask(baseOpts({ maxSteps: 11 })),
      RangeError
    );
  });

  it('throws when maxSteps is not an integer', async () => {
    await assert.rejects(
      () => runMultiStepTask(baseOpts({ maxSteps: 2.5 })),
      RangeError
    );
  });

  it('accepts maxSteps = 1', async () => {
    const result = await runMultiStepTask(baseOpts({ maxSteps: 1 }));
    assert.equal(result.status, 'completed');
  });

  it('accepts maxSteps = 10', async () => {
    const result = await runMultiStepTask(baseOpts({ maxSteps: 10 }));
    assert.equal(result.status, 'completed');
  });

  // === Planner result validation ===========================================

  it('returns invalid_plan when planner returns null', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => null
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  it('returns invalid_plan when planner returns a string', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => 'bad'
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  it('returns invalid_plan when planner returns an array', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => [{ type: 'click' }]
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  // === taskComplete validation =============================================

  it('returns invalid_plan when taskComplete is a string', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ taskComplete: 'yes', actions: [] })
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  it('returns invalid_plan when taskComplete is 1', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ taskComplete: 1, actions: [] })
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  // === actions array validation ============================================

  it('returns invalid_plan when actions is not an array', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ actions: 'click' })
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  it('returns invalid_plan when actions key is missing and taskComplete is false', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ taskComplete: false })
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  // === Action object validation ============================================

  it('returns invalid_plan when action is null', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ actions: [null] })
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  it('returns invalid_plan when action type is missing', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ actions: [{ targetId: 'syn-x' }] })
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  it('returns invalid_plan when action type is empty', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ actions: [{ type: '  ' }] })
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  it('returns invalid_plan when action type is a number', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ actions: [{ type: 42 }] })
    }));
    assert.equal(result.status, 'invalid_plan');
  });

  // === Executor result validation ==========================================

  it('returns execution_failed when executor returns null', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => makePlan([action('click')]),
      executeAction: () => null
    }));
    assert.equal(result.status, 'execution_failed');
    assert.equal(result.history[0].status, 'invalid');
  });

  it('returns execution_failed when executor returns string', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => makePlan([action('click')]),
      executeAction: () => 'ok'
    }));
    assert.equal(result.status, 'execution_failed');
  });

  it('returns execution_failed when executor status is empty', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => makePlan([action('click')]),
      executeAction: () => ({ status: '' })
    }));
    assert.equal(result.status, 'execution_failed');
  });

  it('returns execution_failed when confirmed executor returns invalid', async () => {
    let call = 0;
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => makePlan([action('delete')]),
      executeAction: () => (call++ === 0 ? requiresConfirmation() : null),
      requestConfirmation: () => true
    }));
    assert.equal(result.status, 'execution_failed');
  });

  // === plan.message passthrough ============================================

  it('preserves plan.message on taskComplete', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ taskComplete: true, actions: [], message: 'All done!' })
    }));
    assert.equal(result.status, 'completed');
    assert.equal(result.message, 'All done!');
  });

  it('preserves plan.message on empty actions', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ actions: [], message: 'Nothing to do' })
    }));
    assert.equal(result.status, 'completed');
    assert.equal(result.message, 'Nothing to do');
  });

  it('uses default message when plan.message is empty', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ taskComplete: true, actions: [], message: '' })
    }));
    assert.equal(result.message, 'Task completed');
  });

  it('uses default message when plan.message is not a string', async () => {
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => ({ taskComplete: true, actions: [], message: 123 })
    }));
    assert.equal(result.message, 'Task completed');
  });

  // === waitForReady ========================================================

  it('throws when waitForReady is not a function', async () => {
    await assert.rejects(
      () => runMultiStepTask(baseOpts({ waitForReady: 'bad' })),
      TypeError
    );
  });

  it('calls waitForReady after each executed action with privacy-safe args', async () => {
    const waitCalls = [];
    const sig = (new AbortController()).signal;

    let step = 0;
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => {
        if (step < 2) return makePlan([action('click', `syn-btn-${step++}`)]);
        return makePlan([], true);
      },
      waitForReady: (args) => { waitCalls.push(args); },
      signal: sig
    }));

    assert.equal(result.status, 'completed');
    assert.equal(waitCalls.length, 2);

    assert.equal(waitCalls[0].stepIndex, 0);
    assert.equal(waitCalls[0].actionType, 'click');
    assert.equal(waitCalls[0].signal, sig);
    assert.equal(waitCalls[0].targetId, undefined);
    assert.equal(waitCalls[0].value, undefined);

    assert.equal(waitCalls[1].stepIndex, 1);
    assert.equal(waitCalls[1].actionType, 'click');
  });

  it('calls waitForReady before the next observation', async () => {
    const order = [];

    let step = 0;
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => {
        order.push(`observe-${step}`);
        if (step++ < 1) return makePlan([action('click', 'syn-el-1')]);
        return makePlan([], true);
      },
      waitForReady: () => { order.push('wait'); },
    }));

    assert.equal(result.status, 'completed');
    assert.deepEqual(order, ['observe-0', 'wait', 'observe-1']);
  });

  it('does not call waitForReady when callback is omitted', async () => {
    let step = 0;
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => {
        if (step++ === 0) return makePlan([action('click')]);
        return makePlan([], true);
      }
      // no waitForReady
    }));

    assert.equal(result.status, 'completed');
    assert.equal(result.stepsCompleted, 1);
  });

  // === Abort recheck after confirmation ====================================

  it('aborts after confirmation approval if signal was aborted during confirmation', async () => {
    const ac = new AbortController();

    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => makePlan([action('delete', 'syn-x')]),
      executeAction: (_a, opts) => opts.confirmed ? executed() : requiresConfirmation(),
      requestConfirmation: () => { ac.abort(); return true; },
      signal: ac.signal
    }));

    assert.equal(result.status, 'aborted');
  });

  // === Abort recheck after waitForReady ====================================

  it('aborts after waitForReady if signal was aborted during wait', async () => {
    const ac = new AbortController();

    let step = 0;
    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: () => makePlan([action('click', `syn-${step++}`)]),
      waitForReady: () => { ac.abort(); },
      signal: ac.signal,
      maxSteps: 5
    }));

    assert.equal(result.status, 'aborted');
    assert.equal(result.stepsCompleted, 1);
  });

  // === Deterministic full-flow & effect regression tests =====================

  it('Spotify-like flow: search -> search_submitted, result click, Play click -> media_started, completion', async () => {
    const executedActions = [];
    let step = 0;

    const observeAndPlan = ({ stepIndex, history }) => {
      assert.equal(stepIndex, step);
      if (step === 0) {
        return makePlan([{ type: 'search', targetId: 'search-input', value: 'Blinding Lights' }]);
      }
      if (step === 1) {
        assert.equal(history.length, 1);
        assert.equal(history[0].effect, 'search_submitted');
        return makePlan([{ type: 'click', targetId: 'result-track-1' }]);
      }
      if (step === 2) {
        assert.equal(history.length, 2);
        assert.equal(history[1].effect, undefined); // Ordinary click has no effect
        return makePlan([{ type: 'click', targetId: 'play-btn' }]);
      }
      if (step === 3) {
        assert.equal(history.length, 3);
        assert.equal(history[2].effect, 'media_started');
        return makePlan([], true, 'Song is playing');
      }
      assert.fail('Should not plan beyond completion');
    };

    const executeAction = async (act) => {
      executedActions.push(act);
      step++;
      if (act.type === 'search') {
        return { status: 'executed', effect: 'search_submitted' };
      }
      if (act.targetId === 'result-track-1') {
        return { status: 'executed' };
      }
      if (act.targetId === 'play-btn') {
        return { status: 'executed', effect: 'media_started' };
      }
      return { status: 'executed' };
    };

    const result = await runMultiStepTask(baseOpts({ observeAndPlan, executeAction }));

    assert.equal(result.status, 'completed');
    assert.equal(result.stepsCompleted, 3);
    assert.equal(result.message, 'Song is playing');
    assert.equal(executedActions.length, 3);

    // Assert no action executed twice
    const executedTargetIds = executedActions.map((a) => a.targetId);
    assert.equal(new Set(executedTargetIds).size, 3);

    // Assert effects recorded properly
    assert.equal(result.history[0].effect, 'search_submitted');
    assert.equal(result.history[1].effect, undefined);
    assert.equal(result.history[2].effect, 'media_started');
  });

  it('WhatsApp-like flow: type once -> message_composed, re-observe, confirmed Send -> message_sent -> completes immediately', async () => {
    let typeCount = 0;
    let confirmationCount = 0;
    let sendClickCount = 0;
    let observeCount = 0;

    const observeAndPlan = ({ stepIndex, history }) => {
      observeCount++;
      if (stepIndex === 0) {
        return makePlan([{ type: 'type', targetId: 'msg-composer', value: 'Hello world' }]);
      }
      if (stepIndex === 1) {
        assert.equal(history.length, 1);
        assert.equal(history[0].effect, 'message_composed');
        return makePlan([{ type: 'click', targetId: 'send-btn', requiresConfirmation: true }]);
      }
      assert.fail('Should not observe again after message_sent');
    };

    const requestConfirmation = async () => {
      confirmationCount++;
      return true;
    };

    const executeAction = async (act, { confirmed }) => {
      if (act.type === 'type') {
        typeCount++;
        return { status: 'executed', effect: 'message_composed' };
      }
      if (act.type === 'click' && act.targetId === 'send-btn') {
        if (!confirmed) {
          return { status: 'requires_confirmation' };
        }
        sendClickCount++;
        return { status: 'executed', effect: 'message_sent' };
      }
      return { status: 'executed' };
    };

    const result = await runMultiStepTask(baseOpts({
      observeAndPlan,
      executeAction,
      requestConfirmation
    }));

    assert.equal(result.status, 'completed');
    assert.equal(result.message, 'Message submitted.');
    assert.equal(result.stepsCompleted, 2);
    assert.equal(typeCount, 1, 'Exactly one insertion');
    assert.equal(confirmationCount, 1, 'Exactly one confirmation');
    assert.equal(sendClickCount, 1, 'Exactly one Send click');
    assert.equal(observeCount, 2, 'Observed exactly twice and terminated immediately');
  });

  it('does not execute repeated search after search_submitted and stops safely as stalled', async () => {
    let execCount = 0;
    const observeAndPlan = ({ stepIndex }) => {
      if (stepIndex === 0) {
        return makePlan([{ type: 'search', targetId: 'search-box', value: 'query' }]);
      }
      // Planner proposes search again
      return makePlan([{ type: 'search', targetId: 'search-box', value: 'query' }]);
    };

    const executeAction = async (act) => {
      execCount++;
      return { status: 'executed', effect: 'search_submitted' };
    };

    const result = await runMultiStepTask(baseOpts({ observeAndPlan, executeAction }));

    assert.equal(result.status, 'stalled');
    assert.match(result.message, /Search already submitted/i);
    assert.equal(execCount, 1, 'Did not execute second search');
    assert.equal(result.stepsCompleted, 1);
  });

  it('message_sent terminates without another observation', async () => {
    let observations = 0;
    const observeAndPlan = () => {
      observations++;
      return makePlan([{ type: 'click', targetId: 'send-control', requiresConfirmation: true }]);
    };

    const executeAction = async (_act, opts) => {
      if (!opts.confirmed) return { status: 'requires_confirmation' };
      return { status: 'executed', effect: 'message_sent' };
    };

    const result = await runMultiStepTask(baseOpts({ observeAndPlan, executeAction }));

    assert.equal(result.status, 'completed');
    assert.equal(observations, 1);
  });

  it('history entries and effects contain no private fields', async () => {
    const observeAndPlan = ({ stepIndex }) => {
      if (stepIndex === 0) return makePlan([{ type: 'type', targetId: 'composer-1', value: 'Confidential Message' }]);
      return makePlan([], true);
    };

    const executeAction = async () => ({ status: 'executed', effect: 'message_composed' });

    const result = await runMultiStepTask(baseOpts({ observeAndPlan, executeAction }));

    assert.equal(result.status, 'completed');
    for (const entry of result.history) {
      const allowedKeys = new Set(['stepIndex', 'actionType', 'status', 'effect']);
      for (const key of Object.keys(entry)) {
        assert.ok(allowedKeys.has(key), `Forbidden key in history: ${key}`);
      }
      assert.equal(entry.targetId, undefined);
      assert.equal(entry.value, undefined);
      assert.equal(entry.label, undefined);
      assert.equal(entry.url, undefined);
      assert.equal(entry.screenshot, undefined);
    }
  });

  it('effect cannot be created solely from action.intent without DOM semantics', async () => {
    // Ordinary click with intent: "play music" on a cancel button without DOM play semantics
    const cancelAction = { type: 'click', targetId: 'cancel-btn', intent: 'play music' };
    let capturedHistory = null;

    const observeAndPlan = ({ history }) => {
      capturedHistory = history;
      return makePlan([], true);
    };

    // Executor simulating DOM check: element is cancel button, not Play button -> status executed without effect
    const executeAction = async () => ({ status: 'executed' });

    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: ({ stepIndex }) => stepIndex === 0 ? makePlan([cancelAction]) : makePlan([], true),
      executeAction
    }));

    assert.equal(result.status, 'completed');
    assert.equal(result.history[0].effect, undefined);
  });

  it('ordinary clicks and ordinary inputs remain unchanged without effects', async () => {
    const observeAndPlan = ({ stepIndex }) => {
      if (stepIndex === 0) return makePlan([{ type: 'click', targetId: 'nav-link' }]);
      if (stepIndex === 1) return makePlan([{ type: 'type', targetId: 'age-input', value: '25' }]);
      return makePlan([], true);
    };

    const executeAction = async () => ({ status: 'executed' });

    const result = await runMultiStepTask(baseOpts({
      observeAndPlan: ({ stepIndex }) => stepIndex === 0 ? makePlan([{ type: 'click', targetId: 'nav-link' }]) : (stepIndex === 1 ? makePlan([{ type: 'type', targetId: 'age-input', value: '25' }]) : makePlan([], true)),
      executeAction
    }));

    assert.equal(result.status, 'completed');
    assert.equal(result.history[0].effect, undefined);
    assert.equal(result.history[1].effect, undefined);
  });

  it('handles delayed search results and late-appearing controls without repeating search', async () => {
    // Step 0: search submitted
    // Step 1: delayed search results appear in DOM with late Play control
    // Planner inspects history, sees search_submitted, and clicks the late Play control
    const plannedActions = [];
    const observedHistories = [];

    const observeAndPlan = ({ stepIndex, history }) => {
      observedHistories.push(history);
      if (stepIndex === 0) {
        return makePlan([{ type: 'search', targetId: 'privacylens-target-4', value: 'Blinding Lights' }]);
      }
      if (stepIndex === 1) {
        // Assert history contains search_submitted
        assert.equal(history.length, 1);
        assert.equal(history[0].effect, 'search_submitted');
        // Click the newly appeared Play button
        return makePlan([{ type: 'click', targetId: 'privacylens-target-99' }]);
      }
      return makePlan([], true);
    };

    const executeAction = async (action) => {
      plannedActions.push(action);
      if (action.type === 'search') {
        return { status: 'executed', effect: 'search_submitted' };
      }
      if (action.type === 'click') {
        return { status: 'executed', effect: 'media_started' };
      }
      return { status: 'executed' };
    };

    const result = await runMultiStepTask(baseOpts({
      observeAndPlan,
      executeAction,
      waitForReady: async () => true,
    }));

    assert.equal(result.status, 'completed');
    assert.equal(result.stepsCompleted, 2);
    assert.equal(plannedActions.length, 2);
    assert.equal(plannedActions[0].type, 'search');
    assert.equal(plannedActions[1].type, 'click');
    assert.equal(plannedActions[1].targetId, 'privacylens-target-99');
  });
});
