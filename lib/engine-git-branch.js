import { execFileSync } from 'node:child_process';

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
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd,
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
  if (!branchName) return false;
  try {
    execFileSync('git', ['checkout', '-b', branchName], {
      cwd,
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
  if (!branchName) return false;
  try {
    execFileSync('git', ['checkout', targetBranch], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    execFileSync('git', ['merge', '--no-ff', '-m', `chore(goal): merge ${branchName}`, branchName], {
      cwd,
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
  if (!branchName) return false;
  try {
    execFileSync('git', ['checkout', targetBranch], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    execFileSync('git', ['branch', '-D', branchName], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (err) {
    return false;
  }
}
