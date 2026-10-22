import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, MilestoneStatus } from '../lib/goal-engine.js';
import {
  compactMilestone,
  buildCompactedMilestonesHistory,
  estimateCompactionSavings,
  formatRawMilestoneTrace,
} from '../lib/engine-compaction.js';
import { buildStatePromptInjection } from '../lib/engine-prompt.js';

test('Milestone Compaction (Issue #167): compactMilestone generates high-density summary', () => {
  const m1 = {
    id: 'm-1',
    title: 'Initialize repository structure',
    status: 'completed',
    notes: 'Config, dependencies, and base files established',
    checklist: [
      { text: 'Create directory tree', done: true },
      { text: 'Install dependencies', done: true },
      { text: 'Setup build pipeline', done: true },
    ],
    verificationCommand: 'npm run test:base',
    verificationPassed: true,
  };

  const res = compactMilestone(m1);
  assert.ok(res, 'Must return summary object');
  assert.equal(res.id, 'm-1');
  assert.equal(res.title, 'Initialize repository structure');
  assert.ok(m1.compactionSummary, 'compactionSummary must be attached to milestone');
  assert.ok(m1.compactionSummary.includes('[M-1 COMPLETED]'));
  assert.ok(m1.compactionSummary.includes('Outcome: Config, dependencies, and base files established'));
  assert.ok(m1.compactionSummary.includes('[3/3 subtasks]'));
  assert.ok(m1.compactionSummary.includes('[Gate: verified]'));
});

test('Milestone Compaction (Issue #167): buildCompactedMilestonesHistory formats for en and zh', () => {
  const milestones = [
    {
      id: 'm-1',
      title: 'Setup Architecture',
      status: 'completed',
      notes: 'Components scaffolded',
      compactionSummary: '[M-1 COMPLETED] Setup Architecture (Outcome: Components scaffolded)',
    },
    {
      id: 'm-2',
      title: 'Database Migrations',
      status: 'completed',
      notes: 'Schema v1 applied',
      compactionSummary: '[M-2 COMPLETED] Database Migrations (Outcome: Schema v1 applied)',
    },
    {
      id: 'm-3',
      title: 'API Endpoints',
      status: 'in_progress',
    },
  ];

  const enHistory = buildCompactedMilestonesHistory(milestones, 'en');
  assert.ok(enHistory.includes('[COMPACTED MILESTONES HISTORY]'));
  assert.ok(enHistory.includes('- [M-1 COMPLETED] Setup Architecture'));
  assert.ok(enHistory.includes('- [M-2 COMPLETED] Database Migrations'));
  assert.equal(enHistory.includes('API Endpoints'), false, 'In-progress milestone must not be in compacted history');

  const zhHistory = buildCompactedMilestonesHistory(milestones, 'zh');
  assert.ok(zhHistory.includes('[已完成里程碑历史简报 / COMPACTED MILESTONES HISTORY]'));
  assert.ok(zhHistory.includes('- [M-1 COMPLETED] Setup Architecture'));
});

test('Milestone Compaction (Issue #167): estimateCompactionSavings achieves > 40% reduction on long milestones', () => {
  const verboseMilestones = [
    {
      id: 'm-1',
      title: 'Deep Research and Architecture Specification',
      status: 'completed',
      notes: 'Comprehensive 12-page architecture specification written and aligned with requirements.',
      verificationCommand: 'npx eslint --max-warnings=0 src/architecture/**/*.js && npx jest --coverage',
      verificationPassed: true,
      checklist: [
        { text: 'Analyze competing models and requirements documentation in detail', done: true },
        { text: 'Review database schemas and entity relationships for circular dependencies', done: true },
        { text: 'Formulate security threat model and boundary authorization policy', done: true },
        { text: 'Draft migration script and rollback safety checkpoints', done: true },
      ],
    },
    {
      id: 'm-2',
      title: 'Data Access Layer and Transaction Pipeline',
      status: 'completed',
      notes: 'Optimistic locking, retry queues, and atomic commits verified against chaos suite.',
      verificationCommand: 'npm run test:db:chaos && npm run test:transactions',
      verificationPassed: true,
      checklist: [
        { text: 'Implement connection pool auto-scaling with failover detection', done: true },
        { text: 'Add unit tests for deadlocks, timeout handlers, and orphaned locks', done: true },
        { text: 'Profile query latency under simulated high-concurrency load', done: true },
      ],
    },
  ];

  for (const m of verboseMilestones) {
    compactMilestone(m);
  }

  const savings = estimateCompactionSavings(verboseMilestones, 'en');
  assert.equal(savings.completedCount, 2);
  assert.ok(savings.uncompactedChars > savings.compactedChars, 'Compacted must be smaller than uncompacted');
  assert.ok(savings.savingsRatio >= 0.40, `Savings ratio must be >= 0.40 (40%), got ${savings.savingsRatio} (${savings.savingsPercent})`);
});

test('Milestone Compaction (Issue #167): GoalEngine auto-compacts on milestone completion and exposes savings', () => {
  const engine = new GoalEngine({ autoBranchOnGoalStart: false, autoBranch: false });
  engine.startGoal('Compaction test goal', {
    milestones: [
      {
        id: 'm-1',
        title: 'Phase 1: Database Setup',
        checklist: [
          { text: 'Create database container and configure permissions', done: true },
          { text: 'Execute database schema migrations v1 through v5', done: true },
          { text: 'Seed initial tenant configuration and test fixtures', done: true },
        ],
      },
      { id: 'm-2', title: 'Phase 2', checklist: [{ text: 'Task 2', done: false }] },
    ],
  }, 'compaction-sess');

  const goal = engine.goals.get('compaction-sess');
  assert.ok(goal);

  // Complete milestone 1
  const updated = engine.updateMilestone('m-1', MilestoneStatus.COMPLETED, 'Phase 1 finished with success', 'compaction-sess');
  assert.equal(updated, true);

  const m1 = goal.milestones.find((m) => m.id === 'm-1');
  assert.ok(m1.compactionSummary, 'Milestone must possess compactionSummary');
  assert.ok(m1.compactionSummary.includes('Outcome: Phase 1 finished with success'));

  const savings = engine.getCompactionSavings('compaction-sess');
  assert.equal(savings.completedCount, 1);
  assert.ok(savings.savingsRatio > 0);
});

test('Milestone Compaction (Issue #167): buildStatePromptInjection injects compacted history and preserves active plan', () => {
  const engine = new GoalEngine({ autoBranchOnGoalStart: false, autoBranch: false });
  engine.startGoal('Prompt injection test', {
    milestones: [
      { id: 'm-1', title: 'Milestone One', status: 'completed', notes: 'First phase done' },
      { id: 'm-2', title: 'Milestone Two', status: 'in_progress', checklist: [{ text: 'Active subtask', done: false }] },
    ],
  }, 'inj-sess');

  const snap = engine.getSnapshot('inj-sess');
  const prompt = buildStatePromptInjection(snap, null);

  assert.ok(prompt.includes('[COMPACTED MILESTONES HISTORY]'), 'Must include compacted history block');
  assert.ok(prompt.includes('- [M-1 COMPLETED] Milestone One'));
  assert.ok(prompt.includes('Active & Upcoming Work Plan:'), 'Must label active section cleanly');
  assert.ok(prompt.includes('2. [IN_PROGRESS] Milestone Two'));
  assert.ok(prompt.includes('[ ] Active subtask'));
});
