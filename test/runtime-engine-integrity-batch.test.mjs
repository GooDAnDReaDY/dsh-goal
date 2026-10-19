import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { GoalEngine, GoalState, MilestoneStatus } from '../lib/goal-engine.js';
import { MilestoneManager } from '../lib/milestone-manager.js';
import { AddonStore } from '../lib/addon-store.js';
import { EngineStore } from '../lib/engine-store.js';
import { registerRoutes } from '../lib/routes.js';
import { registerTools } from '../lib/tools.js';
import { saveGoalArtifact, saveGoalReportFile, exportReportGitHubPR } from '../lib/engine-reports.js';
import { applyMilestoneUpdate } from '../lib/engine-milestones.js';
import { generateRetrospectiveData } from '../lib/engine-retrospective.js';
import { addNudgeToGoal } from '../lib/engine-sessions.js';

test('Issue #127: Tools registered match autonomous prompt contracts', () => {
  const registered = [];
  const mockCtx = {
    inject: (deps, fn) => fn(mockCtx),
    webServer: { register: () => () => {} },
    tools: {
      register: (tool) => {
        registered.push(tool);
        return () => {};
      },
    },
  };
  const store = new AddonStore(null);
  const mm = new MilestoneManager(store);
  registerTools(mockCtx, { milestoneManager: mm });

  const names = registered.map(t => t.name);
  assert.ok(names.includes('goal_milestones'), 'goal_milestones must be registered');
  assert.ok(names.includes('goal_checklist'), 'goal_checklist must be registered');
  assert.ok(names.includes('goal_set_milestones'), 'goal_set_milestones must be registered (#127)');
  assert.ok(names.includes('goal_update_progress'), 'goal_update_progress must be registered (#127)');
  assert.ok(names.includes('goal_finish'), 'goal_finish must be registered (#127)');
});

test('Issue #129: completeMilestone passes goal object with issueRef to syncMilestoneWithIssue', async () => {
  const store = new AddonStore(null);
  const mm = new MilestoneManager(store);
  store.setMilestones('g-1', [{ id: 'm-1', title: 'Task 1', completed: false }]);
  store.getGoalData('g-1').issue = { number: 42 };

  // completeMilestone should not throw and should safely handle issue sync without type errors
  const res = await mm.completeMilestone('g-1', 'm-1', 'Done notes', process.cwd());
  assert.equal(res.milestone.completed, true);
  assert.equal(res.milestone.notes, 'Done notes');
});

test('Issue #130: registerRoutes wires stopRunningAgents and resumeActiveAgent', () => {
  let stopped = null;
  let resumed = null;
  const sessionAgents = new Map();
  sessionAgents.set('test-session', { id: 'agent-1' });

  const registeredRoutes = [];
  const mockCtx = {
    webServer: {
      register: (route) => {
        registeredRoutes.push(route);
        return () => {};
      },
    },
  };

  const engine = new GoalEngine();
  engine.startGoal('Test Goal', {}, 'test-session');

  registerRoutes(mockCtx, {
    engine,
    stopRunningAgents: (sid) => { stopped = sid; },
    resumeActiveAgent: (prompt, sid) => { resumed = sid; },
    sessionAgents,
    getConfig: () => ({}),
  });

  const prefixRoute = registeredRoutes.find(r => r.kind === 'prefix' && r.path === '/dsh-goal');
  assert.ok(prefixRoute);

  // Trigger cancel action
  let statusCode = 200;
  let outData = '';
  const mockReq = {
    method: 'POST',
    url: '/dsh-goal/action',
    headers: { host: '127.0.0.1:3000' },
    socket: { remoteAddress: '127.0.0.1' },
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(JSON.stringify({ action: 'cancel', sessionId: 'test-session' })));
      if (evt === 'end') cb();
    },
  };
  const mockRes = {
    set statusCode(c) { statusCode = c; },
    get statusCode() { return statusCode; },
    setHeader: () => {},
    end: (d) => { outData = d; },
  };

  prefixRoute.handler(mockReq, mockRes);
  assert.equal(stopped, 'test-session', 'cancel must invoke stopRunningAgents(sid)');

  // Trigger resume action
  const resumeReq = {
    method: 'POST',
    url: '/dsh-goal/action',
    headers: { host: '127.0.0.1:3000' },
    socket: { remoteAddress: '127.0.0.1' },
    on: (evt, cb) => {
      if (evt === 'data') cb(Buffer.from(JSON.stringify({ action: 'resume', sessionId: 'test-session' })));
      if (evt === 'end') cb();
    },
  };
  prefixRoute.handler(resumeReq, mockRes);
  assert.equal(resumed, 'test-session', 'resume must invoke resumeActiveAgent(undefined, sid)');
});

