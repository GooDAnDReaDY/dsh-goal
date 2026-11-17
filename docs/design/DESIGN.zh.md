# DESIGN.md — `dsh-goal` 设计规范与技术合约

## 1. 定位与概念
`dsh-goal` 是专为 DeepSeek Harness (DSH) 打造的自主目标执行引擎与多轮任务跟踪插件。
支持结构化里程碑规划、子任务清单、Token 预算控制、Git 状态快照、人机协同（HITL）交互及任务复盘报告。

## 2. 用户界面 (User Surfaces)

### 2.1 原生 GoalBar 与 Addon 界面
- **Goal Dock 悬浮条**: 位于消息输入框上方 (`.dsh-goal-dock`)，展示执行耗时、进度、ETA、费用及快捷操作。
- **胶囊紧凑模式 (Compact Dock Mode)**: 支持将悬浮条折叠为状态胶囊，折叠状态持久化于本地存储。

### 2.2 里程碑与清单抽屉 (Milestones & Checklists Drawer)
- **侧边抽屉面板**: 完整展示里程碑树、子任务清单项、验收门禁徽标及 Git 快照历史。
- **实时清单同步**: 用户切换子任务状态即时注入模型执行上下文。

### 2.3 设置卡片 (`plugins.item`, `plugins.row.config`) (#197)
- **注册插槽**: 在现代 DSH 中通过 `plugins.item` 与 `plugins.row.config` 插槽注册（使用组合键 `pkg#rowId`）。早期的 `settings.plugin.item` 插槽已在 DSH 0.1.7-rc.2 之前废弃移除。
- **配置项**:
  - `maxTokenBudget`: 目标 Token 预算上限（0 表示无限制）；
  - `budgetWarningThreshold`: 预警百分比阈值（默认 80%）；
  - `autoCheckpointOnMilestone`: 里程碑完成自动创建 Git 快照（默认 true）；
  - `enableMilestoneDependencies`: 里程碑依赖拓扑校验（默认 true）；
  - `enableTemplatesDrawer`: 快速启动模板库（默认 true）；
  - `soundScheme`: 提示音效主题（`default`, `minimal`, `retro`）；
  - `standaloneMode`: 强制独立运行模式（默认 false）。

