import { randomUUID } from 'node:crypto';
import { GoalState, detectLanguage } from './goal-engine.js';

export const USAGE_EN = 'Usage: /goal [<goal>|clear|pause|resume]';
export const USAGE_ZH = '用法: /goal [<目标描述>|clear|pause|resume]';
export const USAGE_RU = 'Использование: /goal [<цель>|clear|pause|resume]';
export const USAGE = USAGE_EN;

/**
 * Парсинг строки ввода для команды /goal
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
 * Создание валидного identified сообщения пользователя для отправки агенту через followup
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
 * Формирование стартового промпта с жестким требованием составить план работ
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
  if (lang === 'ru') {
    return `🎯 Активирован режим цели (Goal Mode): "${goalText}"\n\n` +
      `СТРОГИЙ КОНТРАКТ АВТОНОМНОГО РЕЖИМА:\n` +
      `1. ОБЯЗАТЕЛЬНЫЙ ШАГ №1: Твоим ПЕРВЫМ действием ДО выполнения любой другой работы или ответа должен быть вызов инструмента goal_set_milestones с массивом из 3-7 конкретных, последовательных пунктов плана работ. Пользователь видит этот план в интерфейсе в реальном времени.\n` +
      `2. ШАГ №2: После установки плана переходи к выполнению шагов. Перед началом работы над каждым шагом отметь его статус как in_progress через goal_update_progress(milestone_id, "in_progress").\n` +
      `3. ШАГ №3: После успешного завершения шага отметь его статус как completed через goal_update_progress(milestone_id, "completed", "краткие итоги шага").\n` +
      `4. ШАГ №4: Когда все пункты плана выполнены, вызови инструмент goal_finish(summary) с подробным резюме достигнутых результатов.`;
  }

  return `🎯 Goal Mode activated: "${goalText}"\n\n` +
    `STRICT AUTONOMOUS CONTRACT:\n` +
    `1. MANDATORY STEP 1: Your FIRST action BEFORE doing any other work or reply MUST be calling tool goal_set_milestones with an array of 3-7 concrete, sequential milestones. The user sees this plan in real time.\n` +
    `2. STEP 2: After establishing the plan, proceed to execute milestones. Before starting each milestone, mark it as in_progress via goal_update_progress(milestone_id, "in_progress").\n` +
    `3. STEP 3: Upon completing a milestone, mark it as completed via goal_update_progress(milestone_id, "completed", "brief milestone outcome").\n` +
    `4. STEP 4: When all milestones are completed, call tool goal_finish(summary) with a comprehensive summary of achieved results.`;
}

/**
 * Форматирование текстового ответа для UI и постановка/управление задачей агента
 * @param {import('./goal-engine.js').GoalEngine} engine
 * @param {{ action: string, text?: string }} parsed
 * @param {Object} [config]
 * @param {Object} [agent]
 * @param {string} [sessionId='default']
 * @returns {{ kind: 'success' | 'error', text: string }}
 */
