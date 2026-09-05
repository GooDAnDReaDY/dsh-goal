import { randomUUID } from 'node:crypto';
import { GoalState } from './goal-engine.js';

export const USAGE = 'Использование: /goal [<цель>|clear|pause|resume]';

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
 * @returns {string}
 */
export function formatGoalStartPrompt(goalText) {
  return `🎯 Активирован режим цели: "${goalText}"\n\n` +
    `ОБЯЗАТЕЛЬНЫЙ ПЕРВЫЙ ШАГ: Немедленно вызови инструмент goal_set_milestones и передай массив из 3-7 конкретных пунктов плана работ для достижения этой цели. Пользователь видит этот план в интерфейсе в реальном времени.\n` +
    `После формирования плана последовательно выполняй каждый пункт. Перед выполнением шага обновляй его статус на in_progress через goal_update_progress, а по завершении — на completed.\n` +
    `Когда все пункты выполнены, вызови инструмент goal_finish.`;
}

/**
 * Форматирование текстового ответа для UI и постановка/управление задачей агента
 * @param {import('./goal-engine.js').GoalEngine} engine
 * @param {{ action: string, text?: string }} parsed
 * @param {Object} [config]
 * @param {Object} [agent]
 * @returns {{ kind: 'success' | 'error', text: string }}
 */
export function executeGoalSlashCommand(engine, parsed, config = {}, agent = null) {
  const snap = engine.getSnapshot();

  switch (parsed.action) {
    case 'show': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'success',
          text: `🎯 Режим цели (Goal Mode): цель не установлена.\n${USAGE}`,
        };
      }

      const milestonesInfo = snap.milestones.length > 0
        ? `\nПлан работ:\n` + snap.milestones.map((m, i) => `  ${i + 1}. [${m.status}] ${m.title}`).join('\n')
        : '';

      return {
        kind: 'success',
        text: `🎯 Цель: «${snap.title}»\n` +
          `Статус: ${snap.state}\n` +
          `Время: ${snap.formattedElapsed}\n` +
          `Итераций: ${snap.iterationsCount}/${snap.maxIterations}` +
          milestonesInfo +
          `\n\nКоманды: /goal pause, /goal resume, /goal clear, /goal <новая цель>`,
      };
    }

    case 'clear': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'success',
          text: 'Цель не была установлена.',
        };
      }
      engine.clear();
      if (agent && typeof agent.cancel === 'function') {
        try {
          agent.cancel({ kind: 'user', reason: 'Goal cleared by user' });
        } catch (err) {
          console.warn('[dsh-goal] Failed to cancel agent on clear:', err);
        }
      }
      return {
        kind: 'success',
        text: '🎯 Цель сброшена.',
      };
    }

    case 'pause': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'error',
          text: `Нельзя приостановить: активная цель отсутствует.\n${USAGE}`,
        };
      }
      if (snap.state === GoalState.PAUSED) {
        return {
          kind: 'success',
          text: '⏸ Цель уже на паузе.',
        };
      }
      engine.pause('Пауза по команде пользователя (/goal pause)');
      if (agent && typeof agent.cancel === 'function') {
        try {
          agent.cancel({ kind: 'user', reason: 'Goal paused by user' });
        } catch (err) {
          console.warn('[dsh-goal] Failed to cancel agent on pause:', err);
        }
      }
      return {
        kind: 'success',
        text: `⏸ Цель приостановлена: «${snap.title}». Работа агента остановлена. Используйте /goal resume или кнопку ▶️ для продолжения.`,
      };
    }

    case 'resume': {
      if (!snap.hasActiveGoal) {
        return {
          kind: 'error',
          text: `Нельзя возобновить: активная цель отсутствует.\n${USAGE}`,
        };
      }
      if (snap.state === GoalState.RUNNING) {
        return {
          kind: 'success',
          text: '▶️ Цель уже выполняется.',
        };
      }
      engine.resume();
      if (agent && typeof agent.followup === 'function') {
        try {
          const resumePrompt = `▶️ Цель возобновлена пользователем. Продолжай выполнение плана работ с того места, где остановился. Отмечай шаги через goal_update_progress.`;
          agent.followup(createGoalUserMessage(resumePrompt));
        } catch (err) {
          console.warn('[dsh-goal] Failed to followup agent on resume:', err);
        }
      }
      return {
        kind: 'success',
        text: `▶️ Цель возобновлена: «${snap.title}». Агент продолжает работу.`,
      };
    }

    case 'start': {
      const maxIterations = config.maxIterations ?? snap.maxIterations ?? 25;
      const newSnap = engine.startGoal(parsed.text, { maxIterations });

      // Если команда вызвана в контексте агента, отправляем цель в очередь модели
      if (agent && typeof agent.followup === 'function') {
        try {
          const userMsg = createGoalUserMessage(formatGoalStartPrompt(parsed.text));
          agent.followup(userMsg);
        } catch (err) {
          console.warn('[dsh-goal] Failed to dispatch goal to agent followup:', err);
        }
      }

      return {
        kind: 'success',
        text: `🎯 Активирована цель: «${newSnap.title}» (макс. ${newSnap.maxIterations} итераций).\n` +
          `Для паузы: /goal pause | Для сброса: /goal clear`,
      };
    }

    default:
      return {
        kind: 'error',
        text: `Неизвестная команда. ${USAGE}`,
      };
  }
}
