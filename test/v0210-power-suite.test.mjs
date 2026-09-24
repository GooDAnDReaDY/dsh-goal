import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState, MilestoneStatus } from '../lib/goal-engine.js';
import { recordActivity } from '../lib/engine-intervention.js';
import { sanitizeBranchSlug } from '../lib/engine-git-branch.js';
import { parseIssueRef, parseIssueChecklist, updateChecklistInMarkdown } from '../lib/engine-issue-sync.js';
import { generateRetrospectiveData } from '../lib/engine-retrospective.js';
import { getTemplatesCatalogue, instantiateTemplate, generatePreplanDraft } from '../lib/engine-templates.js';
import { isMilestoneBlocked } from '../lib/engine-milestones.js';
import { Config } from '../lib/index.js';

test('Issue #83: Pause & Intervene updates user directive and injects into prompt', () => {
  const engine = new GoalEngine({ storagePath: null });
  engine.startGoal('Test Intervention Workflow');
  engine.pause('Need manual adjustment');

  const res = engine.intervene({
    directive: 'Focus only on backend security hardening',
    milestones: [
      { id: '1', title: 'Step A: Audit endpoints', status: MilestoneStatus.COMPLETED },
      { id: '2', title: 'Step B: Apply rate limiting', status: MilestoneStatus.PENDING },
    ],
  });

  assert.equal(res.ok, true);
  const snap = engine.getSnapshot();
  assert.equal(snap.userDirective, 'Focus only on backend security hardening');
  assert.equal(snap.milestones.length, 2);
  assert.equal(snap.milestones[0].status, MilestoneStatus.COMPLETED);

  engine.resume();
  const prompt = engine.getStatePromptInjection();
  assert.ok(prompt.includes('USER INTERVENTION DIRECTIVE:'));
  assert.ok(prompt.includes('Focus only on backend security hardening'));
});

test('Issue #84: Live Activity Mini-Feed records activities and caps at 10', () => {
  const engine = new GoalEngine({ storagePath: null, enableLiveActivityFeed: true });
  engine.startGoal('Activity Feed Test');
  const goal = engine.goals.get('default');

  for (let i = 0; i < 20; i++) {
    recordActivity(goal, { type: 'tool', tool: 'exec', details: `Activity item #${i}` });
  }

  const snap = engine.getSnapshot();
  assert.ok(Array.isArray(snap.activityFeed));
  assert.equal(snap.activityFeed.length, 10);
  assert.equal(snap.activityFeed[snap.activityFeed.length - 1].details, 'Activity item #19');
});

test('Issue #85: Smart Goal Pre-planning generates drafts and supports approval', () => {
  const draft = generatePreplanDraft('Refactor User Authentication');
  assert.ok(Array.isArray(draft));
  assert.ok(draft.length >= 3);
  assert.ok(draft[0].title.length > 0);

  const engine = new GoalEngine({ storagePath: null, enablePreplanning: true });
  engine.startGoal('Build notification microservice');
  let snap = engine.getSnapshot();
  assert.equal(snap.preplan.active, true);
  assert.ok(snap.preplan.draftMilestones.length > 0);

  const snap2 = engine.approvePreplan();
  assert.equal(snap2.preplan.active, false);
  assert.ok(snap2.milestones.length > 0);
});

test('Issue #86: Auto-Branching Workflow sanitizes branch names cleanly', () => {
  const b1 = sanitizeBranchSlug('feat(auth): Add JWT refresh tokens!');
  assert.ok(b1.startsWith('goal/'));
  assert.ok(b1.includes('feat-auth-add-jwt-refresh-toke'));

  const b2 = sanitizeBranchSlug('Fix bug in /api/v1/users?id=123');
  assert.ok(b2.startsWith('goal/'));
  assert.ok(b2.includes('fix-bug-in-api-v1-users-id-123'));
});

test('Issue #87: Issue Checklist Sync parses and updates markdown checklists', () => {
  assert.deepEqual(parseIssueRef('#105'), { issueNumber: 105, issueUrl: null });
  assert.deepEqual(parseIssueRef('https://github.com/goodandready/dsh-goal/issues/42'), {
    issueNumber: 42,
    issueUrl: 'https://github.com/goodandready/dsh-goal/issues/42',
  });

  const md = `# Task List
- [ ] Task 1: Audit code
- [x] Task 2: Fix lint
- [ ] Task 3: Write tests`;

  const items = parseIssueChecklist(md);
  assert.equal(items.length, 3);
  assert.equal(items[0].done, false);
  assert.equal(items[1].done, true);
  assert.equal(items[2].text, 'Task 3: Write tests');

  const updated = updateChecklistInMarkdown(md, 'Task 1: Audit code', true);
  assert.ok(updated.includes('- [x] Task 1: Audit code'));
});

