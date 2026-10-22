import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState, calculateCost, formatCurrency } from '../lib/goal-engine.js';
import { getModelRates, updateGoalCostUsage, processCostBudget } from '../lib/engine-cost-meter.js';

test('Cost Meter: getModelRates resolves default rates and matches prefixes', () => {
  const deepseek = getModelRates('deepseek-chat');
  assert.equal(deepseek.prompt, 0.14);
  assert.equal(deepseek.completion, 0.28);

  const sonnet = getModelRates('claude-3-5-sonnet-20241022');
  assert.equal(sonnet.prompt, 3.00);
  assert.equal(sonnet.completion, 15.00);

  const fallback = getModelRates('unknown-custom-model');
  assert.equal(fallback.prompt, 1.00);
  assert.equal(fallback.completion, 3.00);

  // Custom rates override
  const custom = getModelRates('my-special-model', { 'my-special-model': { prompt: 5.0, completion: 20.0 } });
  assert.equal(custom.prompt, 5.0);
  assert.equal(custom.completion, 20.0);
});

test('Cost Meter: calculateCost calculates exact USD amounts', () => {
  // 1,000,000 prompt tokens of deepseek-chat = $0.14
  const res1 = calculateCost(1000000, 0, 'deepseek-chat');
  assert.equal(res1.promptCost, 0.14);
  assert.equal(res1.completionCost, 0.0);
  assert.equal(res1.totalCost, 0.14);
  assert.equal(res1.formattedCost, '$0.14');

  // 10,000 completion tokens of deepseek-reasoner: 10,000 / 1,000,000 * 2.19 = $0.0219
  const res2 = calculateCost(0, 10000, 'deepseek-reasoner');
  assert.equal(res2.completionCost, 0.0219);
  assert.equal(res2.formattedCost, '$0.02');
});

test('Cost Meter: formatCurrency formats standard currencies', () => {
  assert.equal(formatCurrency(0.05, 'USD'), '$0.05');
  assert.equal(formatCurrency(12.345, 'USD'), '$12.35');
  assert.equal(formatCurrency(10.5, 'EUR'), '€10.50');
  assert.equal(formatCurrency(50, 'CNY'), '¥50.00');
  assert.equal(formatCurrency(100, 'GBP'), '£100.00');
});

test('Cost Meter: updateGoalCostUsage accumulates monetary usage correctly', () => {
  const goal = { costUsage: { promptCost: 0, completionCost: 0, totalCost: 0, formattedCost: '$0.00', currency: 'USD' } };
  const engine = { activeModel: 'deepseek-chat', customRates: {} };

  updateGoalCostUsage(goal, { promptTokens: 500000, completionTokens: 250000, modelName: 'deepseek-chat' }, engine);
  // prompt: 0.5 * 0.14 = 0.07
  // completion: 0.25 * 0.28 = 0.07
  // total: 0.14
  assert.equal(goal.costUsage.promptCost, 0.07);
  assert.equal(goal.costUsage.completionCost, 0.07);
  assert.equal(goal.costUsage.totalCost, 0.14);
  assert.equal(goal.costUsage.formattedCost, '$0.14');

  // Second turn adds more cost
  updateGoalCostUsage(goal, { promptTokens: 500000, completionTokens: 250000, modelName: 'deepseek-chat' }, engine);
  assert.equal(goal.costUsage.totalCost, 0.28);
  assert.equal(goal.costUsage.formattedCost, '$0.28');
});

test('Cost Meter: processCostBudget triggers warning at threshold and pauses on budget exceeded', () => {
  const goal = {
    title: 'Test Budget Goal',
    state: GoalState.RUNNING,
    costUsage: { totalCost: 0.85, formattedCost: '$0.85' },
    logs: [],
  };

  // 1. Warning threshold check (80% of $1.00 budget = $0.80)
  const warnCheck = processCostBudget(goal, { maxCostBudget: 1.00, costWarningThreshold: 80, GoalState });
  assert.equal(warnCheck.warned, true);
  assert.equal(warnCheck.paused, false);
  assert.equal(goal.costWarningTriggered, true);
  assert.equal(Boolean(goal.costLimitExceeded), false);

  // 2. Budget exceeded check ($1.05 > $1.00)
  goal.costUsage.totalCost = 1.05;
  goal.costUsage.formattedCost = '$1.05';
  const pauseCheck = processCostBudget(goal, { maxCostBudget: 1.00, costWarningThreshold: 80, GoalState });
  assert.equal(pauseCheck.paused, true);
  assert.equal(goal.state, GoalState.PAUSED);
  assert.equal(goal.costLimitExceeded, true);
  assert.ok(goal.logs.some((l) => l.message.includes('Cost budget limit')));
});

test('Cost Meter: GoalEngine live integration with startGoal and addTokenUsage', () => {
  const engine = new GoalEngine({
    maxCostBudget: 0.10,
    costWarningThreshold: 80,
    currency: 'USD',
  });

  const snap = engine.startGoal('Cost Meter Integration Goal', {
    maxCostBudget: 0.20,
    currency: 'USD',
  }, 'cost-sid');

  assert.equal(snap.maxCostBudget, 0.20);
  assert.equal(snap.costUsage.totalCost, 0);
  assert.equal(snap.costLimitExceeded, false);

  // Consume tokens on deepseek-chat (1,000,000 completion = $0.28 -> exceeds $0.20)
  engine.addTokenUsage({
    promptTokens: 100000,
    completionTokens: 1000000,
    modelName: 'deepseek-chat',
  }, 'cost-sid');

  const afterSnap = engine.getSnapshot('cost-sid');
  assert.ok(afterSnap.costUsage.totalCost > 0.20);
  assert.equal(afterSnap.costLimitExceeded, true);
  assert.equal(afterSnap.state, GoalState.PAUSED);

  const usage = engine.getCostUsage('cost-sid');
  assert.ok(usage && usage.totalCost > 0.20);
});
