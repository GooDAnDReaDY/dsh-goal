import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GoalEngine, GoalState, MilestoneStatus } from '../lib/goal-engine.js';
import { executeGoalSlashCommand, parseGoalInput } from '../lib/command-handler.js';
import { apply } from '../lib/index.js';

test('Session Isolation: executeGoalSlashCommand isolates state across distinct sessionIds', () => {
  const engine = new GoalEngine();

  // Start goal in session A
  const resA = executeGoalSlashCommand(engine, { action: 'start', text: 'Task Alpha' }, { maxIterations: 10 }, null, 'session-A');
  assert.equal(resA.kind, 'success');
  assert.ok(resA.text.includes('Task Alpha'));

  // Start goal in session B
  const resB = executeGoalSlashCommand(engine, { action: 'start', text: 'Task Beta' }, { maxIterations: 15 }, null, 'session-B');
  assert.equal(resB.kind, 'success');
  assert.ok(resB.text.includes('Task Beta'));

  // Verify snapshots are completely independent
  const snapA = engine.getSnapshot('session-A');
  const snapB = engine.getSnapshot('session-B');
  const snapDef = engine.getSnapshot('default');

  assert.equal(snapA.title, 'Task Alpha');
  assert.equal(snapB.title, 'Task Beta');
  assert.equal(snapDef.hasActiveGoal, false);

  // Pause session A only
  executeGoalSlashCommand(engine, { action: 'pause' }, {}, null, 'session-A');
  assert.equal(engine.getSnapshot('session-A').state, GoalState.PAUSED);
  assert.equal(engine.getSnapshot('session-B').state, GoalState.RUNNING);

  // Clear session A
  executeGoalSlashCommand(engine, { action: 'clear' }, {}, null, 'session-A');
  assert.equal(engine.getSnapshot('session-A').hasActiveGoal, false);
  assert.equal(engine.getSnapshot('session-B').hasActiveGoal, true);
  assert.equal(engine.getSnapshot('session-B').title, 'Task Beta');
});

test('Storage Safety: writeStateToDiskSync creates nested directories recursively if missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-nested-'));
  const nestedStorage = path.join(tmpDir, 'nested', 'deep', 'path', 'state.json');

  const engine = new GoalEngine({ storagePath: nestedStorage });
  engine.startGoal('Nested Path Goal', {}, 'sess-nested');

  assert.ok(fs.existsSync(nestedStorage), 'State file must be created inside automatically generated directories');
  const data = JSON.parse(fs.readFileSync(nestedStorage, 'utf8'));
  assert.ok(data.sessions['sess-nested']);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('REST Validation: POST /dsh-goal/action strictly validates title and milestone status enum', async () => {
  let serverHandler = null;
  const mockWebServer = {
    register: (def) => {
      serverHandler = def.handler;
      return () => {};
    },
  };

  const mockCtx = {
    inject: (deps, fn) => {
      if (deps.includes('settings')) fn({ settings: { register: () => {} } });
      if (deps.includes('tools')) fn({ tools: { register: () => {} } });
    },
    effect: (fn) => fn(),
    webServer: mockWebServer,
  };

  apply(mockCtx, { storagePath: '' });

  const invokeAction = (bodyObj) => {
    return new Promise((resolve) => {
      let statusCode = 200;
      let body = '';
      const mockReq = {
        method: 'POST',
        url: '/dsh-goal/action',
        headers: { host: 'localhost:3080' },
        on: (evt, cb) => {
          if (evt === 'data') cb(Buffer.from(JSON.stringify(bodyObj)));
          if (evt === 'end') cb();
        },
      };
      const mockRes = {
        setHeader: () => {},
        set statusCode(code) {
          statusCode = code;
        },
        get statusCode() {
          return statusCode;
        },
        end: (data) => {
          body = data;
          resolve({ status: statusCode, data: JSON.parse(body) });
        },
      };
      serverHandler(mockReq, mockRes);
    });
  };

  // 1. Reject empty title on start
  const emptyRes = await invokeAction({ action: 'start', title: '   ', sessionId: 'val-test' });
  assert.equal(emptyRes.status, 400);
  assert.ok(emptyRes.data.error.includes('cannot be empty'));

  // 2. Accept valid start
  const validRes = await invokeAction({ action: 'start', title: 'Valid Goal', sessionId: 'val-test' });
  assert.equal(validRes.status, 200);
  assert.ok(validRes.data.ok);

  // 3. Reject invalid milestone status
  const invalidStatusRes = await invokeAction({
    action: 'update_milestone',
    milestoneId: 'm-1',
    status: 'unsupported_status',
    sessionId: 'val-test',
  });
  assert.equal(invalidStatusRes.status, 400);
  assert.ok(invalidStatusRes.data.error.includes('Invalid status'));

  // 4. Return 404 when milestone does not exist
  const notFoundRes = await invokeAction({
    action: 'update_milestone',
    milestoneId: 'non-existent-m',
    status: 'completed',
    sessionId: 'val-test',
  });
  assert.equal(notFoundRes.status, 404);
  assert.ok(notFoundRes.data.error.includes('not found'));
});
