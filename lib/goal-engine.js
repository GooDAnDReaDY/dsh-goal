import { GoalState, MilestoneStatus, formatElapsed, formatETA, detectLanguage, sessionIdOf, calculateElapsedSeconds, calculateRemainingSeconds, buildSnapshot } from './goal-engine-constants.js';
import { getGitCurrentCommit, exportReportMarkdown, exportReportGitHubPR, createMilestoneCheckpoint, rollbackToCheckpoint, saveGoalArtifact } from './engine-reports.js';
import { EngineStore } from './engine-store.js';
import { buildStatePromptInjection } from './engine-prompt.js';
import { matchMilestone, parseMilestoneItems, applyMilestoneUpdate, toggleMilestoneChecklistItem } from './engine-milestones.js';
import { applyIntervention, recordActivity, processTokenBudget } from './engine-intervention.js';
import { createGoalBranch, sanitizeBranchSlug, getCurrentGitBranch, mergeGoalBranch, discardGoalBranch } from './engine-git-branch.js';
import { parseIssueRef, parseIssueChecklist, syncMilestoneWithIssue } from './engine-issue-sync.js';
import { generateRetrospectiveData } from './engine-retrospective.js';
import { generatePreplanDraft } from './engine-templates.js';
import { pruneInactiveSessions, addNudgeToGoal, consumeGoalNudge, extendGoalBudget } from './engine-sessions.js';

