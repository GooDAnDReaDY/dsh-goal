import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { GoalEngine, GoalState, MilestoneStatus } from '../lib/goal-engine.js';
import { apply } from '../lib/index.js';

test('Crash Hydration: automatically transitions leftover RUNNING goals to PAUSED on load', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-crash-test-'));
  const storagePath = path.join(tmpDir, 'state.json');

  // Создаем файл с незавершенной целью в состоянии RUNNING (симуляция краша/рестарта сервера)
  const crashedState = {
    version: 2,
    sessions: {
      'sess-crash-1': {
        id: 'goal-crashed',
        sessionId: 'sess-crash-1',
        title: 'Crash recovery test',
        state: 'RUNNING',
        startedAt: Date.now() - 60000,
        pausedAt: null,
        totalPausedDurationMs: 0,
        completedAt: null,
        iterationsCount: 3,
        maxIterations: 20,
        milestones: [{ id: 'm-1', title: 'Step 1', status: 'completed', notes: '' }],
        logs: [],
        resultSummary: '',
      },
    },
  };
  fs.writeFileSync(storagePath, JSON.stringify(crashedState, null, 2), 'utf8');

  const engine = new GoalEngine({ storagePath });
  const snap = engine.getSnapshot('sess-crash-1');

  assert.equal(snap.state, GoalState.PAUSED, 'Crashed goal should be hydrated as PAUSED');
  assert.ok(snap.pausedAt > 0, 'pausedAt timestamp must be set');
  const lastLog = snap.logs[snap.logs.length - 1];
  assert.ok(lastLog.message.includes('Harness was restarted'), 'Log should note server restart');

  // Убеждаемся, что при resume цель снова RUNNING и может продолжаться
  const resumedSnap = engine.resume('sess-crash-1');
  assert.equal(resumedSnap.state, GoalState.RUNNING);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Smart Progress Guard: detects stalls and auto-pauses when agent makes no progress', async () => {
  const engine = new GoalEngine();
  engine.startGoal('Stall Test Goal', {}, 'sess-stall');

  assert.equal(engine.getStallCount('sess-stall'), 0);

  // Имитируем 1-й ход без обновления вех
  let stall = engine.incrementStallCount('sess-stall');
  assert.equal(stall, 1);

  // Добавление вехи сбрасывает счетчик простоя
  engine.addMilestones(['Step 1', 'Step 2'], true, 'sess-stall');
  assert.equal(engine.getStallCount('sess-stall'), 0);

  // Обновление вехи также сбрасывает счетчик
  engine.incrementStallCount('sess-stall');
  assert.equal(engine.getStallCount('sess-stall'), 1);
  engine.updateMilestone('m-1', MilestoneStatus.IN_PROGRESS, 'Working on it', 'sess-stall');
  assert.equal(engine.getStallCount('sess-stall'), 0);

  // 2 холостых хода подряд
  engine.incrementStallCount('sess-stall');
  const stall2 = engine.incrementStallCount('sess-stall');
  assert.equal(stall2, 2, 'Stall count reached 2 consecutive idle turns');
});

test('HTTP WebServer: GET /dsh-goal/events streams SSE snapshots', async () => {
  let registeredRoutes = [];
  let serverHandler = null;

  const mockWebServer = {
    register: (def) => {
      registeredRoutes.push(def);
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

  assert.ok(serverHandler, 'Server handler must be registered');

  // Создаем мок HTTP запроса и ответа для SSE
  let headersSent = {};
  let writtenChunks = [];
  let ended = false;
  let listeners = {};

  const mockReq = {
    method: 'GET',
    url: '/dsh-goal/events?sessionId=test-sse-sess',
    headers: { host: 'localhost:3080' },
    on: (evt, cb) => {
      listeners[evt] = cb;
    },
  };

  const mockRes = {
    writeHead: (code, headers) => {
      mockRes.statusCode = code;
      headersSent = headers;
    },
    write: (chunk) => {
      writtenChunks.push(chunk);
    },
    end: () => {
      ended = true;
    },
  };

  serverHandler(mockReq, mockRes);

  assert.equal(mockRes.statusCode, 200);
  assert.equal(headersSent['Content-Type'], 'text/event-stream');
  assert.equal(headersSent['Cache-Control'], 'no-cache, no-transform');
  assert.ok(writtenChunks.length > 0, 'Should send initial SSE snapshot chunk');
  assert.ok(writtenChunks[0].startsWith('data: {"sessionId":"test-sse-sess"'));

  // Закрытие соединения клиентом
  if (listeners['close']) {
    listeners['close']();
  }
});
