import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/index.js';
import { registerTools } from '../lib/tools.js';

test('Issue #113: Core tools are preserved; addon registers goal_milestones and goal_checklist', async () => {
  const registeredTools = new Map();
  const effects = [];

  const existingTools = new Map([
    ['update_goal', { name: 'update_goal', core: true }],
    ['get_goal', { name: 'get_goal', core: true }],
    ['create_goal', { name: 'create_goal', core: true }],
  ]);

  const mockToolsService = {
    layers: {
      global: {
        tools: {
          data: existingTools,
        },
      },
    },
    register(def) {
      registeredTools.set(def.name, def);
      return () => registeredTools.delete(def.name);
    },
  };

  const mockCtx = {
    inject(names, cb) {
      names.forEach(n => {
        if (n === 'tools') cb({ tools: mockToolsService, effect: (fn) => effects.push(fn) });
        if (n === 'settings') cb({ settings: { register: () => {} }, effect: (fn) => effects.push(fn) });
      });
    },
    effect(fn) {
      effects.push(fn);
    },
  };

  apply(mockCtx, { storagePath: '' });

  // 1. Core tools must NOT be registered or shadowed by dsh-goal
  assert.equal(registeredTools.has('update_goal'), false, 'update_goal must not be shadowed');
  assert.equal(registeredTools.has('get_goal'), false, 'get_goal must not be shadowed');
  assert.equal(registeredTools.has('create_goal'), false, 'create_goal must not be shadowed');

  // 2. Core tools must remain in global layers
  assert.equal(existingTools.get('update_goal').core, true);
  assert.equal(existingTools.get('get_goal').core, true);
  assert.equal(existingTools.get('create_goal').core, true);

  // 3. Addon tools must be registered
  assert.equal(registeredTools.has('goal_milestones'), true, 'goal_milestones registered');
  assert.equal(registeredTools.has('goal_checklist'), true, 'goal_checklist registered');

  // 4. Test goal_milestones tool execution
  const milestonesTool = registeredTools.get('goal_milestones');
  assert.ok(milestonesTool, 'goal_milestones tool exists');

  const setResult = await milestonesTool.execute({
    action: 'set',
    milestones: [
      { id: 'm1', title: 'Phase 1: Setup', checklist: [{ text: 'Init config', done: false }] },
      { id: 'm2', title: 'Phase 2: Execution', checklist: [{ text: 'Run tasks', done: false }] },
    ],
  }, { sessionId: 'test-sess' });

  assert.equal(setResult.ok, true);
  assert.equal(setResult.milestones.length, 2);

  // 5. Test goal_checklist tool execution
  const checklistTool = registeredTools.get('goal_checklist');
  assert.ok(checklistTool, 'goal_checklist tool exists');

  const toggleResult = await checklistTool.execute({
    milestone_id: 'm1',
    item_index: 0,
    done: true,
  }, { sessionId: 'test-sess' });

  assert.equal(toggleResult.ok, true);
  assert.equal(toggleResult.item.done, true);
});
