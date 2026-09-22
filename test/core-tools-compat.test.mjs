import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/index.js';
import { GoalEngine, GoalState } from '../lib/goal-engine.js';

test('Core tools compatibility: tools registered and shadow core definitions', async () => {
  // Mock Cordis Context with tools, systemPrompt, settings
  const registeredTools = new Map();
  const effects = [];

  const mockToolsService = {
    layers: {
      global: {
        tools: {
          data: new Map([
            ['update_goal', { name: 'update_goal', core: true }],
            ['get_goal', { name: 'get_goal', core: true }],
            ['create_goal', { name: 'create_goal', core: true }],
          ]),
        },
      },
    },
    register(def) {
      registeredTools.set(def.name, def);
      return () => registeredTools.delete(def.name);
    },
  };

  const registeredSections = new Map();
  const mockSystemPromptService = {
    layers: {
      global: {
        sections: {
          data: new Map([
            ['tool:goal', { name: 'tool:goal', coreText: 'old guidance' }],
          ]),
        },
      },
    },
    getSectionOrder: () => 2400,
    section(def) {
      registeredSections.set(def.name, def);
      return () => registeredSections.delete(def.name);
    },
  };

  const injected = {};
  const mockCtx = {
    inject(names, cb) {
      names.forEach(n => {
        if (n === 'tools') cb({ tools: mockToolsService, effect: (fn) => effects.push(fn) });
        if (n === 'systemPrompt') cb({ systemPrompt: mockSystemPromptService, effect: (fn) => effects.push(fn) });
        if (n === 'settings') cb({ settings: { register: () => {} }, effect: (fn) => effects.push(fn) });
        if (n === 'commands') cb({ commands: { register: () => {} }, effect: (fn) => effects.push(fn) });
      });
    },
    effect(fn) {
      effects.push(fn);
    },
  };

  apply(mockCtx, { storagePath: '' });

  // 1. Verify core tools were removed from mockToolsService.layers.global.tools.data and replaced
  assert.equal(registeredTools.has('update_goal'), true, 'update_goal registered');
  assert.equal(registeredTools.has('get_goal'), true, 'get_goal registered');
  assert.equal(registeredTools.has('create_goal'), true, 'create_goal registered');
  assert.equal(registeredTools.has('goal_set_milestones'), true, 'goal_set_milestones registered');
  assert.equal(registeredTools.has('goal_update_progress'), true, 'goal_update_progress registered');
  assert.equal(registeredTools.has('goal_finish'), true, 'goal_finish registered');

  // 2. Verify tool:goal prompt section replaced core
  assert.equal(registeredSections.has('tool:dsh-goal'), true, 'tool:dsh-goal section registered');
  assert.equal(mockSystemPromptService.layers.global.sections.data.has('tool:goal'), false, 'core tool:goal section cleared');
  assert.ok(registeredSections.get('tool:dsh-goal').order > 0);

  // 3. Test get_goal when no active goal
  const getGoal = registeredTools.get('get_goal');
  const emptyRes = await getGoal.execute({}, { sessionId: 'test-session' });
  assert.deepEqual(emptyRes, { goal: null });

  // 4. Test create_goal
  const createGoal = registeredTools.get('create_goal');
  const createRes = await createGoal.execute({
    objective: 'Implement OAuth2 refresh flow',
    max_goal_rounds: 15,
  }, { sessionId: 'test-session' });

  assert.equal(createRes.goal.objective, 'Implement OAuth2 refresh flow');
  assert.equal(createRes.goal.phase, 'active');
  assert.equal(createRes.goal.maxGoalRounds, 15);
  assert.equal(createRes.activation, 'armed');

  // 5. Test get_goal when goal is active
  const activeRes = await getGoal.execute({}, { sessionId: 'test-session' });
  assert.equal(activeRes.goal.objective, 'Implement OAuth2 refresh flow');
  assert.equal(activeRes.goal.phase, 'active');
  assert.equal(activeRes.activation, 'armed');

  // 6. Test update_goal: pause
  const updateGoal = registeredTools.get('update_goal');
  const pauseRes = await updateGoal.execute({
    action: 'pause',
    blocked_reason: 'Waiting for credentials',
  }, { sessionId: 'test-session' });

  assert.equal(pauseRes.goal.phase, 'paused');
  assert.equal(pauseRes.activation, 'disarmed');

  // 7. Test update_goal: resume
  const resumeRes = await updateGoal.execute({
    action: 'resume',
  }, { sessionId: 'test-session' });

  assert.equal(resumeRes.goal.phase, 'active');
  assert.equal(resumeRes.activation, 'armed');

  // 8. Test update_goal: edit
  const editRes = await updateGoal.execute({
    action: 'edit',
    objective: 'Updated OAuth2 title',
    max_goal_rounds: 20,
  }, { sessionId: 'test-session' });

  assert.equal(editRes.goal.objective, 'Updated OAuth2 title');
  assert.equal(editRes.goal.maxGoalRounds, 20);

  // 9. Test update_goal: blocked
  let deferredText = null;
  const blockedRes = await updateGoal.execute({
    action: 'blocked',
    blocked_reason: 'Rate limit hit 429',
  }, {
    sessionId: 'test-session',
    deferContext: (ctx) => { deferredText = ctx.text; },
  });

  assert.equal(blockedRes.goal.phase, 'blocked');
  assert.equal(blockedRes.goal.blockedReason.message, 'Rate limit hit 429');
  assert.ok(deferredText.includes('<goal_blocked>'));

  // 10. Test update_goal: complete
  let completeDeferred = null;
  const completeRes = await updateGoal.execute({
    action: 'complete',
    blocked_reason: 'Completed all subtasks successfully',
  }, {
    sessionId: 'test-session',
    deferContext: (ctx) => { completeDeferred = ctx.text; },
  });

  assert.equal(completeRes.goal.phase, 'complete');
  assert.equal(completeRes.activation, 'disarmed');
  assert.ok(completeDeferred.includes('<goal_complete>'));
});
