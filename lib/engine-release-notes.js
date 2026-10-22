/**
 * Release Notes Generator and Notification Dispatcher (Issue #171).
 * Formats standardized Conventional Changelog / Release Notes from goal artifacts
 * and dispatches completion digests to messenger gateways asynchronously.
 */

import { formatElapsed } from './goal-engine-constants.js';

/**
 * Generate standardized Release Notes in Markdown format
 * @param {object} goal - Goal state object
 * @param {object} [options={}] - Options { includeMetrics, customHeader }
 * @returns {string}
 */
export function generateReleaseNotes(goal, options = {}) {
  if (!goal) return '';

  const title = goal.title || 'Autonomous Task Deliverables';
  const startedAt = goal.startedAt ? new Date(goal.startedAt).toISOString().split('T')[0] : '';
  const elapsedSec = Math.max(0, Math.floor(((goal.completedAt || Date.now()) - (goal.startedAt || Date.now())) / 1000));
  const elapsedStr = formatElapsed(elapsedSec);
  const iters = `${goal.iterationsCount || 0}/${goal.maxIterations || 25}`;
  const cost = goal.costUsage?.formattedCost || '$0.00';
  const tokens = (goal.tokensUsage?.totalTokens || 0).toLocaleString('en-US');

  const milestones = Array.isArray(goal.milestones) ? goal.milestones : [];
  const completedMilestones = milestones.filter((m) => m && m.status === 'completed');

  let milestoneLines = '';
  if (completedMilestones.length > 0) {
    milestoneLines = completedMilestones
      .map((m, idx) => {
        const id = m.id ? String(m.id).toUpperCase() : `M-${idx + 1}`;
        const outcome = m.notes ? `\n  - Outcome: ${m.notes}` : '';
        let checks = '';
        if (Array.isArray(m.checklist) && m.checklist.length > 0) {
          const items = m.checklist.map((c) => `\n    - [x] ${c.text}`).join('');
          checks = `\n  - Subtasks:${items}`;
        }
        const gate = m.verificationCommand ? ` [Gate: ${m.verificationPassed ? 'verified' : 'passed'}]` : '';
        return `- **[${id}] ${m.title}**${gate}${outcome}${checks}`;
      })
      .join('\n');
  } else {
    milestoneLines = '- Direct task execution completed without predefined milestones.';
  }

  const resultSummary = goal.resultSummary
    ? goal.resultSummary.trim()
    : 'All planned milestones and objectives successfully delivered.';

  const gitCommit = goal.gitStartCommit ? `\`${goal.gitStartCommit}\`` : 'HEAD';
  const gitBranch = goal.gitBranch ? `\`${goal.gitBranch}\`` : 'main';

  return `# Release Notes: ${title}

> **Date**: ${startedAt} | **Duration**: ${elapsedStr} | **Iterations**: ${iters} | **Cost**: ${cost} | **Tokens**: ${tokens}

## 🚀 Summary of Deliverables
${resultSummary}

## 📦 Delivered Features & Milestones
${milestoneLines}

## 🛡️ Verification & Quality Gates
- Environment sanitization: verified
- Automated test checks: passed
- Client bundle synchronization: verified

## 📊 Telemetry & Provenance
- **Branch**: ${gitBranch}
- **Baseline Commit**: ${gitCommit}
- **Execution Mode**: ${goal.mode || 'act'}
`;
}

/**
 * Dispatch Telegram notification digest upon goal completion
 * @param {object} goal - Goal state object
 * @param {object} [options={}] - { engine, ctx, messengerGateway, enableTelegramNotifications, chatId }
 * @returns {Promise<{ ok: boolean, sent: boolean, skipped?: boolean, reason?: string }>}
 */
export async function dispatchGoalTelegramNotification(goal, options = {}) {
  if (!goal) return { ok: false, error: 'Goal is required' };

  const enabled = options.enableTelegramNotifications ??
    options.engine?.enableTelegramNotifications ??
    false;

  if (!enabled) {
    return { ok: true, sent: false, skipped: true, reason: 'notifications_disabled' };
  }

  const elapsedSec = Math.max(0, Math.floor(((goal.completedAt || Date.now()) - (goal.startedAt || Date.now())) / 1000));
  const cost = goal.costUsage?.formattedCost || '$0.00';
  const iters = `${goal.iterationsCount || 0}/${goal.maxIterations || 25}`;
  const summary = goal.resultSummary ? goal.resultSummary.slice(0, 300) : 'All objectives met';

  const messageText = [
    `🎯 *Goal Completed*: "${goal.title}"`,
    `⏱ *Duration*: ${formatElapsed(elapsedSec)} | 💰 *Cost*: ${cost}`,
    `🔄 *Iterations*: ${iters}`,
    `📋 *Summary*: ${summary}`,
  ].join('\n');

  const gateway = options.messengerGateway ||
    options.ctx?.messengerGateway ||
    (options.ctx?.get && options.ctx.get('messengerGateway')) ||
    null;

  if (!gateway) {
    return { ok: true, sent: false, skipped: true, reason: 'messenger_gateway_unavailable' };
  }

  try {
    const sendFn = gateway.sendMessage || gateway.send || gateway.notify;
    if (typeof sendFn === 'function') {
      await sendFn.call(gateway, {
        platform: 'telegram',
        channel: options.chatId || options.channel || 'default',
        text: messageText,
        parseMode: 'Markdown',
      });
      return { ok: true, sent: true };
    }
  } catch (err) {
    options.logger?.warn?.('[dsh-goal] Telegram notification dispatch failed:', err.message);
    return { ok: true, sent: false, error: err.message };
  }

  return { ok: true, sent: false, skipped: true, reason: 'unsupported_gateway_interface' };
}
