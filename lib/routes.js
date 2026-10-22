import fs from 'node:fs';
import path from 'node:path';
import { MilestoneStatus, GoalMode, detectLanguage, sessionIdOf, isPathInsideOrEqual, getSafeCwd } from './goal-engine-constants.js';
import { isValidGitRef } from './engine-git-branch.js';
import { saveGoalArtifact, rollbackToCheckpoint } from './engine-reports.js';
import { getTemplatesCatalogue, instantiateTemplate } from './engine-templates.js';
import { parseIssueChecklist } from './engine-issue-sync.js';
import { dispatchGoalTelegramNotification } from './engine-release-notes.js';

export function isLoopback(value) {
  if (!value) return false;
  let address = String(value).toLowerCase().replace(/^\[|\]$/g, '');
  if (address.includes(':')) {
    const colons = address.split(':').length - 1;
    if (colons === 1) address = address.split(':')[0];
  }
  address = address.replace(/^::ffff:/, '');
  return Boolean(
    address === 'localhost' ||
    address === 'localhost.' ||
    address === '::1' ||
    address.startsWith('127.')
  );
}

export function isTrustedHost(val) {
  if (!val || typeof val !== 'string') return false;
  let hostname = val.trim().toLowerCase();
  if (hostname.startsWith('[')) {
    const end = hostname.indexOf(']');
    if (end > 0) hostname = hostname.slice(1, end);
  } else if (hostname.includes(':')) {
    const colons = hostname.split(':').length - 1;
    if (colons === 1) hostname = hostname.split(':')[0];
  }
  const clean = hostname.replace(/^::ffff:/, '');
  if (clean === 'localhost' || clean === 'localhost.' || clean.endsWith('.local') || clean.endsWith('.lan')) return true;
  if (clean === '127.0.0.1' || clean === '::1' || clean.startsWith('127.')) return true;
  if (clean.startsWith('10.') || clean.startsWith('192.168.')) return true;
  const match172 = clean.match(/^172\.(\d+)\./);
  if (match172) {
    const octet = parseInt(match172[1], 10);
    if (octet >= 16 && octet <= 31) return true;
  }
  return false;
}

/**
 * Safely extract DSH connection service from Cordis Context if available (#172).
 * @param {any} ctx
 * @returns {any}
 */
