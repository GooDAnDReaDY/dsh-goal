window.__ModuleLoader__.load({

  id: '@goodandready/dsh-goal',

  factory: (require) => {

    const module = { exports: {} };

    const React = require('react');

    const { useState, useEffect, useRef, useCallback, useMemo } = React;

    const NS = 'dsh-goal';
    // Plugins page row seat (DSH 0.1.6-alpha.2): key = '<package name>#<row id>'.
    const PKG = '@goodandready/dsh-goal';
    const ROW_ID = 'dsh-goal';
    const ROW_CONFIG_KEY = PKG + '#' + ROW_ID;

    // Safe loading of core primitives

    let Primitives = null;

    try {

      Primitives = require('@deepseek-ai/dsh-client-ui-primitives');

    } catch (_) {

      Primitives = null;

    }

    // --- 10 QUICK LAUNCH ENGINEERING TEMPLATES ---

    const QUICK_LAUNCH_TEMPLATES = [

      { id: 'fix', icon: '🐛', label: { en: 'Fix Bug', zh: '修复缺陷' }, prefix: { en: 'Investigate bug, pinpoint root cause, apply fix, and verify with tests: ', zh: '调查并定位缺陷根源，实施修复并通过测试验证：' } },

      { id: 'refactor', icon: '⚡', label: { en: 'Refactor (YAGNI)', zh: '重构精简' }, prefix: { en: 'Refactor module applying YAGNI principle, delete redundant abstractions, and verify: ', zh: '遵循 YAGNI 原则重构模块，删除冗余抽象并验证：' } },

      { id: 'tests', icon: '📝', label: { en: 'Tests & Coverage', zh: '补充测试' }, prefix: { en: 'Write comprehensive unit tests covering edge cases for: ', zh: '为以下模块编写覆盖边界情况的完整单元测试：' } },

      { id: 'review', icon: '🔍', label: { en: 'Code Review', zh: '代码审计' }, prefix: { en: 'Review codebase for subtle bugs, memory leaks, and over-engineering in: ', zh: '对代码库进行深入审查，排查潜在缺陷与过度设计：' } },

      { id: 'feature', icon: '🚀', label: { en: 'New Feature', zh: '新功能开发' }, prefix: { en: 'Implement new feature according to specification and add tests for: ', zh: '根据规格说明实现新功能并补充测试：' } },

      { id: 'security', icon: '🛡️', label: { en: 'Security Audit', zh: '安全加固' }, prefix: { en: 'Audit security boundaries, sanitize inputs, and prevent injection in: ', zh: '审计安全边界，增加输入过滤与防注入保护：' } },

      { id: 'docs', icon: '📚', label: { en: 'Docs & Contract', zh: '文档规范' }, prefix: { en: 'Update technical documentation, README, and DESIGN.md conforming to standard for: ', zh: '按标准更新技术文档、README 与 DESIGN.md：' } },

      { id: 'upgrade', icon: '📦', label: { en: 'Upgrade Deps', zh: '依赖升级' }, prefix: { en: 'Upgrade dependencies, resolve breaking API changes, and verify build for: ', zh: '安全升级依赖库，解决接口兼容性并确保构建通过：' } },

      { id: 'cleanup', icon: '🧹', label: { en: 'Dead Code', zh: '清理死代码' }, prefix: { en: 'Find and safely remove dead code, unused exports, and stale fixtures in: ', zh: '查找并安全移除死代码、未使用的导出与失效测试用例：' } },

      { id: 'perf', icon: '⚙️', label: { en: 'Performance', zh: '性能优化' }, prefix: { en: 'Profile performance bottlenecks, eliminate unnecessary blocking calls in: ', zh: '分析性能瓶颈，消除阻塞调用并优化响应速度：' } },

    ];

    // --- SVG ICONS ---

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

    // --- STYLES AND CSS RULES (DSH DESIGN SYSTEM) ---

    const CSS_STYLES = `

      .dsh-goal-dock {

        box-sizing: border-box;

        width: calc(100% - var(--dsh-composer-side-clearance, 0px) * 2 - var(--dsh-composer-dock-inset, 0px) * 4);

        max-width: calc(var(--dsh-composer-card-max-width, 768px) - var(--dsh-composer-dock-inset, 0px) * 4);

        margin: 0 auto 8px auto;

        display: flex;

        justify-content: center;

      }

      .dsh-goal-dock.dsh-goal-dock-quick {

        justify-content: flex-start;

        margin-bottom: 4px;

      }

      .dsh-goal-template-chips {

        display: flex;

        flex-wrap: wrap;

        gap: 6px;

        margin-bottom: 12px;

      }

      .dsh-goal-template-chip {

        appearance: none;

        font: inherit;

        background: var(--dsw-alias-bg-layer-2);

        border: 1px solid var(--dsw-alias-border-l2);

        border-radius: 999px;

        padding: 3px 8px;

        font-size: 11px;

        color: var(--dsw-alias-label-secondary);

        cursor: pointer;

        display: inline-flex;

        align-items: center;

        gap: 4px;

        transition: all 0.12s ease;

      }

      .dsh-goal-template-chip:hover {

        background: var(--dsw-alias-bg-layer-4, var(--dsw-alias-bg-layer-3));

        border-color: var(--dsw-alias-label-tertiary);

        color: var(--dsw-alias-label-primary);

      }

      .dsh-goal-nudge-box {

        display: flex;

        align-items: center;

        gap: 8px;

        margin-top: 4px;

      }

      .dsh-goal-git-badge {

        display: inline-flex;

        align-items: center;

        gap: 4px;

        font-family: monospace;

        font-size: 11px;

        padding: 2px 6px;

        border-radius: 4px;

        background: var(--dsw-alias-bg-layer-2);

        border: 1px solid var(--dsw-alias-border-l2);

        color: var(--dsw-alias-label-secondary);

        cursor: pointer;

      }

      .dsh-goal-git-badge:hover {

        color: var(--dsw-alias-label-primary);

        border-color: var(--dsw-alias-label-tertiary);

      }

      .dsh-goal-quicklaunch-btn {

        appearance: none;

        font: inherit;

        background: var(--dsw-alias-bg-layer-2);

        border: 1px solid var(--dsw-alias-border-l2);

        border-radius: 999px;

        padding: 4px 11px;

        color: var(--dsw-alias-label-secondary);

        font-size: 12px;

        font-weight: 500;

        cursor: pointer;

        display: inline-flex;

        align-items: center;

        gap: 6px;

        transition: all 0.15s ease;

        box-shadow: var(--dsw-alias-shadow-s, 0 1px 2px transparent);

      }

      .dsh-goal-quicklaunch-btn:hover {

        background: var(--dsw-alias-bg-layer-3);

        border-color: var(--dsw-alias-label-tertiary);

        color: var(--dsw-alias-label-primary);

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

        box-shadow: var(--dsw-alias-shadow-m, 0 1px 4px transparent);

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

        background: var(--dsw-alias-state-success-bg, var(--dsw-alias-bg-hover));

      }

      .dsh-goal-badge-warn {

        border-color: var(--dsw-alias-state-warning-primary);

        color: var(--dsw-alias-state-warning-primary);

        background: var(--dsw-alias-state-warning-bg, var(--dsw-alias-bg-hover));

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

        border-color: var(--dsw-alias-state-error-border, var(--dsw-alias-border-l1));

      }

      .dsh-goal-btn-danger:hover:not(:disabled) {

        background: var(--dsw-alias-state-error-bg, var(--dsw-alias-bg-hover)) !important;

        border-color: var(--dsw-alias-state-error-primary);

      }

      /* Modal Details */

      .dsh-goal-modal-overlay {

        position: fixed;

        inset: 0;

        background: var(--dsw-alias-mask-bg, var(--dsw-alias-bg-primary));

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

        box-shadow: var(--dsw-alias-shadow-l, 0 16px 36px var(--dsw-alias-border-l1));

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

        grid-template-columns: repeat(auto-fit, minmax(95px, 1fr));

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

        font-size: 15px;

        font-weight: 700;

        color: var(--dsw-alias-label-primary);

        overflow: hidden;

        text-overflow: ellipsis;

        white-space: nowrap;

      }

      .dsh-goal-stat-lbl {

        font-size: 11px;

        color: var(--dsw-alias-label-secondary);

        white-space: nowrap;

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

        flex-wrap: wrap;

      }

      .dsh-goal-btn-copy {

        background: var(--dsw-alias-bg-layer-2);

        border: 1px solid var(--dsw-alias-border-l2);

        color: var(--dsw-alias-label-primary);

      }

      .dsh-goal-btn-copy.copied {

        background: var(--dsw-alias-state-success-bg, var(--dsw-alias-bg-hover));

        border-color: var(--dsw-alias-state-success-primary);

        color: var(--dsw-alias-state-success-primary);

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

    // Synthesize audio chimes via Web Audio API (Item 6)

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

        // Pentatonic chords: success ascending C5-E5-G5-C6; failure descending G4-Eb4-C4

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

          try { actx.close(); } catch (err) { /* ignore audio context close error */ }

        }, 2000);

      } catch (err) { /* handled defensively */ }

    }

    // --- REPORT GENERATOR FOR GITHUB / GITEA PR COMMENT ---

    function generateGitHubPRComment(state) {

      if (!state) return '';

      const title = state.title || 'Goal Report';

      const status = state.state === 'COMPLETED' ? 'COMPLETED' : state.state;

      const elapsed = state.formattedElapsed || '0s';

      const iter = `${state.iterationsCount || 0}/${state.maxIterations || 25}`;

      const totalTokens = state.tokensUsage?.totalTokens || 0;

      const promptTokens = state.tokensUsage?.promptTokens || 0;

      const compTokens = state.tokensUsage?.completionTokens || 0;

      const gitCommit = state.gitStartCommit ? ` &nbsp;|&nbsp; **Git Start:** \`${state.gitStartCommit}\` 📌` : '';

      let md = `## 🎯 Autonomous Goal Resolution: ${title}\n\n`;

      md += `> **Status:** \`${status}\` 🚀 &nbsp;|&nbsp; **Duration:** \`${elapsed}\` ⏱️ &nbsp;|&nbsp; **Iterations:** \`${iter}\` 🔄${gitCommit}\n\n`;

      if (totalTokens > 0) {

        md += `### 📊 Telemetry & Token Usage\n`;

        md += `- **Total Tokens:** \`${totalTokens.toLocaleString('en-US')}\` (Prompt: \`${promptTokens.toLocaleString('en-US')}\`, Completion: \`${compTokens.toLocaleString('en-US')}\`)\n\n`;

      }

      if (state.resultSummary) {

        md += `### 📦 Deliverables & Achievements\n${state.resultSummary}\n\n`;

      } else if (state.description) {

        md += `### 📝 Objective\n${state.description}\n\n`;

      }

      const milestones = state.milestones || [];

      if (milestones.length > 0) {

        const completedCount = milestones.filter(m => m.status === 'completed').length;

        md += `<details>\n<summary><b>📋 Milestones Breakdown (${completedCount}/${milestones.length} Completed)</b></summary>\n\n`;

        md += `| # | Status | Milestone | Notes |\n|---|---|---|---|\n`;

        milestones.forEach((m, idx) => {

          const mark = m.status === 'completed' ? '✅ Done' : m.status === 'in_progress' ? '🔄 In Progress' : '⏳ Pending';

          const cleanTitle = (m.title || '').replace(/\|/g, '\\|');

          const cleanNotes = (m.notes || '').replace(/\|/g, '\\|');

          md += `| ${idx + 1} | ${mark} | ${cleanTitle} | ${cleanNotes || '—'} |\n`;

        });

        md += `\n</details>\n\n`;

      }

      md += `*Automated by [@goodandready/dsh-goal](https://github.com/GooDAnDReaDY/dsh-goal)*\n`;

      return md;

    }

    // --- MARKDOWN REPORT GENERATOR ---

    function generateMarkdownReport(state) {

      if (!state) return '';

      const title = state.title || 'Goal Report';

      const status = state.state === 'COMPLETED' ? 'COMPLETED' : state.state;

      const elapsed = state.formattedElapsed || '0s';

      const iter = `${state.iterationsCount || 0}/${state.maxIterations || 25}`;

      const totalTokens = state.tokensUsage?.totalTokens || 0;

      const promptTokens = state.tokensUsage?.promptTokens || 0;

      const compTokens = state.tokensUsage?.completionTokens || 0;

      let md = `# 🎯 Goal Report: ${title}\n\n`;

      md += `**Status:** \`${status}\` | **Duration:** \`${elapsed}\` | **Iterations:** \`${iter}\`\n`;

      if (totalTokens > 0) {

        md += `**Tokens:** \`${totalTokens.toLocaleString('en-US')}\` (Prompt: \`${promptTokens.toLocaleString('en-US')}\`, Completion: \`${compTokens.toLocaleString('en-US')}\`)\n`;

      }

      md += '\n';

      if (state.description) {

        md += `### Description\n${state.description}\n\n`;

      }

      if (state.resultSummary) {

        md += `### Summary & Deliverables\n${state.resultSummary}\n\n`;

      }

      const milestones = state.milestones || [];

      if (milestones.length > 0) {

        md += `### Milestones\n| # | Status | Title | Notes |\n|---|---|---|---|\n`;

        milestones.forEach((m, idx) => {

          const mark = m.status === 'completed' ? '✅ Done' : m.status === 'in_progress' ? '🔄 In Progress' : '⏳ Pending';

          const cleanTitle = (m.title || '').replace(/\|/g, '\\|');

          const cleanNotes = (m.notes || '').replace(/\|/g, '\\|');

          md += `| ${idx + 1} | ${mark} | ${cleanTitle} | ${cleanNotes || '—'} |\n`;

        });

        md += '\n';

      }

      md += `*Generated by DSH Goal Engine at ${new Date().toISOString()}*\n`;

      return md;

    }

    // --- MODAL DETAILS ---

    function GoalDetailsModal({ state, onClose, onAction, t }) {

      if (!state) return null;

      const milestones = state.milestones || [];

      const isCompleted = state.state === 'COMPLETED';

      const [copied, setCopied] = useState(false);

      const [prCopied, setPrCopied] = useState(false);

      const [gitCopied, setGitCopied] = useState(false);

      const [nudgeText, setNudgeText] = useState('');

      const [nudgeSent, setNudgeSent] = useState(false);

      const totalTokens = state.tokensUsage?.totalTokens || 0;

      const promptTokens = state.tokensUsage?.promptTokens || 0;

      const compTokens = state.tokensUsage?.completionTokens || 0;

      const tokensFormatted = totalTokens > 0

        ? (totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : `${totalTokens}`)

        : '—';

      const tokensTooltip = totalTokens > 0

        ? `Prompt: ${promptTokens.toLocaleString('en-US')} | Completion: ${compTokens.toLocaleString('en-US')} | Total: ${totalTokens.toLocaleString('en-US')}`

        : 'Tokens not recorded yet';

      const handleCopyReport = () => {

        const md = generateMarkdownReport(state);

        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {

          navigator.clipboard.writeText(md).then(() => {

            setCopied(true);

            setTimeout(() => setCopied(false), 2500);

          }).catch((err) => {

            console.warn('[dsh-goal] Clipboard copy failed:', err);

          });

        }

      };

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

                ? React.createElement(IconCheck, { size: 18, className: 'dsh-goal-badge-ok' })

                : React.createElement(IconTarget, { size: 18 }),

              isCompleted ? (t('modalTitleCompleted') || 'Goal completed: plan and results') : (t('modalTitle') || 'Goal plan and status'),

            ),

            React.createElement(

              'button',

              {

                className: 'dsh-goal-btn icon-only close',

                onClick: onClose,

                title: t('close') || 'Close',

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

            !isCompleted

              ? React.createElement(

                  'div',

                  { className: 'dsh-goal-nudge-box', style: { marginBottom: 12 } },

                  React.createElement('input', {

                    type: 'text',

                    className: 'dsh-goal-card-input',

                    style: { flex: 1, fontSize: 12 },

                    placeholder: t('nudgePlaceholder') || '💡 Clarify task or steer agent...',

                    value: nudgeText,

                    onChange: (e) => setNudgeText(e.target.value),

                    onKeyDown: (e) => {

                      if (e.key === 'Enter' && nudgeText.trim()) {

                        onAction('nudge', { text: nudgeText.trim() });

                        setNudgeText('');

                        setNudgeSent(true);

                        setTimeout(() => setNudgeSent(false), 2000);

                      }

                    },

                  }),

                  React.createElement(

                    'button',

                    {

                      type: 'button',

                      className: `dsh-goal-btn ${nudgeSent ? 'dsh-goal-btn-primary' : ''}`,

                      disabled: !nudgeText.trim(),

                      onClick: () => {

                        if (nudgeText.trim()) {

                          onAction('nudge', { text: nudgeText.trim() });

                          setNudgeText('');

                          setNudgeSent(true);

                          setTimeout(() => setNudgeSent(false), 2000);

                        }

                      },

                    },

                    nudgeSent ? (t('nudgeSent') || '✅ Steering sent!') : (t('sendNudge') || 'Steer'),

                  ),

                )

              : null,

            state.gitStartCommit

              ? React.createElement(

                  'div',

                  { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 } },

                  React.createElement(

                    'span',

                    {

                      className: 'dsh-goal-git-badge',

                      title: t('copyGitDiff') || 'Click to copy git diff command',

                      onClick: () => {

                        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {

                          navigator.clipboard.writeText(`git diff ${state.gitStartCommit}`).then(() => {

                            setGitCopied(true);

                            setTimeout(() => setGitCopied(false), 2000);

                          });

                        }

                      },

                    },

                    gitCopied ? '✅ Diff copied!' : `📌 Git: ${state.gitStartCommit}`,

                  ),

                )

              : null,

            React.createElement(

              'div',

              { className: 'dsh-goal-stat-grid' },

              React.createElement(

                'div',

                { className: 'dsh-goal-stat-box' },

                React.createElement('span', { className: 'dsh-goal-stat-val' }, state.formattedElapsed || '0s'),

                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('time') || 'Running time'),

              ),

              React.createElement(

                'div',

                { className: 'dsh-goal-stat-box' },

                React.createElement('span', { className: 'dsh-goal-stat-val' }, state.formattedETA || (isCompleted ? (t('done') || 'Done') : '—')),

                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('eta') || 'ETA'),

              ),

              React.createElement(

                'div',

                { className: 'dsh-goal-stat-box', title: tokensTooltip },

                React.createElement('span', { className: 'dsh-goal-stat-val' }, tokensFormatted),

                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('tokens') || 'Tokens'),

              ),

              React.createElement(

                'div',

                { className: 'dsh-goal-stat-box' },

                React.createElement('span', { className: 'dsh-goal-stat-val' }, `${state.iterationsCount || 0}/${state.maxIterations || 25}`),

                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('iterations') || 'Iterations'),

              ),

              React.createElement(

                'div',

                { className: 'dsh-goal-stat-box' },

                React.createElement('span', { className: 'dsh-goal-stat-val' }, `${state.progressPercent || 0}%`),

                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('progress') || 'Progress'),

              ),

            ),

            React.createElement(

              'div',

              { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 } },

              React.createElement('div', { style: { fontWeight: 600, fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, t('milestones') || 'Plan of work:'),

              milestones.length === 0

                ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, padding: '8px 0' } }, t('noMilestones') || 'Agent is preparing the plan of work...')

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

                  React.Fragment,

                  null,

                  React.createElement(

                    'button',

                    {

                      className: `dsh-goal-btn dsh-goal-btn-copy${copied ? ' copied' : ''}`,

                      onClick: handleCopyReport,

                      title: t('copyReport') || 'Copy Report in Markdown',

                    },

                    copied ? (t('reportCopied') || '✅ Copied!') : (t('copyReport') || '📋 Copy Report in Markdown'),

                  ),

                  React.createElement(

                    'button',

                    {

                      className: `dsh-goal-btn dsh-goal-btn-copy${prCopied ? ' copied' : ''}`,

                      onClick: () => {

                        const prMd = generateGitHubPRComment(state);

                        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {

                          navigator.clipboard.writeText(prMd).then(() => {

                            setPrCopied(true);

                            setTimeout(() => setPrCopied(false), 2500);

                          });

                        }

                      },

                      title: 'Copy Report for GitHub / Gitea PR Comment',

                    },

                    prCopied ? (t('prCommentCopied') || '✅ PR Report Copied!') : (t('copyPRComment') || '🐙 Copy for GitHub PR'),

                  ),

                )

              : null,

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

                  t('closeBanner') || 'Close goal banner',

                )

              : null,

            React.createElement(

              'button',

              {

                className: 'dsh-goal-btn dsh-goal-btn-primary',

                onClick: onClose,

              },

              t('close') || 'Close',

            ),

          ),

        ),

      );

    }

    // --- QUICK LAUNCH MODAL ---

    function QuickLaunchModal({ onClose, onStart, t }) {

      const [title, setTitle] = useState('');

      const inputRef = useRef(null);

      useEffect(() => {

        if (inputRef.current) inputRef.current.focus();

      }, []);

      const handleSubmit = (e) => {

        if (e) e.preventDefault();

        const trimmed = title.trim();

        if (trimmed) {

          onStart(trimmed);

        }

      };

      return React.createElement(

        'div',

        { className: 'dsh-goal-modal-overlay', onClick: onClose },

        React.createElement(

          'div',

          {

            className: 'dsh-goal-modal',

            style: { maxWidth: 480 },

            onClick: (e) => e.stopPropagation(),

          },

          React.createElement(

            'div',

            { className: 'dsh-goal-modal-head' },

            React.createElement(

              'div',

              { className: 'dsh-goal-modal-title' },

              React.createElement(IconTarget, { size: 18 }),

              t('quickLaunchTitle') || 'Quick Launch Goal',

            ),

            React.createElement(

              'button',

              { className: 'dsh-goal-btn icon-only close', onClick: onClose, title: t('close') || 'Close' },

              '✕',

            ),

          ),

          React.createElement(

            'form',

            { onSubmit: handleSubmit },

            React.createElement(

              'div',

              { className: 'dsh-goal-modal-body' },

              React.createElement(

                'div',

                { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8 } },

                t('quickLaunchDesc') || 'Define the objective for the agent in autonomous mode:',

              ),

              React.createElement(

                'div',

                { className: 'dsh-goal-template-chips' },

                QUICK_LAUNCH_TEMPLATES.map((tmpl) => {

                  const lang = t('localeCode') || 'en';

                  const label = tmpl.label[lang] || tmpl.label.en;

                  const prefix = tmpl.prefix[lang] || tmpl.prefix.en;

                  return React.createElement(

                    'button',

                    {

                      key: tmpl.id,

                      type: 'button',

                      className: 'dsh-goal-template-chip',

                      title: prefix,

                      onClick: () => {

                        setTitle(prefix);

                        if (inputRef.current) inputRef.current.focus();

                      },

                    },

                    `${tmpl.icon} ${label}`,

                  );

                }),

              ),

              React.createElement('input', {

                ref: inputRef,

                type: 'text',

                className: 'dsh-goal-card-input',

                style: { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px' },

                placeholder: t('quickLaunchPlaceholder') || 'e.g. Implement report export and cover with unit tests...',

                value: title,

                onChange: (e) => setTitle(e.target.value),

                onKeyDown: (e) => {

                  if (e.key === 'Enter' && !e.shiftKey) {

                    e.preventDefault();

                    handleSubmit();

                  }

                },

              }),

            ),

            React.createElement(

              'div',

              { className: 'dsh-goal-modal-foot' },

              React.createElement(

                'button',

                { type: 'button', className: 'dsh-goal-btn', onClick: onClose },

                t('close') || 'Cancel',

              ),

              React.createElement(

                'button',

                {

                  type: 'submit',

                  className: 'dsh-goal-btn dsh-goal-btn-primary',

                  disabled: !title.trim(),

                },

                t('startGoal') || 'Start Goal',

              ),

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

      } catch (err) { /* handled defensively */ }

      return 'default';

    }

    // --- COMPOSER DOCK WIDGET ---

    function GoalTopBanner(props) {

      const { ctx } = props || {};

      const sid = sessionIdOf(ctx, props);

      const [state, setState] = useState(null);

      const [isModalOpen, setIsModalOpen] = useState(false);

      const [isQuickLaunchOpen, setIsQuickLaunchOpen] = useState(false);

      const [now, setNow] = useState(() => Date.now());

      const stateRef = useRef(null);

      stateRef.current = state;

      const lastStateRef = useRef(null);

      const resolveLocale = () => {

        let active = 'en';

        if (ctx?.locale?.getSnapshot) {

          const snapLoc = ctx.locale.getSnapshot();

          if (snapLoc?.active) {

            const code = snapLoc.active.toLowerCase();

            if (code.startsWith('zh')) active = 'zh';

            else active = 'en';

          }

        } else if (typeof navigator !== 'undefined' && navigator.language) {

          const code = navigator.language.toLowerCase();

          if (code.startsWith('zh')) active = 'zh';

          else active = 'en';

        }

        if (state?.lang) {

          if (state.lang === 'zh') active = 'zh';

          else active = 'en';

        }

        return active;

      };

      const t = (key) => {

        const active = resolveLocale();

        return LOCALES[active]?.[key] || LOCALES.en?.[key] || LOCALES.ru?.[key] || key;

      };

      useEffect(() => {

        injectStylesOnce();

      }, []);

      // Local 1-second interval for smooth timer ticking

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

        } catch (err) { /* handled defensively */ }

      }, [sid]);

      // Audio chime on transition to COMPLETED or FAILED

      const updateStateWithAudio = useCallback((nextState) => {

        if (nextState && lastStateRef.current) {

          const prev = lastStateRef.current;

          if (prev.state !== nextState.state && nextState.enableSound !== false) {

            if (nextState.state === 'COMPLETED') {

              playGoalChime(true);

            } else if (nextState.state === 'FAILED') {

              playGoalChime(false);

            }

            // HTML5 Browser Desktop Notification

            if (typeof window !== 'undefined' && 'Notification' in window) {

              if (nextState.enableBrowserNotifications !== false && Notification.permission === 'granted') {

                try {

                  const isOk = nextState.state === 'COMPLETED';

                  new Notification(

                    isOk ? '🎯 Goal Completed' : '⚠️ Goal Failed',

                    {

                      body: `${nextState.title} (${nextState.formattedElapsed || ''})`,

                      icon: '/favicon.ico',

                    }

                  );

                } catch (err) { /* handled defensively */ }

              }

            }

          }

        }

        lastStateRef.current = nextState;

        setState(nextState);

      }, []);

      // Realtime Server-Sent Events (SSE) with adaptive fallback polling

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

              } catch (err) { /* handled defensively */ }

            };

            es.onerror = () => {

              sseActive = false;

              if (es) {

                es.close();

                es = null;

              }

              if (!isDisposed) {

                // Trigger immediate polling for UI continuity

                if (!timer) scheduleNextPoll();

                // Exponential backoff for SSE reconnect (2s to 30s) with jitter

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

        // Initial state load

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

              // Reconnect SSE when tab becomes visible

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

        } catch (err) { /* handled defensively */ }

      };

      const showQuickLaunch = state ? (state.showQuickLaunchButton !== false) : true;

      if (!state || !state.hasActiveGoal) {

        if (!showQuickLaunch) return null;

        return React.createElement(

          React.Fragment,

          null,

          React.createElement(

            'div',

            { className: 'dsh-goal-dock dsh-goal-dock-quick', 'data-goal-dock': 'true' },

            React.createElement(

              'button',

              {

                className: 'dsh-goal-quicklaunch-btn',

                title: t('quickLaunch') || 'Start Goal (Goal Mode)',

                onClick: () => setIsQuickLaunchOpen(true),

              },

              React.createElement(IconTarget, { size: 14 }),

              React.createElement('span', null, t('quickLaunch') || 'Start Goal'),

            ),

          ),

          isQuickLaunchOpen

            ? React.createElement(QuickLaunchModal, {

                onClose: () => setIsQuickLaunchOpen(false),

                onStart: async (title) => {

                  await handleAction('start', { title });

                  setIsQuickLaunchOpen(false);

                },

                t,

              })

            : null,

        );

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

      const etaStr = state?.formattedETA ? ` (ETA ${state.formattedETA})` : '';

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

                isCompleted ? (t('goalCompleted') || 'Goal completed') : isPaused ? (t('paused') || 'Paused') : (t('goalLabel') || 'Current goal'),

              ),

              React.createElement('span', { className: 'dsh-goal-title', title: state.title }, state.title),

            ),

            React.createElement(

              'div',

              { className: 'dsh-goal-right' },

              React.createElement(

                'span',

                { className: 'dsh-goal-time' },

                `⏱ ${liveElapsedStr}${etaStr}`,

              ),

              !isCompleted

                ? React.createElement(

                    'button',

                    {

                      className: 'dsh-goal-btn icon-only',

                      title: isPaused ? (t('resume') || 'Resume') : (t('pause') || 'Pause'),

                      onClick: () => handleAction(isPaused ? 'resume' : 'pause'),

                    },

                    isPaused ? React.createElement(IconPlay, { size: 14 }) : React.createElement(IconPause, { size: 14 }),

                  )

                : null,

              React.createElement(

                'button',

                {

                  className: 'dsh-goal-btn icon-only',

                  title: t('details') || 'Expand goal details',

                  onClick: () => setIsModalOpen(true),

                },

                React.createElement(IconExpand, { size: 14 }),

              ),

              isCompleted

                ? React.createElement(

                    'button',

                    {

                      className: 'dsh-goal-btn icon-only close',

                      title: t('closeBanner') || 'Close goal banner',

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

    // --- SETTINGS FORM LOGIC ---

    const DEFAULT_SETTINGS = {

      maxIterations: 25,

      autoDrive: true,

      enableSound: true,

      showQuickLaunchButton: true,

      consecutiveToolFailureLimit: 3,

      enableBrowserNotifications: true,

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

      const fields = ['maxIterations', 'autoDrive', 'enableSound', 'showQuickLaunchButton'];

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

    // --- SETTINGS CARD ---

    function GoalSettingsCard(props) {

      const { scope, ctx } = props || {};

      const [isOpen, setIsOpen] = useState(false);

      const [draft, setDraft] = useState(null);

      const [saving, setSaving] = useState(false);

      const [failed, setFailed] = useState(false);

      const [updateState, setUpdateState] = useState({
        checking: false,
        updating: false,
        currentVersion: '0.2.3',
        latestVersion: '',
        updateAvailable: false,
        notice: '',
        error: '',
      });

      const checkUpdate = useCallback(async () => {
        setUpdateState((s) => ({ ...s, checking: true, error: '' }));
        try {
          const res = await fetch('/api/dsh-goal/update');
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json().catch(() => ({}));
          setUpdateState((s) => ({
            ...s,
            checking: false,
            currentVersion: data.currentVersion || s.currentVersion,
            latestVersion: data.latestVersion || '',
            updateAvailable: Boolean(data.updateAvailable),
          }));
        } catch (err) {
          setUpdateState((s) => ({ ...s, checking: false }));
        }
      }, []);

      const handleTriggerUpdate = async () => {
        if (updateState.updating) return;
        setUpdateState((s) => ({ ...s, updating: true, error: '', notice: '' }));
        try {
          const res = await fetch('/api/dsh-goal/update', {
            method: 'POST',
            headers: { 'x-dsh-plugin-update': '1' },
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.ok === false || data.error) {
            throw new Error(data.error || ('HTTP ' + res.status));
          }
          const newVer = data.version || updateState.latestVersion || updateState.currentVersion;
          setUpdateState((s) => ({
            ...s,
            updating: false,
            updateAvailable: false,
            currentVersion: newVer,
            notice: (typeof t === 'function' ? t('updateDone') : null) || `Updated to ${newVer}. Please restart DSH to apply.`,
          }));
        } catch (e) {
          setUpdateState((s) => ({
            ...s,
            updating: false,
            error: ((typeof t === 'function' ? t('updateFailed') : null) || 'Update failed: ') + (e && e.message || String(e)),
          }));
        }
      };

      useEffect(() => {
        if (isOpen) {
          checkUpdate();
        }
      }, [isOpen, checkUpdate]);


      const [snap, setSnap] = useState(() => (scope && typeof scope.getSnapshot === 'function' ? scope.getSnapshot() : null));

      useEffect(() => {

        injectStylesOnce();

      }, []);

      useEffect(() => {

        if (!scope || typeof scope.subscribe !== 'function') return;

        return scope.subscribe((next) => {

          setSnap(next || scope.getSnapshot());

        });

      }, [scope]);

      const resolveLocale = () => {

        let active = 'en';

        if (ctx?.locale?.getSnapshot) {

          const snapLoc = ctx.locale.getSnapshot();

          if (snapLoc?.active) {

            const code = snapLoc.active.toLowerCase();

            if (code.startsWith('zh')) active = 'zh';

            else active = 'en';

          }

        } else if (typeof navigator !== 'undefined' && navigator.language) {

          const code = navigator.language.toLowerCase();

          if (code.startsWith('zh')) active = 'zh';

          else active = 'en';

        }

        return active;

      };

      const t = (key) => {

        const active = resolveLocale();

        return LOCALES[active]?.[key] || LOCALES.en[key] || key;

      };

      const status = snap ? (snap.status || 'ready') : (scope ? 'loading' : 'unavailable');

      const maxIterStatus = getFieldStatus('maxIterations', draft?.maxIterations, snap);

      const autoDriveStatus = getFieldStatus('autoDrive', draft?.autoDrive, snap);

      const enableSoundStatus = getFieldStatus('enableSound', draft?.enableSound, snap);

      const quickLaunchStatus = getFieldStatus('showQuickLaunchButton', draft?.showQuickLaunchButton, snap);

      const toolFailStatus = getFieldStatus('consecutiveToolFailureLimit', draft?.consecutiveToolFailureLimit, snap);

      const notifStatus = getFieldStatus('enableBrowserNotifications', draft?.enableBrowserNotifications, snap);

      const dirty = maxIterStatus.isDirty || autoDriveStatus.isDirty || enableSoundStatus.isDirty || quickLaunchStatus.isDirty || toolFailStatus.isDirty || notifStatus.isDirty;

      const invalid = maxIterStatus.invalid || toolFailStatus.invalid;

      const disabled = !scope || saving || snap?.writable === false;

      const edit = (field, val) => {

        setFailed(false);

        setDraft((prev) => ({

          maxIterations: prev?.maxIterations !== undefined ? prev.maxIterations : maxIterStatus.value,

          autoDrive: prev?.autoDrive !== undefined ? prev.autoDrive : autoDriveStatus.value,

          enableSound: prev?.enableSound !== undefined ? prev.enableSound : enableSoundStatus.value,

          showQuickLaunchButton: prev?.showQuickLaunchButton !== undefined ? prev.showQuickLaunchButton : quickLaunchStatus.value,

          consecutiveToolFailureLimit: prev?.consecutiveToolFailureLimit !== undefined ? prev.consecutiveToolFailureLimit : toolFailStatus.value,

          enableBrowserNotifications: prev?.enableBrowserNotifications !== undefined ? prev.enableBrowserNotifications : notifStatus.value,

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

      // Row seat (plugins.row.config): the host page draws title/icon/crumb and the
      // padding, so the summary is a one-liner and the page drops our card chrome.
      if (props && props.view === 'summary') {
        return React.createElement('span', { className: 'dsh-goal-sub' }, t('cardSubtitle') || 'Goal tracking with checkpoints and subgoals');
      }
      const page = !!(props && props.view === 'page');

      return React.createElement(

        page ? 'div' : 'li',

        { className: page ? 'dsh-goal-page' : 'dsh-goal-card' },

        React.createElement(

          'button',

          {

            className: 'dsh-goal-card-head',

            style: page ? { display: 'none' } : undefined,

            onClick: () => setIsOpen(!isOpen),

            'aria-expanded': page ? true : isOpen,

          },

          React.createElement(

            'div',

            { style: { flex: 1 } },

            React.createElement('div', { className: 'dsh-goal-card-title' }, t('pluginTitle') || 'Goal Mode & Autonomous Loop'),

            React.createElement('div', { className: 'dsh-goal-card-sub' }, t('pluginDesc') || 'Goal banner above composer dock, milestone decomposition, and auto-drive'),

          ),

          React.createElement(Chevron, { className: `dsh-goal-chev ${isOpen ? 'dsh-goal-chev-open' : ''}` }),

        ),

        isOpen

          ? React.createElement(

              'div',

              { className: 'dsh-goal-card-body' },

              status === 'loading'

                ? React.createElement('p', { className: 'dsh-goal-field-hint', style: { padding: '12px 0' } }, t('loading') || 'Loading settings…')

                : status !== 'ready'

                  ? React.createElement('p', { className: 'dsh-goal-foot-note', style: { padding: '12px 0' } }, t('unavailable') || 'Settings unavailable')

                  : React.createElement(

                      React.Fragment,

                      null,

                      React.createElement(
                        'div',
                        {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 0',
                            borderBottom: '1px solid var(--dsw-alias-border-l1)',
                            marginBottom: '12px',
                          },
                        },
                        React.createElement(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                          React.createElement('span', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, t('version') || 'Version'),
                          React.createElement('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, 'v' + (updateState.currentVersion || '0.2.3')),
                          updateState.updateAvailable
                            ? React.createElement('span', { className: 'dsh-goal-badge dsh-goal-badge-warn', style: { fontSize: 11 } }, 'v' + updateState.latestVersion + ' ' + (t('updateAvailable') || 'available'))
                            : React.createElement('span', { className: 'dsh-goal-badge dsh-goal-badge-ok', style: { fontSize: 11 } }, '✓ ' + (t('upToDate') || 'Up to date')),
                        ),
                        updateState.updateAvailable
                          ? React.createElement(
                              'button',
                              {
                                type: 'button',
                                className: 'dsh-goal-btn dsh-goal-btn-primary',
                                disabled: updateState.updating,
                                onClick: handleTriggerUpdate,
                                style: { padding: '4px 10px', fontSize: 12 },
                              },
                              updateState.updating ? (t('updating') || 'Updating…') : (t('updateBtn') || 'Update'),
                            )
                          : React.createElement(
                              'button',
                              {
                                type: 'button',
                                className: 'dsh-goal-discard',
                                disabled: updateState.checking,
                                onClick: checkUpdate,
                                style: { padding: '4px 10px', fontSize: 12 },
                              },
                              updateState.checking ? (t('checking') || 'Checking…') : (t('checkUpdate') || 'Check update'),
                            ),
                      ),
                      updateState.notice ? React.createElement('div', { className: 'dsh-goal-foot-note', style: { color: 'var(--dsw-alias-state-success-primary)', padding: '6px 0' } }, '✓ ' + updateState.notice) : null,
                      updateState.error ? React.createElement('div', { className: 'dsh-goal-foot-note', style: { color: 'var(--dsw-alias-state-error-primary)', padding: '6px 0' } }, '⚠ ' + updateState.error) : null,

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-card-field' },

                        React.createElement(

                          'div',

                          { className: 'dsh-goal-field-label-row' },

                          React.createElement('label', { htmlFor: 'dsh-goal-max-iter' }, t('maxIterLabel') || 'Max iterations (Safety Limit):'),

                          React.createElement(

                            'div',

                            { className: 'dsh-goal-field-meta' },

                            maxIterStatus.isOverridden

                              ? React.createElement('span', { className: 'dsh-goal-override-tag' }, t('overridden') || 'overridden')

                              : null,

                            maxIterStatus.isOverridden

                              ? React.createElement(

                                  'button',

                                  {

                                    type: 'button',

                                    className: 'dsh-goal-btn-inline-reset',

                                    title: t('resetField') || 'Reset to default',

                                    onClick: () => resetFieldToDefault('maxIterations'),

                                  },

                                  React.createElement(IconRotateCcw, { size: 12 }),

                                  t('resetField') || 'Default',

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

                          t('autoDriveLabel') || 'Auto-drive: keep the loop running automatically',

                        ),

                        autoDriveStatus.isOverridden

                          ? React.createElement(

                              'button',

                              {

                                type: 'button',

                                className: 'dsh-goal-btn-inline-reset',

                                title: t('resetField') || 'Reset to default',

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

                          t('soundLabel') || 'Sound when a goal completes',

                        ),

                        enableSoundStatus.isOverridden

                          ? React.createElement(

                              'button',

                              {

                                type: 'button',

                                className: 'dsh-goal-btn-inline-reset',

                                title: t('resetField') || 'Reset to default',

                                onClick: () => resetFieldToDefault('enableSound'),

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

                            checked: quickLaunchStatus.value !== false,

                            disabled,

                            onChange: (e) => edit('showQuickLaunchButton', e.target.checked),

                          }),

                          t('quickLaunchLabel') || 'Quick launch goal button above composer dock',

                        ),

                        quickLaunchStatus.isOverridden

                          ? React.createElement(

                              'button',

                              {

                                type: 'button',

                                className: 'dsh-goal-btn-inline-reset',

                                title: t('resetField') || 'Reset to default',

                                onClick: () => resetFieldToDefault('showQuickLaunchButton'),

                              },

                              React.createElement(IconRotateCcw, { size: 12 }),

                            )

                          : null,

                      ),

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-card-field' },

                        React.createElement(

                          'div',

                          { className: 'dsh-goal-field-label-row' },

                          React.createElement('label', { htmlFor: 'dsh-goal-tool-fail' }, t('toolFailLabel') || 'Tool-Failure Breaker Limit:'),

                          React.createElement(

                            'div',

                            { className: 'dsh-goal-field-meta' },

                            toolFailStatus.isOverridden

                              ? React.createElement('span', { className: 'dsh-goal-override-tag' }, t('overridden') || 'overridden')

                              : null,

                            toolFailStatus.isOverridden

                              ? React.createElement(

                                  'button',

                                  {

                                    type: 'button',

                                    className: 'dsh-goal-btn-inline-reset',

                                    title: t('resetField') || 'Reset to default',

                                    onClick: () => edit('consecutiveToolFailureLimit', snap?.base?.consecutiveToolFailureLimit ?? DEFAULT_SETTINGS.consecutiveToolFailureLimit),

                                  },

                                  React.createElement(IconRotateCcw, { size: 12 }),

                                  t('resetField') || 'Default',

                                )

                              : null,

                          ),

                        ),

                        React.createElement('input', {

                          id: 'dsh-goal-tool-fail',

                          type: 'number',

                          min: 0,

                          placeholder: String(toolFailStatus.baseValue),

                          value: toolFailStatus.value !== undefined ? String(toolFailStatus.value) : '',

                          disabled,

                          className: 'dsh-goal-card-input',

                          onChange: (e) => edit('consecutiveToolFailureLimit', parseNumberField(e.target.value)),

                        }),

                        React.createElement(

                          'p',

                          { className: 'dsh-goal-field-hint' },

                          t('toolFailHint') || 'Auto-pause goal if N consecutive turns hit tool execution errors (0 to disable)',

                        ),

                      ),

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-check-row' },

                        React.createElement(

                          'label',

                          { className: 'dsh-goal-check' },

                          React.createElement('input', {

                            type: 'checkbox',

                            checked: notifStatus.value !== false,

                            disabled,

                            onChange: (e) => {

                              edit('enableBrowserNotifications', e.target.checked);

                              if (e.target.checked && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {

                                Notification.requestPermission();

                              }

                            },

                          }),

                          t('notifLabel') || 'Native browser desktop notifications on completion',

                        ),

                        notifStatus.isOverridden

                          ? React.createElement(

                              'button',

                              {

                                type: 'button',

                                className: 'dsh-goal-btn-inline-reset',

                                title: t('resetField') || 'Reset to default',

                                onClick: () => resetFieldToDefault('enableBrowserNotifications'),

                              },

                              React.createElement(IconRotateCcw, { size: 12 }),

                            )

                          : null,

                      ),

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-foot' },

                        failed

                          ? React.createElement('span', { className: 'dsh-goal-foot-note' }, t('saveFailed') || 'Not saved — fix the values and try again')

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

                          t('discard') || 'Discard changes',

                        ),

                        React.createElement(

                          'button',

                          { className: 'dsh-goal-save', disabled: !dirty || disabled || invalid, onClick: save },

                          saving ? (t('saving') || 'Saving…') : (t('save') || 'Save'),

                        ),

                      ),

                    ),

            )

          : null,

      );

    }

    // --- LOCALIZATION DICTIONARIES ---

    const LOCALES = {

      en: {

        goalLabel: 'Current goal',
        version: 'Version',
        updateAvailable: 'available',
        upToDate: 'Up to date',
        updateBtn: 'Update',
        updating: 'Updating…',
        checkUpdate: 'Check update',
        checking: 'Checking…',
        updateDone: 'Updated successfully. Please restart DSH to apply.',
        updateFailed: 'Update failed: ',

        goalCompleted: 'Goal completed',

        clearGoal: 'Clear goal',

        closeBanner: 'Close goal banner',

        pause: 'Pause',

        paused: 'Paused',

        resume: 'Resume',

        details: 'Expand Goal Details',

        modalTitle: 'Goal Plan & Status',

        modalTitleCompleted: 'Goal Completed: Plan & Results',

        time: 'Running time',

        eta: 'ETA',

        tokens: 'Tokens',

        iterations: 'Iterations',

        progress: 'Progress',

        done: 'Done',

        milestones: 'Plan of work:',

        noMilestones: 'Agent is preparing the plan of work...',

        close: 'Close',

        pluginTitle: 'Goal Mode & Autonomous Loop',

        pluginDesc: 'Goal banner above composer dock, milestone decomposition, and auto-drive',

        maxIterLabel: 'Max iterations (Safety Limit):',

        autoDriveLabel: 'Auto-drive: keep the loop running automatically',

        soundLabel: 'Sound when a goal completes',

        quickLaunchLabel: 'Quick launch goal button above composer dock',

        quickLaunch: 'Start Goal',

        quickLaunchTitle: 'Quick Launch Goal',

        quickLaunchDesc: 'Define the objective for the agent in autonomous mode:',

        quickLaunchPlaceholder: 'e.g. Implement report export and cover with unit tests...',

        startGoal: 'Start Goal',

        copyReport: '📋 Copy Report in Markdown',

        reportCopied: '✅ Copied!',

        save: 'Save',

        saving: 'Saving…',

        discard: 'Discard changes',

        resetField: 'Default',

        overridden: 'overridden',

        saveFailed: 'Not saved — fix the values and try again',

        loading: 'Loading settings…',

        unavailable: 'Settings unavailable',

        localeCode: 'en',

        copyPRComment: '🐙 Copy for GitHub PR',

        prCommentCopied: '✅ PR Report Copied!',

        nudgePlaceholder: '💡 Clarify task or steer agent...',

        sendNudge: 'Steer',

        nudgeSent: '✅ Steering sent!',

        copyGitDiff: 'Click to copy git diff command',

        toolFailLabel: 'Tool-Failure Breaker Limit:',

        toolFailHint: 'Auto-pause goal if N consecutive turns hit tool execution errors (0 to disable)',

        notifLabel: 'Native browser desktop notifications on completion',

      },

      zh: {

        goalLabel: '当前目标',
        version: '版本',
        updateAvailable: '可更新',
        upToDate: '已是最新',
        updateBtn: '更新',
        updating: '正在更新…',
        checkUpdate: '检查更新',
        checking: '正在检查…',
        updateDone: '更新成功。请重启 DSH 以生效。',
        updateFailed: '更新失败：',

        goalCompleted: '目标已完成',

        clearGoal: '清除目标',

        closeBanner: '关闭目标横幅',

        pause: '暂停',

        paused: '已暂停',

        resume: '恢复',

        details: '展开目标详情',

        modalTitle: '目标计划与状态',

        modalTitleCompleted: '目标已完成：计划与成果',

        time: '运行时间',

        eta: '预估剩余 (ETA)',

        tokens: 'Token 消耗',

        iterations: '迭代次数',

        progress: '进度',

        done: '已完成',

        milestones: '工作计划：',

        noMilestones: '智能体正在制定工作计划...',

        close: '关闭',

        pluginTitle: '目标模式与自主循环 (Goal Mode)',

        pluginDesc: '输入框上方常驻目标横幅、里程碑拆解与自主循环',

        maxIterLabel: '最大迭代次数 (Safety Limit)：',

        autoDriveLabel: '自动执行：在各轮次间自动保持循环',

        soundLabel: '目标完成时播放提示音',

        quickLaunchLabel: '在输入框上方显示快速启动目标按钮',

        quickLaunch: '启动目标',

        quickLaunchTitle: '快速启动目标',

        quickLaunchDesc: '为自主模式下的智能体设定任务目标：',

        quickLaunchPlaceholder: '例如：实现报表导出功能并编写单元测试...',

        startGoal: '启动目标',

        copyReport: '📋 复制 Markdown 报告',

        reportCopied: '✅ 已复制！',

        save: '保存',

        saving: '保存中…',

        discard: '放弃更改',

        resetField: '恢复默认',

        overridden: '已修改',

        saveFailed: '保存失败 — 请检查并重试',

        loading: '正在加载设置…',

        unavailable: '设置不可用',

        localeCode: 'zh',

        copyPRComment: '🐙 复制为 GitHub PR 报告',

        prCommentCopied: '✅ PR 报告已复制！',

        nudgePlaceholder: '💡 补充要求或调整智能体方向...',

        sendNudge: '下达指令',

        nudgeSent: '✅ 指令已发送！',

        copyGitDiff: '点击复制 git diff 命令',

        toolFailLabel: '工具调用连续故障断路器阈值：',

        toolFailHint: '连续 N 轮遭遇工具调用错误时自动暂停（0 表示禁用）',

        notifLabel: '目标完成时发送浏览器桌面原生通知',

      },

      };

    module.exports.inject = ['slots', 'locale', 'settingsScope'];

    module.exports.apply = function apply(ctx) {

      // Register localization

      try {

        ctx.locale?.register?.(NS, LOCALES);

      } catch (err) { /* handled defensively */ }

      // Plugin settings scope

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

              } catch (err) { /* handled defensively */ }

            });

          } else if (typeof ctx.slots?.register === 'function') {

            ctx.slots.register(entry, comp);

          }

        } catch (err) { /* handled defensively */ }

      };

      // 1. Register composer dock widget

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

      // 2. Register settings card.
      // Row seat first (the seat the current core renders), legacy seat kept after it.

      registerSlotSafe(

        'plugins.row.config',

        {

          name: 'plugins.row.config',

          key: ROW_CONFIG_KEY,

          locale: NS,

          inject: () => ({ ctx, scope: settingsScope }),

        },

        GoalSettingsCard,

      );

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

