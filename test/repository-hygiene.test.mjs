import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('Repository Hygiene: docs/plans and .planning are ignored by git (#199)', () => {
  const result = execSync('git check-ignore docs/plans/task_plan.md', { cwd: rootDir, encoding: 'utf8' }).trim();
  assert.ok(result.includes('docs/plans'), 'docs/plans must be ignored by git');
  const planResult = execSync('git check-ignore .planning/task_plan.md', { cwd: rootDir, encoding: 'utf8' }).trim();
  assert.ok(planResult.includes('.planning'), '.planning must be ignored by git');
  const trackedPlans = execSync('git ls-files .planning', { cwd: rootDir, encoding: 'utf8' }).trim();
  assert.equal(trackedPlans, '', '.planning must not be tracked in git index');
});

test('Repository Hygiene: package-lock.json is present in repository root (#184)', () => {
  const lockPath = path.join(rootDir, 'package-lock.json');
  assert.equal(fs.existsSync(lockPath), true, 'package-lock.json must exist');
});

test('Repository Hygiene: package.json files array does not contain redundant package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.files), 'files must be an array');
  assert.equal(pkg.files.includes('package.json'), false, 'files array must not contain package.json');
});

test('Repository Hygiene: all files in lib/*.js contain zero Cyrillic characters', () => {
  const libDir = path.join(rootDir, 'lib');
  const files = fs.readdirSync(libDir).filter((f) => f.endsWith('.js'));
  const cyrillicRegex = /[\u0400-\u04FF]/;

  for (const file of files) {
    const filePath = path.join(libDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (cyrillicRegex.test(line)) {
        assert.fail(`Found Cyrillic character in ${file}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
});

test('Repository Hygiene (Issue #151): index.md, deploy.sh, and AGENTS.md exist; planning files not in root', () => {
  assert.ok(fs.existsSync(path.join(rootDir, 'index.md')), 'index.md must exist in root');
  assert.ok(fs.existsSync(path.join(rootDir, 'deploy.sh')), 'deploy.sh must exist in root');
  assert.ok(fs.existsSync(path.join(rootDir, 'AGENTS.md')), 'AGENTS.md must exist in root');

  assert.equal(fs.existsSync(path.join(rootDir, 'findings.md')), false, 'findings.md must not be in root');
  assert.equal(fs.existsSync(path.join(rootDir, 'progress.md')), false, 'progress.md must not be in root');
  assert.equal(fs.existsSync(path.join(rootDir, 'task_plan.md')), false, 'task_plan.md must not be in root');
  assert.equal(execSync('git ls-files .planning', { cwd: rootDir, encoding: 'utf8' }).trim(), '', '.planning must not be in git index');
});

test('Package Manifest Hygiene (Issues #149 & #204): peerDependencies declares optional companion services', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.ok(pkg.peerDependencies?.['@deepseek-ai/dsh-goal'], 'Must declare @deepseek-ai/dsh-goal as optional peer');
  assert.equal(pkg.peerDependenciesMeta?.['@deepseek-ai/dsh-goal']?.optional, true, 'dsh-goal must be optional');
  assert.ok(pkg.peerDependencies?.['@deepseek-ai/dsh-token-meter'], 'Must declare @deepseek-ai/dsh-token-meter as optional peer');
  assert.equal(pkg.peerDependenciesMeta?.['@deepseek-ai/dsh-token-meter']?.optional, true, 'dsh-token-meter must be optional');
  assert.equal(pkg.dependencies?.['@deepseek-ai/schemastery'], undefined, 'Must not duplicate schemastery in dependencies');
});

test('Dead Code Hygiene (Issue #131 & #147): dead modules are removed from lib', () => {
  assert.equal(fs.existsSync(path.join(rootDir, 'lib', 'command-handler.js')), false, 'lib/command-handler.js must be deleted');
  assert.equal(fs.existsSync(path.join(rootDir, 'lib', 'card-form-state.js')), false, 'lib/card-form-state.js must be deleted');
});

test('Repository Hygiene (Issue #200): in-memory storage path :memory: never leaves artifacts on disk', () => {
  assert.equal(fs.existsSync(path.join(rootDir, ':memory:')), false, ':memory: must not exist in root');
  assert.equal(fs.existsSync(path.join(rootDir, '_TXIHS~I')), false, '_TXIHS~I must not exist in root');
});

test('Repository Hygiene (Issue #198): multilingual DESIGN contract exists in EN, RU, and ZH', () => {
  const enPath = path.join(rootDir, 'docs', 'design', 'DESIGN.md');
  const ruPath = path.join(rootDir, 'docs', 'design', 'DESIGN.ru.md');
  const zhPath = path.join(rootDir, 'docs', 'design', 'DESIGN.zh.md');

  assert.ok(fs.existsSync(enPath) && fs.statSync(enPath).size > 1000, 'DESIGN.md (EN) must exist and be non-empty');
  assert.ok(fs.existsSync(ruPath) && fs.statSync(ruPath).size > 1000, 'DESIGN.ru.md (RU) must exist and be non-empty');
  assert.ok(fs.existsSync(zhPath) && fs.statSync(zhPath).size > 1000, 'DESIGN.zh.md (ZH) must exist and be non-empty');

  const readmeEn = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const readmeRu = fs.readFileSync(path.join(rootDir, 'README.ru.md'), 'utf8');
  const readmeZh = fs.readFileSync(path.join(rootDir, 'README.zh.md'), 'utf8');

  assert.ok(readmeEn.includes('docs/design/DESIGN.md'), 'README.md must link to DESIGN.md');
  assert.ok(readmeRu.includes('docs/design/DESIGN.ru.md'), 'README.ru.md must link to DESIGN.ru.md');
  assert.ok(readmeZh.includes('docs/design/DESIGN.zh.md'), 'README.zh.md must link to DESIGN.zh.md');
});

test('Repository Hygiene (Issue #197): DESIGN.md documents all 7 tools and does not reference settings.plugin.item as active slot', () => {
  const designEn = fs.readFileSync(path.join(rootDir, 'docs', 'design', 'DESIGN.md'), 'utf8');
  const designRu = fs.readFileSync(path.join(rootDir, 'docs', 'design', 'DESIGN.ru.md'), 'utf8');

  const expectedTools = [
    'goal_milestones',
    'goal_checklist',
    'goal_set_milestones',
    'goal_update_progress',
    'goal_finish',
    'goal_ask_operator',
    'goal_spawn_subgoal',
  ];

  for (const tool of expectedTools) {
    assert.ok(designEn.includes(tool), `DESIGN.md must document tool ${tool}`);
    assert.ok(designRu.includes(tool), `DESIGN.ru.md must document tool ${tool}`);
  }

  // settings.plugin.item must not be listed as an active slot (only as obsolete/historical)
  assert.equal(designEn.includes('Settings Card (`settings.plugin.item`)'), false, 'Obsolete settings.plugin.item heading must be replaced');
  assert.equal(designRu.includes('Settings Card (`settings.plugin.item`)'), false, 'Obsolete settings.plugin.item heading must be replaced in Russian doc');
  assert.ok(designEn.includes('plugins.item'), 'DESIGN.md must specify plugins.item slot');
  assert.ok(designEn.includes('plugins.row.config'), 'DESIGN.md must specify plugins.row.config slot');
});
