/**
 * Token budget guard: monitors goal session tokens via ctx.tokenMeter,
 * emits warning at threshold (default 80%), and calls ctx.goals.block() at 100%.
 */
export class TokenBudgetGuard {
  constructor({
    maxTokenBudget = 0,
    warningThreshold = 80,
    autoScaleNearCompletion = false,
    logger = console,
  } = {}) {
    this.maxTokenBudget = maxTokenBudget;
    this.warningThreshold = warningThreshold;
    this.autoScaleNearCompletion = autoScaleNearCompletion;
    this.logger = logger;
    this.warnedGoals = new Set();
    this.blockedGoals = new Set();
    this.autoScaledGoals = new Set();
    this.customBudgets = new Map(); // goalId -> maxTokenBudget override
  }

  updateConfig({ maxTokenBudget, warningThreshold, autoScaleNearCompletion }) {
    if (typeof maxTokenBudget === 'number') this.maxTokenBudget = maxTokenBudget;
    if (typeof warningThreshold === 'number') this.warningThreshold = warningThreshold;
    if (typeof autoScaleNearCompletion === 'boolean') this.autoScaleNearCompletion = autoScaleNearCompletion;
  }

  setGoalBudget(goalId, limit) {
    if (goalId && typeof limit === 'number') {
      this.customBudgets.set(goalId, limit);
    }
  }

  getEffectiveBudget(goalId) {
    if (goalId && this.customBudgets.has(goalId)) {
      return this.customBudgets.get(goalId);
    }
    return this.maxTokenBudget;
  }

  /**
   * Evaluate token consumption and trigger warnings or goal blocking
   * @param {object} params
   * @param {object} params.agent
   * @param {object} params.goal - current goal snapshot { id, revision, phase }
   * @param {object} [params.tokenMeter] - ctx.tokenMeter
   * @param {object} [params.goalsService] - ctx.goals
   * @param {Array} [params.milestones] - milestone list to test near-completion
   * @returns {{ status: 'ok'|'warning'|'blocked'|'auto_scaled', message?: string, tokensUsed: number, budget: number, pct: number }}
   */
  checkBudget({ agent, goal, tokenMeter, goalsService, milestones = [] }) {
    if (!goal || !goal.id) return { status: 'ok', tokensUsed: 0, budget: 0, pct: 0 };
    const goalId = goal.id;
    const limit = this.getEffectiveBudget(goalId);
    if (limit <= 0) return { status: 'ok', tokensUsed: 0, budget: 0, pct: 0 };

    let tokensUsed = 0;
    if (tokenMeter && agent?.session) {
      try {
        const measurement = tokenMeter.measure(agent.session);
        tokensUsed = measurement?.totalTokens || 0;
      } catch (err) {
        this.logger.warn?.('[TokenBudgetGuard] Failed to measure tokens:', err.message);
      }
    }

    const pct = Math.round((tokensUsed / limit) * 100);

    // 1. Check if budget exceeded (>= 100%)
    if (tokensUsed >= limit) {
      // Check auto-scale buffer near completion (>= 75% milestones done)
      if (this.autoScaleNearCompletion && !this.autoScaledGoals.has(goalId)) {
        const total = milestones.length;
        const done = milestones.filter(m => m.completed).length;
        const nearDone = total > 0 && (done / total >= 0.75 || done === total - 1);
        if (nearDone) {
          const extension = Math.round(limit * 0.2); // +20%
          const newLimit = limit + extension;
          this.setGoalBudget(goalId, newLimit);
          this.autoScaledGoals.add(goalId);
          const msg = `⚡ Token budget auto-scaled: added +${extension.toLocaleString()} tokens buffer near goal completion (${newLimit.toLocaleString()} total).`;
          this.logger.info?.(`[TokenBudgetGuard] ${msg}`);
          return { status: 'auto_scaled', message: msg, tokensUsed, budget: newLimit, pct: Math.round((tokensUsed / newLimit) * 100) };
        }
      }

      // Block goal via core GoalService
      const msg = `Token budget limit (${limit.toLocaleString()}) reached (${tokensUsed.toLocaleString()} tokens used, ${pct}%). Goal execution is blocked.`;
      if (!this.blockedGoals.has(goalId)) {
        this.blockedGoals.add(goalId);
        if (goalsService && typeof goalsService.block === 'function' && agent) {
          try {
            goalsService.block(agent, { id: goal.id, revision: goal.revision }, {
              code: 'budget',
              message: msg,
            });
            this.logger.info?.(`[TokenBudgetGuard] Blocked goal "${goalId}" via ctx.goals.block()`);
          } catch (err) {
            this.logger.warn?.('[TokenBudgetGuard] ctx.goals.block() failed:', err.message);
          }
        }
      }
      return { status: 'blocked', message: msg, tokensUsed, budget: limit, pct };
    }

    // 2. Check warning threshold (e.g. >= 80%)
    if (pct >= this.warningThreshold) {
      const msg = `⚠️ Token budget warning: ${tokensUsed.toLocaleString()} of ${limit.toLocaleString()} tokens used (${pct}%). Goal will block at 100%.`;
      const isNewWarning = !this.warnedGoals.has(goalId);
      if (isNewWarning) {
        this.warnedGoals.add(goalId);
        this.logger.warn?.(`[TokenBudgetGuard] Goal "${goalId}" reached ${pct}% of token budget.`);
      }
      return { status: 'warning', message: msg, tokensUsed, budget: limit, pct, isNewWarning };
    }

    return { status: 'ok', tokensUsed, budget: limit, pct };
  }

  resetGoal(goalId) {
    if (goalId) {
      this.warnedGoals.delete(goalId);
      this.blockedGoals.delete(goalId);
      this.autoScaledGoals.delete(goalId);
      this.customBudgets.delete(goalId);
    }
  }
}