export { GoalState, MilestoneStatus, formatElapsed, formatETA, detectLanguage, sessionIdOf, matchMilestone, parseIssueChecklist };
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
    this.enableLiveActivityFeed = options.enableLiveActivityFeed ?? true;
    this.enablePreplanning = options.enablePreplanning ?? true;
    this.autoBranchOnGoalStart = options.autoBranchOnGoalStart ?? true;
    this.enablePostGoalRetrospective = options.enablePostGoalRetrospective ?? true;
    this.autoScaleBudgetNearCompletion = options.autoScaleBudgetNearCompletion ?? false;
    this.enableTemplatesDrawer = options.enableTemplatesDrawer ?? true;
    this.enableMilestoneDependencies = options.enableMilestoneDependencies ?? true;
    this.soundScheme = options.soundScheme ?? 'default';
    this.enableVoiceAnnouncements = options.enableVoiceAnnouncements ?? false;
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
        this.logger?.error?.('[dsh-goal] Error in GoalEngine listener:', err);
      }
    }
  }

  recordProgress(sessionId = 'default') {
    this.stallCounters.set(sessionId || 'default', 0);
  }

  incrementStallCount(sessionId = 'default') {
    const sid = sessionId || 'default';
    const current = this.stallCounters.get(sid) || 0;
    const next = current + 1;
    this.stallCounters.set(sid, next);
    return next;
  }

  getStallCount(sessionId = 'default') {
    return this.stallCounters.get(sessionId || 'default') || 0;
  }

  updateConfig(config = {}) {
    if (typeof config.defaultMaxIterations === 'number' && config.defaultMaxIterations >= 1) {
      const prev = this.defaultMaxIterations;
      this.defaultMaxIterations = config.defaultMaxIterations;
      for (const [_, goal] of this.goals) {
        if (goal && goal.maxIterations === prev) goal.maxIterations = config.defaultMaxIterations;
      }
    }
    if (typeof config.autoDrive === 'boolean') this.autoDrive = config.autoDrive;
    if (typeof config.enableSound === 'boolean') this.enableSound = config.enableSound;
    if (typeof config.showQuickLaunchButton === 'boolean') this.showQuickLaunchButton = config.showQuickLaunchButton;
    if (typeof config.consecutiveToolFailureLimit === 'number') this.consecutiveToolFailureLimit = Math.max(0, config.consecutiveToolFailureLimit);
    if (typeof config.maxTokenBudget === 'number') this.maxTokenBudget = Math.max(0, config.maxTokenBudget);
    if (typeof config.budgetWarningThreshold === 'number') this.budgetWarningThreshold = Math.max(1, Math.min(100, config.budgetWarningThreshold));
    if (typeof config.autoCheckpointOnMilestone === 'boolean') this.autoCheckpointOnMilestone = config.autoCheckpointOnMilestone;
    if (typeof config.enableLiveActivityFeed === 'boolean') this.enableLiveActivityFeed = config.enableLiveActivityFeed;
    if (typeof config.enablePreplanning === 'boolean') this.enablePreplanning = config.enablePreplanning;
    if (typeof config.autoBranchOnGoalStart === 'boolean') this.autoBranchOnGoalStart = config.autoBranchOnGoalStart;
    if (typeof config.enablePostGoalRetrospective === 'boolean') this.enablePostGoalRetrospective = config.enablePostGoalRetrospective;
    if (typeof config.autoScaleBudgetNearCompletion === 'boolean') this.autoScaleBudgetNearCompletion = config.autoScaleBudgetNearCompletion;
    if (typeof config.enableTemplatesDrawer === 'boolean') this.enableTemplatesDrawer = config.enableTemplatesDrawer;
    if (typeof config.enableMilestoneDependencies === 'boolean') this.enableMilestoneDependencies = config.enableMilestoneDependencies;
    if (typeof config.soundScheme === 'string') this.soundScheme = config.soundScheme;
    if (typeof config.enableVoiceAnnouncements === 'boolean') this.enableVoiceAnnouncements = config.enableVoiceAnnouncements;
    this.emit();
  }

  getGoal(sessionId = 'default') {
    return this.goals.get(sessionId || 'default') || null;
  }

  incrementToolFailureCount(sessionId = 'default') {
    const sid = sessionId || 'default';
    const next = (this.toolFailureCounters.get(sid) || 0) + 1;
    this.toolFailureCounters.set(sid, next);
    return next;
  }

  resetToolFailureCount(sessionId = 'default') {
    this.toolFailureCounters.set(sessionId || 'default', 0);
  }

  getToolFailureCount(sessionId = 'default') {
    return this.toolFailureCounters.get(sessionId || 'default') || 0;
  }

  nudge(text, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return this.getSnapshot(sid);
    const res = addNudgeToGoal(goal, text);
    if (res) this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  consumePendingNudge(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return null;
    const nudge = consumeGoalNudge(goal);
    if (nudge) this.emit(sid);
    return nudge;
  }

  pruneInactiveSessions() {
    pruneInactiveSessions(this.goals, this.stallCounters, this.toolFailureCounters, this.maxSessions);
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
    this.toolFailureCounters.set(sid, 0);

    const gitCommit = options.gitStartCommit !== undefined
      ? options.gitStartCommit
      : getGitCurrentCommit(options.cwd);

    const goal = {
      id: `goal-${now}-${Math.random().toString(36).substring(2, 7)}`,
      sessionId: sid,
      title: cleanTitle,
      description: options.description?.trim() || '',
      lang: options.lang || detectLanguage(cleanTitle),
      cwd: options.cwd ? String(options.cwd).trim() : null,
      state: GoalState.RUNNING,
      startedAt: now,
      pausedAt: null,
      totalPausedDurationMs: 0,
      completedAt: null,
      iterationsCount: 0,
      maxIterations: options.maxIterations ?? this.defaultMaxIterations,
      maxTokenBudget: options.maxTokenBudget ?? this.maxTokenBudget,
      budgetWarningTriggered: false,
      budgetAutoScaled: false,
      gitStartCommit: gitCommit || null,
      gitBranch: null,
      gitParentBranch: null,
      pendingNudge: null,
      nudges: [],
      milestones: [],
      activityFeed: [],
      userDirective: null,
      userDirectiveConsumed: false,
      preplan: null,
      retrospective: null,
      issueRef: parseIssueRef(cleanTitle),
      tokensUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      logs: [{
        timestamp: now,
        type: 'info',
        message: `Goal initiated: "${cleanTitle}"` + (gitCommit ? ` (Git: ${gitCommit})` : ''),
      }],
      resultSummary: '',
    };

    if (this.autoBranchOnGoalStart && options.autoBranch !== false && this.storagePath !== null && process.env.NODE_ENV !== 'test') {
      const slug = sanitizeBranchSlug(cleanTitle);
      const parentBranch = getCurrentGitBranch(options.cwd);
      if (createGoalBranch(options.cwd, slug)) {
        goal.gitBranch = slug;
        goal.gitParentBranch = parentBranch;
      }
    }

    if (options.issueBody && (!options.milestones || options.milestones.length === 0)) {
      const items = parseIssueChecklist(options.issueBody);
      if (items.length > 0) {
        options.milestones = items.map((it) => ({ title: it.text, status: it.done ? MilestoneStatus.COMPLETED : MilestoneStatus.PENDING }));
      }
    }

    if (this.enablePreplanning && options.preplan !== false && (!options.milestones || options.milestones.length === 0)) {
      goal.preplan = { active: true, draftMilestones: generatePreplanDraft(cleanTitle) };
    }

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
    if (!goal || goal.state !== GoalState.RUNNING) return this.getSnapshot(sid);

    goal.state = GoalState.PAUSED;
    goal.pausedAt = Date.now();
    recordActivity(goal, { type: 'control', tool: 'pause', status: 'warning', details: reason });
    goal.logs.push({ timestamp: Date.now(), type: 'warning', message: `Paused: ${reason}` });
    if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  resume(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || goal.state !== GoalState.PAUSED) return this.getSnapshot(sid);

    const now = Date.now();
    if (goal.pausedAt) {
      goal.totalPausedDurationMs += now - goal.pausedAt;
      goal.pausedAt = null;
    }
    goal.state = GoalState.RUNNING;
    this.stallCounters.set(sid, 0);
    recordActivity(goal, { type: 'control', tool: 'resume', status: 'info', details: 'Resumed by user' });
    goal.logs.push({ timestamp: now, type: 'info', message: 'Goal resumed' });
    if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  cancel(reason = 'Cancelled by user', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return null;

    goal.state = GoalState.CANCELLED;
    goal.completedAt = Date.now();
    recordActivity(goal, { type: 'control', tool: 'cancel', status: 'warning', details: reason });
    goal.logs.push({ timestamp: Date.now(), type: 'warning', message: `Cancelled: ${reason}` });
    if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
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
    if (this.enablePostGoalRetrospective) {
      goal.retrospective = generateRetrospectiveData(goal, goal.cwd || process.cwd());
    }
    recordActivity(goal, { type: 'goal', tool: 'completeGoal', status: 'success', details: summary || 'Completed' });
    goal.logs.push({
      timestamp: now,
      type: 'info',
      message: `Goal completed successfully: ${summary || 'All objectives met.'}`,
    });
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

  setMilestones(milestonesList, sessionId = 'default') {
    this.addMilestones(milestonesList, true, sessionId);
    return this.getSnapshot(sessionId);
  }

  addMilestones(milestonesList, shouldEmit = true, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || !Array.isArray(milestonesList)) return [];

    const newMilestones = parseMilestoneItems(milestonesList, goal.milestones.length);
    for (const item of newMilestones) {
      goal.milestones.push(item);
    }
    this.recordProgress(sid);
    recordActivity(goal, { type: 'milestone', tool: 'addMilestones', status: 'success', details: `Added ${newMilestones.length} milestones` });
    if (shouldEmit) this.emit(sid);
    return newMilestones;
  }

  updateMilestone(id, status, notes = '', sessionId = 'default', checklist = null) {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return false;

    const target = goal.milestones.find((m) => matchMilestone(m, id));
    if (!target) return false;

    const res = applyMilestoneUpdate(target, status, notes, checklist, Object.values(MilestoneStatus), {
      enforceDependencies: this.enableMilestoneDependencies,
      allMilestones: goal.milestones,
    });
    if (res.blocked) {
      recordActivity(goal, {
        type: 'milestone',
        tool: 'updateMilestone',
        status: 'error',
        details: `Milestone ${id} blocked by ${res.missingDependencies?.join(', ')}`,
      });
      return false;
    }

    const prevStatus = res.prevStatus;
    recordActivity(goal, { type: 'milestone', tool: 'updateMilestone', status: 'success', details: `${id} -> ${status}` });

    if (target.status === MilestoneStatus.COMPLETED && prevStatus !== MilestoneStatus.COMPLETED) {
      if (this.autoCheckpointOnMilestone) {
        const commitHash = createMilestoneCheckpoint(target, sid);
        if (commitHash) {
          target.checkpointCommit = commitHash;
          goal.logs.push({ timestamp: Date.now(), type: 'info', message: `Git checkpoint saved for [${target.title}]: ${commitHash}` });
        }
      }
      if (goal.issueRef) {
        syncMilestoneWithIssue(goal, target).then((syncRes) => {
          if (syncRes?.updated) {
            goal.logs.push({ timestamp: Date.now(), type: 'info', message: `Synced checklist for issue #${syncRes.issueNumber}` });
            recordActivity(goal, { type: 'issue', tool: 'syncIssueChecklist', status: 'success', details: `Issue #${syncRes.issueNumber} updated` });
            this.emit(sid);
          }
        }).catch(() => {});
      }
    }

    goal.logs.push({ timestamp: Date.now(), type: 'milestone', message: `Milestone [${target.title}] status -> ${target.status}` });
    if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
    this.recordProgress(sid);
    this.emit(sid);
    return true;
  }

  toggleChecklistItem(milestoneId, itemIndex, done, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return false;
    const target = goal.milestones.find((m) => matchMilestone(m, milestoneId));
    if (!target) return false;
    const ok = toggleMilestoneChecklistItem(target, itemIndex, done);
    if (ok) {
      this.recordProgress(sid);
      this.emit(sid);
    }
    return ok;
  }

  extendBudget(addTokens = 50000, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return false;
    extendGoalBudget(goal, addTokens, this.maxTokenBudget);
    recordActivity(goal, { type: 'budget', tool: 'extendBudget', status: 'info', details: `+${addTokens} tokens` });
    this.emit(sid, true);
    return true;
  }

  incrementIteration(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || goal.state !== GoalState.RUNNING) return false;

    goal.iterationsCount += 1;
    if (goal.iterationsCount >= goal.maxIterations) {
      goal.state = GoalState.FAILED;
      goal.failedAt = Date.now();
      goal.failureReason = "Max iterations (" + goal.maxIterations + ") reached";
      recordActivity(goal, { type: 'control', tool: 'incrementIteration', status: 'error', details: goal.failureReason });
      goal.logs.push({
        timestamp: Date.now(),
        type: 'warning',
        message: `Max iterations (${goal.maxIterations}) reached. Pausing autonomous loop.`,
      });
      if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
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

    if (!goal.tokensUsage) goal.tokensUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const prompt = Number(usage.promptTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
    const completion = Number(usage.completionTokens ?? usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
    const total = Number(usage.totalTokens ?? usage.total_tokens ?? (prompt + completion)) || (prompt + completion);

    goal.tokensUsage.promptTokens += prompt;
    goal.tokensUsage.completionTokens += completion;
    goal.tokensUsage.totalTokens += total;

    const budgetCheck = processTokenBudget(goal, {
      maxTokenBudget: this.maxTokenBudget,
      budgetWarningThreshold: this.budgetWarningThreshold,
      autoScaleBudgetNearCompletion: this.autoScaleBudgetNearCompletion,
      GoalState,
    });
    if (budgetCheck.paused) {
      this.emit(sid, true);
      return;
    }
    this.emit(sid);
  }

  getEstimatedRemainingSeconds(sessionId = 'default') {
    const sid = sessionId || 'default';
    return calculateRemainingSeconds(this.goals.get(sid), this.getElapsedSeconds(sid));
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
    if (!goal || goal.state !== GoalState.RUNNING) return '';

    const snap = this.getSnapshot(sid);
    const nudge = this.consumePendingNudge(sid);
    const injection = buildStatePromptInjection(snap, nudge);
    if (goal.userDirective) goal.userDirectiveConsumed = true;
    return injection;
  }

  intervene(intervention = {}, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return { ok: false, error: 'Goal not found' };
    const res = applyIntervention(goal, intervention);
    this.emit(sid, true);
    return { ok: true, state: this.getSnapshot(sid) };
  }

  approvePreplan(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || !goal.preplan?.active) return this.getSnapshot(sid);
    const drafts = goal.preplan.draftMilestones || [];
    goal.preplan.active = false;
    if (drafts.length > 0 && goal.milestones.length === 0) {
      this.addMilestones(drafts, false, sid);
    }
    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  mergeGoalBranch(targetBranch = 'main', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || !goal.gitBranch) return false;
    const ok = mergeGoalBranch(goal.cwd || process.cwd(), goal.gitBranch, targetBranch);
    if (ok) recordActivity(goal, { type: 'git', tool: 'mergeGoalBranch', status: 'success', details: `Merged ${goal.gitBranch}` });
    this.emit(sid, true);
    return ok;
  }

  discardGoalBranch(targetBranch = 'main', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || !goal.gitBranch) return false;
    const ok = discardGoalBranch(goal.cwd || process.cwd(), goal.gitBranch, targetBranch);
    if (ok) {
      recordActivity(goal, { type: 'git', tool: 'discardGoalBranch', status: 'info', details: `Discarded ${goal.gitBranch}` });
      goal.gitBranch = null;
    }
    this.emit(sid, true);
    return ok;
  }

  recordToolActivity(tool, status, details, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (goal) recordActivity(goal, { type: 'tool', tool, status, details });
  }
}
