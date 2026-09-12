window.__ModuleLoader__.load({
  id: '@goodandready/dsh-goal',
  factory: (require) => {
    const module = { exports: {} };
    const React = require('react');
    const { useState, useEffect, useRef, useCallback, useMemo } = React;

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

    function IconCheck({ size = 15, className = '' }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
        },
        React.createElement('polyline', { points: '20 6 9 17 4 12' }),
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

    // --- СТИЛИ И CSS ПРАВИЛА (СТАНДАРТ DSH-CLINEBOT & ДИЗАЙН-СИСТЕМА DSH) ---
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
        background: var(--dsw-alias-bg-layer-3);
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 12px;
        padding: 7px 14px;
        font-family: inherit;
        font-size: 13px;
        color: var(--dsw-alias-label-primary);
        user-select: none;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
        transition: all 0.15s ease;
      }
      .dsh-goal-banner:hover {
        border-color: var(--dsw-alias-label-tertiary);
      }
      .dsh-goal-banner.completed {
        border-color: var(--dsw-alias-state-success-primary);
        background: var(--dsw-alias-bg-layer-3);
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
      .dsh-goal-badge {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 999px;
        border: 1px solid var(--dsw-alias-border-l2);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: 600;
        white-space: nowrap;
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
      }
      .dsh-goal-badge-ok {
        border-color: var(--dsw-alias-state-success-primary);
        color: var(--dsw-alias-state-success-primary);
        background: rgba(16, 185, 129, 0.08);
      }
      .dsh-goal-badge-warn {
        border-color: var(--dsw-alias-state-warning-primary);
        color: var(--dsw-alias-state-warning-primary);
        background: rgba(245, 158, 11, 0.08);
      }
      .dsh-goal-label {
        font-weight: 600;
        color: var(--dsw-alias-label-primary);
        white-space: nowrap;
      }
      .dsh-goal-label.completed {
        color: var(--dsw-alias-state-success-primary);
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
        color: var(--dsw-alias-label-secondary);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
      .dsh-goal-right {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: 12px;
        flex-shrink: 0;
      }
      .dsh-goal-btn {
        appearance: none;
        font: inherit;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-border-l2);
        padding: 5px 8px;
        margin: 0;
        color: var(--dsw-alias-label-primary);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.15s ease;
      }
      .dsh-goal-btn:hover:not(:disabled) {
        background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-2));
        border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2));
      }
      .dsh-goal-btn.icon-only {
        padding: 4px 6px;
        border-radius: 6px;
        border-color: transparent;
        background: transparent;
        color: var(--dsw-alias-label-tertiary);
      }
      .dsh-goal-btn.icon-only:hover {
        color: var(--dsw-alias-label-primary);
        background: var(--dsw-alias-bg-layer-2);
        border-color: var(--dsw-alias-border-l2);
      }
      .dsh-goal-btn.close {
        font-size: 13px;
        font-weight: bold;
        padding: 3px 6px;
      }
      .dsh-goal-btn.close:hover {
        color: var(--dsw-alias-state-error-primary);
      }
      .dsh-goal-btn-primary {
        background: var(--dsw-alias-label-primary);
        color: var(--dsw-alias-bg-layer-3);
        border-color: transparent;
      }
      .dsh-goal-btn-primary:hover:not(:disabled) {
        opacity: 0.88;
      }
      .dsh-goal-btn-danger {
        color: var(--dsw-alias-state-error-primary);
        border-color: rgba(239, 68, 68, 0.3);
      }
      .dsh-goal-btn-danger:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.12) !important;
        border-color: rgba(239, 68, 68, 0.5);
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
        width: 560px;
        max-width: 90vw;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
      }
      .dsh-goal-modal-head {
        padding: 16px 20px;
        border-bottom: 1px solid var(--dsw-alias-border-l2);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .dsh-goal-modal-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .dsh-goal-modal-body {
        padding: 18px 20px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .dsh-goal-stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 10px;
      }
      .dsh-goal-stat-box {
        padding: 10px 12px;
        border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2);
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .dsh-goal-stat-val {
        font-size: 16px;
        font-weight: 700;
        color: var(--dsw-alias-label-primary);
      }
      .dsh-goal-stat-lbl {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary);
      }
      .dsh-goal-milestone-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--dsw-alias-bg-layer-2);
        border: 1px solid var(--dsw-alias-border-l2);
        font-size: 13px;
        transition: all 0.15s ease;
      }
      .dsh-goal-modal-foot {
        padding: 14px 20px;
        border-top: 1px solid var(--dsw-alias-border-l2);
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
      }

      /* Settings Card (clinebot pattern) */
      .dsh-goal-card {
        border: 1px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-3);
        border-radius: 12px;
        list-style: none;
        margin-bottom: 12px;
        transition: border-color 0.15s ease;
      }
      .dsh-goal-card:hover {
        border-color: var(--dsw-alias-label-tertiary);
      }
      .dsh-goal-card-head {
        appearance: none;
        width: 100%;
        font: inherit;
        color: inherit;
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 0;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
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
        margin: 0 20px;
        padding: 16px 0 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .dsh-goal-card-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .dsh-goal-field-label-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 13px;
        font-weight: 500;
        color: var(--dsw-alias-label-primary);
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
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-secondary);
        border: 1px solid var(--dsw-alias-border-l2);
      }
      .dsh-goal-card-input {
        height: 36px;
        border: 1px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        border-radius: 8px;
        padding: 0 12px;
        font-size: 13px;
        width: 100%;
        box-sizing: border-box;
      }
      .dsh-goal-card-input:focus {
        outline: none;
        border-color: var(--dsw-alias-state-brand-primary);
      }
      .dsh-goal-card-input[aria-invalid="true"] {
        border-color: var(--dsw-alias-state-error-primary);
      }
      .dsh-goal-chev {
        margin-left: auto;
        flex: none;
        color: var(--dsw-alias-label-tertiary);
        transition: transform .16s ease;
      }
      .dsh-goal-chev-open {
        transform: rotate(180deg);
      }
      .dsh-goal-check-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 0;
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
        gap: 10px;
        padding: 14px 0 4px;
      }
      .dsh-goal-foot-note {
        color: var(--dsw-alias-state-error-primary);
        font-size: 12px;
        margin-right: auto;
      }
      .dsh-goal-btn-inline-reset {
        background: transparent;
        border: 0;
        cursor: pointer;
        padding: 2px 6px;
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
        padding: 6px 14px;
        font-size: 13px;
        background: var(--dsw-alias-bg-layer-2);
        color: var(--dsw-alias-label-primary);
        transition: all 0.15s ease;
      }
      .dsh-goal-discard:hover:not(:disabled) {
        background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-2));
        border-color: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2));
      }
      .dsh-goal-discard:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .dsh-goal-save {
        appearance: none;
        font: inherit;
        cursor: pointer;
        border: 1px solid transparent;
        border-radius: 8px;
        padding: 6px 16px;
        font-size: 13px;
        background: var(--dsw-alias-label-primary);
        color: var(--dsw-alias-bg-layer-3);
        font-weight: 500;
        transition: opacity 0.15s ease;
      }
      .dsh-goal-save:hover:not(:disabled) {
        opacity: 0.88;
      }
      .dsh-goal-save:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    `;

    function injectStylesOnce() {
      if (typeof document === 'undefined') return;
      if (document.getElementById('dsh-goal-styles')) return;
      const style = document.createElement('style');
      style.id = 'dsh-goal-styles';
      style.dataset.dshPlugin = NS;
      style.textContent = CSS_STYLES;
      document.head.appendChild(style);
    }


    // Синтез приятных звуковых колокольчиков через Web Audio API (Item 6)
    function playGoalChime(isSuccess = true) {
      if (typeof window === 'undefined') return;
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const actx = new AudioCtx();
        if (actx.state === 'suspended') {
          actx.resume().catch(() => {});
        }
        const now = actx.currentTime;
        // Пентатонические аккорды: успех — восходящий C5-E5-G5-C6; сбой/ошибка — нисходящий G4-Eb4-C4
        const notes = isSuccess
          ? [523.25, 659.25, 783.99, 1046.50]
          : [392.00, 311.13, 261.63];

        notes.forEach((freq, idx) => {
          const osc = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.12);
          
          gain.gain.setValueAtTime(0.001, now + idx * 0.12);
          gain.gain.exponentialRampToValueAtTime(0.15, now + idx * 0.12 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.4);

          osc.connect(gain);
          gain.connect(actx.destination);

          osc.start(now + idx * 0.12);
          osc.stop(now + idx * 0.12 + 0.45);
        });

        setTimeout(() => {
          try { actx.close(); } catch (_) {}
        }, 2000);
      } catch (_) {}
    }

    // --- МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ (MODAL DETAILS) ---
    function GoalDetailsModal({ state, onClose, onAction, t }) {
      if (!state) return null;

      const milestones = state.milestones || [];
      const isCompleted = state.state === 'COMPLETED';

      return React.createElement(
        'div',
        { className: 'dsh-goal-modal-overlay', onClick: onClose },
        React.createElement(
          'div',
          {
            className: 'dsh-goal-modal',
            onClick: (e) => e.stopPropagation(),
          },
          React.createElement(
            'div',
            { className: 'dsh-goal-modal-head' },
            React.createElement(
              'div',
              { className: 'dsh-goal-modal-title' },
              isCompleted
                ? React.createElement(IconCheck, { size: 18, className: 'cb-badge-ok' })
                : React.createElement(IconTarget, { size: 18 }),
              isCompleted ? (t('modalTitleCompleted') || 'Цель выполнена: план и результаты') : (t('modalTitle') || 'План и статус цели'),
            ),
            React.createElement(
              'button',
              {
                className: 'dsh-goal-btn icon-only close',
                onClick: onClose,
                title: t('close') || 'Закрыть',
              },
              '✕',
            ),
          ),
          React.createElement(
            'div',
            { className: 'dsh-goal-modal-body' },
            React.createElement(
              'div',
              null,
              React.createElement('div', { style: { fontWeight: 600, fontSize: 16, marginBottom: 4, color: 'var(--dsw-alias-label-primary)' } }, state.title),
              state.description ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 13, marginBottom: 6, lineHeight: 1.4 } }, state.description) : null,
            ),
            React.createElement(
              'div',
              { className: 'dsh-goal-stat-grid' },
              React.createElement(
                'div',
                { className: 'dsh-goal-stat-box' },
                React.createElement('span', { className: 'dsh-goal-stat-val' }, state.formattedElapsed || '0s'),
                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('time') || 'Время работы'),
              ),
              React.createElement(
                'div',
                { className: 'dsh-goal-stat-box' },
                React.createElement('span', { className: 'dsh-goal-stat-val' }, `${state.iterationsCount || 0}/${state.maxIterations || 25}`),
                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, 'Итерации'),
              ),
              React.createElement(
                'div',
                { className: 'dsh-goal-stat-box' },
                React.createElement('span', { className: 'dsh-goal-stat-val' }, `${state.progressPercent || 0}%`),
                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, 'Прогресс'),
              ),
            ),
            React.createElement(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 } },
              React.createElement('div', { style: { fontWeight: 600, fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, t('milestones') || 'План работ:'),
              milestones.length === 0
                ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, padding: '8px 0' } }, t('noMilestones') || 'Агент формирует план работ...')
                : milestones.map((m, i) =>
                    React.createElement(
                      'div',
                      { key: m.id || i, className: 'dsh-goal-milestone-item' },
                      React.createElement('span', { style: { fontSize: 15 } }, m.status === 'completed' ? '✅' : m.status === 'in_progress' ? '🔄' : '⏳'),
                      React.createElement(
                        'div',
                        { style: { flex: 1, minWidth: 0 } },
                        React.createElement(
                          'div',
                          {
                            style: {
                              textDecoration: m.status === 'completed' ? 'line-through' : 'none',
                              color: m.status === 'completed' ? 'var(--dsw-alias-label-tertiary)' : 'inherit',
                              fontWeight: m.status === 'in_progress' ? 600 : 400,
                            },
                          },
                          `${i + 1}. ${m.title}`,
                        ),
                        m.notes ? React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 } }, m.notes) : null,
                      ),
                    ),
                  ),
            ),
          ),
          React.createElement(
            'div',
            { className: 'dsh-goal-modal-foot' },
            isCompleted
              ? React.createElement(
                  'button',
                  {
                    className: 'dsh-goal-btn dsh-goal-btn-danger',
                    onClick: () => {
                      onAction('clear');
                      onClose();
                    },
                  },
                  t('closeBanner') || 'Закрыть плашку цели',
                )
              : null,
            React.createElement(
              'button',
              {
                className: 'dsh-goal-btn dsh-goal-btn-primary',
                onClick: onClose,
              },
              t('close') || 'Закрыть',
            ),
          ),
        ),
      );
    }

    function sessionIdOf(ctx, props) {
      try {
        if (props?.session?.id) return String(props.session.id);
        if (props?.session?.sessionId) return String(props.session.sessionId);
        if (props?.input?.sessionId) return String(props.input.sessionId);
        if (ctx?.scope?.session) return String(ctx.scope.session.id || ctx.scope.session.header?.id || '');
        if (typeof ctx?.scope?.id === 'string') return ctx.scope.id;
        if (ctx?.session) return String(ctx.session.id || ctx.session.header?.id || '');
        if (typeof window !== 'undefined' && window.location) {
          const params = new URLSearchParams(window.location.search);
          const fromUrl = params.get('session') || params.get('sessionId');
          if (fromUrl) return fromUrl;
        }
      } catch (_) {}
      return 'default';
    }

    // --- ПАНЕЛЬ ЦЕЛИ НАД ПОЛЕМ ВВОДА (COMPOSER DOCK WIDGET) ---
    function GoalTopBanner(props) {
      const { ctx } = props || {};
      const sid = sessionIdOf(ctx, props);
      const [state, setState] = useState(null);
      const [isModalOpen, setIsModalOpen] = useState(false);
      const [now, setNow] = useState(() => Date.now());
      const stateRef = useRef(null);
      stateRef.current = state;
      const lastStateRef = useRef(null);

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

      // Локальный секундный интервал для плавного и бесперебойного тикания таймера
      useEffect(() => {
        const ticker = setInterval(() => {
          setNow(Date.now());
        }, 1000);
        return () => clearInterval(ticker);
      }, []);

      const fetchState = useCallback(async () => {
        try {
          const query = sid && sid !== 'default' ? `?sessionId=${encodeURIComponent(sid)}` : '';
          const res = await fetch(`/dsh-goal/state${query}`, {
            headers: { 'x-dsh-session-id': sid },
          });
          if (res.ok) {
            const data = await res.json();
            updateStateWithAudio(data);
            return data;
          }
        } catch (_) {}
      }, [sid]);

      // Звуковое оповещение при переходе в COMPLETED или FAILED
      const updateStateWithAudio = useCallback((nextState) => {
        if (nextState && lastStateRef.current) {
          const prev = lastStateRef.current;
          if (prev.state !== nextState.state && nextState.enableSound !== false) {
            if (nextState.state === 'COMPLETED') {
              playGoalChime(true);
            } else if (nextState.state === 'FAILED') {
              playGoalChime(false);
            }
          }
        }
        lastStateRef.current = nextState;
        setState(nextState);
      }, []);

      // Realtime Server-Sent Events (SSE) с автоматическим адаптивным fallback-поллингом
      useEffect(() => {
        let es = null;
        let timer = null;
        let reconnectTimer = null;
        let isDisposed = false;
        let sseActive = false;
        let retryCount = 0;

        const scheduleNextPoll = () => {
          if (isDisposed || sseActive) return;
          const currentState = stateRef.current;
          const isDocHidden = typeof document !== 'undefined' && document.hidden;
          const isRunning = currentState?.hasActiveGoal && currentState?.state === 'RUNNING';

          let delay = 1500;
          if (isDocHidden) {
            delay = 10000;
          } else if (!isRunning) {
            delay = 8000;
          }

          timer = setTimeout(async () => {
            await fetchState();
            scheduleNextPoll();
          }, delay);
        };

        const connectSSE = () => {
          if (isDisposed) return;
          if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
            scheduleNextPoll();
            return;
          }

          try {
            if (es) {
              es.close();
              es = null;
            }

            const query = sid && sid !== 'default' ? `?sessionId=${encodeURIComponent(sid)}` : '';
            es = new window.EventSource(`/dsh-goal/events${query}`);

            es.onopen = () => {
              sseActive = true;
              retryCount = 0;
              if (timer) {
                clearTimeout(timer);
                timer = null;
              }
              if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
              }
            };

            es.onmessage = (event) => {
              if (isDisposed) return;
              try {
                const data = JSON.parse(event.data);
                if (data && typeof data === 'object') {
                  updateStateWithAudio(data);
                }
              } catch (_) {}
            };

            es.onerror = () => {
              sseActive = false;
              if (es) {
                es.close();
                es = null;
              }
              if (!isDisposed) {
                // Запускаем немедленный опрос для непрерывности работы UI
                if (!timer) scheduleNextPoll();

                // Экспоненциальный backoff для повторного подключения SSE (от 2s до 30s) с джиттером
                retryCount = Math.min(retryCount + 1, 5);
                const backoffBase = Math.min(30000, 2000 * Math.pow(1.8, retryCount - 1));
                const jitter = Math.random() * 1000;
                const reconnectDelay = Math.round(backoffBase + jitter);

                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(() => {
                  reconnectTimer = null;
                  connectSSE();
                }, reconnectDelay);
              }
            };
          } catch (_) {
            sseActive = false;
            scheduleNextPoll();
          }
        };

        connectSSE();

        // Первоначальная загрузка состояния
        fetchState().then(() => {
          if (!sseActive) scheduleNextPoll();
        });

        const onVisibilityChange = () => {
          if (typeof document !== 'undefined' && !document.hidden) {
            if (!sseActive) {
              if (timer) clearTimeout(timer);
              fetchState().then(() => {
                scheduleNextPoll();
              });
              // При возвращении на вкладку можно попытаться сразу переподключить SSE
              if (!reconnectTimer && !sseActive) {
                connectSSE();
              }
            }
          }
        };

        if (typeof document !== 'undefined' && document.addEventListener) {
          document.addEventListener('visibilitychange', onVisibilityChange);
        }

        return () => {
          isDisposed = true;
          if (es) {
            es.close();
            es = null;
          }
          if (timer) clearTimeout(timer);
          if (reconnectTimer) clearTimeout(reconnectTimer);
          if (typeof document !== 'undefined' && document.removeEventListener) {
            document.removeEventListener('visibilitychange', onVisibilityChange);
          }
        };
      }, [sid, fetchState, updateStateWithAudio]);

      const handleAction = async (action, extra = {}) => {
        try {
          const res = await fetch('/dsh-goal/action', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-dsh-session-id': sid,
            },
            body: JSON.stringify({ action, sessionId: sid, ...extra }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.state) updateStateWithAudio(data.state);
          }
        } catch (_) {}
      };

      if (!state || !state.hasActiveGoal) {
        return null;
      }

      const isPaused = state.state === 'PAUSED';
      const isCompleted = state.state === 'COMPLETED';

      const formatLiveElapsed = () => {
        if (!state) return '0s';
        if (!state.startedAt) return state.formattedElapsed || '0s';
        const endTime = state.completedAt || (state.pausedAt || now);
        const elapsedSec = Math.max(0, Math.floor((endTime - state.startedAt - (state.totalPausedDurationMs || 0)) / 1000));
        return formatElapsed(elapsedSec);
      };

      const liveElapsedStr = formatLiveElapsed();

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'div',
          { className: 'dsh-goal-dock', 'data-goal-dock': 'true' },
          React.createElement(
            'div',
            { className: `dsh-goal-banner${isCompleted ? ' completed' : ''}` },
            React.createElement(
              'div',
              { className: 'dsh-goal-left' },
              React.createElement(
                'span',
                { className: 'dsh-goal-icon' },
                isCompleted ? React.createElement(IconCheck, { size: 16 }) : React.createElement(IconTarget, { size: 15 }),
              ),
              React.createElement(
                'span',
                {
                  className: `dsh-goal-badge ${isCompleted ? 'dsh-goal-badge-ok' : isPaused ? 'dsh-goal-badge-warn' : ''}`,
                },
                isCompleted ? (t('goalCompleted') || 'Цель выполнена') : isPaused ? (t('pause') || 'На паузе') : (t('goalLabel') || 'Текущая цель'),
              ),
              React.createElement('span', { className: 'dsh-goal-title', title: state.title }, state.title),
            ),
            React.createElement(
              'div',
              { className: 'dsh-goal-right' },
              React.createElement(
                'span',
                { className: 'dsh-goal-time' },
                `⏱ ${liveElapsedStr}`,
              ),
              !isCompleted
                ? React.createElement(
                    'button',
                    {
                      className: 'dsh-goal-btn icon-only',
                      title: isPaused ? (t('resume') || 'Возобновить') : (t('pause') || 'Приостановить'),
                      onClick: () => handleAction(isPaused ? 'resume' : 'pause'),
                    },
                    isPaused ? React.createElement(IconPlay, { size: 14 }) : React.createElement(IconPause, { size: 14 }),
                  )
                : null,
              React.createElement(
                'button',
                {
                  className: 'dsh-goal-btn icon-only',
                  title: t('details') || 'Развернуть детали цели',
                  onClick: () => setIsModalOpen(true),
                },
                React.createElement(IconExpand, { size: 14 }),
              ),
              isCompleted
                ? React.createElement(
                    'button',
                    {
                      className: 'dsh-goal-btn icon-only close',
                      title: t('closeBanner') || 'Закрыть плашку цели',
                      onClick: () => handleAction('clear'),
                    },
                    '✕',
                  )
                : null,
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
          isDirty = Boolean(draftValue) !== (userVal !== undefined ? Boolean(userVal) : Boolean(baseVal));
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

      const fields = ['maxIterations', 'autoDrive', 'enableSound'];
      const writes = [];

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

      const status = (snap && snap.status) || 'ready';
      const maxIterStatus = getFieldStatus('maxIterations', draft?.maxIterations, snap);
      const autoDriveStatus = getFieldStatus('autoDrive', draft?.autoDrive, snap);
      const enableSoundStatus = getFieldStatus('enableSound', draft?.enableSound, snap);

      const dirty = maxIterStatus.isDirty || autoDriveStatus.isDirty || enableSoundStatus.isDirty;
      const invalid = maxIterStatus.invalid;
      const disabled = !scope || saving || snap?.writable === false;

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
              status === 'loading'
                ? React.createElement('p', { className: 'dsh-goal-field-hint', style: { padding: '12px 0' } }, t('loading') || 'Загрузка настроек…')
                : status !== 'ready'
                  ? React.createElement('p', { className: 'dsh-goal-foot-note', style: { padding: '12px 0' } }, t('unavailable') || 'Настройки недоступны')
                  : React.createElement(
                      React.Fragment,
                      null,
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
                    ),
            )
          : null,
      );
    }

    // --- СЛОВАРИ ЛОКАЛИЗАЦИИ ---
    const LOCALES = {
      ru: {
        goalLabel: 'Текущая цель',
        goalCompleted: 'Цель выполнена',
        clearGoal: 'Очистить цель',
        closeBanner: 'Закрыть плашку цели',
        pause: 'Приостановить',
        resume: 'Возобновить',
        details: 'Развернуть детали цели',
        modalTitle: 'План и статус цели',
        modalTitleCompleted: 'Цель выполнена: план и результаты',
        time: 'Время работы',
        milestones: 'План работ:',
        noMilestones: 'Агент формирует план работ...',
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
        loading: 'Загрузка настроек…',
        unavailable: 'Настройки недоступны',
      },
      en: {
        goalLabel: 'Current goal',
        goalCompleted: 'Goal completed',
        clearGoal: 'Clear goal',
        closeBanner: 'Close goal banner',
        pause: 'Pause',
        resume: 'Resume',
        details: 'Expand Goal Details',
        modalTitle: 'Goal Plan & Status',
        modalTitleCompleted: 'Goal Completed: Plan & Results',
        time: 'Running time',
        milestones: 'Plan of work:',
        noMilestones: 'Agent is preparing the plan of work...',
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
        loading: 'Loading settings…',
        unavailable: 'Settings unavailable',
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
          inject: (slotProps) => ({ ctx, ...slotProps }),
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
