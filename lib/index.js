import path from 'node:path';
import os from 'node:os';
import z from '@deepseek-ai/schemastery';
import { GoalEngine, GoalState, detectLanguage, sessionIdOf } from './goal-engine.js';
import { parseGoalInput, executeGoalSlashCommand, createGoalUserMessage } from './command-handler.js';
import { registerRoutes } from './routes.js';
import { registerTools } from './tools.js';
import { registerPluginUpdater } from './updater.js';

export const name = '@goodandready/dsh-goal';
export const inject = ['webServer', 'settings'];

const NS = 'dsh-goal';

export const Config = z.object({
  maxIterations: z.number().default(25).description('Safety limit: max autonomous iterations per goal'),
  autoDrive: z.boolean().default(true).description('Automatically continue the loop after each turn'),
  enableSound: z.boolean().default(true).description('Play synthesized audio chime on goal completion or failure'),
  showQuickLaunchButton: z.boolean().default(true).description('Show quick launch goal button above composer dock'),
  consecutiveToolFailureLimit: z.number().default(3).description('Auto-pause goal if N consecutive turns encounter tool execution errors (0 to disable)'),
  enableBrowserNotifications: z.boolean().default(true).description('Show desktop notifications on goal completion or failure'),
  maxTokenBudget: z.number().default(0).description('Maximum token budget per goal session (0 to disable)'),
  budgetWarningThreshold: z.number().default(80).description('Percentage of token budget consumed before model warning injection (e.g. 80)'),
  autoCheckpointOnMilestone: z.boolean().default(false).description('Automatically create git commit checkpoint upon milestone completion'),
  storagePath: z.string().default('').description('Custom filesystem path for persistent state storage'),
});

