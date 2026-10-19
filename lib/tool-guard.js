/**
 * Plan Mode tool execution guard for @goodandready/dsh-goal.
 * Blocks mutating file operations and commands during the planning phase.
 */

export const READ_ONLY_TOOLS = new Set([
  'view_file',
  'read_file',
  'read_url_content',
  'search_web',
  'search',
  'grep',
  'glob',
  'find',
  'list_dir',
  'dir_list',
  'code_search',
  'read_resource',
  'list_resources',
  'brain_recall',
  'brain_list',
  'brain_status',
  'brain_remember',
  'ask_question',
  'send_message',
  'schedule',
  'manage_task',
  'get_goal',
]);

export const FILE_WRITER_TOOLS = new Set([
  'write_to_file',
  'replace_file_content',
  'edit_file',
  'apply_diff',
  'patch',
  'create_file',
  'delete_file',
  'remove_file',
]);

const SAFE_COMMAND_PATTERN = /^(git\s+(status|diff|log|branch|show)|ls|dir|pwd|cat|head|tail|grep|find|wc|echo|which|where)(\s+|$)/i;
const MUTATING_COMMAND_PATTERN = /(\b(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|sed\s+-i|git\s+(commit|checkout\s+-b|push|merge|rebase|reset|restore))\b|[>|&;])/i;

/**
 * Check whether a tool is permitted in Plan Mode.
 * @param {string} toolName
 * @param {object} [args]
 * @returns {boolean}
 */
export function isPermittedInPlanMode(toolName, args = {}) {
  if (!toolName || typeof toolName !== 'string') return false;

  // Milestone and checklist tools are explicitly permitted in plan mode
  if (toolName === 'goal_milestones' || toolName === 'goal_checklist') {
    return true;
  }

  // Explicit file writing tools are strictly blocked
  if (FILE_WRITER_TOOLS.has(toolName)) {
    return false;
  }

  // Check command execution
  if (toolName === 'run_command' || toolName === 'execute_command' || toolName === 'bash') {
    const rawCmd = (args.CommandLine || args.command || args.cmd || '').trim();
    if (!rawCmd) return true;
    if (SAFE_COMMAND_PATTERN.test(rawCmd) && !MUTATING_COMMAND_PATTERN.test(rawCmd)) {
      return true;
    }
    return false;
  }

  // Allow known read-only inspection tools
  if (READ_ONLY_TOOLS.has(toolName)) {
    return true;
  }

  // Default fail-closed for unknown tools in plan mode
  return false;
}

/**
 * Create a tool guard function for Cordis ctx.tools.guard.
 * @param {import('./goal-engine.js').GoalEngine} engine
 * @param {object} [logger]
 * @returns {(execution: object) => string | undefined}
 */
export function createPlanModeGuard(engine, logger = console) {
  return function planModeGuard(execution) {
    if (!engine || typeof engine.isPlanMode !== 'function') return undefined;

    const sid = execution?.sessionId || execution?.session?.id || 'default';
    if (!engine.isPlanMode(sid)) {
      return undefined;
    }

    const toolName = execution?.name || execution?.tool || '';
    if (isPermittedInPlanMode(toolName, execution?.arguments)) {
      return undefined;
    }

    const rejection = `[Plan Mode Active] Tool "${toolName}" is blocked in Plan Mode. The goal is in the planning phase and file modifications are restricted until the plan is approved by the operator. Use goal_milestones to define the milestones and ask the operator to approve the plan or switch to Act Mode.`;
    logger?.warn?.(`[dsh-goal] Blocked tool execution in Plan Mode: ${toolName}`);
    return rejection;
  };
}

/**
 * Register the plan mode guard with Cordis context.
 * @param {any} ctx
 * @param {object} options
 * @param {import('./goal-engine.js').GoalEngine} options.engine
 * @param {object} [options.logger]
 */
export function registerPlanModeGuard(ctx, { engine, logger = console } = {}) {
  if (!ctx || !engine) return;

  const guard = createPlanModeGuard(engine, logger);

  // 1. Cordis tools service guard
  ctx.inject(['tools'], (tctx) => {
    if (typeof tctx.tools?.guard === 'function') {
      try {
        const unguard = tctx.tools.guard(guard);
        if (typeof unguard === 'function' && typeof tctx.effect === 'function') {
          tctx.effect(() => () => {
            try { unguard(); } catch (e) { /* ignore */ }
          }, 'dsh-goal: plan mode tool guard');
        }
      } catch (err) {
        logger?.warn?.('[dsh-goal] Failed to register tools guard:', err.message);
      }
    }
  });

  // 2. Pre-execute event hook if present
  if (typeof ctx.on === 'function') {
    ctx.on('tools/pre-execute', (execution, next) => {
      const decision = guard(execution);
      if (decision !== undefined) {
        return { kind: 'deny', reason: decision };
      }
      return typeof next === 'function' ? next() : undefined;
    });
  }
}