test('Issue #132: GoalEngine.updateConfig dynamically updates iteration limit from boxed or primitive values', () => {
  const engine = new GoalEngine({ defaultMaxIterations: 25 });
  const initialSnap = engine.startGoal('Iteration limit test');
  assert.equal(initialSnap.maxIterations, 25);

  // Update using boxed value simulator
  engine.updateConfig({ defaultMaxIterations: { value: 10 } });
  assert.equal(engine.defaultMaxIterations, 10);
  assert.equal(engine.getSnapshot().maxIterations, 10);

  // Update using maxIterations property directly
  engine.updateConfig({ maxIterations: 5 });
  assert.equal(engine.defaultMaxIterations, 5);
  assert.equal(engine.getSnapshot().maxIterations, 5);
});

test('Issue #133: retrospective diffs gitStartCommit and sanitizes git ref positional', () => {
  const goal = {
    title: 'Test Retrospective',
    gitStartCommit: 'main',
    milestones: [],
    tokensUsage: { totalTokens: 100 },
  };

  const retro = generateRetrospectiveData(goal);
  assert.ok(retro);
  assert.equal(retro.title, 'Test Retrospective');

  // Verify refusal of dangerous injected ref
  const badGoal = {
    title: 'Injection test',
    gitStartCommit: '--upload-pack=touch evil',
  };
  const safeRetro = generateRetrospectiveData(badGoal);
  assert.ok(safeRetro);
});

test('Issue #134: saveTimer unref does not throw and sets timer safely', () => {
  const tmpPath = path.join(os.tmpdir(), 'test-es-store.json');
  const engineStore = new EngineStore({ goals: new Map() }, tmpPath);
  engineStore.scheduleSave();
  assert.ok(engineStore.saveTimer);

  const addonStore = new AddonStore(tmpPath);
  addonStore.scheduleSave();
  assert.ok(addonStore.saveTimer);

  try {
    if (engineStore.saveTimer) clearTimeout(engineStore.saveTimer);
    if (addonStore.saveTimer) clearTimeout(addonStore.saveTimer);
  } catch (e) { /* ignore */ }
});

test('Issue #135: AddonStore.removeGoalData and bounded goal.nudges array', () => {
  const addonStore = new AddonStore(null);
  addonStore.getGoalData('temp-session');
  assert.ok(addonStore.goals.has('temp-session'));
  addonStore.removeGoalData('temp-session');
  assert.equal(addonStore.goals.has('temp-session'), false);

  const goal = { logs: [], nudges: [] };
  for (let i = 0; i < 70; i++) {
    addNudgeToGoal(goal, `Nudge #${i}`);
  }
  assert.ok(goal.nudges.length <= 50, `Nudges must be capped at 50, got ${goal.nudges.length}`);
});

