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

    function formatQuickLaunchPrompt(tmpl, vars, lang) {
      if (!tmpl) return "";
      const chosenLang = lang === "zh" ? "zh" : "en";
      const tStr = tmpl.template ? (tmpl.template[chosenLang] || tmpl.template.en) : null;
      if (!tStr) return tmpl.prefix ? (tmpl.prefix[chosenLang] || tmpl.prefix.en) : "";
      return tStr.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, key) => {
        return (vars && vars[key] != null && vars[key] !== "") ? String(vars[key]) : "";
      }).replace(/\s+/g, " ").trim();
    }

    const QUICK_LAUNCH_TEMPLATES = [
      {
        id: 'fix',
        icon: "🐛",
        label: { en: "Fix Bug", zh: "修复缺陷" },
        prefix: { en: "Investigate bug, pinpoint root cause, apply fix, and verify with tests: ", zh: "调查并定位缺陷根源，实施修复并通过测试验证：" },
        template: {
          en: "Investigate bug {{issueNumber}} in {{targetModule}}, pinpoint root cause, apply targeted fix, and verify with tests: {{description}}",
          zh: "调查缺陷 {{issueNumber}}（位于 {{targetModule}}），定位根因，实施修复并通过测试验证：{{description}}"
        },
        variables: [
          { id: "issueNumber", label: { en: "Issue #", zh: "Issue 编号" }, placeholder: '#issue-123', required: true },
          { id: "targetModule", label: { en: "Target Module", zh: "目标模块" }, placeholder: "lib/tools.js" },
          { id: 'description', label: { en: "Description / Symptom", zh: "症状或描述" }, placeholder: "Describe symptom..." },
        ],
      },
      {
        id: 'refactor',
        icon: "⚡",
        label: { en: "Refactor (YAGNI)", zh: "重构精简" },
        prefix: { en: "Refactor module applying YAGNI principle, delete redundant abstractions, and verify: ", zh: "遵循 YAGNI 原则重构模块，删除冗余抽象并验证：" },
        template: {
          en: "Refactor module {{targetFile}} applying YAGNI principle to < {{maxLines}} lines, delete redundant abstractions, and verify tests.",
          zh: "遵循 YAGNI 原则重构模块 {{targetFile}} 至 < {{maxLines}} 行，删除冗余代码并验证测试。"
        },
        variables: [
          { id: "targetFile", label: { en: "Target File", zh: "目标文件" }, placeholder: "lib/goal-engine.js", required: true },
          { id: "maxLines", label: { en: "Max Lines Threshold", zh: "行数上限" }, placeholder: "500" },
        ],
      },
      {
        id: 'tests',
        icon: "📝",
        label: { en: "Tests & Coverage", zh: "补充测试" },
        prefix: { en: "Write comprehensive unit tests covering edge cases for: ", zh: "为以下模块编写覆盖边界情况的完整单元测试：" },
        template: {
          en: "Write comprehensive unit tests in {{testFile}} covering edge cases for {{targetFile}}.",
          zh: "在 {{testFile}} 中为 {{targetFile}} 编写覆盖边界情况的完整单元测试。"
        },
        variables: [
          { id: "targetFile", label: { en: "Module to Test", zh: "被测模块" }, placeholder: "lib/engine-verification.js", required: true },
          { id: "testFile", label: { en: "Test File Path", zh: "测试文件路径" }, placeholder: "test/acceptance-gate.test.mjs" },
        ],
      },
      {
        id: 'review',
        icon: "🔍",
        label: { en: "Code Review", zh: "代码审计" },
        prefix: { en: "Review codebase for subtle bugs, memory leaks, and over-engineering in: ", zh: "对代码库进行深入审查，排查潜在缺陷与过度设计：" },
        template: {
          en: "Review codebase for subtle bugs, memory leaks, and over-engineering in {{targetScope}}.",
          zh: "对 {{targetScope}} 进行深入审查，排查潜在缺陷与过度设计。"
        },
        variables: [
          { id: "targetScope", label: { en: "Target Scope", zh: "审查范围" }, placeholder: "lib/ and src/client/", required: true },
        ],
      },
      {
        id: 'feature',
        icon: "🚀",
        label: { en: "New Feature", zh: "新功能开发" },
        prefix: { en: "Implement new feature according to specification and add tests for: ", zh: "根据规格说明实现新功能并补充测试：" },
        template: {
          en: "Implement feature {{featureName}} according to specification {{specDetails}} and add comprehensive tests.",
          zh: "根据规格 {{specDetails}} 实现新功能 {{featureName}} 并补充完整测试。"
        },
        variables: [
          { id: "featureName", label: { en: "Feature Name", zh: "功能名称" }, placeholder: "Bi-directional kanban sync", required: true },
          { id: "specDetails", label: { en: "Specification / Issue", zh: "规格或Issue" }, placeholder: '#issue-164' },
        ],
      },
      {
        id: 'security',
        icon: "🛡️",
        label: { en: "Security Audit", zh: "安全加固" },
        prefix: { en: "Audit security boundaries, sanitize inputs, and prevent injection in: ", zh: "审计安全边界，增加输入过滤与防注入保护：" },
        template: {
          en: "Audit security boundaries, sanitize inputs, and prevent injection in {{targetRoute}}.",
          zh: "审计 {{targetRoute}} 的安全边界，增加输入过滤与防注入保护。"
        },
        variables: [
          { id: "targetRoute", label: { en: "Routes / Subsystem", zh: "路由或子系统" }, placeholder: "lib/routes.js", required: true },
        ],
      },
      {
        id: 'docs',
        icon: "📚",
        label: { en: "Docs & Contract", zh: "文档规范" },
        prefix: { en: "Update technical documentation, README, and DESIGN.md conforming to standard for: ", zh: "按标准更新技术文档、README 与 DESIGN.md：" },
        template: {
          en: "Update technical documentation, README, and {{docTarget}} conforming to engineering standards.",
          zh: "按标准更新技术文档、README 与 {{docTarget}}。"
        },
        variables: [
          { id: "docTarget", label: { en: "Doc Scope / Module", zh: "文档范围或模块" }, placeholder: "docs/design/DESIGN.md", required: true },
        ],
      },
      {
        id: 'upgrade',
        icon: "📦",
        label: { en: "Upgrade Deps", zh: "依赖升级" },
        prefix: { en: "Upgrade dependencies, resolve breaking API changes, and verify build for: ", zh: "安全升级依赖库，解决接口兼容性并确保构建通过：" },
        template: {
          en: "Upgrade dependency {{depName}}, resolve breaking API changes, and verify build.",
          zh: "升级依赖库 {{depName}}，解决接口兼容性并确保构建通过。"
        },
        variables: [
          { id: "depName", label: { en: "Dependency Name", zh: "依赖包名" }, placeholder: "cordis@^4.0.0", required: true },
        ],
      },
      {
        id: 'cleanup',
        icon: "🧹",
        label: { en: "Dead Code", zh: "清理死代码" },
        prefix: { en: "Find and safely remove dead code, unused exports, and stale fixtures in: ", zh: "查找并安全移除死代码、未使用的导出与失效测试用例：" },
        template: {
          en: "Find and safely remove dead code, unused exports, and stale fixtures in {{cleanupTarget}}.",
          zh: "查找并安全移除 {{cleanupTarget}} 中的死代码、未使用的导出与失效测试用例。"
        },
        variables: [
          { id: "cleanupTarget", label: { en: "Target Scope", zh: "清理目标" }, placeholder: "src/client/ or unused fixtures", required: true },
        ],
      },
      {
        id: 'perf',
        icon: "⚙️",
        label: { en: "Performance", zh: "性能优化" },
        prefix: { en: "Profile performance bottlenecks, eliminate unnecessary blocking calls in: ", zh: "分析性能瓶颈，消除阻塞调用并优化响应速度：" },
        template: {
          en: "Profile performance bottlenecks, eliminate unnecessary blocking calls in {{perfTarget}}.",
          zh: "分析性能瓶颈，消除 {{perfTarget}} 中的阻塞调用并优化响应速度。"
        },
        variables: [
          { id: "perfTarget", label: { en: "Subsystem / Function", zh: "优化目标" }, placeholder: "buildClient or state flush", required: true },
        ],
      },
    ];

