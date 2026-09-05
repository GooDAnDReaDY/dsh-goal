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
 * Форматирование текстового ответа для UI
 * @param {import('./goal-engine.js').GoalEngine} engine
 * @param {{ action: string, text?: string }} parsed
 * @param {Object} [config]
 * @returns {{ kind: 'success' | 'error', text: string }}
 */
export function executeGoalSlashCommand(engine, parsed, config = {}) {
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
        ? `\nВехи:\n` + snap.milestones.map((m, i) => `  ${i + 1}. [${m.status}] ${m.title}`).join('\n')
        : '';

      return {
        kind: 'success',
        text: `🎯 Цель: «${snap.title}»\n` +
          `Статус: ${snap.state}\n` +
          `Прогресс: ${snap.progressPercent}% (${snap.formattedElapsed})\n` +
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
      return {
        kind: 'success',
        text: `⏸ Цель приостановлена: «${snap.title}». Используйте /goal resume для продолжения.`,
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
      return {
        kind: 'success',
        text: `▶️ Цель возобновлена: «${snap.title}».`,
      };
    }

    case 'start': {
      const maxIterations = config.maxIterations ?? snap.maxIterations ?? 25;
      const newSnap = engine.startGoal(parsed.text, { maxIterations });
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
