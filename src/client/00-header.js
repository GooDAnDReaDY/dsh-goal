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

