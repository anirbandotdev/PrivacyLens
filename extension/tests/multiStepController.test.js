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
});
