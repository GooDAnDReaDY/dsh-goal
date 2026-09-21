import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoalEngine, GoalState, MilestoneStatus } from '../lib/goal-engine.js';
import { matchMilestone, parseMilestoneItems, applyMilestoneUpdate, toggleMilestoneChecklistItem } from '../lib/engine-milestones.js';
import { registerRoutes } from '../lib/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('Issue #70: toolFailureCounters cleaned up on session completion, clear, and prune', () => {
  const engine = new GoalEngine({ maxSessions: 2 });
  
  // Test 1: clear(sessionId)
  engine.startGoal('Goal 1', {}, 'session-1');
  engine.incrementToolFailureCount('session-1');
  assert.equal(engine.getToolFailureCount('session-1'), 1);
  engine.clear('session-1');
  assert.equal(engine.getToolFailureCount('session-1'), 0);
  assert.equal(engine.toolFailureCounters.has('session-1'), false);

  // Test 2: completeGoal(summary, sessionId)
  engine.startGoal('Goal 2', {}, 'session-2');
  engine.incrementToolFailureCount('session-2');
  assert.equal(engine.getToolFailureCount('session-2'), 1);
  engine.completeGoal('Goal 2 done', 'session-2');
  assert.equal(engine.getToolFailureCount('session-2'), 0);
  assert.equal(engine.toolFailureCounters.has('session-2'), false);

  // Test 3: pruneInactiveSessions()
  engine.startGoal('Goal A', {}, 'session-a');
  engine.completeGoal('Done A', 'session-a');
  engine.toolFailureCounters.set('session-a', 5);

  engine.startGoal('Goal B', {}, 'session-b');
  engine.startGoal('Goal C', {}, 'session-c'); // exceeds maxSessions=2 -> triggers pruneInactiveSessions

  assert.equal(engine.goals.has('session-a'), false);
  assert.equal(engine.toolFailureCounters.has('session-a'), false);
});

test('Issue #71 & #75: engine-milestones helpers and goal-engine line threshold < 600', () => {
  const geContent = fs.readFileSync(path.join(rootDir, 'lib', 'goal-engine.js'), 'utf8');
  const lineCount = geContent.split('\n').length;
  assert.ok(lineCount < 600, `goal-engine.js line count must be < 600, got ${lineCount}`);

  // Test matchMilestone
  assert.equal(matchMilestone({ id: 'm-1' }, 'm-1'), true);
  assert.equal(matchMilestone({ id: 'm-1' }, '1'), true);
  assert.equal(matchMilestone({ id: 'm-2' }, 'm1'), false);

  // Test parseMilestoneItems
  const parsed = parseMilestoneItems(['Step 1', { title: 'Step 2', notes: 'Note 2' }], 0);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, 'm-1');
  assert.equal(parsed[0].title, 'Step 1');
  assert.equal(parsed[1].id, 'm-2');
  assert.equal(parsed[1].notes, 'Note 2');

  // Test applyMilestoneUpdate
  const target = { id: 'm-1', status: 'pending', notes: '' };
  const res = applyMilestoneUpdate(target, 'completed', 'Finished step 1', null, Object.values(MilestoneStatus));
  assert.equal(res.prevStatus, 'pending');
  assert.equal(target.status, 'completed');
  assert.equal(target.notes, 'Finished step 1');

  // Test toggleMilestoneChecklistItem
  const targetWithChecklist = { id: 'm-2', checklist: [{ text: 'Item 1', done: false }] };
  assert.equal(toggleMilestoneChecklistItem(targetWithChecklist, 0, true), true);
  assert.equal(targetWithChecklist.checklist[0].done, true);
  assert.equal(toggleMilestoneChecklistItem(targetWithChecklist, 0), true);
  assert.equal(targetWithChecklist.checklist[0].done, false);
});

test('Issue #72: routes reject invalid data.cwd in rollback_milestone and save_artifact', async () => {
  const engine = new GoalEngine();
  engine.startGoal('Security test goal', {}, 'sec-sess');
  
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
      on: (event, cb) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify(body)));
        if (event === 'end') cb();
      },
    };
    routeHandler(req, res);
  });

  // Test 1: save_artifact with invalid non-existent cwd
  const res1 = await sendReq({
    action: 'save_artifact',
    sessionId: 'sec-sess',
    cwd: '/definitely/non_existent_folder_xyz_123',
  });
  assert.equal(res1.statusCode, 400);
  assert.ok(res1.body.error.includes('Invalid or non-existent working directory'));

  // Test 2: rollback_milestone with invalid non-existent cwd
  const res2 = await sendReq({
    action: 'rollback_milestone',
    sessionId: 'sec-sess',
    commit: 'a1b2c3d',
    cwd: '/definitely/non_existent_folder_xyz_123',
  });
  assert.equal(res2.statusCode, 400);
  assert.ok(res2.body.error.includes('Invalid or non-existent working directory'));
});

test('Issue #73, #74, #76: client design tokens, clean locales, and HMR ctx.effect disposal', () => {
  const clientContent = fs.readFileSync(path.join(rootDir, 'lib', 'client.js'), 'utf8');

  // Issue #73: Zero hardcoded hex colors or rgba in CSS & styles
  const hexMatches = clientContent.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  const rgbaMatches = clientContent.match(/rgba\([^)]+\)/g) || [];
  assert.deepEqual(hexMatches, [], `Found hardcoded hex colors: ${hexMatches.join(', ')}`);
  assert.deepEqual(rgbaMatches, [], `Found hardcoded rgba: ${rgbaMatches.join(', ')}`);
  assert.ok(clientContent.includes('var(--dsw-alias-shadow-md)'));
  assert.ok(clientContent.includes('var(--dsw-alias-status-warning)'));

  // Issue #74: Purge dead LOCALES.ru and empty catch
  assert.equal(clientContent.includes('LOCALES.ru'), false, 'LOCALES.ru should be purged');
  assert.equal(clientContent.includes('catch (e) {}'), false, 'Empty catch should be commented defensively');

  // Issue #76: Clean HMR disposal with ctx.effect
  assert.ok(clientContent.includes("ctx.effect(() => {"), 'client.js must wrap registrations in ctx.effect');
  assert.ok(clientContent.includes("'dsh-goal: client slots & locale'"), 'ctx.effect must have description');
});
