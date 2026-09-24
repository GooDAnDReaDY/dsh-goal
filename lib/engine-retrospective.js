import { execFileSync } from 'node:child_process';
import { MilestoneStatus, calculateElapsedSeconds } from './goal-engine-constants.js';

/**
 * Generate post-goal retrospective analytics card
 * @param {object} goal 
 * @param {string} cwd 
 * @returns {object} retrospective summary
 */
export function generateRetrospectiveData(goal, cwd = process.cwd()) {
  if (!goal) return null;

  const elapsedSeconds = calculateElapsedSeconds(goal);
  const totalTokens = goal.tokensUsage?.totalTokens || 0;
  // Estimated cost based on blended DeepSeek API pricing (~$0.0000015/token)
  const estimatedCostUsd = Number(((totalTokens * 0.0000015)).toFixed(4));

  const milestones = Array.isArray(goal.milestones) ? goal.milestones : [];
  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter((m) => m.status === MilestoneStatus.COMPLETED).length;

  const milestoneVelocity = completedMilestones > 0
    ? Math.round(elapsedSeconds / completedMilestones)
    : 0;

  const activities = Array.isArray(goal.activityFeed) ? goal.activityFeed : [];
  const totalToolCalls = activities.filter((a) => a.type === 'tool').length;
  const failedToolCalls = activities.filter((a) => a.type === 'tool' && a.status === 'error').length;
  const toolFailureRate = totalToolCalls > 0
    ? Math.round((failedToolCalls / totalToolCalls) * 100)
    : 0;

  let gitDiffStat = '';
  let filesChangedCount = 0;
  try {
    const startRef = goal.startCommit || 'HEAD~1';
    const rawStat = execFileSync('git', ['diff', '--stat', `${startRef}..HEAD`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    gitDiffStat = rawStat;
    const match = rawStat.match(/(\d+)\s+file[s]?\s+changed/i);
    if (match) {
      filesChangedCount = parseInt(match[1], 10);
    }
  } catch (err) {
    gitDiffStat = 'No git diff available';
  }

  const recommendations = [];
  if (toolFailureRate > 20) {
    recommendations.push('High tool error rate detected; check command arguments or environment paths.');
  }
  if (totalTokens > 100000) {
    recommendations.push('Consider setting maxTokenBudget or decomposing goal into smaller sub-tasks.');
  }
  if (completedMilestones === totalMilestones && totalMilestones > 0) {
    recommendations.push('All milestones completed cleanly. Recommended next step: run full test suite and verify git status.');
  }

  return {
    title: goal.title || 'Untitled Goal',
    elapsedSeconds,
    totalTokens,
    estimatedCostUsd,
    totalMilestones,
    completedMilestones,
    milestoneVelocity,
    totalToolCalls,
    failedToolCalls,
    toolFailureRate,
    gitDiffStat,
    filesChangedCount,
    recommendations,
    gitBranch: goal.gitBranch || null,
    generatedAt: Date.now(),
  };
}
