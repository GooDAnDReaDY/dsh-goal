# @goodandready/dsh-goal

> **Goal Mode & Autonomous Execution Plugin for DeepSeek Harness (DSH)**

`dsh-goal` adds an autonomous goal-tracking loop with a sticky top status banner, milestone decomposition, live timer, and interactive controls (pause, resume, cancel, modal details).

---

## Features

- 🎯 **Sticky Top Goal Banner**: Minimalist header pinned above the chat showing the active goal, elapsed timer (`• 2s`, `• 1m 45s`), and controls.
- ⏸️ **Play / Pause / Cancel**: Instantly halt autonomous multi-turn loops or resume whenever ready.
- ⛶ **Milestone Modal Drawer**: Interactive checklist of sub-tasks with progress bar and execution logs.
- 🤖 **Agent Tools**:
  - `goal_set_milestones`: Autonomous breakdown of high-level goals into step-by-step tasks.
  - `goal_update_progress`: Step-by-step milestone completion tracking.
  - `goal_finish`: Goal completion with deliverable summary.
- ⚙️ **Safety Limit & Settings**: Max iterations guardrail to prevent infinite agent loops.
- 🌐 **Bilingual**: Full English and Russian localization.

---

## Installation

```bash
dsh plugin add @goodandready/dsh-goal
```

Requires DeepSeek Harness core **0.1.2-rc.1** or newer: the client half declares no external client modules (`dsh.client.inject: []`) because `slots` / `locale` / `settingsScope` are kernel services in rc.1, and plugin settings are registered through a schemastery schema.

## Settings

Settings live in the plugin card under **Settings → Plugins → Plugin settings** ("Goal Mode & Autonomous Loop"). The card reads the live settings snapshot (and renders nothing while the namespace is not `ready`) and saves only changed fields; a failed write keeps your drafts on screen.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `maxIterations` | number | `25` | Safety limit: max autonomous iterations per goal |
| `autoDrive` | boolean | `true` | Keep the autonomous loop running after each turn |
| `enableSound` | boolean | `true` | Play a sound when a goal completes |

Settings namespace: `dsh-goal`.

## Quick Start

1. Start a goal in chat:
   ```text
   /goal Refactor auth tokens and write integration tests
   ```
2. Or use the REST API:
   ```bash
   curl -X POST http://localhost:3080/dsh-goal/action \
     -H "Content-Type: application/json" \
     -d '{"action":"start","title":"Optimize database queries"}'
   ```
3. Watch the sticky top banner update with live timer and milestones in real-time.

---

## License

MIT © [goodandready](https://goodandready.app)
