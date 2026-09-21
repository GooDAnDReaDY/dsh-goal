import { MilestoneStatus } from './goal-engine-constants.js';

/**
 * Match a milestone object by exact ID or normalized ID (e.g. m-1 vs m1 vs 1)
 * @param {object} m Milestone object
 * @param {string|number} id Milestone ID to match
 * @returns {boolean}
 */
export function matchMilestone(m, id) {
  if (!m || id === undefined || id === null) return false;
  if (m.id === String(id)) return true;
  const s1 = String(m.id).toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = String(id).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s1 && s1 === s2) return true;
  const n1 = s1.replace(/^m+/, '');
  const n2 = s2.replace(/^m+/, '');
  return Boolean(n1 && n1 === n2);
}

/**
 * Safely parse checklist items
 * @param {Array} checklist
 * @returns {Array<{ text: string, done: boolean }>}
 */
export function parseChecklist(checklist) {
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map((item) => ({
      text: String(item?.text || item?.title || '').trim(),
      done: Boolean(item?.done || item?.completed),
    }))
    .filter((item) => item.text.length > 0);
}

/**
 * Build and normalize milestone objects from list
 * @param {Array} milestonesList
 * @param {number} startingCount
 * @returns {Array<object>}
 */
export function parseMilestoneItems(milestonesList, startingCount = 0) {
  if (!Array.isArray(milestonesList)) return [];
  const result = [];
  let count = startingCount;

  for (const item of milestonesList) {
    const itemTitle = typeof item === 'string' ? item : item?.title;
    if (!itemTitle || !itemTitle.trim()) continue;

    count += 1;
    const mId = typeof item === 'object' && item?.id ? item.id : ('m-' + count);
    const mObj = {
      id: String(mId),
      title: itemTitle.trim(),
      status: typeof item === 'object' && item?.status ? item.status : MilestoneStatus.PENDING,
      notes: typeof item === 'object' && item?.notes ? String(item.notes) : '',
    };
    if (typeof item === 'object' && Array.isArray(item?.checklist)) {
      mObj.checklist = parseChecklist(item.checklist);
    }
    result.push(mObj);
  }

  return result;
}

/**
 * Apply updates to a milestone target
 * @param {object} target Milestone object
 * @param {string} [status] New status
 * @param {string} [notes] New notes
 * @param {Array} [checklist] New checklist
 * @param {Array<string>} [validStatuses] Allowed statuses
 * @returns {{ prevStatus: string, updatedStatus: string }}
 */
export function applyMilestoneUpdate(target, status, notes = '', checklist = null, validStatuses = []) {
  if (!target) return { prevStatus: null, updatedStatus: null };
  const prevStatus = target.status;

  if (status && (validStatuses.length === 0 || validStatuses.includes(status))) {
    target.status = status;
  }
  if (notes !== undefined && notes !== null && notes !== '') {
    target.notes = String(notes);
  }
  if (Array.isArray(checklist)) {
    target.checklist = parseChecklist(checklist);
  }

  return { prevStatus, updatedStatus: target.status };
}

/**
 * Toggle a checklist item in milestone target
 * @param {object} target Milestone object
 * @param {number} itemIndex Index in checklist
 * @param {boolean} [done] Optional explicit done boolean
 * @returns {boolean}
 */
export function toggleMilestoneChecklistItem(target, itemIndex, done) {
  if (!target || !Array.isArray(target.checklist) || !target.checklist[itemIndex]) {
    return false;
  }
  target.checklist[itemIndex].done = done !== undefined ? Boolean(done) : !target.checklist[itemIndex].done;
  return true;
}
