import fs from 'node:fs';
import path from 'node:path';

/**
 * Lightweight JSON persistence for dsh-goal addon metadata:
 * milestones, checklists, snapshots, and token budget metrics.
 */
export class AddonStore {
  constructor(storagePath, logger = console) {
    this.storagePath = storagePath || null;
    this.logger = logger;
    this.goals = new Map(); // goalId -> { milestones, snapshots, budget, issue }
    this.saveTimer = null;
    this.loadFromDisk();
  }

  setStoragePath(storagePath) {
    this.storagePath = storagePath || null;
    this.loadFromDisk();
  }

  getGoalData(goalId) {
    if (!goalId) return null;
    if (!this.goals.has(goalId)) {
      if (this.goals.size > 100) {
        for (const [k, v] of this.goals.entries()) {
          const isInactive = (!v.milestones || v.milestones.length === 0 || v.milestones.every(m => m.completed));
          if (isInactive) {
            this.goals.delete(k);
            if (this.goals.size <= 80) break;
          }
        }
      }
      this.goals.set(goalId, {
        milestones: [],
        snapshots: [],
        budget: { maxTokenBudget: 0, warnedAt: null, blockedAt: null },
        issue: null,
      });
    }
    return this.goals.get(goalId);
  }

  removeGoalData(goalId) {
    if (!goalId) return false;
    const deleted = this.goals.delete(goalId);
    if (deleted) this.scheduleSave();
    return deleted;
  }

  getMilestones(goalId) {
    const data = this.getGoalData(goalId);
    return data ? data.milestones : [];
  }

  setMilestones(goalId, milestones) {
    const data = this.getGoalData(goalId);
    if (!data) return;
    data.milestones = Array.isArray(milestones) ? milestones : [];
    this.scheduleSave();
  }

  getSnapshots(goalId) {
    const data = this.getGoalData(goalId);
    return data ? data.snapshots : [];
  }

  addSnapshot(goalId, snapshot) {
    const data = this.getGoalData(goalId);
    if (!data) return;
    if (!Array.isArray(data.snapshots)) data.snapshots = [];
    data.snapshots.push(snapshot);
    this.scheduleSave();
  }

  getBudget(goalId) {
    const data = this.getGoalData(goalId);
    return data ? data.budget : null;
  }

  setBudget(goalId, budget) {
    const data = this.getGoalData(goalId);
    if (!data) return;
    data.budget = { ...(data.budget || {}), ...budget };
    this.scheduleSave();
  }

  loadFromDisk() {
    if (!this.storagePath) return;
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.goals) {
          for (const [gid, val] of Object.entries(parsed.goals)) {
            this.goals.set(gid, {
              milestones: Array.isArray(val.milestones) ? val.milestones : [],
              snapshots: Array.isArray(val.snapshots) ? val.snapshots : [],
              budget: val.budget || { maxTokenBudget: 0, warnedAt: null, blockedAt: null },
              issue: val.issue || null,
            });
          }
        }
      }
    } catch (err) {
      this.logger.warn?.('[AddonStore] Failed to load addon state from disk:', err?.message || err);
    }
  }

  scheduleSave(immediate = false) {
    if (!this.storagePath) return;
    if (immediate) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      this.writeToDiskSync();
      return;
    }
    if (!this.saveTimer) {
      const timer = setTimeout(() => {
        this.saveTimer = null;
        this.writeToDiskSync();
      }, 200);
      if (typeof timer?.unref === 'function') {
        timer.unref();
      }
      this.saveTimer = timer;
    }
  }

  writeToDiskSync() {
    if (!this.storagePath) return;
    try {
      const goalsObj = {};
      for (const [gid, val] of this.goals.entries()) {
        goalsObj[gid] = val;
      }
      const payload = {
        version: 3,
        goals: goalsObj,
        updatedAt: Date.now(),
      };
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmp = `${this.storagePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (err) {
      this.logger.warn?.('[AddonStore] Failed to write addon state to disk:', err?.message || err);
    }
  }

  /**
   * Migrate legacy state from dsh-goal-state.json to addon format and core GoalService
   */
  migrateLegacyState(legacyPath, coreGoals, agent) {
    if (!legacyPath || !fs.existsSync(legacyPath)) return false;
    try {
      const raw = fs.readFileSync(legacyPath, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || data._migratedToAddon) return false;

      let migratedAny = false;
      const candidates = [];
      if (data.sessions && typeof data.sessions === 'object') {
        for (const [sid, goal] of Object.entries(data.sessions)) {
          if (goal?.title && goal?.hasActiveGoal) {
            candidates.push({ sessionId: sid, goal });
          }
        }
      } else if (data.title && data.hasActiveGoal) {
        candidates.push({ sessionId: 'default', goal: data });
      }

      for (const item of candidates) {
        const legacyGoal = item.goal;
        const goalId = legacyGoal.id || `legacy-${Date.now()}`;

        // Import milestones into addon store
        if (Array.isArray(legacyGoal.milestones) && legacyGoal.milestones.length > 0) {
          this.setMilestones(goalId, legacyGoal.milestones.map((m, idx) => ({
            id: m.id || `m-${idx + 1}`,
            title: m.title || `Milestone ${idx + 1}`,
            completed: m.status === 'completed',
            completedAt: m.completedAt || null,
            notes: m.notes || '',
            dependsOn: Array.isArray(m.dependsOn) ? m.dependsOn : [],
            checklist: Array.isArray(m.checklist) ? m.checklist : [],
          })));
        }

        // If coreGoals is available and agent session is active, bridge to core
        if (coreGoals && agent && typeof coreGoals.create === 'function') {
          try {
            const current = coreGoals.get ? coreGoals.get(agent) : null;
            if (!current) {
              coreGoals.create(agent, {
                objective: legacyGoal.title,
                maxGoalRounds: legacyGoal.maxIterations || 25,
              });
            }
          } catch (e) {
            this.logger.warn?.('[AddonStore] Migration: could not create goal in core:', e.message);
          }
        }
        migratedAny = true;
      }

      if (migratedAny) {
        data._migratedToAddon = true;
        data._migratedAt = Date.now();
        fs.writeFileSync(legacyPath, JSON.stringify(data, null, 2), 'utf8');
        this.scheduleSave(true);
      }
      return migratedAny;
    } catch (err) {
      this.logger.warn?.('[AddonStore] Legacy migration failed:', err.message);
      return false;
    }
  }

  flushSync() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.writeToDiskSync();
  }
}
