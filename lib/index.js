import path from 'node:path';
import os from 'node:os';
import z from '@deepseek-ai/schemastery';
// Polyfill volatile schema modifier if running against schemastery < 3.18.4
if (typeof z.Schema?.prototype?.volatile !== 'function') {
  const proto = z.Schema ? z.Schema.prototype : (typeof z === 'function' ? Object.getPrototypeOf(z.string?.() || {}) : null);
  if (proto && typeof proto.extra === 'function' && typeof proto.volatile !== 'function') {
    proto.volatile = function volatile() {
      if (this.meta?.volatile) throw new TypeError('volatile schema is already wrapped');
      return this.extra('volatile', true);
    };
  }
}

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
  maxIterations: z.number().default(25).volatile().description('Safety limit: max autonomous iterations per goal'),
  autoDrive: z.boolean().default(true).volatile().description('Automatically continue the loop after each turn'),
  enableSound: z.boolean().default(true).volatile().description('Play synthesized audio chime on goal completion or failure'),
  showQuickLaunchButton: z.boolean().default(true).volatile().description('Show quick launch goal button above composer dock'),
  consecutiveToolFailureLimit: z.number().default(3).volatile().description('Auto-pause goal if N consecutive turns encounter tool execution errors (0 to disable)'),
  enableBrowserNotifications: z.boolean().default(true).volatile().description('Show desktop notifications on goal completion or failure'),
  maxTokenBudget: z.number().default(0).volatile().description('Maximum token budget per goal session (0 to disable)'),
  budgetWarningThreshold: z.number().default(80).volatile().description('Percentage of token budget consumed before model warning injection (e.g. 80)'),
  autoCheckpointOnMilestone: z.boolean().default(false).volatile().description('Automatically create git commit checkpoint upon milestone completion'),
  enableLiveActivityFeed: z.boolean().default(true).volatile().description('Display compact recent tool and control activity feed in details modal'),
  enablePreplanning: z.boolean().default(true).volatile().description('Generate initial draft plan for approval before launching autonomous turns'),
  autoBranchOnGoalStart: z.boolean().default(true).volatile().description('Automatically create dedicated isolated git branch for goal execution'),
  enablePostGoalRetrospective: z.boolean().default(true).volatile().description('Generate structured retrospective and analytics card upon goal completion'),
  autoScaleBudgetNearCompletion: z.boolean().default(false).volatile().description('Automatically grant token buffer extension if budget reaches 100% near completion'),
  enableTemplatesDrawer: z.boolean().default(true).volatile().description('Provide pre-configured engineering goal templates in UI drawer'),
  enableMilestoneDependencies: z.boolean().default(true).volatile().description('Enforce milestone dependency ordering and block premature execution'),
  soundScheme: z.string().default('default').volatile().description('Audio theme for status and milestone notifications'),
  enableVoiceAnnouncements: z.boolean().default(false).volatile().description('Use Web Speech API for voice announcements on milestone events'),
  storagePath: z.string().default('').volatile().description('Custom filesystem path for persistent state storage'),
});

// DSH serves a namespace's settings form from the volatile fields of its profile
// entry schema, and a volatile field holds a Volatile box rather than its value.
// Unwrap before any caller reads one, and read lazily: the Loader mutates the
// boxes in place and re-announces them with loader/volatile-update.
export function plainConfig(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(plainConfig)
  if (typeof value.get === 'function') return plainConfig(value.get())
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plainConfig(v)]))
}

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
  } catch (err) {
    return null;
  }
}

export function apply(ctx, config = {}) {
  const sseClients = new Map();
  const cfg = plainConfig(config || {});

  let currentSettings = {
    maxIterations: cfg?.maxIterations ?? 25,
    autoDrive: cfg?.autoDrive ?? true,
    enableSound: cfg?.enableSound ?? true,
    showQuickLaunchButton: cfg?.showQuickLaunchButton ?? true,
    consecutiveToolFailureLimit: cfg?.consecutiveToolFailureLimit ?? 3,
    enableBrowserNotifications: cfg?.enableBrowserNotifications ?? true,
    maxTokenBudget: cfg?.maxTokenBudget ?? 0,
    budgetWarningThreshold: cfg?.budgetWarningThreshold ?? 80,
    autoCheckpointOnMilestone: cfg?.autoCheckpointOnMilestone ?? false,
    enableLiveActivityFeed: cfg?.enableLiveActivityFeed ?? true,
    enablePreplanning: cfg?.enablePreplanning ?? true,
    autoBranchOnGoalStart: cfg?.autoBranchOnGoalStart ?? true,
    enablePostGoalRetrospective: cfg?.enablePostGoalRetrospective ?? true,
    autoScaleBudgetNearCompletion: cfg?.autoScaleBudgetNearCompletion ?? false,
    enableTemplatesDrawer: cfg?.enableTemplatesDrawer ?? true,
    enableMilestoneDependencies: cfg?.enableMilestoneDependencies ?? true,
    soundScheme: cfg?.soundScheme ?? 'default',
    enableVoiceAnnouncements: cfg?.enableVoiceAnnouncements ?? false,
    storagePath: cfg?.storagePath,
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
    if (fallbackEngine && typeof fallbackEngine.updateConfig === 'function') {
      fallbackEngine.updateConfig({
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
  };

  // DSH hands the plugin the entry config, whose .volatile() fields hold Volatile
  // boxes. The settings service re-merges that config and announces it with
  // loader/volatile-update, which both 0.1.7-rc.2 and 0.2.0 emit. settings.register
  // exists in neither release, so the scope it returned never existed and every
  // setting changed in the card had no effect on the running engine.
  const readEntrySettings = () => plainConfig(config || {});
  applySettings(readEntrySettings());

  if (typeof ctx?.on === 'function') {
    try {
      ctx.on('loader/volatile-update', () => {
        try {
          applySettings(readEntrySettings());
        } catch (err) {
          logger.warn?.('dsh-goal: settings refresh failed:', err?.message || err);
        }
      });
    } catch (err) {
      logger.warn?.('dsh-goal: volatile-update subscription failed:', err?.message || err);
    }
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
