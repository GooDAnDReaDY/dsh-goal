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
// Task 2 Tests
import { isPermittedInPlanMode, createPlanModeGuard } from '../lib/tool-guard.js';

test('Task 2: isPermittedInPlanMode allows read-only and planning tools', () => {
  assert.equal(isPermittedInPlanMode('view_file', {}), true);
  assert.equal(isPermittedInPlanMode('read_file', {}), true);
  assert.equal(isPermittedInPlanMode('search_web', {}), true);
  assert.equal(isPermittedInPlanMode('goal_milestones', { action: 'set' }), true);
  assert.equal(isPermittedInPlanMode('goal_milestones', { action: 'add' }), true);
  assert.equal(isPermittedInPlanMode('ask_question', {}), true);
  assert.equal(isPermittedInPlanMode('brain_recall', {}), true);
  assert.equal(isPermittedInPlanMode('run_command', { CommandLine: 'git status' }), true);
  assert.equal(isPermittedInPlanMode('run_command', { CommandLine: 'ls -la' }), true);
});

test('Task 2: isPermittedInPlanMode blocks file writers and mutating commands', () => {
  assert.equal(isPermittedInPlanMode('write_to_file', {}), false);
  assert.equal(isPermittedInPlanMode('replace_file_content', {}), false);
  assert.equal(isPermittedInPlanMode('edit_file', {}), false);
  assert.equal(isPermittedInPlanMode('apply_diff', {}), false);
  assert.equal(isPermittedInPlanMode('run_command', { CommandLine: 'rm -rf /tmp/data' }), false);
  assert.equal(isPermittedInPlanMode('run_command', { CommandLine: 'echo "test" > file.txt' }), false);
  assert.equal(isPermittedInPlanMode('run_command', { CommandLine: 'git commit -m "wip"' }), false);
});

test('Task 2: createPlanModeGuard allows everything when not in plan mode', () => {
  const engine = new GoalEngine({ storagePath: null });
  engine.startGoal('Act mode goal', { mode: 'act' });
  const guard = createPlanModeGuard(engine);
  
  const result = guard({ name: 'write_to_file', sessionId: 'default', arguments: {} });
  assert.equal(result, undefined);
});

test('Task 2: createPlanModeGuard blocks file writes when in plan mode', () => {
  const engine = new GoalEngine({ storagePath: null });
  engine.startGoal('Plan mode goal', { mode: 'plan' });
  const guard = createPlanModeGuard(engine);
  
  const allowed = guard({ name: 'view_file', sessionId: 'default', arguments: {} });
  assert.equal(allowed, undefined);
  
  const blocked = guard({ name: 'write_to_file', sessionId: 'default', arguments: {} });
  assert.equal(typeof blocked, 'string');
  assert.ok(blocked.includes('[Plan Mode Active]'));
  assert.ok(blocked.includes('write_to_file'));
});