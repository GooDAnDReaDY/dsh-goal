# DESIGN.md — Design Contract for `dsh-goal`

## 1. Purpose and Concept
`dsh-goal` is an autonomous goal execution engine and multi-turn task tracking addon for DeepSeek Harness (DSH).
It provides structured milestone planning, granular checklist items, token budget enforcement, git state snapshots, human-in-the-loop queries, and execution retrospectives.

## 2. User Surfaces

### 2.1 Native GoalBar & Addon Interface
- **Goal Dock Banner**: Positioned above the message input area (`.dsh-goal-dock`), showing live duration, progress, ETA, cost, and quick actions.
- **Compact Dock Mode**: Minimizable dock banner switching to a status pill, state persisted across browser reloads.

### 2.2 Milestones & Checklists Drawer
- **Drawer Panel**: Slide-over panel presenting the full milestone tree, sub-milestones checklist, acceptance gate badges, and checkpoint history.
- **Real-time Checklist Sync**: Toggling sub-tasks synchronously propagates to the model runtime context.

### 2.3 Settings Card (`plugins.item`, `plugins.row.config`) (#197)
- **Registration Slots**: Modern DSH registers the settings card via `plugins.item` and `plugins.row.config` (with composite key `pkg#rowId`). The obsolete `settings.plugin.item` slot was removed prior to DSH 0.1.7-rc.2 and is no longer supported.
- **Configuration Options**:
  - `maxTokenBudget`: Token ceiling per goal (0 — unlimited);
  - `budgetWarningThreshold`: Warning threshold percentage (default 80%);
  - `autoCheckpointOnMilestone`: Create git snapshot on milestone completion (default true);
  - `enableMilestoneDependencies`: Topological milestone dependency enforcement (default true);
  - `enableTemplatesDrawer`: Access to quick-start template catalog (default true);
  - `soundScheme`: Audio theme (`default`, `minimal`, `retro`);
  - `standaloneMode`: Explicit standalone execution override (default false).