export function getConnection(ctx) {
  if (!ctx) return undefined;
  try {
    const fromCtx = ctx?.reflect?.get
      ? (ctx.reflect.get('connection') || ctx?.connection)
      : (ctx?.get ? (ctx.get('connection') || ctx?.connection) : Reflect.get(ctx, 'connection'));
    if (fromCtx) return fromCtx;
    if (ctx?.root) {
      return getConnection(ctx.root);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function resolveAuthOptions(optionsOrToken, maybeCtx) {
  let authToken = process.env.DSH_GOAL_AUTH_TOKEN;
  let ctx = null;
  let connection = null;

  if (typeof optionsOrToken === 'string') {
    authToken = optionsOrToken;
    ctx = maybeCtx;
  } else if (optionsOrToken && typeof optionsOrToken === 'object') {
    if (optionsOrToken.authToken !== undefined) authToken = optionsOrToken.authToken;
    if (optionsOrToken.connection !== undefined) connection = optionsOrToken.connection;
    if (optionsOrToken.ctx !== undefined) {
      ctx = optionsOrToken.ctx;
    } else if (optionsOrToken.webServer || optionsOrToken.reflect || optionsOrToken.connectionService) {
      ctx = optionsOrToken;
    }
  }
  if (!connection && ctx) {
    connection = getConnection(ctx);
  }
  return { authToken, ctx, connection };
}

/**
 * Evaluates whether an incoming HTTP request is trusted and authenticated (#172).
 *
 * Requirements:
 * 1. Strict CSRF guard: rejects sec-fetch-site cross-site or same-site with 403.
 * 2. DNS rebinding & WAN protection: validates Host and remoteAddress against isTrustedHost.
 * 3. Origin & Referer headers must match Host and pass isTrustedHost.
 * 4. Explicit auth token: valid X-DSH-Auth-Token or Authorization: Bearer bypasses session check.
 * 5. Loopback callers (127.0.0.1, ::1) are admitted for local CLI, health checks, and monitoring.
 * 6. Remote LAN callers must be authenticated via DSH connection service (connection.requestRejection).
 *    If connection service is absent or returns a rejection code, caller is rejected (fail-closed, 401/403).
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {string|object} [optionsOrToken]
 * @param {any} [maybeCtx]
 * @returns {number|undefined} Rejection HTTP status code (401, 403) or undefined if admitted.
 */
export function getRequestRejection(req, optionsOrToken = process.env.DSH_GOAL_AUTH_TOKEN, maybeCtx = null) {
  if (!req || !req.headers) return 403;

  const { authToken, ctx, connection } = resolveAuthOptions(optionsOrToken, maybeCtx);

  // 1. Cross-site and same-site browser requests are rejected (CSRF guard)
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') return 403;

  // 2. Host header validation (DNS rebinding guard)
  const host = String(req.headers.host || '').trim().toLowerCase();
  if (host && !isTrustedHost(host)) return 403;

  // 3. Remote address validation if socket is present
  const rawRemote = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  const cleanRemote = String(rawRemote).trim().toLowerCase().replace(/^::ffff:/, '');
  if (cleanRemote && !isTrustedHost(cleanRemote)) return 403;

  // 4. Origin header validation if present
  const origin = req.headers.origin;
  if (origin !== undefined) {
    if (origin === 'null' || !origin) return 403;
    try {
      const u = new URL(origin);
      if (!isTrustedHost(u.hostname)) return 403;
      if (host && u.host.toLowerCase() !== host.toLowerCase()) return 403;
    } catch {
      return 403;
    }
  }

  // 5. Referer header validation if present
  const referer = req.headers.referer;
  if (referer !== undefined && referer) {
    try {
      const u = new URL(referer);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        if (!isTrustedHost(u.hostname)) return 403;
        if (host && u.host.toLowerCase() !== host.toLowerCase()) return 403;
      } else {
        const isLocal = isLoopback(cleanRemote) || (host ? isLoopback(host.split(':')[0]) : false);
        if (!isLocal) return 403;
      }
    } catch {
      return 403;
    }
  }

  // 6. Explicit auth token check (supports x-dsh-auth-token or Authorization: Bearer <token>)
  if (authToken) {
    const headerVal = req.headers['x-dsh-auth-token'] || req.headers.authorization;
    const cleanHeader = headerVal ? String(headerVal).replace(/^Bearer\s+/i, '').trim() : '';
    if (cleanHeader && cleanHeader === authToken) {
      return undefined;
    }
    if (cleanRemote && !isLoopback(cleanRemote)) {
      return 401;
    }
  }

  // 7. Verified loopback callers (local CLI, health checks, deploy.sh verify)
  if (isLoopback(cleanRemote)) {
    return undefined;
  }

  // Mock test requests without remoteAddress where host targets loopback
  if (!cleanRemote && host) {
    const hostName = host.split(':')[0];
    if (isLoopback(hostName)) {
      return undefined;
    }
  }

  // 8. Remote / LAN callers must be authenticated via DSH connection service (#172)
  const conn = connection || (ctx && getConnection(ctx)) || req.connectionService;
  if (conn && typeof conn.requestRejection === 'function') {
    let rejection;
    try {
      rejection = conn.requestRejection(req);
    } catch {
      return 403;
    }
    if (rejection !== undefined) {
      if (typeof rejection === 'number' && Number.isInteger(rejection) && rejection >= 400 && rejection < 600) {
        return rejection;
      }
      return rejection === 401 ? 401 : 403;
    }
    return undefined;
  }

  // 9. Fail-closed: Remote/LAN caller without connection service or valid token is rejected
  return 401;
}

export function isTrustedCaller(req, optionsOrToken = process.env.DSH_GOAL_AUTH_TOKEN, maybeCtx = null) {
  return getRequestRejection(req, optionsOrToken, maybeCtx) === undefined;
}

export { isPathInsideOrEqual, getSafeCwd };

/**
 * Register webServer HTTP routes and SSE stream for DSH Goal
 */
export function registerRoutes(ctx, {
  engine,
  goalsService,
  getConfig,
  stopRunningAgents,
  resumeActiveAgent,
  sessionAgents,
  sseClients = new Map(),
  addonStore,
  budgetGuard,
  tokenBudgetGuard,
  snapshotManager,
  gitSnapshotManager,
  milestoneManager,
  logger = console,
} = {}) {
  const activeBudgetGuard = budgetGuard || tokenBudgetGuard;
  const activeSnapshotManager = snapshotManager || gitSnapshotManager;
  // Subscribe to engine if provided (backward compatibility)
  if (engine && typeof engine.subscribe === 'function') {
    engine.subscribe((snapshot, sid) => {
      const clients = sseClients.get(sid);
      if (clients && clients.size > 0) {
        const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
        for (const clientRes of Array.from(clients)) {
          try {
            clientRes.write(payload);
          } catch (err) {
            clients.delete(clientRes);
            try { clientRes.end(); } catch (e) { /* closed */ }
          }
        }
        if (clients.size === 0) sseClients.delete(sid);
      }
      if (sid !== 'default' && sseClients.has('default')) {
        const defClients = sseClients.get('default');
        if (defClients && defClients.size > 0) {
          const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
          for (const clientRes of Array.from(defClients)) {
            try {
              clientRes.write(payload);
            } catch (err) {
              defClients.delete(clientRes);
              try { clientRes.end(); } catch (e) { /* closed */ }
            }
          }
          if (defClients.size === 0) sseClients.delete('default');
        }
      }
    });
  }

  const broadcastEvent = (event, data) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const clientSet of sseClients.values()) {
      if (clientSet instanceof Set) {
        for (const res of clientSet) {
          try { res.write(payload); } catch (e) { clientSet.delete(res); }
        }
      } else if (clientSet && typeof clientSet.write === 'function') {
        try { clientSet.write(payload); } catch (e) { /* closed */ }
      }
    }
  };

  const setupWebServer = () => {
    if (!ctx?.webServer?.register) return () => {};

    // Keepalive ping timer for SSE connections (every 20s)
    const keepaliveTimer = setInterval(() => {
      for (const [sid, clients] of sseClients.entries()) {
        if (clients instanceof Set) {
          for (const res of Array.from(clients)) {
            try {
              res.write(': keepalive\n\n');
            } catch (err) {
              clients.delete(res);
              try { res.end(); } catch (e) { /* closed */ }
            }
          }
          if (clients.size === 0) {
            sseClients.delete(sid);
          }
        }
      }
    }, 20000);
    if (typeof keepaliveTimer.unref === 'function') keepaliveTimer.unref();

    const unreg = ctx.webServer.register({
      kind: 'prefix',
      path: '/dsh-goal',
      handler: (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

        // GET /dsh-goal/events: Server-Sent Events realtime snapshot stream
        if (req.method === 'GET' && (pathname === '/dsh-goal/events' || pathname === '/dsh-goal/events/')) {
          const rejection = getRequestRejection(req, { ctx });
          if (rejection !== undefined) {
            res.statusCode = rejection;
            if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.end(JSON.stringify({ error: rejection === 401 ? 'Unauthorized: authentication required' : 'Forbidden: untrusted caller origin' }));
          }
          const sid = sessionIdOf(req, 'default');
          if (typeof res.writeHead === 'function') {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              'Connection': 'keep-alive',
              'X-Accel-Buffering': 'no',
            });
          } else {
            res.statusCode = 200;
            if (typeof res.setHeader === 'function') {
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache, no-transform');
            }
          }

          if (!sseClients.has(sid)) {
            sseClients.set(sid, new Set());
          }
          sseClients.get(sid).add(res);

          const initialSnap = engine ? engine.getSnapshot(sid) : { sessionId: sid, hasActiveGoal: false, status: 'IDLE' };
          res.write(`data: ${JSON.stringify(initialSnap)}\n\n`);

          if (typeof req.on === 'function') {
            req.on('close', () => {
              const set = sseClients.get(sid);
              if (set) {
                set.delete(res);
                if (set.size === 0) sseClients.delete(sid);
              }
            });
          }
          return;
        }

        if (typeof res.setHeader === 'function') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }

        // GET /dsh-goal/templates
        if (req.method === 'GET' && (pathname === '/dsh-goal/templates' || pathname === '/dsh-goal/templates/')) {
          const rejection = getRequestRejection(req, { ctx });
          if (rejection !== undefined) {
            res.statusCode = rejection;
            return res.end(JSON.stringify({ error: rejection === 401 ? 'Unauthorized: authentication required' : 'Forbidden: untrusted caller origin' }));
          }
          res.statusCode = 200;
          return res.end(JSON.stringify({ ok: true, templates: getTemplatesCatalogue() }));
        }

        // GET /dsh-goal/state
        if (req.method === 'GET' && (pathname === '/dsh-goal/state' || pathname === '/dsh-goal/state/')) {
          const rejection = getRequestRejection(req, { ctx });
          if (rejection !== undefined) {
            res.statusCode = rejection;
            return res.end(JSON.stringify({ error: rejection === 401 ? 'Unauthorized: authentication required' : 'Forbidden: untrusted caller origin' }));
          }
          const sid = sessionIdOf(req, 'default');
          res.statusCode = 200;
          if (engine) {
            return res.end(JSON.stringify(engine.getSnapshot(sid)));
          }
          return res.end(JSON.stringify({
            sessionId: sid,
            hasActiveGoal: false,
            state: 'IDLE',
            milestones: [],
          }));
        }

        // GET /dsh-goal/diff
        if (req.method === 'GET' && (pathname === '/dsh-goal/diff' || pathname === '/dsh-goal/diff/')) {
          const rejection = getRequestRejection(req, { ctx });
          if (rejection !== undefined) {
            res.statusCode = rejection;
            return res.end(JSON.stringify({ error: rejection === 401 ? 'Unauthorized: authentication required' : 'Forbidden: untrusted caller origin' }));
          }
          const sid = sessionIdOf(req, 'default');
          const target = url.searchParams.get('target') || undefined;
          const base = url.searchParams.get('base') || undefined;
          const file = url.searchParams.get('file') || undefined;
          const cwd = url.searchParams.get('cwd') || undefined;

          if (engine) {
            const diffResult = engine.getDiff(sid, { target, base, file, cwd });
            res.statusCode = diffResult.ok ? 200 : 400;
            return res.end(JSON.stringify(diffResult));
          }
          res.statusCode = 404;
          return res.end(JSON.stringify({ ok: false, error: 'Goal engine unavailable' }));
        }

        // POST /dsh-goal/action
        // CSRF & Same-Origin guard
        if (req.method === 'POST' && (pathname === '/dsh-goal/action' || pathname === '/dsh-goal/action/')) {
          const secFetchSite = req.headers['sec-fetch-site'];
          if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site' && secFetchSite !== 'none') {
            res.statusCode = 403;
            return res.end(JSON.stringify({ error: 'Forbidden: cross-site requests are rejected' }));
          }

          const origin = req.headers?.origin;
          const host = req.headers?.host;
          if (origin && host) {
            try {
              const originHost = new URL(origin).host;
              if (originHost !== host) {
                res.statusCode = 403;
                return res.end(JSON.stringify({ error: 'Forbidden: origin mismatch' }));
              }
            } catch (err) {
              res.statusCode = 403;
              return res.end(JSON.stringify({ error: 'Forbidden: invalid origin' }));
            }
          }

          const rejection = getRequestRejection(req, { ctx });
          if (rejection !== undefined) {
            res.statusCode = rejection;
            return res.end(JSON.stringify({ error: rejection === 401 ? 'Unauthorized: authentication required' : 'Forbidden: untrusted caller origin' }));
          }

          let body = '';
          let bodySize = 0;
          const MAX_PAYLOAD_BYTES = 256 * 1024;
          let limitExceeded = false;

          const onData = (chunk) => {
            bodySize += chunk.length;
            if (bodySize > MAX_PAYLOAD_BYTES) {
              limitExceeded = true;
              if (typeof req.pause === 'function') req.pause();
              res.statusCode = 413;
              return res.end(JSON.stringify({ error: 'Payload too large: max 256 KB allowed' }));
            }
            body += chunk;
          };

          const onEnd = async () => {
            if (limitExceeded) return;
            try {
              const data = JSON.parse(body || '{}');
              const sid = data.sessionId || sessionIdOf(req, 'default');
              const { action, title, description, reason, milestoneId, status, notes } = data;

              let result = null;
              switch (action) {
                case 'start': {
                  const cleanTitle = typeof title === 'string' ? title.trim() : '';
                  if (!cleanTitle) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'Goal title cannot be empty' }));
                  }
                  const trustedRoots = [process.cwd()];
                  if (process.env.DSH_WORKSPACE_ROOT) {
                    trustedRoots.push(process.env.DSH_WORKSPACE_ROOT);
                  }
                  let safeStartCwd = undefined;
                  if (data.cwd) {
                    const validated = getSafeCwd(data.cwd, trustedRoots);
                    if (!validated) {
                      res.statusCode = 400;
                      return res.end(JSON.stringify({ error: 'Invalid or unauthorized working directory' }));
                    }
                    safeStartCwd = validated;
                  }
                  const detectedLang = data.lang || detectLanguage(cleanTitle);
                  const conf = typeof getConfig === 'function' ? getConfig() : { maxIterations: 25 };

                  if (engine) {
                    result = engine.startGoal(cleanTitle, {
                      description: typeof description === 'string' ? description.trim() : '',
                      maxIterations: conf.maxIterations || 25,
                      lang: detectedLang,
                      cwd: safeStartCwd,
                      issueBody: data.issueBody,
                      mode: data.mode,
                      maxCostBudget: data.maxCostBudget,
                      currency: data.currency,
                    }, sid);
                  } else {
                    let parsedMilestones = [];
                    if (data.issueBody) {
                      parsedMilestones = parseIssueChecklist(data.issueBody);
                    }
                    const initialMode = data.mode === 'plan' ? 'plan' : 'act';
                    result = {
                      title: cleanTitle,
                      sessionId: sid,
                      hasActiveGoal: true,
                      mode: initialMode,
                      state: initialMode === 'plan' ? 'PLANNING' : 'RUNNING',
                      milestones: parsedMilestones,
                    };
                  }

                  const isPlan = result?.mode === 'plan' || (engine && typeof engine.isPlanMode === 'function' && engine.isPlanMode(sid));
                  const startPrompt = isPlan
                    ? (detectedLang === 'zh'
                      ? `🎯 目标已确立（规划模式/Plan Mode）：“${cleanTitle}”。请通过 goal_milestones 制定工作计划并列出检查清单。在操作者批准前，请勿进行写文件等变更操作。`
                      : `🎯 Goal established in Plan Mode: "${cleanTitle}". Formulate milestones and checklist via goal_milestones and goal_checklist. Do not modify files until the operator approves the plan.`)
                    : (detectedLang === 'zh'
                      ? `🎯 目标已确立：“${cleanTitle}”。请立即通过 goal_milestones 制定工作计划并开始执行。`
                      : `🎯 Goal established: "${cleanTitle}". Formulate milestones via goal_milestones and proceed.`);

                  if (typeof resumeActiveAgent === 'function') {
                    resumeActiveAgent(startPrompt, sid);
                  }
                  break;
                }

                case 'nudge': {
                  const text = (typeof data.text === 'string' ? data.text : (data.notes || data.nudge || '')).trim();
                  if (!text) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'Nudge text cannot be empty' }));
                  }
                  if (engine) {
                    result = engine.nudge(text, sid);
                    if (data.resume) {
                      engine.resume(sid);
                      const prompt = engine.getStatePromptInjection(sid);
                      if (typeof resumeActiveAgent === 'function') {
                        resumeActiveAgent(prompt, sid);
                      }
                    }
                  } else {
                    result = { nudged: true, text };
                  }
                  break;
                }

                case 'pause':
                  if (engine) {
                    result = engine.pause(reason || 'Paused by user interface', sid);
                  }
                  if (typeof stopRunningAgents === 'function') {
                    stopRunningAgents(sid);
                  }
                  break;

                case 'resume':
                  if (engine) {
                    result = engine.resume(sid);
                  }
                  if (typeof resumeActiveAgent === 'function') {
                    resumeActiveAgent(undefined, sid);
                  }
                  break;

                case 'cancel':
                  if (engine) {
                    result = engine.cancel(reason || 'Goal cancelled by user', sid);
                  }
                  if (typeof stopRunningAgents === 'function') {
                    stopRunningAgents(sid);
                  }
                  break;

                case 'clear':
                  if (engine) {
                    result = engine.clear(sid);
                  }
                  if (addonStore && typeof addonStore.removeGoalData === 'function') {
                    addonStore.removeGoalData(sid);
                  }
                  if (typeof stopRunningAgents === 'function') {
                    stopRunningAgents(sid);
                  }
                  if (sessionAgents) {
                    sessionAgents.delete(sid);
                  }
                  break;

                case 'update_milestone': {
                  if (!milestoneId || !status) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'milestoneId and status are required' }));
                  }
                  const validStatuses = Object.values(MilestoneStatus);
                  if (!validStatuses.includes(status)) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: `Invalid status: ${status}. Must be one of: ${validStatuses.join(', ')}` }));
                  }
                  if (engine) {
                    const ok = engine.updateMilestone(milestoneId, status, notes, sid, data.checklist);
                    if (!ok) {
                      res.statusCode = 404;
                      return res.end(JSON.stringify({ error: `Milestone with id "${milestoneId}" not found` }));
                    }
                    result = engine.getSnapshot(sid);
                  } else if (milestoneManager) {
                    const ok = milestoneManager.updateMilestone(sid, milestoneId, { status, notes });
                    if (!ok) {
                      res.statusCode = 404;
                      return res.end(JSON.stringify({ error: `Milestone with id "${milestoneId}" not found` }));
                    }
                    result = { ok: true, milestones: milestoneManager.getMilestones(sid) };
                  }
                  break;
                }

                case 'toggle_checklist_item': {
                  if (!milestoneId || data.itemIndex === undefined) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'milestoneId and itemIndex are required' }));
                  }
                  if (engine) {
                    const ok = engine.toggleChecklistItem(milestoneId, data.itemIndex, data.done, sid);
                    if (!ok) {
                      res.statusCode = 404;
                      return res.end(JSON.stringify({ error: `Milestone checklist item not found` }));
                    }
                    result = engine.getSnapshot(sid);
                  } else if (milestoneManager) {
                    const ok = milestoneManager.toggleChecklistItem(sid, milestoneId, data.itemIndex, data.done);
                    if (!ok) {
                      res.statusCode = 404;
                      return res.end(JSON.stringify({ error: `Milestone checklist item not found` }));
                    }
                    result = { ok: true, milestones: milestoneManager.getMilestones(sid) };
                  }
                  break;
                }

                case 'extend_budget': {
                  const addTokens = data.addTokens || 50000;
                  if (engine) {
                    const ok = engine.extendBudget(addTokens, sid);
                    if (!ok) {
                      res.statusCode = 404;
                      return res.end(JSON.stringify({ error: 'No active goal found to extend budget' }));
                    }
                    if (typeof resumeActiveAgent === 'function') {
                      resumeActiveAgent(undefined, sid);
                    }
                    result = engine.getSnapshot(sid);
                  } else if (budgetGuard) {
                    budgetGuard.extendBudget(sid, addTokens);
                    result = { ok: true, extendedBy: addTokens };
                  }
                  break;
                }

                case 'rollback_milestone': {
                  const commit = data.commit || data.checkpointCommit;
                  if (!commit) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'commit hash is required for rollback' }));
                  }
                  const sessionGoal = engine ? engine.getGoal(sid) : null;
                  const allowedRoots = [process.cwd()];
                  if (process.env.DSH_WORKSPACE_ROOT) {
                    allowedRoots.push(process.env.DSH_WORKSPACE_ROOT);
                  }
                  if (sessionGoal?.cwd) {
                    const isCwdAllowed = allowedRoots.some((root) => isPathInsideOrEqual(root, sessionGoal.cwd));
                    if (isCwdAllowed) {
                      allowedRoots.push(sessionGoal.cwd);
                    }
                  }
                  const safeCwd = getSafeCwd(data.cwd, allowedRoots);
                  if (!safeCwd) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'Invalid or non-existent working directory' }));
                  }
                  const ok = rollbackToCheckpoint(commit, safeCwd);
                  if (!ok) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: `Failed to rollback to checkpoint ${commit}` }));
                  }
                  result = engine ? engine.getSnapshot(sid) : { ok: true, rolledBack: commit };
                  break;
                }

                case 'save_artifact': {
                  const snap = engine ? engine.getSnapshot(sid) : null;
                  if (engine && (!snap || !snap.hasActiveGoal)) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: 'No active goal to save artifact for' }));
                  }
                  const sessionGoal = engine ? engine.getGoal(sid) : null;
                  const allowedRoots = [process.cwd()];
                  if (process.env.DSH_WORKSPACE_ROOT) {
                    allowedRoots.push(process.env.DSH_WORKSPACE_ROOT);
                  }
                  if (sessionGoal?.cwd) {
                    const isCwdAllowed = allowedRoots.some((root) => isPathInsideOrEqual(root, sessionGoal.cwd));
                    if (isCwdAllowed) {
                      allowedRoots.push(sessionGoal.cwd);
                    }
                  }
                  const safeCwd = getSafeCwd(data.cwd, allowedRoots);
                  if (!safeCwd) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'Invalid or non-existent working directory' }));
                  }
                  const artifact = saveGoalArtifact(snap || { objective: 'Goal Report' }, safeCwd);
                  if (!artifact) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: 'Failed to write goal artifact to disk' }));
                  }
                  res.statusCode = 200;
                  return res.end(JSON.stringify({ ok: true, artifact, state: snap || {} }));
                }

                case 'intervene': {
                  if (engine) {
                    result = engine.intervene(data, sid);
                    if (data.resume) {
                      engine.resume(sid);
                      const prompt = engine.getStatePromptInjection(sid);
                      if (typeof resumeActiveAgent === 'function') {
                        resumeActiveAgent(prompt, sid);
                      }
                    }
                  } else {
                    result = { intervened: true };
                  }
                  break;
                }

                case 'preplan_approve': {
                  if (engine) {
                    result = engine.approvePreplan(sid);
                    const prompt = engine.getStatePromptInjection(sid);
                    if (typeof resumeActiveAgent === 'function') {
                      resumeActiveAgent(prompt, sid);
                    }
                  }
                  break;
                }

                case 'set_mode': {
                  const targetMode = data.mode;
                  if (targetMode !== GoalMode.PLAN && targetMode !== GoalMode.ACT) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: `Invalid mode "${targetMode}". Must be "plan" or "act".` }));
                  }
                  if (engine) {
                    const snap = engine.getSnapshot(sid);
                    if (!snap || !snap.hasActiveGoal) {
                      res.statusCode = 404;
                      return res.end(JSON.stringify({ error: 'No active goal found to set mode' }));
                    }
                    result = engine.setMode(targetMode, sid);
                    if (targetMode === GoalMode.ACT) {
                      const detectedLang = snap.lang || 'en';
                      const prompt = detectedLang === 'zh'
                        ? '⚡ 执行模式（Act Mode）已激活。请继续推进目标任务。'
                        : '⚡ Act Mode activated by operator. Proceed with task execution.';
                      if (typeof resumeActiveAgent === 'function') {
                        resumeActiveAgent(prompt, sid);
                      }
                    }
                  } else {
                    result = { mode: targetMode, state: targetMode === GoalMode.PLAN ? 'PLANNING' : 'RUNNING' };
                  }
                  break;
                }

                case 'answer_operator': {
                  const answer = typeof data.answer === 'string' ? data.answer.trim() : '';
                  const optionIndex = typeof data.optionIndex === 'number' ? data.optionIndex : (typeof data.option_index === 'number' ? data.option_index : null);
                  if (engine && typeof engine.answerOperator === 'function') {
                    const ansRes = engine.answerOperator({ answer, optionIndex }, sid);
                    if (!ansRes.ok) {
                      res.statusCode = 400;
                      return res.end(JSON.stringify({ error: ansRes.error || 'Failed to submit operator answer' }));
                    }
                    result = { ok: true, answer: ansRes.answer, state: engine.getSnapshot(sid) };
                    const snap = engine.getSnapshot(sid);
                    const detectedLang = snap?.lang || 'en';
                    const prompt = detectedLang === 'zh'
                      ? `✅ 操作员已答复你的提问: "${ansRes.answer}"。请继续执行任务。`
                      : `✅ Operator answered your query: "${ansRes.answer}". Proceed with task execution.`;
                    if (typeof resumeActiveAgent === 'function') {
                      resumeActiveAgent(prompt, sid);
                    }
                  } else {
                    result = { ok: true, answer };
                  }
                  break;
                }

                case 'approve_plan': {
                  if (engine) {
                    const snap = engine.getSnapshot(sid);
                    if (!snap || !snap.hasActiveGoal) {
                      res.statusCode = 404;
                      return res.end(JSON.stringify({ error: 'No active goal found to approve plan' }));
                    }
                    result = engine.approvePlan(sid);
                    const detectedLang = snap.lang || 'en';
                    const prompt = detectedLang === 'zh'
                      ? '✅ 操作者已批准计划。执行模式（Act Mode）已激活。请立即开始具体代码与任务实现。'
                      : '✅ Plan approved by operator. Act Mode activated. Proceed with implementation.';
                    if (typeof resumeActiveAgent === 'function') {
                      resumeActiveAgent(prompt, sid);
                    }
                  } else {
                    result = { mode: GoalMode.ACT, state: 'RUNNING', approved: true };
                  }
                  break;
                }

                case 'branch_action': {
                  const op = String(data.operation || data.branchOperation || 'merge').toLowerCase();
                  const targetBranch = String(data.targetBranch || 'main');
                  if (!isValidGitRef(targetBranch)) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: `Invalid targetBranch ref: "${targetBranch}"` }));
                  }
                  if (op !== 'merge' && op !== 'discard') {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: `Invalid branch operation: "${op}". Allowed: merge, discard` }));
                  }
                  if (engine) {
                    if (op === 'merge') {
                      const ok = engine.mergeGoalBranch(targetBranch, sid);
                      if (!ok) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: `Failed to merge goal branch into ${targetBranch}` }));
                      }
                    } else if (op === 'discard') {
                      const ok = engine.discardGoalBranch(targetBranch, sid);
                      if (!ok) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: 'Failed to discard goal branch' }));
                      }
                    }
                    result = engine.getSnapshot(sid);
                  }
                  break;
                }

                case 'templates':
                  res.statusCode = 200;
                  return res.end(JSON.stringify({ ok: true, templates: getTemplatesCatalogue() }));

                case 'kanban_move': {
                  if (engine) {
                    result = engine.handleKanbanCardMove(data, sid);
                    if (!result.ok) res.statusCode = 400;
                  } else {
                    res.statusCode = 404;
                    result = { ok: false, error: 'Goal engine unavailable' };
                  }
                  break;
                }

                case 'kanban_sync': {
                  if (engine) {
                    result = await engine.syncKanban(sid, { ctx });
                    if (!result.ok && !result.skipped) res.statusCode = 400;
                  } else {
                    res.statusCode = 404;
                    result = { ok: false, error: 'Goal engine unavailable' };
                  }
                  break;
                }

                case 'spawn_subgoal': {
                  const subTitle = typeof data.title === 'string' ? data.title.trim() : '';
                  if (!subTitle) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'Sub-goal title is required' }));
                  }
                  if (engine) {
                    const spawnRes = engine.spawnSubGoal({
                      title: subTitle,
                      prompt: data.prompt || data.description,
                      maxIterations: data.maxIterations ?? data.max_iterations,
                      inheritContext: data.inheritContext ?? data.inherit_context,
                    }, sid);
                    if (!spawnRes.ok) {
                      res.statusCode = 400;
                      return res.end(JSON.stringify({ error: spawnRes.error || 'Failed to spawn sub-goal' }));
                    }
                    result = spawnRes;
                  } else {
                    res.statusCode = 404;
                    result = { ok: false, error: 'Goal engine unavailable' };
                  }
                  break;
                }

                case 'instantiate_template': {
                  const tplId = data.templateId || data.id;
                  if (!tplId) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ error: 'templateId is required' }));
                  }
                  const instance = instantiateTemplate(tplId, data.inputs || {});
                  if (!instance) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: `Template "${tplId}" not found` }));
                  }
                  res.statusCode = 200;
                  return res.end(JSON.stringify({ ok: true, template: instance }));
                }

                case 'export_release_notes': {
                  const snap = engine ? engine.getSnapshot(sid) : null;
                  if (engine && (!snap || !snap.hasActiveGoal)) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: 'No active goal found to export release notes' }));
                  }
                  const markdown = engine ? engine.exportReleaseNotes(sid, data.options || {}) : '';
                  res.statusCode = 200;
                  return res.end(JSON.stringify({ ok: true, releaseNotes: markdown, state: snap || {} }));
                }

                case 'notify_telegram': {
                  const snap = engine ? engine.getSnapshot(sid) : null;
                  if (engine && (!snap || !snap.hasActiveGoal)) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: 'No active goal found to dispatch notification' }));
                  }
                  const goal = engine ? engine.getGoal(sid) : null;
                  const notifyRes = await dispatchGoalTelegramNotification(goal, { engine, ctx, ...(data.options || {}) });
                  res.statusCode = notifyRes.ok ? 200 : 500;
                  return res.end(JSON.stringify(notifyRes));
                }

                default:
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
              }

              res.statusCode = 200;
              return res.end(JSON.stringify({ ok: true, state: result || (engine ? engine.getSnapshot(sid) : {}) }));
            } catch (parseErr) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: parseErr.message }));
            }
          };

          if (typeof req.on === 'function') {
            req.on('data', onData);
            req.on('end', onEnd);
          } else {
            onEnd();
          }
          return;
        }

        const KNOWN_ROUTES = {
          '/dsh-goal/events': ['GET'],
          '/dsh-goal/templates': ['GET'],
          '/dsh-goal/state': ['GET'],
          '/dsh-goal/diff': ['GET'],
          '/dsh-goal/action': ['POST'],
        };
        const cleanPath = pathname.replace(/\/+$/, '') || '/';
        const allowedMethods = KNOWN_ROUTES[cleanPath];
        if (allowedMethods && !allowedMethods.includes(req.method)) {
          res.statusCode = 405;
          if (typeof res.setHeader === 'function') res.setHeader('Allow', allowedMethods.join(', '));
          return res.end(JSON.stringify({ error: `Method Not Allowed: use ${allowedMethods.join(', ')}` }));
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      },
    });

    return () => {
      clearInterval(keepaliveTimer);
      if (typeof unreg === 'function') unreg();
      for (const clients of sseClients.values()) {
        if (clients instanceof Set) {
          for (const res of clients) {
            try { res.end(); } catch (err) { /* closed */ }
          }
        }
      }
      sseClients.clear();
    };
  };

  let cleanup = null;
  if (typeof ctx?.effect === 'function') {
    cleanup = ctx.effect(() => setupWebServer(), 'dsh-goal: HTTP WebServer Routes & SSE');
  } else {
    cleanup = setupWebServer();
  }

  return {
    broadcastEvent,
    cleanup,
  };
}
