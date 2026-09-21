import { GoalState, MilestoneStatus, formatElapsed, formatETA, detectLanguage, sessionIdOf, calculateElapsedSeconds, calculateRemainingSeconds, buildSnapshot } from './goal-engine-constants.js';
import { getGitCurrentCommit, exportReportMarkdown, exportReportGitHubPR, createMilestoneCheckpoint, rollbackToCheckpoint, saveGoalArtifact } from './engine-reports.js';
import { EngineStore } from './engine-store.js';
import { buildStatePromptInjection } from './engine-prompt.js';
import { matchMilestone, parseMilestoneItems, applyMilestoneUpdate, toggleMilestoneChecklistItem } from './engine-milestones.js';

export { GoalState, MilestoneStatus, formatElapsed, formatETA, detectLanguage, sessionIdOf, matchMilestone };
export { getGitCurrentCommit, exportReportMarkdown, exportReportGitHubPR, createMilestoneCheckpoint, rollbackToCheckpoint, saveGoalArtifact };

/**
 * Isolated Goal Management Engine for DeepSeek Harness
 */
export class GoalEngine {
  constructor(options = {}) {
    this.defaultMaxIterations = options.defaultMaxIterations ?? 25;
    this.autoDrive = options.autoDrive ?? true;
    this.enableSound = options.enableSound ?? true;
    this.showQuickLaunchButton = options.showQuickLaunchButton ?? true;
    this.consecutiveToolFailureLimit = options.consecutiveToolFailureLimit ?? 3;
    this.maxTokenBudget = options.maxTokenBudget ?? 0;
    this.budgetWarningThreshold = options.budgetWarningThreshold ?? 80;
    this.autoCheckpointOnMilestone = options.autoCheckpointOnMilestone ?? false;
    this.maxSessions = options.maxSessions ?? 100;
    this.goals = new Map();
    this.listeners = new Set();
    this.stallCounters = new Map();
    this.toolFailureCounters = new Map();

    this.store = new EngineStore(this, options.storagePath ?? null);
    this.store.loadStateFromDisk();
  }

  get storagePath() { return this.store.storagePath; }
  set storagePath(val) { this.store.setStoragePath(val); }
  get saveTimer() { return this.store.saveTimer; }
  get currentGoal() { return this.goals.get('default') || null; }
  set currentGoal(val) {
    if (val) this.goals.set('default', val);
    else this.goals.delete('default');
  }

  loadStateFromDisk() { this.store.loadStateFromDisk(); }
  scheduleSave(immediate = false) { this.store.scheduleSave(immediate); }
  writeStateToDiskSync() { this.store.writeStateToDiskSync(); }
  flushSync() { this.store.flushSync(); }
  saveStateToDisk() { this.flushSync(); }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(sessionId = 'default', immediate = false) {
    this.scheduleSave(immediate);
    const sid = sessionId || 'default';
    const snapshot = this.getSnapshot(sid);
    for (const listener of this.listeners) {
      try {
        listener(snapshot, sid);
      } catch (err) {
        console.error?.('[GoalEngine] Listener error:', err?.message || err);
      }
    }
  }

  recordProgress(sessionId = 'default') {
    const sid = sessionId || 'default';
    this.stallCounters.set(sid, 0);
  }

  incrementStallCount(sessionId = 'default') {
    const sid = sessionId || 'default';
    const current = this.stallCounters.get(sid) || 0;
    const next = current + 1;
    this.stallCounters.set(sid, next);
    return next;
  }

  getStallCount(sessionId = 'default') {
    const sid = sessionId || 'default';
    return this.stallCounters.get(sid) || 0;
  }

