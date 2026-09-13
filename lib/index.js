import path from 'node:path';
import os from 'node:os';
import z from '@deepseek-ai/schemastery';
import { GoalEngine, GoalState, MilestoneStatus, detectLanguage } from './goal-engine.js';
import { parseGoalInput, executeGoalSlashCommand, createGoalUserMessage } from './command-handler.js';

export const name = '@goodandready/dsh-goal';
export const inject = ['webServer', 'settings'];

const NS = 'dsh-goal';

function sessionIdOf(invocationOrReq, fallback = 'default') {
  if (!invocationOrReq) return fallback;
  try {
    // 1. DSH invocation / event / turn
    if (invocationOrReq.sessionId) return String(invocationOrReq.sessionId);
    if (invocationOrReq.session) {
      return String(invocationOrReq.session.id || invocationOrReq.session.header?.id || fallback);
    }
    if (invocationOrReq.data?.sessionId) return String(invocationOrReq.data.sessionId);
    if (invocationOrReq.agent?.session) {
      return String(invocationOrReq.agent.session.id || invocationOrReq.agent.session.header?.id || fallback);
    }
    // 2. HTTP Request (req)
    if (invocationOrReq.headers) {
      const headerSid = invocationOrReq.headers['x-dsh-session-id'];
      if (headerSid) return String(headerSid);
      if (invocationOrReq.url) {
        const url = new URL(invocationOrReq.url, 'http://localhost');
        const querySid = url.searchParams.get('sessionId') || url.searchParams.get('session');
        if (querySid) return String(querySid);
      }
    }
  } catch (_) {}
  return fallback;
}

// Схема-функция: в rc.1 settings.register(NS, schema, { base }) ожидает
// schemastery-схему вторым аргументом.
// Issue #24: storagePath объявлен в схеме конфигурации плагина
export const Config = z.object({
  maxIterations: z.number().default(25).description('Safety limit: max autonomous iterations per goal'),
  autoDrive: z.boolean().default(true).description('Automatically continue the loop after each turn'),
  enableSound: z.boolean().default(true).description('Play synthesized audio chime on goal completion or failure'),
  showQuickLaunchButton: z.boolean().default(true).description('Show quick launch goal button above composer dock'),
  consecutiveToolFailureLimit: z.number().default(3).description('Auto-pause goal if N consecutive turns encounter tool execution errors (0 to disable)'),
  enableBrowserNotifications: z.boolean().default(true).description('Show desktop notifications on goal completion or failure'),
  storagePath: z.string().default('').description('Custom filesystem path for persistent state storage'),
});