test('Issue #88: Post-Goal Retrospective Card generates complete execution metrics', () => {
  const goal = {
    title: 'Deploy microservice',
    startedAt: Date.now() - 45000,
    completedAt: Date.now(),
    totalPausedDurationMs: 5000,
    iterationsCount: 12,
    tokensUsage: { totalTokens: 28500 },
    activityFeed: [{ type: 'tool', status: 'success' }, { type: 'tool', status: 'error' }],
    milestones: [
      { id: 'm-1', status: MilestoneStatus.COMPLETED },
      { id: 'm-2', status: MilestoneStatus.COMPLETED },
    ],
  };

  const retro = generateRetrospectiveData(goal, process.cwd());
  assert.equal(retro.title, 'Deploy microservice');
  assert.ok(typeof retro.elapsedSeconds === 'number');
  assert.equal(retro.totalTokens, 28500);
  assert.equal(retro.totalMilestones, 2);
  assert.equal(retro.completedMilestones, 2);
  assert.equal(retro.totalToolCalls, 2);
  assert.equal(retro.failedToolCalls, 1);
  assert.equal(retro.toolFailureRate, 50);
  assert.ok(typeof retro.filesChangedCount === 'number');
});

test('Issue #89: Smart Budget Auto-Scale scales budget near completion', () => {
  const engine = new GoalEngine({
    storagePath: null,
    maxTokenBudget: 100000,
    autoScaleBudgetNearCompletion: true,
  });

  engine.startGoal('Budget auto scale test', {
    milestones: ['Step 1', 'Step 2', 'Step 3', 'Step 4'],
  });

  // Complete 3 out of 4 milestones -> 75% progress (completed === 4 - 1)
  engine.updateMilestone('1', MilestoneStatus.COMPLETED);
  engine.updateMilestone('2', MilestoneStatus.COMPLETED);
  engine.updateMilestone('3', MilestoneStatus.COMPLETED);

  let snap = engine.getSnapshot();
  assert.equal(snap.progressPercent, 75);

  // Add 105,000 tokens (exceeds 100k budget)
  engine.addTokenUsage({ totalTokens: 105000 });

  snap = engine.getSnapshot();
  assert.equal(snap.budgetAutoScaled, true);
  assert.equal(snap.maxTokenBudget, 120000, 'Budget should be extended by 20% buffer (120k)');
  assert.equal(snap.state, GoalState.RUNNING, 'Should NOT pause when auto-scaled near completion');
});

test('Issue #90: Templates Drawer catalogue and instantiation', () => {
  const catalogue = getTemplatesCatalogue();
  assert.ok(Array.isArray(catalogue));
  assert.ok(catalogue.length >= 5);

  const fixTpl = instantiateTemplate('bugfix-regression', { issueId: '#88 memory leak' });
  assert.ok(fixTpl.title.includes('#88 memory leak'));
  assert.ok(fixTpl.milestones.length >= 3);
});

test('Issue #91: Milestone Dependency Graph blocks execution until prerequisites complete', () => {
  const engine = new GoalEngine({
    storagePath: null,
    enableMilestoneDependencies: true,
  });

  engine.startGoal('Dependency test', {
    milestones: [
      { id: 'm1', title: 'Database schema migration' },
      { id: 'm2', title: 'Data population', dependsOn: ['m1'] },
    ],
  });

  let snap = engine.getSnapshot();
  assert.equal(isMilestoneBlocked(snap.milestones[1], snap.milestones).blocked, true);

  // Attempting to complete m2 while m1 is PENDING should be rejected
  const updatedM2 = engine.updateMilestone('m2', MilestoneStatus.COMPLETED);
  assert.equal(updatedM2, false);

  // Complete prerequisite m1
  const updatedM1 = engine.updateMilestone('m1', MilestoneStatus.COMPLETED);
  assert.equal(updatedM1, true);

  snap = engine.getSnapshot();
  assert.equal(isMilestoneBlocked(snap.milestones[1], snap.milestones).blocked, false);

  // Now completing m2 succeeds
  const updatedM2After = engine.updateMilestone('m2', MilestoneStatus.COMPLETED);
  assert.equal(updatedM2After, true);
});

test('Issue #92: Sound scheme and voice announcements configuration defaults', () => {
  const cfg = Config({});
  assert.equal(cfg.soundScheme, 'default');
  assert.equal(cfg.enableVoiceAnnouncements, false);
  assert.equal(cfg.enableLiveActivityFeed, true);
  assert.equal(cfg.enablePreplanning, true);
  assert.equal(cfg.autoBranchOnGoalStart, true);
  assert.equal(cfg.enablePostGoalRetrospective, true);
  assert.equal(cfg.autoScaleBudgetNearCompletion, false);
  assert.equal(cfg.enableTemplatesDrawer, true);
  assert.equal(cfg.enableMilestoneDependencies, true);

  const customCfg = Config({
    soundScheme: 'retro',
    enableVoiceAnnouncements: true,
    autoScaleBudgetNearCompletion: true,
  });
  assert.equal(customCfg.soundScheme, 'retro');
  assert.equal(customCfg.enableVoiceAnnouncements, true);
  assert.equal(customCfg.autoScaleBudgetNearCompletion, true);
});
