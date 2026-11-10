import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoalEngine, GoalState, detectLanguage } from '../lib/goal-engine.js';


describe('i18n Language Detection and Multilingual Prompts (en & zh only)', () => {
  test('detectLanguage detects zh and en correctly', () => {
    assert.equal(detectLanguage('实现报表导出功能'), 'zh');
    assert.equal(detectLanguage('添加测试用例'), 'zh');
    assert.equal(detectLanguage('Implement export and cover with tests'), 'en');
    assert.equal(detectLanguage('Add balance to top left corner'), 'en');
    assert.equal(detectLanguage('12345'), 'en');
    assert.equal(detectLanguage(null), 'en');
    assert.equal(detectLanguage('', 'en'), 'en');
    assert.equal(detectLanguage('Non-Chinese characters fallback to en'), 'en');
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

    // Chinese goal
    const snapZh = engine.startGoal('在屏幕左上角添加用户余额组件', {}, 'zh-session');
    assert.equal(snapZh.lang, 'zh');
    const promptZh = engine.getStatePromptInjection('zh-session');
    assert.match(promptZh, /目标: "在屏幕左上角添加用户余额组件"/);
    assert.match(promptZh, /运行时间:/);
    assert.match(promptZh, /工作计划:/);
    assert.match(promptZh, /第一步核心指令: 立即调用 goal_set_milestones/);
  });



  test('Regression Gate: lib/*.js contains zero hardcoded Cyrillic characters', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const libDir = path.resolve(__dirname, '../lib');
    const files = fs.readdirSync(libDir).filter((f) => f.endsWith('.js'));
    const cyrillicRegex = /[\u0400-\u04FF]/;
    const violations = [];

    for (const file of files) {
      const fullPath = path.join(libDir, file);
      const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        if (cyrillicRegex.test(line)) {
          violations.push(`${file}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    assert.equal(
      violations.length,
      0,
      `Found hardcoded Cyrillic lines in lib/*.js (must be canonical en/zh only):\n${violations.join('\n')}`
    );
  });
});