### 2.4 自动化里程碑验收门禁 (Acceptance Gate / Critic Verification) (#163, #176)
- **设计理念**: 防止单元测试或构建失败时模型提前标记里程碑完成。
- **`verificationCommand` 字段**: 每个里程碑可选的验证命令行（如 `npm test`、`pytest`）。
- **沙箱隔离执行 (#176)**:
  - 无 Shell 直接调用 (`shell: false`)，阻断命令注入；
  - 环境变量清洗：仅透传白名单变量 (`PATH`, `HOME`, `LANG`, `TMPDIR`, `NODE_ENV`)，强制剔除敏感凭证；
  - 阻断管道运算符及外部数据外发工具 (`curl`, `wget`, `nc`, `rm`)；
  - 门禁判定：仅在命令退出码 `exitCode === 0` 时标记里程碑 `COMPLETED`。

---

## 3. 模型工具 (Model Tools) (#197)

插件注册 7 个核心目标执行工具：

### 3.1 `goal_milestones`
- **功能**: 查询和管理目标里程碑。
- **参数**: `action` (`list` | `set` | `add` | `complete`), `milestones`, `milestone`, `milestoneId`, `notes`。

### 3.2 `goal_checklist`
- **功能**: 里程碑子任务清单操作。
- **参数**: `action` (`toggle` | `add` | `update`), `milestoneId`, `index`, `done`, `text`。

### 3.3 `goal_set_milestones`
- **功能**: 在目标启动阶段初始化完整的结构化里程碑方案。
- **参数**: `milestones` (数组，包含标题、描述、清单及验收命令)。

### 3.4 `goal_update_progress`
- **功能**: 更新当前里程碑执行状态与进度记录。
- **参数**: `milestoneId`, `status` (`in_progress` | `completed` | `failed`), `notes`, `verificationCommand`。

### 3.5 `goal_finish`
- **功能**: 终结目标并生成结构化成果交付总结及复盘。
- **参数**: `summary` (字符串), `deliverables` (交付清单数组)。

### 3.6 `goal_ask_operator`
- **功能**: 人机交互向操作者发起决策询问或需求确认。
- **参数**: `question` (问题描述), `options` (可选快捷选项数组)。

### 3.7 `goal_spawn_subgoal`
- **功能**: 递归启动具有独立执行上下文的子目标。
- **参数**: `title`, `prompt`, `isolatedContext`。

---

## 4. 与 DSH 核心架构集成

### 4.1 `GoalService` 生命周期交互
- 响应 `goal/changed` 生命周期事件（`create`, `complete`, `block`, `clear`）。
- 自动导出交付归档至 `.dsh/goals/<timestamp>-<slug>.md`。

### 4.2 提示词注入 (`agent/pre-step`)
- 动态注入目标状态、活跃里程碑、清单完成度、预算及操作者指令。

### 4.3 模式矩阵: 协同模式 (Companion) vs 独立模式 (Standalone) (#191, #194)
- **独立模式 (Standalone Mode)**: 完整自包含执行引擎，包含全套工具、预算、Git 差异视图和 HITL。
- **协同模式 (Companion Mode)**: 扩展官方 `@deepseek-ai/dsh-goal` 与 `@deepseek-ai/dsh-token-meter`。
- 协同模式下不支持的独立操作返回 HTTP 501 `MODE_NOT_SUPPORTED`。

---

## 5. 存储与安全边界

### 5.1 Fail-Closed 网络认证边界 (#172, #186, #188, #205)
- 所有路由通过 `verifyRouteAccess(req, res, ctx)` 统一守卫。
- 采用核心连接认证 `ctx.connection.requestRejection(req)`，阻止非信任局域网及跨站请求。
- **更新接口访问控制 (#205)**: `GET/HEAD /api/dsh-goal/update` 经 `isTrustedUpdateReadRequest` 检查，拒绝未经授权的 LAN 访问；更新响应已剥离敏感的主机 `profileName`。
- 支持 `X-DSH-Auth-Token` 及 `Authorization: Bearer <token>` 服务调用。

---

## 6. 双阶段模式: Plan Mode ⇄ Act Mode (#162)
- 支持计划阶段 (`GoalMode.PLAN`) 与执行阶段 (`GoalMode.ACT`)。
- `Tool Execution Guard` 确保在计划阶段禁止写入文件。

---

## 7. 交互式人机协同工具 `goal_ask_operator` (#166)
- 在模型遇阻时挂起执行，等待操作者点击或反馈。
- 通过 `formatOperatorAnswerPrompt` 将回复注入上下文。

---

## 8. 参数化快速启动模板 (#165)
- 支持带变量替换 (`{{var}}`) 的交互表单模板。

---

## 9. 界面 Git 快照差异对比器 (#168)
- 实时对比里程碑快照提交与基准分支差异，防止路径穿越。

---

## 10. 双向看板同步 (#164)
- 与 `dsh-kanban` 任务看板双向同步里程碑状态。

---

## 11. 里程碑上下文压缩 (#167)
- 在里程碑之间自动压缩多轮对话历史，节省 Token 消耗。

---

## 12. 递归子目标 (#170)
- 启动具备隔离上下文与独立预算的子任务。

---

## 13. 实时费用计量与预算限制 (#169)
- 基于模型定价表的实时美元费用计量。

---

## 14. 发版说明导出与 Telegram 通知 (#171)
- 格式化 Markdown Release Notes 并推送 Telegram 渠道。

---

## 15. HTML5 桌面通知 (#182)
- 仅在终端终态（`COMPLETED`、`FAILED`）触发系统桌面通知。

---

## 16. 提示词装配与可复现构建 (#184, #185)
- 统一 HITL 操作者提示词装配格式。
- 严格锁死 `package-lock.json` v3 并保证零安全漏洞。

---

## 17. 路由模块化与可观测性 (#188, #189)
- 路由守卫与 24 个 POST 动作分发模块全面解耦（每文件 <600 行）。

---

## 18. 生态兼容性与协同模式生命周期 (#196, #201, #204, #205)
- 声明可选 `peerDependencies` (`@deepseek-ai/dsh-goal`, `@deepseek-ai/dsh-token-meter`)。
- 具备完整的协同模式测试覆盖率 (`test/mode-parity-companion.test.mjs`)。
- 设置卡片动态版本占位符 (`v…`)。

---

## 19. 客户端体积预算与设计系统校验 (#202, #203)

### 19.1 客户端构建体积预算 (`scripts/build-client.mjs --check`, #203)
- **应用商店上限**: DSH Store 严格文件限制为 256 KB (`262,144` 字节)。
- **构建管控红线**:
  - 阻断限制: `lib/client.js` 体积不得超过 **200 KB** (`204,800` 字节)；
  - 预警限制: 超过 **180 KB** (`184,320` 字节) 触发构建告警。
- **代码碎片行数限制**: `src/client/*.js` 下任何源文件行数必须严格低于 **600 行**。

### 19.2 原生 DSH 设计变量规范 (#202)
- 严格采用 DSH 规范的 `--dsw-alias-*` 主题变量；
- `scripts/build-client.mjs --check` 自动进行全量变量白名单审计。
