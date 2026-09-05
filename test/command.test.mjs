import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState } from '../lib/goal-engine.js';
import { parseGoalInput, executeGoalSlashCommand, createGoalUserMessage } from '../lib/command-handler.js';
import { apply } from '../lib/index.js';

test('parseGoalInput correctly parses commands and arguments', () => {
  assert.deepEqual(parseGoalInput(''), { action: 'show' });
  assert.deepEqual(parseGoalInput('   '), { action: 'show' });
  assert.deepEqual(parseGoalInput(undefined), { action: 'show' });
  assert.deepEqual(parseGoalInput('clear'), { action: 'clear' });
  assert.deepEqual(parseGoalInput('CLEAR'), { action: 'clear' });
  assert.deepEqual(parseGoalInput('pause'), { action: 'pause' });
  assert.deepEqual(parseGoalInput('PAUSE '), { action: 'pause' });
  assert.deepEqual(parseGoalInput('resume'), { action: 'resume' });
  assert.deepEqual(parseGoalInput('  resume  '), { action: 'resume' });
  assert.deepEqual(parseGoalInput('Написать юнит-тесты'), { action: 'start', text: 'Написать юнит-тесты' });
});

test('createGoalUserMessage formats proper DSH user message object with valid UUID id', () => {
  const msg = createGoalUserMessage('Поставить цель');
  assert.equal(typeof msg.id, 'string');
  assert.ok(msg.id.length >= 32, 'Message id must be a non-empty UUID string');
  assert.equal(msg.role, 'user');
  assert.deepEqual(msg.content, [{ type: 'text', text: 'Поставить цель' }]);
  assert.deepEqual(msg.source, { kind: 'user' });
});

test('executeGoalSlashCommand handles show, start, pause, resume, clear lifecycle with agent cancel and resume', () => {
  const engine = new GoalEngine({ defaultMaxIterations: 20 });
  const dispatchedMessages = [];
  const cancelledEvents = [];

  const mockAgent = {
    followup(msg) {
      dispatchedMessages.push(msg);
    },
    cancel(evt) {
      cancelledEvents.push(evt);
    },
  };

  // 1. Show when empty
  const showEmpty = executeGoalSlashCommand(engine, { action: 'show' });
  assert.equal(showEmpty.kind, 'success');
  assert.ok(showEmpty.text.includes('цель не установлена'));

  // 2. Pause when empty -> error
  const pauseEmpty = executeGoalSlashCommand(engine, { action: 'pause' });
  assert.equal(pauseEmpty.kind, 'error');
  assert.ok(pauseEmpty.text.includes('Нельзя приостановить'));

  // 3. Start goal WITH agent followup
  const started = executeGoalSlashCommand(engine, { action: 'start', text: 'Реализовать фичу' }, { maxIterations: 15 }, mockAgent);
  assert.equal(started.kind, 'success');
  assert.ok(started.text.includes('Реализовать фичу'));
  assert.ok(started.text.includes('15 итераций'));
  assert.equal(engine.getSnapshot().state, GoalState.RUNNING);

  // Check that agent received the message with id and prompt requiring goal_set_milestones
  assert.equal(dispatchedMessages.length, 1);
  assert.equal(dispatchedMessages[0].role, 'user');
  assert.equal(typeof dispatchedMessages[0].id, 'string');
  assert.ok(dispatchedMessages[0].content[0].text.includes('Реализовать фичу'));
  assert.ok(dispatchedMessages[0].content[0].text.includes('goal_set_milestones'));

  // 4. Show active
  const showActive = executeGoalSlashCommand(engine, { action: 'show' });
  assert.equal(showActive.kind, 'success');
  assert.ok(showActive.text.includes('Реализовать фичу'));
  assert.ok(showActive.text.includes('RUNNING'));

  // 5. Pause active cancels running agent
  const paused = executeGoalSlashCommand(engine, { action: 'pause' }, {}, mockAgent);
  assert.equal(paused.kind, 'success');
  assert.ok(paused.text.includes('приостановлена'));
  assert.equal(engine.getSnapshot().state, GoalState.PAUSED);
  assert.equal(cancelledEvents.length, 1);
  assert.equal(cancelledEvents[0].kind, 'user');

  // 6. Resume active wakes agent with followup
  const resumed = executeGoalSlashCommand(engine, { action: 'resume' }, {}, mockAgent);
  assert.equal(resumed.kind, 'success');
  assert.ok(resumed.text.includes('возобновлена'));
  assert.equal(engine.getSnapshot().state, GoalState.RUNNING);
  assert.equal(dispatchedMessages.length, 2);
  assert.equal(typeof dispatchedMessages[1].id, 'string');
  assert.ok(dispatchedMessages[1].content[0].text.includes('возобновлена'));

  // 7. Clear active cancels agent and resets state
  const cleared = executeGoalSlashCommand(engine, { action: 'clear' }, {}, mockAgent);
  assert.equal(cleared.kind, 'success');
  assert.ok(cleared.text.includes('сброшена'));
  assert.equal(engine.getSnapshot().hasActiveGoal, false);
  assert.equal(cancelledEvents.length, 2);
});

test('apply registers /goal command with commands service and injects systemPrompt', async () => {
  let registeredCommand = null;
  let registeredSection = null;
  const followups = [];

  const mockCtx = {
    inject(services, callback) {
      if (services.includes('commands')) {
        const cctx = {
          commands: {
            register(def) {
              registeredCommand = def;
              return () => { registeredCommand = null; };
            },
          },
          effect(fn) {
            fn();
          },
        };
        callback(cctx);
      }
      if (services.includes('systemPrompt')) {
        const pctx = {
          systemPrompt: {
            getSectionOrder: () => 650,
            section(sec) {
              registeredSection = sec;
              return () => { registeredSection = null; };
            },
          },
          effect(fn) {
            fn();
          },
        };
        callback(pctx);
      }
    },
    effect() {},
    on() {},
    off() {},
  };

  apply(mockCtx, { maxIterations: 30 });

  assert.ok(registeredCommand, 'Command definition should be registered in commands service');
  assert.equal(registeredCommand.name, 'goal');
  assert.ok(registeredCommand.description.includes('Goal Mode'));
  assert.equal(typeof registeredCommand.handler, 'function');

  assert.ok(registeredSection, 'System prompt section should be registered');
  assert.equal(registeredSection.name, 'tool:dsh-goal');
  assert.equal(registeredSection.order, 650);

  // Test handler invocation with agent
  const result = await registeredCommand.handler({
    rawInput: 'Тестовая цель через слэш',
    agent: {
      followup(m) { followups.push(m); },
    },
  });

  assert.equal(result.kind, 'success');
  assert.ok(result.text.includes('Тестовая цель через слэш'));
  assert.ok(result.text.includes('30 итераций'));

  // Ensure agent got the task with UUID and plan instructions
  assert.equal(followups.length, 1);
  assert.equal(typeof followups[0].id, 'string');
  assert.ok(followups[0].content[0].text.includes('Тестовая цель через слэш'));
  assert.ok(followups[0].content[0].text.includes('goal_set_milestones'));

  // Ensure system prompt section reflects the active goal
  const promptText = registeredSection.text();
  assert.ok(promptText.includes('Тестовая цель через слэш'));
  assert.ok(promptText.includes('[DSH GOAL MODE ACTIVE]'));
});
