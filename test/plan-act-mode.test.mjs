import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
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
// Task 3 Tests
import { registerRoutes } from '../lib/routes.js';

test('Task 3: POST /dsh-goal/action start with mode plan sets plan mode', async () => {
  const engine = new GoalEngine({ storagePath: null });
  let routeHandler = null;
  registerRoutes({
    webServer: { register: ({ handler }) => { routeHandler = handler; return () => {}; } },
    effect: (fn) => fn(),
  }, { engine });

  const sendReq = (body) => new Promise((resolve) => {
    let output = '';
    const req = {
      method: 'POST',
      url: '/dsh-goal/action',
      headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '127.0.0.1' },
      on: (ev, fn) => {
        if (ev === 'data') fn(Buffer.from(JSON.stringify(body)));
        if (ev === 'end') fn();
      },
    };
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (data) => {
        output = data;
        resolve({ statusCode: res.statusCode, body: JSON.parse(output || '{}') });
      },
    };
    routeHandler(req, res);
  });

  const startRes = await sendReq({
    action: 'start',
    title: 'Audit project security',
    mode: 'plan',
  });

  assert.equal(startRes.statusCode, 200);
  assert.equal(startRes.body.ok, true);
  assert.equal(startRes.body.state.mode, 'plan');
  assert.equal(startRes.body.state.state, 'PLANNING');
  assert.equal(engine.isPlanMode(), true);
});

test('Task 3: POST /dsh-goal/action set_mode and approve_plan', async () => {
  const engine = new GoalEngine({ storagePath: null });
  let resumedPrompt = null;
  const resumeActiveAgent = (prompt) => { resumedPrompt = prompt; };

  let routeHandler = null;
  registerRoutes({
    webServer: { register: ({ handler }) => { routeHandler = handler; return () => {}; } },
    effect: (fn) => fn(),
  }, { engine, resumeActiveAgent });

  const sendReq = (body) => new Promise((resolve) => {
    let output = '';
    const req = {
      method: 'POST',
      url: '/dsh-goal/action',
      headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '127.0.0.1' },
      on: (ev, fn) => {
        if (ev === 'data') fn(Buffer.from(JSON.stringify(body)));
        if (ev === 'end') fn();
      },
    };
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (data) => {
        output = data;
        resolve({ statusCode: res.statusCode, body: JSON.parse(output || '{}') });
      },
    };
    routeHandler(req, res);
  });

  // Start in plan mode
  await sendReq({ action: 'start', title: 'Plan task', mode: 'plan' });
  assert.equal(engine.isPlanMode(), true);

  // Invalid set_mode -> 400
  const badMode = await sendReq({ action: 'set_mode', mode: 'unknown' });
  assert.equal(badMode.statusCode, 400);

  // Valid approve_plan -> 200, switched to act mode, resumed agent
  const approved = await sendReq({ action: 'approve_plan' });
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.body.ok, true);
  assert.equal(approved.body.state.mode, 'act');
  assert.equal(approved.body.state.state, 'RUNNING');
  assert.equal(engine.isPlanMode(), false);
  assert.ok(resumedPrompt && resumedPrompt.includes('Plan approved'));

  // Switch back to plan mode via set_mode
  const backToPlan = await sendReq({ action: 'set_mode', mode: 'plan' });
  assert.equal(backToPlan.statusCode, 200);
  assert.equal(backToPlan.body.state.mode, 'plan');
  assert.equal(backToPlan.body.state.state, 'PLANNING');
  assert.equal(engine.isPlanMode(), true);
});

test('Task 4: client UI fragments and bundle contain Plan Mode badges and approve action', () => {
  const clientPath = path.join(rootDir, 'lib', 'client.js');
  const clientContent = fs.readFileSync(clientPath, 'utf8');

  // Badge CSS classes
  assert.ok(clientContent.includes('.dsh-goal-badge-plan'), 'Must include .dsh-goal-badge-plan');
  assert.ok(clientContent.includes('.dsh-goal-badge-act'), 'Must include .dsh-goal-badge-act');
  assert.ok(clientContent.includes('.dsh-goal-btn-approve'), 'Must include .dsh-goal-btn-approve');
  assert.ok(clientContent.includes('.dsh-goal-plan-banner'), 'Must include .dsh-goal-plan-banner');

  // Locales
  assert.ok(clientContent.includes("approveAndExecute: 'Approve & Execute'"), 'Must include English approveAndExecute');
  assert.ok(clientContent.includes("approveAndExecute: '批准并执行'"), 'Must include Chinese approveAndExecute');
  assert.ok(clientContent.includes("planMode: 'Plan Mode'"), 'Must include English planMode');
  assert.ok(clientContent.includes("planMode: '规划模式'"), 'Must include Chinese planMode');

  // Action dispatch
  assert.ok(clientContent.includes("'approve_plan'"), 'Must trigger approve_plan action');
});