  updateConfig(config = {}) {
    if (typeof config.defaultMaxIterations === 'number' && config.defaultMaxIterations >= 1) {
      const prev = this.defaultMaxIterations;
      this.defaultMaxIterations = config.defaultMaxIterations;
      for (const [_, goal] of this.goals) {
        if (goal && goal.maxIterations === prev) {
          goal.maxIterations = config.defaultMaxIterations;
        }
      }
    }
    if (typeof config.autoDrive === 'boolean') {
      this.autoDrive = config.autoDrive;
    }
    if (typeof config.enableSound === 'boolean') {
      this.enableSound = config.enableSound;
    }
    if (typeof config.showQuickLaunchButton === 'boolean') {
      this.showQuickLaunchButton = config.showQuickLaunchButton;
    }
    if (typeof config.consecutiveToolFailureLimit === 'number') {
      this.consecutiveToolFailureLimit = Math.max(0, config.consecutiveToolFailureLimit);
    }
    if (typeof config.maxTokenBudget === 'number') {
      this.maxTokenBudget = Math.max(0, config.maxTokenBudget);
    }
    if (typeof config.budgetWarningThreshold === 'number') {
      this.budgetWarningThreshold = Math.max(1, Math.min(100, config.budgetWarningThreshold));
    }
    if (typeof config.autoCheckpointOnMilestone === 'boolean') {
      this.autoCheckpointOnMilestone = config.autoCheckpointOnMilestone;
    }
    this.emit();
  }

  getGoal(sessionId = 'default') {
    return this.goals.get(sessionId || 'default') || null;
  }

  incrementToolFailureCount(sessionId = 'default') {
    const sid = sessionId || 'default';
    const current = this.toolFailureCounters.get(sid) || 0;
    const next = current + 1;
    this.toolFailureCounters.set(sid, next);
    return next;
  }

  resetToolFailureCount(sessionId = 'default') {
    const sid = sessionId || 'default';
    this.toolFailureCounters.set(sid, 0);
  }

  getToolFailureCount(sessionId = 'default') {
    const sid = sessionId || 'default';
    return this.toolFailureCounters.get(sid) || 0;
  }

  nudge(text, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return this.getSnapshot(sid);

    const clean = String(text || '').trim();
    if (!clean) return this.getSnapshot(sid);

    if (!Array.isArray(goal.nudges)) {
      goal.nudges = [];
    }
    const now = Date.now();
    goal.nudges.push({ text: clean, timestamp: now });
    goal.pendingNudge = clean;
    goal.logs.push({
      timestamp: now,
      type: 'info',
      message: `User steering / clarification: "${clean}"`,
    });
    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  consumePendingNudge(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || !goal.pendingNudge) return null;
    const nudge = goal.pendingNudge;
    goal.pendingNudge = null;
    this.emit(sid);
    return nudge;
  }

  pruneInactiveSessions() {
    if (this.goals.size < this.maxSessions) return;
    const inactive = [];
    for (const [sid, goal] of this.goals.entries()) {
      if (sid === 'default') continue;
      if (goal.state === GoalState.COMPLETED || goal.state === GoalState.CANCELLED || goal.state === GoalState.FAILED) {
        inactive.push({ sid, completedAt: goal.completedAt || goal.startedAt || 0 });
      }
    }
    inactive.sort((a, b) => a.completedAt - b.completedAt);
    while (this.goals.size >= this.maxSessions && inactive.length > 0) {
      const oldest = inactive.shift();
      this.goals.delete(oldest.sid);
      this.stallCounters.delete(oldest.sid);
      this.toolFailureCounters.delete(oldest.sid);
    }
  }

  clearSession(sessionId) {
    if (!sessionId || sessionId === 'default') return false;
    const had = this.goals.delete(sessionId);
    this.stallCounters.delete(sessionId);
    this.toolFailureCounters.delete(sessionId);
    if (had) this.emit(sessionId, true);
    return had;
  }

  startGoal(title, options = {}, sessionId = 'default') {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('Goal title cannot be empty');
    }

    this.pruneInactiveSessions();

    const cleanTitle = title.trim();
    const now = Date.now();
    const sid = sessionId || 'default';
    this.stallCounters.set(sid, 0);

    const gitCommit = options.gitStartCommit !== undefined
      ? options.gitStartCommit
      : getGitCurrentCommit(options.cwd);

    this.toolFailureCounters.set(sid, 0);

    const goal = {
      id: `goal-${now}-${Math.random().toString(36).substring(2, 7)}`,
      sessionId: sid,
      title: cleanTitle,
      description: options.description?.trim() || '',
      lang: options.lang || detectLanguage(cleanTitle),
      state: GoalState.RUNNING,
      startedAt: now,
      pausedAt: null,
      totalPausedDurationMs: 0,
      completedAt: null,
      iterationsCount: 0,
      maxIterations: options.maxIterations ?? this.defaultMaxIterations,
      maxTokenBudget: options.maxTokenBudget ?? this.maxTokenBudget,
      budgetWarningTriggered: false,
      gitStartCommit: gitCommit || null,
      pendingNudge: null,
      nudges: [],
      milestones: [],
      tokensUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      logs: [
        {
          timestamp: now,
          type: 'info',
          message: `Goal initiated: "${cleanTitle}"` + (gitCommit ? ` (Git: ${gitCommit})` : ''),
        },
      ],
      resultSummary: '',
    };

