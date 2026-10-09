# Changelog

## 0.2.21

### Fixed & Hardened (Core Runtime Logic & Engine Integrity Batch)
- **Autonomous Prompt-Contract Tools (#127)**: Registered prompt-contract aliases goal_set_milestones, goal_update_progress, and goal_finish alongside goal_milestones and goal_checklist, aligning tool definitions with model steering prompts.
- **Milestone Issue Sync Target (#129, #139)**: Corrected syncMilestoneWithIssue invocation in lib/milestone-manager.js to pass { issueRef, cwd } and milestone object m; added warning logger instead of empty catch in lib/goal-engine.js.
- **Agent Control Wiring (#130)**: Implemented stopRunningAgents and resumeActiveAgent callbacks and sessionAgents tracking in lib/index.js, wiring them into registerRoutes for proper /action pause/clear handling.
- **Dynamic Config Updating (#132)**: Updated GoalEngine.updateConfig to support defaultMaxIterations and maxIterations from boxed/unboxed values; unwrapped volatile boxes in constructor and startGoal.
- **Retrospective Start Commit & Ref Validation (#133)**: Corrected property access to goal.gitStartCommit in lib/engine-retrospective.js, validated ref with isValidGitRef, and added -- before git diff refs.
- **Event Loop Debounce Timers (#134)**: Fixed saveTimer unref pattern in lib/engine-store.js and lib/addon-store.js to ensure unreferenced timers do not hold the event loop while properly resetting state.
- **State Growth Boundaries (#135)**: Added removeGoalData(goalId) and auto-pruning to lib/addon-store.js; capped goal.nudges to max 50 items in lib/engine-sessions.js.
- **Report Addon Data & Attribution (#136, #143)**: Forwarded addonData in saveGoalArtifact and saveGoalReportFile in lib/engine-reports.js so milestones/snapshots are included in reports; updated report GitHub URL to https://github.com/goodandready/dsh-goal.
- **Milestone Status Validation (#137)**: Added validation in lib/engine-milestones.js and lib/goal-engine.js so invalid milestone statuses are rejected and return false.
- **Engine Logger Initialization (#138)**: Assigned this.logger = options.logger || console in GoalEngine constructor and passed logger from lib/index.js.
- **Safe Legacy State Migration (#140)**: Fixed migrateLegacyState in lib/addon-store.js to only stamp _migratedToAddon and write when migratedAny === true; corrected legacyStatePath in lib/index.js.
- **Active Milestone Prompt Next List (#141)**: Updated lib/milestone-manager.js to render only uncompletedChecklist under Next items.
- **Tool Definition Cleanup (#142)**: Removed redundant handler: property from lib/tools.js. Kept turn/end lifecycle hook in lib/index.js.

## 0.2.19

### Fixed & Hardened (Security & Sanitization Batch)
- **Credential Path & Host Sanitation (#120, #126)**: Purged hardcoded developer credentials path (`/mnt/external/...`) and default internal port `3005` from `lib/engine-issue-sync.js`; credentials and baseUrl are now resolved strictly via environment variables or explicit options; removed fallback default repository name.
- **Fail-Closed Caller Trust & Anti-Spoofing (#122, #144, #148)**: Hardened `isTrustedCaller` in `lib/routes.js` to reject non-browser LAN clients spoofing Origin/Host headers without browser `Sec-Fetch-Site: same-origin`; requests permitted strictly for loopback clients or verified same-origin browser operator UI.
- **Git Ref & Branch Sanitization (#123)**: Added `isValidGitRef` to reject flag injection (`-f`, `--upload-pack`), path traversal (`..`), and invalid characters in git operations; added `isValidGitRef` check to `branch_action` HTTP route (`400 Bad Request`); added `--` separator before refs in git commands.
- **Working Directory Confinement & Tool Milestone Signature (#124, #128)**: Enforced safe cwd resolution via `getSafeCwd` across goal-start, tools, and git branch helpers; corrected `completeMilestone` invocation in `lib/tools.js` to pass `notes` and `workspaceRoot` as distinct arguments.
- **Safe Milestone Checkpoints (#125)**: Replaced `git add -A` with `git add -u` in `lib/engine-reports.js` to prevent staging untracked files or secrets; purged banned `--no-verify` flag from milestone checkpoint commits.

## 0.2.18

### Fixed & Hardened (Settings Data Loss & Schemastery Volatile Batch)
- **Volatile Schema Data Loss (#117)**: Added runtime polyfill fallback for `Schema.prototype.volatile` and defensive config unwrapping, preventing DSH 0.2 from silently dropping plugin settings.
- **Schemastery Boxed Objects unwrapping (#121)**: Sanitized boxed Schemastery primitives at runtime entry and inside `applySettings`, preventing boolean flags from forcing true and numbers from remaining boxed objects.
- **Settings Save Plan Coverage (#145)**: Synchronized `computeSavePlan` and `getFieldStatus` across all 9 plugin configuration keys (`maxTokenBudget`, `budgetWarningThreshold`, `autoCheckpointOnMilestone`, etc.) so client configuration updates apply cleanly.
- **Card Form State Synchronization (#146)**: Unified form definitions between `lib/card-form-state.js` and `lib/client.js`, eliminating duplicate and diverging state management logic.

## 0.2.15

### Fixed
- **Peer gate on DSH 0.2.0-rc.1** (#58): DSH skips a profile bundle whose `peerDependencies` exclude the running version, so this plugin was absent from the profile with no error in the UI. Every `@deepseek-ai/dsh-*` peer now names both the 0.1.7-rc.2 and 0.2.0-rc.1 lines, because semver does not admit a prerelease of the next minor into a range that does not name it.

Notable changes to `@goodandready/dsh-goal`.

## 0.2.13

### Changed & Refactored (Core Goal Addon Transformation - #113)
- **Native Core Goal Addon**: Transformed from standalone duplicate goal engine into an advanced companion addon over DeepSeek Harness native GoalService (`@deepseek-ai/dsh-goal`, `ctx.goals`).
- **Conflict Resolution**: Purged conflicting tools (`create_goal`, `get_goal`, `update_goal`) and duplicate `/goal` command registration, delegating goal lifecycle to core `dsh-command-goal` and `GoalBar`.
- **Addon Model Tools**: Registered specialized tools `goal_milestones` (`list`, `set`, `add`, `complete`) and `goal_checklist` (`toggle`).
- **Token Budget Guard**: Real-time token monitoring via `ctx.tokenMeter` with 80% threshold warnings and automatic blocking via `ctx.goals.block(agent, ref, { code: 'budget', message })`.
- **Milestones & Checklists**: Stored by `goalId` in dedicated `AddonStore` with milestone prompt injection via `agent/pre-step` waterfall listener.
- **Git Snapshots & Rollback**: Automatic commit/tag checkpoints upon milestone completion with confined path rollback.
- **Retrospective Reports**: Automatic export of structured markdown execution summaries to `.dsh/goals/<timestamp>-<slug>.md` on goal completion or clear.

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
