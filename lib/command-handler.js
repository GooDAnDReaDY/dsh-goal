import { randomUUID } from 'node:crypto';
import { GoalState, detectLanguage } from './goal-engine.js';

export const USAGE_EN = 'Usage: /goal [<goal>|clear|pause|resume]';
export const USAGE_ZH = '用法: /goal [<目标描述>|clear|pause|resume]';

/**
 * Parse input string for /goal command
 * @param {string} rawInput
 * @returns {{ action: string, text?: string }}
 */
export function parseGoalInput(rawInput = '') {
  const input = String(rawInput || '').trim();
  if (!input) {
    return { action: 'show' };
  }

  const lower = input.toLowerCase();
  if (lower === 'clear') return { action: 'clear' };
  if (lower === 'pause') return { action: 'pause' };
  if (lower === 'resume') return { action: 'resume' };

  return { action: 'start', text: input };
}

/**
 * Create a valid identified user message for agent followup
 * @param {string} text
 * @returns {Object}
 */
export function createGoalUserMessage(text) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  };
}

/**
 * Format goal start prompt with mandatory milestone contract
 * @param {string} goalText
 * @param {string} [explicitLang]
 * @returns {string}
 */
export function formatGoalStartPrompt(goalText, explicitLang) {
  const lang = explicitLang || detectLanguage(goalText);
  if (lang === 'zh') {
    return `🎯 目标模式已激活 (Goal Mode): "${goalText}"\n\n` +
      `自主执行契约：\n` +
      `1. 第一步必选动作：在开展任何工作或回复之前，你的第一个动作必须是调用 goal_set_milestones 工具，提交包含 3-7 个具体连续步骤的工作计划。用户将在界面中实时查看此计划。\n` +
      `2. 第二步：计划确立后开始执行任务。在开始每个步骤前，通过 goal_update_progress(milestone_id, "in_progress") 标记其为进行中。\n` +
      `3. 第三步：完成某一步骤后，通过 goal_update_progress(milestone_id, "completed", "阶段简要成果") 标记为已完成。\n` +
      `4. 第四步：当所有里程碑全部完成后，调用 goal_finish(summary) 工具并附带详尽的最终成果总结。`;
  }

  return `🎯 Goal Mode activated: "${goalText}"\n\n` +
    `STRICT AUTONOMOUS CONTRACT:\n` +
    `1. MANDATORY STEP 1: Your FIRST action BEFORE doing any other work or reply MUST be calling tool goal_set_milestones with an array of 3-7 concrete, sequential milestones. The user sees this plan in real time.\n` +
    `2. STEP 2: After establishing the plan, proceed to execute milestones. Before starting each milestone, mark it as in_progress via goal_update_progress(milestone_id, "in_progress").\n` +
    `3. STEP 3: Upon completing a milestone, mark it as completed via goal_update_progress(milestone_id, "completed", "brief milestone outcome").\n` +
    `4. STEP 4: When all milestones are completed, call tool goal_finish(summary) with a comprehensive summary of achieved results.`;
}

/**
 * Format response for UI and manage agent task execution
 * @param {import('./goal-engine.js').GoalEngine} engine
 * @param {{ action: string, text?: string }} parsed
 * @param {Object} [config]
 * @param {Object} [agent]
 * @param {string} [sessionId='default']
 * @returns {{ kind: string, text: string }}
 */
