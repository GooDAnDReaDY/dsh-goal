import { validateVerificationCommand } from './engine-verification.js';
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
        if (Array.isArray(args.milestones)) {
          for (const m of args.milestones) {
            const vCmd = m && (m.verificationCommand || m.verification_command);
            if (vCmd) {
              const val = validateVerificationCommand(vCmd);
              if (!val.valid) throw new Error(`Invalid verificationCommand: ${val.error}`);
            }
          }
        }
        const list = mm.setMilestones(goalId, args.milestones);
        return { ok: true, goalId, count: list.length, milestones: list };
      }

      if (action === 'add') {
        const vCmd = args.verificationCommand || args.verification_command;
        if (vCmd) {
          const val = validateVerificationCommand(vCmd);
          if (!val.valid) throw new Error(`Invalid verificationCommand: ${val.error}`);
        }
        const item = mm.addMilestone(goalId, {
          title: args.title,
          checklist: args.checklist,
          dependsOn: args.dependsOn || args.depends_on,
          verificationCommand: vCmd,
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
                verificationCommand: { type: 'string', description: 'Optional shell command to verify milestone completion' },
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
          verificationCommand: {
            type: 'string',
            description: 'Verification command when action is "add"',
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
          const vCmd = item && (item.verificationCommand || item.verification_command);
          if (vCmd) {
            const val = validateVerificationCommand(vCmd);
            if (!val.valid) throw new Error(`Invalid verificationCommand: ${val.error}`);
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
      const vCmd = args.verificationCommand || args.verification_command;
      if (vCmd) {
        const val = validateVerificationCommand(vCmd);
        if (!val.valid) throw new Error(`Invalid verificationCommand: ${val.error}`);
      }
      if (status === 'completed') {
        const rawCwd = toolCtx?.session?.cwd || toolCtx?.cwd || process.cwd();
        const safeCwd = getSafeCwd(rawCwd);
        const completed = await mm.completeMilestone(goalId, milestoneId, notes, safeCwd);
        return { ok: true, goalId, milestoneId, status: 'completed', milestone: completed };
      }
      const updated = mm.updateMilestone(goalId, milestoneId, {
        status,
        notes,
        checklist: args.checklist,
        verificationCommand: args.verificationCommand || args.verification_command,
      });
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
          verificationCommand: { type: 'string', description: 'Optional verification command to set or update' },
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

    // Tool 6: goal_ask_operator (#166)
    const handleGoalAskOperator = async (args = {}, toolCtx = {}) => {
      const goalId = args.goalId || args.goal_id || resolveGoalId(toolCtx);
      const question = args.question || args.prompt;
      if (!question || typeof question !== 'string' || !question.trim()) {
        throw new Error('Field "question" is required and must be a non-empty string');
      }

      const options = Array.isArray(args.options) ? args.options : [];
      const isBlocking = args.isBlocking !== false && args.is_blocking !== false;

      const engine = ctx.goalEngine || (ctx.get && ctx.get('goalEngine'));
      if (engine && typeof engine.askOperator === 'function') {
        const res = engine.askOperator({ question, options, isBlocking }, goalId);
        if (!res.ok) {
          throw new Error(`Failed to present question to operator: ${res.error}`);
        }
        return {
          ok: true,
          goalId,
          queryId: res.queryId,
          question: res.question,
          options: res.options,
          isBlocking: res.isBlocking,
          message: isBlocking
            ? 'Question submitted to human operator. Goal is paused awaiting operator input.'
            : 'Question submitted to human operator in non-blocking mode.',
        };
      }

      return {
        ok: true,
        goalId,
        question,
        options,
        message: 'Question logged.',
      };
    };

    safeRegister({
      name: 'goal_ask_operator',
      description: 'Ask the human operator a clarification question or present architectural choices when encountering blockers (#166). Pauses autonomous execution without consuming iterations until the operator responds.',
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'The clarification question, design decision, or blocker to ask the human operator',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of predefined choices or alternative options for the operator to select with one click',
          },
          is_blocking: {
            type: 'boolean',
            description: 'Whether to pause goal execution awaiting operator response (default: true)',
          },
        },
        required: ['question'],
      },
      output: JSON_OUTPUT,
      execute: handleGoalAskOperator,
    });

    // Tool 7: goal_spawn_subgoal (Issue #170)
    const handleGoalSpawnSubgoal = async (args = {}, toolCtx = {}) => {
      const parentSessionId = args.goalId || args.goal_id || resolveGoalId(toolCtx);
      const title = args.title || args.goal;
      if (!title || typeof title !== 'string' || !title.trim()) {
        throw new Error('Field "title" is required and must be a non-empty string');
      }

      const engine = ctx.goalEngine || (ctx.get && ctx.get('goalEngine'));
      if (engine && typeof engine.spawnSubGoal === 'function') {
        const res = engine.spawnSubGoal({
          title: title.trim(),
          prompt: args.prompt || args.description,
          maxIterations: args.max_iterations ?? args.maxIterations,
          inheritContext: args.inherit_context ?? args.inheritContext,
        }, parentSessionId);

        if (!res.ok) {
          throw new Error(`Failed to spawn sub-goal: ${res.error}`);
        }

        return {
          ok: true,
          parentGoalId: res.parentGoalId,
          parentSessionId: res.parentSessionId,
          subGoalId: res.subGoalId,
          childSessionId: res.childSessionId,
          title: title.trim(),
          message: 'Sub-goal spawned with isolated execution context. Complete sub-milestones and invoke goal_finish to conclude.',
        };
      }

      return {
        ok: true,
        parentSessionId,
        title: title.trim(),
        message: 'Sub-goal registered (fallback mode).',
      };
    };

    safeRegister({
      name: 'goal_spawn_subgoal',
      description: 'Spawn a child sub-goal with isolated context and task checklist (#170). When all sub-milestones are completed, invoking goal_finish returns deliverables and control to the parent goal.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Clear, actionable title of the sub-goal',
          },
          prompt: {
            type: 'string',
            description: 'Optional context, detailed instructions, or constraints for the sub-goal',
          },
          max_iterations: {
            type: 'number',
            description: 'Maximum iteration budget for the sub-goal (default: 15)',
          },
          inherit_context: {
            type: 'boolean',
            description: 'Whether the child sub-goal inherits parent goal context summary (default: true)',
          },
        },
        required: ['title'],
      },
      output: JSON_OUTPUT,
      execute: handleGoalSpawnSubgoal,
    });
  });
}
