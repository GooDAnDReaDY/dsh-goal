import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { generateRetrospectiveData } from './engine-retrospective.js';

/**
 * Safely get current short git commit hash
 * @param {string} [cwd]
 * @returns {string|null}
 */
export function getGitCurrentCommit(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
      cwd: cwd || undefined,
    }).trim();
  } catch (err) {
    return null;
  }
}

/**
 * Format elapsed time in human readable format
 * @param {number} seconds
 * @returns {string}
 */
export function formatElapsedSeconds(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) return `${m}m ${remSec}s`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  return `${h}h ${remMin}m`;
}

/**
 * Generate Markdown report for goal completion or archival
 * @param {object} goal - core goal view or state
 * @param {object} [addonData] - { milestones, snapshots, tokensUsage }
 * @param {string} [cwd]
 * @returns {string}
 */
export function exportReportMarkdown(goal, addonData = {}, cwd = process.cwd()) {
  if (!goal) return '';
  const title = goal.objective || goal.title || 'Goal Report';
  const phase = goal.phase || goal.state || 'COMPLETED';
  const rounds = goal.roundsStarted || goal.iterationsCount || 0;
  const maxRounds = goal.maxGoalRounds || goal.maxIterations || 25;

  const elapsed = goal.formattedElapsed || formatElapsedSeconds(Math.max(0, Math.round(((goal.updatedAt || goal.completedAt || Date.now()) - (goal.createdAt || goal.startedAt || Date.now())) / 1000)));

  const totalTokens = addonData?.tokensUsage?.totalTokens || goal?.tokensUsage?.totalTokens || 0;
  const promptTokens = addonData?.tokensUsage?.promptTokens || goal?.tokensUsage?.promptTokens || 0;
  const compTokens = addonData?.tokensUsage?.completionTokens || goal?.tokensUsage?.completionTokens || 0;
  const gitCommit = goal.gitStartCommit ? ` | **Git Start:** \`${goal.gitStartCommit}\`` : '';

  let md = `# 🎯 Goal Report: ${title}\n\n`;
  md += `**Status:** \`${phase}\` | **Duration:** \`${elapsed}\` | **Iterations:** \`${rounds}/${maxRounds}\`${gitCommit}\n`;
  if (totalTokens > 0) {
    md += `**Tokens:** \`${totalTokens.toLocaleString('en-US')}\` (Prompt: \`${promptTokens.toLocaleString('en-US')}\`, Completion: \`${compTokens.toLocaleString('en-US')}\`)\n`;
  }
  md += '\n';

  if (goal.description) {
    md += `### Description\n${goal.description}\n\n`;
  }

  if (goal.resultSummary) {
    md += `### Summary & Deliverables\n${goal.resultSummary}\n\n`;
  }

  // Milestones & Checklists
  const milestones = addonData?.milestones || goal?.milestones || [];
  if (milestones.length > 0) {
    md += `### Milestones & Checklists\n`;
    md += `| # | Status | Title | Notes | Checklists |\n`;
    md += `|---|---|---|---|---|\n`;
    milestones.forEach((m, idx) => {
      const isDone = m.status === 'completed' || m.completed === true;
      const isInProg = m.status === 'in_progress';
      const mark = isDone ? '✅ Done' : isInProg ? '🔄 In Progress' : '⏳ Pending';
      const cleanTitle = (m.title || '').replace(/\|/g, '\\|');
      const cleanNotes = (m.notes || '—').replace(/\|/g, '\\|');
      let clSummary = '—';
      if (Array.isArray(m.checklist) && m.checklist.length > 0) {
        const doneCount = m.checklist.filter(c => c.done).length;
        clSummary = `${doneCount}/${m.checklist.length}`;
      }
      md += `| ${idx + 1} | ${mark} | ${cleanTitle} | ${cleanNotes} | ${clSummary} |\n`;
    });
    md += '\n';
  }

  // Snapshots
  const snapshots = addonData?.snapshots || [];
  if (snapshots.length > 0) {
    md += `### Git Checkpoints & Snapshots\n`;
    md += `| Milestone | Commit | Tag | Timestamp |\n`;
    md += `|---|---|---|---|\n`;
    snapshots.forEach((s) => {
      const dt = new Date(s.timestamp || Date.now()).toISOString();
      md += `| \`${s.milestoneId}\` | \`${s.commit}\` | \`${s.tag || '—'}\` | ${dt} |\n`;
    });
    md += '\n';
  }

  // Retrospective
  try {
    const retro = generateRetrospectiveData({
      ...goal,
      milestones,
      tokensUsage: { totalTokens, promptTokens, completionTokens },
      startedAt: goal.createdAt || goal.startedAt || Date.now(),
      completedAt: goal.updatedAt || goal.completedAt || Date.now(),
    }, cwd);
    if (retro) {
      md += `### Retrospective & Execution Analytics\n`;
      if (retro.estimatedCostUsd) {
        md += `- **Estimated Cost:** ~\$${retro.estimatedCostUsd} USD\n`;
      }
      if (retro.filesChangedCount !== undefined) {
        md += `- **Files Changed:** ${retro.filesChangedCount}\n`;
      }
      if (retro.recommendations?.length > 0) {
        md += `\n**Recommendations:**\n`;
        retro.recommendations.forEach(r => { md += `- ${r}\n`; });
      }
      md += '\n';
    }
  } catch (err) {
    // Retrospective non-fatal
  }

  md += `*Generated by DSH Goal Engine at ${new Date().toISOString()}*\n`;
  return md;
}

/**
 * Generate GitHub / Gitea PR comment report with collapsible details
 * @param {Object} state
 * @returns {string}
 */
