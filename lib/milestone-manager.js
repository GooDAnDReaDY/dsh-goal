import { syncMilestoneWithIssue } from './engine-issue-sync.js';

/**
 * Milestone and checklist coordinator for active core goals
 */
export class MilestoneManager {
  constructor(addonStore, { gitSnapshotManager = null, enforceDependencies = true, logger = console } = {}) {
    this.store = addonStore;
    this.gitSnapshotManager = gitSnapshotManager;
    this.enforceDependencies = enforceDependencies;
    this.logger = logger;
  }

  getMilestones(goalId) {
    if (!goalId || !this.store) return [];
    return this.store.getMilestones(goalId);
  }

  setMilestones(goalId, milestones) {
    if (!goalId || !this.store) return [];
    const sanitized = (milestones || []).map((m, idx) => ({
      id: m.id || `m-${idx + 1}`,
      title: m.title || `Milestone ${idx + 1}`,
      completed: Boolean(m.completed),
      completedAt: m.completedAt || null,
      notes: m.notes || '',
      dependsOn: Array.isArray(m.dependsOn) ? m.dependsOn : [],
      checklist: Array.isArray(m.checklist) ? m.checklist.map((c, cIdx) => ({
        id: c.id || `cl-${idx + 1}-${cIdx + 1}`,
        text: typeof c === 'string' ? c : (c.text || ''),
        done: Boolean(c.done),
      })) : [],
    }));
    this.store.setMilestones(goalId, sanitized);
    return sanitized;
  }

  addMilestone(goalId, { title, checklist = [], dependsOn = [] }) {
    if (!goalId || !this.store) throw new Error('Missing goalId or store');
    const list = this.getMilestones(goalId);
    const id = `m-${list.length + 1}`;
    const newM = {
      id,
      title: title || `Milestone ${list.length + 1}`,
      completed: false,
      completedAt: null,
      notes: '',
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      checklist: (checklist || []).map((c, cIdx) => ({
        id: `cl-${list.length + 1}-${cIdx + 1}`,
        text: typeof c === 'string' ? c : (c.text || ''),
        done: Boolean(c.done),
      })),
    };
    list.push(newM);
    this.store.setMilestones(goalId, list);
    return newM;
  }

  completeMilestone(goalId, milestoneId, notes = '', workspaceRoot = null) {
    if (!goalId || !milestoneId) throw new Error('goalId and milestoneId are required');
    const list = this.getMilestones(goalId);
    const m = list.find(item => item.id === milestoneId);
    if (!m) throw new Error(`Milestone "${milestoneId}" not found in goal "${goalId}"`);

    // Dependency check
    if (this.enforceDependencies && Array.isArray(m.dependsOn) && m.dependsOn.length > 0) {
      const incomplete = m.dependsOn.filter(depId => {
        const dep = list.find(x => x.id === depId);
        return !dep || !dep.completed;
      });
      if (incomplete.length > 0) {
        throw new Error(`Cannot complete milestone "${milestoneId}": prerequisites [${incomplete.join(', ')}] not completed`);
      }
    }

    m.completed = true;
    m.completedAt = Date.now();
    if (notes) m.notes = notes;
    if (Array.isArray(m.checklist)) {
      m.checklist.forEach(item => { item.done = true; });
    }

    this.store.setMilestones(goalId, list);

    // Git snapshot if configured
    let snapshot = null;
    if (this.gitSnapshotManager && workspaceRoot) {
      try {
        snapshot = this.gitSnapshotManager.createSnapshot(goalId, milestoneId, workspaceRoot, notes);
      } catch (err) {
        this.logger.warn?.('[MilestoneManager] Git snapshot failed:', err.message);
      }
    }

    // Best-effort Gitea issue checklist sync if issue data exists
    const goalData = this.store.getGoalData(goalId);
    if (goalData?.issue?.number) {
      try {
        syncMilestoneWithIssue(goalData.issue.number, m.title, true);
      } catch (e) {
        // sync error non-fatal
      }
    }

    return { milestone: m, snapshot };
  }

  toggleChecklist(goalId, milestoneId, index, done) {
    if (!goalId || !milestoneId) throw new Error('goalId and milestoneId are required');
    const list = this.getMilestones(goalId);
    const m = list.find(item => item.id === milestoneId);
    if (!m) throw new Error(`Milestone "${milestoneId}" not found in goal "${goalId}"`);
    if (!m.checklist || index < 0 || index >= m.checklist.length) {
      throw new Error(`Checklist item index ${index} out of bounds`);
    }

    m.checklist[index].done = typeof done === 'boolean' ? done : !m.checklist[index].done;
    this.store.setMilestones(goalId, list);
    return m.checklist[index];
  }

  getActiveMilestonePrompt(goalId) {
    if (!goalId) return null;
    const list = this.getMilestones(goalId);
    if (list.length === 0) return null;

    const active = list.find(m => !m.completed);
    if (!active) {
      return '[Goal Milestones]: All defined milestones are completed ✅';
    }

    const uncompletedChecklist = (active.checklist || []).filter(c => !c.done);
    let clText = '';
    if (active.checklist?.length > 0) {
      clText = ` | Next items: ${active.checklist.map(c => `[${c.done ? 'x' : ' '}] ${c.text}`).join(', ')}`;
    }

    return `[Goal Milestones]: Current step: "${active.title}"${clText}`;
  }
}
