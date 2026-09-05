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

    function IconTarget({ size = 15, className = '' }) {
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

    function IconTrash({ size = 14, className = '' }) {
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

    function IconPause({ size = 14, className = '' }) {
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

    function IconPlay({ size = 14, className = '' }) {
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

    function IconExpand({ size = 14, className = '' }) {
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

    function IconRotateCcw({ size = 13, className = '' }) {
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
        React.createElement('polyline', { points: '1 4 1 10 7 10' }),
        React.createElement('path', { d: 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10' }),
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

    // --- СТИЛИ И CSS ПРАВИЛА (ЧИСТЫЕ DSH ТОКЕНЫ БЕЗ ХАРДКОД-ФОЛЛБЕКОВ) ---
    const CSS_STYLES = `
      .dsh-goal-dock {
        box-sizing: border-box;
        width: calc(100% - var(--dsh-composer-side-clearance, 0px) * 2 - var(--dsh-composer-dock-inset, 0px) * 4);
        max-width: calc(var(--dsh-composer-card-max-width, 768px) - var(--dsh-composer-dock-inset, 0px) * 4);
        margin: 0 auto 8px auto;
        display: flex;
        justify-content: center;
      }
      .dsh-goal-banner {
        box-sizing: border-box;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 12px;
        padding: 6px 14px;
        font-family: inherit;
        font-size: 13px;
        color: var(--dsw-alias-label-primary);
        user-select: none;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
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
        color: var(--dsw-alias-label-secondary);
        flex-shrink: 0;
        display: flex;
        align-items: center;
      }
      .dsh-goal-label {
        font-weight: 600;
        color: var(--dsw-alias-label-primary);
        white-space: nowrap;
      }
      .dsh-goal-title {
        color: var(--dsw-alias-label-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 400;
        flex: 1;
        min-width: 0;
      }
      .dsh-goal-time {
        color: var(--dsw-alias-label-tertiary);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        white-space: nowrap;
        margin-left: 2px;
      }
      .dsh-goal-right {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: 12px;
        flex-shrink: 0;
      }
      .dsh-goal-btn {
        background: transparent;
        border: 0;
        padding: 4px;
        margin: 0;
        color: var(--dsw-alias-label-tertiary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        transition: all 0.15s ease;
      }
      .dsh-goal-btn:hover {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-3);
      }
      .dsh-goal-btn.danger:hover {
        color: var(--dsw-alias-status-danger);
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
        background: var(--dsw-alias-bg-layer-3);
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 12px;
        width: 520px;
        max-width: 90vw;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
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
        background: var(--dsw-alias-bg-layer-2);
        border-radius: 3px;
        overflow: hidden;
      }
      .dsh-goal-progress-fill {
        height: 100%;
        background: var(--dsw-alias-status-success);
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
      .dsh-goal-field-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 13px;
        font-weight: 500;
      }
      .dsh-goal-field-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: var(--dsw-alias-label-tertiary);
      }
      .dsh-goal-override-tag {
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-secondary);
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
      .dsh-goal-card-input[aria-invalid="true"] {
        border-color: var(--dsw-alias-status-danger);
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
      .dsh-goal-check-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 0;
      }
      .dsh-goal-check {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--dsw-alias-label-primary);
        cursor: pointer;
      }
      .dsh-goal-foot {
        border-top: 1px solid var(--dsw-alias-border-l2);
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        padding: 12px 0 4px;
      }
      .dsh-goal-foot-note {
        color: var(--dsw-alias-status-danger);
        font-size: 12px;
        margin-right: auto;
      }
      .dsh-goal-btn-inline-reset {
        background: transparent;
        border: 0;
        cursor: pointer;
        padding: 2px 4px;
        display: flex;
        align-items: center;
        gap: 4px;
        border-radius: 4px;
        color: var(--dsw-alias-label-tertiary);
        font-size: 11px;
      }
      .dsh-goal-btn-inline-reset:hover {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-2);
      }
      .dsh-goal-discard {
        appearance: none;
        font: inherit;
        cursor: pointer;
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 8px;
        padding: 5px 14px;
        font-size: 13px;
        background: transparent;
        color: var(--dsw-alias-label-secondary);
        transition: all 0.15s ease;
      }
      .dsh-goal-discard:hover:not(:disabled) {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-2);
      }
      .dsh-goal-discard:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .dsh-goal-save {
        appearance: none;
        font: inherit;
        cursor: pointer;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 5px 14px;
        font-size: 13px;
        background: var(--dsw-alias-label-primary);
        color: var(--dsw-alias-bg-layer-3);
        font-weight: 500;
        transition: opacity 0.15s ease;
      }
      .dsh-goal-save:disabled {
        opacity: 0.4;
        cursor: default;
      }
    `;

    function injectStylesOnce() {
      if (typeof document === 'undefined') return;
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
              { className: 'dsh-goal-btn', onClick: onClose, title: t('close') || 'Закрыть' },
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
                        m.notes ? React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 } }, m.notes) : null,
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
                className: 'dsh-goal-btn danger',
                onClick: () => {
                  onAction('clear');
                  onClose();
                },
                style: { padding: '6px 12px', fontSize: 13 },
              },
              t('clearGoal') || 'Очистить цель',
            ),
            React.createElement(
              'button',
              {
                className: 'dsh-goal-save',
                onClick: onClose,
                style: { padding: '6px 16px' },
              },
              t('close') || 'Закрыть',
            ),
          ),
        ),
      );
    }

    // --- ПАНЕЛЬ ЦЕЛИ В ШАПКЕ СЕССИИ (HEADER UTILITIES WIDGET) ---
    function GoalTopBanner(props) {
      const { ctx } = props || {};
      const [state, setState] = useState(null);
      const [isModalOpen, setIsModalOpen] = useState(false);

      const t = (key) => {
        if (ctx?.locale?.getSnapshot) {
          const snap = ctx.locale.getSnapshot();
          const active = snap?.active || 'ru';
          return LOCALES[active]?.[key] || LOCALES.ru[key] || LOCALES.en[key] || key;
        }
        return LOCALES.ru[key] || LOCALES.en[key] || key;
      };

      useEffect(() => {
        injectStylesOnce();
      }, []);

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
        fetchState();
        const timer = setInterval(fetchState, 1500);
        return () => clearInterval(timer);
      }, [fetchState]);

      const handleAction = async (action, extra = {}) => {
        try {
          const res = await fetch('/dsh-goal/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...extra }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.state) setState(data.state);
          }
        } catch (_) {}
      };

      if (!state || !state.hasActiveGoal) {
        return null;
      }

      const isPaused = state.state === 'PAUSED';

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'div',
          { className: 'dsh-goal-dock', 'data-goal-dock': 'true' },
          React.createElement(
            'div',
            { className: 'dsh-goal-banner' },
            React.createElement(
              'div',
              { className: 'dsh-goal-left' },
              React.createElement('span', { className: 'dsh-goal-icon' }, React.createElement(IconTarget, { size: 15 })),
              React.createElement('span', { className: 'dsh-goal-label' }, t('goalLabel') || 'Текущая цель'),
              React.createElement('span', { className: 'dsh-goal-title', title: state.title }, state.title),
              React.createElement('span', { className: 'dsh-goal-time' }, `• ${state.formattedElapsed || '0s'}`),
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
              React.createElement(IconTrash, { size: 14 }),
            ),
            React.createElement(
              'button',
              {
                className: 'dsh-goal-btn',
                title: isPaused ? (t('resume') || 'Возобновить') : (t('pause') || 'Приостановить'),
                onClick: () => handleAction(isPaused ? 'resume' : 'pause'),
              },
              isPaused ? React.createElement(IconPlay, { size: 14 }) : React.createElement(IconPause, { size: 14 }),
            ),
            React.createElement(
              'button',
              {
                className: 'dsh-goal-btn',
                title: t('details') || 'Развернуть детали цели',
                onClick: () => setIsModalOpen(true),
              },
              React.createElement(IconExpand, { size: 14 }),
            ),
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

    // --- ЛОГИКА ФОРМЫ НАСТРОЕК ---
    const DEFAULT_SETTINGS = {
      maxIterations: 25,
      autoDrive: true,
      enableSound: true,
    };

    function parseNumberField(raw) {
      if (raw === '' || raw === null || raw === undefined) {
        return undefined;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
        return NaN;
      }
      return n;
    }

    function getFieldStatus(field, draftValue, snap) {
      const baseVal = snap?.base?.[field] ?? DEFAULT_SETTINGS[field];
      const userVal = snap?.user?.[field];
      const effectiveVal = snap?.value?.[field] ?? baseVal;

      const isOverridden = userVal !== undefined && userVal !== null;
      const currentVal = draftValue !== undefined ? draftValue : effectiveVal;

      let invalid = false;
      let isDirty = false;

      if (field === 'maxIterations') {
        if (draftValue !== undefined) {
          if (draftValue === '') {
            invalid = false;
            isDirty = userVal !== undefined;
          } else {
            const parsed = parseNumberField(draftValue);
            if (Number.isNaN(parsed)) {
              invalid = true;
              isDirty = true;
            } else {
              isDirty = parsed !== (userVal !== undefined ? userVal : baseVal);
            }
          }
        }
      } else {
        if (draftValue !== undefined) {
          isDirty = draftValue !== (userVal !== undefined ? userVal : baseVal);
        }
      }

      return {
        value: currentVal,
        baseValue: baseVal,
        userValue: userVal,
        isOverridden,
        isDirty,
        invalid,
      };
    }

    function computeSavePlan(draft, snap) {
      if (!draft) return [];

      const writes = [];
      const fields = ['maxIterations', 'autoDrive', 'enableSound'];

      for (const f of fields) {
        if (draft[f] === undefined) continue;

        const status = getFieldStatus(f, draft[f], snap);
        if (status.invalid) continue;

        if (status.isDirty) {
          if (f === 'maxIterations' && draft[f] === '') {
            writes.push([f, undefined]);
          } else if (f === 'maxIterations') {
            writes.push([f, parseNumberField(draft[f])]);
          } else {
            writes.push([f, Boolean(draft[f])]);
          }
        }
      }

      return writes;
    }

    // --- КАРТОЧКА НАСТРОЕК (SETTINGS CARD) ---
    function GoalSettingsCard(props) {
      const { scope, ctx } = props || {};
      const [isOpen, setIsOpen] = useState(false);
      const [draft, setDraft] = useState(null);
      const [saving, setSaving] = useState(false);
      const [failed, setFailed] = useState(false);

      const [snap, setSnap] = useState(() => (scope ? scope.getSnapshot() : { value: DEFAULT_SETTINGS, base: DEFAULT_SETTINGS, user: {} }));

      useEffect(() => {
        injectStylesOnce();
      }, []);

      useEffect(() => {
        if (!scope || typeof scope.subscribe !== 'function') return;
        return scope.subscribe((next) => {
          setSnap(next || scope.getSnapshot());
        });
      }, [scope]);

      const t = (key) => {
        if (ctx?.locale?.getSnapshot) {
          const snapLoc = ctx.locale.getSnapshot();
          const active = snapLoc?.active || 'ru';
          return LOCALES[active]?.[key] || LOCALES.ru[key] || LOCALES.en[key] || key;
        }
        return LOCALES.ru[key] || LOCALES.en[key] || key;
      };

      const maxIterStatus = getFieldStatus('maxIterations', draft?.maxIterations, snap);
      const autoDriveStatus = getFieldStatus('autoDrive', draft?.autoDrive, snap);
      const enableSoundStatus = getFieldStatus('enableSound', draft?.enableSound, snap);

      const dirty = maxIterStatus.isDirty || autoDriveStatus.isDirty || enableSoundStatus.isDirty;
      const invalid = maxIterStatus.invalid;
      const disabled = !scope || saving;

      const edit = (field, val) => {
        setFailed(false);
        setDraft((prev) => ({
          maxIterations: prev?.maxIterations !== undefined ? prev.maxIterations : maxIterStatus.value,
          autoDrive: prev?.autoDrive !== undefined ? prev.autoDrive : autoDriveStatus.value,
          enableSound: prev?.enableSound !== undefined ? prev.enableSound : enableSoundStatus.value,
          [field]: val,
        }));
      };

      const resetFieldToDefault = (field) => {
        if (field === 'maxIterations') {
          edit(field, '');
        } else {
          edit(field, snap?.base?.[field] ?? DEFAULT_SETTINGS[field]);
        }
      };

      const save = async () => {
        if (!scope || !dirty || invalid) return;
        setSaving(true);
        setFailed(false);

        const writes = computeSavePlan(draft, snap);
        let landed = true;

        for (const [field, fieldValue] of writes) {
          try {
            await scope.set(field, fieldValue);
          } catch (err) {
            console.error('[dsh-goal] failed to save setting', field, err);
            landed = false;
          }
        }

        const fresh = scope.getSnapshot();
        const user = fresh.user || {};
        for (const [field, fieldValue] of writes) {
          if (fieldValue === undefined) {
            if (user[field] !== undefined) landed = false;
          } else {
            if (user[field] !== fieldValue) landed = false;
          }
        }

        setSnap(fresh);
        setSaving(false);
        if (landed) {
          setDraft(null);
        } else {
          setFailed(true);
        }
      };

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
                React.createElement(
                  'div',
                  { className: 'dsh-goal-field-label-row' },
                  React.createElement('label', { htmlFor: 'dsh-goal-max-iter' }, t('maxIterLabel') || 'Максимум итераций (Safety Limit):'),
                  React.createElement(
                    'div',
                    { className: 'dsh-goal-field-meta' },
                    maxIterStatus.isOverridden
                      ? React.createElement('span', { className: 'dsh-goal-override-tag' }, t('overridden') || 'изменено')
                      : null,
                    maxIterStatus.isOverridden
                      ? React.createElement(
                          'button',
                          {
                            type: 'button',
                            className: 'dsh-goal-btn-inline-reset',
                            title: t('resetField') || 'Сбросить к значению по умолчанию',
                            onClick: () => resetFieldToDefault('maxIterations'),
                          },
                          React.createElement(IconRotateCcw, { size: 12 }),
                          t('resetField') || 'По умолчанию',
                        )
                      : null,
                  ),
                ),
                React.createElement('input', {
                  id: 'dsh-goal-max-iter',
                  type: 'number',
                  min: 1,
                  placeholder: String(maxIterStatus.baseValue),
                  className: 'dsh-goal-card-input',
                  value: maxIterStatus.value !== undefined ? maxIterStatus.value : '',
                  disabled,
                  'aria-invalid': invalid,
                  onChange: (e) => edit('maxIterations', e.target.value),
                }),
              ),
              React.createElement(
                'div',
                { className: 'dsh-goal-check-row' },
                React.createElement(
                  'label',
                  { className: 'dsh-goal-check' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: autoDriveStatus.value === true,
                    disabled,
                    onChange: (e) => edit('autoDrive', e.target.checked),
                  }),
                  t('autoDriveLabel') || 'Авто-драйв: продолжать цикл автоматически',
                ),
                autoDriveStatus.isOverridden
                  ? React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-goal-btn-inline-reset',
                        title: t('resetField') || 'Сбросить к значению по умолчанию',
                        onClick: () => resetFieldToDefault('autoDrive'),
                      },
                      React.createElement(IconRotateCcw, { size: 12 }),
                    )
                  : null,
              ),
              React.createElement(
                'div',
                { className: 'dsh-goal-check-row' },
                React.createElement(
                  'label',
                  { className: 'dsh-goal-check' },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: enableSoundStatus.value === true,
                    disabled,
                    onChange: (e) => edit('enableSound', e.target.checked),
                  }),
                  t('soundLabel') || 'Звук по завершении цели',
                ),
                enableSoundStatus.isOverridden
                  ? React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-goal-btn-inline-reset',
                        title: t('resetField') || 'Сбросить к значению по умолчанию',
                        onClick: () => resetFieldToDefault('enableSound'),
                      },
                      React.createElement(IconRotateCcw, { size: 12 }),
                    )
                  : null,
              ),
              React.createElement(
                'div',
                { className: 'dsh-goal-foot' },
                failed
                  ? React.createElement('span', { className: 'dsh-goal-foot-note' }, t('saveFailed') || 'Не сохранено — исправьте и повторите')
                  : null,
                React.createElement(
                  'button',
                  {
                    className: 'dsh-goal-discard',
                    disabled: !dirty || disabled,
                    onClick: () => {
                      setFailed(false);
                      setDraft(null);
                    },
                  },
                  t('discard') || 'Отменить правки',
                ),
                React.createElement(
                  'button',
                  { className: 'dsh-goal-save', disabled: !dirty || disabled || invalid, onClick: save },
                  saving ? t('saving') || 'Сохранение…' : t('save') || 'Сохранить',
                ),
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
        pluginDesc: 'Панель цели над полем ввода, декомпозиция вех и авто-драйв',
        maxIterLabel: 'Максимум итераций (Safety Limit):',
        autoDriveLabel: 'Авто-драйв: продолжать цикл автоматически',
        soundLabel: 'Звук по завершении цели',
        save: 'Сохранить',
        saving: 'Сохранение…',
        discard: 'Отменить правки',
        resetField: 'По умолчанию',
        overridden: 'изменено',
        saveFailed: 'Не сохранено — исправьте и повторите',
      },
      en: {
        goalLabel: 'Current goal',
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
        pluginDesc: 'Goal banner above composer dock, milestone decomposition, and auto-drive',
        maxIterLabel: 'Max iterations (Safety Limit):',
        autoDriveLabel: 'Auto-drive: keep the loop running automatically',
        soundLabel: 'Sound when a goal completes',
        save: 'Save',
        saving: 'Saving…',
        discard: 'Discard changes',
        resetField: 'Default',
        overridden: 'overridden',
        saveFailed: 'Not saved — fix the values and try again',
      },
    };

    module.exports.inject = ['slots', 'locale', 'settingsScope'];
    module.exports.apply = function apply(ctx) {
      // Регистрация локализации
      try {
        ctx.locale?.register?.(NS, LOCALES);
      } catch (_) {}

      // Пространство настроек плагина
      const settingsScope =
        ctx.settingsScope && typeof ctx.settingsScope.bind === 'function'
          ? ctx.settingsScope.bind({ namespace: NS })
          : null;

      const registerSlotSafe = (name, entry, comp) => {
        try {
          if (typeof ctx.slots?.inject === 'function') {
            ctx.slots.inject(name, () => {
              try {
                return ctx.slots.register(entry, comp);
              } catch (_) {}
            });
          } else if (typeof ctx.slots?.register === 'function') {
            ctx.slots.register(entry, comp);
          }
        } catch (_) {}
      };

      // 1. Регистрация виджета цели над полем ввода (composer dock)
      registerSlotSafe(
        'conversation.input.dock',
        {
          name: 'conversation.input.dock',
          id: '@goodandready/dsh-goal',
          order: 10,
          locale: NS,
          inject: () => ({ ctx }),
        },
        GoalTopBanner,
      );

      // 2. Регистрация карточки настроек
      registerSlotSafe(
        'settings.plugin.item',
        {
          name: 'settings.plugin.item',
          key: NS,
          locale: NS,
          inject: () => ({ ctx, scope: settingsScope }),
        },
        GoalSettingsCard,
      );
    };

    return module.exports;
  },
});