export function apply(ctx, config = {}) {
  let settingsScope = null;
  let agentsService = null;
  const runningAgents = new Set();
  const sessionAgents = new Map(); // sessionId -> agent
  let lastActiveAgent = null;

  // SSE clients: sid -> Set of res objects
  const sseClients = new Map();

  let currentSettings = {
    maxIterations: config?.maxIterations ?? 25,
    autoDrive: config?.autoDrive ?? true,
    enableSound: config?.enableSound ?? true,
    showQuickLaunchButton: config?.showQuickLaunchButton ?? true,
    consecutiveToolFailureLimit: config?.consecutiveToolFailureLimit ?? 3,
    enableBrowserNotifications: config?.enableBrowserNotifications ?? true,
    storagePath: config?.storagePath,
  };

  const defaultStorageDir = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const storagePath = currentSettings.storagePath !== undefined && currentSettings.storagePath !== null
    ? currentSettings.storagePath
    : path.join(defaultStorageDir, 'dsh-goal-state.json');

  const engine = new GoalEngine({
    defaultMaxIterations: currentSettings.maxIterations,
    autoDrive: currentSettings.autoDrive,
    enableSound: currentSettings.enableSound,
    showQuickLaunchButton: currentSettings.showQuickLaunchButton,
    consecutiveToolFailureLimit: currentSettings.consecutiveToolFailureLimit,
    storagePath,
  });

  // Subscribe to engine changes for realtime Server-Sent Events broadcasting
  engine.subscribe((snapshot, sid) => {
    const clients = sseClients.get(sid);
    if (clients && clients.size > 0) {
      const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
      for (const clientRes of clients) {
        try {
          clientRes.write(payload);
        } catch (_) {}
      }
    }
    if (sid !== 'default' && sseClients.has('default')) {
      const defClients = sseClients.get('default');
      if (defClients && defClients.size > 0) {
        const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
        for (const clientRes of defClients) {
          try {
            clientRes.write(payload);
          } catch (_) {}
        }
      }
    }
  });

  // Динамическое внедрение сервиса agents для управления жизненным циклом
  ctx.inject(['agents'], (actx) => {
    agentsService = actx.agents;
  });

  // Отслеживание выполняющихся агентов через глобальное событие ядра DSH
  ctx.on?.('agent/status', ({ agent, status }) => {
    if (status === 'running') {
      runningAgents.add(agent);
      lastActiveAgent = agent;
      const sid = sessionIdOf(agent, null);
      if (sid) {
        sessionAgents.set(sid, agent);
      }
    } else {
      runningAgents.delete(agent);
      if (lastActiveAgent === agent && (status === 'stopped' || status === 'completed' || status === 'error')) {
        lastActiveAgent = null;
      }
      const sid = sessionIdOf(agent, null);
      if (sid && sessionAgents.get(sid) === agent && (status === 'stopped' || status === 'completed' || status === 'error')) {
        sessionAgents.delete(sid);
      }
    }
  });

  const stopRunningAgents = (sessionId = 'default') => {
    const sid = sessionId || 'default';
    const specificAgent = sessionAgents.get(sid);
    if (specificAgent && typeof specificAgent.cancel === 'function') {
      try {
        specificAgent.cancel({ kind: 'user' });
      } catch (err) {
        console.warn('[dsh-goal] Failed to cancel specific agent for session:', err);
      }
    }

    // Отмена всех подходящих агентов в runningAgents
    for (const ag of runningAgents) {
      try {
        const agSid = sessionIdOf(ag, null);
        if (!agSid || agSid === sid || sid === 'default') {
          if (typeof ag.cancel === 'function') {
            ag.cancel({ kind: 'user' });
          }
        }
      } catch (err) {
        console.warn('[dsh-goal] Failed to cancel running agent:', err);
      }
    }

    if (lastActiveAgent && lastActiveAgent.status === 'running' && typeof lastActiveAgent.cancel === 'function') {
      const lastSid = sessionIdOf(lastActiveAgent, null);
      if (!lastSid || lastSid === sid || sid === 'default') {
        try {
          lastActiveAgent.cancel({ kind: 'user' });
        } catch (err) {
          console.warn('[dsh-goal] Failed to cancel lastActiveAgent:', err);
        }
      }
    }
  };

  const resumeActiveAgent = (promptText, sessionId = 'default') => {
    const sid = sessionId || 'default';
    const snap = engine.getSnapshot(sid);
    const lang = snap.lang || (snap.title ? detectLanguage(snap.title) : 'en');
    const defaultResumePrompt = lang === 'ru'
      ? '▶️ Цель возобновлена пользователем. Продолжай выполнение плана работ с того места, где остановился. Отмечай шаги через goal_update_progress.'
      : '▶️ Goal resumed by user. Continue executing the work plan from where you stopped. Update steps via goal_update_progress.';
    const resumeMsg = createGoalUserMessage(promptText || defaultResumePrompt);
    let target = sessionAgents.get(sid);
    if (!target && lastActiveAgent && typeof lastActiveAgent.followup === 'function') {
      const lastSid = sessionIdOf(lastActiveAgent, null);
      if (!lastSid || lastSid === sid || sid === 'default') {
        target = lastActiveAgent;
      }
    }
    if (!target && agentsService && typeof agentsService.list === 'function') {
      const list = agentsService.list();
      if (list && list.length > 0) {
        for (let i = list.length - 1; i >= 0; i--) {
          const cand = list[i];
          const candSid = sessionIdOf(cand, null);
          if (candSid === sid) {
            target = cand;
            break;
          }
        }
        if (!target && sid === 'default') {
          target = list[list.length - 1];
        }
      }
    }

    if (target && typeof target.followup === 'function') {
      try {
        target.followup(resumeMsg);
        lastActiveAgent = target;
        sessionAgents.set(sid, target);
        return true;
      } catch (err) {
        console.warn('[dsh-goal] Failed to resume agent:', err);
      }
    }
    return false;
  };

  // Issue #21: getConfig reads snap.value ONLY when status is 'ready' (or status is undefined in unit test mocks)
  const getConfig = () => {
    if (settingsScope) {
      const snap = typeof settingsScope.getSnapshot === 'function' ? settingsScope.getSnapshot() : null;
      if (snap) {
        if (snap.status === 'ready' || snap.status === undefined) {
          const live = snap.value || (typeof settingsScope.get === 'function' ? settingsScope.get() : null);
          if (live && typeof live === 'object') {
            return {
              maxIterations: typeof live.maxIterations === 'number' ? live.maxIterations : currentSettings.maxIterations,
              autoDrive: typeof live.autoDrive === 'boolean' ? live.autoDrive : currentSettings.autoDrive,
              enableSound: typeof live.enableSound === 'boolean' ? live.enableSound : currentSettings.enableSound,
              showQuickLaunchButton: typeof live.showQuickLaunchButton === 'boolean' ? live.showQuickLaunchButton : currentSettings.showQuickLaunchButton,
              consecutiveToolFailureLimit: typeof live.consecutiveToolFailureLimit === 'number' ? live.consecutiveToolFailureLimit : currentSettings.consecutiveToolFailureLimit,
              enableBrowserNotifications: typeof live.enableBrowserNotifications === 'boolean' ? live.enableBrowserNotifications : currentSettings.enableBrowserNotifications,
              storagePath: typeof live.storagePath === 'string' ? live.storagePath : currentSettings.storagePath,
            };
          }
        }
      } else if (typeof settingsScope.get === 'function') {
        const live = settingsScope.get();
        if (live && typeof live === 'object') {
          return {
            maxIterations: typeof live.maxIterations === 'number' ? live.maxIterations : currentSettings.maxIterations,
            autoDrive: typeof live.autoDrive === 'boolean' ? live.autoDrive : currentSettings.autoDrive,
            enableSound: typeof live.enableSound === 'boolean' ? live.enableSound : currentSettings.enableSound,
            showQuickLaunchButton: typeof live.showQuickLaunchButton === 'boolean' ? live.showQuickLaunchButton : currentSettings.showQuickLaunchButton,
            storagePath: typeof live.storagePath === 'string' ? live.storagePath : currentSettings.storagePath,
          };
        }
      }
    }
    return currentSettings;
  };

  const applySettings = () => {
    const live = getConfig();
    engine.updateConfig({
      defaultMaxIterations: live.maxIterations,
      autoDrive: live.autoDrive,
      enableSound: live.enableSound,
      showQuickLaunchButton: live.showQuickLaunchButton,
      consecutiveToolFailureLimit: live.consecutiveToolFailureLimit,
    });
  };

  // 1. Регистрация настроек плагина
  ctx.inject(['settings'], (sctx) => {
    try {
      const scope = sctx.settings?.register?.(NS, Config, { base: currentSettings });
      if (scope) {
        settingsScope = scope;
        applySettings();
        if (typeof scope.subscribe === 'function') {
          sctx.effect(() => {
            const off = scope.subscribe(() => {
              applySettings();
            });
            return () => {
              if (typeof off === 'function') off();
              settingsScope = null;
            };
          }, 'dsh-goal: settings subscription');
        }
      }
    } catch (err) {
      console.warn('[dsh-goal] Settings register skipped:', err.message);
    }
  });

  // 2. Регистрация слэш-команды /goal в чате
  ctx.inject(['commands'], (cctx) => {
    try {
      if (typeof cctx.commands?.register !== 'function') return;

      const unregister = cctx.commands.register({
        name: 'goal',
        description: 'Управление режимом цели (Goal Mode): активация, вехи, пауза, сброс',
        input: { hint: '[<цель>|clear|pause|resume]' },
        handler: async (invocation) => {
          const sid = sessionIdOf(invocation, 'default');
          if (invocation?.agent) {
            lastActiveAgent = invocation.agent;
            sessionAgents.set(sid, invocation.agent);
          }
          const parsed = parseGoalInput(invocation?.rawInput);
          const liveConfig = getConfig();
          return executeGoalSlashCommand(engine, parsed, liveConfig, invocation?.agent, sid);
        },
      });

      if (typeof unregister === 'function') {
        cctx.effect(() => () => unregister(), 'dsh-goal: /goal command unregister');
      }
    } catch (err) {
      console.warn('[dsh-goal] Commands register skipped:', err.message);
    }
  });

  // 3. Инжекция контекста цели в системный промпт (systemPrompt)
  ctx.inject(['systemPrompt'], (pctx) => {
    try {
      if (typeof pctx.systemPrompt?.section === 'function') {
        // Clear conflicting core tool:goal prompt section if present
        const globalSections = pctx.systemPrompt.layers?.global?.sections;
        if (globalSections?.data instanceof Map && globalSections.data.has('tool:goal')) {
          globalSections.data.delete('tool:goal');
        }

        const order = typeof pctx.systemPrompt.getSectionOrder === 'function'
          ? (pctx.systemPrompt.getSectionOrder('TOOL_GOAL') || 2400)
          : 2400;

        const unregisterSection = pctx.systemPrompt.section({
          name: 'tool:dsh-goal',
          order,
          text: (sessionCtx) => {
            const sid = sessionIdOf(sessionCtx, 'default');
            return engine.getStatePromptInjection(sid);
          },
        });

        if (typeof unregisterSection === 'function') {
          pctx.effect(() => () => unregisterSection(), 'dsh-goal: system prompt section');
        }
      }
    } catch (err) {
      console.warn('[dsh-goal] SystemPrompt section register skipped:', err.message);
    }
  });

  // 4. Регистрация инструментов для модели (tools)
  ctx.inject(['tools'], (tctx) => {
    if (!tctx.tools?.register) return;

    // Helper: Safely replace or register tool in ToolRuntime
    const safeRegister = (definition) => {
      try {
        const name = definition.name;
        const globalTools = tctx.tools.layers?.global?.tools;
        if (globalTools?.data instanceof Map && globalTools.data.has(name)) {
          globalTools.data.delete(name);
        }
        const unregister = tctx.tools.register(definition);
        if (typeof unregister === 'function') {
          tctx.effect(() => () => unregister(), `dsh-goal: tool ${name}`);
        }
      } catch (err) {
        console.warn(`[dsh-goal] Tool ${definition.name} registration skipped:`, err.message);
      }
    };

    const JSON_OUTPUT = {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, val) => [{ type: 'text', text: JSON.stringify(val) }],
    };

    function formatGoalValue(snap) {
      if (!snap || !snap.hasActiveGoal) {
        return { goal: null };
      }
      let phase = 'active';
      if (snap.state === GoalState.PAUSED) phase = 'paused';
      else if (snap.state === GoalState.COMPLETED) phase = 'complete';

      const roundsStarted = Number.isInteger(snap.iterations) ? snap.iterations : 0;
      const maxGoalRounds = Number.isInteger(snap.maxIterations) ? snap.maxIterations : 25;

      return {
        goal: {
          id: snap.id || 'goal-active',
          revision: 1,
          objective: snap.title || 'Goal',
          phase,
          roundsStarted,
          maxGoalRounds,
        },
        activation: snap.state === GoalState.RUNNING ? 'armed' : 'disarmed',
      };
    }

    // Совместимый инструмент 1: get_goal
    const handleGetGoal = async (_args, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const snap = engine.getSnapshot(sid);
      return formatGoalValue(snap);
    };

    safeRegister({
      name: 'get_goal',
      description: 'Read the current same-session goal, including objective, phase, and round limits.',
      parameters: { type: 'object', properties: {} },
      output: JSON_OUTPUT,
      execute: handleGetGoal,
      handler: handleGetGoal,
    });

    // Совместимый инструмент 2: create_goal
    const handleCreateGoal = async (args, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const maxIterations = Number(args.max_goal_rounds) || 25;
      const snap = engine.startGoal(args.objective, { maxIterations }, sid);
      return formatGoalValue(snap);
    };

    safeRegister({
      name: 'create_goal',
      description: 'Create one persisted same-session completion goal for long-running autonomous work.',
      parameters: {
        type: 'object',
        properties: {
          objective: {
            type: 'string',
            description: 'The concrete completion objective.',
          },
          max_goal_rounds: {
            type: 'number',
            description: 'Optional positive integer limit on automatic continuation rounds.',
          },
        },
        required: ['objective'],
      },
      output: JSON_OUTPUT,
      execute: handleCreateGoal,
      handler: handleCreateGoal,
    });

    // Совместимый инструмент 3: update_goal (перехватчик authority checks и роутер в GoalEngine)
    const handleUpdateGoal = async (args, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const action = args.action;

      if (action === 'complete') {
        const summary = args.blocked_reason || args.objective || 'Goal marked complete';
        const snap = engine.completeGoal(summary, sid);
        if (toolCtx?.deferContext) {
          try {
            toolCtx.deferContext({
              type: 'text',
              text: `<goal_complete>\nObjective: ${JSON.stringify(snap.title || summary)}\nThe goal is marked complete. Summarize what was accomplished for the user.\n</goal_complete>`,
            });
          } catch (_) {}
        }
        return formatGoalValue(snap);
      }

      if (action === 'pause') {
        const reason = args.blocked_reason || 'Paused by model';
        const snap = engine.pause(reason, sid);
        return formatGoalValue(snap);
      }

      if (action === 'resume') {
        const snap = engine.resume(sid);
        resumeActiveAgent(undefined, sid);
        return formatGoalValue(snap);
      }

      if (action === 'edit') {
        const snap = engine.getSnapshot(sid);
        if (args.objective) snap.title = args.objective;
        if (args.max_goal_rounds) snap.maxIterations = Number(args.max_goal_rounds);
        engine.emit(sid, true);
        return formatGoalValue(snap);
      }

      if (action === 'blocked') {
        const reason = args.blocked_reason || 'Goal blocked';
        const snap = engine.pause('Blocked: ' + reason, sid);
        if (toolCtx?.deferContext) {
          try {
            toolCtx.deferContext({
              type: 'text',
              text: `<goal_blocked>\nObjective: ${JSON.stringify(snap.title || 'Goal')}\nBlocked: ${JSON.stringify(reason)}\nExplain to the user what blocked progress.\n</goal_blocked>`,
            });
          } catch (_) {}
        }
        const res = formatGoalValue(snap);
        if (res.goal) {
          res.goal.phase = 'blocked';
          res.goal.blockedReason = { code: 'model-reported', message: reason };
        }
        return res;
      }

      return formatGoalValue(engine.getSnapshot(sid));
    };

    safeRegister({
      name: 'update_goal',
      description: 'Update the active goal: complete, pause, resume, edit, or report blocked.',
      parameters: {
        type: 'object',
        properties: {
          goal_id: { type: 'string', description: 'Exact id returned by get_goal.' },
          revision: { type: 'number', description: 'Exact positive revision returned by get_goal.' },
          action: {
            type: 'string',
            enum: ['edit', 'pause', 'resume', 'complete', 'blocked'],
            description: 'edit | pause | resume | complete | blocked',
          },
          objective: { type: 'string', description: 'Replacement objective; valid with action edit.' },
          max_goal_rounds: { type: 'number', description: 'Replacement cap; valid with action edit.' },
          blocked_reason: { type: 'string', description: 'Concrete blocking condition; required with action blocked.' },
        },
        required: ['action'],
      },
      output: JSON_OUTPUT,
      execute: handleUpdateGoal,
      handler: handleUpdateGoal,
    });

    // Инструмент 4: Декомпозиция цели на вехи
    const handleSetMilestones = async ({ milestones }, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const snap = engine.getSnapshot(sid);
      if (!snap.hasActiveGoal) {
        return { error: 'No active goal currently set. Start a goal first.' };
      }
      engine.addMilestones(milestones, true, sid);
      return {
        success: true,
        milestones: engine.getSnapshot(sid).milestones,
      };
    };

    safeRegister({
      name: 'goal_set_milestones',
      description: 'Break down the current active goal into a sequence of concrete milestones/sub-tasks.',
      parameters: {
        type: 'object',
        properties: {
          milestones: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of milestone titles to accomplish.',
          },
        },
        required: ['milestones'],
      },
      output: JSON_OUTPUT,
      execute: handleSetMilestones,
      handler: handleSetMilestones,
    });

    // Инструмент 5: Обновление статуса вехи
    const handleUpdateProgress = async ({ milestone_id, status, notes }, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const ok = engine.updateMilestone(milestone_id, status, notes, sid);
      if (!ok) {
        return { error: `Milestone ${milestone_id} not found or no active goal.` };
      }
      return {
        success: true,
        snapshot: engine.getSnapshot(sid),
      };
    };

    safeRegister({
      name: 'goal_update_progress',
      description: 'Update the status of a specific goal milestone and optionally log progress notes.',
      parameters: {
        type: 'object',
        properties: {
          milestone_id: {
            type: 'string',
            description: 'The ID of the milestone (e.g. "m-1", "m-2").',
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'failed'],
            description: 'New status for this milestone.',
          },
          notes: {
            type: 'string',
            description: 'Brief summary of what was accomplished or why it failed.',
          },
        },
        required: ['milestone_id', 'status'],
      },
      output: JSON_OUTPUT,
      execute: handleUpdateProgress,
      handler: handleUpdateProgress,
    });

    // Инструмент 6: Успешное завершение цели
    const handleGoalFinish = async ({ summary }, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const snap = engine.completeGoal(summary, sid);
      return {
        success: true,
        completed: true,
        summary,
      };
    };

    safeRegister({
      name: 'goal_finish',
      description: 'Conclude the active goal successfully with a final summary and achievements.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Final summary of the goal outcome and deliverables.',
          },
        },
        required: ['summary'],
      },
      output: JSON_OUTPUT,
      execute: handleGoalFinish,
      handler: handleGoalFinish,
    });
  });

  // 5. Регистрация HTTP REST API маршрутов и SSE событий
  ctx.effect(() => {
    if (!ctx.webServer?.register) return () => {};

    // Keepalive ping timer for SSE connections (every 20s)
    const keepaliveTimer = setInterval(() => {
      for (const clients of sseClients.values()) {
        for (const res of clients) {
          try {
            res.write(': keepalive\n\n');
          } catch (_) {}
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

        // GET /dsh-goal/events — Server-Sent Events realtime snapshot stream
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
        // Issue #22: CSRF & Same-Origin guard
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
            } catch (_) {
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
                  result = engine.startGoal(cleanTitle, {
                    description: typeof description === 'string' ? description.trim() : '',
                    maxIterations: getConfig().maxIterations,
                    lang: detectedLang,
                  }, sid);
                  const startPrompt = detectedLang === 'ru'
                    ? `🎯 Цель установлена: "${cleanTitle}". Немедленно сформируй план работ (3-7 конкретных шагов) через инструмент goal_set_milestones и начни его выполнение.`
                    : `🎯 Goal established: "${cleanTitle}". Immediately formulate a work plan (3-7 concrete steps) via tool goal_set_milestones and start executing it.`;
                  resumeActiveAgent(startPrompt, sid);
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
                    resumeActiveAgent(prompt, sid);
                  }
                  break;
                }
                case 'pause':
                  result = engine.pause(reason || 'Пауза по кнопке интерфейса', sid);
                  stopRunningAgents(sid);
                  break;
                case 'resume':
                  result = engine.resume(sid);
                  resumeActiveAgent(undefined, sid);
                  break;
                case 'cancel':
                  result = engine.cancel(reason || 'Отмена цели', sid);
                  stopRunningAgents(sid);
                  break;
                case 'clear':
                  result = engine.clear(sid);
                  stopRunningAgents(sid);
                  sessionAgents.delete(sid);
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
          } catch (_) {}
        }
      }
      sseClients.clear();
    };
  }, 'dsh-goal: HTTP WebServer Routes & SSE');

  // 6. Подписка на события сессии (автономный цикл)
  ctx.effect(() => {
    // Подписка на завершение turn
    const onTurnEnd = (turn) => {
      const liveConfig = getConfig();
      if (!liveConfig.autoDrive) return; // Учитываем настройку autoDrive в рантайме

      const sid = sessionIdOf(turn, 'default');

      // Накопление токенов по завершении хода
      const usage = turn?.usage || turn?.meta?.usage || turn?.response?.usage || turn?.turn?.usage;
      if (usage) {
        engine.addTokenUsage(usage, sid);
      }

      const snap = engine.getSnapshot(sid);
      if (snap.hasActiveGoal && snap.state === GoalState.RUNNING) {
        // Tool-Failure Breaker: отслеживание повторяющихся ошибок инструментов
        const steps = turn?.steps || turn?.turn?.steps || [];
        const hasStepError = Array.isArray(steps) && steps.some((s) => {
          return s?.status === 'error' || s?.error || s?.toolResult?.isError;
        });
        const hasTurnError = Boolean(turn?.error || turn?.reason?.kind === 'error');
        const isToolFailure = hasStepError || hasTurnError;

        if (isToolFailure) {
          const failCount = engine.incrementToolFailureCount(sid);
          const limit = liveConfig.consecutiveToolFailureLimit;
          if (limit > 0 && failCount >= limit) {
            const lang = snap.lang || (snap.title ? detectLanguage(snap.title) : 'en');
            const pauseReason = lang === 'ru'
              ? `Повторяющаяся ошибка инструментов (${failCount} подряд) — цель приостановлена для защиты от зацикливания`
              : `Repeated tool failure (${failCount} consecutive) — goal paused to prevent token burn`;
            engine.pause(pauseReason, sid);
            return;
          }
        } else {
          engine.resetToolFailureCount(sid);
        }

        // Проверяем причину завершения хода
        if (turn?.reason?.kind === 'aborted' || turn?.reason?.kind === 'error' || turn?.error) {
          return;
        }

        // Item 3: Smart Progress Guard — detect idle loops without progress
        const lang = snap.lang || (snap.title ? detectLanguage(snap.title) : 'en');
        const stallCount = engine.incrementStallCount(sid);
        if (stallCount >= 2) {
          const stallReason = lang === 'ru'
            ? 'Агент не продвинулся по плану за последние 2 итерации — требуется внимание оператора'
            : 'Agent made no progress on work plan in the last 2 iterations — operator attention required';
          engine.pause(stallReason, sid);
          return;
        }

        const canContinue = engine.incrementIteration(sid);
        if (!canContinue) return;

        // Item 2: Low-Latency AutoDrive — setImmediate instead of static setTimeout
        const triggerNextTurn = () => {
          const currentSnap = engine.getSnapshot(sid);
          if (currentSnap.hasActiveGoal && currentSnap.state === GoalState.RUNNING) {
            const currentLang = currentSnap.lang || (currentSnap.title ? detectLanguage(currentSnap.title) : 'en');
            let promptText = currentLang === 'ru'
              ? 'Продолжай автономное выполнение цели согласно плану работ. Отмечай каждый выполненный шаг через goal_update_progress, а по завершении всех задач вызови goal_finish.'
              : 'Continue autonomous goal execution according to the work plan. Mark each completed step via goal_update_progress, and when all tasks are complete, call goal_finish.';

            if (currentSnap.pendingNudge) {
              const userNudge = engine.consumePendingNudge(sid);
              if (userNudge) {
                promptText = (currentLang === 'ru'
                  ? `🚨 СРОЧНОЕ УТОЧНЕНИЕ / НАПРАВЛЕНИЕ ОТ ПОЛЬЗОВАТЕЛЯ:\n"${userNudge}"\nСкорректируй выполнение с учётом этого замечания.\n\n`
                  : `🚨 URGENT USER CLARIFICATION / STEERING:\n"${userNudge}"\nAdjust execution adhering to this feedback.\n\n`) + promptText;
              }
            }
            const promptMsg = createGoalUserMessage(promptText);
            let target = sessionAgents.get(sid);
            if (!target && lastActiveAgent && typeof lastActiveAgent.followup === 'function') {
              const lastSid = sessionIdOf(lastActiveAgent, null);
              if (!lastSid || lastSid === sid || sid === 'default') {
                target = lastActiveAgent;
              }
            }
            if (!target && agentsService && typeof agentsService.list === 'function') {
              const list = agentsService.list();
              if (list && list.length > 0) {
                for (let i = list.length - 1; i >= 0; i--) {
                  const cand = list[i];
                  if (sessionIdOf(cand, null) === sid) {
                    target = cand;
                    break;
                  }
                }
                if (!target && sid === 'default') target = list[list.length - 1];
              }
            }

            if (target && typeof target.followup === 'function' && target.status !== 'stopped') {
              try {
                target.followup(promptMsg);
                sessionAgents.set(sid, target);
              } catch (err) {
                console.warn('[dsh-goal] Failed auto-drive followup:', err);
              }
            }
          }
        };

        if (typeof setImmediate === 'function') {
          setImmediate(triggerNextTurn);
        } else {
          setTimeout(triggerNextTurn, 0);
        }
      }
    };

    // Подписка на запрос подтверждения (approval/asked) -> автоматическая пауза
    const onApprovalAsked = (event) => {
      const sid = sessionIdOf(event, 'default');
      const snap = engine.getSnapshot(sid);
      if (snap.hasActiveGoal && snap.state === GoalState.RUNNING) {
        const lang = snap.lang || (snap.title ? detectLanguage(snap.title) : 'en');
        const pauseReason = lang === 'ru'
          ? 'Ожидание подтверждения действия оператором'
          : 'Waiting for operator confirmation/approval';
        engine.pause(pauseReason, sid);
      }
    };

    ctx.on?.('turn/end', onTurnEnd);
    ctx.on?.('approval/asked', onApprovalAsked);

    return () => {
      ctx.off?.('turn/end', onTurnEnd);
      ctx.off?.('approval/asked', onApprovalAsked);
    };
  }, 'dsh-goal: Session & Turn Coordinator');
}