    this.goals.set(sid, goal);

    if (Array.isArray(options.milestones) && options.milestones.length > 0) {
      this.addMilestones(options.milestones, false, sid);
    }

    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  pause(reason = 'User requested pause', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || goal.state !== GoalState.RUNNING) {
      return this.getSnapshot(sid);
    }

    goal.state = GoalState.PAUSED;
    goal.pausedAt = Date.now();
    goal.logs.push({
      timestamp: Date.now(),
      type: 'warning',
      message: `Paused: ${reason}`,
    });

    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  resume(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || goal.state !== GoalState.PAUSED) {
      return this.getSnapshot(sid);
    }

    const now = Date.now();
    if (goal.pausedAt) {
      goal.totalPausedDurationMs += now - goal.pausedAt;
      goal.pausedAt = null;
    }

    goal.state = GoalState.RUNNING;
    this.stallCounters.set(sid, 0);

    goal.logs.push({
      timestamp: now,
      type: 'info',
      message: 'Goal resumed',
    });

    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  cancel(reason = 'Cancelled by user', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return null;

    goal.state = GoalState.CANCELLED;
    goal.completedAt = Date.now();
    goal.logs.push({
      timestamp: Date.now(),
      type: 'warning',
      message: `Cancelled: ${reason}`,
    });

    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  clear(sessionId = 'default') {
    const sid = sessionId || 'default';
    this.goals.delete(sid);
    this.stallCounters.delete(sid);
    this.toolFailureCounters.delete(sid);
    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  completeGoal(summary = '', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return null;

    const now = Date.now();
    goal.state = GoalState.COMPLETED;
    goal.completedAt = now;
    goal.resultSummary = summary;
    goal.logs.push({
      timestamp: now,
      type: 'info',
      message: `Goal completed successfully: ${summary || 'All objectives met.'}`,
    });

    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    for (const m of goal.milestones) {
      if (m.status === MilestoneStatus.IN_PROGRESS || m.status === MilestoneStatus.PENDING) {
        m.status = MilestoneStatus.COMPLETED;
      }
    }

    this.stallCounters.delete(sid);
    this.toolFailureCounters.delete(sid);
    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  addMilestones(milestonesList, shouldEmit = true, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || !Array.isArray(milestonesList)) return;

    const newItems = parseMilestoneItems(milestonesList, goal.milestones.length);
    goal.milestones.push(...newItems);

    this.recordProgress(sid);
    if (shouldEmit) this.emit(sid);
  }

  updateMilestone(id, status, notes = '', sessionId = 'default', checklist = null) {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return false;

    const target = goal.milestones.find((m) => matchMilestone(m, id));
    if (!target) return false;

    const { prevStatus } = applyMilestoneUpdate(
      target,
      status,
      notes,
      checklist,
      Object.values(MilestoneStatus)
    );

    // Auto Git Checkpoint on milestone completion
    if (target.status === MilestoneStatus.COMPLETED && prevStatus !== MilestoneStatus.COMPLETED && this.autoCheckpointOnMilestone) {
      const commitHash = createMilestoneCheckpoint(target, sid);
      if (commitHash) {
        target.checkpointCommit = commitHash;
        goal.logs.push({
          timestamp: Date.now(),
          type: 'info',
          message: `Git checkpoint saved for [${target.title}]: ${commitHash}`,
        });
      }
    }

    goal.logs.push({
      timestamp: Date.now(),
      type: 'milestone',
      message: `Milestone [${target.title}] status -> ${target.status}`,
    });

    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    this.recordProgress(sid);
    this.emit(sid);
    return true;
  }

  toggleChecklistItem(milestoneId, itemIndex, done, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return false;

    const target = goal.milestones.find((m) => matchMilestone(m, milestoneId));
    const ok = toggleMilestoneChecklistItem(target, itemIndex, done);
    if (!ok) return false;

    this.recordProgress(sid);
    this.emit(sid);
    return true;
  }

  extendBudget(addTokens = 50000, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return false;

    const currentTotal = goal.tokensUsage?.totalTokens || 0;
    const currentMax = goal.maxTokenBudget || this.maxTokenBudget || 0;
    const newBudget = Math.max(currentTotal, currentMax) + Math.max(1000, Number(addTokens) || 50000);

    goal.maxTokenBudget = newBudget;
    goal.budgetWarningTriggered = false;

    if (goal.state === GoalState.PAUSED && goal.logs?.some((l) => l.message?.includes('Token budget reached'))) {
      goal.state = GoalState.RUNNING;
      goal.pausedAt = null;
    }

    goal.logs.push({
      timestamp: Date.now(),
      type: 'info',
      message: `Token budget extended to ${newBudget.toLocaleString('en-US')} tokens`,
    });
    if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);

    this.emit(sid, true);
    return true;
  }

  incrementIteration(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || goal.state !== GoalState.RUNNING) {
      return false;
    }

    goal.iterationsCount += 1;

    if (goal.iterationsCount >= goal.maxIterations) {
      goal.state = GoalState.FAILED;
      goal.logs.push({
        timestamp: Date.now(),
        type: 'error',
        message: `Safety limit reached: maximum ${goal.maxIterations} iterations exceeded.`,
      });
      if (goal.logs.length > 100) {
        goal.logs = goal.logs.slice(-100);
      }
      this.emit(sid, true);
      return false;
    }

    this.emit(sid);
    return true;
  }

