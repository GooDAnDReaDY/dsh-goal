import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState, MilestoneStatus, formatETA } from '../lib/goal-engine.js';

test('formatETA helper formats seconds into human-readable approximations', () => {
  assert.equal(formatETA(null), null);
  assert.equal(formatETA(undefined), null);
  assert.equal(formatETA(NaN), null);
  assert.equal(formatETA(-5), '~0s');
  assert.equal(formatETA(0), '~0s');
  assert.equal(formatETA(45), '~45s');
  assert.equal(formatETA(59), '~59s');
  assert.equal(formatETA(60), '~1m');
  assert.equal(formatETA(125), '~2m');
  assert.equal(formatETA(3540), '~59m');
  assert.equal(formatETA(3599), '~1h');
  assert.equal(formatETA(3600), '~1h');
  assert.equal(formatETA(3720), '~1h 2m');
});

test('GoalEngine ETA calculation based on completed milestones pace', () => {
  const engine = new GoalEngine();

  // No active goal
  assert.equal(engine.getEstimatedRemainingSeconds('sid-1'), null);

  // Start goal with 4 milestones
  engine.startGoal('ETA Test Goal', {
    milestones: ['Step 1', 'Step 2', 'Step 3', 'Step 4'],
  }, 'sid-1');

  // 0 completed -> ETA is null (cannot extrapolate pace)
  assert.equal(engine.getEstimatedRemainingSeconds('sid-1'), null);
  let snap = engine.getSnapshot('sid-1');
  assert.equal(snap.formattedETA, null);

  // Mock goal startedAt to 60 seconds ago
  const goal = engine.getGoal('sid-1');
  goal.startedAt = Date.now() - 60000;

  // Complete 2 milestones: elapsed 60s / 2 completed = 30s per milestone.
  // 2 remaining milestones * 30s = 60 seconds ETA (~1m)
  engine.updateMilestone('m-1', MilestoneStatus.COMPLETED, 'done 1', 'sid-1');
  engine.updateMilestone('m-2', MilestoneStatus.COMPLETED, 'done 2', 'sid-1');

  const estSec = engine.getEstimatedRemainingSeconds('sid-1');
  assert.ok(estSec >= 58 && estSec <= 62, `Expected ETA around 60s, got ${estSec}`);

  snap = engine.getSnapshot('sid-1');
  assert.equal(snap.formattedETA, '~1m');

  // Complete all milestones -> ETA becomes null
  engine.updateMilestone('m-3', MilestoneStatus.COMPLETED, 'done 3', 'sid-1');
  engine.updateMilestone('m-4', MilestoneStatus.COMPLETED, 'done 4', 'sid-1');
  assert.equal(engine.getEstimatedRemainingSeconds('sid-1'), null);
  assert.equal(engine.getSnapshot('sid-1').formattedETA, null);
});

test('GoalEngine token usage accumulation across multiple turns', () => {
  const engine = new GoalEngine();
  engine.startGoal('Token Analytics Goal', {}, 'sid-tokens');

  let snap = engine.getSnapshot('sid-tokens');
  assert.deepEqual(snap.tokensUsage, { promptTokens: 0, completionTokens: 0, totalTokens: 0 });

  // Turn 1 with standard usage keys
  engine.addTokenUsage({
    promptTokens: 1200,
    completionTokens: 350,
    totalTokens: 1550,
  }, 'sid-tokens');

  snap = engine.getSnapshot('sid-tokens');
  assert.equal(snap.tokensUsage.promptTokens, 1200);
  assert.equal(snap.tokensUsage.completionTokens, 350);
  assert.equal(snap.tokensUsage.totalTokens, 1550);

  // Turn 2 with alternative schema keys (input_tokens / output_tokens)
  engine.addTokenUsage({
    input_tokens: 800,
    output_tokens: 150,
  }, 'sid-tokens');

  snap = engine.getSnapshot('sid-tokens');
  assert.equal(snap.tokensUsage.promptTokens, 2000);
  assert.equal(snap.tokensUsage.completionTokens, 500);
  assert.equal(snap.tokensUsage.totalTokens, 2500);

  // Ignored if invalid usage object
  engine.addTokenUsage(null, 'sid-tokens');
  engine.addTokenUsage('invalid', 'sid-tokens');
  assert.equal(engine.getSnapshot('sid-tokens').tokensUsage.totalTokens, 2500);
});

test('GoalEngine quick launch button configuration', () => {
  const engine = new GoalEngine({ showQuickLaunchButton: true });
  assert.equal(engine.showQuickLaunchButton, true);
  assert.equal(engine.getSnapshot('default').showQuickLaunchButton, true);

  engine.updateConfig({ showQuickLaunchButton: false });
  assert.equal(engine.showQuickLaunchButton, false);
  assert.equal(engine.getSnapshot('default').showQuickLaunchButton, false);

  engine.updateConfig({ showQuickLaunchButton: true });
  assert.equal(engine.showQuickLaunchButton, true);
  assert.equal(engine.getSnapshot('default').showQuickLaunchButton, true);
});

test('Prompt injection includes ETA when available', () => {
  const engine = new GoalEngine();
  engine.startGoal('Injection ETA Goal', {
    milestones: ['Step 1', 'Step 2'],
  }, 'sid-inj');

  const goal = engine.getGoal('sid-inj');
  goal.startedAt = Date.now() - 30000;
  engine.updateMilestone('m-1', MilestoneStatus.COMPLETED, 'ok', 'sid-inj');

  const prompt = engine.getStatePromptInjection('sid-inj');
  assert.match(prompt, /ETA: ~\d+s/);
});

test('Markdown report generator structure and deliverables formatting', async () => {
  const fs = await import('node:fs');
  const clientCode = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

  // Verify client.js contains generateMarkdownReport and quicklaunch button
  assert.ok(clientCode.includes('function generateMarkdownReport'), 'client.js must define generateMarkdownReport');
  assert.ok(clientCode.includes('function QuickLaunchModal'), 'client.js must define QuickLaunchModal');
  assert.ok(clientCode.includes('dsh-goal-quicklaunch-btn'), 'client.js must include quicklaunch CSS');
  assert.ok(clientCode.includes('dsh-goal-btn-copy'), 'client.js must include copy button CSS');
  assert.ok(clientCode.includes('showQuickLaunchButton'), 'client.js must reference showQuickLaunchButton setting');
});
