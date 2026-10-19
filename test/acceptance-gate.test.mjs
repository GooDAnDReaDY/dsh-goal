import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMilestoneVerification, verifyMilestoneAcceptance } from '../lib/engine-verification.js';
import { GoalEngine, MilestoneStatus } from '../lib/goal-engine.js';
import { MilestoneManager } from '../lib/milestone-manager.js';
import { AddonStore } from '../lib/addon-store.js';
import { registerTools } from '../lib/tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.resolve(__dirname, '..', '.tmp-acceptance-test');

test('runMilestoneVerification: execution outcomes, timeout, and output capture', () => {
  // 1. Success execution
  const resSuccess = runMilestoneVerification("node -e 'console.log(\"all tests passed\"); process.exit(0);'");
  assert.equal(resSuccess.ok, true);
  assert.equal(resSuccess.exitCode, 0);
  assert.ok(resSuccess.stdout.includes('all tests passed'));
  assert.equal(resSuccess.stderr, '');

  // 2. Failing execution with non-zero exit code
  const resFail = runMilestoneVerification("node -e 'console.error(\"syntax or test failure\"); process.exit(2);'");
  assert.equal(resFail.ok, false);
  assert.equal(resFail.exitCode, 2);
  assert.ok(resFail.stderr.includes('syntax or test failure'));
  assert.ok(resFail.error.includes('exit code 2'));

  // 3. Timeout enforcement
  const resTimeout = runMilestoneVerification(
    "node -e 'setTimeout(() => {}, 5000);'",
    process.cwd(),
    { timeoutMs: 150 }
  );
  assert.equal(resTimeout.ok, false);
  assert.equal(resTimeout.exitCode, 124);
  assert.ok(resTimeout.error.includes('timed out'));

  // 4. Invalid or empty command
  const resEmpty = runMilestoneVerification('   ');
  assert.equal(resEmpty.ok, false);
  assert.ok(resEmpty.error.includes('Empty or invalid'));
});

test('verifyMilestoneAcceptance: records diagnostic logs and failure activities', () => {
  const targetPass = { id: 'm-1', title: 'Passing Step', verificationCommand: 'node -e "process.exit(0)"' };
  const goal = { milestones: [targetPass], logs: [] };
  const activities = [];
  const recordActivity = (_goal, act) => activities.push(act);

  const res1 = verifyMilestoneAcceptance(targetPass, process.cwd(), goal, recordActivity);
  assert.equal(res1.ok, true);
  assert.equal(res1.verified, true);
  assert.equal(targetPass.verificationError, null);
  assert.ok(typeof targetPass.verificationPassedAt === 'number');

  const targetFail = { id: 'm-2', title: 'Failing Step', verificationCommand: 'node -e "console.error(\\"lint error\\"); process.exit(1)"' };
  const goalFail = { milestones: [targetFail], logs: [] };
  const activitiesFail = [];
  const recordActivityFail = (_goal, act) => activitiesFail.push(act);

  const res2 = verifyMilestoneAcceptance(targetFail, process.cwd(), goalFail, recordActivityFail);
  assert.equal(res2.ok, false);
  assert.equal(res2.verified, true);
  assert.ok(targetFail.verificationError.includes('exit code 1'));
  assert.ok(targetFail.verificationOutput.includes('lint error'));
  assert.equal(activitiesFail.length, 1);
  assert.equal(activitiesFail[0].status, 'error');
  assert.ok(activitiesFail[0].details.includes('Verification failed'));
  assert.equal(goalFail.logs.length, 1);
  assert.ok(goalFail.logs[0].message.includes('Acceptance gate failed for [Failing Step]'));
});

test('MilestoneManager: acceptance gate blocks completion and records failure state', () => {
  const store = new AddonStore(null);
  let snapshotCalled = false;
  const mockSnapshotManager = {
    createSnapshot: () => {
      snapshotCalled = true;
      return 'commit-abc';
    },
  };
  const mm = new MilestoneManager(store, { gitSnapshotManager: mockSnapshotManager });

  mm.setMilestones('goal-1', [
    {
      id: 'm-1',
      title: 'Run lint check',
      verificationCommand: 'node -e "process.exit(1)"',
      checklist: ['Code review', 'Run linter'],
    },
    {
      id: 'm-2',
      title: 'Run passing tests',
      verificationCommand: 'node -e "process.exit(0)"',
    },
  ]);

  // Attempt completing m-1 with failing verification -> must throw error
  assert.throws(() => {
    mm.completeMilestone('goal-1', 'm-1', 'Done linting', process.cwd());
  }, /Acceptance gate failed for milestone "m-1"/);

  const listAfterFail = mm.getMilestones('goal-1');
  const m1 = listAfterFail.find((m) => m.id === 'm-1');
  assert.equal(m1.completed, false);
  assert.ok(m1.verificationError.includes('exit code 1'));
  assert.equal(snapshotCalled, false);

  // Complete m-2 with passing verification -> succeeds
  const completeRes = mm.completeMilestone('goal-1', 'm-2', 'Passed tests', process.cwd());
  assert.equal(completeRes.milestone.completed, true);
  assert.equal(completeRes.milestone.verificationError, null);
  assert.ok(typeof completeRes.milestone.verificationPassedAt === 'number');
  assert.equal(snapshotCalled, true);
});

