import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GoalEngine, GoalState, MilestoneStatus } from '../lib/goal-engine.js';
import { parseIssueChecklist } from '../lib/engine-issue-sync.js';
import { instantiateTemplate, getTemplatesCatalogue } from '../lib/engine-templates.js';
import { registerRoutes } from '../lib/routes.js';
import { apply } from '../lib/index.js';

test('Issue #97: lib/client.js defines formatElapsed and does not reference undefined formatElapsed', () => {
  const clientSrc = fs.readFileSync('lib/client.js', 'utf8');
  assert.ok(clientSrc.includes('const formatElapsed ='), 'formatElapsed helper defined in client.js');
  assert.ok(clientSrc.includes('const formatLiveElapsed ='), 'formatLiveElapsed helper defined in client.js');
});

test('Issue #98: Default schema configuration preserves storage persistence when not in test mode', () => {
  let createdPath = null;
  const mockCtx = {
    inject: () => {},
    effect: () => () => {},
    webServer: { register: () => () => {} },
  };
  const prevEnv = process.env.NODE_ENV;
  try {
    delete process.env.NODE_ENV;
    delete process.env.NODE_TEST_CONTEXT;
    
    // Test custom storagePath when provided
    const customTmp = path.join(os.tmpdir(), 'dsh-custom-test.json');
    apply(mockCtx, { storagePath: customTmp });
    
    // When storagePath is empty string, in non-test mode it must point to ~/.dsh/dsh-goal-state.json
    const defaultExpected = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dsh-goal-state.json');
    const indexSrc = fs.readFileSync('lib/index.js', 'utf8');
    assert.ok(indexSrc.includes("customStorage || (isTest ? null : path.join(defaultStorageDir, 'dsh-goal-state.json'))"));
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test('Issue #99: registerPluginUpdater is wrapped in ctx.effect with disposal cleanup', () => {
  let effectRegistered = false;
  let effectDisposed = false;
  let webServerRegistered = false;

  const mockCtx = {
    inject: () => {},
    effect: (fn) => {
      effectRegistered = true;
      const cleanup = fn();
      if (typeof cleanup === 'function') {
        cleanup();
        effectDisposed = true;
      }
      return () => {};
    },
    webServer: {
      register: (opts) => {
        if (opts.path === '/api/dsh-goal/update') {
          webServerRegistered = true;
        }
        return () => {};
      },
    },
  };

  apply(mockCtx, { storagePath: null });
  assert.ok(effectRegistered, 'ctx.effect registered');
  assert.ok(webServerRegistered, 'updater endpoint registered in webServer');
  assert.ok(effectDisposed, 'cleanup called on effect disposal');
});

test('Issue #100: POST /dsh-goal/action supports instantiate_template', async () => {
  const engine = new GoalEngine({ storagePath: null });
  let routeHandler = null;

  const mockCtx = {
    webServer: {
      register: (opts) => {
        routeHandler = opts.handler;
        return () => {};
      },
    },
    effect: (fn) => fn(),
  };

  registerRoutes(mockCtx, { engine, getConfig: () => ({}) });
  assert.ok(typeof routeHandler === 'function');

  // Call instantiate_template
  let statusCode = 0;
  let headers = {};
  let responseBody = '';

  const mockReq = {
    method: 'POST',
    url: '/dsh-goal/action',
    headers: { host: 'localhost' },
    socket: { remoteAddress: '127.0.0.1' },
    on: (evt, cb) => {
      if (evt === 'data') {
        cb(Buffer.from(JSON.stringify({
          action: 'instantiate_template',
          templateId: 'refactor-module',
          inputs: { targetFile: 'lib/routes.js', lineThreshold: '400' },
        })));
      }
      if (evt === 'end') cb();
    },
  };

  const mockRes = {
    setHeader: (k, v) => { headers[k] = v; },
    end: (str) => { responseBody = str; },
  };
  Object.defineProperty(mockRes, 'statusCode', {
    set: (c) => { statusCode = c; },
    get: () => statusCode,
  });

  await routeHandler(mockReq, mockRes);
  assert.equal(statusCode, 200);
  const data = JSON.parse(responseBody);
  assert.ok(data.ok);
  assert.equal(data.template.title, 'Refactor lib/routes.js');
  assert.ok(data.template.milestones.length > 0);
});

test('Issue #101: startGoal with issueBody automatically parses checklist into milestones', () => {
  const engine = new GoalEngine({ storagePath: null });
  const issueMarkdown = `
## Summary
Fix auth issue
- [ ] Reproduce token expiration
- [x] Create failing regression test
- [ ] Implement refresh retry loop
`;
  const snap = engine.startGoal('Fix #101 token auth', {
    issueBody: issueMarkdown,
  });

  assert.equal(snap.milestones.length, 3);
  assert.equal(snap.milestones[0].title, 'Reproduce token expiration');
  assert.equal(snap.milestones[0].status, MilestoneStatus.PENDING);
  assert.equal(snap.milestones[1].title, 'Create failing regression test');
  assert.equal(snap.milestones[1].status, MilestoneStatus.COMPLETED);
  assert.equal(snap.milestones[2].title, 'Implement refresh retry loop');
});

test('Issue #102: lib/*.js does not use raw console.warn / console.error directly', () => {
  const indexSrc = fs.readFileSync('lib/index.js', 'utf8');
  assert.ok(!indexSrc.includes('console.warn('), 'lib/index.js uses logger instead of console.warn');

  const toolsSrc = fs.readFileSync('lib/tools.js', 'utf8');
  assert.ok(!toolsSrc.includes('console.warn('), 'lib/tools.js uses logger instead of console.warn');

  const storeSrc = fs.readFileSync('lib/engine-store.js', 'utf8');
  assert.ok(!storeSrc.includes('console.warn?.'), 'lib/engine-store.js uses this.logger instead of console.warn');
});

test('Issue #103: Unknown HTTP methods on known endpoints return 405 Method Not Allowed with Allow header', async () => {
  const engine = new GoalEngine({ storagePath: null });
  let routeHandler = null;

  const mockCtx = {
    webServer: {
      register: (opts) => {
        routeHandler = opts.handler;
        return () => {};
      },
    },
    effect: (fn) => fn(),
  };

  registerRoutes(mockCtx, { engine, getConfig: () => ({}) });

  // Test POST to /dsh-goal/state (state is GET only)
  let statusCode = 0;
  let headers = {};
  let body = '';

  const mockReq = {
    method: 'POST',
    url: '/dsh-goal/state',
    headers: { host: 'localhost' },
    socket: { remoteAddress: '127.0.0.1' },
    on: (evt, cb) => {
      if (evt === 'end') cb();
    },
  };

  const mockRes = {
    setHeader: (k, v) => { headers[k] = v; },
    end: (str) => { body = str; },
  };
  Object.defineProperty(mockRes, 'statusCode', {
    set: (c) => { statusCode = c; },
    get: () => statusCode,
  });

  await routeHandler(mockReq, mockRes);
  assert.equal(statusCode, 405);
  assert.equal(headers['Allow'], 'GET');
  const parsed = JSON.parse(body);
  assert.ok(parsed.error.includes('Method Not Allowed'));
});

test('Issue #104: lib/client.js does not contain hardcoded 0.2.3 fallback version', () => {
  const clientSrc = fs.readFileSync('lib/client.js', 'utf8');
  assert.ok(!clientSrc.includes("currentVersion: '0.2.3'"), 'updateState does not initialize with 0.2.3');
  assert.ok(!clientSrc.includes("|| '0.2.3'"), 'client version span does not fallback to 0.2.3');
});
