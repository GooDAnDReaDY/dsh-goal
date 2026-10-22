import { verifyMilestoneAcceptance } from './engine-verification.js';
import { getEngineGoalDiff } from './engine-diff.js';
import { syncGoalToKanban, syncMilestoneStatusToKanban, handleKanbanCardMoved } from './engine-kanban-sync.js';
import { askOperatorQuery, answerOperatorQuery } from './engine-operator-query.js';
import { GoalMode, GoalState, MilestoneStatus, formatElapsed, formatETA, detectLanguage, sessionIdOf, calculateElapsedSeconds, calculateRemainingSeconds, buildSnapshot, getSafeCwd } from './goal-engine-constants.js';
import { getGitCurrentCommit, exportReportMarkdown, exportReportGitHubPR, createMilestoneCheckpoint, rollbackToCheckpoint, saveGoalArtifact } from './engine-reports.js';
import { EngineStore } from './engine-store.js';
import { buildStatePromptInjection } from './engine-prompt.js';
import { matchMilestone, parseMilestoneItems, applyMilestoneUpdate, toggleMilestoneChecklistItem } from './engine-milestones.js';
import { applyIntervention, recordActivity, processTokenBudget } from './engine-intervention.js';
import { createGoalBranch, sanitizeBranchSlug, getCurrentGitBranch, mergeGoalBranch, discardGoalBranch } from './engine-git-branch.js';
import { parseIssueRef, parseIssueChecklist, syncMilestoneWithIssue } from './engine-issue-sync.js';
import { generateRetrospectiveData } from './engine-retrospective.js';
import { generatePreplanDraft } from './engine-templates.js';
import { pruneInactiveSessions, addNudgeToGoal, consumeGoalNudge, extendGoalBudget, setGoalMode, pauseGoal, resumeGoal, cancelGoal } from './engine-sessions.js';
import { compactMilestone, estimateCompactionSavings } from './engine-compaction.js';
import { spawnSubGoal, completeSubGoal, syncSubGoalToParent, getSubGoalBreadcrumbs, getSubGoalsList } from './engine-subgoals.js';
import { updateGoalCostUsage, processCostBudget, calculateCost, formatCurrency } from './engine-cost-meter.js';
import { generateReleaseNotes, dispatchGoalTelegramNotification } from './engine-release-notes.js';

export { GoalMode, GoalState, MilestoneStatus, formatElapsed, formatETA, detectLanguage, sessionIdOf, matchMilestone, parseIssueChecklist, getGitCurrentCommit, exportReportMarkdown, exportReportGitHubPR, createMilestoneCheckpoint, rollbackToCheckpoint, saveGoalArtifact, compactMilestone, estimateCompactionSavings, spawnSubGoal, completeSubGoal, getSubGoalBreadcrumbs, getSubGoalsList, calculateCost, formatCurrency, generateReleaseNotes, dispatchGoalTelegramNotification };

/**
 * Isolated Goal Management Engine for DeepSeek Harness
 */
