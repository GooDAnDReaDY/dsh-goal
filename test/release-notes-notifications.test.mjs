import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine } from '../lib/goal-engine.js';
import { generateReleaseNotes, dispatchGoalTelegramNotification } from '../lib/engine-release-notes.js';

test('Release Notes: generateReleaseNotes formats complete Markdown changelog', () => {
  const goal = {
    title: 'Financial Cost Meter Release',
    startedAt: 1700000000000,
    completedAt: 1700000125000,
    iterationsCount: 4,
    maxIterations: 25,
    resultSummary: 'Successfully implemented cost metering and release notes.',
    costUsage: { formattedCost: '$0.12', totalCost: 0.12 },
    tokensUsage: { totalTokens: 45000 },
    milestones: [
      { id: 'm-1', title: 'Cost tracking engine', status: 'completed', notes: 'Implemented' },
      { id: 'm-2', title: 'Client UI widgets', status: 'completed', checklist: [{ text: 'Dock pill', done: true }] },
    ],
    gitBranch: 'feat/cost-meter',
    gitStartCommit: 'a1b2c3d',
  };

  const md = generateReleaseNotes(goal);
  assert.ok(md.includes('# Release Notes: Financial Cost Meter Release'));
  assert.ok(md.includes('$0.12'));
  assert.ok(md.includes('Cost tracking engine'));
  assert.ok(md.includes('Dock pill'));
  assert.ok(md.includes('feat/cost-meter'));
  assert.ok(md.includes('a1b2c3d'));
});

test('Release Notes: GoalEngine exportReleaseNotes delegate produces notes', () => {
  const engine = new GoalEngine();
  engine.startGoal('Goal with Release Notes', {}, 'rn-sid');
  engine.addMilestones(['Feature 1', 'Feature 2'], false, 'rn-sid');
  engine.updateMilestone('1', 'completed', 'Shipped feature 1', 'rn-sid');
  engine.completeGoal('All done', 'rn-sid');

  const notes = engine.exportReleaseNotes('rn-sid');
  assert.ok(notes.includes('# Release Notes: Goal with Release Notes'));
  assert.ok(notes.includes('Feature 1'));
});

test('Telegram Notification: dispatchGoalTelegramNotification skips when disabled', async () => {
  const goal = { title: 'Disabled Notification Goal' };
  const res = await dispatchGoalTelegramNotification(goal, { enableTelegramNotifications: false });
  assert.equal(res.ok, true);
  assert.equal(res.skipped, true);
  assert.equal(res.reason, 'notifications_disabled');
});

test('Telegram Notification: dispatchGoalTelegramNotification sends via mock gateway', async () => {
  const goal = {
    title: 'Test Telegram Notification Goal',
    startedAt: Date.now() - 60000,
    completedAt: Date.now(),
    costUsage: { formattedCost: '$0.05' },
    resultSummary: 'Shipped to production successfully',
  };

  let sentPayload = null;
  const mockGateway = {
    sendMessage: async (payload) => {
      sentPayload = payload;
      return { success: true };
    },
  };

  const res = await dispatchGoalTelegramNotification(goal, {
    enableTelegramNotifications: true,
    messengerGateway: mockGateway,
    chatId: '12345678',
  });

  assert.equal(res.ok, true);
  assert.equal(res.sent, true);
  assert.equal(sentPayload.platform, 'telegram');
  assert.equal(sentPayload.channel, '12345678');
  assert.ok(sentPayload.text.includes('Test Telegram Notification Goal'));
  assert.ok(sentPayload.text.includes('$0.05'));
});
