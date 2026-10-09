import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { getSafeCwd } from './goal-engine-constants.js';

/**
 * Check if directory is inside a valid git repository
 * @param {string} workspaceRoot
 * @returns {boolean}
 */
export function isGitRepository(workspaceRoot) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') return false;
  try {
    const safePath = getSafeCwd(workspaceRoot);
    if (!fs.existsSync(safePath)) return false;
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: safePath,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Validate that a git ref name is safe to pass to git commands
 * Prevents flag injection (-*), path traversal, and illegal ref characters
 * @param {string} ref
 * @returns {boolean}
 */
export function isValidGitRef(ref) {
  if (!ref || typeof ref !== 'string') return false;
  const trimmed = ref.trim();
  if (!trimmed || trimmed.startsWith('-') || trimmed.endsWith('/') || trimmed.endsWith('.lock')) return false;
  // Disallow control characters, whitespace, and git-forbidden special characters
  if (/[\x00-\x20\x7f~^:?*\[\\ ]/.test(trimmed)) return false;
  // Disallow consecutive dots or slashes, and reflog syntax @{
  if (/\.\.|\/\/|@\{/.test(trimmed)) return false;
  // Must match valid git ref character set
  return /^[a-zA-Z0-9._/-]+$/.test(trimmed);
}

/**
 * Format a sanitized git branch name from goal title
 * @param {string} title 
 * @returns {string} branch name
 */
export function sanitizeBranchSlug(title) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const slug = String(title || 'task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'goal';
  return `goal/${dateStr}-${slug}`;
}

/**
 * Get current git branch
 * @param {string} cwd 
 * @returns {string} branch name or 'HEAD'
 */
export function getCurrentGitBranch(cwd = process.cwd()) {
  const safeCwd = getSafeCwd(cwd);
  if (!isGitRepository(safeCwd)) return 'main';
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: safeCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (err) {
    return 'main';
  }
}

/**
 * Create a dedicated git branch for a goal
 * @param {string} cwd 
 * @param {string} branchName 
 * @returns {boolean} success
 */
export function createGoalBranch(cwd = process.cwd(), branchName) {
  if (!isValidGitRef(branchName)) return false;
  const safeCwd = getSafeCwd(cwd);
  if (!isGitRepository(safeCwd)) return false;
  try {
    execFileSync('git', ['checkout', '-b', branchName], {
      cwd: safeCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Merge goal branch back into parent target branch
 * @param {string} cwd 
 * @param {string} branchName 
 * @param {string} targetBranch 
 * @returns {boolean} success
 */
export function mergeGoalBranch(cwd = process.cwd(), branchName, targetBranch = 'main') {
  if (!isValidGitRef(branchName) || !isValidGitRef(targetBranch)) return false;
  const safeCwd = getSafeCwd(cwd);
  if (!isGitRepository(safeCwd)) return false;
  try {
    execFileSync('git', ['checkout', '--', targetBranch], {
      cwd: safeCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    execFileSync('git', ['merge', '--no-ff', '-m', `chore(goal): merge ${branchName}`, '--', branchName], {
      cwd: safeCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Discard / delete a goal branch
 * @param {string} cwd 
 * @param {string} branchName 
 * @param {string} targetBranch 
 * @returns {boolean} success
 */
export function discardGoalBranch(cwd = process.cwd(), branchName, targetBranch = 'main') {
  if (!isValidGitRef(branchName) || !isValidGitRef(targetBranch)) return false;
  const safeCwd = getSafeCwd(cwd);
  if (!isGitRepository(safeCwd)) return false;
  try {
    execFileSync('git', ['checkout', '--', targetBranch], {
      cwd: safeCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    execFileSync('git', ['branch', '-D', '--', branchName], {
      cwd: safeCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (err) {
    return false;
  }
}
