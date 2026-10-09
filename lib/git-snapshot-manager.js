import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Git snapshot and checkpoint manager for goal milestones
 */
export class GitSnapshotManager {
  constructor(addonStore, { logger = console } = {}) {
    this.store = addonStore;
    this.logger = logger;
  }

  isGitRepository(workspaceRoot) {
    if (!workspaceRoot || typeof workspaceRoot !== 'string') return false;
    try {
      if (!fs.existsSync(workspaceRoot)) return false;
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: workspaceRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2000,
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  createSnapshot(goalId, milestoneId, workspaceRoot, message = '') {
    if (!goalId || !milestoneId || !this.isGitRepository(workspaceRoot)) {
      return null;
    }

    try {
      const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2000,
      }).trim();

      const safeGoalId = String(goalId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeMilestoneId = String(milestoneId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const tagName = `dsh-goal-snapshot/${safeGoalId}/${safeMilestoneId}-${commit}`;

      try {
        execFileSync('git', ['tag', '-f', tagName, 'HEAD'], {
          cwd: workspaceRoot,
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 2000,
        });
      } catch (tagErr) {
        // Tag creation non-fatal
      }

      const snapshot = {
        goalId,
        milestoneId,
        commit,
        tag: tagName,
        timestamp: Date.now(),
        message: message || `Milestone ${milestoneId} checkpoint`,
      };

      if (this.store) {
        this.store.addSnapshot(goalId, snapshot);
      }
      this.logger.info?.(`[GitSnapshotManager] Created snapshot for milestone "${milestoneId}" at commit ${commit}`);
      return snapshot;
    } catch (err) {
      this.logger.warn?.(`[GitSnapshotManager] Failed to create git snapshot: ${err.message}`);
      return null;
    }
  }

  rollback(goalId, milestoneId, workspaceRoot) {
    if (!this.isGitRepository(workspaceRoot)) {
      throw new Error(`Workspace "${workspaceRoot}" is not a valid git repository`);
    }

    const snapshots = this.store ? this.store.getSnapshots(goalId) : [];
    const target = snapshots.find(s => s.milestoneId === milestoneId);
    if (!target || !target.commit) {
      throw new Error(`Snapshot for milestone "${milestoneId}" not found in goal "${goalId}"`);
    }

    try {
      execFileSync('git', ['checkout', target.commit], {
        cwd: workspaceRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
      });
      this.logger.info?.(`[GitSnapshotManager] Rolled back workspace to commit ${target.commit}`);
      return { success: true, commit: target.commit, milestoneId };
    } catch (err) {
      throw new Error(`Git rollback to commit ${target.commit} failed: ${err.message}`);
    }
  }
}
