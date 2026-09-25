import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { GoalEngine } from '../lib/goal-engine.js';
import { registerRoutes, isLoopback, isTrustedCaller, isPathInsideOrEqual, getSafeCwd } from '../lib/routes.js';

test('Issue #78: isLoopback and isTrustedCaller helper units', () => {
  assert.equal(isLoopback('127.0.0.1'), true);
  assert.equal(isLoopback('127.0.1.1'), true);
  assert.equal(isLoopback('::1'), true);
  assert.equal(isLoopback('::ffff:127.0.0.1'), true);
  assert.equal(isLoopback('localhost'), true);
  assert.equal(isLoopback('[::1]'), true);
  assert.equal(isLoopback('192.168.1.50'), false);
  assert.equal(isLoopback('10.0.0.1'), false);
  assert.equal(isLoopback(''), false);
  assert.equal(isLoopback(null), false);

  // isTrustedCaller with loopback remoteAddress
  assert.equal(isTrustedCaller({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), true);
  assert.equal(isTrustedCaller({ connection: { remoteAddress: '::1' }, headers: {} }), true);

  // isTrustedCaller from non-loopback IP without headers
  assert.equal(isTrustedCaller({ socket: { remoteAddress: '192.168.1.50' }, headers: { host: '192.168.1.111:3080' } }), false);

  // sec-fetch-site alone without matching Origin/Referer is rejected (Issue #78)
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.50' },
    headers: { host: '192.168.1.111:3080', 'sec-fetch-site': 'same-origin' }
  }), false);

  // sec-fetch-site with matching Origin is accepted
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.50' },
    headers: {
      host: '192.168.1.111:3080',
      'sec-fetch-site': 'same-origin',
      origin: 'http://192.168.1.111:3080',
    }
  }), true);
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.50' },
    headers: { host: '192.168.1.111:3080', 'sec-fetch-site': 'cross-site' }
  }), false);

  // Origin matching
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.50' },
    headers: { host: '192.168.1.111:3080', origin: 'http://192.168.1.111:3080' }
  }), true);
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.50' },
    headers: { host: '192.168.1.111:3080', origin: 'http://attacker.com' }
  }), false);

  // Referer matching
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.50' },
    headers: { host: '192.168.1.111:3080', referer: 'http://192.168.1.111:3080/app' }
  }), true);
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.50' },
    headers: { host: '192.168.1.111:3080', referer: 'http://evil.com/leak' }
  }), false);
});

test('Issue #78: POST /dsh-goal/action rejects untrusted LAN callers without valid origin or sec-fetch-site', async () => {
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

  const sendReq = (options = {}) => new Promise((resolve) => {
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
      headers: {
        host: '192.168.1.111:3080',
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
      socket: {
        remoteAddress: options.remoteAddress || '192.168.1.55',
      },
      on: (event, cb) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify(options.body || { action: 'clear' })));
        if (event === 'end') cb();
      },
    };
    routeHandler(req, res);
  });

  // Untrusted LAN caller with no Sec-Fetch-Site and no Origin
  const resUntrusted = await sendReq({
    remoteAddress: '192.168.1.55',
    headers: {},
    body: { action: 'clear' }
  });
  assert.equal(resUntrusted.statusCode, 403);
  assert.equal(resUntrusted.body.error, 'Forbidden: untrusted caller origin');

  // Loopback caller succeeds without Origin header
  const resLoopback = await sendReq({
    remoteAddress: '127.0.0.1',
    headers: { host: '127.0.0.1:3080' },
    body: { action: 'clear' }
  });
  assert.equal(resLoopback.statusCode, 200);

  // LAN caller with Sec-Fetch-Site alone without matching Origin is rejected (Issue #78)
  const resSameOriginSec = await sendReq({
    remoteAddress: '192.168.1.55',
    headers: { 'sec-fetch-site': 'same-origin' },
    body: { action: 'clear' }
  });
  assert.equal(resSameOriginSec.statusCode, 403);
  assert.equal(resSameOriginSec.body.error, 'Forbidden: untrusted caller origin');

  // LAN caller with matching Origin succeeds
  const resValidOrigin = await sendReq({
    remoteAddress: '192.168.1.55',
    headers: {
      'sec-fetch-site': 'same-origin',
      origin: 'http://192.168.1.111:3080',
    },
    body: { action: 'clear' }
  });
  assert.equal(resValidOrigin.statusCode, 200);

  // LAN caller with Sec-Fetch-Site: cross-site gets 403
  const resCrossSiteSec = await sendReq({
    remoteAddress: '192.168.1.55',
    headers: { 'sec-fetch-site': 'cross-site' },
    body: { action: 'clear' }
  });
  assert.equal(resCrossSiteSec.statusCode, 403);
  assert.equal(resCrossSiteSec.body.error, 'Forbidden: cross-site requests are rejected');
});

test('Issue #79: isPathInsideOrEqual and getSafeCwd root confinement', () => {
  const root = path.resolve('/app/workspace');
  assert.equal(isPathInsideOrEqual(root, path.resolve('/app/workspace')), true);
  assert.equal(isPathInsideOrEqual(root, path.resolve('/app/workspace/src')), true);
  assert.equal(isPathInsideOrEqual(root, path.resolve('/app/workspace/src/lib')), true);
  assert.equal(isPathInsideOrEqual(root, path.resolve('/app/other')), false);
  assert.equal(isPathInsideOrEqual(root, path.resolve('/tmp')), false);

  // getSafeCwd with allowedRoots
  const allowedRoots = [root];
  assert.equal(getSafeCwd('', allowedRoots), root);
  assert.equal(getSafeCwd(null, allowedRoots), root);

  // Path that is outside allowed roots even if it exists on disk
  const tmpDir = os.tmpdir();
  assert.equal(getSafeCwd(tmpDir, [root]), null);

  // Path inside allowed roots
  const insideDir = path.resolve(process.cwd(), 'lib');
  assert.equal(getSafeCwd(insideDir, [process.cwd()]), insideDir);
});

test('Issue #79: save_artifact and rollback_milestone reject cwd outside allowed roots', async () => {
  const engine = new GoalEngine();
  const mockWorkdir = path.resolve(process.cwd());
  engine.startGoal('Root confinement test', { cwd: mockWorkdir }, 'sec-root-sess');

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

  const sendReq = (body) => new Promise((resolve) => {
    let statusCode = 200;
    let resData = '';
    const res = {
      setHeader: () => {},
      set statusCode(c) { statusCode = c; },
      get statusCode() { return statusCode; },
      end: (data) => {
        resData = data;
        resolve({ statusCode, body: JSON.parse(resData) });
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

  // Attempt save_artifact pointing to os.tmpdir() (outside workspace)
  const tmpDir = os.tmpdir();
  const resSave = await sendReq({
    action: 'save_artifact',
    sessionId: 'sec-root-sess',
    cwd: tmpDir,
  });
  assert.equal(resSave.statusCode, 400);
  assert.equal(resSave.body.error, 'Invalid or non-existent working directory');

  // Attempt rollback_milestone pointing to os.tmpdir()
  const resRollback = await sendReq({
    action: 'rollback_milestone',
    sessionId: 'sec-root-sess',
    commit: '1234567',
    cwd: tmpDir,
  });
  assert.equal(resRollback.statusCode, 400);
  assert.equal(resRollback.body.error, 'Invalid or non-existent working directory');
});
