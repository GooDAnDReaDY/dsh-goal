import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GoalEngine, GoalState, MilestoneStatus } from '../lib/goal-engine.js';
import { saveGoalArtifact, rollbackToCheckpoint } from '../lib/engine-reports.js';
import { buildStatePromptInjection } from '../lib/engine-prompt.js';

test('Token Budget Guard: warns at threshold and soft-pauses at 100%', () => {
  const engine = new GoalEngine({
    defaultMaxIterations: 20,
    maxTokenBudget: 10000,
    budgetWarningThreshold: 80,
  });

  const snap = engine.startGoal('Test Budget Optimization', {}, 'sess-budget');
  assert.equal(snap.state, GoalState.RUNNING);
  assert.equal(snap.budgetWarningTriggered, false);

  // Consume 75% -> no warning yet
  engine.addTokenUsage({ promptTokens: 5000, completionTokens: 2500 }, 'sess-budget');
  let state = engine.getSnapshot('sess-budget');
  assert.equal(state.tokensUsage.totalTokens, 7500);
  assert.equal(state.budgetWarningTriggered, false);

  // Consume another 10% -> 85% total -> triggers warning
  engine.addTokenUsage({ promptTokens: 500, completionTokens: 500 }, 'sess-budget');
  state = engine.getSnapshot('sess-budget');
  assert.equal(state.tokensUsage.totalTokens, 8500);
  assert.equal(state.budgetWarningTriggered, true);

  // Check that prompt injection contains budget alert
  const promptEn = buildStatePromptInjection(state);
  assert.ok(promptEn.includes('TOKEN BUDGET ALERT'), 'Prompt injection must include token budget alert');
  assert.ok(promptEn.includes('85% consumed'), 'Prompt injection must display percentage');

  // Chinese prompt check
  const stateZh = { ...state, lang: 'zh' };
  const promptZh = buildStatePromptInjection(stateZh);
  assert.ok(promptZh.includes('TOKEN 预算预警'), 'Chinese prompt must include budget alert');

  // Consume remaining to exceed 10,000 -> must soft-pause
  engine.addTokenUsage({ promptTokens: 1000, completionTokens: 1000 }, 'sess-budget');
  state = engine.getSnapshot('sess-budget');
  assert.equal(state.tokensUsage.totalTokens, 10500);
  assert.equal(state.state, GoalState.PAUSED, 'Goal must auto-pause when token budget is exceeded');

  // Test budget extension
  const extended = engine.extendBudget(50000, 'sess-budget');
  assert.equal(extended, true);
  state = engine.getSnapshot('sess-budget');
  assert.equal(state.state, GoalState.RUNNING, 'Goal must resume upon budget extension');
  assert.equal(state.maxTokenBudget, 60500);
  assert.equal(state.budgetWarningTriggered, false);
});

test('Sub-milestones: checklist validation, updates, and toggle', () => {
  const engine = new GoalEngine();
  engine.startGoal('Test Sub-milestones', {}, 'sess-sub');
  engine.addMilestones(['Design UI architecture', 'Implement Core Logic'], false, 'sess-sub');

  const checklistItems = [
    { text: 'Create wireframes', done: true },
    { text: 'Define CSS tokens', done: false },
    { text: 'Review accessibility', done: false },
  ];

  // Update milestone M1 with checklist
  const ok = engine.updateMilestone('M1', MilestoneStatus.IN_PROGRESS, 'Working on wireframes', 'sess-sub', checklistItems);
  assert.equal(ok, true);

  let state = engine.getSnapshot('sess-sub');
  const m1 = state.milestones.find((m) => m.id === 'm-1');
  assert.ok(m1);
  assert.equal(m1.checklist.length, 3);
  assert.equal(m1.checklist[0].done, true);
  assert.equal(m1.checklist[1].done, false);

  // Check prompt includes checklist
  const prompt = buildStatePromptInjection(state);
  assert.ok(prompt.includes('[x] Create wireframes'));
  assert.ok(prompt.includes('[ ] Define CSS tokens'));

  // Toggle item 1 (using M1 to verify flexible id matching)
  engine.toggleChecklistItem('M1', 1, true, 'sess-sub');
  state = engine.getSnapshot('sess-sub');
  const m1Updated = state.milestones.find((m) => m.id === 'm-1');
  assert.equal(m1Updated.checklist[1].done, true);
});

test('Artifact Export: saves goal markdown into .dsh/goals/', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-goal-artifact-test-'));
  try {
    const mockState = {
      title: 'Setup Production CI Pipeline',
      state: 'COMPLETED',
      formattedElapsed: '12m 30s',
      iterationsCount: 8,
      maxIterations: 25,
      tokensUsage: { promptTokens: 4500, completionTokens: 1200, totalTokens: 5700 },
      resultSummary: 'CI pipeline configured and verified on production runner.',
      milestones: [
        { id: 'M1', title: 'Install runner', status: 'completed', notes: 'Configured systemd unit' },
        { id: 'M2', title: 'Trigger smoke test', status: 'completed', notes: 'Smoke test passed' },
      ],
    };

    const artifact = saveGoalArtifact(mockState, tmpDir);
    assert.ok(artifact, 'saveGoalArtifact must return artifact object');
    assert.ok(fs.existsSync(artifact.fullPath), 'Artifact file must exist on disk');
    assert.ok(artifact.relativePath.startsWith('.dsh/goals/'));

    const diskContent = fs.readFileSync(artifact.fullPath, 'utf8');
    assert.ok(diskContent.includes('Setup Production CI Pipeline'));
    assert.ok(diskContent.includes('Install runner'));
    assert.ok(diskContent.includes('5,700'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
