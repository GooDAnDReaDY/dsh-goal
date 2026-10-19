import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState, GoalMode } from '../lib/goal-engine.js';

test('Task 1: GoalMode export has PLAN and ACT', () => {
  assert.equal(GoalMode.PLAN, 'plan');
  assert.equal(GoalMode.ACT, 'act');
});

test('Task 1: GoalEngine starts in plan mode when requested', () => {
  const engine = new GoalEngine({ storagePath: null });
  const snapshot = engine.startGoal('Refactor database queries', { mode: 'plan' });
  assert.equal(snapshot.mode, GoalMode.PLAN);
  assert.equal(snapshot.state, GoalState.PLANNING);
  assert.equal(engine.isPlanMode(), true);
});

test('Task 1: GoalEngine defaults to act mode when not specified', () => {
  const engine = new GoalEngine({ storagePath: null });
  const snapshot = engine.startGoal('Run quick fix');
  assert.equal(snapshot.mode, GoalMode.ACT);
  assert.equal(snapshot.state, GoalState.RUNNING);
  assert.equal(engine.isPlanMode(), false);
});

test('Task 1: GoalEngine transitions from plan mode to act mode on approvePlan', () => {
  const engine = new GoalEngine({ storagePath: null });
  engine.startGoal('Refactor database queries', { mode: 'plan' });
  assert.equal(engine.isPlanMode(), true);
  
  const updated = engine.approvePlan();
  assert.equal(updated.mode, GoalMode.ACT);
  assert.equal(updated.state, GoalState.RUNNING);
  assert.equal(engine.isPlanMode(), false);
  
  // Verify log contains plan approval entry
  const logs = updated.logs || [];
  assert.ok(logs.some((l) => l.message && l.message.includes('Plan approved')));
});

test('Task 1: GoalEngine setMode validates mode and transitions correctly', () => {
  const engine = new GoalEngine({ storagePath: null });
  engine.startGoal('Task with transitions', { mode: 'act' });
  assert.equal(engine.isPlanMode(), false);
  
  engine.setMode(GoalMode.PLAN);
  assert.equal(engine.isPlanMode(), true);
  assert.equal(engine.getSnapshot().mode, GoalMode.PLAN);
  
  assert.throws(() => engine.setMode('invalid_mode'), /Invalid mode/);
});