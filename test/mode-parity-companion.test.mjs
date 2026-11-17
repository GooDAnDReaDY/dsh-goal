import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenBudgetGuard } from '../lib/token-budget-guard.js';
import { MilestoneManager } from '../lib/milestone-manager.js';
import { AddonStore } from '../lib/addon-store.js';
import { registerRoutes } from '../lib/routes.js';
import { registerTools } from '../lib/tools.js';
import { apply } from '../lib/index.js';

test('Issue #193: TokenBudgetGuard.extendBudget increases effective budget and unblocks goal', () => {
  const guard = new TokenBudgetGuard({
    maxTokenBudget: 100000,
    warningThreshold: 80,
  });

  const mockAgent = { session: 'sess-1' };
  const mockGoal = { id: 'goal-budget-1', revision: 1, phase: 'active' };
  const mockMeter = {
    measure: () => ({ totalTokens: 100500 }),
  };

  // Initially exceeding 100k -> blocked
  const res1 = guard.checkBudget({
    agent: mockAgent,
    goal: mockGoal,
    tokenMeter: mockMeter,
  });
  assert.equal(res1.status, 'blocked');
  assert.equal(guard.blockedGoals.has('goal-budget-1'), true);

  // Extend budget by 50,000 tokens
  const ok = guard.extendBudget('goal-budget-1', 50000);
  assert.equal(ok, true);
  assert.equal(guard.getEffectiveBudget('goal-budget-1'), 150000);
  assert.equal(guard.blockedGoals.has('goal-budget-1'), false);

  // Check budget again with 100,500 tokens out of 150,000 (~67%) -> status ok
  const res2 = guard.checkBudget({
    agent: mockAgent,
    goal: mockGoal,
    tokenMeter: mockMeter,
  });
  assert.equal(res2.status, 'ok');
  assert.equal(res2.budget, 150000);
});

test('Issue #192: MilestoneManager.toggleChecklistItem toggles items safely in companion mode', () => {
  const store = new AddonStore(null);
  const manager = new MilestoneManager(store);

  const goalId = 'goal-checklist-1';
  manager.setMilestones(goalId, [
    {
      id: 'm-1',
      title: 'Setup Environment',
      checklist: [
        { text: 'Clone repository', done: true },
        { text: 'Run npm ci', done: false },
      ],
    },
  ]);

  // Toggle second item to true
  const ok1 = manager.toggleChecklistItem(goalId, 'm-1', 1, true);
  assert.equal(ok1, true);

  const milestones = manager.getMilestones(goalId);
  assert.equal(milestones[0].checklist[1].done, true);

  // Toggle back to false
  const ok2 = manager.toggleChecklistItem(goalId, 'm-1', 1, false);
  assert.equal(ok2, true);
  assert.equal(manager.getMilestones(goalId)[0].checklist[1].done, false);

  // Out of bounds / missing milestone returns false gracefully without throwing
  assert.equal(manager.toggleChecklistItem(goalId, 'non-existent', 0, true), false);
  assert.equal(manager.toggleChecklistItem(goalId, 'm-1', 99, true), false);
});

test('Issue #192 & #193: routes handle toggle_checklist_item and extend_budget in companion mode (engine === null)', async () => {
  const store = new AddonStore(null);
  const milestoneManager = new MilestoneManager(store);
  const budgetGuard = new TokenBudgetGuard({ maxTokenBudget: 50000 });
  const sid = 'sess-companion-1';

  milestoneManager.setMilestones(sid, [
    {
      id: 'm-1',
      title: 'Milestone 1',
      checklist: [{ text: 'Step A', done: false }],
    },
  ]);

  let resumedWith = null;
  const resumeActiveAgent = (prompt, id) => {
    resumedWith = { prompt, id };
  };

  let routeHandler = null;
  const mockWebServer = {
    register: (arg) => {
      routeHandler = typeof arg === 'function' ? arg : arg?.handler;
    },
  };
  const mockCtx = {
    webServer: mockWebServer,
    inject: (deps, cb) => cb(mockCtx),
    logger: () => ({ info() {}, warn() {}, error() {} }),
  };

  registerRoutes(mockCtx, {
    engine: null, // Companion mode!
    milestoneManager,
    budgetGuard,
    resumeActiveAgent,
  });

  assert.ok(routeHandler, 'Route handler should be registered');

  // Helper to dispatch mock POST requests
  const dispatchPost = async (body) => {
    const raw = JSON.stringify(body);
    const req = new EventEmitter();
    req.method = 'POST';
    req.url = '/dsh-goal/action';
    req.headers = {
      'host': '127.0.0.1:3000',
      'sec-fetch-site': 'same-origin',
    };
    req.socket = { remoteAddress: '127.0.0.1' };

    let resBody = '';
    const res = {
      statusCode: 200,
      setHeader() {},
      end(chunk) {
        if (chunk) resBody += chunk;
      },
    };

    const handlerPromise = routeHandler(req, res);
    req.emit('data', Buffer.from(raw));
    req.emit('end');
    await handlerPromise;
    return { status: res.statusCode, data: JSON.parse(resBody || '{}') };
  };

  // 1. Test toggle_checklist_item in companion mode
  const toggleRes = await dispatchPost({
    action: 'toggle_checklist_item',
    sessionId: sid,
    milestoneId: 'm-1',
    itemIndex: 0,
    done: true,
  });
  assert.equal(toggleRes.status, 200);
  assert.equal(toggleRes.data.ok, true);
  const state = toggleRes.data.state || toggleRes.data;
  assert.equal(state.milestones[0].checklist[0].done, true);

  // 2. Test extend_budget in companion mode
  const budgetRes = await dispatchPost({
    action: 'extend_budget',
    sessionId: sid,
    addTokens: 25000,
  });
  assert.equal(budgetRes.status, 200);
  assert.equal(budgetRes.data.ok, true);
  const bState = budgetRes.data.state || budgetRes.data;
  assert.equal(bState.extendedBy, 25000);
  assert.equal(bState.budget, 75000);
  assert.equal(resumedWith.id, sid);
});

