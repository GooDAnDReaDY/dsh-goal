# Индексная карта проекта dsh-goal

Навигационная карта, архитектурная структура и паспорт плагина `@goodandready/dsh-goal`.

---

## 1. Паспорт проекта

- **Название**: `@goodandready/dsh-goal`
- **Тип**: DeepSeek Harness (DSH) Companion Addon Plugin
- **Назначение**: Расширение встроенной службы управления целями (`@deepseek-ai/dsh-goal`): мониторинг бюджета токенов (Token Budget Guard), иерархические вехи (milestones) и подзадачи (checklists), автоматические git-снапшоты и ретроспективные отчеты.
- **DEV репозиторий**: `/mnt/external/Project/DEV/dhsplugins/dsh-goal`
- **Production сервер**: MiniAI (`192.168.1.111`), профиль `web`, служба `dsh-web.service`
- **Gitea**: `http://192.168.1.111:3005/goodandready/dsh-goal`
- **GitHub mirror**: `https://github.com/GooDAnDReaDY/dsh-goal`
- **npm Registry**: `https://www.npmjs.com/package/@goodandready/dsh-goal`
- **Лицензия**: MIT

---

## 2. Архитектура и карта файлов

```
dsh-goal/
├── AGENTS.md                  # Правила, ограничения и регламенты для ИИ-агентов
├── CHANGELOG.md               # История версий и изменений
├── LICENSE                    # Лицензия MIT
├── README.md                  # Документация на английском
├── README.ru.md               # Документация на русском
├── README.zh.md               # Документация на китайском
├── cordis.patch.yml           # Манифест Cordis-плагина для DSH
├── deploy.sh                  # Единая точка сборки, проверки и деплоя на MiniAI
├── index.md                   # Настоящая навигационная карта проекта
├── package.json               # Манифест npm-пакета и зависимости
├── .planning/                 # Внутренние планы и архивные артефакты разработки
├── docs/
│   └── design/
│       └── DESIGN.md          # Дизайн-контракт пользовательских интерфейсов
├── lib/
│   ├── addon-store.js         # Персистентное хранилище метаданных аддона (.dsh/addon-dsh-goal.json)
│   ├── client.js              # Браузерный монолит (UI карточки настроек, модальные окна, баннеры)
│   ├── engine-git-branch.js   # Управление git-ветками и безопасная санитаризация ref
│   ├── engine-intervention.js # Подсистема пользовательских директив и вмешательства оператора
│   ├── engine-issue-sync.js   # Синхронизация чеклистов и статусов с issue-трекером Gitea
│   ├── engine-milestones.js   # Логика обновления вех, чеклистов и графа зависимостей
│   ├── engine-prompt.js       # Форматирование и инъекция автономных промптов и подсказок
│   ├── engine-reports.js      # Экспорт отчетов выполнения целей и артефактов в markdown
│   ├── engine-retrospective.js# Вычисление метрик ретроспективы (время, токены, сбои, git diff)
│   ├── engine-sessions.js     # Ограничение роста состояния сессий и подсказок оператора
│   ├── engine-store.js        # Дебаунс-сохранение состояния независимого движка целей
│   ├── engine-templates.js    # Каталог типовых шаблонов целей (Feature, Bugfix, Refactoring и др.)
│   ├── git-snapshot-manager.js# Создание git-чекпоинтов и контролируемый откат
│   ├── goal-engine.js         # Автономная state machine цели (fallback & тесты)
│   ├── goal-engine-constants.js# Константы, статусы, тайминги и утилиты языка
│   ├── index.js               # Главная точка входа Cordis-плагина DSH
│   ├── milestone-manager.js   # Менеджер жизненного цикла вех и зависимостей
│   ├── routes.js              # Регистрация HTTP REST и SSE эндпоинтов
│   ├── token-budget-guard.js  # Защита бюджета токенов с мягкой блокировкой и авто-скейлом
│   ├── tools.js               # Регистрация инструментов агента (goal_milestones, goal_checklist)
│   └── updater.js             # Однокликовый самообновлятор плагина по стандарту DSH
├── scripts/
│   └── publish-github.sh      # Скрипт санированной публикации среза в GitHub-зеркало
└── test/                      # Сьют юнит- и интеграционных тестов (node:test)
```

---

## 3. Точки взаимодействия и интеграции

### 3.1 Cordis контекст (`lib/index.js`)
- Зависимости сервисов: `['webServer', 'settings']`.
- Опциональные сервисы: `tokenMeter`, `goals`, `tools`, `agents`.
- Слушатели жизненного цикла:
  - `agent/pre-step`: вычисление бюджета и инъекция активного промпта вехи;
  - `goal/changed`: синхронизация создания, обновления и закрытия целей;
  - `approval/asked`: превентивная пауза цели при ожидании подтверждения оператора;
  - `loader/volatile-update`: динамическое обновление настроек без перезапуска.

### 3.2 Инструменты модели (`lib/tools.js`)
- `goal_milestones` (действия: `list`, `set`, `add`, `complete`) — управление вехами активной цели;
- `goal_checklist` (действие: `toggle`) — переключение подпунктов чеклиста вехи;
- Алиасы контракта автономного промпта: `goal_set_milestones`, `goal_update_progress`, `goal_finish`.

### 3.3 HTTP & SSE API (`lib/routes.js`)
- `GET /dsh-goal/events` — Server-Sent Events (SSE) поток снапшотов состояния в реальном времени;
- `POST /dsh-goal/action` — Выполнение операций (пауза, возобновление, очистка, обновление вех);
- `GET /api/dsh-goal/update` — Проверка статуса обновления пакета;
- `POST /api/dsh-goal/update` — Запуск процесса обновления из npm.

---

## 4. Стандартные процедуры

### 4.1 Локальная проверка
```bash
bash deploy.sh check
```
Запускает полный сьют unit-тестов и preflight-проверку соответствия стандартам DSH.

### 4.2 Сборка и деплой на production
```bash
bash deploy.sh install <version> web
```
Устанавливает указанную версию в web-профиль MiniAI, перезапускает службу и валидирует здоровье эндпоинтов.

### 4.3 Публикация в GitHub
```bash
./scripts/publish-github.sh --push origin/main
```
Публикует санированное дерево репозитория в зеркало без служебных файлов DEV-окружения.
