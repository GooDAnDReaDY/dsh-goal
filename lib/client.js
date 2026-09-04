window.__ModuleLoader__.load({
  id: '@goodandready/dsh-goal',
  factory: (require) => {
    const module = { exports: {} };
    const React = require('react');
    const { useState, useEffect, useRef, useCallback } = React;

    const NS = 'dsh-goal';

    // Безопасная загрузка примитивов ядра
    let Primitives = null;
    try {
      Primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    } catch (_) {
      Primitives = null;
    }

    // --- SVG ИКОНКИ ---

    function IconTarget({ size = 16, className = '' }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
        },
        React.createElement('circle', { cx: 12, cy: 12, r: 10 }),
        React.createElement('circle', { cx: 12, cy: 12, r: 6 }),
        React.createElement('circle', { cx: 12, cy: 12, r: 2 }),
      );
    }

    function IconTrash({ size = 15, className = '' }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
        },
        React.createElement('path', { d: 'M3 6h18' }),
        React.createElement('path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }),
        React.createElement('path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }),
      );
    }

    function IconPause({ size = 15, className = '' }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
        },
        React.createElement('circle', { cx: 12, cy: 12, r: 10 }),
        React.createElement('line', { x1: 10, y1: 15, x2: 10, y2: 9 }),
        React.createElement('line', { x1: 14, y1: 15, x2: 14, y2: 9 }),
      );
    }

    function IconPlay({ size = 15, className = '' }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
        },
        React.createElement('circle', { cx: 12, cy: 12, r: 10 }),
        React.createElement('polygon', { points: '10 8 16 12 10 16 10 8', fill: 'currentColor' }),
      );
    }

    function IconExpand({ size = 15, className = '' }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
        },
        React.createElement('polyline', { points: '15 3 21 3 21 9' }),
        React.createElement('polyline', { points: '9 21 3 21 3 15' }),
        React.createElement('line', { x1: 21, y1: 3, x2: 14, y2: 10 }),
        React.createElement('line', { x1: 3, y1: 21, x2: 10, y2: 14 }),
      );
    }

    function IconChevronDown({ size = 14, className = '' }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
        },
        React.createElement('polyline', { points: '6 9 12 15 18 9' }),
      );
    }

    // --- СТИЛИ И CSS ПРАВИЛА ---
    const CSS_STYLES = `
      .dsh-goal-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--dsw-alias-bg-layer-3, #1e1e20);
        border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.08));
        border-radius: 10px;
        padding: 8px 14px;
        margin: 6px 12px;
        font-family: inherit;
        font-size: 13px;
        color: var(--dsw-alias-label-primary, #ffffff);
        user-select: none;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        transition: all 0.2s ease;
      }
      .dsh-goal-left {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex: 1;
      }
      .dsh-goal-icon {
        color: var(--dsw-alias-label-secondary, #9da2a8);
        flex-shrink: 0;
        display: flex;
        align-items: center;
      }
      .dsh-goal-label {
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #ffffff);
        white-space: nowrap;
      }
      .dsh-goal-title {
        color: var(--dsw-alias-label-secondary, #b4b8be);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 400;
      }
      .dsh-goal-time {
        color: var(--dsw-alias-label-tertiary, #6e737a);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        white-space: nowrap;
      }
      .dsh-goal-right {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: 12px;
        flex-shrink: 0;
      }
      .dsh-goal-btn {
        background: transparent;
        border: 0;
        padding: 4px;
        margin: 0;
        color: var(--dsw-alias-label-tertiary, #888d94);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.15s ease;
      }
      .dsh-goal-btn:hover {
        color: var(--dsw-alias-label-primary, #ffffff);
        background: var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.06));
      }
      .dsh-goal-btn.danger:hover {
        color: var(--dsw-alias-status-danger, #ff5c5c);
      }

      /* Modal Details */
      .dsh-goal-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(4px);
      }
      .dsh-goal-modal {
        background: var(--dsw-alias-bg-layer-3, #1e1e20);
        border: 1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.1));
        border-radius: 12px;
        width: 520px;
        max-width: 90vw;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 16px 36px rgba(0,0,0,0.4);
      }
      .dsh-goal-modal-head {
        padding: 14px 18px;
        border-bottom: 1px solid var(--dsw-alias-border-l2);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .dsh-goal-modal-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary);
      }
      .dsh-goal-modal-body {
        padding: 16px 18px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .dsh-goal-progress-bar {
        height: 6px;
        background: var(--dsw-alias-bg-layer-2, #2c2d30);
        border-radius: 3px;
        overflow: hidden;
      }
      .dsh-goal-progress-fill {
        height: 100%;
        background: var(--dsw-alias-status-success, #22c55e);
        transition: width 0.3s ease;
      }
      .dsh-goal-milestone-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2);
        font-size: 13px;
      }
      .dsh-goal-modal-foot {
        padding: 12px 18px;
        border-top: 1px solid var(--dsw-alias-border-l2);
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      /* Settings Card */
      .dsh-goal-card {
        border: 1px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-3);
        border-radius: 12px;
        list-style: none;
        margin-bottom: 10px;
      }
      .dsh-goal-card-head {
        appearance: none;
        width: 100%;
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
        background: 0 0;
        border: 0;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
      }
      .dsh-goal-card-title {
        color: var(--dsw-alias-label-primary);
        font-size: 15px;
        font-weight: 600;
        line-height: 1.4;
      }
      .dsh-goal-card-sub {
        color: var(--dsw-alias-label-secondary);
        font-size: 13px;
      }
      .dsh-goal-card-body {
        border-top: 1px solid var(--dsw-alias-border-l2);
        margin: 0 16px;
        padding-bottom: 12px;
      }
      .dsh-goal-card-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 12px 0;
      }
      .dsh-goal-card-input {
        height: 34px;
        border: 1px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-3);
        color: var(--dsw-alias-label-primary);
        border-radius: 8px;
        padding: 0 12px;
        font-size: 13px;
      }
      .dsh-goal-chev {
        margin-left: auto;
        flex: none;
        color: var(--dsw-alias-label-tertiary);
        transition: transform .16s;
      }
      .dsh-goal-chev-open {
        transform: rotate(180deg);
      }
    `;

    function injectStylesOnce() {
      if (document.getElementById('dsh-goal-styles')) return;
      const style = document.createElement('style');
      style.id = 'dsh-goal-styles';
      style.textContent = CSS_STYLES;
      document.head.appendChild(style);
    }

    // --- МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ (MODAL DETAILS) ---
    function GoalDetailsModal({ state, onClose, onAction, t }) {
      if (!state) return null;

      const milestones = state.milestones || [];
      const completedCount = milestones.filter((m) => m.status === 'completed').length;
      const totalCount = milestones.length;

      return React.createElement(
        'div',
        {
          className: 'dsh-goal-modal-overlay',
          onClick: (e) => {
            if (e.target === e.currentTarget) onClose();
          },
        },
        React.createElement(
          'div',
          { className: 'dsh-goal-modal' },
          React.createElement(
            'div',
            { className: 'dsh-goal-modal-head' },
            React.createElement(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              React.createElement(IconTarget, { size: 18 }),
              React.createElement('span', { className: 'dsh-goal-modal-title' }, t('modalTitle') || 'Цель и вехи выполнения'),
            ),
            React.createElement(
              'button',
              { className: 'dsh-goal-btn', onClick: onClose },
              '✕',
            ),
          ),
          React.createElement(
            'div',
            { className: 'dsh-goal-modal-body' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { style: { fontWeight: 600, marginBottom: 4 } }, state.title),
              state.description ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 13 } }, state.description) : null,
            ),
            React.createElement(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } },
              React.createElement('span', null, `${t('progress') || 'Прогресс'}: ${completedCount}/${totalCount} (${state.progressPercent || 0}%)`),
              React.createElement('span', null, `${t('time') || 'Время'}: ${state.formattedElapsed || '0s'}`),
            ),
            React.createElement(
              'div',
              { className: 'dsh-goal-progress-bar' },
              React.createElement('div', { className: 'dsh-goal-progress-fill', style: { width: `${state.progressPercent || 0}%` } }),
            ),
            React.createElement(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 } },
              React.createElement('div', { style: { fontWeight: 600, fontSize: 13 } }, t('milestones') || 'Шаги выполнения:'),
              milestones.length === 0
                ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12 } }, t('noMilestones') || 'Агент декомпозирует шаги автоматически...')
                : milestones.map((m, i) =>
                    React.createElement(
                      'div',
                      { key: m.id || i, className: 'dsh-goal-milestone-item' },
                      React.createElement('span', null, m.status === 'completed' ? '✅' : m.status === 'in_progress' ? '🔄' : '⏳'),
                      React.createElement(
                        'div',
                        { style: { flex: 1 } },
                        React.createElement('div', { style: { textDecoration: m.status === 'completed' ? 'line-through' : 'none' } }, m.title),
                        m.notes ? React.createElement('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' } }, m.notes) : null,
                      ),
                    ),
                  ),
            ),
          ),
          React.createElement(
            'div',
            { className: 'dsh-goal-modal-foot' },
            React.createElement(
              'button',
              {
                className: 'dsh-goal-btn',
                style: { padding: '6px 14px', background: 'var(--dsw-alias-bg-layer-2)', color: 'var(--dsw-alias-label-primary)' },
                onClick: onClose,
              },
              t('close') || 'Закрыть',
            ),
          ),
        ),
      );
    }

    // --- ГЛАВНЫЙ КОМПОНЕНТ: TOP BANNER (В ТОЧНОСТИ КАК НА СКРИНШОТЕ) ---
    function GoalTopBanner(props) {
      const [state, setState] = useState(null);
      const [isModalOpen, setIsModalOpen] = useState(false);
      const t = props.t || ((k) => k);

      const fetchState = useCallback(async () => {
        try {
          const res = await fetch('/dsh-goal/state');
          if (res.ok) {
            const data = await res.json();
            setState(data);
          }
        } catch (_) {}
      }, []);

      useEffect(() => {
        injectStylesOnce();
        fetchState();
        const interval = setInterval(fetchState, 1000);
        return () => clearInterval(interval);
      }, [fetchState]);

      const handleAction = async (action, extra = {}) => {
        try {
          await fetch('/dsh-goal/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...extra }),
          });
          fetchState();
        } catch (_) {}
      };

      // Все хуки объявлены выше!
      if (!state || !state.hasActiveGoal) {
        return null; // Если нет активной цели, плашка скрыта
      }

      const isPaused = state.state === 'PAUSED';

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'div',
          { className: 'dsh-goal-banner' },
          React.createElement(
            'div',
            { className: 'dsh-goal-left' },
            React.createElement(
              'span',
              { className: 'dsh-goal-icon' },
              React.createElement(IconTarget, { size: 16 }),
            ),
            React.createElement(
              'span',
              { className: 'dsh-goal-label' },
              t('goalLabel') || 'Текущая цель',
            ),
            React.createElement(
              'span',
              { className: 'dsh-goal-title', title: state.title },
              state.title,
            ),
            React.createElement(
              'span',
              { className: 'dsh-goal-time' },
              `• ${state.formattedElapsed || '0s'}`,
            ),
          ),
          React.createElement(
            'div',
            { className: 'dsh-goal-right' },
            React.createElement(
              'button',
              {
                className: 'dsh-goal-btn danger',
                title: t('clearGoal') || 'Очистить / Отменить цель',
                onClick: () => handleAction('clear'),
              },
              React.createElement(IconTrash, { size: 15 }),
            ),
            React.createElement(
              'button',
              {
                className: 'dsh-goal-btn',
                title: isPaused ? (t('resume') || 'Возобновить') : (t('pause') || 'Приостановить'),
                onClick: () => handleAction(isPaused ? 'resume' : 'pause'),
              },
              isPaused ? React.createElement(IconPlay, { size: 15 }) : React.createElement(IconPause, { size: 15 }),
            ),
            React.createElement(
              'button',
              {
                className: 'dsh-goal-btn',
                title: t('details') || 'Развернуть детали цели',
                onClick: () => setIsModalOpen(true),
              },
              React.createElement(IconExpand, { size: 15 }),
            ),
          ),
        ),
        isModalOpen
          ? React.createElement(GoalDetailsModal, {
              state,
              onClose: () => setIsModalOpen(false),
              onAction: handleAction,
              t,
            })
          : null,
      );
    }

    // --- КАРТОЧКА НАСТРОЕК В SETTINGS.PLUGIN.ITEM ---
    function GoalSettingsCard(props) {
      const [isOpen, setIsOpen] = useState(false);
      const [maxIter, setMaxIter] = useState(25);
      const ctx = props.ctx;
      const t = props.t || ((k) => k);

      useEffect(() => {
        injectStylesOnce();
      }, []);

      const Chevron = (Primitives && Primitives.IconChevronDownOutline14) || IconChevronDown;

      return React.createElement(
        'li',
        { className: 'dsh-goal-card' },
        React.createElement(
          'button',
          {
            className: 'dsh-goal-card-head',
            onClick: () => setIsOpen(!isOpen),
            'aria-expanded': isOpen,
          },
          React.createElement(
            'div',
            { style: { flex: 1 } },
            React.createElement('div', { className: 'dsh-goal-card-title' }, t('pluginTitle') || 'Цели и автономный режим (Goal Mode)'),
            React.createElement('div', { className: 'dsh-goal-card-sub' }, t('pluginDesc') || 'Верхняя закреплённая панель цели, декомпозиция вех и авто-драйв'),
          ),
          React.createElement(Chevron, { className: `dsh-goal-chev ${isOpen ? 'dsh-goal-chev-open' : ''}` }),
        ),
        isOpen
          ? React.createElement(
              'div',
              { className: 'dsh-goal-card-body' },
              React.createElement(
                'div',
                { className: 'dsh-goal-card-field' },
                React.createElement('label', { style: { fontSize: 13, fontWeight: 500 } }, t('maxIterLabel') || 'Максимум итераций (Safety Limit):'),
                React.createElement('input', {
                  type: 'number',
                  className: 'dsh-goal-card-input',
                  value: maxIter,
                  onChange: (e) => setMaxIter(Number(e.target.value)),
                }),
              ),
            )
          : null,
      );
    }

    // --- СЛОВАРИ ЛОКАЛИЗАЦИИ ---
    const LOCALES = {
      ru: {
        goalLabel: 'Текущая цель',
        clearGoal: 'Очистить / Отменить цель',
        pause: 'Приостановить',
        resume: 'Возобновить',
        details: 'Развернуть детали цели',
        modalTitle: 'Детали активной цели',
        progress: 'Прогресс',
        time: 'Время',
        milestones: 'Шаги выполнения:',
        noMilestones: 'Агент декомпозирует шаги автоматически...',
        close: 'Закрыть',
        pluginTitle: 'Цели и автономный режим (Goal Mode)',
        pluginDesc: 'Верхняя закреплённая панель цели, декомпозиция вех и авто-драйв',
        maxIterLabel: 'Максимум итераций (Safety Limit):',
      },
      en: {
        goalLabel: 'Current Goal',
        clearGoal: 'Clear / Cancel Goal',
        pause: 'Pause',
        resume: 'Resume',
        details: 'Expand Goal Details',
        modalTitle: 'Active Goal Details',
        progress: 'Progress',
        time: 'Time',
        milestones: 'Milestones:',
        noMilestones: 'Agent will decompose steps automatically...',
        close: 'Close',
        pluginTitle: 'Goal Mode & Autonomous Loop',
        pluginDesc: 'Sticky top goal banner, milestone decomposition, and auto-drive',
        maxIterLabel: 'Max iterations (Safety Limit):',
      },
    };

    module.exports.inject = ['slots', 'locale'];
    module.exports.apply = function apply(ctx) {
      // Регистрация локализации
      try {
        ctx.locale?.register?.(NS, LOCALES);
      } catch (_) {}

      // 1. Регистрация Sticky Top Banner в слот рабочей области / сессии
      ctx.slots?.register?.(
        {
          name: 'session.header',
          id: '@goodandready/dsh-goal',
          order: 10,
          locale: NS,
          inject: () => ({ ctx }),
        },
        GoalTopBanner,
      );

      // Фоллбек: также регистрируем в chat.banner
      ctx.slots?.register?.(
        {
          name: 'chat.banner',
          id: '@goodandready/dsh-goal:banner',
          order: 5,
          locale: NS,
          inject: () => ({ ctx }),
        },
        GoalTopBanner,
      );

      // 2. Регистрация карточки настроек
      ctx.slots?.register?.(
        {
          name: 'settings.plugin.item',
          key: NS,
          locale: NS,
          inject: () => ({ ctx }),
        },
        GoalSettingsCard,
      );
    };

    return module.exports;
  },
});