### 2.4 Automated Acceptance Gate & Critic Verification (#163, #176)
- **Concept**: Prevents premature milestone completion when unit tests fail or builds break.
- **`verificationCommand` Field**: Optional verification command per milestone (e.g. `npm test`, `pytest`).
- **Sandboxed Execution (#176)**:
  - Direct execution without shell (`shell: false`) to block shell injections.
  - Environment sanitization: Strips secrets and tokens (`TOKEN`, `KEY`, `SECRET`, `AUTH`), providing only safe standard variables (`PATH`, `HOME`, `LANG`, `TMPDIR`, `NODE_ENV`).
  - Blocks dangerous operators (`;`, `&&`, `||`, `|`, backticks) and exfiltration tools (`curl`, `wget`, `nc`, `rm`).
- **Gate Enforcement**: The milestone only completes if `exitCode === 0`.

---

## 3. Model Tools (#197)

The plugin registers 7 model tools for autonomous goal execution:

### 3.1 `goal_milestones`
- **Purpose**: Read and manage milestones plan.
- **Parameters**: `action` (`list` | `set` | `add` | `complete`), `milestones`, `milestone`, `milestoneId`, `notes`.

### 3.2 `goal_checklist`
- **Purpose**: Manage granular sub-milestone checklist items.
- **Parameters**: `action` (`toggle` | `add` | `update`), `milestoneId`, `index`, `done`, `text`.

### 3.3 `goal_set_milestones`
- **Purpose**: Initialize a full structured milestone plan at goal start.
- **Parameters**: `milestones` (array of milestone objects with title, description, checklist, verificationCommand).

### 3.4 `goal_update_progress`
- **Purpose**: Update milestone progress status.
- **Parameters**: `milestoneId`, `status` (`in_progress` | `completed` | `failed`), `notes`, `verificationCommand`.

### 3.5 `goal_finish`
- **Purpose**: Conclude goal with final retrospective deliverables summary.
- **Parameters**: `summary` (string), `deliverables` (array of strings).

### 3.6 `goal_ask_operator`
- **Purpose**: Interactive human-in-the-loop query for operator guidance or architectural decisions.
- **Parameters**: `question` (string), `options` (optional array of preset choices).

### 3.7 `goal_spawn_subgoal`
- **Purpose**: Recursively spawn an isolated child sub-goal in a dedicated execution context.
- **Parameters**: `title`, `prompt`, `isolatedContext`.

---

## 4. Architectural Integration with DSH Core

### 4.1 `GoalService` Lifecycle Interaction
- Responds to `goal/changed` lifecycle events (`create`, `complete`, `block`, `clear`).
- Exports execution run artifacts to `.dsh/goals/<timestamp>-<slug>.md`.

### 4.2 Model Prompt Seam (`agent/pre-step`)
- Injects dynamic goal state, active milestone, checklist status, token budget, and operator directives into the system prompt.

### 4.3 Feature Matrix: Companion Mode vs Standalone Mode (#191, #194)
- **Standalone Mode**: Full autonomous engine with sub-milestones, budget guards, git diff visualizer, and HITL queries.
- **Companion Mode**: Augments the official `@deepseek-ai/dsh-goal` plugin and `@deepseek-ai/dsh-token-meter` with rich drawer UI and milestone tracking.
- Unsupported standalone actions in companion mode return HTTP 501 `MODE_NOT_SUPPORTED`.

---

## 5. Storage and Security Boundary

### 5.1 Fail-Closed Network Auth Boundary (#172, #186, #188, #205)
- All plugin routes are protected via `verifyRouteAccess(req, res, ctx)`.
- Core authentication via `ctx.connection.requestRejection(req)` enforces fail-closed rejection for untrusted callers.
- **Updater API Access Guard (#205)**: `GET/HEAD /api/dsh-goal/update` is guarded by `isTrustedUpdateReadRequest(req, ctx)`, blocking LAN and cross-site callers with 403 Forbidden. Sensitive host paths and `profileName` are stripped from responses.
- Service tokens supported via `X-DSH-Auth-Token` and `Authorization: Bearer <token>`.

---

## 6. Two-Phase Execution: Plan Mode ⇄ Act Mode (#162)
- Supports `GoalMode.PLAN` and `GoalMode.ACT`.
- `Tool Execution Guard` (`lib/tool-guard.js`) restricts file mutations during Plan Mode until operator approval.

---

## 7. Interactive Human-in-the-Loop Tool `goal_ask_operator` (#166)
- Suspends agent turns until operator selection or feedback.
- Injects operator responses into prompt context via `formatOperatorAnswerPrompt`.

---

## 8. Parameterized Quick-Launch Templates (#165)
- Form-driven templates with variable substitution (`{{var}}`).

---

## 9. Git Snapshot Diff Visualizer in UI (#168)
- Real-time git diff viewer comparing milestone commits against base branch.
- Validates git refs and paths against traversal attacks.

---

## 10. Bidirectional Kanban Sync (#164)
- Synchronizes milestones with `dsh-kanban` task boards.

---

## 11. Milestone History Context Compaction (#167)
- Compresses chat turns between completed milestones to conserve token context.

---

## 12. Recursive Sub-goals (#170)
- Spawns isolated sub-tasks with independent progress and budgets.

---

## 13. Financial Cost Meter & Budget Limits (#169)
- Real-time USD cost tracking based on model pricing tables.

---

## 14. Release Notes Export & Telegram Gateway (#171)
- Formats markdown release notes and notifies external Telegram channels.

---

## 15. HTML5 Desktop Notifications (#182)
- Native desktop notifications restricted strictly to terminal states (`COMPLETED`, `FAILED`).

---

## 16. Prompt Assembly & Build Reproducibility (#184, #185)
- Canonical HITL prompt formatting.
- Strict package-lock.json v3 and zero audit vulnerabilities.

---

## 17. Modular Routes & Async Observability (#188, #189)
- Unified route verification gateway and action dispatcher submodules (<600 lines each).

---

## 18. Ecosystem Compatibility & Companion Lifecycle (#196, #201, #204, #205)
- Declares optional `peerDependencies` for `@deepseek-ai/dsh-goal` and `@deepseek-ai/dsh-token-meter`.
- Full companion mode test suite parity (`test/mode-parity-companion.test.mjs`).
- Dynamic version placeholder in settings card (`v…`).

---

## 19. Client Bundle Budget & Design Token Validation (#202, #203)

### 19.1 Client Bundle Size Budget (`scripts/build-client.mjs --check`, #203)
- **Store Ceiling**: Maximum file limit is 256 KB (`262,144` bytes).
- **Enforced Thresholds**:
  - Hard failure: Build fails if `lib/client.js` exceeds **200 KB** (`204,800` bytes).
  - Warning: Warns if bundle exceeds **180 KB** (`184,320` bytes).
- **Module Limits**: Every fragment in `src/client/*.js` must not exceed **600 lines**.

### 19.2 Canonical DSH Design Tokens (#202)
- Styles strictly conform to native `--dsw-alias-*` tokens.
- Automatic whitelist validation integrated into `scripts/build-client.mjs --check`.
