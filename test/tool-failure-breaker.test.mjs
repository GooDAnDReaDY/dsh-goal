import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState } from '../lib/goal-engine.js';

test('GoalEngine tracks consecutive tool failure counters and allows reset', () => {
  const engine = new GoalEngine({ consecutiveToolFailureLimit: 3 });
  engine.startGoal('Tool Failure Test Goal', {}, 'sid-fail');

  assert.equal(engine.getToolFailureCount('sid-fail'), 0);
  assert.equal(engine.getSnapshot('sid-fail').toolFailureCount, 0);

  // Increment on failure
  assert.equal(engine.incrementToolFailureCount('sid-fail'), 1);
  assert.equal(engine.incrementToolFailureCount('sid-fail'), 2);
  assert.equal(engine.getToolFailureCount('sid-fail'), 2);

  // Reset on successful turn
  engine.resetToolFailureCount('sid-fail');
  assert.equal(engine.getToolFailureCount('sid-fail'), 0);
});

test('GoalEngine configurable consecutiveToolFailureLimit via constructor and updateConfig', () => {
  const engine = new GoalEngine({ consecutiveToolFailureLimit: 5 });
  assert.equal(engine.consecutiveToolFailureLimit, 5);
  assert.equal(engine.getSnapshot('default').consecutiveToolFailureLimit, 5);

  engine.updateConfig({ consecutiveToolFailureLimit: 2 });
  assert.equal(engine.consecutiveToolFailureLimit, 2);
  assert.equal(engine.getSnapshot('default').consecutiveToolFailureLimit, 2);

  // Disabled when 0
  engine.updateConfig({ consecutiveToolFailureLimit: 0 });
  assert.equal(engine.consecutiveToolFailureLimit, 0);
});
