# Changelog

Notable changes to `@goodandready/dsh-goal`.

## 0.2.10

### Added
- **Pause & Intervene (#83)**: Human-in-the-loop steering while goal is paused. Operators can inject directives (`userDirective`), adjust milestone notes/status, or reorder the execution plan directly from the details modal or via `/dsh-goal/action`. Resuming immediately injects the directive into the agent's prompt.
- **Live Activity Mini-Feed (#84)**: Real-time, chronological execution activity stream tracking tool calls, milestone completions, git commits, and budget warnings. Displayed in the details modal with relative timestamps (`enableLiveActivityFeed`, default: `true`).
- **Smart Goal Pre-planning (#85)**: Automated drafting of preliminary milestone breakdown prior to execution start (`enablePreplanning`, default: `true`). Allows reviewing and approving the structured work plan before agents begin executing turns.
- **Auto-Branching Workflow (#86)**: Automatic isolated git feature branch creation upon starting a goal (`autoBranchOnGoalStart`, default: `true`). Includes one-click branch merge and discard controls upon goal completion or cancellation.
- **Issue Checklist Sync (#87)**: Bi-directional synchronization with Gitea and GitHub issue markdown task lists (`- [ ]` / `- [x]`). Automatically updates issue checkboxes as corresponding milestones progress.
- **Post-Goal Retrospective Card (#88)**: Comprehensive execution analytics card generated upon completion (`enablePostGoalRetrospective`, default: `true`), reporting duration, token cost, modified files count, tool call volume, error rates, and key findings.
- **Smart Budget Auto-Scale (#89)**: Intelligent budget expansion when goals approach the token ceiling near completion (`autoScaleBudgetNearCompletion`, default: `false`). Automatically grants a one-time 20% token buffer if the goal is >= 75% complete or on its final milestone.
- **Goal Templates Drawer (#90)**: Standard engineering goal template library (Quick Fix, Feature Implementation, Code Refactoring, Bug Reproduction, Comprehensive Audit, Security Hardening) with quick-launch chips and customizable milestone skeletons (`enableTemplatesDrawer`, default: `true`).
- **Milestone Dependency Graph (#91)**: Explicit predecessor dependencies (`dependsOn: ['m-1']`) enforcing topological execution order. Prevents agent execution or completion of downstream milestones while prerequisites remain pending, with visual lock badges in the UI (`enableMilestoneDependencies`, default: `true`).
- **Sound Scheme Customization & Web Speech Announcements (#92)**: Customizable audio notification schemes (`soundScheme`: `'default'` | `'minimal'` | `'retro'`) and optional browser voice announcements via the Web Speech API (`enableVoiceAnnouncements`, default: `false`).

## 0.2.9

### Fixed
- **CSRF & Untrusted LAN Caller Guard (Fixes #78)**: Enforced `isTrustedCaller` origin check on `POST /dsh-goal/action`. Rejects LAN or cross-site requests missing trusted `Sec-Fetch-Site` or matching `Origin`/`Referer` headers with `403 Forbidden: untrusted caller origin`.
- **Working Directory Boundary Confinement (Fixes #79)**: Restricted `getSafeCwd` to allowed workspace roots (`process.cwd()` and active goal `sessionGoal.cwd`). Rejects traversal attempts and directories outside the workspace boundary (e.g. `/tmp`) with `400 Bad Request`.

## 0.2.8

### Fixed
- **Settings configForms Migration (Fixes #80)**: Settings no longer wait on the removed `settingsScope` service; client uses native `configForms`.

## 0.2.7

### Fixed
- **Engine Session Eviction Cleanup (Fixes #70)**: Eliminated `toolFailureCounters` memory leak by ensuring entries are deleted upon goal completion (`completeGoal`), manual session reset (`clear`), and LRU session eviction (`pruneInactiveSessions`).
- **Non-blocking Git Operations (Fixes #71)**: Switched from shell-spawned `execSync` to direct binary execution via `execFileSync('git', ...)` for checkpoint creation and rollback, eliminating shell process overhead and escaping hazards.
- **Strict Working Directory Validation (Fixes #72)**: Added directory existence and validity checks for `data.cwd` in `POST /dsh-goal/action` (`rollback_milestone` and `save_artifact`), rejecting invalid or non-existent directories with HTTP 400.
- **Design Tokens Conformity (Fixes #73)**: Replaced hardcoded hex colors and rgba box-shadow in client UI with native DSH semantic design tokens (`var(--dsw-alias-shadow-md)`, `var(--dsw-alias-status-warning)`, `var(--dsw-alias-surface-raised)`).
- **Client Dead Code & Defensive Handling (Fixes #74)**: Purged obsolete `LOCALES.ru` lookup from dock banner translation and documented defensive catch in dock collapse handler.
- **Engine Milestone Decomposition (Fixes #75)**: Extracted milestone matching, parsing, and update helpers into `lib/engine-milestones.js`, bringing `lib/goal-engine.js` well below the 600-line threshold (< 590 lines).
- **HMR Lifecycle Disposal (Fixes #76)**: Wrapped client UI slot and locale registrations in `ctx.effect(...)` with disposer cleanup callback for clean hot reload and disposal.

## 0.2.6

### Added
- **Token Budget Guard**: Real-time token consumption tracking, proactive model warning directive at threshold (default 80%), and soft-pause at 100% (`PAUSED_BUDGET_EXCEEDED`) with 1-click +50,000 token extension.
- **Sub-milestones & Interactive Checklists**: Granular task checklists under milestones (`checklist: [{ text, done }]`), interactive UI checkboxes in details modal, and model prompt synchronization.
- **Auto Git Checkpoints**: Optional automatic git snapshot commit creation upon milestone completion with one-click rollback in details modal.
- **Run Artifact Export**: One-click export of structured execution runs to `.dsh/goals/<timestamp>-<slug>.md` (with `.dsh/` added to `.gitignore`).
- **Compact Dock Mode**: Minimizable dock banner switching to sleek status pill, state persisted across browser refreshes via `localStorage`.

## 0.2.5

### Fixed
- **Settings reachable again on the plugin's own page**: the current DSH core
  (0.1.6-alpha.2) renders a plugin's configuration page only for entries registered
  in the plugin-list seat `plugins.item`. `GoalSettingsCard` is now registered there
  (`id: 'dsh-goal'`, order 60, static label) alongside the row seat and the legacy
  card.

## 0.2.4

### Fixed
- **Settings reachable again**: the card registered into `settings.plugin.item`, a
  slot the current DSH core (0.1.6-alpha.2) no longer renders, so the plugin's
  settings were unreachable. The surface now registers into the Plugins page row
  seat `plugins.row.config`, keyed `@goodandready/dsh-goal#dsh-goal`
  (`rowConfigKey(package, rowId)`): the plugin's row gains a configure control whose
  page is the settings form (`view: 'page'`, open and without our card chrome — the
  host page draws the title, icon, crumb and padding) plus a one-line state for
  `view: 'summary'`. The legacy seat stays registered as a fallback for older cores.

### Added
- This changelog.
