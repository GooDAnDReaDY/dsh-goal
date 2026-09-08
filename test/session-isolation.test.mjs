import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GoalEngine, GoalState, MilestoneStatus } from '../lib/goal-engine.js';
import { formatGoalStartPrompt, executeGoalSlashCommand } from '../lib/command-handler.js';
import { apply } from '../lib/index.js';

test('GoalEngine supports multiple isolated sessions concurrently', () => {
  const engine = new GoalEngine({ storagePath: null });

  // Session A
  const snapA = engine.startGoal('Task in Session A', { milestones: ['Step A1', 'Step A2'] }, 'session-A');
  assert.equal(snapA.sessionId, 'session-A');
  assert.equal(snapA.title, 'Task in Session A');
  assert.equal(snapA.state, GoalState.RUNNING);

  // Session B
  const snapB = engine.startGoal('Task in Session B', { milestones: ['Step B1'] }, 'session-B');
  assert.equal(snapB.sessionId, 'session-B');
  assert.equal(snapB.title, 'Task in Session B');
  assert.equal(snapB.state, GoalState.RUNNING);

  // Default session remains IDLE
  const snapDef = engine.getSnapshot('default');
  assert.equal(snapDef.hasActiveGoal, false);
  assert.equal(snapDef.state, GoalState.IDLE);

  // Pause Session A, Session B remains RUNNING
  engine.pause('Pause A', 'session-A');
  assert.equal(engine.getSnapshot('session-A').state, GoalState.PAUSED);
  assert.equal(engine.getSnapshot('session-B').state, GoalState.RUNNING);

  // Update milestone in Session B
  const mB1Id = engine.getSnapshot('session-B').milestones[0].id;
  engine.updateMilestone(mB1Id, MilestoneStatus.COMPLETED, 'Done B1', 'session-B');
  assert.equal(engine.getSnapshot('session-B').milestones[0].status, MilestoneStatus.COMPLETED);
  assert.equal(engine.getSnapshot('session-A').milestones[0].status, MilestoneStatus.PENDING);

  // Complete Session B
  engine.completeGoal('Delivered B', 'session-B');
  assert.equal(engine.getSnapshot('session-B').state, GoalState.COMPLETED);
  assert.equal(engine.getSnapshot('session-A').state, GoalState.PAUSED);

  // Clear Session A
  engine.clear('session-A');
  assert.equal(engine.getSnapshot('session-A').hasActiveGoal, false);
  assert.equal(engine.getSnapshot('session-B').hasActiveGoal, true);
});

