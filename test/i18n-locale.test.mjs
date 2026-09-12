import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine, GoalState, detectLanguage } from '../lib/goal-engine.js';
import { formatGoalStartPrompt, executeGoalSlashCommand, parseGoalInput } from '../lib/command-handler.js';

describe('i18n Language Detection and Multilingual Prompts', () => {
  test('detectLanguage detects ru, zh, and en correctly', () => {
    assert.equal(detectLanguage('Создать новый компонент'), 'ru');
    assert.equal(detectLanguage('Настроить экспорт'), 'ru');
    assert.equal(detectLanguage('实现报表导出功能'), 'zh');
    assert.equal(detectLanguage('添加测试用例'), 'zh');
    assert.equal(detectLanguage('Implement export and cover with tests'), 'en');
    assert.equal(detectLanguage('Add balance to top left corner'), 'en');
    assert.equal(detectLanguage('12345'), 'en');
    assert.equal(detectLanguage(null), 'en');
    assert.equal(detectLanguage('', 'ru'), 'ru');
  });

  test('GoalEngine stores lang and generates localized prompt injection', () => {
    const engine = new GoalEngine();

    // English goal
    const snapEn = engine.startGoal('Add user balance to top-left of the screen');
    assert.equal(snapEn.lang, 'en');
    const promptEn = engine.getStatePromptInjection();
    assert.match(promptEn, /\[DSH GOAL MODE ACTIVE\]/);
    assert.match(promptEn, /Goal: "Add user balance to top-left of the screen"/);
    assert.match(promptEn, /Elapsed Time:/);
    assert.match(promptEn, /Work Plan:/);
    assert.match(promptEn, /YOUR FIRST STEP: Immediately call tool goal_set_milestones/);
    assert.doesNotMatch(promptEn, /Цель:/);

    // Russian goal
    const snapRu = engine.startGoal('Добавить баланс пользователя в верхний левый угол', {}, 'ru-session');
    assert.equal(snapRu.lang, 'ru');
    const promptRu = engine.getStatePromptInjection('ru-session');
    assert.match(promptRu, /Цель: "Добавить баланс пользователя в верхний левый угол"/);
    assert.match(promptRu, /Время работы:/);
    assert.match(promptRu, /План работ:/);
    assert.match(promptRu, /ТВОЙ ПЕРВЫЙ ШАГ: Немедленно вызови инструмент goal_set_milestones/);
  });

  test('formatGoalStartPrompt produces English contract for English and Russian for Russian', () => {
    const promptEn = formatGoalStartPrompt('Add balance widget');
    assert.match(promptEn, /🎯 Goal Mode activated: "Add balance widget"/);
    assert.match(promptEn, /STRICT AUTONOMOUS CONTRACT:/);
    assert.match(promptEn, /MANDATORY STEP 1:/);

    const promptRu = formatGoalStartPrompt('Добавить виджет баланса');
    assert.match(promptRu, /🎯 Активирован режим цели \(Goal Mode\): "Добавить виджет баланса"/);
    assert.match(promptRu, /СТРОГИЙ КОНТРАКТ АВТОНОМНОГО РЕЖИМА:/);
    assert.match(promptRu, /ОБЯЗАТЕЛЬНЫЙ ШАГ №1:/);
  });

  test('executeGoalSlashCommand outputs English messages for English goals and commands', () => {
    const engine = new GoalEngine();

    // Empty show in default language
    const emptyRes = executeGoalSlashCommand(engine, { action: 'show' });
    assert.match(emptyRes.text, /Goal Mode: no active goal set/);
    assert.match(emptyRes.text, /Usage: \/goal/);

    // Start English goal
    const startRes = executeGoalSlashCommand(engine, { action: 'start', text: 'Deploy new service' });
    assert.match(startRes.text, /🎯 Goal activated: "Deploy new service"/);
    assert.match(startRes.text, /To pause: \/goal pause/);

    // Show English goal
    const showRes = executeGoalSlashCommand(engine, { action: 'show' });
    assert.match(showRes.text, /🎯 Goal: "Deploy new service"/);
    assert.match(showRes.text, /Status: RUNNING/);
    assert.match(showRes.text, /Duration:/);

    // Pause English goal
    const pauseRes = executeGoalSlashCommand(engine, { action: 'pause' });
    assert.match(pauseRes.text, /⏸ Goal paused: "Deploy new service"/);

    // Resume English goal
    const resumeRes = executeGoalSlashCommand(engine, { action: 'resume' });
    assert.match(resumeRes.text, /▶️ Goal resumed: "Deploy new service"/);

    // Clear English goal
    const clearRes = executeGoalSlashCommand(engine, { action: 'clear' });
    assert.match(clearRes.text, /🎯 Goal cleared/);
  });

  test('executeGoalSlashCommand outputs Russian messages for Russian goals and commands', () => {
    const engine = new GoalEngine();

    // Start Russian goal
    const startRes = executeGoalSlashCommand(engine, { action: 'start', text: 'Развернуть новый сервис' });
    assert.match(startRes.text, /🎯 Активирована цель: «Развернуть новый сервис»/);

    // Show Russian goal
    const showRes = executeGoalSlashCommand(engine, { action: 'show' });
    assert.match(showRes.text, /🎯 Цель: «Развернуть новый сервис»/);
    assert.match(showRes.text, /Статус: RUNNING/);

    // Pause Russian goal
    const pauseRes = executeGoalSlashCommand(engine, { action: 'pause' });
    assert.match(pauseRes.text, /⏸ Цель приостановлена: «Развернуть новый сервис»/);

    // Resume Russian goal
    const resumeRes = executeGoalSlashCommand(engine, { action: 'resume' });
    assert.match(resumeRes.text, /▶️ Цель возобновлена: «Развернуть новый сервис»/);

    // Clear Russian goal
    const clearRes = executeGoalSlashCommand(engine, { action: 'clear' });
    assert.match(clearRes.text, /🎯 Цель сброшена/);
  });
});
