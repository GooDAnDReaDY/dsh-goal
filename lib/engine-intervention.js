import { MilestoneStatus } from './goal-engine-constants.js';

/**
 * Apply human intervention to a paused goal
 * @param {object} goal 
 * @param {object} intervention 
 * @returns {object} result
 */
export function applyIntervention(goal, intervention = {}) {
  if (!goal) {
    return { ok: false, error: 'No active goal' };
  }

  const { directive, milestones, deletedMilestoneIds } = intervention;

  if (typeof directive === 'string' && directive.trim()) {
    goal.userDirective = directive.trim();
    goal.userDirectiveConsumed = false;
  }

  if (Array.isArray(deletedMilestoneIds) && deletedMilestoneIds.length > 0) {
    const toDelete = new Set(deletedMilestoneIds.map(String));
    goal.milestones = goal.milestones.filter((m) => {
      // Do not allow deleting completed milestones
      if (m.status === MilestoneStatus.COMPLETED) return true;
      return !toDelete.has(String(m.id));
    });
  }

  if (Array.isArray(milestones) && milestones.length > 0) {
    for (const update of milestones) {
      if (!update || !update.id) continue;
      const target = goal.milestones.find((m) => String(m.id) === String(update.id));
      if (target) {
        if (typeof update.title === 'string' && update.title.trim()) {
          target.title = update.title.trim();
        }
        if (typeof update.notes === 'string') {
          target.notes = update.notes.trim();
        }
        if (update.status && Object.values(MilestoneStatus).includes(update.status)) {
          target.status = update.status;
        }
        if (Array.isArray(update.dependsOn)) {
          target.dependsOn = update.dependsOn.map(String);
        }
      } else if (typeof update.title === 'string' && update.title.trim()) {
        goal.milestones.push({
          id: String(update.id),
          title: update.title.trim(),
          status: update.status || MilestoneStatus.PENDING,
          notes: update.notes ? String(update.notes).trim() : '',
          checklist: Array.isArray(update.checklist) ? update.checklist : [],
          dependsOn: Array.isArray(update.dependsOn) ? update.dependsOn.map(String) : [],
        });
      }
    }
  }

  recordActivity(goal, {
    type: 'intervention',
    tool: 'user_intervention',
    status: 'success',
    details: directive ? `Directive: ${directive.slice(0, 60)}` : 'Plan adjusted by user',
  });

  return { ok: true, goal };
}

/**
 * Record an activity entry in the goal's recent activity feed (max 10 entries)
 * @param {object} goal 
 * @param {object} entry 
 */
export function recordActivity(goal, entry = {}) {
  if (!goal) return;
  if (!Array.isArray(goal.activityFeed)) {
    goal.activityFeed = [];
  }

  const actEntry = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: entry.type || 'tool',
    tool: entry.tool || 'unknown',
    status: entry.status || 'info',
    details: entry.details ? String(entry.details).slice(0, 200) : '',
    timestamp: entry.timestamp || Date.now(),
  };

  goal.activityFeed.push(actEntry);
  if (goal.activityFeed.length > 10) {
    goal.activityFeed.shift();
  }
}

/**
 * Check and enforce token budget limits and auto-scaling
 * @param {object} goal 
 * @param {object} options 
 * @returns {{ paused: boolean }}
 */
export function processTokenBudget(goal, options = {}) {
  const { maxTokenBudget = 0, budgetWarningThreshold = 80, autoScaleBudgetNearCompletion = false, GoalState } = options;
  const budget = goal.maxTokenBudget || maxTokenBudget || 0;
  if (budget <= 0 || !goal.tokensUsage) return { paused: false };

  const currentTotal = goal.tokensUsage.totalTokens;
  const warnThreshold = (budget * budgetWarningThreshold) / 100;

  if (currentTotal >= warnThreshold && !goal.budgetWarningTriggered) {
    goal.budgetWarningTriggered = true;
    goal.logs.push({
      timestamp: Date.now(),
      type: 'warning',
      message: `Token budget warning: ${currentTotal.toLocaleString('en-US')}/${budget.toLocaleString('en-US')} tokens consumed (${Math.round((currentTotal / budget) * 100)}%)`,
    });
    if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
  }

  if (currentTotal >= budget && goal.state === (GoalState?.RUNNING || 'running')) {
    const milestones = goal.milestones || [];
    const completed = milestones.filter((m) => m.status === MilestoneStatus.COMPLETED).length;
    const progress = milestones.length > 0 ? (completed / milestones.length) : 0;

    if (autoScaleBudgetNearCompletion && !goal.budgetAutoScaled && (progress >= 0.8 || completed === milestones.length - 1)) {
      const buffer = Math.round(budget * 0.2);
      goal.maxTokenBudget = budget + buffer;
      goal.budgetAutoScaled = true;
      goal.logs.push({
        timestamp: Date.now(),
        type: 'info',
        message: `Token budget auto-scaled by +${buffer.toLocaleString('en-US')} tokens near completion`,
      });
      if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
      return { paused: false };
    }

    goal.state = GoalState?.PAUSED || 'paused';
    goal.pausedAt = Date.now();
    goal.logs.push({
      timestamp: Date.now(),
      type: 'warning',
      message: `Token budget reached: ${currentTotal.toLocaleString('en-US')}/${budget.toLocaleString('en-US')} tokens. Pausing autonomous loop.`,
    });
    if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
    return { paused: true };
  }

  return { paused: false };
}
