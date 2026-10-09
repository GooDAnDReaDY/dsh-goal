import { MilestoneManager } from './milestone-manager.js';
import { AddonStore } from './addon-store.js';
import { getSafeCwd } from './goal-engine-constants.js';

/**
 * Tools module for @goodandready/dsh-goal (Core Addon).
 *
 * Register addon goal tools: goal_milestones and goal_checklist.
 * Does NOT register create_goal, get_goal, update_goal (core provides them).
 *
 * @param {any} ctx
 * @param {object} [options]
 * @param {import('./milestone-manager.js').MilestoneManager} [options.milestoneManager]
 * @param {object} [options.goalsService] - core GoalService (ctx.goals)
 * @param {object} [options.logger]
 */
export function registerTools(ctx, { milestoneManager, goalsService, logger = console } = {}) {
  const mm = milestoneManager || new MilestoneManager(new AddonStore(null, logger), { logger });

  ctx.inject(['tools'], (tctx) => {
    if (!tctx.tools?.register) return;

    const safeRegister = (definition) => {
      try {
        const name = definition.name;
        const unregister = tctx.tools.register(definition);
        if (typeof unregister === 'function') {
          tctx.effect?.(() => () => {
            try { unregister(); } catch (e) { /* unregister error non-fatal */ }
          }, `dsh-goal: tool ${name}`);
        }
      } catch (err) {
        logger.warn?.(`[dsh-goal] Tool ${definition.name} registration skipped:`, err.message);
      }
    };

    /** Helper to resolve current goal ID for a tool execution */
    const resolveGoalId = (toolCtx) => {
      if (goalsService) {
        try {
          const agent = toolCtx?.agent || (tctx.agents && toolCtx?.agentId ? tctx.agents.get(toolCtx.agentId) : null);
          if (agent && typeof goalsService.get === 'function') {
            const current = goalsService.get(agent);
            if (current?.id) return current.id;
          }
        } catch (e) { /* ignore */ }
      }
      return toolCtx?.sessionId || toolCtx?.session?.id || 'default';
    };

    const JSON_OUTPUT = {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
      },
    };

    // Tool 1: goal_milestones
    const handleGoalMilestones = async (args = {}, toolCtx = {}) => {
      const goalId = args.goalId || args.goal_id || resolveGoalId(toolCtx);
      const action = args.action || 'list';
      const milestoneId = args.milestoneId || args.milestone_id;

      if (action === 'list') {
        const list = mm.getMilestones(goalId);
        return { ok: true, goalId, milestones: list };
      }

      if (action === 'set') {
        const list = mm.setMilestones(goalId, args.milestones);
        return { ok: true, goalId, count: list.length, milestones: list };
      }

      if (action === 'add') {
        const item = mm.addMilestone(goalId, {
          title: args.title,
          checklist: args.checklist,
          dependsOn: args.dependsOn || args.depends_on,
        });
        return { ok: true, goalId, milestone: item };
      }

      if (action === 'complete') {
        if (!milestoneId) {
          throw new Error('milestoneId is required for complete action');
        }
        const rawCwd = toolCtx?.session?.cwd || toolCtx?.cwd || process.cwd();
        const safeCwd = getSafeCwd(rawCwd);
        const notes = typeof args.notes === 'string' ? args.notes : '';
        const completed = await mm.completeMilestone(goalId, milestoneId, notes, safeCwd);
        return { ok: true, goalId, milestoneId, milestone: completed };
      }

      throw new Error(`Unsupported action "${action}". Allowed: list, set, add, complete`);
    };

    safeRegister({
      name: 'goal_milestones',
      description: 'Manage milestones and work phases for the active goal. Supports list, set, add, and complete.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'set', 'add', 'complete'],
            description: 'Milestone action to perform',
          },
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                checklist: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string' },
                      done: { type: 'boolean' },
                    },
                    required: ['text'],
                  },
                },
                dependsOn: { type: 'array', items: { type: 'string' } },
              },
              required: ['title'],
            },
            description: 'Array of milestones when action is "set"',
          },
          title: { type: 'string', description: 'Milestone title when action is "add"' },
          milestoneId: { type: 'string', description: 'Target milestone ID when action is "complete"' },
          checklist: {
            type: 'array',
            items: { type: 'string' },
            description: 'Initial checklist items for added milestone',
          },
        },
        required: ['action'],
      },
      output: JSON_OUTPUT,
      execute: handleGoalMilestones,
    });

    // Tool 2: goal_checklist
    const handleGoalChecklist = async (args = {}, toolCtx = {}) => {
      const goalId = args.goalId || args.goal_id || resolveGoalId(toolCtx);
      const milestoneId = args.milestoneId || args.milestone_id;
      const index = args.index !== undefined ? args.index : args.item_index;
      const action = args.action || 'toggle';

      if (!milestoneId) {
        throw new Error('milestoneId is required for goal_checklist');
      }
      if (index === undefined || index === null) {
        throw new Error('index is required for goal_checklist');
      }

      if (action === 'toggle') {
        const item = mm.toggleChecklist(goalId, milestoneId, index, args.done);
        return { ok: true, goalId, milestoneId, index, item };
      }

      throw new Error(`Unsupported action "${action}". Allowed: toggle`);
    };

    safeRegister({
      name: 'goal_checklist',
      description: 'Toggle sub-task checklist items within a goal milestone.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['toggle'], description: 'Action to perform' },
          milestoneId: { type: 'string', description: 'Target milestone ID' },
          index: { type: 'number', description: 'Zero-based index of checklist item' },
          done: { type: 'boolean', description: 'Explicit completion flag (optional, toggles if omitted)' },
        },
        required: ['action', 'milestoneId', 'index'],
      },
      output: JSON_OUTPUT,
      execute: handleGoalChecklist,
    });
    // Tool 3: goal_set_milestones (Issue #127 alias matching autonomous-contract prompt)
    const handleGoalSetMilestones = async (args = {}, toolCtx = {}) => {
      const goalId = args.goalId || args.goal_id || resolveGoalId(toolCtx);
      let list = args.milestones;
      if (Array.isArray(list)) {
        list = list.map((item, idx) => {
          if (typeof item === 'string') {
            return { id: `m-${idx + 1}`, title: item };
          }
          return item;
        });
      } else {
        list = [];
      }
      const res = mm.setMilestones(goalId, list);
      return { ok: true, goalId, count: res.length, milestones: res };
    };

    safeRegister({
      name: 'goal_set_milestones',
      description: 'Set initial work plan milestones for the active goal.',
      parameters: {
        type: 'object',
        properties: {
          milestones: {
            type: 'array',
            items: { type: ['string', 'object'] },
            description: 'Array of milestone titles or objects',
          },
        },
        required: ['milestones'],
      },
      output: JSON_OUTPUT,
      execute: handleGoalSetMilestones,
    });

    // Tool 4: goal_update_progress (Issue #127 alias matching autonomous-contract prompt)
    const handleGoalUpdateProgress = async (args = {}, toolCtx = {}) => {
      const goalId = args.goalId || args.goal_id || resolveGoalId(toolCtx);
      const milestoneId = args.milestone_id || args.milestoneId;
      const status = args.status || 'in_progress';
      const notes = typeof args.notes === 'string' ? args.notes : '';
      if (!milestoneId) throw new Error('milestone_id is required');
      if (status === 'completed') {
        const rawCwd = toolCtx?.session?.cwd || toolCtx?.cwd || process.cwd();
        const safeCwd = getSafeCwd(rawCwd);
        const completed = await mm.completeMilestone(goalId, milestoneId, notes, safeCwd);
        return { ok: true, goalId, milestoneId, status: 'completed', milestone: completed };
      }
      const updated = mm.updateMilestone(goalId, milestoneId, { status, notes, checklist: args.checklist });
      return { ok: true, goalId, milestoneId, status, milestone: updated };
    };

    safeRegister({
      name: 'goal_update_progress',
      description: 'Update progress and status of a milestone.',
      parameters: {
        type: 'object',
        properties: {
          milestone_id: { type: 'string', description: 'Target milestone ID' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'blocked'], description: 'Milestone status' },
          notes: { type: 'string', description: 'Brief outcome or status notes' },
          checklist: { type: 'array', items: { type: 'string' }, description: 'Subtask items' },
        },
        required: ['milestone_id', 'status'],
      },
      output: JSON_OUTPUT,
      execute: handleGoalUpdateProgress,
    });

    // Tool 5: goal_finish (Issue #127 alias matching autonomous-contract prompt)
    const handleGoalFinish = async (args = {}, toolCtx = {}) => {
      const goalId = args.goalId || args.goal_id || resolveGoalId(toolCtx);
      const summary = typeof args.summary === 'string' ? args.summary : '';
      if (goalsService && typeof goalsService.complete === 'function') {
        try { goalsService.complete(toolCtx?.agent, summary); } catch (e) { /* ignore */ }
      }
      return { ok: true, goalId, completed: true, summary };
    };

    safeRegister({
      name: 'goal_finish',
      description: 'Finish active goal with final achieved outcome summary.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Comprehensive summary of results' },
        },
        required: ['summary'],
      },
      output: JSON_OUTPUT,
      execute: handleGoalFinish,
    });
  });
}
