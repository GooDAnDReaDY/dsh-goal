import fs from 'node:fs';
import path from 'node:path';
import { MilestoneStatus, detectLanguage, sessionIdOf, isPathInsideOrEqual, getSafeCwd } from './goal-engine-constants.js';
import { isValidGitRef } from './engine-git-branch.js';
import { saveGoalArtifact, rollbackToCheckpoint } from './engine-reports.js';
import { getTemplatesCatalogue, instantiateTemplate } from './engine-templates.js';
import { parseIssueChecklist } from './engine-issue-sync.js';

export function isLoopback(value) {
  if (!value) return false;
  const address = String(value).toLowerCase().replace(/^\[|\]$/g, '');
  return Boolean(
    address === 'localhost' ||
    address === 'localhost.' ||
    address === '::1' ||
    address.startsWith('127.') ||
    address.startsWith('::ffff:127.')
  );
}

export function isTrustedCaller(req) {
  if (!req) return false;
  const remote = req.socket?.remoteAddress || req.connection?.remoteAddress || "";
  const site = req.headers?.["sec-fetch-site"];

  // 1. Cross-site and same-site browser requests are rejected
  if (site === "cross-site" || site === "same-site") return false;

  // 2. Same-origin browser UI requests (operator UI on LAN or localhost)
  if (site === "same-origin") {
    const host = String(req.headers?.host || "").toLowerCase();
    const origin = String(req.headers?.origin || "").trim().toLowerCase();
    if (origin && host) {
      try {
        const u = new URL(origin);
        if (u.host === host) return true;
      } catch (err) {
        return false;
      }
    }
    const referer = String(req.headers?.referer || "").trim().toLowerCase();
    if (referer && host) {
      try {
        const u = new URL(referer);
        if (u.host === host) return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }

  // 3. No declared site: only loopback remote clients (CLI, reverse proxy) are trusted
  if (isLoopback(remote)) return true;

  // 4. Fallback for test harnesses without remote socket where host header explicitly targets loopback
  if (!remote && req.headers?.host) {
    const hostName = String(req.headers.host).split(":")[0];
    if (isLoopback(hostName)) {
      return true;
    }
  }

  return false;
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
  snapshotManager,
  milestoneManager,
  logger = console,
} = {}) {
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
          if (!isTrustedCaller(req)) {
            res.statusCode = 403;
            if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json; charset=utf-8');
            return res.end(JSON.stringify({ error: 'Forbidden: untrusted caller origin' }));
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
          if (!isTrustedCaller(req)) {
            res.statusCode = 403;
            return res.end(JSON.stringify({ error: 'Forbidden: untrusted caller origin' }));
          }
          res.statusCode = 200;
          return res.end(JSON.stringify({ ok: true, templates: getTemplatesCatalogue() }));
        }

        // GET /dsh-goal/state
        if (req.method === 'GET' && (pathname === '/dsh-goal/state' || pathname === '/dsh-goal/state/')) {
          if (!isTrustedCaller(req)) {
            res.statusCode = 403;
            return res.end(JSON.stringify({ error: 'Forbidden: untrusted caller origin' }));
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

          if (!isTrustedCaller(req)) {
            res.statusCode = 403;
            return res.end(JSON.stringify({ error: 'Forbidden: untrusted caller origin' }));
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

          const onEnd = () => {
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
                    }, sid);
                  } else {
                    let parsedMilestones = [];
                    if (data.issueBody) {
                      parsedMilestones = parseIssueChecklist(data.issueBody);
                    }
                    result = {
                      title: cleanTitle,
                      sessionId: sid,
                      hasActiveGoal: true,
                      state: 'RUNNING',
                      milestones: parsedMilestones,
                    };
                  }

                  const startPrompt = detectedLang === 'zh'
                    ? `🎯 目标已确立：“${cleanTitle}”。请立即通过 goal_milestones 制定工作计划并开始执行。`
                    : `🎯 Goal established: "${cleanTitle}". Formulate milestones via goal_milestones and proceed.`;

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
