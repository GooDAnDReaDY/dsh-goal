import path from 'node:path';
import os from 'node:os';
import z from '@deepseek-ai/schemastery';
import { GoalEngine, GoalState, MilestoneStatus } from './goal-engine.js';
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
  enableSound: z.boolean().default(true).description('Play a sound when a goal completes'),
  storagePath: z.string().default('').description('Custom filesystem path for persistent state storage'),
});

export function apply(ctx, config = {}) {
  let settingsScope = null;
  let agentsService = null;
  const runningAgents = new Set();
  const sessionAgents = new Map(); // sessionId -> agent
  let lastActiveAgent = null;

  let currentSettings = {
    maxIterations: config?.maxIterations ?? 25,
    autoDrive: config?.autoDrive ?? true,
    enableSound: config?.enableSound ?? true,
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
    storagePath,
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
    const resumeMsg = createGoalUserMessage(
      promptText || '▶️ Цель возобновлена пользователем. Продолжай выполнение плана работ с того места, где остановился. Отмечай шаги через goal_update_progress.',
    );
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
        const order = typeof pctx.systemPrompt.getSectionOrder === 'function'
          ? (pctx.systemPrompt.getSectionOrder('TOOL_GOAL') || 600)
          : 600;

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

    // Инструмент 1: Декомпозиция цели на вехи
    tctx.tools.register({
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
      handler: async ({ milestones }, toolCtx) => {
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
      },
    });

    // Инструмент 2: Обновление статуса вехи
    tctx.tools.register({
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
      handler: async ({ milestone_id, status, notes }, toolCtx) => {
        const sid = sessionIdOf(toolCtx, 'default');
        const ok = engine.updateMilestone(milestone_id, status, notes, sid);
        if (!ok) {
          return { error: `Milestone ${milestone_id} not found or no active goal.` };
        }
        return {
          success: true,
          snapshot: engine.getSnapshot(sid),
        };
      },
    });

    // Инструмент 3: Успешное завершение цели
    tctx.tools.register({
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
      handler: async ({ summary }, toolCtx) => {
        const sid = sessionIdOf(toolCtx, 'default');
        const snap = engine.completeGoal(summary, sid);
        return {
          success: true,
          completed: true,
          summary,
        };
      },
    });
  });

  // 5. Регистрация HTTP REST API маршрутов
  ctx.effect(() => {
    if (!ctx.webServer?.register) return () => {};

    const unreg = ctx.webServer.register({
      kind: 'prefix',
      path: '/dsh-goal',
      handler: (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;

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
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const sid = data.sessionId || sessionIdOf(req, 'default');
              const { action, title, description, reason, milestoneId, status, notes } = data;

              let result = null;
              switch (action) {
                case 'start':
                  result = engine.startGoal(title || 'Новая цель', {
                    description,
                    maxIterations: getConfig().maxIterations,
                  }, sid);
                  break;
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
                case 'update_milestone':
                  engine.updateMilestone(milestoneId, status, notes, sid);
                  result = engine.getSnapshot(sid);
                  break;
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
      if (typeof unreg === 'function') unreg();
    };
  }, 'dsh-goal: HTTP WebServer Routes');

  // 6. Подписка на события сессии (автономный цикл)
  ctx.effect(() => {
    // Подписка на завершение turn
    const onTurnEnd = (turn) => {
      const liveConfig = getConfig();
      if (!liveConfig.autoDrive) return; // Учитываем настройку autoDrive в рантайме

      const sid = sessionIdOf(turn, 'default');
      const snap = engine.getSnapshot(sid);
      if (snap.hasActiveGoal && snap.state === GoalState.RUNNING) {
        // Проверяем причину завершения хода
        if (turn?.reason?.kind === 'aborted' || turn?.reason?.kind === 'error' || turn?.error) {
          return;
        }

        const canContinue = engine.incrementIteration(sid);
        if (!canContinue) return;

        setTimeout(() => {
          const currentSnap = engine.getSnapshot(sid);
          if (currentSnap.hasActiveGoal && currentSnap.state === GoalState.RUNNING) {
            const promptMsg = createGoalUserMessage(
              'Продолжай автономное выполнение цели согласно плану работ. Отмечай каждый выполненный шаг через goal_update_progress, а по завершении всех задач вызови goal_finish.',
            );
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
        }, 300);
      }
    };

    // Подписка на запрос подтверждения (approval/asked) -> автоматическая пауза
    const onApprovalAsked = (event) => {
      const sid = sessionIdOf(event, 'default');
      const snap = engine.getSnapshot(sid);
      if (snap.hasActiveGoal && snap.state === GoalState.RUNNING) {
        engine.pause('Ожидание подтверждения действия оператором', sid);
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