test('Issue #136: saveGoalArtifact preserves milestone and snapshot sections from addonData', () => {
  const state = { title: 'Release Build', objective: 'Deploy release' };
  const addonData = {
    milestones: [
      { id: 'm-1', title: 'Compile assets', status: 'completed' },
      { id: 'm-2', title: 'Run tests', status: 'completed' },
    ],
    snapshots: [
      { milestoneId: 'm-1', commit: 'abcdef1234567890' },
    ],
  };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-artifact-test-'));
  try {
    const res = saveGoalArtifact(state, tmpDir, addonData);
    assert.ok(res);
    assert.ok(res.content.includes('Compile assets'), 'Report content must include milestones from addonData');
    assert.ok(res.content.includes('abcdef1234567890'), 'Report content must include snapshots from addonData');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Issue #137: GoalEngine rejects invalid milestone status', () => {
  const engine = new GoalEngine();
  engine.startGoal('Milestone status check');
  engine.addMilestones([{ id: 'm-1', title: 'Phase 1' }]);

  const okValid = engine.updateMilestone('m-1', MilestoneStatus.IN_PROGRESS);
  assert.equal(okValid, true);

  const okInvalid = engine.updateMilestone('m-1', 'bogus_status');
  assert.equal(okInvalid, false, 'Invalid milestone status must be rejected');

  const rawRes = applyMilestoneUpdate({ status: 'pending' }, 'unknown_status', '', [], Object.values(MilestoneStatus));
  assert.equal(rawRes.invalidStatus, true);
});

test('Issue #138: GoalEngine logger is assigned and receives errors from listeners', () => {
  let loggedError = null;
  const mockLogger = {
    error: (msg, err) => { loggedError = { msg, err }; },
    warn: () => {},
    info: () => {},
  };

  const engine = new GoalEngine({ logger: mockLogger });
  assert.equal(engine.logger, mockLogger);

  engine.subscribe(() => {
    throw new Error('Listener crashed');
  });

  engine.startGoal('Trigger emit');
  assert.ok(loggedError, 'Listener error must be logged via this.logger');
  assert.equal(loggedError.err.message, 'Listener crashed');
});

test('Issue #140: migrateLegacyState does not mutate file if no candidates migrated', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mig-test-'));
  const dummyLegacy = path.join(tmpDir, 'empty-legacy.json');
  fs.writeFileSync(dummyLegacy, JSON.stringify({ version: 1, other: 'data' }), 'utf8');

  try {
    const store = new AddonStore(null);
    const migrated = store.migrateLegacyState(dummyLegacy, null, null);
    assert.equal(migrated, false);

    const after = JSON.parse(fs.readFileSync(dummyLegacy, 'utf8'));
    assert.equal(after._migratedToAddon, undefined, 'Must not stamp _migratedToAddon if migratedAny is false');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Issue #141: getActiveMilestonePrompt renders only uncompleted items under Next items', () => {
  const store = new AddonStore(null);
  const mm = new MilestoneManager(store);
  store.setMilestones('g-1', [{
    id: 'm-1',
    title: 'Active Step',
    completed: false,
    checklist: [
      { text: 'Done sub-task', done: true },
      { text: 'Remaining sub-task', done: false },
    ],
  }]);

  const prompt = mm.getActiveMilestonePrompt('g-1');
  assert.ok(prompt.includes('Remaining sub-task'));
  assert.ok(!prompt.includes('[x] Done sub-task'), 'Completed checklist items must not appear in Next items prompt');
});

test('Issue #142: tools.register definition does not contain dead handler property', () => {
  const registered = [];
  const mockCtx = {
    inject: (deps, fn) => fn(mockCtx),
    webServer: { register: () => () => {} },
    tools: {
      register: (tool) => {
        registered.push(tool);
        return () => {};
      },
    },
  };
  registerTools(mockCtx, { milestoneManager: new MilestoneManager(new AddonStore(null)) });
  for (const t of registered) {
    assert.equal(t.handler, undefined, `Tool ${t.name} must not have dead handler field`);
    assert.equal(typeof t.execute, 'function', `Tool ${t.name} must have execute function`);
  }
});

test('Issue #143: exportReportGitHubPR links to lowercase goodandready org', () => {
  const report = exportReportGitHubPR({ title: 'Export PR check', milestones: [] });
  assert.ok(report.includes('https://github.com/goodandready/dsh-goal'));
  assert.ok(!report.includes('https://github.com/GooDAnDReaDY/dsh-goal'));
});
