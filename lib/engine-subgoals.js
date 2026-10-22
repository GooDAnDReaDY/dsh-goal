/**
 * Hierarchical Recursive Sub-goals Engine Module (Issue #170).
 * Supports isolated context execution, state counters isolation,
 * breadcrumbs hierarchy, and artifact/control synchronization with parent goals.
 */

import { GoalState } from './goal-engine-constants.js';

/**
 * Spawn a child sub-goal under a parent goal session
 * @param {object} engine - GoalEngine instance
 * @param {string} parentSessionId - Parent goal session ID
 * @param {object} options - Sub-goal options { title, prompt, description, maxIterations, cwd, inheritContext, milestones }
 * @returns {object}
 */
export function spawnSubGoal(engine, parentSessionId, options = {}) {
  if (!engine) throw new Error('GoalEngine instance is required');

  const pSid = parentSessionId || 'default';
  const parentGoal = engine.goals.get(pSid);
  if (!parentGoal) {
    return { ok: false, error: `Parent goal for session "${pSid}" not found` };
  }

  const rawTitle = options.title || options.goal;
  if (!rawTitle || typeof rawTitle !== 'string' || !rawTitle.trim()) {
    return { ok: false, error: 'Sub-goal title is required and cannot be empty' };
  }

  const cleanTitle = rawTitle.trim();
  const subGoalId = options.subGoalId || `sub-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const childSessionId = options.sessionId || `${pSid}:subgoal:${subGoalId}`;

  const inheritContext = options.inheritContext !== false && options.inherit_context !== false;
  let childDesc = (options.prompt || options.description || '').trim();
  if (inheritContext) {
    const parentContextTag = `[Parent Goal: "${parentGoal.title}"]`;
    childDesc = childDesc ? `${parentContextTag} ${childDesc}` : parentContextTag;
  }

  const maxIters = typeof options.maxIterations === 'number'
    ? options.maxIterations
    : (typeof options.max_iterations === 'number' ? options.max_iterations : 15);

  const childSnapshot = engine.startGoal(cleanTitle, {
    description: childDesc,
    maxIterations: maxIters,
    cwd: options.cwd || parentGoal.cwd,
    lang: options.lang || parentGoal.lang,
    parentGoalId: parentGoal.id,
    parentSessionId: pSid,
    autoBranch: false,
    milestones: Array.isArray(options.milestones) ? options.milestones : [],
  }, childSessionId);

  const childGoal = engine.goals.get(childSessionId);
  if (childGoal) {
    childGoal.parentGoalId = parentGoal.id;
    childGoal.parentSessionId = pSid;
    childGoal.isSubGoal = true;
    childGoal.subGoalId = subGoalId;
  }

  if (!Array.isArray(parentGoal.subGoals)) {
    parentGoal.subGoals = [];
  }

  parentGoal.subGoals.push({
    id: childGoal ? childGoal.id : childSnapshot.id,
    subGoalId,
    sessionId: childSessionId,
    title: cleanTitle,
    state: childGoal ? childGoal.state : GoalState.RUNNING,
    createdAt: childGoal ? childGoal.startedAt : Date.now(),
    completedAt: null,
    resultSummary: '',
  });

  if (typeof engine.recordToolActivity === 'function') {
    engine.recordToolActivity('spawnSubGoal', 'success', `Spawned sub-goal [${cleanTitle}]`, pSid);
  }

  engine.emit(pSid, true);

  return {
    ok: true,
    parentGoalId: parentGoal.id,
    parentSessionId: pSid,
    subGoalId,
    childSessionId,
    childGoal: childSnapshot,
  };
}

/**
 * Complete a child sub-goal and synchronize state/deliverables back to parent goal
 * @param {object} engine - GoalEngine instance
 * @param {string} childSessionId - Child sub-goal session ID
 * @param {string} [resultSummary=''] - Deliverables summary
 * @returns {object}
 */
export function syncSubGoalToParent(engine, childSessionId, resultSummary = '') {
  if (!engine) return false;
  const childGoal = engine.goals.get(childSessionId);
  if (!childGoal) return false;

  const pSid = childGoal.parentSessionId;
  const parentGoal = pSid ? engine.goals.get(pSid) : null;
  if (!parentGoal) return false;

  if (Array.isArray(parentGoal.subGoals)) {
    const entry = parentGoal.subGoals.find(
      (s) => s.sessionId === childSessionId || s.id === childGoal.id || (childGoal.subGoalId && s.subGoalId === childGoal.subGoalId)
    );
    if (entry) {
      entry.state = GoalState.COMPLETED;
      entry.completedAt = Date.now();
      entry.resultSummary = resultSummary;
    }
  }

  const note = resultSummary ? `: ${resultSummary}` : '';
  parentGoal.logs.push({
    timestamp: Date.now(),
    type: 'info',
    message: `Sub-goal [${childGoal.title}] completed${note}`,
  });

  if (typeof engine.recordToolActivity === 'function') {
    engine.recordToolActivity('completeSubGoal', 'success', `Sub-goal [${childGoal.title}] completed`, pSid);
  }

  engine.emit(pSid, true);
  return true;
}

export function completeSubGoal(engine, childSessionId, resultSummary = '') {
  if (!engine) throw new Error('GoalEngine instance is required');
  if (!childSessionId) return { ok: false, error: 'childSessionId is required' };

  const childGoal = engine.goals.get(childSessionId);
  if (!childGoal) {
    return { ok: false, error: `Child sub-goal "${childSessionId}" not found` };
  }

  const pSid = childGoal.parentSessionId;
  if (childGoal.state !== GoalState.COMPLETED) {
    engine.completeGoal(resultSummary, childSessionId);
  } else {
    syncSubGoalToParent(engine, childSessionId, resultSummary);
  }

  return {
    ok: true,
    childSessionId,
    parentSessionId: pSid || null,
    resultSummary,
  };
}

/**
 * Get hierarchy breadcrumbs chain from root goal down to current session
 * @param {object} engine - GoalEngine instance
 * @param {string} [sessionId='default']
 * @returns {Array<{ sessionId: string, id: string, title: string, state: string, isSubGoal: boolean, isCurrent?: boolean }>}
 */
export function getSubGoalBreadcrumbs(engine, sessionId = 'default') {
  if (!engine || !engine.goals) return [];

  const crumbs = [];
  let currSid = sessionId || 'default';
  const visited = new Set();

  while (currSid && !visited.has(currSid)) {
    visited.add(currSid);
    const g = engine.goals.get(currSid);
    if (!g) break;

    crumbs.unshift({
      sessionId: currSid,
      id: g.id,
      title: g.title,
      state: g.state,
      isSubGoal: Boolean(g.parentGoalId || g.isSubGoal),
    });

    currSid = g.parentSessionId;
  }

  if (crumbs.length > 0) {
    crumbs[crumbs.length - 1].isCurrent = true;
  }

  return crumbs;
}

/**
 * Get list of child sub-goals for a given parent session
 * @param {object} engine - GoalEngine instance
 * @param {string} [sessionId='default']
 * @returns {Array<object>}
 */
export function getSubGoalsList(engine, sessionId = 'default') {
  if (!engine || !engine.goals) return [];
  const g = engine.goals.get(sessionId || 'default');
  return Array.isArray(g?.subGoals) ? g.subGoals : [];
}
