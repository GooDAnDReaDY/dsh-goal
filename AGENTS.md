# AGENTS.md — dsh-goal

Этот файл дополняет правила рабочей зоны `DEV` и содержит факты, ограничения
и регламенты, специфичные для проекта `@goodandready/dsh-goal`. При противоречии
с общими правилами агент останавливается и запрашивает уточнение у пользователя.

---

## 1. Назначение и контекст продукта

- **Проект**: `@goodandready/dsh-goal` — официальный companion addon для DeepSeek Harness
  к встроенной службе управления целями (`@deepseek-ai/dsh-goal`, `ctx.goals`).
- **Ключевые возможности**:
  - Token Budget Guard (мониторинг расхода токенов через `ctx.tokenMeter`, превентивные варнинги на 80%, мягкая блокировка на 100%, автоматическое масштабирование бюджета при завершении);
  - Иерархические вехи (milestones) и чеклисты подзадач с автоматической инъекцией в промпт на хуке `agent/pre-step`;
  - Git-снапшоты и автоматические чекпоинты вех с безопасным изолированным откатом (rollback);
  - Интеграция с трекером тикетов Gitea (синхронизация чекбоксов issue при закрытии вех);
  - Пост-целевой ретроспективный отчет с анализом расхода токенов, сбоев инструментов и метрик git diff stat.
- **DEV репозиторий**: `/mnt/external/Project/DEV/dhsplugins/dsh-goal`.
- **OPT / production**: Сервер MiniAI (`192.168.1.111`), профиль `web`, служба `dsh-web.service`, порт 3080.
- **Gitea**: `http://192.168.1.111:3005/goodandready/dsh-goal`, ветка `main`.
- **GitHub mirror**: `https://github.com/GooDAnDReaDY/dsh-goal` (зеркалирование очищенного продуктового дерева через `scripts/publish-github.sh`).
- **npm Registry**: `@goodandready/dsh-goal`.

---

## 2. Политика пакета и версионирования

- Пакет проектируется как публичный с открытым кодом под лицензией MIT.
- Имя пакета: `@goodandready/dsh-goal` (строго совпадает в `package.json`, `cordis.patch.yml` и клиенте `lib/client.js`).
- Публикация в npm и GitHub Release производится только после успешного прохождения всех тестов, preflight-чека и явного подтверждения пользователя.
- Версии следуют строгому SemVer.

---

## 3. Ограничения и запреты (MUST NOT)

1. **Никакой прямой работы в `main`**: все изменения ведутся в изолированных worktree `.worktrees/<branch>` от актуального `origin/main`.
2. **Никакого дублирования ядра DSH**: плагин НЕ должен регистрировать команду `/goal` или дублировать базовые инструменты создания целей (`create_goal`, `get_goal`, `update_goal`), чтобы не вызывать конфликтов с нативным `@deepseek-ai/dsh-goal`.
3. **Монолитный `lib/client.js`**: клиентская часть отдается ядром DSH напрямую в браузер без бандлера. Разбивать `lib/client.js` на ESM-импорты в проде запрещено до появления сборщика.
4. **Ноль кириллицы в `lib/*.js`**: весь код в `lib/` обязан содержать только английские и китайские (`zh`) строки. Локализация интерфейса подключается через словари и `locale`-сервис.
5. **Безопасность путей (CWD)**: любые файловые операции и git-команды валидируются через `getSafeCwd` и `isValidGitRef` с разделителем `--`. Не допускаются инъекции аргументов и выход за пределы рабочего каталога.
6. **Никаких `--force`**: запрещены `git push --force` в любые ветки или зеркала.

---

## 4. Архитектура и точки входа

- `lib/index.js` — точка входа серверного Cordis-плагина (`apply(ctx, config)`):
  - Инъекция сервисов: `['webServer', 'settings']`;
  - Регистрация инструментов `goal_milestones`, `goal_checklist` и алиасов контракта;
  - Регистрация маршрутов HTTP/SSE `/dsh-goal/*` и обновлятора `/api/dsh-goal/update`;
  - Слушатели событий `goal/changed`, `agent/pre-step` и `approval/asked`.
- `lib/client.js` — браузерный модуль, инжектируемый в UI DSH.
- `lib/goal-engine.js` — изолированная state machine цели (для fallback и автономных unit-тестов).
- `lib/milestone-manager.js` — менеджер вех и чеклистов.
- `lib/token-budget-guard.js` — контроллер лимитов токенов.
- `lib/git-snapshot-manager.js` — контроллер git-коммитов и чекпоинтов вех.
- `lib/addon-store.js` — постоянное хранилище метаданных вех, снапшотов и бюджета целей.

---

## 5. Регламент проверки и релиза

1. **Тесты**: `NODE_ENV=test node --test test/*.test.mjs` (без сети и без поднятого DSH).
2. **Preflight**: `bash /home/vadim/.dsh/skills/dsh-plugin-preflight/scripts/preflight.sh .` (требуется `FAIL=0`).
3. **PR в Gitea**: создание ветки `fix/*` или `feat/*`, открытие PR в `main` через Gitea API, слияние.
4. **Релиз**: bump версии в `package.json` и `CHANGELOG.md`, тег `vX.Y.Z` в Gitea.
5. **Зеркалирование на GitHub**: `./scripts/publish-github.sh --push origin/main`.
6. **Публикация в npm**: `npm publish --access public`.
7. **Деплой на прод**: `bash deploy.sh install <version> web` с последующей проверкой эндпоинтов.
