# Findings: Core Goal Tools Shadowing & Interoperability

1. **Tool Collision Root Cause**:
   DSH profile `web` includes `@deepseek-ai/dsh-base` bundle, which bundles `@deepseek-ai/dsh-tool-goal`.
   It registers `update_goal`, `get_goal`, and `create_goal` with strict authority checks (`requireDirectHuman` or `isMatchingGoalRound`).
   Autonomous runs triggered by models or `/goal` do not pass this check, causing the model to throw.

2. **Cordis / ToolRuntime Storage**:
   `tctx.tools.layers.global.tools.data` is an insertion-ordered `Map`.
   By checking `globalTools.data.has(name)` and deleting the entry before calling `tctx.tools.register(...)`, our plugin completely replaces the core definition with zero core patching.

3. **System Prompt Harmonization**:
   Core `tool-goal` registers a system prompt section `tool:goal` with misleading instructions.
   We delete `tool:goal` from `pctx.systemPrompt.layers.global.sections.data` and register our own dynamic state injection under `tool:goal`.
