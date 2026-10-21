import { MilestoneStatus } from './goal-engine-constants.js';

export const MILESTONE_TO_KANBAN_COLUMN = {
  [MilestoneStatus.PENDING]: 'todo',
  [MilestoneStatus.IN_PROGRESS]: 'in_progress',
  [MilestoneStatus.COMPLETED]: 'done',
  pending: 'todo',
  in_progress: 'in_progress',
  active: 'in_progress',
  completed: 'done',
  PENDING: 'todo',
  ACTIVE: 'in_progress',
  COMPLETED: 'done',
};

export const KANBAN_COLUMN_TO_MILESTONE_STATUS = {
  backlog: MilestoneStatus.PENDING,
  todo: MilestoneStatus.PENDING,
  in_progress: MilestoneStatus.IN_PROGRESS,
  doing: MilestoneStatus.IN_PROGRESS,
  active: MilestoneStatus.IN_PROGRESS,
  review: MilestoneStatus.COMPLETED,
  done: MilestoneStatus.COMPLETED,
  completed: MilestoneStatus.COMPLETED,
};

/**
 * Format externalRef string for a goal milestone
 * @param {string} goalId 
 * @param {string} milestoneId 
 * @returns {string}
 */
export function formatMilestoneExternalRef(goalId, milestoneId) {
  return `dsh-goal:${goalId || 'default'}:${milestoneId}`;
}

/**
 * Parse milestone externalRef
 * @param {string} externalRef 
 * @returns {{ goalId: string, milestoneId: string } | null}
 */
export function parseMilestoneExternalRef(externalRef) {
  if (typeof externalRef !== 'string' || !externalRef.startsWith('dsh-goal:')) {
    return null;
  }
  const parts = externalRef.split(':');
  if (parts.length < 3) return null;
  return {
    goalId: parts[1],
    milestoneId: parts.slice(2).join(':'),
  };
}

/**
 * Resolve active kanban service or store from context/options
 * @param {object} options 
 * @returns {{ service: object | null, store: object | null }}
 */
export function resolveKanbanServices(options = {}) {
  const ctx = options.ctx;
  let service = options.kanbanService || null;
  let store = options.store || null;

  if (!service && ctx) {
    service = ctx.dshKanban || (typeof ctx.get === 'function' ? ctx.get('dshKanban') : null);
  }

  if (!store) {
    if (service && typeof service.getStore === 'function') {
      store = service.getStore();
    } else if (ctx?.kanbanStore) {
      store = ctx.kanbanStore;
    }
  }

  return { service, store };
}

/**
 * Synchronize all milestones of a goal with dsh-kanban
 * Safe degradation if kanban is not available
 * @param {object} engine 
 * @param {string} sessionId 
 * @param {object} options 
 * @returns {Promise<object>} sync summary
 */
export async function syncGoalToKanban(engine, sessionId = 'default', options = {}) {
  const sid = sessionId || 'default';
  const goal = engine.goals?.get(sid);
  if (!goal) {
    return { ok: false, error: 'Goal not found' };
  }
  if (!goal.milestones || goal.milestones.length === 0) {
    return { ok: true, synced: 0, reason: 'No milestones in goal' };
  }

  const { service, store } = resolveKanbanServices({
    kanbanService: options.kanbanService || engine.kanbanService,
    store: options.store || engine.kanbanStore,
    ctx: options.ctx || engine.ctx,
    ...options,
  });

  if (!service && !store) {
    return { ok: false, skipped: true, reason: 'kanban-unavailable' };
  }

  const results = [];
  for (const ms of goal.milestones) {
    const externalRef = formatMilestoneExternalRef(goal.id, ms.id);
    const col = MILESTONE_TO_KANBAN_COLUMN[ms.status] || 'todo';
    const title = `[Goal] ${ms.title}`;
    const body = ms.notes || `Milestone ${ms.id} for goal: ${goal.title}`;

    try {
      if (service && typeof service.createTask === 'function') {
        const res = await service.createTask({
          title,
          body,
          column: col,
          externalRef,
          labels: ['dsh-goal', String(goal.id)],
        });
        results.push({ milestoneId: ms.id, taskId: res.taskId || res.task?.id, ok: res.ok, alreadyExists: res.alreadyExists });
      } else if (store && typeof store.createTask === 'function') {
        const existing = typeof store.findTaskByExternalRef === 'function' ? store.findTaskByExternalRef(externalRef) : null;
        if (!existing) {
          const task = store.createTask({
            title,
            body,
            column: col,
            externalRef,
            labels: ['dsh-goal', String(goal.id)],
          });
          results.push({ milestoneId: ms.id, taskId: task.id, ok: true, alreadyExists: false });
        } else {
          results.push({ milestoneId: ms.id, taskId: existing.id, ok: true, alreadyExists: true });
        }
      }
    } catch (err) {
      engine.logger?.warn?.(`[dsh-goal] Kanban milestone sync failed for ${ms.id}:`, err?.message || err);
      results.push({ milestoneId: ms.id, ok: false, error: err?.message || String(err) });
    }
  }

  return { ok: true, synced: results.filter((r) => r.ok).length, total: goal.milestones.length, results };
}

