import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Parse issue identifier from goal title or string
 * @param {string} input 
 * @returns {object|null} { issueNumber, issueUrl }
 */
export function parseIssueRef(input) {
  if (!input || typeof input !== 'string') return null;
  const urlMatch = input.match(/https?:\/\/[^\s]+\/issues\/(\d+)/i);
  if (urlMatch) {
    return { issueNumber: parseInt(urlMatch[1], 10), issueUrl: urlMatch[0] };
  }
  const numMatch = input.match(/(?:issue:?|#)(\d+)\b/i);
  if (numMatch) {
    return { issueNumber: parseInt(numMatch[1], 10), issueUrl: null };
  }
  return null;
}

/**
 * Parse checklist items from markdown text
 * @param {string} markdown 
 * @returns {Array<{ text: string, done: boolean, raw: string }>}
 */
export function parseIssueChecklist(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];
  const items = [];
  const lines = markdown.split('\n');
  const regex = /^\s*-\s*\[([ xX])\]\s*(.+)$/;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      items.push({
        done: match[1].toLowerCase() === 'x',
        text: match[2].trim(),
        raw: line,
      });
    }
  }
  return items;
}

/**
 * Update checklist item status in markdown text
 * @param {string} markdown 
 * @param {string} itemText 
 * @param {boolean} done 
 * @returns {string} updated markdown
 */
export function updateChecklistInMarkdown(markdown, itemText, done) {
  if (!markdown || typeof markdown !== 'string') return markdown || '';
  if (!itemText) return markdown;

  const targetClean = itemText.trim().toLowerCase();
  const lines = markdown.split('\n');
  const regex = /^(\s*-\s*\[)([ xX])(\]\s*)(.+)$/;

  return lines.map((line) => {
    const match = line.match(regex);
    if (match && match[4].trim().toLowerCase() === targetClean) {
      const checkChar = done ? 'x' : ' ';
      return `${match[1]}${checkChar}${match[3]}${match[4]}`;
    }
    return line;
  }).join('\n');
}

/**
 * Resolve Gitea API credentials from options, environment, or agent config
 * @param {object} [options]
 * @returns {{ token?: string, baseUrl: string }}
 */
export function resolveGiteaAuth(options = {}) {
  const defaultUrl = options.baseUrl || process.env.GITEA_BASE_URL || 'http://127.0.0.1:3005';
  if (options.token) {
    return { token: options.token, baseUrl: defaultUrl };
  }
  if (process.env.GITEA_TOKEN) {
    return { token: process.env.GITEA_TOKEN, baseUrl: defaultUrl };
  }

  const credPath = process.env.DSH_GITEA_CREDENTIALS || '/mnt/external/Project/DEV/.gitea-agent-credentials.json';
  try {
    if (fs.existsSync(credPath)) {
      const raw = fs.readFileSync(credPath, 'utf8');
      const creds = JSON.parse(raw);
      const agent = creds?.agents?.['deepseek-harness'] || creds?.agents?.antigravity;
      if (agent?.token) {
        return {
          token: agent.token,
          baseUrl: options.baseUrl || agent.http_remote_base || defaultUrl,
        };
      }
    }
  } catch (err) {
    // Non-fatal credential read error
  }
  return { baseUrl: defaultUrl };
}

/**
 * Resolve repository owner and repo name from git remote or options
 * @param {string} [cwd]
 * @param {object} [options]
 * @returns {{ owner: string, repo: string }}
 */
export function resolveRepoInfo(cwd = process.cwd(), options = {}) {
  if (options.owner && options.repo) {
    return { owner: options.owner, repo: options.repo };
  }
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const match = remote.match(/(?:[:/])([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }
  } catch (err) {
    // Fallback to default repository
  }
  return { owner: 'goodandready', repo: 'dsh-goal' };
}

/**
 * Actively sync completed milestone checklist item with Gitea issue
 * @param {object} goal
 * @param {object} milestone
 * @param {object} [options]
 * @returns {Promise<{ synced: boolean, updated?: boolean, issueNumber?: number, error?: string }>}
 */
export async function syncMilestoneWithIssue(goal, milestone, options = {}) {
  if (!goal?.issueRef?.issueNumber || !milestone?.title) {
    return { synced: false, error: 'No issue reference or milestone title' };
  }

  const auth = resolveGiteaAuth(options);
  if (!auth.token) {
    return { synced: false, error: 'No Gitea API token available' };
  }

  const repoInfo = resolveRepoInfo(goal.cwd || process.cwd(), options);
  const issueNum = goal.issueRef.issueNumber;
  const issueApiUrl = `${auth.baseUrl}/api/v1/repos/${repoInfo.owner}/${repoInfo.repo}/issues/${issueNum}`;

  try {
    const fetchFn = options.fetch || globalThis.fetch;
    if (typeof fetchFn !== 'function') {
      return { synced: false, error: 'Fetch API unavailable' };
    }

    const getRes = await fetchFn(issueApiUrl, {
      headers: {
        'Authorization': `token ${auth.token}`,
        'Accept': 'application/json',
      },
    });

    if (!getRes.ok) {
      return { synced: false, error: `HTTP ${getRes.status} fetching issue #${issueNum}` };
    }

    const issueData = await getRes.json();
    const currentBody = issueData.body || '';
    const updatedBody = updateChecklistInMarkdown(currentBody, milestone.title, true);

    if (updatedBody === currentBody) {
      return { synced: true, updated: false, issueNumber: issueNum };
    }

    const patchRes = await fetchFn(issueApiUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${auth.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ body: updatedBody }),
    });

    if (!patchRes.ok) {
      return { synced: false, error: `HTTP ${patchRes.status} updating issue #${issueNum}` };
    }

    return { synced: true, updated: true, issueNumber: issueNum };
  } catch (err) {
    return { synced: false, error: err.message };
  }
}