export function apply(ctx, config = {}) {
  let settingsScope = null;
  let agentsService = null;
  const runningAgents = new Set();
  const sessionAgents = new Map();
  let lastActiveAgent = null;
  const sseClients = new Map();

  let currentSettings = {
    maxIterations: config?.maxIterations ?? 25,
    autoDrive: config?.autoDrive ?? true,
    enableSound: config?.enableSound ?? true,
    showQuickLaunchButton: config?.showQuickLaunchButton ?? true,
    consecutiveToolFailureLimit: config?.consecutiveToolFailureLimit ?? 3,
    enableBrowserNotifications: config?.enableBrowserNotifications ?? true,
    maxTokenBudget: config?.maxTokenBudget ?? 0,
    budgetWarningThreshold: config?.budgetWarningThreshold ?? 80,
    autoCheckpointOnMilestone: config?.autoCheckpointOnMilestone ?? false,
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
    maxTokenBudget: currentSettings.maxTokenBudget,
    budgetWarningThreshold: currentSettings.budgetWarningThreshold,
    autoCheckpointOnMilestone: currentSettings.autoCheckpointOnMilestone,
    storagePath,
  });

  // Track running agents through global DSH core event
  ctx.inject(['agents'], (actx) => {
    agentsService = actx.agents;
  });

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
    const defaultResumePrompt = lang === 'zh'
      ? '▶️ 用户已恢复目标。请继续执行工作计划，并通过 goal_update_progress 更新进度。'
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
              maxTokenBudget: typeof live.maxTokenBudget === 'number' ? live.maxTokenBudget : currentSettings.maxTokenBudget,
              budgetWarningThreshold: typeof live.budgetWarningThreshold === 'number' ? live.budgetWarningThreshold : currentSettings.budgetWarningThreshold,
              autoCheckpointOnMilestone: typeof live.autoCheckpointOnMilestone === 'boolean' ? live.autoCheckpointOnMilestone : currentSettings.autoCheckpointOnMilestone,
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
      maxTokenBudget: live.maxTokenBudget,
      budgetWarningThreshold: live.budgetWarningThreshold,
      autoCheckpointOnMilestone: live.autoCheckpointOnMilestone,
    });
  };

  // 1. Settings registration
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

  // 2. Chat slash command /goal registration
  ctx.inject(['commands'], (cctx) => {
    try {
      if (typeof cctx.commands?.register !== 'function') return;
      const unregister = cctx.commands.register({
        name: 'goal',
        description: 'Manage Goal Mode: activate, milestones, pause, resume, and clear',
        input: { hint: '[<objective>|clear|pause|resume]' },
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

  // 3. System prompt context injection
  ctx.inject(['systemPrompt'], (pctx) => {
    try {
      if (typeof pctx.systemPrompt?.section === 'function') {
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

  // 4. Tools registration
  registerTools(ctx, { engine, resumeActiveAgent });

  // 5. One-click auto-updater registration
  if (ctx.webServer?.register) {
    try {
      registerPluginUpdater(ctx, {
        packageName: '@goodandready/dsh-goal',
        endpoint: '/api/dsh-goal/update',
        manifestUrl: new URL('../package.json', import.meta.url),
      });
    } catch (err) {
      console.warn('[dsh-goal] Failed to register plugin updater:', err.message);
    }
  }

  // 6. WebServer HTTP & SSE routes
  registerRoutes(ctx, {
    engine,
    getConfig,
    stopRunningAgents,
    resumeActiveAgent,
    sessionAgents,
    sseClients,
  });

  // 7. Turn coordinator & tool-failure breaker
  ctx.effect(() => {
    const onTurnEnd = (turn) => {
      const liveConfig = getConfig();
      if (!liveConfig.autoDrive) return;

      const sid = sessionIdOf(turn, 'default');
      const usage = turn?.usage || turn?.meta?.usage || turn?.response?.usage || turn?.turn?.usage;
      if (usage) {
        engine.addTokenUsage(usage, sid);
      }

      const snap = engine.getSnapshot(sid);
      if (snap.hasActiveGoal && snap.state === GoalState.RUNNING) {
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
            const pauseReason = lang === 'zh'
              ? `工具重复出错（连续 ${failCount} 次）— 目标已暂停以防止死循环`
              : `Repeated tool failure (${failCount} consecutive) — goal paused to prevent token burn`;
            engine.pause(pauseReason, sid);
            return;
          }
        } else {
          engine.resetToolFailureCount(sid);
        }

        if (turn?.reason?.kind === 'aborted' || turn?.reason?.kind === 'error' || turn?.error) {
          return;
        }

        const lang = snap.lang || (snap.title ? detectLanguage(snap.title) : 'en');
        const stallCount = engine.incrementStallCount(sid);
        if (stallCount >= 2) {
          const stallReason = lang === 'zh'
            ? '智能体在过去 2 次迭代中未推进工作计划 — 需要操作员关注'
            : 'Agent made no progress on work plan in the last 2 iterations — operator attention required';
          engine.pause(stallReason, sid);
          return;
        }

        const canContinue = engine.incrementIteration(sid);
        if (!canContinue) return;

        const triggerNextTurn = () => {
          const currentSnap = engine.getSnapshot(sid);
          if (currentSnap.hasActiveGoal && currentSnap.state === GoalState.RUNNING) {
            const currentLang = currentSnap.lang || (currentSnap.title ? detectLanguage(currentSnap.title) : 'en');
            let promptText = currentLang === 'zh'
              ? '请按照工作计划继续自主执行目标。每完成一步请通过 goal_update_progress 记录，所有任务完成后调用 goal_finish。'
              : 'Continue autonomous goal execution according to the work plan. Mark each completed step via goal_update_progress, and when all tasks are complete, call goal_finish.';

            if (currentSnap.pendingNudge) {
              const userNudge = engine.consumePendingNudge(sid);
              if (userNudge) {
                promptText = (currentLang === 'zh'
                  ? `🚨 用户紧急说明/指导方向：\n"${userNudge}"\n请根据此反馈调整执行。\n\n`
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

    const onApprovalAsked = (event) => {
      const sid = sessionIdOf(event, 'default');
      const snap = engine.getSnapshot(sid);
      if (snap.hasActiveGoal && snap.state === GoalState.RUNNING) {
        const lang = snap.lang || (snap.title ? detectLanguage(snap.title) : 'en');
        const pauseReason = lang === 'zh'
          ? '等待操作员确认/批准操作'
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
