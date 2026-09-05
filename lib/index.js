import z from '@deepseek-ai/schemastery';
import { GoalEngine, GoalState, MilestoneStatus } from './goal-engine.js';
import { parseGoalInput, executeGoalSlashCommand } from './command-handler.js';

export const name = '@goodandready/dsh-goal';
export const inject = ['webServer', 'settings'];

const NS = 'dsh-goal';

// Схема-функция: в rc.1 settings.register(NS, schema, { base }) ожидает
// schemastery-схему вторым аргументом, а не null.
export const Config = z.object({
  maxIterations: z.number().default(25).description('Safety limit: max autonomous iterations per goal'),
  autoDrive: z.boolean().default(true).description('Automatically continue the loop after each turn'),
  enableSound: z.boolean().default(true).description('Play a sound when a goal completes'),
});

export function apply(ctx, config = {}) {
  let settingsScope = null;
  let currentSettings = {
    maxIterations: config?.maxIterations ?? 25,
    autoDrive: config?.autoDrive ?? true,
    enableSound: config?.enableSound ?? true,
  };

  const engine = new GoalEngine({
    defaultMaxIterations: currentSettings.maxIterations,
    autoDrive: currentSettings.autoDrive,
    enableSound: currentSettings.enableSound,
  });

  const getConfig = () => {
    if (settingsScope) {
      const snap = typeof settingsScope.getSnapshot === 'function' ? settingsScope.getSnapshot() : null;
      const live = (snap && snap.value) ? snap.value : (typeof settingsScope.get === 'function' ? settingsScope.get() : null);
      if (live && typeof live === 'object') {
        return {
          maxIterations: typeof live.maxIterations === 'number' ? live.maxIterations : currentSettings.maxIterations,
          autoDrive: typeof live.autoDrive === 'boolean' ? live.autoDrive : currentSettings.autoDrive,
          enableSound: typeof live.enableSound === 'boolean' ? live.enableSound : currentSettings.enableSound,
        };
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
          const parsed = parseGoalInput(invocation?.rawInput);
          const liveConfig = getConfig();
          return executeGoalSlashCommand(engine, parsed, liveConfig);
        },
      });

      if (typeof unregister === 'function') {
        cctx.effect(() => () => unregister(), 'dsh-goal: /goal command unregister');
      }
    } catch (err) {
      console.warn('[dsh-goal] Commands register skipped:', err.message);
    }
  });

  // 3. Регистрация инструментов для модели (tools)
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
      handler: async ({ milestones }) => {
        const snap = engine.getSnapshot();
        if (!snap.hasActiveGoal) {
          return { error: 'No active goal currently set. Start a goal first.' };
        }
        engine.addMilestones(milestones);
        return {
          success: true,
          milestones: engine.getSnapshot().milestones,
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
      handler: async ({ milestone_id, status, notes }) => {
        const ok = engine.updateMilestone(milestone_id, status, notes);
        if (!ok) {
          return { error: `Milestone ${milestone_id} not found or no active goal.` };
        }
        return {
          success: true,
          snapshot: engine.getSnapshot(),
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
      handler: async ({ summary }) => {
        const snap = engine.completeGoal(summary);
        return {
          success: true,
          completed: true,
          summary,
        };
      },
    });
  });

  // 4. Регистрация HTTP REST API маршрутов
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
          res.statusCode = 200;
          return res.end(JSON.stringify(engine.getSnapshot()));
        }

        // POST /dsh-goal/action
        if (req.method === 'POST' && (pathname === '/dsh-goal/action' || pathname === '/dsh-goal/action/')) {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              const { action, title, description, reason, milestoneId, status, notes } = data;

              let result = null;
              switch (action) {
                case 'start':
                  result = engine.startGoal(title || 'Новая цель', {
                    description,
                    maxIterations: getConfig().maxIterations,
                  });
                  break;
                case 'pause':
                  result = engine.pause(reason);
                  break;
                case 'resume':
                  result = engine.resume();
                  break;
                case 'cancel':
                  result = engine.cancel(reason);
                  break;
                case 'clear':
                  result = engine.clear();
                  break;
                case 'update_milestone':
                  engine.updateMilestone(milestoneId, status, notes);
                  result = engine.getSnapshot();
                  break;
                default:
                  res.statusCode = 400;
                  return res.end(JSON.stringify({ error: `Unknown action: ${action}` }));
              }

              res.statusCode = 200;
              return res.end(JSON.stringify({ ok: true, state: result || engine.getSnapshot() }));
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

  // 5. Подписка на события сессии (автономный цикл)
  ctx.effect(() => {
    // Подписка на завершение turn
    const onTurnEnd = () => {
      const liveConfig = getConfig();
      if (!liveConfig.autoDrive) return; // Учитываем настройку autoDrive в рантайме

      const snap = engine.getSnapshot();
      if (snap.hasActiveGoal && snap.state === GoalState.RUNNING) {
        engine.incrementIteration();
      }
    };

    // Подписка на запрос подтверждения (approval/asked) -> автоматическая пауза
    const onApprovalAsked = () => {
      const snap = engine.getSnapshot();
      if (snap.hasActiveGoal && snap.state === GoalState.RUNNING) {
        engine.pause('Ожидание подтверждения действия оператором');
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
