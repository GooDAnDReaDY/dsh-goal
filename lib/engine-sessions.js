import { GoalMode, GoalState } from './goal-engine-constants.js';

/**
 * Prune inactive sessions when exceeding maxSessions threshold
 */
export function pruneInactiveSessions(goals, stallCounters, toolFailureCounters, maxSessions = 100) {
  if (!goals || goals.size < maxSessions) return;
  const inactive = [];
  for (const [sid, goal] of goals.entries()) {
    if (sid === 'default') continue;
    if (goal.state === GoalState.COMPLETED || goal.state === GoalState.CANCELLED || goal.state === GoalState.FAILED) {
      inactive.push({ sid, completedAt: goal.completedAt || goal.startedAt || 0 });
    }
  }
  inactive.sort((a, b) => a.completedAt - b.completedAt);
  while (goals.size >= maxSessions && inactive.length > 0) {
    const oldest = inactive.shift();
    goals.delete(oldest.sid);
    stallCounters?.delete(oldest.sid);
    toolFailureCounters?.delete(oldest.sid);
  }
}

/**
 * Add a user steering nudge to a goal
 */
export function addNudgeToGoal(goal, text) {
  if (!goal) return null;
  const clean = String(text || '').trim();
  if (!clean) return null;

  if (!Array.isArray(goal.nudges)) goal.nudges = [];
  const now = Date.now();
  goal.nudges.push({ text: clean, timestamp: now });
  if (goal.nudges.length > 50) goal.nudges = goal.nudges.slice(-50);
  goal.pendingNudge = clean;
  goal.logs.push({
    timestamp: now,
    type: 'info',
    message: `User steering / clarification: "${clean}"`,
  });
  if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
  return clean;
}

/**
 * Consume and clear pending nudge
 */
export function consumeGoalNudge(goal) {
  if (!goal || !goal.pendingNudge) return null;
  const nudge = goal.pendingNudge;
  goal.pendingNudge = null;
  return nudge;
}

/**
 * Extend token budget for a goal
 */
export function extendGoalBudget(goal, addTokens = 50000, defaultBudget = 0) {
  if (!goal) return null;
  const currentTotal = goal.tokensUsage?.totalTokens || 0;
  const currentMax = goal.maxTokenBudget || defaultBudget || 0;
  const newBudget = Math.max(currentTotal, currentMax) + Math.max(1000, Number(addTokens) || 50000);
  goal.maxTokenBudget = newBudget;

  const now = Date.now();
  if (goal.state === GoalState.PAUSED) {
    if (goal.pausedAt) {
      goal.totalPausedDurationMs += now - goal.pausedAt;
      goal.pausedAt = null;
    }
    goal.state = GoalState.RUNNING;
  }

  goal.budgetWarningTriggered = false;
  goal.logs.push({
    timestamp: now,
    type: 'info',
    message: `Token budget extended by +${addTokens.toLocaleString('en-US')} (new limit: ${newBudget.toLocaleString('en-US')})`,
  });
  if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
  return newBudget;
}

/**
 * Set mode for a goal
 */
export function setGoalMode(goal, mode, recordActivity) {
  if (mode !== GoalMode.PLAN && mode !== GoalMode.ACT) {
    throw new Error(`Invalid mode: ${mode}. Must be one of: plan, act`);
  }
  if (!goal) {
    throw new Error('No active goal found');
  }
  const previousMode = goal.mode || GoalMode.ACT;
  goal.mode = mode;
  if (mode === GoalMode.ACT && goal.state === GoalState.PLANNING) {
    goal.state = GoalState.RUNNING;
  } else if (mode === GoalMode.PLAN && goal.state === GoalState.RUNNING) {
    goal.state = GoalState.PLANNING;
  }
  const message = mode === GoalMode.ACT
    ? 'Plan approved by operator, switched to Act Mode'
    : 'Switched to Plan Mode (read-only planning phase)';
  goal.logs.push({ timestamp: Date.now(), type: 'info', message });
  if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
  if (typeof recordActivity === 'function') {
    recordActivity(goal, { type: 'control', tool: 'setMode', status: 'info', details: `${previousMode} -> ${mode}` });
  }
  return goal;
}

/**
 * Pause active goal
 */
export function pauseGoal(goal, reason, recordActivity) {
  if (!goal || goal.state !== GoalState.RUNNING) return false;
  goal.state = GoalState.PAUSED;
  goal.pausedAt = Date.now();
  if (typeof recordActivity === 'function') {
    recordActivity(goal, { type: 'control', tool: 'pause', status: 'warning', details: reason });
  }
  goal.logs.push({ timestamp: Date.now(), type: 'warning', message: `Paused: ${reason}` });
  if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
  return true;
}

/**
 * Resume paused goal
 */
export function resumeGoal(goal, recordActivity) {
  if (!goal || goal.state !== GoalState.PAUSED) return false;
  const now = Date.now();
  if (goal.pausedAt) {
    goal.totalPausedDurationMs += now - goal.pausedAt;
    goal.pausedAt = null;
  }
  goal.state = GoalState.RUNNING;
  if (typeof recordActivity === 'function') {
    recordActivity(goal, { type: 'control', tool: 'resume', status: 'info', details: 'Resumed by user' });
  }
  goal.logs.push({ timestamp: now, type: 'info', message: 'Goal resumed' });
  if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
  return true;
}

/**
 * Cancel active goal
 */
export function cancelGoal(goal, reason, recordActivity) {
  if (!goal) return false;
  goal.state = GoalState.CANCELLED;
  goal.completedAt = Date.now();
  if (typeof recordActivity === 'function') {
    recordActivity(goal, { type: 'control', tool: 'cancel', status: 'warning', details: reason });
  }
  goal.logs.push({ timestamp: Date.now(), type: 'warning', message: `Cancelled: ${reason}` });
  if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
  return true;
}
