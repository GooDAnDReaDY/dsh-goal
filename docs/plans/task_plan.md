# Task Plan: Replace Core DSH Goal Tools & Seamless Interception (GitHub #2)

## Problem Statement
When models call `update_goal`, core `@deepseek-ai/dsh-tool-goal` rejects the call outside direct-human turns with:
`HarnessError: complete and blocked require a direct human turn or the current goal round`
This causes models to fail when trying to finish or update goals.

## Objectives
1. Safely replace core goal tools (`update_goal`, `get_goal`, `create_goal`) and prompt section (`tool:goal`) in Cordis runtime.
2. Route all `update_goal` actions (`complete`, `pause`, `resume`, `edit`, `blocked`), `get_goal`, and `create_goal` directly to `GoalEngine`.
3. Keep existing `goal_*` tools fully operational with proper `output: { schema, render }` specs.
4. Verify with unit test suite in `test/core-tools-compat.test.mjs`.
5. Update documentation (`docs/design/DESIGN.md`, `README.md`, `README.zh.md`, `README.ru.md`) following `dsh-documentation-standard`.
6. Test on isolated test server (192.168.1.123:3082), then production candidate on MiniAI (192.168.1.111:3080).
7. Release v0.1.10, merge PR in Gitea, publish to npm, update goodandready.app.

## Steps
- [ ] Task 1: Write unit tests in `test/core-tools-compat.test.mjs` (TDD verification)
- [ ] Task 2: Implement tool replacement and mapping in `lib/index.js`
- [ ] Task 3: Run unit tests and ensure clean pass
- [ ] Task 4: Update `docs/design/DESIGN.md` and multilingual READMEs with standard headers & support blocks
- [ ] Task 5: Bump version to 0.1.10 in `package.json`
- [ ] Task 6: Commit, push, create Gitea PR #41, merge to main
- [ ] Task 7: Pack `.tgz` and test on MiniPC test server (192.168.1.123:3082)
- [ ] Task 8: Test candidate on Production server (192.168.1.111:3080)
- [ ] Task 9: Publish to GitHub & npm, reinstall on production
- [ ] Task 10: Update showcase on goodandready.app