export class GoalEngine {
  constructor(options = {}) {
    this.logger = options.logger || console;
    const rawDefIters = options.defaultMaxIterations ?? 25;
    this.defaultMaxIterations = typeof rawDefIters === "number" ? rawDefIters : (typeof rawDefIters?.value === "number" ? rawDefIters.value : 25);
    Object.assign(this, {
      autoDrive: options.autoDrive ?? true, enableSound: options.enableSound ?? true,
      showQuickLaunchButton: options.showQuickLaunchButton ?? true,
      consecutiveToolFailureLimit: options.consecutiveToolFailureLimit ?? 3,
      maxTokenBudget: options.maxTokenBudget ?? 0, budgetWarningThreshold: options.budgetWarningThreshold ?? 80,
      autoCheckpointOnMilestone: options.autoCheckpointOnMilestone ?? false,
      enableLiveActivityFeed: options.enableLiveActivityFeed ?? true, enablePreplanning: options.enablePreplanning ?? true,
      autoBranchOnGoalStart: options.autoBranchOnGoalStart ?? true, enablePostGoalRetrospective: options.enablePostGoalRetrospective ?? true,
      autoScaleBudgetNearCompletion: options.autoScaleBudgetNearCompletion ?? false, enableTemplatesDrawer: options.enableTemplatesDrawer ?? true,
      enableMilestoneDependencies: options.enableMilestoneDependencies ?? true, soundScheme: options.soundScheme ?? 'default', enableKanbanSync: options.enableKanbanSync ?? true, ctx: options.ctx || null, kanbanService: options.kanbanService || null, kanbanStore: options.kanbanStore || null,
      enableVoiceAnnouncements: options.enableVoiceAnnouncements ?? false, enableMilestoneCompaction: options.enableMilestoneCompaction ?? true, approvalGate: options.approvalGate || null,
      checkApproval: options.checkApproval || null, maxSessions: options.maxSessions ?? 100, maxCostBudget: options.maxCostBudget ?? 0, costWarningThreshold: options.costWarningThreshold ?? 80, currency: options.currency || 'USD', enableTelegramNotifications: options.enableTelegramNotifications ?? false, activeModel: options.activeModel || '', customRates: options.customRates || {},
    });
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
  set currentGoal(val) { if (val) this.goals.set('default', val); else this.goals.delete('default'); }

  loadStateFromDisk() { this.store.loadStateFromDisk(); }
  scheduleSave(immediate = false) { this.store.scheduleSave(immediate); }
  writeStateToDiskSync() { this.store.writeStateToDiskSync(); }
  flushSync() { this.store.flushSync(); }
  saveStateToDisk() { this.flushSync(); }

  subscribe(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }

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

  recordProgress(sessionId = 'default') { this.stallCounters.set(sessionId || 'default', 0); }
  incrementStallCount(sessionId = 'default') { const sid = sessionId || 'default'; const n = (this.stallCounters.get(sid) || 0) + 1; this.stallCounters.set(sid, n); return n; }
  getStallCount(sessionId = 'default') { return this.stallCounters.get(sessionId || 'default') || 0; }

  updateConfig(config = {}) {
    const rawMax = config.defaultMaxIterations ?? config.maxIterations;
    const maxVal = typeof rawMax === 'number' ? rawMax : (typeof rawMax?.value === 'number' ? rawMax.value : undefined);
    if (typeof maxVal === 'number' && maxVal >= 1) {
      const prev = this.defaultMaxIterations;
      this.defaultMaxIterations = maxVal;
      for (const [_, goal] of this.goals) {
        if (goal && (goal.maxIterations === prev || typeof goal.maxIterations !== 'number' || typeof goal.maxIterations === 'object')) {
          goal.maxIterations = maxVal;
        }
      }
    }
    const boolKeys = ['autoDrive', 'enableSound', 'showQuickLaunchButton', 'autoCheckpointOnMilestone', 'enableLiveActivityFeed', 'enablePreplanning', 'autoBranchOnGoalStart', 'enablePostGoalRetrospective', 'autoScaleBudgetNearCompletion', 'enableTemplatesDrawer', 'enableMilestoneDependencies', 'enableVoiceAnnouncements', 'enableMilestoneCompaction'];
    for (const k of boolKeys) if (typeof config[k] === 'boolean') this[k] = config[k];
    if (typeof config.consecutiveToolFailureLimit === 'number') this.consecutiveToolFailureLimit = Math.max(0, config.consecutiveToolFailureLimit);
    if (typeof config.maxTokenBudget === 'number') this.maxTokenBudget = Math.max(0, config.maxTokenBudget);
    if (typeof config.budgetWarningThreshold === 'number') this.budgetWarningThreshold = Math.max(1, Math.min(100, config.budgetWarningThreshold));
    if (typeof config.soundScheme === 'string') this.soundScheme = config.soundScheme;
    if (typeof config.maxCostBudget === 'number') this.maxCostBudget = Math.max(0, config.maxCostBudget);
    if (typeof config.costWarningThreshold === 'number') this.costWarningThreshold = Math.max(1, Math.min(100, config.costWarningThreshold));
    if (typeof config.enableTelegramNotifications === 'boolean') this.enableTelegramNotifications = config.enableTelegramNotifications;
    if (typeof config.currency === 'string') this.currency = config.currency;
    if (typeof config.activeModel === 'string') this.activeModel = config.activeModel;
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
  resetToolFailureCount(sessionId = 'default') { this.toolFailureCounters.set(sessionId || 'default', 0); }
  getToolFailureCount(sessionId = 'default') { return this.toolFailureCounters.get(sessionId || 'default') || 0; }

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

    const initialMode = options.mode === GoalMode.PLAN ? GoalMode.PLAN : GoalMode.ACT;
    const initialState = initialMode === GoalMode.PLAN ? GoalState.PLANNING : GoalState.RUNNING;

    const goal = {
      id: `goal-${now}-${Math.random().toString(36).substring(2, 7)}`,
      sessionId: sid,
      title: cleanTitle,
      description: options.description?.trim() || '',
      lang: options.lang || detectLanguage(cleanTitle),
      cwd: options.cwd ? getSafeCwd(options.cwd, options.allowedRoots || this.allowedRoots || []) : null,
      mode: initialMode,
      state: initialState,
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
      gitBranch: options.gitBranch || options.branchName || null,
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
      operatorQuery: null,
      waitingForOperator: false,
      parentGoalId: options.parentGoalId || null,
      parentSessionId: options.parentSessionId || null,
      isSubGoal: Boolean(options.parentGoalId),
      subGoals: [],
      tokensUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      maxCostBudget: options.maxCostBudget ?? this.maxCostBudget ?? 0,
      currency: options.currency || this.currency || 'USD',
      costUsage: { promptCost: 0, completionCost: 0, totalCost: 0, formattedCost: '.00', currency: options.currency || this.currency || 'USD' },
      costWarningTriggered: false,
      costLimitExceeded: false,
      telegramNotificationsSent: [],
      logs: [{
        timestamp: now,
        type: 'info',
        message: `Goal initiated: "${cleanTitle}"` + (gitCommit ? ` (Git: ${gitCommit})` : ''),
      }],
      resultSummary: '',
    };

    if (this.autoBranchOnGoalStart && options.autoBranch !== false && this.storagePath !== null && process.env.NODE_ENV !== 'test') {
      const slug = sanitizeBranchSlug(cleanTitle);
      const targetCwd = goal.cwd || process.cwd();
      const parentBranch = getCurrentGitBranch(targetCwd);
      if (createGoalBranch(targetCwd, slug)) {
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
    if (!pauseGoal(goal, reason, recordActivity)) return this.getSnapshot(sid);
    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  resume(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!resumeGoal(goal, recordActivity)) return this.getSnapshot(sid);
    this.stallCounters.set(sid, 0);
    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  cancel(reason = 'Cancelled by user', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!cancelGoal(goal, reason, recordActivity)) return null;
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
    if (goal.parentSessionId) syncSubGoalToParent(this, sid, summary);
    if (this.enableTelegramNotifications) { dispatchGoalTelegramNotification(goal, { engine: this, ctx: this.ctx }).catch(() => {}); }
    this.stallCounters.delete(sid);
    this.toolFailureCounters.delete(sid);
    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  setMilestones(milestonesList, sessionId = 'default') { this.addMilestones(milestonesList, true, sessionId); return this.getSnapshot(sessionId); }

  addMilestones(milestonesList, shouldEmit = true, sessionId = 'default') {
    const sid = typeof shouldEmit === 'string' ? shouldEmit : (sessionId || 'default');
    const shouldEmitFlag = typeof shouldEmit === 'boolean' ? shouldEmit : true;
    const goal = this.goals.get(sid);
    if (!goal || !Array.isArray(milestonesList)) return [];

    const newMilestones = parseMilestoneItems(milestonesList, goal.milestones.length);
    for (const item of newMilestones) {
      goal.milestones.push(item);
    }
    this.recordProgress(sid);
    recordActivity(goal, { type: 'milestone', tool: 'addMilestones', status: 'success', details: `Added ${newMilestones.length} milestones` });
    if (shouldEmitFlag) this.emit(sid);
    return newMilestones;
  }

  updateMilestone(id, status, notes = '', sessionId = 'default', checklist = null) {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return false;

    const target = goal.milestones.find((m) => matchMilestone(m, id));
    if (!target) return false;

    if (status === MilestoneStatus.COMPLETED && target.verificationCommand) {
      const vRes = verifyMilestoneAcceptance(target, goal.cwd || process.cwd(), goal, recordActivity, { approvalGate: this.approvalGate, checkApproval: this.checkApproval });
      if (!vRes.ok) {
        this.emit(sid);
        return false;
      }
    }

    const res = applyMilestoneUpdate(target, status, notes, checklist, Object.values(MilestoneStatus), {
      enforceDependencies: this.enableMilestoneDependencies,
      allMilestones: goal.milestones,
    });
    if (res.invalidStatus || res.blocked) {
      if (res.invalidStatus) this.logger?.warn?.(`[dsh-goal] Invalid milestone status "${status}" for milestone ${id}`);
      if (res.blocked) {
        recordActivity(goal, { type: 'milestone', tool: 'updateMilestone', status: 'error', details: `Milestone ${id} blocked by ${res.missingDependencies?.join(', ')}` });
      }
      return false;
    }

    const prevStatus = res.prevStatus;
    recordActivity(goal, { type: 'milestone', tool: 'updateMilestone', status: 'success', details: `${id} -> ${status}` });
    if (this.enableKanbanSync) syncMilestoneStatusToKanban(target, { goal, ctx: this.ctx, store: this.kanbanStore, kanbanService: this.kanbanService }).catch(() => {});

    if (target.status === MilestoneStatus.COMPLETED && prevStatus !== MilestoneStatus.COMPLETED) {
      if (this.enableMilestoneCompaction !== false) compactMilestone(target, { goal, cwd: goal.cwd });
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
        }).catch((err) => { this.logger?.warn?.("[dsh-goal] Failed to sync milestone with issue:", err?.message || err); });
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

  getElapsedSeconds(sessionId = 'default') { return calculateElapsedSeconds(this.goals.get(sessionId || 'default')); }

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

    updateGoalCostUsage(goal, { promptTokens: prompt, completionTokens: completion, totalTokens: total, modelName: usage.modelName || usage.model || this.activeModel || '' }, this);
    const costCheck = processCostBudget(goal, { maxCostBudget: goal.maxCostBudget ?? this.maxCostBudget, costWarningThreshold: this.costWarningThreshold, GoalState });
    const budgetCheck = processTokenBudget(goal, {
      maxTokenBudget: this.maxTokenBudget,
      budgetWarningThreshold: this.budgetWarningThreshold,
      autoScaleBudgetNearCompletion: this.autoScaleBudgetNearCompletion,
      GoalState,
    });
    if (budgetCheck.paused || costCheck.paused) {
      this.emit(sid, true);
      return;
    }
    this.emit(sid);
  }

  getEstimatedRemainingSeconds(sessionId = 'default') { const sid = sessionId || 'default'; return calculateRemainingSeconds(this.goals.get(sid), this.getElapsedSeconds(sid)); }
  getSnapshot(sessionId = 'default') { const sid = sessionId || 'default'; return buildSnapshot(this.goals.get(sid), sid, this); }
  getGoalSnapshot(sessionId = 'default') { return this.getSnapshot(sessionId); }

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

  setMode(mode, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) throw new Error(`No active goal for session "${sid}"`);
    setGoalMode(goal, mode, recordActivity);
    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  approvePlan(sessionId = 'default') {
    return this.setMode(GoalMode.ACT, sessionId);
  }

  getActiveGoal(sessionId = 'default') {
    return this.goals.get(sessionId || 'default') || null;
  }

  askOperator(query = {}, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return { ok: false, error: 'Goal not found' };
    const res = askOperatorQuery(goal, query);
    this.emit(sid, true);
    return res;
  }

  answerOperator(payload = {}, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return { ok: false, error: 'Goal not found' };
    const res = answerOperatorQuery(goal, payload);
    this.emit(sid, true);
    return res;
  }

  getDiff(sessionId = 'default', options = {}) { return getEngineGoalDiff(this, sessionId, options); }
  syncKanban(sessionId = 'default', options = {}) { return syncGoalToKanban(this, sessionId, options); }
  handleKanbanCardMove(payload = {}, sessionId = 'default') { return handleKanbanCardMoved(this, payload, sessionId); }

  isPlanMode(sessionId = 'default') {
    const goal = this.goals.get(sessionId || 'default');
    return Boolean(goal && (goal.mode === GoalMode.PLAN || goal.state === GoalState.PLANNING));
  }
  spawnSubGoal(options = {}, sessionId = 'default') { return spawnSubGoal(this, sessionId, options); }
  completeSubGoal(sessionId, summary = '') { return completeSubGoal(this, sessionId, summary); }
  getSubGoals(sessionId = 'default') { return getSubGoalsList(this, sessionId); }
  getSubGoalBreadcrumbs(sessionId = 'default') { return getSubGoalBreadcrumbs(this, sessionId); }
  getCompactionSavings(sessionId = 'default') { const g = this.goals.get(sessionId || 'default'); return estimateCompactionSavings(g?.milestones || [], g?.lang || 'en'); }
  exportReleaseNotes(sessionId = 'default', options = {}) { return generateReleaseNotes(this.goals.get(sessionId || 'default'), options); }
  getCostUsage(sessionId = 'default') { return this.goals.get(sessionId || 'default')?.costUsage || null; }
}