export function executeGoalSlashCommand(engine, parsed, config = {}, agent = null, sessionId = 'default') {
  const sid = sessionId || 'default';
  const snap = engine.getSnapshot(sid);

  const lang = (parsed.text ? detectLanguage(parsed.text) : (snap.lang || (snap.title ? detectLanguage(snap.title) : 'en'))) || 'en';
  const isZh = lang === 'zh';
  const isRu = lang === 'ru';
  const usage = isZh ? USAGE_ZH : (isRu ? USAGE_RU : USAGE_EN);

  switch (parsed.action) {
    case 'show': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'success',
          text: isZh
            ? `🎯 目标模式 (Goal Mode): 当前未设置目标。\n${usage}`
            : (isRu
                ? `🎯 Режим цели (Goal Mode): цель не установлена.\n${usage}`
                : `🎯 Goal Mode: no active goal set.\n${usage}`),
        };
      }

      const milestonesInfo = snap.milestones.length > 0
        ? (isZh ? `\n工作计划:\n` : (isRu ? `\nПлан работ:\n` : `\nWork plan:\n`)) + snap.milestones.map((m, i) => `  ${i + 1}. [${m.status}] ${m.title}`).join('\n')
        : '';

      const etaText = snap.formattedETA ? ` (ETA: ${snap.formattedETA})` : '';
      const tokensInfo = (snap.tokensUsage && snap.tokensUsage.totalTokens > 0)
        ? (isZh
            ? `\nToken: ${snap.tokensUsage.totalTokens.toLocaleString()} (输入: ${snap.tokensUsage.promptTokens.toLocaleString()}, 输出: ${snap.tokensUsage.completionTokens.toLocaleString()})`
            : (isRu
                ? `\nТокены: ${snap.tokensUsage.totalTokens.toLocaleString()} (in: ${snap.tokensUsage.promptTokens.toLocaleString()}, out: ${snap.tokensUsage.completionTokens.toLocaleString()})`
                : `\nTokens: ${snap.tokensUsage.totalTokens.toLocaleString()} (in: ${snap.tokensUsage.promptTokens.toLocaleString()}, out: ${snap.tokensUsage.completionTokens.toLocaleString()})`))
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
          : (isRu
              ? `🎯 Цель: «${snap.title}»\n` +
                `Статус: ${snap.state}\n` +
                `Время: ${snap.formattedElapsed}${etaText}\n` +
                `Итераций: ${snap.iterationsCount}/${snap.maxIterations}` +
                tokensInfo +
                milestonesInfo +
                `\n\nКоманды: /goal pause, /goal resume, /goal clear, /goal <новая цель>`
              : `🎯 Goal: "${snap.title}"\n` +
                `Status: ${snap.state}\n` +
                `Duration: ${snap.formattedElapsed}${etaText}\n` +
                `Iterations: ${snap.iterationsCount}/${snap.maxIterations}` +
                tokensInfo +
                milestonesInfo +
                `\n\nCommands: /goal pause, /goal resume, /goal clear, /goal <new goal>`),
      };
    }

    case 'clear': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'success',
          text: isZh ? '当前未设置目标。' : (isRu ? 'Цель не была установлена.' : 'No active goal set.'),
        };
      }
      engine.clear(sid);
      if (agent && typeof agent.cancel === 'function') {
        try {
          agent.cancel({ kind: 'user', reason: 'Goal cleared by user' });
        } catch (err) {
          console.warn('[dsh-goal] Failed to cancel agent on clear:', err);
        }
      }
      return {
        kind: 'success',
        text: isZh ? '🎯 目标已清除。' : (isRu ? '🎯 Цель сброшена.' : '🎯 Goal cleared.'),
      };
    }

    case 'pause': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'error',
          text: isZh
            ? `无法暂停：未设置活动目标。\n${usage}`
            : (isRu
                ? `Нельзя приостановить: активная цель отсутствует.\n${usage}`
                : `Cannot pause: no active goal.\n${usage}`),
        };
      }
      if (snap.state === GoalState.PAUSED) {
        return {
          kind: 'success',
          text: isZh ? '⏸ 目标当前已处于暂停状态。' : (isRu ? '⏸ Цель уже на паузе.' : '⏸ Goal is already paused.'),
        };
      }
      engine.pause(isZh ? '用户命令暂停 (/goal pause)' : (isRu ? 'Пауза по команде пользователя (/goal pause)' : 'Paused by user command (/goal pause)'), sid);
      if (agent && typeof agent.cancel === 'function') {
        try {
          agent.cancel({ kind: 'user', reason: 'Goal paused by user' });
        } catch (err) {
          console.warn('[dsh-goal] Failed to cancel agent on pause:', err);
        }
      }
      return {
        kind: 'success',
        text: isZh
          ? `⏸ 目标已暂停: "${snap.title}"。智能体已停止，使用 /goal resume 或 ▶️ 按钮继续。`
          : (isRu
              ? `⏸ Цель приостановлена: «${snap.title}». Работа агента остановлена. Используйте /goal resume или кнопку ▶️ для продолжения.`
              : `⏸ Goal paused: "${snap.title}". Agent stopped. Use /goal resume or ▶️ button to continue.`),
      };
    }

    case 'resume': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'error',
          text: isZh
            ? `无法恢复：未设置活动目标。\n${usage}`
            : (isRu
                ? `Нельзя возобновить: активная цель отсутствует.\n${usage}`
                : `Cannot resume: no active goal.\n${usage}`),
        };
      }
      if (snap.state === GoalState.RUNNING) {
        return {
          kind: 'success',
          text: isZh ? '▶️ 目标已在运行中。' : (isRu ? '▶️ Цель уже выполняется.' : '▶️ Goal is already running.'),
        };
      }
      engine.resume(sid);
      if (agent && typeof agent.followup === 'function') {
        try {
          const resumePrompt = isZh
            ? `▶️ 用户已恢复目标运行。请继续推进工作计划中尚未完成的步骤。通过 goal_update_progress 实时更新进度。`
            : (isRu
                ? `▶️ Цель возобновлена пользователем. Продолжай выполнение плана работ с того места, где остановился. Отмечай шаги через goal_update_progress.`
                : `▶️ Goal resumed by user. Continue executing the work plan from where you stopped. Update steps via goal_update_progress.`);
          agent.followup(createGoalUserMessage(resumePrompt));
        } catch (err) {
          console.warn('[dsh-goal] Failed to followup agent on resume:', err);
        }
      }
      return {
        kind: 'success',
        text: isZh
          ? `▶️ 目标已恢复: "${snap.title}"。智能体继续工作中。`
          : (isRu
              ? `▶️ Цель возобновлена: «${snap.title}». Агент продолжает работу.`
              : `▶️ Goal resumed: "${snap.title}". Agent continues working.`),
      };
    }

    case 'start': {
      const maxIterations = config.maxIterations ?? snap.maxIterations ?? 25;
      const cwd = config.cwd;
      const newSnap = engine.startGoal(parsed.text, { maxIterations, lang, cwd }, sid);

      if (agent && typeof agent.followup === 'function') {
        try {
          const userMsg = createGoalUserMessage(formatGoalStartPrompt(parsed.text, lang));
          agent.followup(userMsg);
        } catch (err) {
          console.warn('[dsh-goal] Failed to dispatch goal to agent followup:', err);
        }
      }

      return {
        kind: 'success',
        text: isZh
          ? `🎯 目标已激活: "${newSnap.title}" (上限 ${newSnap.maxIterations} 轮迭代)。\n` +
            `暂停: /goal pause | 清除: /goal clear`
          : (isRu
              ? `🎯 Активирована цель: «${newSnap.title}» (макс. ${newSnap.maxIterations} итераций).\n` +
                `Для паузы: /goal pause | Для сброса: /goal clear`
              : `🎯 Goal activated: "${newSnap.title}" (max ${newSnap.maxIterations} iterations).\n` +
                `To pause: /goal pause | To clear: /goal clear`),
      };
    }

    default:
      return {
        kind: 'error',
        text: isZh ? `未知指令。${usage}` : (isRu ? `Неизвестная команда. ${usage}` : `Unknown command. ${usage}`),
      };
  }
}
