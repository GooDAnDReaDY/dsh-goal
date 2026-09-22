import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  GoalEngine,
  GoalState,
  MilestoneStatus,
  getGitCurrentCommit,
  exportReportMarkdown,
  exportReportGitHubPR,
} from '../lib/goal-engine.js';

test('getGitCurrentCommit returns short commit hash or null gracefully', () => {
  const commit = getGitCurrentCommit();
  if (commit !== null) {
    assert.match(commit, /^[a-f0-9]{6,40}$/i);
  }
});

test('GoalEngine.startGoal records gitStartCommit', () => {
  const engine = new GoalEngine();
  engine.startGoal('Git Checkpoint Goal', { gitStartCommit: 'f1e2d3c' }, 'sid-git');

  const snap = engine.getSnapshot('sid-git');
  assert.equal(snap.gitStartCommit, 'f1e2d3c');

  const goal = engine.getGoal('sid-git');
  assert.ok(goal.logs.some(l => l.message.includes('Git: f1e2d3c')));
});

test('exportReportMarkdown and exportReportGitHubPR format telemetry and milestones', () => {
  const state = {
    title: 'Autonomous Refactoring Feature',
    state: GoalState.COMPLETED,
    formattedElapsed: '4m 30s',
    iterationsCount: 7,
    maxIterations: 20,
    gitStartCommit: 'a9b8c7d',
    tokensUsage: { promptTokens: 12500, completionTokens: 2100, totalTokens: 14600 },
    resultSummary: 'Refactored module, eliminated 120 lines of redundant boilerplate.',
    milestones: [
      { title: 'Audit module structure', status: MilestoneStatus.COMPLETED, notes: 'done' },
      { title: 'Inline single-caller functions', status: MilestoneStatus.COMPLETED, notes: 'done' },
      { title: 'Verify regression tests', status: MilestoneStatus.COMPLETED, notes: 'all 50 passed' },
    ],
  };

  const mdReport = exportReportMarkdown(state);
  assert.match(mdReport, /# 🎯 Goal Report: Autonomous Refactoring Feature/);
  assert.match(mdReport, /\*\*Git Start:\*\* `a9b8c7d`/);
  assert.match(mdReport, /Tokens:.*14,600/);
  assert.match(mdReport, /Audit module structure/);

  const prReport = exportReportGitHubPR(state);
  assert.match(prReport, /## 🎯 Autonomous Goal Resolution: Autonomous Refactoring Feature/);
  assert.match(prReport, /\*\*Git Start:\*\* `a9b8c7d` 📌/);
  assert.match(prReport, /<details>/);
  assert.match(prReport, /<summary><b>📋 Milestones Breakdown \(3\/3 Completed\)<\/b><\/summary>/);
  assert.match(prReport, /Refactored module, eliminated 120 lines/);
});

test('client.js includes QUICK_LAUNCH_TEMPLATES with 10 engineering scenarios', () => {
  const clientCode = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
  assert.ok(clientCode.includes('const QUICK_LAUNCH_TEMPLATES = ['), 'Must define QUICK_LAUNCH_TEMPLATES');
  assert.ok(clientCode.includes('dsh-goal-template-chip'), 'Must include template chip CSS class');
  assert.ok(clientCode.includes('generateGitHubPRComment'), 'Must define generateGitHubPRComment');
  assert.ok(clientCode.includes('dsh-goal-nudge-box'), 'Must include nudge UI box');

  // Verify 10 distinct template ids are present
  const expectedTemplates = ['fix', 'refactor', 'tests', 'review', 'feature', 'security', 'docs', 'upgrade', 'cleanup', 'perf'];
  for (const tid of expectedTemplates) {
    assert.ok(clientCode.includes(`id: '${tid}'`), `Template '${tid}' must be present in QUICK_LAUNCH_TEMPLATES`);
  }
});