export function executeGoalSlashCommand(engine, parsed, config = {}, agent = null, sessionId = 'default') {
  const sid = sessionId || 'default';
  const snap = engine.getGoalSnapshot(sid);
  const lang = snap.lang || (parsed.text ? detectLanguage(parsed.text) : 'en');
  const isZh = lang === 'zh';
  const usage = isZh ? USAGE_ZH : USAGE_EN;

  switch (parsed.action) {
    case 'show': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'success',
          text: isZh ? `目标模式: 当前未设置活动目标。\n${usage}` : `Goal Mode: no active goal set.\n${usage}`,
        };
      }

      const milestonesInfo = snap.milestones && snap.milestones.length > 0
        ? `\n\n${isZh ? '工作计划' : 'Work Plan'}:\n` +
          snap.milestones
            .map((m, i) => `  ${i + 1}. [${m.status.toUpperCase()}] ${m.title}${m.notes ? ` (${m.notes})` : ''}`)
            .join('\n')
        : '';

      const etaText = snap.formattedETA ? ` (ETA: ${snap.formattedETA})` : '';
      const tokensInfo = (snap.tokensUsage && snap.tokensUsage.totalTokens > 0)
        ? (isZh
            ? `\nToken: ${snap.tokensUsage.totalTokens.toLocaleString()} (输入: ${snap.tokensUsage.promptTokens.toLocaleString()}, 输出: ${snap.tokensUsage.completionTokens.toLocaleString()})`
            : `\nTokens: ${snap.tokensUsage.totalTokens.toLocaleString()} (in: ${snap.tokensUsage.promptTokens.toLocaleString()}, out: ${snap.tokensUsage.completionTokens.toLocaleString()})`)
        : '';

      return {
        kind: 'success',
        text: isZh
          ? `🎯 目标: "${snap.title}"\n` +
            `状态: ${snap.state}\n` +
            `耗时: ${snap.formattedElapsed}${etaText}\n` +
            `迭代轮次: ${snap.iterationsCount}/${snap.maxIterations}` +
            tokensInfo +
            milestonesInfo +
            `\n\n快捷指令: /goal pause, /goal resume, /goal clear, /goal <新目标>`
          : `🎯 Goal: "${snap.title}"\n` +
            `Status: ${snap.state}\n` +
            `Duration: ${snap.formattedElapsed}${etaText}\n` +
            `Iterations: ${snap.iterationsCount}/${snap.maxIterations}` +
            tokensInfo +
            milestonesInfo +
            `\n\nCommands: /goal pause, /goal resume, /goal clear, /goal <new goal>`,
      };
    }

    case 'clear': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'success',
          text: isZh ? '当前未设置目标。' : 'No active goal set.',
        };
      }
      engine.clear(sid);
      if (agent && typeof agent.cancel === 'function') {
        try {
          agent.cancel({ kind: 'user', reason: 'Goal cleared by user' });
        } catch (err) {
          // agent cancellation error handled defensively
        }
      }
      return {
        kind: 'success',
        text: isZh ? '🎯 目标已清除。' : '🎯 Goal cleared.',
      };
    }

    case 'pause': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'error',
          text: isZh
            ? `无法暂停：未设置活动目标。\n${usage}`
            : `Cannot pause: no active goal.\n${usage}`,
        };
      }
      if (snap.state === GoalState.PAUSED) {
        return {
          kind: 'success',
          text: isZh ? '⏸ 目标当前已处于暂停状态。' : '⏸ Goal is already paused.',
        };
      }
      engine.pause(isZh ? '用户命令暂停 (/goal pause)' : 'Paused by user command (/goal pause)', sid);
      if (agent && typeof agent.cancel === 'function') {
        try {
          agent.cancel({ kind: 'user', reason: 'Goal paused by user' });
        } catch (err) {
          // agent cancellation error handled defensively
        }
      }
      return {
        kind: 'success',
        text: isZh
          ? `⏸ 目标已暂停: "${snap.title}"。智能体已停止，使用 /goal resume 或 ▶️ 按钮继续。`
          : `⏸ Goal paused: "${snap.title}". Agent stopped. Use /goal resume or ▶️ button to continue.`,
      };
    }

    case 'resume': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'error',
          text: isZh
            ? `无法恢复：未设置活动目标。\n${usage}`
            : `Cannot resume: no active goal.\n${usage}`,
        };
      }
      if (snap.state === GoalState.RUNNING) {
        return {
          kind: 'success',
          text: isZh ? '▶️ 目标已在运行中。' : '▶️ Goal is already running.',
        };
      }
      engine.resume(sid);
      if (agent && typeof agent.followup === 'function') {
        try {
          const resumePrompt = isZh
            ? `▶️ 用户已恢复目标运行。请继续推进工作计划中尚未完成的步骤。通过 goal_update_progress 实时更新进度。`
            : `▶️ Goal resumed by user. Continue executing the work plan from where you stopped. Update steps via goal_update_progress.`;
          agent.followup(createGoalUserMessage(resumePrompt));
        } catch (err) {
          // agent followup error handled defensively
        }
      }
      return {
        kind: 'success',
        text: isZh
          ? `▶️ 目标已恢复: "${snap.title}"。智能体继续工作中。`
          : `▶️ Goal resumed: "${snap.title}". Agent continues working.`,
      };
    }

    case 'start': {
      const goalLang = detectLanguage(parsed.text);
      const isZhStart = goalLang === 'zh';
      const maxIterations = config.maxIterations ?? snap.maxIterations ?? 25;
      const cwd = config.cwd;
      const newSnap = engine.startGoal(parsed.text, { maxIterations, lang: goalLang, cwd }, sid);

      if (agent && typeof agent.followup === 'function') {
        try {
          const userMsg = createGoalUserMessage(formatGoalStartPrompt(parsed.text, goalLang));
          agent.followup(userMsg);
        } catch (err) {
          // agent dispatch error handled defensively
        }
      }

      return {
        kind: 'success',
        text: isZhStart
          ? `🎯 目标已激活: "${newSnap.title}" (上限 ${newSnap.maxIterations} 轮迭代)。\n` +
            `暂停: /goal pause | 清除: /goal clear`
          : `🎯 Goal activated: "${newSnap.title}" (max ${newSnap.maxIterations} iterations).\n` +
            `To pause: /goal pause | To clear: /goal clear`,
      };
    }

    default:
      return {
        kind: 'error',
        text: isZh ? `未知指令。${usage}` : `Unknown command. ${usage}`,
      };
  }
}
