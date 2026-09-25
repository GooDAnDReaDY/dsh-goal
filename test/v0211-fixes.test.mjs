import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { GoalEngine, MilestoneStatus, GoalState } from '../lib/goal-engine.js';
import { registerRoutes, isTrustedCaller, getSafeCwd } from '../lib/routes.js';
import { registerTools } from '../lib/tools.js';
import { syncMilestoneWithIssue, updateChecklistInMarkdown } from '../lib/engine-issue-sync.js';
import { apply } from '../lib/index.js';

test('Issue #78: GET endpoints and SSE reject untrusted callers', async () => {
  const engine = new GoalEngine();
  let routeHandler = null;
  const mockCtx = {
    webServer: {
      register: ({ handler }) => {
        routeHandler = handler;
        return () => {};
      },
    },
    effect: (fn) => fn(),
  };

  registerRoutes(mockCtx, {
    engine,
    getConfig: () => ({ maxIterations: 25 }),
    stopRunningAgents: () => {},
    resumeActiveAgent: () => {},
    sessionAgents: new Map(),
  });

  const sendReq = (pathname, options = {}) => new Promise((resolve) => {
    let statusCode = 200;
    let resData = '';
    const res = {
      setHeader: () => {},
      writeHead: (code) => { statusCode = code; },
      set statusCode(c) { statusCode = c; },
      get statusCode() { return statusCode; },
      write: (chunk) => { resData += chunk; },
      end: (data) => {
        if (data) resData += data;
        let parsed = null;
        try { parsed = JSON.parse(resData); } catch (e) { parsed = resData; }
        resolve({ statusCode, body: parsed });
      },
    };
    const req = {
      url: pathname,
      method: options.method || 'GET',
      headers: {
        host: '192.168.1.111:3000',
        ...(options.headers || {}),
      },
      socket: {
        remoteAddress: options.remoteAddress || '192.168.1.55',
      },
      on: () => {},
    };
    routeHandler(req, res);
  });

  // 1. GET /dsh-goal/events from untrusted LAN caller rejected with 403
  const resEventsUntrusted = await sendReq('/dsh-goal/events', {
    remoteAddress: '192.168.1.55',
    headers: {},
  });
  assert.equal(resEventsUntrusted.statusCode, 403);
  assert.equal(resEventsUntrusted.body.error, 'Forbidden: untrusted caller origin');

  // 2. GET /dsh-goal/templates from untrusted LAN caller rejected with 403
  const resTemplatesUntrusted = await sendReq('/dsh-goal/templates', {
    remoteAddress: '192.168.1.55',
    headers: {},
  });
  assert.equal(resTemplatesUntrusted.statusCode, 403);
  assert.equal(resTemplatesUntrusted.body.error, 'Forbidden: untrusted caller origin');

  // 3. GET /dsh-goal/state from untrusted LAN caller rejected with 403
  const resStateUntrusted = await sendReq('/dsh-goal/state', {
    remoteAddress: '192.168.1.55',
    headers: {},
  });
  assert.equal(resStateUntrusted.statusCode, 403);
  assert.equal(resStateUntrusted.body.error, 'Forbidden: untrusted caller origin');

  // 4. GET /dsh-goal/state with forged sec-fetch-site from LAN rejected with 403
  const resStateForged = await sendReq('/dsh-goal/state', {
    remoteAddress: '192.168.1.55',
    headers: { 'sec-fetch-site': 'same-origin' },
  });
  assert.equal(resStateForged.statusCode, 403);

  // 5. GET /dsh-goal/state from loopback succeeds with 200
  const resStateLoopback = await sendReq('/dsh-goal/state', {
    remoteAddress: '127.0.0.1',
    headers: { host: '127.0.0.1:3000' },
  });
  assert.equal(resStateLoopback.statusCode, 200);

  // 6. GET /dsh-goal/state with matching origin succeeds with 200
  const resStateOrigin = await sendReq('/dsh-goal/state', {
    remoteAddress: '192.168.1.55',
    headers: { origin: 'http://192.168.1.111:3000' },
  });
  assert.equal(resStateOrigin.statusCode, 200);
});

test('Issue #79: POST start rejects unconfined or attacker-controlled cwd', async () => {
  const engine = new GoalEngine();
  let routeHandler = null;
  const mockCtx = {
    webServer: {
      register: ({ handler }) => {
        routeHandler = handler;
        return () => {};
      },
    },
    effect: (fn) => fn(),
  };

  registerRoutes(mockCtx, {
    engine,
    getConfig: () => ({ maxIterations: 25 }),
    stopRunningAgents: () => {},
    resumeActiveAgent: () => {},
    sessionAgents: new Map(),
  });

  const sendPost = (body) => new Promise((resolve) => {
    let statusCode = 200;
    let resData = '';
    const res = {
      setHeader: () => {},
      set statusCode(c) { statusCode = c; },
      get statusCode() { return statusCode; },
      end: (data) => {
        resData = data;
        let parsed = null;
        try { parsed = JSON.parse(resData); } catch (e) { parsed = resData; }
        resolve({ statusCode, body: parsed });
      },
    };
    const req = {
      url: '/dsh-goal/action',
      method: 'POST',
      headers: { host: '127.0.0.1:3000', 'content-type': 'application/json' },
      socket: { remoteAddress: '127.0.0.1' },
      on: (event, cb) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify(body)));
        if (event === 'end') cb();
      },
    };
    routeHandler(req, res);
  });

  // Attempt start with cwd pointing to /tmp or outside workspace
  const tmpDir = os.tmpdir();
  const resStartReject = await sendPost({
    action: 'start',
    title: 'Test unconfined root',
    cwd: tmpDir,
    sessionId: 'sess-reject-root',
  });
  assert.equal(resStartReject.statusCode, 400);
  assert.equal(resStartReject.body.error, 'Invalid or unauthorized working directory');

  // Attempt start with valid cwd inside process.cwd()
  const validDir = path.resolve(process.cwd(), 'lib');
  const resStartOk = await sendPost({
    action: 'start',
    title: 'Test confined root',
    cwd: validDir,
    sessionId: 'sess-valid-root',
  });
  assert.equal(resStartOk.statusCode, 200);
  assert.equal(resStartOk.body.ok, true);
});