test('GoalEngine: updateMilestone atomic rejection on verification failure and snapshot integrity', () => {
  const engine = new GoalEngine({ autoCheckpointOnMilestone: false });
  engine.startGoal('Critic Verification Goal', {
    milestones: [
      {
        id: 'm-1',
        title: 'Step 1 Failing Gate',
        verificationCommand: 'node -e "process.exit(1)"',
      },
      {
        id: 'm-2',
        title: 'Step 2 Passing Gate',
        verificationCommand: 'node -e "process.exit(0)"',
      },
    ],
  }, 'sess-critic');

  // Attempt completing m-1 -> should fail and return false
  const ok1 = engine.updateMilestone('m-1', MilestoneStatus.COMPLETED, 'Attempt finish', 'sess-critic');
  assert.equal(ok1, false);

  const goal = engine.goals.get('sess-critic');
  const m1 = goal.milestones.find((m) => m.id === 'm-1');
  assert.equal(m1.status, MilestoneStatus.PENDING);
  assert.ok(m1.verificationError.includes('exit code 1'));
  assert.ok(goal.logs.some((l) => l.type === 'error' && l.message.includes('Acceptance gate failed')));

  // Now complete m-2 -> should succeed and return true
  const ok2 = engine.updateMilestone('m-2', MilestoneStatus.COMPLETED, 'Passed!', 'sess-critic');
  assert.equal(ok2, true);

  const m2 = goal.milestones.find((m) => m.id === 'm-2');
  assert.equal(m2.status, MilestoneStatus.COMPLETED);
  assert.equal(m2.verificationError, null);
  assert.ok(typeof m2.verificationPassedAt === 'number');
});

test('Tool integration: goal_milestones and goal_update_progress enforce acceptance gate', async () => {
  const store = new AddonStore(null);
  const mm = new MilestoneManager(store);
  const tools = new Map();
  const mockCtx = {
    inject: (deps, fn) => fn(mockCtx),
    tools: {
      register: (def) => {
        tools.set(def.name, def);
        return () => {};
      },
    },
  };

  registerTools(mockCtx, { milestoneManager: mm });

  const goalMilestonesTool = tools.get('goal_milestones');
  const goalUpdateProgressTool = tools.get('goal_update_progress');
  assert.ok(goalMilestonesTool);
  assert.ok(goalUpdateProgressTool);

  const toolCtx = { session: { cwd: process.cwd() } };

  // Set milestones with acceptance gate
  await goalMilestonesTool.execute({
    action: 'set',
    goalId: 'tool-goal-1',
    milestones: [
      {
        title: 'Step with acceptance gate',
        verificationCommand: 'node -e "process.exit(3)"',
      },
    ],
  }, toolCtx);

  const list = mm.getMilestones('tool-goal-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'm-1');
  assert.equal(list[0].verificationCommand, 'node -e "process.exit(3)"');

  // Attempt completing via goal_milestones action: 'complete' -> throws with verification feedback
  await assert.rejects(
    async () => {
      await goalMilestonesTool.execute({
        action: 'complete',
        goalId: 'tool-goal-1',
        milestoneId: 'm-1',
      }, toolCtx);
    },
    /Acceptance gate failed for milestone "m-1"/
  );

  assert.equal(mm.getMilestones('tool-goal-1')[0].completed, false);

  // Attempt completing via goal_update_progress status: 'completed' -> throws with verification feedback
  await assert.rejects(
    async () => {
      await goalUpdateProgressTool.execute({
        goalId: 'tool-goal-1',
        milestone_id: 'm-1',
        status: 'completed',
      }, toolCtx);
    },
    /Acceptance gate failed for milestone "m-1"/
  );

  assert.equal(mm.getMilestones('tool-goal-1')[0].completed, false);

  // Update verification command to passing command
  await goalUpdateProgressTool.execute({
    goalId: 'tool-goal-1',
    milestone_id: 'm-1',
    status: 'in_progress',
    verificationCommand: 'node -e "process.exit(0)"',
  }, toolCtx);

  // Now complete successfully
  const finishRes = await goalMilestonesTool.execute({
    action: 'complete',
    goalId: 'tool-goal-1',
    milestoneId: 'm-1',
  }, toolCtx);

  assert.equal(finishRes.ok, true);
  assert.equal(mm.getMilestones('tool-goal-1')[0].completed, true);
});
