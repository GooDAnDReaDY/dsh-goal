# Findings: Issue #113 — Core Goal Addon Transformation

## 1. DSH Core Architecture (DSH 0.1.5-rc.3+ / 0.1.7-rc.2)
- `@deepseek-ai/dsh-goal`:
  - Implements `ctx.goals: GoalService`.
  - Service methods: `create`, `edit`, `pause`, `resume`, `complete`, `block`, `clear`, `state(session)`, `get(agent)`.
  - Phase states: `active | paused | blocked | complete`.
  - Block mechanism: `ctx.goals.block(agent, ref, { code, message })`.
  - Emits Cordis event: `goal/changed` with payload `{ change: { operation, ref, goal } }`.
  - Emits session event: `goal/change`.
- `@deepseek-ai/dsh-tool-goal`: Registers native `create_goal`, `get_goal`, `update_goal`.
- `@deepseek-ai/dsh-command-goal`: Registers native `/goal` slash command.
- `@deepseek-ai/dsh-client-ui-goal`: Registers native GoalBar above the composer input.
- `ctx.tokenMeter`: Singleton measurement service. `ctx.tokenMeter.measure(session)` returns `{ totalTokens, surfaceTokens, nodes }`.
- `agent/pre-step`: Waterfall hook `ctx.on('agent/pre-step', async ({ agent, messages, step, signal }, next) => ...)` run before each agent step.

## 2. Collision Points to Eliminate
- `dsh-goal` registered `create_goal`, `get_goal`, `update_goal` tools, overriding core tools.
- `dsh-goal` registered `/goal` command, colliding with core `/goal`.
- `dsh-goal` had its own top GoalBar/dock, duplicating core GoalBar.
- `dsh-goal` maintained its own autonomous round loop, duplicating `dsh-goal-round-driver`.
- `dsh-goal` had an in-app updater (`/api/dsh-goal/update`), unneeded in managed DSH.

## 3. Retained Addon Value
- **Token Budget Guard**: monitors tokens for active goal; warns at threshold (80%); calls `ctx.goals.block(agent, ref, { code: 'budget', message })`.
- **Milestones & Checklists**: keyed by `goalId`, custom tools `goal_milestones`, `goal_checklist`, model guidance via `agent/pre-step`.
- **Git Snapshots**: auto-checkpoints upon milestone completion, rollback capability.
- **Reports & Retrospective**: Markdown report in `.dsh/goals/<timestamp>-<slug>.md` on `complete`/`clear`.
- **Templates & Issue Sync**: facades calling `ctx.goals.create(agent, ...)`.
