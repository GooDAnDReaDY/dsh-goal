import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState } from '../lib/goal-engine.js';
import { parseGoalInput, executeGoalSlashCommand } from '../lib/command-handler.js';
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

test('executeGoalSlashCommand handles show, start, pause, resume, clear lifecycle', () => {
  const engine = new GoalEngine({ defaultMaxIterations: 20 });

  // 1. Show when empty
  const showEmpty = executeGoalSlashCommand(engine, { action: 'show' });
  assert.equal(showEmpty.kind, 'success');
  assert.ok(showEmpty.text.includes('цель не установлена'));

  // 2. Pause when empty -> error
  const pauseEmpty = executeGoalSlashCommand(engine, { action: 'pause' });
  assert.equal(pauseEmpty.kind, 'error');
  assert.ok(pauseEmpty.text.includes('Нельзя приостановить'));

  // 3. Start goal
  const started = executeGoalSlashCommand(engine, { action: 'start', text: 'Реализовать фичу' }, { maxIterations: 15 });
  assert.equal(started.kind, 'success');
  assert.ok(started.text.includes('Реализовать фичу'));
  assert.ok(started.text.includes('15 итераций'));
  assert.equal(engine.getSnapshot().state, GoalState.RUNNING);

  // 4. Show active
  const showActive = executeGoalSlashCommand(engine, { action: 'show' });
  assert.equal(showActive.kind, 'success');
  assert.ok(showActive.text.includes('Реализовать фичу'));
  assert.ok(showActive.text.includes('RUNNING'));

  // 5. Pause active
  const paused = executeGoalSlashCommand(engine, { action: 'pause' });
  assert.equal(paused.kind, 'success');
  assert.ok(paused.text.includes('приостановлена'));
  assert.equal(engine.getSnapshot().state, GoalState.PAUSED);

  // 6. Resume active
  const resumed = executeGoalSlashCommand(engine, { action: 'resume' });
  assert.equal(resumed.kind, 'success');
  assert.ok(resumed.text.includes('возобновлена'));
  assert.equal(engine.getSnapshot().state, GoalState.RUNNING);

  // 7. Clear active
  const cleared = executeGoalSlashCommand(engine, { action: 'clear' });
  assert.equal(cleared.kind, 'success');
  assert.ok(cleared.text.includes('сброшена'));
  assert.equal(engine.getSnapshot().hasActiveGoal, false);
});

test('apply registers /goal command with commands service', async () => {
  let registeredCommand = null;
  let effectRegistered = false;

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
            effectRegistered = true;
          },
        };
        callback(cctx);
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

  // Test handler invocation
  const result = await registeredCommand.handler({ rawInput: 'Тестовая цель через слэш' });
  assert.equal(result.kind, 'success');
  assert.ok(result.text.includes('Тестовая цель через слэш'));
  assert.ok(result.text.includes('30 итераций'));
});
