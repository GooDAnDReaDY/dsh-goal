import { MilestoneStatus, detectLanguage, sessionIdOf } from './goal-engine-constants.js';

/**
 * Register webServer HTTP routes and SSE stream for DSH Goal
 * @param {any} ctx Cordis context
 * @param {object} deps Dependencies
 * @param {any} deps.engine GoalEngine instance
 * @param {Function} deps.getConfig Function returning current config
 * @param {Function} deps.stopRunningAgents Stop agents function
 * @param {Function} deps.resumeActiveAgent Resume agent function
 * @param {Map} deps.sessionAgents Session agent map
 * @param {Map} [deps.sseClients] SSE clients map (sid -> Set)
 */
export function registerRoutes(ctx, {
  engine,
  getConfig,
  stopRunningAgents,
  resumeActiveAgent,
  sessionAgents,
  sseClients = new Map(),
}) {
  // Subscribe to engine changes for realtime Server-Sent Events broadcasting
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

  ctx.effect(() => {
    if (!ctx.webServer?.register) return () => {};

    // Keepalive ping timer for SSE connections (every 20s)
    const keepaliveTimer = setInterval(() => {
      for (const [sid, clients] of sseClients.entries()) {
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
          const sid = sessionIdOf(req, 'default');
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          });

          if (!sseClients.has(sid)) {
            sseClients.set(sid, new Set());
          }
          sseClients.get(sid).add(res);

          const initialSnap = engine.getSnapshot(sid);
          res.write(`data: ${JSON.stringify(initialSnap)}\n\n`);

          req.on('close', () => {
            const set = sseClients.get(sid);
            if (set) {
              set.delete(res);
              if (set.size === 0) sseClients.delete(sid);
            }
          });
          return;
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        // GET /dsh-goal/state
        if (req.method === 'GET' && (pathname === '/dsh-goal/state' || pathname === '/dsh-goal/state/')) {
          const sid = sessionIdOf(req, 'default');
          res.statusCode = 200;
          return res.end(JSON.stringify(engine.getSnapshot(sid)));
        }

        // POST /dsh-goal/action
        // CSRF & Same-Origin guard
        if (req.method === 'POST' && (pathname === '/dsh-goal/action' || pathname === '/dsh-goal/action/')) {
          const secFetchSite = req.headers['sec-fetch-site'];
          if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site' && secFetchSite !== 'none') {
            res.statusCode = 403;
            return res.end(JSON.stringify({ error: 'Forbidden: cross-site requests are rejected' }));
          }

          const origin = req.headers.origin;
          const host = req.headers.host;
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

          let body = '';
          let bodySize = 0;
          const MAX_PAYLOAD_BYTES = 256 * 1024;
          let limitExceeded = false;

          req.on('data', (chunk) => {
            bodySize += chunk.length;
            if (bodySize > MAX_PAYLOAD_BYTES) {
              limitExceeded = true;
              req.pause();
              res.statusCode = 413;
              return res.end(JSON.stringify({ error: 'Payload too large: max 256 KB allowed' }));
            }
            body += chunk;
          });

          req.on('end', () => {
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
                  const detectedLang = data.lang || detectLanguage(cleanTitle);
                  const conf = typeof getConfig === 'function' ? getConfig() : { maxIterations: 25 };
                  result = engine.startGoal(cleanTitle, {
                    description: typeof description === 'string' ? description.trim() : '',
                    maxIterations: conf.maxIterations || 25,
                    lang: detectedLang,
                  }, sid);

                  const startPrompt = detectedLang === 'zh'
                    ? `🎯 目标已确立：“${cleanTitle}”。请立即通过 goal_set_milestones 制定工作计划（3-7个具体步骤）并开始执行。`
                    : `🎯 Goal established: "${cleanTitle}". Immediately formulate a work plan (3-7 concrete steps) via tool goal_set_milestones and start executing it.`;

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
                  result = engine.nudge(text, sid);
                  if (data.resume) {
                    engine.resume(sid);
                    const prompt = engine.getStatePromptInjection(sid);
                    if (typeof resumeActiveAgent === 'function') {
                      resumeActiveAgent(prompt, sid);
                    }
                  }
                  break;
                }

                case 'pause':
                  result = engine.pause(reason || 'Paused by user interface', sid);
                  if (typeof stopRunningAgents === 'function') {
                    stopRunningAgents(sid);
                  }
                  break;

                case 'resume':
                  result = engine.resume(sid);
                  if (typeof resumeActiveAgent === 'function') {
                    resumeActiveAgent(undefined, sid);
                  }
                  break;

                case 'cancel':
                  result = engine.cancel(reason || 'Goal cancelled by user', sid);
                  if (typeof stopRunningAgents === 'function') {
                    stopRunningAgents(sid);
                  }
                  break;

                case 'clear':
                  result = engine.clear(sid);
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
                  const ok = engine.updateMilestone(milestoneId, status, notes, sid);
                  if (!ok) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: `Milestone with id "${milestoneId}" not found` }));
                  }
                  result = engine.getSnapshot(sid);
                  break;
                }

                default:
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
              }

              res.statusCode = 200;
              return res.end(JSON.stringify({ ok: true, state: result || engine.getSnapshot(sid) }));
            } catch (parseErr) {
              res.statusCode = 400;
              return res.end(JSON.stringify({ error: parseErr.message }));
            }
          });
          return;
        }

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      },
    });

    return () => {
      clearInterval(keepaliveTimer);
      if (typeof unreg === 'function') unreg();
      for (const clients of sseClients.values()) {
        for (const res of clients) {
          try {
            res.end();
          } catch (err) {
            // Already closed
          }
        }
      }
      sseClients.clear();
    };
  }, 'dsh-goal: HTTP WebServer Routes & SSE');
}