test('Issue #194: routes reject unsupported standalone actions with 501 in companion mode', async () => {
  const sid = 'sess-unsupported-1';
  let routeHandler = null;
  const mockWebServer = {
    register: (arg) => {
      routeHandler = typeof arg === 'function' ? arg : arg?.handler;
    },
  };
  const mockCtx = {
    webServer: mockWebServer,
    inject: (deps, cb) => cb(mockCtx),
    logger: () => ({ info() {}, warn() {}, error() {} }),
  };

  registerRoutes(mockCtx, {
    engine: null, // Companion mode
  });

  const dispatchAction = async (action, extra = {}) => {
    const raw = JSON.stringify({ action, sessionId: sid, ...extra });
    const req = new EventEmitter();
    req.method = 'POST';
    req.url = '/dsh-goal/action';
    req.headers = {
      'host': '127.0.0.1:3000',
      'sec-fetch-site': 'same-origin',
    };
    req.socket = { remoteAddress: '127.0.0.1' };

    let resBody = '';
    const res = {
      statusCode: 200,
      setHeader() {},
      end(chunk) {
        if (chunk) resBody += chunk;
      },
    };

    const handlerPromise = routeHandler(req, res);
    req.emit('data', Buffer.from(raw));
    req.emit('end');
    await handlerPromise;
    return { status: res.statusCode, data: JSON.parse(resBody || '{}') };
  };

  // Actions that must reject with 501 MODE_NOT_SUPPORTED
  const unsupported = [
    { action: 'set_mode', extra: { mode: 'plan' } },
    { action: 'approve_plan' },
    { action: 'preplan_approve' },
    { action: 'spawn_subgoal', extra: { title: 'Child Goal' } },
    { action: 'kanban_move', extra: { cardId: 'c1' } },
    { action: 'kanban_sync' },
    { action: 'export_release_notes' },
    { action: 'notify_telegram' },
  ];

  for (const item of unsupported) {
    const res = await dispatchAction(item.action, item.extra);
    assert.equal(res.status, 501, `Action "${item.action}" must return 501 Not Implemented`);
    assert.equal(res.data.code, 'MODE_NOT_SUPPORTED', `Action "${item.action}" must return code MODE_NOT_SUPPORTED`);
    assert.equal(res.data.ok, false);
  }
});

test('Issue #194: tools goal_ask_operator and goal_spawn_subgoal return error in companion mode', async () => {
  let registeredTools = new Map();
  const mockCtx = {
    tools: {
      register: (tool) => {
        registeredTools.set(tool.name, tool);
      },
    },
    inject: (deps, cb) => cb(mockCtx),
    goalEngine: null, // Companion mode
  };

  registerTools(mockCtx, {
    engine: null,
  });

  const askTool = registeredTools.get('goal_ask_operator');
  const spawnTool = registeredTools.get('goal_spawn_subgoal');

  assert.ok(askTool, 'goal_ask_operator must be registered');
  assert.ok(spawnTool, 'goal_spawn_subgoal must be registered');

  // goal_ask_operator returns ok: false in companion mode
  const askRes = await askTool.execute({ question: 'Confirm deploy?' }, {});
  assert.equal(askRes.ok, false);
  assert.match(askRes.error, /standalone mode/);

  // goal_spawn_subgoal returns ok: false in companion mode
  const spawnRes = await spawnTool.execute({ title: 'Sub-goal 1' }, {});
  assert.equal(spawnRes.ok, false);
  assert.match(spawnRes.error, /standalone mode/);
});

test('Issue #191: Deterministic mode selection via standaloneMode and ctx.goals presence', () => {
  const createMockContext = (services = {}) => {
    const ctx = {
      ...services,
      webServer: { register: () => {} },
      logger: () => ({ info() {}, warn() {}, error() {} }),
      on: () => {},
      effect: (cb) => cb(),
      inject: (deps, cb) => cb(ctx),
      reflect: {
        get: (name) => services[name] || null,
      },
    };
    return ctx;
  };

  // 1. When ctx.goals exists and standaloneMode=false -> Companion mode (ctx.goalEngine is null)
  const ctxCompanion = createMockContext({
    goals: { get: () => null, block: () => {}, create: () => {} },
  });
  apply(ctxCompanion, { standaloneMode: false });
  assert.equal(ctxCompanion.goalEngine, null, 'Should run in companion mode without fallback engine');

  // 2. When standaloneMode=true -> Standalone mode forced even if ctx.goals is present
  const ctxForcedStandalone = createMockContext({
    goals: { get: () => null, block: () => {}, create: () => {} },
  });
  apply(ctxForcedStandalone, { standaloneMode: true });
  assert.ok(ctxForcedStandalone.goalEngine, 'Should run in standalone mode with GoalEngine');

  // 3. When ctx.goals is missing and standaloneMode=false -> Fallback standalone mode (for test runners / offline)
  const ctxFallback = createMockContext({});
  apply(ctxFallback, { standaloneMode: false });
  assert.ok(ctxFallback.goalEngine, 'Should fallback to GoalEngine when core goals service is absent');
});
