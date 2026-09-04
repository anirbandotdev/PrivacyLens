/**
 * Multi-step agentic task controller.
 * Executes a prompt-driven plan-observe-act loop with privacy-safe history,
 * loop detection, confirmation gating, and abort signal support.
 */

export async function runMultiStepTask({
  prompt,
  observeAndPlan,
  executeAction,
  requestConfirmation,
  waitForReady,
  maxSteps = 6,
  signal
} = {}) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new TypeError('prompt must be a non-empty string');
  }
  if (typeof observeAndPlan !== 'function') {
    throw new TypeError('observeAndPlan must be a function');
  }
  if (typeof executeAction !== 'function') {
    throw new TypeError('executeAction must be a function');
  }
  if (typeof requestConfirmation !== 'function') {
    throw new TypeError('requestConfirmation must be a function');
  }
  if (waitForReady !== undefined && typeof waitForReady !== 'function') {
    throw new TypeError('waitForReady must be a function when provided');
  }
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 10) {
    throw new RangeError('maxSteps must be an integer from 1 through 10');
  }

  const history = [];
  const recentKeys = [];
  let stepsCompleted = 0;

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex++) {
    if (signal?.aborted) {
      return buildResult('aborted', 'Task aborted by signal', stepsCompleted, history);
    }

    const plan = await observeAndPlan({
      prompt,
      stepIndex,
      history: history.map(h => ({ ...h }))
    });

    if (!isObject(plan)) {
      return buildResult('invalid_plan', 'Planner returned a non-object', stepsCompleted, history);
    }

    if ('taskComplete' in plan && typeof plan.taskComplete !== 'boolean') {
      return buildResult('invalid_plan', 'taskComplete must be a boolean', stepsCompleted, history);
    }

    if (plan.taskComplete) {
      const msg = typeof plan.message === 'string' && plan.message.trim()
        ? plan.message
        : 'Task completed';
      return buildResult('completed', msg, stepsCompleted, history);
    }

    if (!('actions' in plan) || !Array.isArray(plan.actions)) {
      return buildResult('invalid_plan', 'actions must be an array', stepsCompleted, history);
    }

    if (plan.actions.length === 0) {
      const msg = typeof plan.message === 'string' && plan.message.trim()
        ? plan.message
        : 'Task completed';
      return buildResult('completed', msg, stepsCompleted, history);
    }

    if (plan.actions.length > 1) {
      return buildResult('invalid_plan', 'Plan contains multiple actions', stepsCompleted, history);
    }

    const action = plan.actions[0];

    if (!isObject(action) || typeof action.type !== 'string' || !action.type.trim()) {
      return buildResult('invalid_plan', 'Action must be an object with a non-empty string type', stepsCompleted, history);
    }

    const key = loopKey(action);

    if (recentKeys.length >= 2 && recentKeys[0] === key && recentKeys[1] === key) {
      return buildResult('loop_detected', 'Repeated action loop detected', stepsCompleted, history);
    }

    if (signal?.aborted) {
      return buildResult('aborted', 'Task aborted by signal', stepsCompleted, history);
    }

    let execResult = await executeAction(action, { confirmed: false });

    if (!isObject(execResult) || typeof execResult.status !== 'string' || !execResult.status.trim()) {
      history.push(safeEntry(stepIndex, action.type, 'invalid'));
      return buildResult('execution_failed', 'Executor returned an invalid result', stepsCompleted, history);
    }

    if (execResult.status === 'requires_confirmation') {
      const approved = await requestConfirmation(action);
      if (!approved) {
        history.push(safeEntry(stepIndex, action.type, 'cancelled'));
        return buildResult('cancelled', 'User rejected action', stepsCompleted, history);
      }

      if (signal?.aborted) {
        return buildResult('aborted', 'Task aborted by signal', stepsCompleted, history);
      }

      execResult = await executeAction(action, { confirmed: true });

      if (!isObject(execResult) || typeof execResult.status !== 'string' || !execResult.status.trim()) {
        history.push(safeEntry(stepIndex, action.type, 'invalid'));
        return buildResult('execution_failed', 'Executor returned an invalid result', stepsCompleted, history);
      }
    }

    if (execResult.status === 'executed') {
      history.push(safeEntry(stepIndex, action.type, 'executed'));
      stepsCompleted++;
      recentKeys.push(key);
      if (recentKeys.length > 2) recentKeys.shift();

      if (waitForReady) {
        await waitForReady({ stepIndex, actionType: action.type, signal });
      }

      if (signal?.aborted) {
        return buildResult('aborted', 'Task aborted by signal', stepsCompleted, history);
      }

      continue;
    }

    history.push(safeEntry(stepIndex, action.type, execResult.status));
    return buildResult('execution_failed', 'Action execution failed', stepsCompleted, history);
  }

  return buildResult('step_limit_reached', 'Maximum step limit reached', stepsCompleted, history);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function loopKey(action) {
  return `${action.type ?? ''}|${action.targetId ?? ''}|${action.direction ?? ''}`;
}

function safeEntry(stepIndex, actionType, status) {
  return { stepIndex, actionType, status };
}

function buildResult(status, message, stepsCompleted, history) {
  return { status, message, stepsCompleted, history: history.map(h => ({ ...h })) };
}