  getElapsedSeconds(sessionId = 'default') {
    return calculateElapsedSeconds(this.goals.get(sessionId || 'default'));
  }

  addTokenUsage(usage, sessionId = 'default') {
    if (!usage || typeof usage !== 'object') return;
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return;

    if (!goal.tokensUsage) {
      goal.tokensUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }

    const prompt = Number(usage.promptTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
    const completion = Number(usage.completionTokens ?? usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
    const total = Number(usage.totalTokens ?? usage.total_tokens ?? (prompt + completion)) || (prompt + completion);

    goal.tokensUsage.promptTokens += prompt;
    goal.tokensUsage.completionTokens += completion;
    goal.tokensUsage.totalTokens += total;

    // Token Budget Guard Check
    const budget = goal.maxTokenBudget || this.maxTokenBudget || 0;
    if (budget > 0) {
      const currentTotal = goal.tokensUsage.totalTokens;
      const warnThreshold = (budget * (this.budgetWarningThreshold || 80)) / 100;

      if (currentTotal >= warnThreshold && !goal.budgetWarningTriggered) {
        goal.budgetWarningTriggered = true;
        goal.logs.push({
          timestamp: Date.now(),
          type: 'warning',
          message: `Token budget warning: ${currentTotal.toLocaleString('en-US')}/${budget.toLocaleString('en-US')} tokens consumed (${Math.round((currentTotal / budget) * 100)}%)`,
        });
        if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
      }

      if (currentTotal >= budget && goal.state === GoalState.RUNNING) {
        goal.state = GoalState.PAUSED;
        goal.pausedAt = Date.now();
        goal.logs.push({
          timestamp: Date.now(),
          type: 'warning',
          message: `Token budget reached: ${currentTotal.toLocaleString('en-US')}/${budget.toLocaleString('en-US')} tokens. Pausing autonomous loop.`,
        });
        if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
        this.emit(sid, true);
        return;
      }
    }

    this.emit(sid);
  }

  getEstimatedRemainingSeconds(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    return calculateRemainingSeconds(goal, this.getElapsedSeconds(sid));
  }

  getSnapshot(sessionId = 'default') {
    const sid = sessionId || 'default';
    return buildSnapshot(this.goals.get(sid), sid, this);
  }

  getGoalSnapshot(sessionId = 'default') {
    return this.getSnapshot(sessionId);
  }

  getStatePromptInjection(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || goal.state !== GoalState.RUNNING) {
      return '';
    }

    const snapshot = this.getSnapshot(sid);
    let pendingNudge = null;
    if (goal.pendingNudge) {
      pendingNudge = goal.pendingNudge;
      goal.pendingNudge = null;
    }

    return buildStatePromptInjection(snapshot, pendingNudge);
  }
}
