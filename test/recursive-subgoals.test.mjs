import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState, MilestoneStatus } from '../lib/goal-engine.js';
import { spawnSubGoal, completeSubGoal, getSubGoalBreadcrumbs, getSubGoalsList } from '../lib/engine-subgoals.js';
import { buildStatePromptInjection } from '../lib/engine-prompt.js';
import { registerTools } from '../lib/tools.js';

test('Recursive Sub-goals (Issue #170): spawnSubGoal validates inputs and links parent hierarchy', () => {
  const engine = new GoalEngine({ autoBranchOnGoalStart: false, autoBranch: false });
  engine.startGoal('Parent Master Goal', {
    description: 'Main parent task description',
  }, 'parent-session');

  // Attempt to spawn without title fails
  const errRes = spawnSubGoal(engine, 'parent-session', { title: '' });
  assert.equal(errRes.ok, false);
  assert.ok(errRes.error.includes('title is required'));

  // Spawn valid child subgoal
  const spawnRes = spawnSubGoal(engine, 'parent-session', {
    title: 'Fix Deployment Pipeline',
    prompt: 'Fix Docker Compose and test scripts',
    maxIterations: 10,
    inheritContext: true,
  });

  assert.equal(spawnRes.ok, true);
  assert.ok(spawnRes.childSessionId);
  assert.ok(spawnRes.subGoalId);

  // Check child snapshot
  const childGoal = engine.goals.get(spawnRes.childSessionId);
  assert.ok(childGoal);
  assert.equal(childGoal.title, 'Fix Deployment Pipeline');
  assert.equal(childGoal.isSubGoal, true);
  assert.equal(childGoal.parentGoalId, engine.goals.get('parent-session').id);
  assert.equal(childGoal.parentSessionId, 'parent-session');
  assert.equal(childGoal.maxIterations, 10);
  assert.ok(childGoal.description.includes('[Parent Goal: "Parent Master Goal"]'));

  // Check parent goal registered the child
  const parentGoal = engine.goals.get('parent-session');
  assert.equal(parentGoal.subGoals.length, 1);
  assert.equal(parentGoal.subGoals[0].title, 'Fix Deployment Pipeline');
  assert.equal(parentGoal.subGoals[0].sessionId, spawnRes.childSessionId);
});

test('Recursive Sub-goals (Issue #170): state and execution counters remain strictly isolated', () => {
  const engine = new GoalEngine({ autoBranchOnGoalStart: false, autoBranch: false });
  engine.startGoal('Parent Goal', {}, 'p-sess');

  const res = spawnSubGoal(engine, 'p-sess', { title: 'Child Subtask' });
  const cSid = res.childSessionId;

  // Mutate child iterations, stalls, and tool failures
  engine.incrementIteration(cSid);
  engine.incrementIteration(cSid);
  engine.incrementStallCount(cSid);
  engine.incrementToolFailureCount(cSid);
  engine.addTokenUsage({ promptTokens: 500, completionTokens: 200 }, cSid);

  const parentSnap = engine.getSnapshot('p-sess');
  const childSnap = engine.getSnapshot(cSid);

  // Parent counters must remain at initial state
  assert.equal(parentSnap.iterationsCount, 0);
  assert.equal(engine.getStallCount('p-sess'), 0);
  assert.equal(engine.getToolFailureCount('p-sess'), 0);
  assert.equal(parentSnap.tokensUsage.totalTokens, 0);

  // Child counters must reflect child execution
  assert.equal(childSnap.iterationsCount, 2);
  assert.equal(engine.getStallCount(cSid), 1);
  assert.equal(engine.getToolFailureCount(cSid), 1);
  assert.equal(childSnap.tokensUsage.totalTokens, 700);
});

