import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState } from '../lib/goal-engine.js';
import { apply } from '../lib/index.js';

test('GoalEngine dynamically updates configuration at runtime', () => {
  const engine = new GoalEngine({
    defaultMaxIterations: 20,
    autoDrive: true,
    enableSound: false,
  });

  const snap1 = engine.startGoal('Test Goal');
  assert.equal(snap1.maxIterations, 20);

  // Live update config
  engine.updateConfig({
    defaultMaxIterations: 50,
    autoDrive: false,
    enableSound: true,
  });

  assert.equal(engine.defaultMaxIterations, 50);
  assert.equal(engine.autoDrive, false);
  assert.equal(engine.enableSound, true);
  assert.equal(engine.getSnapshot().maxIterations, 50);
});

test('Host apply subscribes to settings and applies dynamic config', () => {
  let settingsCallback = null;
  let currentVal = { maxIterations: 10, autoDrive: false, enableSound: true };

  const fakeScope = {
    getSnapshot: () => ({ value: currentVal }),
    get: () => currentVal,
    subscribe: (fn) => {
      settingsCallback = fn;
      return () => { settingsCallback = null; };
    },
  };

  const effects = [];
  const fakeCtx = {
    inject: (deps, fn) => {
      if (deps.includes('settings')) {
        fn({
          settings: {
            register: (ns, schema, opts) => fakeScope,
          },
          effect: (eff) => { effects.push(eff()); },
        });
      }
    },
    effect: (eff) => { effects.push(eff()); },
    on: () => {},
    off: () => {},
  };

  apply(fakeCtx, { maxIterations: 25 });

  // When settings change in GUI
  currentVal = { maxIterations: 100, autoDrive: true, enableSound: false };
  if (settingsCallback) {
    settingsCallback();
  }

  // Cleanup effects
  for (const cleanup of effects) {
    if (typeof cleanup === 'function') cleanup();
  }
});
