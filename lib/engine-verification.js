import { spawnSync } from 'node:child_process';
import { getSafeCwd } from './goal-engine-constants.js';

/**
 * Execute a verification command in a confined working directory with timeout and output capture
 * @param {string} command Shell command to execute
 * @param {string} [targetCwd] Working directory
 * @param {object} [options]
 * @param {number} [options.timeoutMs=30000] Timeout in milliseconds
 * @param {number} [options.maxBuffer=1048576] Max stdout/stderr buffer in bytes (1MB)
 * @param {object} [options.env={}] Additional environment variables
 * @returns {{ ok: boolean, exitCode: number, stdout: string, stderr: string, error?: string }}
 */
export function runMilestoneVerification(command, targetCwd, options = {}) {
  if (!command || typeof command !== 'string' || !command.trim()) {
    return {
      ok: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'Empty or invalid verification command',
    };
  }

  const safeCwd = getSafeCwd(targetCwd) || process.cwd();
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
  const maxBuffer = typeof options.maxBuffer === 'number' ? options.maxBuffer : 1024 * 1024;

  try {
    const res = spawnSync(command.trim(), {
      shell: true,
      cwd: safeCwd,
      timeout: timeoutMs,
      maxBuffer,
      encoding: 'utf8',
      env: { ...process.env, ...options.env },
    });

    if (res.error) {
      if (res.error.code === 'ETIMEDOUT') {
        return {
          ok: false,
          exitCode: 124,
          stdout: res.stdout || '',
          stderr: res.stderr || '',
          error: `Verification command timed out after ${timeoutMs}ms`,
        };
      }
      return {
        ok: false,
        exitCode: res.status ?? 1,
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        error: res.error.message || 'Verification command failed to execute',
      };
    }

    if (res.status !== 0) {
      const output = (res.stderr || res.stdout || '').trim();
      return {
        ok: false,
        exitCode: res.status ?? 1,
        stdout: res.stdout || '',
        stderr: res.stderr || '',
        error: `Verification command failed with exit code ${res.status}${output ? ': ' + output.slice(0, 500) : ''}`,
      };
    }

    return {
      ok: true,
      exitCode: 0,
      stdout: res.stdout || '',
      stderr: res.stderr || '',
    };
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: err?.message || 'Unexpected verification failure',
    };
  }
}

/**
 * Run acceptance gate check on a milestone target and record diagnostic logs/activities
 * @param {object} target Milestone object
 * @param {string} targetCwd Working directory
 * @param {object} [goal] Goal engine state
 * @param {Function} [recordActivity] Activity recorder function
 * @param {object} [options]
 * @returns {{ ok: boolean, verified: boolean, error?: string, output?: string, passedAt?: number }}
 */
export function verifyMilestoneAcceptance(target, targetCwd, goal = null, recordActivity = null, options = {}) {
  if (!target || !target.verificationCommand) {
    return { ok: true, verified: false };
  }

  const vRes = runMilestoneVerification(target.verificationCommand, targetCwd, options);
  if (!vRes.ok) {
    target.verificationError = vRes.error;
    target.verificationOutput = (vRes.stderr || vRes.stdout || '').trim();
    if (goal) {
      if (typeof recordActivity === 'function') {
        recordActivity(goal, {
          type: 'milestone',
          tool: 'updateMilestone',
          status: 'error',
          details: `Verification failed: ${vRes.error}`,
        });
      }
      if (Array.isArray(goal.logs)) {
        goal.logs.push({
          timestamp: Date.now(),
          type: 'error',
          message: `Acceptance gate failed for [${target.title}]: ${vRes.error}`,
        });
        if (goal.logs.length > 100) goal.logs = goal.logs.slice(-100);
      }
    }
    return { ok: false, verified: true, error: vRes.error, output: target.verificationOutput };
  }

  target.verificationError = null;
  target.verificationOutput = null;
  target.verificationPassedAt = Date.now();
  return { ok: true, verified: true, passedAt: target.verificationPassedAt };
}
