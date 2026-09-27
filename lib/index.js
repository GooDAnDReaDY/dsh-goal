import path from 'node:path';
import os from 'node:os';
import z from '@deepseek-ai/schemastery';
import { AddonStore } from './addon-store.js';
import { TokenBudgetGuard } from './token-budget-guard.js';
import { GitSnapshotManager } from './git-snapshot-manager.js';
import { MilestoneManager } from './milestone-manager.js';
import { registerRoutes } from './routes.js';
import { registerTools } from './tools.js';
import { saveGoalReportFile } from './engine-reports.js';
import { registerPluginUpdater } from './updater.js';
import { GoalEngine, GoalState } from './goal-engine.js';
import { sessionIdOf } from './goal-engine-constants.js';

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
  enableLiveActivityFeed: z.boolean().default(true).description('Display compact recent tool and control activity feed in details modal'),
  enablePreplanning: z.boolean().default(true).description('Generate initial draft plan for approval before launching autonomous turns'),
  autoBranchOnGoalStart: z.boolean().default(true).description('Automatically create dedicated isolated git branch for goal execution'),
  enablePostGoalRetrospective: z.boolean().default(true).description('Generate structured retrospective and analytics card upon goal completion'),
  autoScaleBudgetNearCompletion: z.boolean().default(false).description('Automatically grant token buffer extension if budget reaches 100% near completion'),
  enableTemplatesDrawer: z.boolean().default(true).description('Provide pre-configured engineering goal templates in UI drawer'),
  enableMilestoneDependencies: z.boolean().default(true).description('Enforce milestone dependency ordering and block premature execution'),
  soundScheme: z.string().default('default').description('Audio theme for status and milestone notifications'),
  enableVoiceAnnouncements: z.boolean().default(false).description('Use Web Speech API for voice announcements on milestone events'),
  storagePath: z.string().default('').description('Custom filesystem path for persistent state storage'),
});

/**
 * Safely access a service from Cordis context without throwing if un-injected.
 * @param {any} ctx
 * @param {string} name
 * @returns {any}
 */
export function safeService(ctx, name) {
  if (!ctx) return null;
  try {
    if (ctx.reflect && typeof ctx.reflect.get === "function") {
      return ctx.reflect.get(name, false) || null;
    }
    return ctx[name] || null;
  } catch {
    return null;
  }
}