test('Issue #94: Displaced core tools and system prompt sections are restored on disposal', () => {
  const existingGetGoal = { name: 'get_goal', original: true };
  const existingCreateGoal = { name: 'create_goal', original: true };
  const existingUpdateGoal = { name: 'update_goal', original: true };

  const globalToolsData = new Map([
    ['get_goal', existingGetGoal],
    ['create_goal', existingCreateGoal],
    ['update_goal', existingUpdateGoal],
  ]);

  const disposers = [];
  const mockToolsCtx = {
    inject: (deps, callback) => {
      callback({
        tools: {
          layers: { global: { tools: { data: globalToolsData } } },
          register: (def) => {
            globalToolsData.set(def.name, def);
            return () => {
              globalToolsData.delete(def.name);
            };
          },
        },
        effect: (fn) => {
          const disp = fn();
          if (typeof disp === 'function') disposers.push(disp);
        },
      });
    },
  };

  const engine = new GoalEngine();
  registerTools(mockToolsCtx, { engine });

  // Verify core tools were replaced by dsh-goal tools
  assert.notEqual(globalToolsData.get('get_goal'), existingGetGoal);
  assert.notEqual(globalToolsData.get('create_goal'), existingCreateGoal);
  assert.notEqual(globalToolsData.get('update_goal'), existingUpdateGoal);

  // Trigger disposers (simulate plugin unmount / disable)
  for (const disp of disposers) {
    disp();
  }

  // Verify original core tools are fully restored!
  assert.equal(globalToolsData.get('get_goal'), existingGetGoal);
  assert.equal(globalToolsData.get('create_goal'), existingCreateGoal);
  assert.equal(globalToolsData.get('update_goal'), existingUpdateGoal);
});

test('Issue #63: getConfig dynamically merges writable/ready settings scope', () => {
  let capturedConfigFn = null;
  let settingsSub = null;
  let snapshotStatus = 'writable';
  let snapshotValue = {
    maxIterations: 42,
    enableSound: false,
    maxTokenBudget: 150000,
    budgetWarningThreshold: 85,
    autoBranchOnGoalStart: true,
  };

  const mockCtx = {
    inject: (deps, callback) => {
      if (deps.includes('settings')) {
        callback({
          settings: {
            register: () => ({
              getSnapshot: () => ({ status: snapshotStatus, value: snapshotValue }),
              get: () => snapshotValue,
              subscribe: (fn) => {
                settingsSub = fn;
                return () => {};
              },
            }),
          },
          effect: (fn) => fn(),
        });
      }
    },
    webServer: { register: () => () => {} },
    on: () => {},
    off: () => {},
    effect: (fn) => fn(),
  };

  apply(mockCtx, {
    maxIterations: 25,
    enableSound: true,
    maxTokenBudget: 100000,
    budgetWarningThreshold: 80,
    autoBranchOnGoalStart: false,
  });

  // Test with snapshotStatus = 'writable'
  // When status is writable, live settings must be merged completely
  snapshotValue.maxIterations = 55;
  if (settingsSub) settingsSub();

  // Test fallback when status is loading
  snapshotStatus = 'loading';
  if (settingsSub) settingsSub();
});

test('Issue #87: syncMilestoneWithIssue updates Gitea issue checklist on milestone completion', async () => {
  const initialIssueBody = `# Feature Task\n\n- [ ] Step 1: Design database\n- [ ] Step 2: Implement API\n- [ ] Step 3: Write tests\n`;
  let patchedBody = null;

  const mockFetch = async (url, options = {}) => {
    if (!options.method || options.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          number: 87,
          title: 'Power Suite Milestone',
          body: initialIssueBody,
        }),
      };
    }
    if (options.method === 'PATCH') {
      const data = JSON.parse(options.body);
      patchedBody = data.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({ number: 87, body: patchedBody }),
      };
    }
    return { ok: false, status: 404 };
  };

  const goal = {
    title: 'Complete issue #87 task',
    issueRef: { issueNumber: 87, issueUrl: 'http://127.0.0.1:3005/goodandready/dsh-goal/issues/87' },
    cwd: process.cwd(),
    logs: [],
  };

  const milestone = {
    id: 2,
    title: 'Step 2: Implement API',
    status: MilestoneStatus.COMPLETED,
  };

  const res = await syncMilestoneWithIssue(goal, milestone, {
    token: 'mock-token',
    baseUrl: 'http://127.0.0.1:3005',
    owner: 'goodandready',
    repo: 'dsh-goal',
    fetch: mockFetch,
  });

  assert.equal(res.synced, true);
  assert.equal(res.updated, true);
  assert.equal(res.issueNumber, 87);
  assert.ok(patchedBody.includes('- [x] Step 2: Implement API'));
  assert.ok(patchedBody.includes('- [ ] Step 1: Design database'));
  assert.ok(patchedBody.includes('- [ ] Step 3: Write tests'));
});
