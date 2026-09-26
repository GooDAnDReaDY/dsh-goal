# Task Plan: Issue #113 — Refactor dsh-goal as Core Goal Addon

## Goal
Transform `@goodandready/dsh-goal` from a duplicate standalone goal engine into an enhancement add-on that cooperates with DSH core's native `@deepseek-ai/dsh-goal` (`ctx.goals: GoalService`, `dsh-tool-goal`, `/goal`, GoalBar). Eliminate conflicting tools (`create_goal`, `get_goal`, `update_goal`, `/goal`) and provide unique capabilities: token budget enforcement, milestones & checklists, git snapshots & rollback, and completion reports/retrospectives.

## User Constraints & Rules
- Work exclusively inside isolated worktree: `/mnt/external/Project/DEV/dhsplugins/dsh-goal/.worktrees/issue-113`
- Branch: `refactor/core-goal-addon-113`
- Conventional Commits with `git-antigravity`
- Zero Cyrillic in product source code (English canonical, bilingual en/zh locales)
- Update `docs/design/DESIGN.md`, `README.md`, `CHANGELOG.md`
- Full test suite passing + preflight clean

## Phases

### Phase 1: Design Contract & Architecture Definition <!-- id: 0 -->
- [x] Inspect core DSH `@deepseek-ai/dsh-goal`, `GoalService`, `ctx.tokenMeter`, events (`goal/changed`, `agent/pre-step`)
- [ ] Update `docs/design/DESIGN.md` to reflect addon architecture, tools, events, state machine, and UI surfaces
- [x] Create `findings.md` and `progress.md`

### Phase 2: Core Addon Engine & Store Refactoring <!-- id: 1 -->
- [ ] Create `lib/addon-store.js` (or refactor `engine-store.js`) for milestones, checklists, snapshots, and budget metrics keyed by `goalId`
- [ ] Create `lib/token-budget-guard.js`: monitors token usage via `ctx.tokenMeter`, triggers warning, and calls `ctx.goals.block(agent, ref, { code: 'budget', message })`
- [ ] Create `lib/milestone-manager.js`: manages milestones and checklist items per goal
- [ ] Create `lib/git-snapshot-manager.js`: creates git checkpoints upon milestone completion and provides rollback
- [ ] Refactor `lib/engine-reports.js`: generates Markdown report + retrospective in `.dsh/goals/<timestamp>-<slug>.md` on `complete` or `clear`

### Phase 3: Tools & Integration with Core Lifecycle <!-- id: 2 -->
- [ ] Refactor `lib/tools.js`:
  - PURGE conflicting tool registrations: `create_goal`, `get_goal`, `update_goal`
  - REGISTER custom addon tools: `goal_milestones` (`list`, `set`, `add`, `complete`), `goal_checklist` (`toggle`)
- [ ] Remove `command-handler.js` registration of `/goal` (leave core `/goal` intact)
- [ ] In `lib/index.js`:
  - Hook into `ctx.on('goal/changed', ...)`: arm on `create`/`resume`, generate report on `complete`/`clear`, track `block`
  - Hook into `ctx.on('agent/pre-step', ...)`: inject current milestone and unfinished checklist items only when goal is `active`
  - Hook token budget checks after steps / during turns
  - Remove `lib/updater.js` self-updater
  - Add migration logic for legacy `dsh-goal-state.json`

### Phase 4: UI Refactoring (`lib/client.js`) <!-- id: 3 -->
- [ ] Remove duplicate Sticky Top GoalBar / dock banner (core `@deepseek-ai/dsh-client-ui-goal` renders the native GoalBar)
- [ ] Keep and refine:
  - Milestones & Checklists Drawer / Modal
  - Token Budget Meter indicator
  - Git Snapshots history and Rollback button
  - QuickLaunch templates modal (calling `ctx.goals.create`)
  - Settings Card in `settings.plugin.item`

### Phase 5: Verification & Testing <!-- id: 4 -->
- [ ] Update existing tests to reflect new addon architecture
- [ ] Add dedicated unit tests for:
  - Asserting NO registration of `create_goal` / `get_goal` / `update_goal` / `/goal`
  - Token budget guard blocking goal with `code: 'budget'`
  - Milestone & checklist lifecycle keyed by `goalId`
  - Git snapshot creation and rollback
  - Goal report generation on completion
  - Legacy state migration
- [ ] Run full test suite (`npm test`) -> 100% pass
- [ ] Run preflight checks (`dsh-plugin-preflight`) -> `FAIL=0`

### Phase 6: Documentation, PR & Acceptance <!-- id: 5 -->
- [ ] Update `README.md`, `README.ru.md`, `README.zh.md`, `CHANGELOG.md`
- [ ] Verify npm package size via `npm pack --dry-run --json`
- [ ] Commit with `git-antigravity`
- [ ] Push branch `refactor/core-goal-addon-113`
- [ ] Create PR in Gitea linked to Issue #113
