import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState, MilestoneStatus, formatElapsed } from '../lib/goal-engine.js';

test('formatElapsed formats seconds into concise human readable text', () => {
  assert.equal(formatElapsed(0), '0s');
  assert.equal(formatElapsed(2), '2s');
  assert.equal(formatElapsed(59), '59s');
  assert.equal(formatElapsed(60), '1m');
  assert.equal(formatElapsed(75), '1m 15s');
  assert.equal(formatElapsed(3600), '1h');
  assert.equal(formatElapsed(3665), '1h 1m');
});

test('GoalEngine starts in IDLE state', () => {
  const engine = new GoalEngine();
  const snapshot = engine.getSnapshot();
  assert.equal(snapshot.hasActiveGoal, false);
  assert.equal(snapshot.state, GoalState.IDLE);
  assert.equal(snapshot.title, '');
});

test('GoalEngine startGoal initializes active goal correctly', () => {
  const engine = new GoalEngine({ defaultMaxIterations: 30 });
  const snapshot = engine.startGoal('Fix auth token refresh', {
    description: 'Ensure expired tokens are refreshed transparently',
    milestones: ['Analyze auth module', 'Add refresh token handler', 'Write tests'],
  });

  assert.equal(snapshot.hasActiveGoal, true);
  assert.equal(snapshot.state, GoalState.RUNNING);
  assert.equal(snapshot.title, 'Fix auth token refresh');
  assert.equal(snapshot.maxIterations, 30);
  assert.equal(snapshot.milestones.length, 3);
  assert.equal(snapshot.milestones[0].title, 'Analyze auth module');
  assert.equal(snapshot.milestones[0].status, MilestoneStatus.PENDING);
  assert.equal(snapshot.progressPercent, 0);
});

test('GoalEngine handles pause, resume, milestone updates and completion', async () => {
  const engine = new GoalEngine();
  engine.startGoal('Refactor database queries', {
    milestones: ['Step 1: Indexes', 'Step 2: Pooling'],
  });

  // Pause
  let snap = engine.pause('Need user feedback');
  assert.equal(snap.state, GoalState.PAUSED);

  // Resume
  snap = engine.resume();
  assert.equal(snap.state, GoalState.RUNNING);

  // Update milestone
  const m1Id = snap.milestones[0].id;
  const updated = engine.updateMilestone(m1Id, MilestoneStatus.COMPLETED, 'Indexes applied');
  assert.equal(updated, true);

  snap = engine.getSnapshot();
  assert.equal(snap.milestones[0].status, MilestoneStatus.COMPLETED);
  assert.equal(snap.progressPercent, 50);

  // Complete Goal
  snap = engine.completeGoal('All queries optimized successfully');
  assert.equal(snap.state, GoalState.COMPLETED);
  assert.equal(snap.progressPercent, 100);
  assert.equal(snap.resultSummary, 'All queries optimized successfully');
});

test('GoalEngine enforces maxIterations safety limit', () => {
  const engine = new GoalEngine();
  engine.startGoal('Loop test', { maxIterations: 3 });

  assert.equal(engine.incrementIteration(), true); // 1
  assert.equal(engine.incrementIteration(), true); // 2
  assert.equal(engine.incrementIteration(), false); // 3 reached max -> FAILED

  const snap = engine.getSnapshot();
  assert.equal(snap.state, GoalState.FAILED);
});

test('GoalEngine subscription receives state updates', () => {
  const engine = new GoalEngine();
  const states = [];
  const unsubscribe = engine.subscribe((snap) => {
    states.push(snap.state);
  });

  engine.startGoal('Notification check');
  engine.pause();
  engine.resume();
  engine.cancel();

  unsubscribe();
  engine.clear();

  assert.deepEqual(states, [
    GoalState.RUNNING,
    GoalState.PAUSED,
    GoalState.RUNNING,
    GoalState.CANCELLED,
  ]);
});