test('GoalEngine debounces writes and flushes cleanly on flushSync', async () => {
  const tmpFile = path.join(os.tmpdir(), `dsh-goal-debounce-${Date.now()}.json`);

  try {
    const engine = new GoalEngine({ storagePath: tmpFile });
    
    // Rapid non-immediate state changes should not continuously block disk IO
    engine.startGoal('Rapid task 1', {}, 'session-1');
    engine.addMilestones(['M1', 'M2'], true, 'session-1');
    engine.updateMilestone('m-1', MilestoneStatus.IN_PROGRESS, 'Starting', 'session-1');

    // flushSync forces pending writes to disk
    engine.flushSync();
    assert.ok(fs.existsSync(tmpFile), 'File must exist after flushSync');

    const content = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    assert.ok(content.sessions && content.sessions['session-1'], 'Saved JSON must contain session-1');
    assert.equal(content.sessions['session-1'].title, 'Rapid task 1');

    // Clean up
    engine.clear('session-1');
    assert.equal(fs.existsSync(tmpFile), false, 'Empty sessions file must be unlinked');
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('formatGoalStartPrompt and getStatePromptInjection enforce strict step-1 contract', () => {
  const startPrompt = formatGoalStartPrompt('Создать модуль авторизации');
  assert.ok(startPrompt.includes('ОБЯЗАТЕЛЬНЫЙ ШАГ №1'), 'Must include mandatory step 1 directive');
  assert.ok(startPrompt.includes('goal_set_milestones'), 'Must demand goal_set_milestones');
  assert.ok(startPrompt.includes('goal_update_progress'), 'Must instruct goal_update_progress');
  assert.ok(startPrompt.includes('goal_finish'), 'Must instruct goal_finish');

  const engine = new GoalEngine({ storagePath: null });
  engine.startGoal('Починить баг', {}, 'session-strict');
  const injectionEmpty = engine.getStatePromptInjection('session-strict');
  assert.ok(injectionEmpty.includes('ТВОЙ ПЕРВЫЙ ШАГ: Немедленно вызови инструмент goal_set_milestones'));

  engine.addMilestones(['Найти причину', 'Исправить'], true, 'session-strict');
  const injectionWithPlan = engine.getStatePromptInjection('session-strict');
  assert.ok(injectionWithPlan.includes('1. [PENDING] Найти причину'));
  assert.ok(injectionWithPlan.includes('2. [PENDING] Исправить'));
});

test('WebServer routes and coordinator isolate goals by sessionId', async () => {
  let routeHandler = null;
  let turnHandler = null;
  let approvalHandler = null;
  const followups = [];

  const mockCtx = {
    inject: () => {},
    webServer: {
      register: ({ handler }) => {
        routeHandler = handler;
        return () => {};
      },
    },
    on: (evt, fn) => {
      if (evt === 'turn/end') turnHandler = fn;
      if (evt === 'approval/asked') approvalHandler = fn;
    },
    off: () => {},
    effect: (fn) => fn(),
  };

  apply(mockCtx, {});
  assert.ok(routeHandler);
  assert.ok(turnHandler);
  assert.ok(approvalHandler);

  // 1. Start goal in session-X via POST /dsh-goal/action
  let resStatus = null;
  let resBody = '';
  const mockRes = {
    setHeader: () => {},
    set statusCode(v) { resStatus = v; },
    get statusCode() { return resStatus; },
    end: (d) => { resBody = d; },
  };

  const createReq = (method, url, data = null, headers = {}) => {
    return {
      method,
      url,
      headers: { host: 'localhost:3000', ...headers },
      on: (evt, cb) => {
        if (evt === 'data' && data) cb(JSON.stringify(data));
        if (evt === 'end') cb();
      },
    };
  };

  // Start goal in session-X
  routeHandler(createReq('POST', '/dsh-goal/action', {
    action: 'start',
    title: 'Goal X',
    sessionId: 'session-X',
  }), mockRes);

  const startParsed = JSON.parse(resBody);
  assert.equal(startParsed.ok, true);
  assert.equal(startParsed.state.title, 'Goal X');
  assert.equal(startParsed.state.sessionId, 'session-X');

  // GET /dsh-goal/state?sessionId=session-X
  routeHandler(createReq('GET', '/dsh-goal/state?sessionId=session-X'), mockRes);
  const getParsedX = JSON.parse(resBody);
  assert.equal(getParsedX.hasActiveGoal, true);
  assert.equal(getParsedX.title, 'Goal X');

  // GET /dsh-goal/state for session-Y returns IDLE
  routeHandler(createReq('GET', '/dsh-goal/state?sessionId=session-Y'), mockRes);
  const getParsedY = JSON.parse(resBody);
  assert.equal(getParsedY.hasActiveGoal, false);

  // Turn end on session-Y does not increment session-X
  turnHandler({ sessionId: 'session-Y' });
  routeHandler(createReq('GET', '/dsh-goal/state?sessionId=session-X'), mockRes);
  assert.equal(JSON.parse(resBody).iterationsCount, 0);

  // Approval asked on session-X pauses session-X
  approvalHandler({ sessionId: 'session-X' });
  routeHandler(createReq('GET', '/dsh-goal/state?sessionId=session-X'), mockRes);
  assert.equal(JSON.parse(resBody).state, GoalState.PAUSED);
});
