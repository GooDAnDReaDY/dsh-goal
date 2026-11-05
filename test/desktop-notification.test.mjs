import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('Desktop Notification (Issue #182): client source restricts HTML5 Notification to terminal states', () => {
  const bannerSrc = fs.readFileSync(path.join(rootDir, 'src', 'client', '70-dock-banner.js'), 'utf8');
  const clientSrc = fs.readFileSync(path.join(rootDir, 'lib', 'client.js'), 'utf8');

  // Both src and compiled bundle must guard Notification by terminal states
  assert.ok(
    bannerSrc.includes("if (nextState.state === 'COMPLETED' || nextState.state === 'FAILED')"),
    'src/client/70-dock-banner.js must check for terminal states before invoking Notification'
  );
  assert.ok(
    clientSrc.includes("if (nextState.state === 'COMPLETED' || nextState.state === 'FAILED')"),
    'lib/client.js must check for terminal states before invoking Notification'
  );

  // Must not have the old blind fallback ternary without state check
  const oldBlindTernary = "const isOk = nextState.state === 'COMPLETED';\n\n                  new Notification";
  assert.ok(!bannerSrc.includes(oldBlindTernary), 'Old blind ternary notification pattern must be removed');

  // Must have title fallback preventing "undefined ()"
  assert.ok(
    bannerSrc.includes("nextState.title || (isOk ? 'Goal Completed' : 'Goal Failed')"),
    'Must provide clean fallback for undefined title'
  );
});

test('Desktop Notification (Issue #182): routes fallback snapshots provide defined state and title', () => {
  const routesSrc = fs.readFileSync(path.join(rootDir, 'lib', 'routes.js'), 'utf8');

  // Check initialSnap fallback in SSE route
  assert.ok(
    routesSrc.includes("state: 'IDLE', status: 'IDLE', title: ''"),
    'routes.js SSE initialSnap fallback must provide state: IDLE and title: empty string'
  );

  // Check /dsh-goal/state fallback
  assert.ok(
    routesSrc.includes("title: '',\n            milestones: []"),
    'routes.js /dsh-goal/state fallback must include title: empty string'
  );
});

test('Desktop Notification (Issue #182): simulated notification gate logic behavior', () => {
  // Simulate the notification decision function
  function simulateNotificationTrigger(prev, nextState, permission = 'granted') {
    const notifications = [];
    class MockNotification {
      constructor(title, options) {
        notifications.push({ title, options });
      }
    }

    if (nextState && prev) {
      if (prev.state !== nextState.state && nextState.enableSound !== false) {
        if (nextState.enableBrowserNotifications !== false && permission === 'granted') {
          if (nextState.state === 'COMPLETED' || nextState.state === 'FAILED') {
            const isOk = nextState.state === 'COMPLETED';
            const goalTitle = nextState.title || (isOk ? 'Goal Completed' : 'Goal Failed');
            const elapsed = nextState.formattedElapsed ? ` (${nextState.formattedElapsed})` : '';
            new MockNotification(
              isOk ? '🎯 Goal Completed' : '⚠️ Goal Failed',
              {
                body: `${goalTitle}${elapsed}`,
                icon: '/favicon.ico',
              }
            );
          }
        }
      }
    }
    return notifications;
  }

  // 1. Restart transition: undefined -> IDLE (Issue #182 reproduction case)
  const restartNotifs = simulateNotificationTrigger(
    { sessionId: 'default', state: undefined },
    { sessionId: 'default', state: 'IDLE', hasActiveGoal: false }
  );
  assert.equal(restartNotifs.length, 0, 'No notification should fire when transitioning to IDLE on restart');

  // 2. Normal lifecycle transitions
  assert.equal(
    simulateNotificationTrigger({ state: 'IDLE' }, { state: 'RUNNING', title: 'Task' }).length,
    0,
    'No notification on start/RUNNING'
  );
  assert.equal(
    simulateNotificationTrigger({ state: 'RUNNING' }, { state: 'PAUSED', title: 'Task' }).length,
    0,
    'No notification on PAUSED'
  );
  assert.equal(
    simulateNotificationTrigger({ state: 'RUNNING' }, { state: 'PLANNING', title: 'Task' }).length,
    0,
    'No notification on PLANNING'
  );

  // 3. Goal completed
  const completedNotifs = simulateNotificationTrigger(
    { state: 'RUNNING' },
    { state: 'COMPLETED', title: 'Ship Feature', formattedElapsed: '12m' }
  );
  assert.equal(completedNotifs.length, 1);
  assert.equal(completedNotifs[0].title, '🎯 Goal Completed');
  assert.equal(completedNotifs[0].options.body, 'Ship Feature (12m)');

  // 4. Goal failed
  const failedNotifs = simulateNotificationTrigger(
    { state: 'RUNNING' },
    { state: 'FAILED', title: 'Flaky Tests', formattedElapsed: '5m' }
  );
  assert.equal(failedNotifs.length, 1);
  assert.equal(failedNotifs[0].title, '⚠️ Goal Failed');
  assert.equal(failedNotifs[0].options.body, 'Flaky Tests (5m)');

  // 5. Goal failed with undefined title & formattedElapsed
  const fallbackNotifs = simulateNotificationTrigger(
    { state: 'RUNNING' },
    { state: 'FAILED', title: undefined, formattedElapsed: undefined }
  );
  assert.equal(fallbackNotifs.length, 1);
  assert.equal(fallbackNotifs[0].title, '⚠️ Goal Failed');
  assert.equal(fallbackNotifs[0].options.body, 'Goal Failed');
  assert.ok(!fallbackNotifs[0].options.body.includes('undefined'));
});
