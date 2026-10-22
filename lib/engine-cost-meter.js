/**
 * Real-time Financial Cost Meter for DSH Goal Engine (Issue #169).
 * Computes monetary token costs based on active model rates,
 * tracks accumulated costs, and enforces financial budget thresholds.
 */

export const DEFAULT_MODEL_RATES = {
  // USD per 1,000,000 tokens: { prompt: price, completion: price }
  'deepseek-chat': { prompt: 0.14, completion: 0.28 },
  'deepseek-reasoner': { prompt: 0.55, completion: 2.19 },
  'deepseek-coder': { prompt: 0.14, completion: 0.28 },
  'gpt-4o': { prompt: 2.50, completion: 10.00 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.60 },
  'claude-3-5-sonnet': { prompt: 3.00, completion: 15.00 },
  'claude-3-5-haiku': { prompt: 0.80, completion: 4.00 },
  'claude-3-opus': { prompt: 15.00, completion: 75.00 },
  'fallback': { prompt: 1.00, completion: 3.00 },
};

/**
 * Resolve pricing rates for a given model identifier
 * @param {string} [modelName]
 * @param {object} [customRates]
 * @returns {{ prompt: number, completion: number }}
 */
export function getModelRates(modelName, customRates = {}) {
  const table = { ...DEFAULT_MODEL_RATES, ...(customRates || {}) };
  if (!modelName || typeof modelName !== 'string') return table.fallback;
  const lower = modelName.toLowerCase();
  for (const [key, rates] of Object.entries(table)) {
    if (key !== 'fallback' && lower.includes(key)) {
      return rates;
    }
  }
  return table.fallback;
}

/**
 * Format currency amount into human readable string
 * @param {number} amount
 * @param {string} [currency='USD']
 * @returns {string}
 */
export function formatCurrency(amount, currency = 'USD') {
  const num = Number(amount) || 0;
  const sym = currency === "EUR" ? "€" : currency === "CNY" ? "¥" : currency === "GBP" ? "£" : "$";
  if (num === 0) return sym + "0.00";
  if (num < 0.01) return sym + num.toFixed(4);
  return sym + num.toFixed(2);
}

/**
 * Calculate monetary cost for given token counts and model
 * @param {number} [promptTokens=0]
 * @param {number} [completionTokens=0]
 * @param {string} [modelName='']
 * @param {object} [customRates={}]
 * @returns {object}
 */
export function calculateCost(promptTokens = 0, completionTokens = 0, modelName = '', customRates = {}) {
  const p = Number(promptTokens) || 0;
  const c = Number(completionTokens) || 0;
  const rates = getModelRates(modelName, customRates);
  const promptCost = (p / 1_000_000) * rates.prompt;
  const completionCost = (c / 1_000_000) * rates.completion;
  const totalCost = promptCost + completionCost;

  return {
    promptTokens: p,
    completionTokens: c,
    totalTokens: p + c,
    promptCost,
    completionCost,
    totalCost,
    formattedCost: formatCurrency(totalCost),
    modelName: modelName || 'standard',
  };
}

/**
 * Update goal accumulated cost usage
 * @param {object} goal
 * @param {object} usage - { promptTokens, completionTokens, model }
 * @param {object} [engine={}] - GoalEngine instance
 * @returns {object}
 */
export function updateGoalCostUsage(goal, usage = {}, engine = {}) {
  if (!goal) return null;
  if (!goal.costUsage) {
    goal.costUsage = { promptCost: 0, completionCost: 0, totalCost: 0, formattedCost: '$0.00' };
  }

  const prompt = Number(usage.promptTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
  const completion = Number(usage.completionTokens ?? usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
  const model = usage.model || usage.modelName || goal.model || engine.activeModel || engine.model || '';

  const cost = calculateCost(prompt, completion, model, engine.customRates || engine.modelTariffs);
  goal.costUsage.promptCost += cost.promptCost;
  goal.costUsage.completionCost += cost.completionCost;
  goal.costUsage.totalCost += cost.totalCost;
  goal.costUsage.formattedCost = formatCurrency(goal.costUsage.totalCost, engine.currency);

  return goal.costUsage;
}

/**
 * Evaluate financial cost budget limits and emit warnings or pauses
 * @param {object} goal
 * @param {object} [options={}]
 * @returns {{ paused: boolean, warning: boolean, exceeded: boolean, currentCost: number, budget: number }}
 */
export function processCostBudget(goal, options = {}) {
  const { maxCostBudget = 0, costWarningThreshold = 80, GoalState, recordActivity } = options;
  const budget = goal.maxCostBudget || maxCostBudget || 0;
  if (budget <= 0 || !goal.costUsage) {
    return { paused: false, warning: false, exceeded: false, currentCost: 0, budget: 0 };
  }

  const currentCost = goal.costUsage.totalCost;
  const warnThreshold = (budget * costWarningThreshold) / 100;

  if (currentCost >= warnThreshold && !goal.costWarningTriggered) {
    goal.costWarningTriggered = true;
    goal.logs.push({
      timestamp: Date.now(),
      type: 'warning',
      message: `Cost budget warning: ${goal.costUsage.formattedCost} of $${budget.toFixed(2)} budget consumed (${Math.round((currentCost / budget) * 100)}%)`,
    });
    if (typeof recordActivity === 'function') {
      recordActivity(goal, {
        type: 'budget',
        tool: 'costBudgetWarning',
        status: 'warning',
        details: `${goal.costUsage.formattedCost} / $${budget.toFixed(2)}`,
      });
    }
  }

  if (currentCost >= budget && goal.state === (GoalState?.RUNNING || 'RUNNING')) {
    goal.costLimitExceeded = true;
    goal.state = GoalState?.PAUSED || 'PAUSED';
    goal.pausedAt = Date.now();
    goal.pauseReason = `Cost budget limit of $${budget.toFixed(2)} reached`;
    goal.logs.push({
      timestamp: Date.now(),
      type: 'warning',
      message: `Cost budget limit ($${budget.toFixed(2)}) reached. Pausing autonomous goal.`,
    });
    if (typeof recordActivity === 'function') {
      recordActivity(goal, {
        type: 'control',
        tool: 'costBudgetLimit',
        status: 'error',
        details: goal.pauseReason,
      });
    }
    return { paused: true, warning: true, exceeded: true, currentCost, budget };
  }

  return { paused: false, warning: Boolean(goal.costWarningTriggered), warned: Boolean(goal.costWarningTriggered), exceeded: false, currentCost, budget };
}
