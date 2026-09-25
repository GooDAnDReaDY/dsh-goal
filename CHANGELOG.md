# Changelog

Notable changes to `@goodandready/dsh-goal`.

## 0.2.12

### Fixed & Hardened (Deep Audit Release)
- **UI Render Crash Prevention (Fixes #97)**: Defined `formatElapsed` helper function in `lib/client.js` to format live elapsed execution seconds, preventing `ReferenceError: formatElapsed is not defined` during dock bar rendering.
- **Default Storage Path & Persistence Isolation (Fixes #98)**: Corrected default storage path fallback logic in `lib/index.js` so default schema configurations preserve disk state persistence in `~/.dsh/dsh-goal-state.json`, while isolating automated test runs from production state files.
- **Cordis Lifecycle Effect Cleanup for Auto-Updater (Fixes #99)**: Wrapped `registerPluginUpdater` route registration inside `ctx.effect` to ensure the update endpoint is cleanly unregistered on plugin reload or disposal.
- **Goal Templates Drawer UI & API Integration (Fixes #100)**: Connected the backend `GOAL_TEMPLATES` catalogue (`GET /dsh-goal/templates`) and `POST /dsh-goal/action` (`instantiate_template`) to an expandable Engineering Templates drawer in `QuickLaunchModal`.
- **Automatic Issue Checklist Parsing for Milestones (Fixes #101)**: Integrated `parseIssueChecklist` in `GoalEngine.startGoal` so starting goals referencing issue markdown automatically parses task lists (`- [ ]` / `- [x]`) into initial milestones.
- **Canonical Cordis Logger Migration (Fixes #102)**: Replaced 13 raw `console.warn` / `console.error` calls across `lib/` modules with `ctx.logger('goal')`, complying with DSH logging standards and log rotation.
- **HTTP 405 Method Not Allowed Conformance (Fixes #103)**: Added RFC 9110 compliant method validation with `Allow` header on `/dsh-goal/*` endpoints, returning HTTP 405 instead of masking as HTTP 404.
- **Settings Card Dynamic Version Resolution (Fixes #104)**: Purged hardcoded legacy fallback version `'0.2.3'` from settings state in `lib/client.js`, dynamically resolving live package version.

## 0.2.11

### Security & Hardening
- **Origin-Guarded Routes & SSE Stream (Fixes #78)**: Eliminated forgeable `Sec-Fetch-Site` trust on non-loopback requests. Protected `GET /dsh-goal/events` (SSE), `GET /dsh-goal/state`, and `GET /dsh-goal/templates` with `isTrustedCaller`, ensuring non-loopback callers must present matching `Origin` or `Referer` headers.
- **Strict Workspace Confinement on Start (Fixes #79)**: Validated `data.cwd` in `action === 'start'` against trusted roots (`process.cwd()` and `DSH_WORKSPACE_ROOT`), returning HTTP 400 for unconfined directories. Removed self-referential allowlist propagation from `sessionGoal.cwd`.

### Fixed & Improved
- **Core Tools and Prompt Section Lifecycle Restoration (Fixes #94)**: Snapshotted displaced core DSH tools (`get_goal`, `create_goal`, `update_goal`) and system prompt section (`tool:goal`). Restores original definitions back to global registries upon plugin disposal or hot reloading.
- **Active Issue Checklist Sync via Gitea/GitHub API (Fixes #87)**: Implemented active synchronization (`syncMilestoneWithIssue`) updating issue body task lists (`- [x]`) upon milestone completion via Gitea REST API using token credentials.
- **Settings Scope Dynamic Merging on DSH 0.1.7 (Fixes #63)**: Added support for `writable` and `ready` settings snapshot states, dynamically merging live settings without dropping custom fields.
- **Official Public GitHub Release Automation (Fixes #95)**: Published official GitHub releases matching npm distribution.

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
