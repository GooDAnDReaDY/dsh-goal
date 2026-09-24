/**
 * Enums and helpers for DSH Goal Engine
 */

export const GoalState = {
  IDLE: 'IDLE',
  PLANNING: 'PLANNING',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

export const MilestoneStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Format total elapsed seconds into concise string (e.g. "2s", "45s", "1m 15s", "2h 5m")
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatElapsed(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const remainingSec = sec % 60;
  if (mins < 60) {
    return remainingSec > 0 ? `${mins}m ${remainingSec}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

/**
 * Format estimated remaining time (ETA)
 * @param {number|null} seconds
 * @returns {string|null}
 */
export function formatETA(seconds) {
  if (seconds == null || isNaN(seconds)) return null;
  const sec = Math.max(0, Math.floor(seconds));
  if (sec < 60) return `~${sec}s`;
  const mins = Math.round(sec / 60);
  if (mins < 60) return `~${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `~${hours}h ${remainingMins}m` : `~${hours}h`;
}

/**
 * Detect language of text (Chinese characters -> zh, otherwise en)
 * @param {string} text
 * @param {string} [fallback='en']
 * @returns {'en' | 'zh'}
 */
export function detectLanguage(text, fallback = 'en') {
  if (!text || typeof text !== 'string') return fallback;
  if (/[\u4e00-\u9fa5]/.test(text)) {
    return 'zh';
  }
  return 'en';
}

/**
 * Extract session ID from invocation or HTTP request
 * @param {any} invocationOrReq
 * @param {string} [fallback='default']
 * @returns {string}
 */
export function sessionIdOf(invocationOrReq, fallback = 'default') {
  if (!invocationOrReq) return fallback;
  try {
    if (invocationOrReq.sessionId) return String(invocationOrReq.sessionId);
    if (invocationOrReq.session) {
      return String(invocationOrReq.session.id || invocationOrReq.session.header?.id || fallback);
    }
    if (invocationOrReq.data?.sessionId) return String(invocationOrReq.data.sessionId);
    if (invocationOrReq.agent?.session) {
      return String(invocationOrReq.agent.session.id || invocationOrReq.agent.session.header?.id || fallback);
    }
    if (invocationOrReq.headers) {
      const headerSid = invocationOrReq.headers['x-dsh-session-id'];
      if (headerSid) return String(headerSid);
      if (invocationOrReq.url) {
        const url = new URL(invocationOrReq.url, 'http://localhost');
        const querySid = url.searchParams.get('sessionId') || url.searchParams.get('session');
        if (querySid) return String(querySid);
      }
    }
  } catch (err) {
    // Non-fatal inspection error on malformed request or object
  }
  return fallback;
}

/**
 * Calculate elapsed seconds from goal timing properties
 * @param {object} goal
 * @returns {number}
 */
export function calculateElapsedSeconds(goal) {
  if (!goal) return 0;
  const { startedAt, pausedAt, totalPausedDurationMs, completedAt } = goal;
  const endTime = completedAt || (pausedAt || Date.now());
  const elapsedMs = Math.max(0, endTime - startedAt - (totalPausedDurationMs || 0));
  return Math.floor(elapsedMs / 1000);
}

/**
 * Calculate estimated remaining seconds based on completed milestones
 * @param {object} goal
 * @param {number} elapsed
 * @returns {number|null}
 */
export function calculateRemainingSeconds(goal, elapsed) {
  if (!goal || goal.state !== GoalState.RUNNING) return null;
  const total = goal.milestones?.length || 0;
  if (total === 0) return null;
  const completedCount = goal.milestones.filter((m) => m.status === MilestoneStatus.COMPLETED).length;
  if (completedCount === 0 || completedCount >= total) return null;
  if (elapsed <= 0) return null;
  const avgSecPerMilestone = elapsed / completedCount;
  const remainingCount = total - completedCount;
  return Math.max(1, Math.round(avgSecPerMilestone * remainingCount));
}

/**
 * Build snapshot object for a given goal or idle state
 * @param {object|null} goal
 * @param {string} sid
 * @param {object} engine
 * @returns {object}
 */
export function buildSnapshot(goal, sid, engine) {
  if (!goal) {
    return {
      sessionId: sid,
      hasActiveGoal: false,
      state: GoalState.IDLE,
      title: '',
      startedAt: null,
      pausedAt: null,
      totalPausedDurationMs: 0,
      completedAt: null,
      elapsedSeconds: 0,
      formattedElapsed: '0s',
      estimatedRemainingSeconds: null,
      formattedETA: null,
      lang: 'en',
      tokensUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      milestones: [],
      progressPercent: 0,
      iterationsCount: 0,
      maxIterations: engine.defaultMaxIterations,
      autoDrive: engine.autoDrive,
      enableSound: engine.enableSound,
      showQuickLaunchButton: engine.showQuickLaunchButton,
      gitStartCommit: null,
      pendingNudge: null,
      toolFailureCount: 0,
      consecutiveToolFailureLimit: engine.consecutiveToolFailureLimit,
      maxTokenBudget: engine.maxTokenBudget,
      budgetWarningThreshold: engine.budgetWarningThreshold,
      budgetWarningTriggered: false,
      budgetAutoScaled: false,
      autoCheckpointOnMilestone: engine.autoCheckpointOnMilestone,
      activityFeed: [],
      userDirective: null,
      preplan: null,
      gitBranch: null,
      retrospective: null,
      enableLiveActivityFeed: engine.enableLiveActivityFeed ?? true,
      enablePreplanning: engine.enablePreplanning ?? true,
      autoBranchOnGoalStart: engine.autoBranchOnGoalStart ?? true,
      enablePostGoalRetrospective: engine.enablePostGoalRetrospective ?? true,
      autoScaleBudgetNearCompletion: engine.autoScaleBudgetNearCompletion ?? false,
      enableTemplatesDrawer: engine.enableTemplatesDrawer ?? true,
      enableMilestoneDependencies: engine.enableMilestoneDependencies ?? true,
      soundScheme: engine.soundScheme ?? 'default',
      enableVoiceAnnouncements: engine.enableVoiceAnnouncements ?? false,
    };
  }

  const elapsed = calculateElapsedSeconds(goal);
  const milestones = goal.milestones || [];
  const completedCount = milestones.filter((m) => m.status === MilestoneStatus.COMPLETED).length;
  const progressPercent = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;
  const estSec = calculateRemainingSeconds(goal, elapsed);

  return {
    sessionId: sid,
    hasActiveGoal: true,
    id: goal.id,
    state: goal.state,
    title: goal.title,
    description: goal.description,
    lang: goal.lang || detectLanguage(goal.title),
    startedAt: goal.startedAt,
    pausedAt: goal.pausedAt,
    totalPausedDurationMs: goal.totalPausedDurationMs,
    completedAt: goal.completedAt,
    elapsedSeconds: elapsed,
    formattedElapsed: formatElapsed(elapsed),
    estimatedRemainingSeconds: estSec,
    formattedETA: formatETA(estSec),
    tokensUsage: goal.tokensUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    iterationsCount: goal.iterationsCount,
    maxIterations: goal.maxIterations,
    milestones,
    progressPercent,
    logs: goal.logs,
    resultSummary: goal.resultSummary,
    autoDrive: engine.autoDrive,
    enableSound: engine.enableSound,
    showQuickLaunchButton: engine.showQuickLaunchButton,
    gitStartCommit: goal.gitStartCommit || null,
    pendingNudge: goal.pendingNudge || null,
    toolFailureCount: engine.getToolFailureCount(sid),
    consecutiveToolFailureLimit: engine.consecutiveToolFailureLimit,
    maxTokenBudget: goal.maxTokenBudget ?? engine.maxTokenBudget,
    budgetWarningThreshold: engine.budgetWarningThreshold,
    budgetWarningTriggered: Boolean(goal.budgetWarningTriggered),
    budgetAutoScaled: Boolean(goal.budgetAutoScaled),
    autoCheckpointOnMilestone: engine.autoCheckpointOnMilestone,
    activityFeed: Array.isArray(goal.activityFeed) ? goal.activityFeed : [],
    userDirective: goal.userDirective || null,
    preplan: goal.preplan || null,
    gitBranch: goal.gitBranch || null,
    retrospective: goal.retrospective || null,
    enableLiveActivityFeed: engine.enableLiveActivityFeed ?? true,
    enablePreplanning: engine.enablePreplanning ?? true,
    autoBranchOnGoalStart: engine.autoBranchOnGoalStart ?? true,
    enablePostGoalRetrospective: engine.enablePostGoalRetrospective ?? true,
    autoScaleBudgetNearCompletion: engine.autoScaleBudgetNearCompletion ?? false,
    enableTemplatesDrawer: engine.enableTemplatesDrawer ?? true,
    enableMilestoneDependencies: engine.enableMilestoneDependencies ?? true,
    soundScheme: engine.soundScheme ?? 'default',
    enableVoiceAnnouncements: engine.enableVoiceAnnouncements ?? false,
  };
}
