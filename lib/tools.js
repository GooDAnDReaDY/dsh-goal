import { GoalState, sessionIdOf } from './goal-engine-constants.js';

export const JSON_OUTPUT = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, val) => [{ type: 'text', text: JSON.stringify(val) }],
};

/**
 * Format goal snapshot into DSH core-compatible goal representation
 * @param {any} snap
 * @returns {object}
 */
export function formatGoalValue(snap) {
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

/**
 * Register goal management tools into Cordis tools service
 * @param {any} ctx
 * @param {object} options
 * @param {any} options.engine
 * @param {Function} [options.resumeActiveAgent]
 */
export function registerTools(ctx, { engine, resumeActiveAgent, logger = console }) {
  ctx.inject(['tools'], (tctx) => {
    if (!tctx.tools?.register) return;

    const displacedTools = new Map();
    const safeRegister = (definition) => {
      try {
        const name = definition.name;
        const globalTools = tctx.tools.layers?.global?.tools;
        if (globalTools?.data instanceof Map && globalTools.data.has(name)) {
          displacedTools.set(name, globalTools.data.get(name));
          globalTools.data.delete(name);
        }
        const unregister = tctx.tools.register(definition);
        if (typeof unregister === 'function') {
          tctx.effect(() => () => {
            unregister();
            if (displacedTools.has(name) && globalTools?.data instanceof Map) {
              globalTools.data.set(name, displacedTools.get(name));
            }
          }, `dsh-goal: tool ${name}`);
        }
      } catch (err) {
        logger.warn(`[dsh-goal] Tool ${definition.name} registration skipped:`, err.message);
      }
    };

    // Tool 1: get_goal
    const handleGetGoal = async (_args, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const snap = engine.getSnapshot(sid);
      return formatGoalValue(snap);
    };

    safeRegister({
      name: 'get_goal',
      description: 'Get current active goal and its execution phase.',
      parameters: { type: 'object', properties: {} },
      output: JSON_OUTPUT,
      execute: handleGetGoal,
      handler: handleGetGoal,
    });

    // Tool 2: create_goal
    const handleCreateGoal = async (args, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const maxIterations = Number(args.max_goal_rounds) || 25;
      const snap = engine.startGoal(args.objective, { maxIterations }, sid);
      return formatGoalValue(snap);
    };

    safeRegister({
      name: 'create_goal',
      description: 'Initialize a new autonomous goal.',
      parameters: {
        type: 'object',
        properties: {
          objective: { type: 'string', description: 'The overarching objective to achieve' },
          max_goal_rounds: { type: 'number', description: 'Maximum iterations allowed' },
        },
        required: ['objective'],
      },
      output: JSON_OUTPUT,
      execute: handleCreateGoal,
      handler: handleCreateGoal,
    });

    // Tool 3: update_goal
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
          } catch (err) {
            toolCtx?.logger?.debug?.('[dsh-goal] Failed to defer complete context:', err);
          }
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
        if (typeof resumeActiveAgent === 'function') {
          resumeActiveAgent(undefined, sid);
        }
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
          } catch (err) {
            toolCtx?.logger?.debug?.('[dsh-goal] Failed to defer blocked context:', err);
          }
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
      description: 'Update status or parameters of the current active goal.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['pause', 'resume', 'complete', 'edit', 'blocked'],
            description: 'Action to perform on the goal',
          },
          objective: { type: 'string', description: 'Updated goal title (for edit)' },
          max_goal_rounds: { type: 'number', description: 'Updated iterations limit (for edit)' },
          blocked_reason: { type: 'string', description: 'Reason for pause, blocked, or completion summary' },
        },
        required: ['action'],
      },
      output: JSON_OUTPUT,
      execute: handleUpdateGoal,
      handler: handleUpdateGoal,
    });

    // Tool 4: goal_set_milestones
    const handleSetMilestones = async ({ milestones }, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const snap = engine.setMilestones(milestones, sid);
      if (typeof engine.recordToolActivity === 'function') {
        engine.recordToolActivity('goal_set_milestones', 'success', 'Defined milestones', sid);
      }
      return {
        success: true,
        count: snap.milestones?.length || 0,
        milestones: snap.milestones,
      };
    };

    safeRegister({
      name: 'goal_set_milestones',
      description: 'Decompose the goal into 3-7 verifiable milestones.',
      parameters: {
        type: 'object',
        properties: {
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Short identifier, e.g. M1, step-1' },
                title: { type: 'string', description: 'Concise actionable title' },
                dependsOn: { type: 'array', items: { type: 'string' }, description: 'Prerequisite milestone IDs' },
              },
              required: ['id', 'title'],
            },
            description: 'List of milestones to achieve the goal',
          },
        },
        required: ['milestones'],
      },
      output: JSON_OUTPUT,
      execute: handleSetMilestones,
      handler: handleSetMilestones,
    });

    // Tool 5: goal_update_progress
    const handleUpdateProgress = async ({ milestone_id, status, notes, checklist }, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const ok = engine.updateMilestone(milestone_id, status, notes, sid, checklist);
      if (typeof engine.recordToolActivity === 'function') {
        engine.recordToolActivity('goal_update_progress', ok ? 'success' : 'error', String(milestone_id) + ' -> ' + String(status), sid);
      }
      const snap = engine.getSnapshot(sid);
      const targetMilestone = snap.milestones?.find((m) => m.id === String(milestone_id) || m.id.toLowerCase().replace(/[^a-z0-9]/g, '') === String(milestone_id).toLowerCase().replace(/[^a-z0-9]/g, '') || m.id.toLowerCase().replace(/[^0-9]/g, '') === String(milestone_id).toLowerCase().replace(/[^0-9]/g, ''));
      return {
        success: true,
        milestone_id,
        status,
        checklist: targetMilestone?.checklist || null,
        checkpointCommit: targetMilestone?.checkpointCommit || null,
        total_milestones: snap.milestones?.length,
        completed: snap.milestones?.filter((m) => m.status === 'completed').length,
      };
    };

    safeRegister({
      name: 'goal_update_progress',
      description: 'Update the progress of a specific milestone, optionally attaching a sub-tasks checklist.',
      parameters: {
        type: 'object',
        properties: {
          milestone_id: { type: 'string', description: 'Milestone ID (e.g. M1)' },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress', 'completed', 'failed'],
            description: 'New milestone status',
          },
          notes: { type: 'string', description: 'Summary of actions completed or blocking issue' },
          checklist: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Checklist task item description' },
                done: { type: 'boolean', description: 'Whether the item is completed' },
              },
              required: ['text', 'done'],
            },
            description: 'Optional sub-tasks / checklist items within this milestone',
          },
        },
        required: ['milestone_id', 'status'],
      },
      output: JSON_OUTPUT,
      execute: handleUpdateProgress,
      handler: handleUpdateProgress,
    });

    // Tool 6: goal_finish
    const handleGoalFinish = async ({ summary }, toolCtx) => {
      const sid = sessionIdOf(toolCtx, 'default');
      const snap = engine.completeGoal(summary, sid);
      if (typeof engine.recordToolActivity === 'function') {
        engine.recordToolActivity('goal_finish', 'success', summary ? summary.slice(0, 80) : 'Goal finished', sid);
      }
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
}
