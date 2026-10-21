# Findings & Technical Decisions (v0.2.30)
- GoalEngine Line Limit: lib/goal-engine.js is at 591 lines. All operator query state transitions and formatting must reside in lib/engine-operator-query.js.
- Zero Cyrillic: Source files (lib/*.js, src/client/*.js) must contain ZERO Cyrillic characters. Bilingual strings use en/zh dictionaries.
- Pure DSH Tokens: UI cards and buttons must use --dsw-alias-* CSS variables.
