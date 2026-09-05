# 📦 @goodandready/dsh-goal

<div align="center">

<h3>Autonomous Goal Execution & Multi-Turn Task Tracking Engine with Sticky Header for DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-goal"><img src="https://img.shields.io/npm/v/@goodandready/dsh-goal.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/GooDAnDReaDY/dsh-goal.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<!-- Author Showcase Link -->
<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/All_Author_Projects-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="GoodAndReady Showcase"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="docs/README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="docs/README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ Overview & The Problem

Complex engineering tasks require multi-step autonomy: decomposing high-level objectives into milestones, executing successive iterations without manual user re-prompting, and maintaining clear visibility into task progress.

**`@goodandready/dsh-goal`** brings autonomous goal execution to DeepSeek Harness via the `/goal` command:
* 🎯 **Sticky Top Goal Banner**: Pinned status header with live timer (`• 2s`, `• 1m 45s`), active goal title, and interactive control buttons.
* ⏸️ **Play / Pause / Cancel**: Instantly pause the autonomous loop or resume execution on demand.
* 📋 **Milestone Breakdown Drawer**: Interactive checklist showing sub-tasks, percentage completion, and iteration logs.
* 🤖 **Autonomous Agent Tools**: Provides `goal_set_milestones`, `goal_update_progress`, and `goal_finish` tools directly to the agent.
* 🛡️ **Safety Guardrails**: Configurable `maxIterations` limit to prevent runaway loops.

---

## 🏛️ Architecture

```mermaid
graph TD
    subgraph Input ["User Interaction"]
        Cmd["Slash Command: /goal &lt;objective&gt;"]
        API["REST API: POST /dsh-goal/action"]
    end

    subgraph GoalEngine ["Goal Lifecycle Engine (lib/index.js)"]
        State["State Manager (IDLE, RUNNING, PAUSED, COMPLETED)"]
        Milestones["Milestone Tracker & Decomposition"]
        Disk["Persistence Store (~/.dsh/goal-state.json)"]
    end

    subgraph AgentLoop ["Autonomous Agent Drive"]
        ToolSet["goal_set_milestones"]
        ToolProgress["goal_update_progress"]
        ToolFinish["goal_finish"]
        LimitGuard{"maxIterations Guard"}
    end

    subgraph UI ["DSH Web Interface"]
        Banner["Sticky Top Goal Banner"]
        Timer["Live Elapsed Timer"]
        Drawer["Milestone Checklist Modal"]
        Settings["Settings Card (Schemastery)"]
    end

    Cmd --> GoalEngine
    API --> GoalEngine
    GoalEngine --> State
    State --> Disk
    State --> Banner
    State --> Drawer
    GoalEngine --> AgentLoop
    AgentLoop --> LimitGuard
    ToolSet --> GoalEngine
    ToolProgress --> GoalEngine
    ToolFinish --> GoalEngine
```

---

## 📦 Installation

```bash
dsh plugin --profile web add @goodandready/dsh-goal
```

Restart your DeepSeek Harness instance and refresh the browser.

---

## 💬 Usage & Quick Start

Start a goal directly in chat:

```text
/goal Refactor the authentication middleware and add integration tests
```

Or trigger via REST API:

```bash
curl -X POST http://localhost:3080/dsh-goal/action \
  -H "Content-Type: application/json" \
  -d '{"action":"start","title":"Optimize database queries"}'
```

---

## ⚙️ Configuration Reference (`settings.yaml`)

```yaml
dsh-goal:
  maxIterations: 25
  autoDrive: true
  enableSound: true
```

| Parameter | Type | Default | Description |
|:---|:---|:---|:---|
| `maxIterations` | `number` | `25` | Safety limit: maximum autonomous iterations per goal |
| `autoDrive` | `boolean` | `true` | Keep the autonomous agent loop running between turns |
| `enableSound` | `boolean` | `true` | Play completion audio chime when a goal finishes |

---

## 🧪 Testing

Run the automated test suite:

```bash
npm test
```

---

## 📄 License

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
