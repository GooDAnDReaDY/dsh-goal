import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoalEngine, GoalState, MilestoneStatus } from '../lib/goal-engine.js';
import { apply } from '../lib/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Stability & Visual Style Audit Tests (Issue #30)', () => {
  test('GoalEngine limits inactive sessions to prevent memory leaks', () => {
    const engine = new GoalEngine({ maxSessions: 5 });
    
    // Create 10 sessions and complete them
    for (let i = 1; i <= 10; i++) {
      const sid = `sess-${i}`;
      engine.startGoal(`Goal ${i}`, {}, sid);
      engine.completeGoal(`Completed ${i}`, sid);
    }

    assert.ok(engine.goals.size <= 5, `Expected goals.size <= 5, got ${engine.goals.size}`);
  });

  test('GoalEngine clears specific session and removes it from memory cleanly', () => {
    const engine = new GoalEngine();
    engine.startGoal('Test Goal', {}, 'sess-xyz');
    assert.equal(engine.getGoal('sess-xyz').title, 'Test Goal');

    engine.clear('sess-xyz');
    assert.equal(engine.getGoal('sess-xyz'), null);
    const snap = engine.getSnapshot('sess-xyz');
    assert.equal(snap.hasActiveGoal, false);
    assert.equal(snap.state, GoalState.IDLE);
  });

  test('GoalEngine updateMilestone validates notes string and preserves logs limit', () => {
    const engine = new GoalEngine();
    engine.startGoal('Test Goal', { milestones: ['Step 1'] }, 'sess-notes');
    
    const updated = engine.updateMilestone('m-1', MilestoneStatus.IN_PROGRESS, 'Working on it', 'sess-notes');
    assert.equal(updated, true);

    const goal = engine.getGoal('sess-notes');
    assert.equal(goal.milestones[0].notes, 'Working on it');
    assert.equal(goal.milestones[0].status, MilestoneStatus.IN_PROGRESS);

    // Add many logs and verify capping at 100
    for (let i = 0; i < 150; i++) {
      engine.pause(`Pause ${i}`, 'sess-notes');
      engine.resume('sess-notes');
    }
    assert.ok(goal.logs.length <= 100, `Logs length should be <= 100, got ${goal.logs.length}`);
  });

  test('WebServer enforces 256KB request payload limit', async () => {
    let routeHandler = null;
    const mockCtx = {
      inject: () => {},
      effect: (fn) => fn(),
      webServer: {
        register: ({ path, handler }) => {
          if (path === '/dsh-goal') routeHandler = handler;
          return () => {};
        },
      },
    };

    apply(mockCtx);
    assert.ok(routeHandler, 'WebServer handler must be registered');

    // Create a payload larger than 256KB
    const largeData = 'x'.repeat(260 * 1024);
    const mockReq = {
      method: 'POST',
      url: '/dsh-goal/action',
      headers: {
        host: 'localhost',
        'sec-fetch-site': 'same-origin',
        origin: 'http://localhost',
      },
      paused: false,
      pause() { this.paused = true; },
      on(event, cb) {
        if (event === 'data') {
          cb(Buffer.from(JSON.stringify({ action: 'start', title: largeData })));
        }
        if (event === 'end') {
          cb();
        }
      },
    };

    let statusCode = null;
    let responseBody = '';
    const mockRes = {
      setHeader: () => {},
      end: (data) => { responseBody = data; },
      set statusCode(code) { statusCode = code; },
      get statusCode() { return statusCode; },
    };

    routeHandler(mockReq, mockRes);
    assert.equal(statusCode, 413, 'Expected 413 Payload Too Large');
    assert.ok(responseBody.includes('Payload too large'), 'Expected error message regarding payload size');
  });

  test('client.js includes dsh-clinebot unified design tokens and badge styles', () => {
    const clientPath = path.join(__dirname, '../lib/client.js');
    const content = fs.readFileSync(clientPath, 'utf8');

    // Badges and pill styling
    assert.ok(content.includes('dsh-goal-badge'), 'Must include dsh-goal-badge class');
    assert.ok(content.includes('dsh-goal-badge-ok'), 'Must include dsh-goal-badge-ok class');
    assert.ok(content.includes('dsh-goal-badge-warn'), 'Must include dsh-goal-badge-warn class');

    // Modal stat grid
    assert.ok(content.includes('dsh-goal-stat-grid'), 'Must include dsh-goal-stat-grid');
    assert.ok(content.includes('dsh-goal-stat-box'), 'Must include dsh-goal-stat-box');
    assert.ok(content.includes('dsh-goal-stat-val'), 'Must include dsh-goal-stat-val');

    // Standard buttons
    assert.ok(content.includes('dsh-goal-btn-primary'), 'Must include dsh-goal-btn-primary');
    assert.ok(content.includes('dsh-goal-btn-danger'), 'Must include dsh-goal-btn-danger');

    // Data-dsh-plugin attribute
    assert.ok(content.includes('style.dataset.dshPlugin = NS'), 'Must isolate style tag with dataset.dshPlugin');
  });
});
