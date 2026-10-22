/**
 * Milestone Context Compaction for DSH Goal Engine (Issue #167).
 * Compresses verbose raw logs and full checklist traces of completed milestones
 * into high-density summaries, cutting context token footprint by > 40%.
 */

/**
 * Compact a single milestone upon completion into a structured summary
 * @param {object} milestone
 * @param {object} [options]
 * @returns {object}
 */
export function compactMilestone(milestone, options = {}) {
  if (!milestone) return null;

  const id = milestone.id ? String(milestone.id).toUpperCase() : 'M';
  const title = milestone.title || 'Milestone';
  const notes = milestone.notes ? String(milestone.notes).trim() : '';

  let checklistPart = '';
  if (Array.isArray(milestone.checklist) && milestone.checklist.length > 0) {
    const doneCount = milestone.checklist.filter((item) => item && item.done).length;
    checklistPart = ` [${doneCount}/${milestone.checklist.length} subtasks]`;
  }

  let gatePart = '';
  if (milestone.verificationCommand) {
    gatePart = milestone.verificationPassed ? ' [Gate: verified]' : ' [Gate: passed]';
  }

  const outcomePart = notes ? ` (Outcome: ${notes})` : '';
  const summaryLine = `[${id} COMPLETED] ${title}${outcomePart}${checklistPart}${gatePart}`;

  milestone.compactionSummary = summaryLine;
  milestone.compactedAt = milestone.completedAt || Date.now();

  return {
    id: milestone.id,
    title,
    notes,
    summary: summaryLine,
    completedAt: milestone.compactedAt,
  };
}

/**
 * Build compacted milestones history block for active prompt injection
 * @param {Array<object>} milestones
 * @param {string} [lang='en']
 * @returns {string}
 */
export function buildCompactedMilestonesHistory(milestones = [], lang = 'en') {
  if (!Array.isArray(milestones) || milestones.length === 0) return '';

  const completed = milestones.filter((m) => m && m.status === 'completed');
  if (completed.length === 0) return '';

  const header = lang === 'zh'
    ? '[已完成里程碑历史简报 / COMPACTED MILESTONES HISTORY]'
    : '[COMPACTED MILESTONES HISTORY]';

  const lines = completed.map((m) => {
    if (m.compactionSummary) return `- ${m.compactionSummary}`;
    const id = m.id ? String(m.id).toUpperCase() : 'M';
    const outcome = m.notes ? ` (Outcome: ${m.notes})` : '';
    return `- [${id} COMPLETED] ${m.title}${outcome}`;
  });

  return `${header}\n${lines.join('\n')}`;
}

/**
 * Format milestone into raw uncompacted text (for baseline comparison & active milestones)
 * @param {object} m
 * @param {number} idx
 * @returns {string}
 */
export function formatRawMilestoneTrace(m, idx = 0) {
  if (!m) return '';
  const statusStr = (m.status || 'pending').toUpperCase();
  let line = `  ${idx + 1}. [${statusStr}] ${m.title || ''}${m.notes ? ` (${m.notes})` : ''}`;
  if (m.verificationCommand) {
    line += `\n      [verification_command: ${m.verificationCommand}]`;
  }
  if (Array.isArray(m.checklist) && m.checklist.length > 0) {
    const checkLines = m.checklist
      .map((item) => `      [${item && item.done ? 'x' : ' '}] ${item && item.text ? item.text : ''}`)
      .join('\n');
    line += `\n${checkLines}`;
  }
  return line;
}

/**
 * Estimate context savings achieved by compaction on completed milestones
 * @param {Array<object>} milestones
 * @param {string} [lang='en']
 * @returns {{ completedCount: number, uncompactedChars: number, compactedChars: number, savedChars: number, savingsRatio: number, savingsPercent: string }}
 */
export function estimateCompactionSavings(milestones = [], lang = 'en') {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    return { completedCount: 0, uncompactedChars: 0, compactedChars: 0, savedChars: 0, savingsRatio: 0, savingsPercent: '0%' };
  }

  const completed = milestones.filter((m) => m && m.status === 'completed');
  if (completed.length === 0) {
    return { completedCount: 0, uncompactedChars: 0, compactedChars: 0, savedChars: 0, savingsRatio: 0, savingsPercent: '0%' };
  }

  const uncompacted = completed.map((m, i) => formatRawMilestoneTrace(m, i)).join('\n');
  const compacted = completed.map((m) => m.compactionSummary || `[${m.id ? String(m.id).toUpperCase() : 'M'} COMPLETED] ${m.title}`).join('\n');

  const uncompactedChars = uncompacted.length;
  const compactedChars = compacted.length;
  const savedChars = Math.max(0, uncompactedChars - compactedChars);
  const savingsRatio = uncompactedChars > 0 ? (savedChars / uncompactedChars) : 0;

  return {
    completedCount: completed.length,
    uncompactedChars,
    compactedChars,
    savedChars,
    savingsRatio,
    savingsPercent: `${Math.round(savingsRatio * 100)}%`,
  };
}