test('Recursive Sub-goals (Issue #170): completeSubGoal returns control and syncs deliverables to parent', () => {
  const engine = new GoalEngine({ autoBranchOnGoalStart: false, autoBranch: false });
  engine.startGoal('Main Infrastructure Goal', {}, 'main-infra');

  const res = spawnSubGoal(engine, 'main-infra', {
    title: 'Migrate Redis Cluster',
  });
  const cSid = res.childSessionId;

  // Complete child goal
  const compRes = completeSubGoal(engine, cSid, 'Redis cluster upgraded to v7.2 and verified');
  assert.equal(compRes.ok, true);

  // Child must be COMPLETED
  const childGoal = engine.goals.get(cSid);
  assert.equal(childGoal.state, GoalState.COMPLETED);
  assert.equal(childGoal.resultSummary, 'Redis cluster upgraded to v7.2 and verified');

  // Parent subGoals list must be updated
  const parentGoal = engine.goals.get('main-infra');
  const subEntry = parentGoal.subGoals[0];
  assert.equal(subEntry.state, GoalState.COMPLETED);
  assert.equal(subEntry.resultSummary, 'Redis cluster upgraded to v7.2 and verified');
  assert.ok(subEntry.completedAt);

  // Parent logs must record child completion
  const hasLog = parentGoal.logs.some((l) => l.message.includes('Sub-goal [Migrate Redis Cluster] completed'));
  assert.equal(hasLog, true, 'Parent logs must reflect child completion');
});

test('Recursive Sub-goals (Issue #170): getSubGoalBreadcrumbs traces multi-level hierarchy', () => {
  const engine = new GoalEngine({ autoBranchOnGoalStart: false, autoBranch: false });
  engine.startGoal('Root Project', {}, 'root-sess');

  // Level 1 child
  const l1Res = spawnSubGoal(engine, 'root-sess', { title: 'Backend Overhaul' });
  const l1Sid = l1Res.childSessionId;

  // Level 2 child
  const l2Res = spawnSubGoal(engine, l1Sid, { title: 'Auth Service Fix' });
  const l2Sid = l2Res.childSessionId;

  const crumbs = getSubGoalBreadcrumbs(engine, l2Sid);
  assert.equal(crumbs.length, 3);
  assert.equal(crumbs[0].title, 'Root Project');
  assert.equal(crumbs[0].sessionId, 'root-sess');
  assert.equal(crumbs[1].title, 'Backend Overhaul');
  assert.equal(crumbs[1].sessionId, l1Sid);
  assert.equal(crumbs[2].title, 'Auth Service Fix');
  assert.equal(crumbs[2].sessionId, l2Sid);
  assert.equal(crumbs[2].isCurrent, true);
});

test('Recursive Sub-goals (Issue #170): goal_spawn_subgoal tool execution registers child goal', async () => {
  const engine = new GoalEngine({ autoBranchOnGoalStart: false, autoBranch: false });
  engine.startGoal('Primary Tool Goal', {}, 'tool-sess');

  let registeredTools = new Map();
  const mockCtx = {
    goalEngine: engine,
    inject: (deps, fn) => {
      fn({
        tools: {
          register: (def) => {
            registeredTools.set(def.name, def);
            return () => registeredTools.delete(def.name);
          },
        },
      });
    },
  };

  registerTools(mockCtx, { engine });
  const toolDef = registeredTools.get('goal_spawn_subgoal');
  assert.ok(toolDef, 'goal_spawn_subgoal tool must be registered');

  // Execute tool
  const result = await toolDef.execute({
    title: 'Isolated Subgoal via Tool',
    prompt: 'Perform detailed investigation',
    max_iterations: 12,
  }, { sessionId: 'tool-sess' });

  assert.equal(result.ok, true);
  assert.ok(result.childSessionId);
  assert.equal(result.title, 'Isolated Subgoal via Tool');

  const childSnap = engine.getSnapshot(result.childSessionId);
  assert.equal(childSnap.hasActiveGoal, true);
  assert.equal(childSnap.isSubGoal, true);
  assert.equal(childSnap.maxIterations, 12);
});

test('Recursive Sub-goals (Issue #170): Prompt injection includes ISOLATED SUB-GOAL context', () => {
  const engine = new GoalEngine({ autoBranchOnGoalStart: false, autoBranch: false });
  engine.startGoal('Parent Goal', {}, 'p-sess');
  const spawnRes = spawnSubGoal(engine, 'p-sess', { title: 'Subtask Child' });

  const snap = engine.getSnapshot(spawnRes.childSessionId);
  const prompt = buildStatePromptInjection(snap, null);

  assert.ok(prompt.includes('[ISOLATED SUB-GOAL EXECUTION CONTEXT]'), 'Prompt must indicate sub-goal context');
  assert.ok(prompt.includes('You are running inside an isolated sub-goal spawned by parent goal'));
  assert.ok(prompt.includes('Parent Goal ID:'));
});
