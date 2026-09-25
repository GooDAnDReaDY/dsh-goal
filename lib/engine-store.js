import fs from 'node:fs';
import path from 'node:path';
import { GoalState } from './goal-engine-constants.js';

/**
 * Storage manager for goal engine disk state persistence
 */
export class EngineStore {
  constructor(engine, storagePath, logger) {
    this.engine = engine;
    this.storagePath = storagePath || null;
    this.logger = logger || engine?.logger || console;
    this.saveTimer = null;
  }

  setStoragePath(storagePath) {
    this.storagePath = storagePath || null;
  }

  loadStateFromDisk() {
    if (!this.storagePath) return;
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          let dirty = false;
          if (data.sessions && typeof data.sessions === 'object') {
            for (const [sid, goal] of Object.entries(data.sessions)) {
              if (goal && goal.id && goal.title) {
                // Crash Hydration: transition leftover RUNNING goals to PAUSED
                if (goal.state === GoalState.RUNNING) {
                  goal.state = GoalState.PAUSED;
                  goal.pausedAt = Date.now();
                  if (!Array.isArray(goal.logs)) goal.logs = [];
                  goal.logs.push({
                    timestamp: Date.now(),
                    type: 'warning',
                    message: 'Harness was restarted — click ▶️ to resume',
                  });
                  if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
                  dirty = true;
                }
                if (!goal.tokensUsage) {
                  goal.tokensUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
                }
                if (!goal.lang) {
                  goal.lang = 'en';
                }
                this.engine.goals.set(sid, goal);
              }
            }
          } else if (data.id && data.title) {
            if (data.state === GoalState.RUNNING) {
              data.state = GoalState.PAUSED;
              data.pausedAt = Date.now();
              if (!Array.isArray(data.logs)) data.logs = [];
              data.logs.push({
                timestamp: Date.now(),
                type: 'warning',
                message: 'Harness was restarted — click ▶️ to resume',
              });
              if (data.logs.length > 100) data.logs = data.logs.slice(-100);
              dirty = true;
            }
            if (!data.tokensUsage) {
              data.tokensUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
            }
            if (!data.lang) {
              data.lang = 'en';
            }
            this.engine.goals.set('default', data);
          }
          if (dirty) {
            this.scheduleSave(true);
          }
        }
      }
    } catch (err) {
      // best-effort load failure logged defensively
      this.logger?.warn?.('[GoalEngine] Failed to load state from disk:', err?.message || err);
    }
  }

  scheduleSave(immediate = false) {
    if (!this.storagePath) return;
    if (immediate) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      this.writeStateToDiskSync();
      return;
    }
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.writeStateToDiskSync();
      }, 250);
      if (typeof this.saveTimer.unref === 'function') {
        this.saveTimer.unref();
      }
    }
  }

  writeStateToDiskSync() {
    if (!this.storagePath) return;
    try {
      if (this.engine.goals.size === 0) {
        if (fs.existsSync(this.storagePath)) {
          fs.unlinkSync(this.storagePath);
        }
        return;
      }
      const sessionsObj = {};
      for (const [sid, goal] of this.engine.goals.entries()) {
        sessionsObj[sid] = goal;
      }
      const payload = {
        version: 2,
        sessions: sessionsObj,
        ...(this.engine.goals.has('default') ? this.engine.goals.get('default') : {}),
      };
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmp = `${this.storagePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (err) {
      this.logger?.warn?.('[GoalEngine] Failed to write state to disk:', err?.message || err);
    }
  }

  flushSync() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.writeStateToDiskSync();
  }
}
