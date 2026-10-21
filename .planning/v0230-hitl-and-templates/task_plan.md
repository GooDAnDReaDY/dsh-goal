# Release v0.2.30 Implementation Plan
Tasks:
- #165: Parameterized Quick Launch Templates with Variables (Quick Launch Variables)
- #166: Interactive Human-in-the-Loop Tool `goal_ask_operator` for Blocker Resolution

## Phases
1. [ ] Architecture & Helper Modules (lib/engine-operator-query.js, lib/engine-templates.js)
2. [ ] Core Engine & Tools Integration (lib/tools.js, lib/routes.js, lib/engine-prompt.js, lib/goal-engine.js < 600 lines)
3. [ ] Client UI Implementation (src/client/00-header.js, 20-styles.js, 60-modal-quicklaunch.js, 70-dock-banner.js)
4. [ ] Build & Verify Client drift (scripts/build-client.mjs)
5. [ ] Comprehensive Unit & Integration Tests (test/hitl-operator.test.mjs, test/quicklaunch-variables.test.mjs)
6. [ ] Preflight & Documentation (docs/design/DESIGN.md, deploy.sh check)
7. [ ] Pull Request & Merge
