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
