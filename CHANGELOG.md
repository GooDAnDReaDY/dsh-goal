# Changelog

Notable changes to `@goodandready/dsh-goal`.

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
