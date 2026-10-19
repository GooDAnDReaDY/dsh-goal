import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState } from '../lib/goal-engine.js';

test('GoalEngine.nudge records user steering and sets pendingNudge', () => {
  const engine = new GoalEngine();
  engine.startGoal('Steering Test Goal', {}, 'sid-steer');

  assert.equal(engine.getSnapshot('sid-steer').pendingNudge, null);

  // Nudge with whitespace is trimmed
  engine.nudge('  Please avoid touching the legacy config  ', 'sid-steer');

  const snap = engine.getSnapshot('sid-steer');
  assert.equal(snap.pendingNudge, 'Please avoid touching the legacy config');

  const goal = engine.getGoal('sid-steer');
  assert.equal(goal.nudges.length, 1);
  assert.equal(goal.nudges[0].text, 'Please avoid touching the legacy config');
  assert.ok(goal.logs.some(l => l.message.includes('User steering / clarification')));

  // consumePendingNudge clears it
  const consumed = engine.consumePendingNudge('sid-steer');
  assert.equal(consumed, 'Please avoid touching the legacy config');
  assert.equal(engine.getSnapshot('sid-steer').pendingNudge, null);
  assert.equal(engine.consumePendingNudge('sid-steer'), null);
});

test('GoalEngine.getStatePromptInjection embeds pendingNudge and consumes it', () => {
  const engine = new GoalEngine();
  engine.startGoal('Prompt Injection Steer Goal', {}, 'sid-inj');

  engine.nudge('Make sure to add unit tests for the new endpoint', 'sid-inj');

  const prompt = engine.getStatePromptInjection('sid-inj');
  assert.match(prompt, /URGENT USER CLARIFICATION \/ STEERING/);
  assert.match(prompt, /Make sure to add unit tests for the new endpoint/);

  // After injection, pendingNudge is consumed so subsequent calls don't duplicate it
  const secondPrompt = engine.getStatePromptInjection('sid-inj');
  assert.doesNotMatch(secondPrompt, /URGENT USER CLARIFICATION \/ STEERING/);
  assert.equal(engine.getSnapshot('sid-inj').pendingNudge, null);
});

test('GoalEngine.getStatePromptInjection Chinese localization for steering', () => {
  const engine = new GoalEngine();
  engine.startGoal('测试提示词本地化', { lang: 'zh' }, 'sid-zh');

  engine.nudge('首先重构辅助函数', 'sid-zh');

  const prompt = engine.getStatePromptInjection('sid-zh');
  assert.match(prompt, /用户紧急补充说明 \/ 调整方向/);
  assert.match(prompt, /首先重构辅助函数/);
});