export function exportReportGitHubPR(state) {
  if (!state) return '';
  const title = state.objective || state.title || 'Goal Report';
  const status = state.phase || state.state || 'COMPLETED';
  const elapsed = state.formattedElapsed || '0s';
  const iter = `${state.roundsStarted || state.iterationsCount || 0}/${state.maxGoalRounds || state.maxIterations || 25}`;
  const totalTokens = state.tokensUsage?.totalTokens || 0;
  const promptTokens = state.tokensUsage?.promptTokens || 0;
  const compTokens = state.tokensUsage?.completionTokens || 0;
  const gitCommit = state.gitStartCommit ? ` &nbsp;|&nbsp; **Git Start:** \`${state.gitStartCommit}\` 📌` : '';

  let md = `## 🎯 Autonomous Goal Resolution: ${title}\n\n`;
  md += `> **Status:** \`${status}\` 🚀 &nbsp;|&nbsp; **Duration:** \`${elapsed}\` ⏱️ &nbsp;|&nbsp; **Iterations:** \`${iter}\` 🔄${gitCommit}\n\n`;

  if (totalTokens > 0) {
    md += `### 📊 Telemetry & Token Usage\n`;
    md += `- **Total Tokens:** \`${totalTokens.toLocaleString('en-US')}\` (Prompt: \`${promptTokens.toLocaleString('en-US')}\`, Completion: \`${compTokens.toLocaleString('en-US')}\`)\n\n`;
  }

  if (state.resultSummary) {
    md += `### 📦 Deliverables & Achievements\n${state.resultSummary}\n\n`;
  } else if (state.description) {
    md += `### 📝 Objective\n${state.description}\n\n`;
  }

  const milestones = state.milestones || [];
  if (milestones.length > 0) {
    const completedCount = milestones.filter((m) => m.status === 'completed' || m.completed === true).length;
    md += `<details>\n<summary><b>📋 Milestones Breakdown (${completedCount}/${milestones.length} Completed)</b></summary>\n\n`;
    md += `| # | Status | Milestone | Notes |\n|---|---|---|---|\n`;
    milestones.forEach((m, idx) => {
      const mark = (m.status === 'completed' || m.completed === true) ? '✅ Done' : m.status === 'in_progress' ? '🔄 In Progress' : '⏳ Pending';
      const cleanTitle = (m.title || '').replace(/\|/g, '\\|');
      const cleanNotes = (m.notes || '').replace(/\|/g, '\\|');
      md += `| ${idx + 1} | ${mark} | ${cleanTitle} | ${cleanNotes || '—'} |\n`;
    });
    md += `\n</details>\n\n`;
  }

  md += `*Automated by [@goodandready/dsh-goal](https://github.com/GooDAnDReaDY/dsh-goal)*\n`;
  return md;
}

/**
 * Safely create a git milestone checkpoint
 * @param {object} milestone
 * @param {string} sessionId
 * @param {string} [cwd]
 * @returns {string|null} commit hash or tag name
 */
export function createMilestoneCheckpoint(milestone, sessionId = 'default', cwd) {
  if (!milestone || !milestone.id) return null;
  try {
    const status = execFileSync('git', ['status', '--porcelain'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
      cwd: cwd || undefined,
    }).trim();

    if (status) {
      execFileSync('git', ['add', '-u'], {
        stdio: ['ignore', 'ignore', 'ignore'],
        timeout: 3000,
        cwd: cwd || undefined,
      });
      const cleanTitle = (milestone.title || '').replace(/[\"\`\$]/g, '');
      const msg = `checkpoint(goal): [${milestone.id}] ${cleanTitle}`;
      execFileSync('git', ['commit', '-m', msg], {
        stdio: ['ignore', 'ignore', 'ignore'],
        timeout: 5000,
        cwd: cwd || undefined,
      });
    }

    const hash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
      cwd: cwd || undefined,
    }).trim();

    return hash || null;
  } catch (err) {
    return null;
  }
}

/**
 * Rollback working tree to a specific commit checkpoint
 * @param {string} commitHash
 * @param {string} [cwd]
 * @returns {boolean}
 */
export function rollbackToCheckpoint(commitHash, cwd) {
  if (!commitHash || typeof commitHash !== 'string') return false;
  try {
    const cleanHash = commitHash.trim().replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanHash) return false;
    execFileSync('git', ['checkout', cleanHash, '--', '.'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 5000,
      cwd: cwd || undefined,
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Save full goal execution artifact markdown file into .dsh/goals/
 * @param {object} state
 * @param {string} [cwd]
 * @returns {{ relativePath: string, fullPath: string, content: string }|null}
 */
export function saveGoalArtifact(state, cwd) {
  if (!state || (!state.title && !state.objective)) return null;
  try {
    const root = cwd || process.cwd();
    const targetDir = path.join(root, '.dsh', 'goals');
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeTitle = (state.objective || state.title || 'goal')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'run';

    const filename = `${timestamp}-${safeTitle}.md`;
    const fullPath = path.join(targetDir, filename);
    const relativePath = path.join('.dsh', 'goals', filename).replace(/\\/g, '/');

    const content = exportReportMarkdown(state);
    fs.writeFileSync(fullPath, content, 'utf8');

    return { relativePath, fullPath, content };
  } catch (err) {
    return null;
  }
}

/**
 * Save goal report to disk
 */
export function saveGoalReportFile(goal, addonData = {}, baseDir = null) {
  const root = baseDir || process.cwd();
  return saveGoalArtifact(goal, root)?.fullPath || null;
}
