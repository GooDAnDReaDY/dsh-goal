import fs from 'node:fs';
import path from 'node:path';
import { sessionIdOf, isPathInsideOrEqual, getSafeCwd } from './goal-engine-constants.js';
import { getTemplatesCatalogue } from './engine-templates.js';
import { executeGoalAction } from './routes-actions.js';

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

  // 1. Explicit auth token check (supports x-dsh-auth-token or Authorization: Bearer <token>)
  if (authToken) {
    const headerVal = req.headers['x-dsh-auth-token'] || req.headers.authorization;
    const cleanHeader = headerVal ? String(headerVal).replace(/^Bearer\s+/i, '').trim() : '';
    if (cleanHeader && cleanHeader === authToken) {
      return undefined;
    }
  }

  // 2. Authoritative DSH connection service authentication (#186, #172)
  // Evaluated before loopback check: loopback callers (including requests proxied via dsh-lanmode)
  // must still be authenticated if connection service is active.
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
  }

  // 3. Cross-site and same-site browser requests are rejected (CSRF guard)
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site' || site === 'same-site') return 403;

  // 4. Host header validation (DNS rebinding guard)
  const host = String(req.headers.host || '').trim().toLowerCase();
  if (host && !isTrustedHost(host)) return 403;

  // 5. Remote address validation if socket is present
  const rawRemote = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  const cleanRemote = String(rawRemote).trim().toLowerCase().replace(/^::ffff:/, '');
  if (cleanRemote && !isTrustedHost(cleanRemote)) return 403;

  // 6. Origin header validation if present
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

  // 7. Referer header validation if present
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

  // 8. If connection service is present and passed without rejection:
  // Caller is authenticated by DSH core (#186, #172).
  if (conn && typeof conn.requestRejection === 'function') {
    return undefined;
  }

  // 9. Fallback when connection service is absent (local CLI, health checks, offline tests):
  if (isLoopback(cleanRemote)) {
    return undefined;
  }
  if (!cleanRemote && host) {
    const hostName = host.split(':')[0];
    if (isLoopback(hostName)) {
      return undefined;
    }
  }

  // 10. Fail-closed: Remote/LAN caller without connection service or valid token is rejected
  return 401;
}

export function isTrustedCaller(req, optionsOrToken = process.env.DSH_GOAL_AUTH_TOKEN, maybeCtx = null) {
  return getRequestRejection(req, optionsOrToken, maybeCtx) === undefined;
}

/**
 * Route guard: validates incoming HTTP request using isTrustedCaller (#188).
 * Rejects untrusted or unauthenticated requests with appropriate HTTP status code (401/403).
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {any} [ctx]
 * @returns {boolean} true if request is admitted; false if rejected and response ended.
 */
export function verifyRouteAccess(req, res, ctx) {
  if (isTrustedCaller(req, { ctx })) {
    return true;
  }
  const rejection = getRequestRejection(req, { ctx }) || 401;
  res.statusCode = rejection;
  if (typeof res.setHeader === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  }
  res.end(JSON.stringify({
    error: rejection === 401 ? 'Unauthorized: authentication required' : 'Forbidden: untrusted caller origin',
  }));
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
          if (!verifyRouteAccess(req, res, ctx)) return;
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

          const initialSnap = engine ? engine.getSnapshot(sid) : { sessionId: sid, hasActiveGoal: false, state: 'IDLE', status: 'IDLE', title: '' };
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
          if (!verifyRouteAccess(req, res, ctx)) return;
          res.statusCode = 200;
          return res.end(JSON.stringify({ ok: true, templates: getTemplatesCatalogue() }));
        }

        // GET /dsh-goal/state
        if (req.method === 'GET' && (pathname === '/dsh-goal/state' || pathname === '/dsh-goal/state/')) {
          if (!verifyRouteAccess(req, res, ctx)) return;
          const sid = sessionIdOf(req, 'default');
          res.statusCode = 200;
          if (engine) {
            return res.end(JSON.stringify(engine.getSnapshot(sid)));
          }
          return res.end(JSON.stringify({
            sessionId: sid,
            hasActiveGoal: false,
            state: 'IDLE',
            title: '',
            milestones: [],
          }));
        }

        // GET /dsh-goal/diff
        if (req.method === 'GET' && (pathname === '/dsh-goal/diff' || pathname === '/dsh-goal/diff/')) {
          if (!verifyRouteAccess(req, res, ctx)) return;
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

          if (!verifyRouteAccess(req, res, ctx)) return;

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
              const outcome = executeGoalAction(data, {
                req,
                res,
                sid,
                engine,
                goalsService,
                getConfig,
                stopRunningAgents,
                resumeActiveAgent,
                sessionAgents,
                addonStore,
                budgetGuard: activeBudgetGuard,
                snapshotManager: activeSnapshotManager,
                milestoneManager,
                broadcastEvent,
                logger,
                ctx,
              });
              if (outcome && typeof outcome.then === 'function') {
                return outcome.then((asyncOutcome) => {
                  if (asyncOutcome.handled) return;
                  res.statusCode = 200;
                  return res.end(JSON.stringify({ ok: true, state: asyncOutcome.result || (engine ? engine.getSnapshot(sid) : {}) }));
                });
              }
              if (outcome.handled) return;
              res.statusCode = 200;
              return res.end(JSON.stringify({ ok: true, state: outcome.result || (engine ? engine.getSnapshot(sid) : {}) }));
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
