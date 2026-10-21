import { execFileSync } from 'node:child_process';
import { getSafeCwd } from './goal-engine-constants.js';
import { isGitRepository, isValidGitRef } from './engine-git-branch.js';

/**
 * Parse git diff --numstat output into structured file statistics
 * @param {string} output 
 * @returns {Array<{ path: string, insertions: number, deletions: number, binary: boolean }>}
 */
export function parseNumstat(output) {
  if (!output || typeof output !== 'string') return [];
  const lines = output.trim().split('\n');
  const files = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [rawIns, rawDel, filePath] = parts;
    const isBinary = rawIns === '-' || rawDel === '-';
    const ins = isBinary ? 0 : parseInt(rawIns, 10) || 0;
    const del = isBinary ? 0 : parseInt(rawDel, 10) || 0;
    files.push({
      path: filePath,
      insertions: ins,
      deletions: del,
      binary: isBinary,
    });
  }
  return files;
}

/**
 * Get git diff between refs or current working tree
 * @param {object} options
 * @returns {object} diff result payload
 */
export function getGitDiff({
  cwd = process.cwd(),
  base,
  target,
  file,
  allowedRoots = [],
  maxBytes = 256 * 1024,
} = {}) {
  const safeCwd = getSafeCwd(cwd, allowedRoots);
  if (!safeCwd || !isGitRepository(safeCwd, allowedRoots)) {
    return { ok: false, error: 'Not a git repository or invalid path' };
  }

  // Ref validation: disallow flag injection and special chars
  if (base && !isValidGitRef(base)) {
    return { ok: false, error: 'Invalid base git ref' };
  }
  if (target && !isValidGitRef(target)) {
    return { ok: false, error: 'Invalid target git ref' };
  }
  if (file && (typeof file !== 'string' || file.startsWith('-') || /[\0\r\n]/.test(file))) {
    return { ok: false, error: 'Invalid file parameter' };
  }

  try {
    const rangeArgs = [];
    if (base && target) {
      rangeArgs.push(`${base}..${target}`);
    } else if (base) {
      rangeArgs.push(base);
    } else if (target) {
      rangeArgs.push(target);
    }

    // 1. Fetch numstat for file summary
    const numstatArgs = ['diff', '--numstat', ...rangeArgs];
    if (file) {
      numstatArgs.push('--', file);
    }
    const numstatOut = execFileSync('git', numstatArgs, {
      cwd: safeCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    });

    const files = parseNumstat(numstatOut);
    const stats = {
      filesChanged: files.length,
      insertions: files.reduce((acc, f) => acc + f.insertions, 0),
      deletions: files.reduce((acc, f) => acc + f.deletions, 0),
    };

    // 2. Fetch patch
    const patchArgs = ['diff', '-p', '--no-color', ...rangeArgs];
    if (file) {
      patchArgs.push('--', file);
    }
    let patchOut = execFileSync('git', patchArgs, {
      cwd: safeCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
    });

    let truncated = false;
    if (patchOut.length > maxBytes) {
      patchOut = patchOut.slice(0, maxBytes);
      truncated = true;
    }

    return {
      ok: true,
      cwd: safeCwd,
      base: base || null,
      target: target || 'HEAD',
      stats,
      files,
      diff: patchOut,
      truncated,
    };
  } catch (err) {
    return { ok: false, error: err.message || 'git diff execution failed' };
  }
}

/**
 * GoalEngine helper to fetch diff for active or specified session
 * @param {object} engine 
 * @param {string} sessionId 
 * @param {object} options 
 * @returns {object} diff result
 */
export function getEngineGoalDiff(engine, sessionId = 'default', options = {}) {
  const sid = sessionId || 'default';
  const goal = engine.goals?.get(sid);
  const allowedRoots = options.allowedRoots || engine.config?.allowedRoots || (goal?.cwd ? [goal.cwd, process.cwd()] : [process.cwd()]);
  const cwd = options.cwd || goal?.cwd || engine.config?.cwd || process.cwd();
  const base = options.base || goal?.gitStartCommit || null;
  const target = options.target || goal?.gitBranch || goal?.branchName || 'HEAD';

  return getGitDiff({
    cwd,
    base,
    target,
    file: options.file,
    allowedRoots,
    maxBytes: options.maxBytes,
  });
}