/**
 * Update corresponding kanban card column when milestone status changes
 * @param {object} milestone 
 * @param {object} options 
 * @returns {Promise<object>}
 */
export async function syncMilestoneStatusToKanban(milestone, { goal, ctx, store, kanbanService } = {}) {
  if (!milestone || !goal) return { ok: false, error: 'Invalid milestone or goal' };

  const { store: activeStore } = resolveKanbanServices({
    store,
    kanbanService,
    ctx,
  });
  if (!activeStore || typeof activeStore.findTaskByExternalRef !== 'function') {
    return { ok: false, skipped: true, reason: 'kanban-store-unavailable' };
  }

  const externalRef = formatMilestoneExternalRef(goal.id, milestone.id);
  const targetCol = MILESTONE_TO_KANBAN_COLUMN[milestone.status] || 'todo';

  try {
    const task = activeStore.findTaskByExternalRef(externalRef);
    if (!task) {
      return { ok: false, skipped: true, reason: 'kanban-task-not-found' };
    }

    if (task.column !== targetCol && typeof activeStore.moveTask === 'function') {
      activeStore.moveTask(task.id, { column: targetCol });
      return { ok: true, synced: true, taskId: task.id, column: targetCol };
    }

    return { ok: true, synced: true, taskId: task.id, column: task.column, unchanged: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Handle external card movement from dsh-kanban board
 * @param {object} engine 
 * @param {object} payload 
 * @param {string} sessionId 
 * @returns {object}
 */
export function handleKanbanCardMoved(engine, payload = {}, sessionId = 'default') {
  const externalRef = payload.externalRef;
  const column = payload.column;
  const targetStatus = payload.status || (column ? KANBAN_COLUMN_TO_MILESTONE_STATUS[column] : null);

  if (!targetStatus) {
    return { ok: false, error: 'Invalid or missing target milestone status/column' };
  }

  let goalId = null;
  let milestoneId = payload.milestoneId || null;

  if (externalRef) {
    const parsed = parseMilestoneExternalRef(externalRef);
    if (parsed) {
      goalId = parsed.goalId;
      milestoneId = parsed.milestoneId;
    }
  }

  const candidateSessions = sessionId && sessionId !== 'default'
    ? [sessionId, 'default']
    : ['default', ...engine.goals.keys()];

  for (const sid of candidateSessions) {
    const goal = engine.goals?.get(sid);
    if (!goal || (goalId && String(goal.id) !== String(goalId))) continue;

    const ms = goal.milestones?.find((m) => String(m.id) === String(milestoneId) || m.title === payload.title);
    if (ms) {
      const updateRes = engine.updateMilestone(
        ms.id,
        targetStatus,
        `Synced from Kanban card move to column '${column || targetStatus}'`,
        sid
      );
      return {
        ok: true,
        sessionId: sid,
        milestoneId: ms.id,
        prevStatus: ms.status,
        newStatus: targetStatus,
        updateResult: updateRes,
      };
    }
  }

  return { ok: false, error: 'Matching milestone not found for external reference' };
}