export function apply(ctx, config = {}) {
  let settingsScope = null;
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
    enableLiveActivityFeed: config?.enableLiveActivityFeed ?? true,
    enablePreplanning: config?.enablePreplanning ?? true,
    autoBranchOnGoalStart: config?.autoBranchOnGoalStart ?? true,
    enablePostGoalRetrospective: config?.enablePostGoalRetrospective ?? true,
    autoScaleBudgetNearCompletion: config?.autoScaleBudgetNearCompletion ?? false,
    enableTemplatesDrawer: config?.enableTemplatesDrawer ?? true,
    enableMilestoneDependencies: config?.enableMilestoneDependencies ?? true,
    soundScheme: config?.soundScheme ?? 'default',
    enableVoiceAnnouncements: config?.enableVoiceAnnouncements ?? false,
    storagePath: config?.storagePath,
  };

  const defaultStorageDir = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const customStorage = typeof currentSettings.storagePath === 'string' && currentSettings.storagePath.trim()
    ? currentSettings.storagePath.trim()
    : null;
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT);
  const storagePath = customStorage || (isTest ? null : path.join(defaultStorageDir, 'dsh-goal-state.json'));
  const logger = ctx.logger ? ctx.logger('goal') : console;

  // Initialize addon modules
  const addonStore = new AddonStore(storagePath, logger);
  const gitSnapshotManager = new GitSnapshotManager(addonStore, { logger });
  const milestoneManager = new MilestoneManager(addonStore, {
    gitSnapshotManager,
    enforceDependencies: currentSettings.enableMilestoneDependencies,
    logger,
  });
  const tokenBudgetGuard = new TokenBudgetGuard({
    maxTokenBudget: currentSettings.maxTokenBudget,
    warningThreshold: currentSettings.budgetWarningThreshold,
    autoScaleNearCompletion: currentSettings.autoScaleBudgetNearCompletion,
    logger,
  });

  // Attempt migration of legacy state if present
  try {
    const agentsSvc = safeService(ctx, "agents");
    const firstAgent = agentsSvc?.get?.(agentsSvc?.keys?.()?.next()?.value);
    addonStore.migrateLegacyState(storagePath, safeService(ctx, "goals"), firstAgent);
  } catch (migErr) {
    logger.warn?.('[dsh-goal] Legacy migration check failed:', migErr.message);
  }

  // Register addon tools: goal_milestones and goal_checklist
  registerTools(ctx, {
    milestoneManager,
    goalsService: safeService(ctx, "goals"),
    logger,
  });

  // Support fallback engine for tests or non-core environments
  let fallbackEngine = null;
  if (!safeService(ctx, "goals")) {
    fallbackEngine = new GoalEngine({
      storagePath,
      defaultMaxIterations: currentSettings.maxIterations,
      autoDrive: currentSettings.autoDrive,
      consecutiveToolFailureLimit: currentSettings.consecutiveToolFailureLimit,
      maxTokenBudget: currentSettings.maxTokenBudget,
      budgetWarningThreshold: currentSettings.budgetWarningThreshold,
      autoCheckpointOnMilestone: currentSettings.autoCheckpointOnMilestone,
      enableLiveActivityFeed: currentSettings.enableLiveActivityFeed,
      enablePreplanning: currentSettings.enablePreplanning,
      autoBranchOnGoalStart: currentSettings.autoBranchOnGoalStart,
      enablePostGoalRetrospective: currentSettings.enablePostGoalRetrospective,
      autoScaleBudgetNearCompletion: currentSettings.autoScaleBudgetNearCompletion,
      enableTemplatesDrawer: currentSettings.enableTemplatesDrawer,
      enableMilestoneDependencies: currentSettings.enableMilestoneDependencies,
    });
  }

  // 1. One-click auto-updater registration (Issue #99)
  if (ctx?.webServer?.register) {
    if (typeof ctx?.effect === 'function') {
      ctx.effect(() => {
        let unreg = null;
        try {
          unreg = registerPluginUpdater(ctx, {
            packageName: '@goodandready/dsh-goal',
            endpoint: '/api/dsh-goal/update',
            manifestUrl: new URL('../package.json', import.meta.url),
          });
        } catch (err) {
          logger.warn?.('Failed to register plugin updater:', err.message);
        }
        return () => {
          if (typeof unreg === 'function') unreg();
        };
      }, 'dsh-goal: plugin auto-updater');
    } else {
      registerPluginUpdater(ctx, {
        packageName: '@goodandready/dsh-goal',
        endpoint: '/api/dsh-goal/update',
        manifestUrl: new URL('../package.json', import.meta.url),
      });
    }
  }

  // 2. WebServer HTTP & SSE routes (registered after updater so it remains primary)
  const { broadcastEvent } = registerRoutes(ctx, {
    engine: fallbackEngine,
    milestoneManager,
    gitSnapshotManager,
    tokenBudgetGuard,
    addonStore,
    goalsService: safeService(ctx, "goals"),
    getConfig: () => currentSettings,
    sseClients,
    logger,
  });

  // 3. Listen to core goal/changed events if ctx.on exists
  if (typeof ctx?.on === 'function') {
    ctx.on('goal/changed', async ({ agent, change }) => {
      if (!change) return;
      const op = change.operation;
      const goal = change.goal;
      const goalId = goal?.id || change.ref?.id;

      if (op === 'create' || op === 'resume') {
        tokenBudgetGuard.resetGoal(goalId);
        broadcastEvent('goal_status', { op, goalId, goal });
      }

      if (op === 'complete' || op === 'clear') {
        try {
          const milestones = milestoneManager.getMilestones(goalId);
          const snapshots = addonStore.getSnapshots(goalId);
          const savedPath = saveGoalReportFile(goal || { id: goalId, objective: 'Completed Goal' }, {
            milestones,
            snapshots,
          });
          if (savedPath) {
            logger.info?.(`[dsh-goal] Saved goal report to "${savedPath}"`);
          }
        } catch (err) {
          logger.warn?.('[dsh-goal] Failed to save goal report on completion:', err.message);
        }
        broadcastEvent('goal_status', { op, goalId, goal });
      }

      if (op === 'block') {
        logger.info?.(`[dsh-goal] Goal "${goalId}" blocked: ${goal?.blockedReason?.message || 'Policy block'}`);
        broadcastEvent('goal_status', { op, goalId, goal });
      }
    });

    // Inject milestone prompts and check budget during agent turns
    ctx.on('agent/pre-step', async ({ agent, messages, step, signal }, next) => {
      const goalsSvc = safeService(ctx, "goals");
      if (goalsSvc && typeof goalsSvc.get === "function" && agent) {
        try {
          const currentGoal = goalsSvc.get(agent);
          if (currentGoal && currentGoal.phase === 'active') {
            const goalId = currentGoal.id;

            // 1. Budget check
            const milestones = milestoneManager.getMilestones(goalId);
            const budgetCheck = tokenBudgetGuard.checkBudget({
              agent,
              goal: currentGoal,
              tokenMeter: safeService(ctx, "tokenMeter"),
              goalsService: goalsSvc,
              milestones,
            });

            // 2. Active milestone prompt guidance
            const milestonePrompt = milestoneManager.getActiveMilestonePrompt(goalId);
            if (milestonePrompt && Array.isArray(messages)) {
              let promptText = milestonePrompt;
              if (budgetCheck.status === 'warning') {
                promptText += `\n${budgetCheck.message}`;
              } else if (budgetCheck.status === 'auto_scaled') {
                promptText += `\n${budgetCheck.message}`;
              }
              messages.push({
                role: 'system',
                content: promptText,
              });
            }
          }
        } catch (err) {
          logger.warn?.('[dsh-goal] agent/pre-step error:', err.message);
        }
      }
      return next ? next() : undefined;
    });

    // Compatibility events for turn/end and approval/asked
    ctx.on('turn/end', (event) => {
      // noop or session isolation
    });

    ctx.on('approval/asked', (event) => {
      if (!fallbackEngine) return;
      const sid = sessionIdOf(event, 'default');
      const snap = fallbackEngine.getSnapshot(sid);
      if (snap && snap.hasActiveGoal && snap.state === GoalState.RUNNING) {
        fallbackEngine.pause('Waiting for operator confirmation/approval', sid);
      }
    });
  }

  // Settings synchronization
  const applySettings = (patch) => {
    if (!patch || typeof patch !== 'object') return;
    currentSettings = { ...currentSettings, ...patch };
    tokenBudgetGuard.updateConfig({
      maxTokenBudget: currentSettings.maxTokenBudget,
      warningThreshold: currentSettings.budgetWarningThreshold,
      autoScaleNearCompletion: currentSettings.autoScaleBudgetNearCompletion,
    });
    milestoneManager.enforceDependencies = Boolean(currentSettings.enableMilestoneDependencies);
    if (typeof patch.storagePath === 'string' && patch.storagePath.trim()) {
      addonStore.setStoragePath(patch.storagePath.trim());
    }
  };

  if (typeof ctx?.inject === 'function') {
    ctx.inject(['settings'], (sctx) => {
      try {
        const scope = sctx.settings?.register?.(NS, Config, { base: currentSettings });
        if (scope) {
          settingsScope = scope;
          if (typeof scope.get === 'function') {
            applySettings(scope.get());
          }
          if (typeof scope.subscribe === 'function') {
            sctx.effect?.(() => {
              const off = scope.subscribe(() => {
                if (typeof scope.get === 'function') applySettings(scope.get());
              });
              return () => {
                if (typeof off === 'function') off();
                settingsScope = null;
              };
            }, 'dsh-goal: settings subscription');
          }
        }
      } catch (err) {
        logger.warn?.('Settings register skipped:', err.message);
      }
    });
  }

  if (typeof ctx?.effect === 'function') {
    ctx.effect(() => () => {
      try {
        addonStore.flushSync();
      } catch (e) { /* ignore */ }
    }, 'dsh-goal: teardown');
  }

  return {
    addonStore,
    milestoneManager,
    tokenBudgetGuard,
    gitSnapshotManager,
    engine: fallbackEngine,
  };
}
