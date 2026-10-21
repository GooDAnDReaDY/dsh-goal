import { spawnSync } from 'node:child_process';
import { getSafeCwd } from './goal-engine-constants.js';

export const SAFE_ENV_WHITELIST = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'SHELL',
  'TERM',
  'TMPDIR',
  'TMP',
  'TEMP',
  'NODE_ENV',
];

const FORBIDDEN_SECRET_REGEX = /(TOKEN|KEY|SECRET|AUTH|PASS|PASSWORD|CREDENTIAL|PRIVATE|BEARER|API)/i;

export const DISALLOWED_BINARIES = new Set([
  'curl', 'wget', 'nc', 'ncat', 'netcat', 'telnet',
  'ssh', 'scp', 'sftp', 'ftp', 'rsync',
  'rm', 'dd', 'mkfs', 'shutdown', 'reboot', 'killall', 'kill',
]);

export const SHELL_OPERATORS = new Set([';', '&&', '||', '|', '&', '>', '>>', '<', '`']);

/**
 * Sanitize environment for child verification processes, strictly stripping tokens and secrets
 * @param {object} [userEnv={}]
 * @returns {object}
 */
export function sanitizeVerificationEnv(userEnv = {}) {
  const clean = {};
  for (const key of SAFE_ENV_WHITELIST) {
    if (process.env[key] !== undefined && !FORBIDDEN_SECRET_REGEX.test(key)) {
      clean[key] = process.env[key];
    }
  }
  if (userEnv && typeof userEnv === 'object') {
    for (const [k, v] of Object.entries(userEnv)) {
      if (k && !FORBIDDEN_SECRET_REGEX.test(k) && v !== undefined && v !== null) {
        clean[k] = String(v);
      }
    }
  }
  if (!clean.NODE_ENV) {
    clean.NODE_ENV = 'test';
  }
  return clean;
}

/**
 * Parse a command string or array into an argv list
 * @param {string|string[]} commandStr
 * @returns {string[]}
 */
export function parseCommandArgv(commandStr) {
  if (Array.isArray(commandStr)) {
    return commandStr.map(String).filter((s) => s.trim().length > 0);
  }
  if (!commandStr || typeof commandStr !== 'string') return [];
  const trimmed = commandStr.trim();
  if (!trimmed) return [];

  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  const args = [];
  let match;
  while ((match = regex.exec(trimmed)) !== null) {
    if (match[1] !== undefined) {
      args.push(match[1].replace(/\\"/g, '"'));
    } else if (match[2] !== undefined) {
      args.push(match[2].replace(/\\'/g, "'"));
    } else if (match[3] !== undefined) {
      args.push(match[3]);
    }
  }
  return args;
}

/**
 * Validate a verification command for dangerous operators, shell chaining, or exfiltration binaries
 * @param {string|string[]} command
 * @returns {{ valid: boolean, error?: string, argv?: string[], binary?: string }}
 */
export function validateVerificationCommand(command) {
  if (!command) return { valid: false, error: 'Empty or invalid verification command' };
  const argv = parseCommandArgv(command);
  if (argv.length === 0) return { valid: false, error: 'Empty or invalid verification command' };

  const rawBinary = argv[0].toLowerCase().replace(/^.*[/\\]/, '');
  if (DISALLOWED_BINARIES.has(rawBinary)) {
    return { valid: false, error: `Execution blocked: disallowed command binary "${rawBinary}"` };
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (SHELL_OPERATORS.has(arg)) {
      return { valid: false, error: `Execution blocked: shell operator "${arg}" is not allowed` };
    }
    if (arg.startsWith('$(') || (arg.startsWith('`') && arg.endsWith('`'))) {
      return { valid: false, error: 'Execution blocked: subshell substitution is not allowed' };
    }
    if (i > 0 && DISALLOWED_BINARIES.has(arg.toLowerCase().replace(/^.*[/\\]/, ''))) {
      return { valid: false, error: `Execution blocked: disallowed binary "${arg}" in arguments` };
    }
  }

  return { valid: true, argv, binary: rawBinary };
}

/**
 * Execute a verification command in a confined working directory with timeout and output capture
 * Uses sanitized environment (no secrets/tokens) and shell: false (no shell injection)
 * @param {string|string[]} command Command to execute
 * @param {string} [targetCwd] Working directory
 * @param {object} [options]
 * @param {number} [options.timeoutMs=30000] Timeout in milliseconds
 * @param {number} [options.maxBuffer=1048576] Max stdout/stderr buffer in bytes (1MB)
 * @param {object} [options.env={}] Additional environment variables (sanitized)
 * @param {Function} [options.checkApproval] Custom approval check function
 * @param {object} [options.approvalGate] ApprovalGate service instance
 * @returns {{ ok: boolean, exitCode: number, stdout: string, stderr: string, error?: string }}
 */
export function runMilestoneVerification(command, targetCwd, options = {}) {
  const validation = validateVerificationCommand(command);
  if (!validation.valid) {
    return {
      ok: false,
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: validation.error || 'Empty or invalid verification command',
    };
  }

  const safeCwd = getSafeCwd(targetCwd) || process.cwd();
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
  const maxBuffer = typeof options.maxBuffer === 'number' ? options.maxBuffer : 1024 * 1024;
  const { argv, binary } = validation;

  // 1. Approval seam check
  if (typeof options.checkApproval === 'function') {
    const decision = options.checkApproval({
      command,
      argv,
      binary,
      cwd: safeCwd,
    });
    if (decision && (decision.kind === 'deny' || decision.deny)) {
      return {
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        error: `Verification command denied by policy: ${decision.reason || 'denied'}`,
      };
    }
    if (decision && (decision.kind === 'ask' || decision.ask)) {
      return {
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        error: `Verification command requires operator approval: ${decision.reason || 'approval required'}`,
      };
    }
  }

  if (options.approvalGate && typeof options.approvalGate.checkCommand === 'function') {
    try {
      const decision = options.approvalGate.checkCommand(command, safeCwd);
      if (decision && (decision.verdict === 'deny' || decision.verdict === 'ask')) {
        return {
          ok: false,
          exitCode: 1,
          stdout: '',
          stderr: '',
          error: `Verification command blocked by approval gate: ${decision.reason || decision.verdict}`,
        };
      }
    } catch (err) {
      return {
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: '',
        error: `Approval check error: ${err?.message || err}`,
      };
    }
  }

  // 2. Environment sanitization (strictly scrub secrets and tokens)
  const cleanEnv = sanitizeVerificationEnv(options.env);

  // 3. Execution without shell (shell: false)
  try {
    const res = spawnSync(argv[0], argv.slice(1), {
      shell: false,
      cwd: safeCwd,
      timeout: timeoutMs,
      maxBuffer,
      encoding: 'utf8',
      env: cleanEnv,
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
