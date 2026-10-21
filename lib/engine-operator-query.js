import { GoalState } from './goal-engine-constants.js';
import { recordActivity } from './engine-intervention.js';

/**
 * Ask the human operator a question when encountering ambiguity or critical decisions (#166).
 * Sets the goal into a waiting/paused state and records the query.
 *
 * @param {object} goal
 * @param {object} query
 * @param {string} query.question - Question text
 * @param {string[]} [query.options] - Predefined choices for the operator
 * @param {boolean} [query.isBlocking=true] - Whether to pause execution until answered
 * @returns {object} result
 */
export function askOperatorQuery(goal, query = {}) {
  if (!goal) {
    return { ok: false, error: 'No active goal' };
  }

  const rawQ = query.question ? String(query.question).trim() : '';
  if (!rawQ) {
    return { ok: false, error: 'Question text is required' };
  }

  const cleanOptions = Array.isArray(query.options)
    ? query.options.map((o) => String(o).trim()).filter(Boolean)
    : [];

  const isBlocking = query.isBlocking !== false;

  const queryId = `opq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  goal.operatorQuery = {
    id: queryId,
    question: rawQ,
    options: cleanOptions,
    isBlocking,
    askedAt: Date.now(),
    answeredAt: null,
    answer: null,
    optionIndex: null,
    consumed: false,
  };

  goal.waitingForOperator = true;

  if (isBlocking) {
    if (!goal.previousStateBeforeOperator) {
      goal.previousStateBeforeOperator = goal.state || GoalState.RUNNING;
    }
    goal.state = GoalState.PAUSED;
    if (!goal.pausedAt) {
      goal.pausedAt = Date.now();
    }
  }

  recordActivity(goal, {
    type: 'operator_query',
    tool: 'goal_ask_operator',
    status: 'pending',
    details: `Asked operator: "${rawQ.slice(0, 80)}"`,
  });

  if (!Array.isArray(goal.logs)) goal.logs = [];
  goal.logs.push({
    timestamp: Date.now(),
    type: 'warning',
    message: `Goal awaiting operator input: "${rawQ}"`,
  });
  if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);

  return { ok: true, queryId, question: rawQ, options: cleanOptions, isBlocking };
}

/**
 * Record operator response to a pending query and resume goal execution (#166).
 *
 * @param {object} goal
 * @param {object} payload
 * @param {string} [payload.answer] - Freeform text answer
 * @param {number} [payload.optionIndex] - Index of selected choice in options array
 * @returns {object} result
 */
export function answerOperatorQuery(goal, payload = {}) {
  if (!goal || !goal.operatorQuery || !goal.waitingForOperator) {
    return { ok: false, error: 'No pending operator query for this goal' };
  }

  let finalAnswer = typeof payload.answer === 'string' ? payload.answer.trim() : '';
  const optIdx = typeof payload.optionIndex === 'number' ? payload.optionIndex : null;

  if (optIdx !== null && Array.isArray(goal.operatorQuery.options) && goal.operatorQuery.options[optIdx]) {
    finalAnswer = goal.operatorQuery.options[optIdx];
  }

  if (!finalAnswer) {
    return { ok: false, error: 'Answer or valid option selection is required' };
  }

  goal.operatorQuery.answeredAt = Date.now();
  goal.operatorQuery.answer = finalAnswer;
  goal.operatorQuery.optionIndex = optIdx;
  goal.operatorQuery.consumed = false;
  goal.waitingForOperator = false;

  // Unpause if goal was paused for operator
  if (goal.pausedAt) {
    const pauseMs = Math.max(0, Date.now() - goal.pausedAt);
    goal.totalPausedDurationMs = (goal.totalPausedDurationMs || 0) + pauseMs;
    goal.pausedAt = null;
  }

  goal.state = goal.previousStateBeforeOperator || GoalState.RUNNING;
  delete goal.previousStateBeforeOperator;

  recordActivity(goal, {
    type: 'operator_answer',
    tool: 'goal_ask_operator',
    status: 'success',
    details: `Operator replied: "${finalAnswer.slice(0, 80)}"`,
  });

  if (!Array.isArray(goal.logs)) goal.logs = [];
  goal.logs.push({
    timestamp: Date.now(),
    type: 'info',
    message: `Operator answered: "${finalAnswer}"`,
  });
  if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);

  return { ok: true, answer: finalAnswer };
}

/**
 * Format prompt injection with operator's answer for the next turn.
 * Marks the answer as consumed after formatting.
 *
 * @param {object} goal
 * @param {string} [lang='en']
 * @returns {string} formatted prompt snippet or empty string
 */
export function formatOperatorAnswerPrompt(goal, lang = 'en') {
  if (!goal || !goal.operatorQuery || !goal.operatorQuery.answer || goal.operatorQuery.consumed) {
    return '';
  }

  const { question, answer } = goal.operatorQuery;
  // Mark consumed so it is only injected on the resume turn
  goal.operatorQuery.consumed = true;

  if (lang === 'zh') {
    return `\n\n[操作员答复 / OPERATOR RESPONSE]\n` +
      `你之前提出的问题: "${question}"\n` +
      `操作员给出的明确指令: "${answer}"\n` +
      `请严格根据操作员的答复继续推进任务，切勿再对此问题做无谓猜测！\n`;
  }

  return `\n\n[OPERATOR RESPONSE TO YOUR QUERY]\n` +
    `Your Question: "${question}"\n` +
    `Operator Answer: "${answer}"\n` +
    `Strictly follow the operator's response and proceed with executing the goal without second-guessing!\n`;
}
