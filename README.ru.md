# 📦 @goodandready/dsh-goal

<div align="center">

<h3>Движок автономного выполнения целей и многошагового трекинга задач для DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-goal"><img src="https://img.shields.io/npm/v/@goodandready/dsh-goal.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="../LICENSE"><img src="https://img.shields.io/github/license/GooDAnDReaDY/dsh-goal.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<!-- Обязательная кнопка перехода на витрину всех проектов -->
<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/Все_проекты_автора-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="Все проекты автора"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

<table align="center">
  <tr>
    <td align="center">
      ⭐ <strong>Если вам нравится этот плагин, поставьте ему звезду на GitHub</strong> — это покажет мне, что плагин вам полезен, и будет мотивировать меня развивать его дальше.
      <br><br>
      🐛 <strong>Если вы нашли баг или хотите предложить новый функционал</strong>, создайте issue на GitHub на любом языке — я рассмотрю ваше предложение и реализую полезные идеи в одной из следующих версий плагина.
    </td>
  </tr>
</table>

</div>

---

## ⚡ Обзор и решаемая проблема

Решение комплексных инженерных задач требует автономного многошагового выполнения: декомпозиции целей на майлстоуны, непрерывного выполнения итераций без ручного подталкивания пользователя и наглядного отслеживания прогресса.

**`@goodandready/dsh-goal`** внедряет автономный режим достижения целей в DeepSeek Harness через команду `/goal`:
* 🎯 **Плавающий баннер в шапке**: зафиксированный статус-бар над чатом с таймером выполнения (`• 2s`, `• 1m 45s`), заголовком цели и кнопками управления.
* ⏸️ **Управление циклом (Play / Pause / Cancel)**: мгновенная приостановка автономного цикла агента или его возобновление в любой момент.
* 📋 **Интерактивная панель майлстоунов**: модальное окно со списком подзадач, прогресс-баром и журналом выполнения.
* 🤖 **Инструменты агента**: `goal_set_milestones`, `goal_update_progress` и `goal_finish` для самостоятельной работы ИИ.
* 🛡️ **Защитные лимиты**: настраиваемое ограничение `maxIterations` для предотвращения бесконечных циклов.

---

## 🏛️ Архитектура

```mermaid
graph TD
    subgraph Input ["Взаимодействие"]
        Cmd["Слеш-команда: /goal &lt;цель&gt;"]
        API["REST API: POST /dsh-goal/action"]
    end

    subgraph GoalEngine ["Движок целей (lib/index.js)"]
        State["Менеджер состояний (IDLE, RUNNING, PAUSED, COMPLETED)"]
        Milestones["Трекер и декомпозиция майлстоунов"]
        Disk["Хранилище состояний (~/.dsh/goal-state.json)"]
    end

    subgraph AgentLoop ["Автономный цикл агента"]
        ToolSet["goal_set_milestones"]
        ToolProgress["goal_update_progress"]
        ToolFinish["goal_finish"]
        LimitGuard{"Ограничение maxIterations"}
    end

    subgraph UI ["Интерфейс DSH"]
        Banner["Баннер цели над чатом"]
        Timer["Таймер выполнения"]
        Drawer["Модальное окно задач"]
        Settings["Карточка настроек (Schemastery)"]
    end

    Cmd --> GoalEngine
    API --> GoalEngine
    GoalEngine --> State
    State --> Disk
    State --> Banner
    State --> Drawer
    GoalEngine --> AgentLoop
    AgentLoop --> LimitGuard
    ToolSet --> GoalEngine
    ToolProgress --> GoalEngine
    ToolFinish --> GoalEngine
```

---

## 📦 Установка

```bash
dsh plugin --profile web add @goodandready/dsh-goal
```

Перезапустите экземпляр DeepSeek Harness и обновите вкладку в браузере.

---

## 💬 Быстрый старт

Запустите цель прямо в чате:

```text
/goal Провести рефакторинг middleware авторизации и написать интеграционные тесты
```

Или через REST API:

```bash
curl -X POST http://localhost:3080/dsh-goal/action \
  -H "Content-Type: application/json" \
  -d '{"action":"start","title":"Оптимизация SQL-запросов"}'
```

---

## ⚙️ Таблица конфигурации (`settings.yaml`)

```yaml
dsh-goal:
  maxIterations: 25
  autoDrive: true
  enableSound: true
```

| Параметр | Тип | По умолчанию | Описание |
|:---|:---|:---|:---|
| `maxIterations` | `number` | `25` | Защитный лимит: максимум автономных итераций на цель |
| `autoDrive` | `boolean` | `true` | Автоматически продолжать автономный цикл между тактами |
| `enableSound` | `boolean` | `true` | Звуковое уведомление при успешном завершении цели |

---

## 🧪 Тестирование

Запуск набора юнит-тестов:

```bash
npm test
```

---

## 📄 Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
