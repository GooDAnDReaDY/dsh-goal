import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('Repository Hygiene: docs/plans is ignored by git', () => {
  const result = execSync('git check-ignore docs/plans/task_plan.md', { cwd: rootDir, encoding: 'utf8' }).trim();
  assert.ok(result.includes('docs/plans'), 'docs/plans must be ignored by git');
});

test('Repository Hygiene: package-lock.json is not present in repository root', () => {
  const lockPath = path.join(rootDir, 'package-lock.json');
  assert.equal(fs.existsSync(lockPath), false, 'package-lock.json must not exist');
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
  assert.ok(fs.existsSync(path.join(rootDir, '.planning', '151-repo-hygiene', 'findings.md')), 'findings.md in .planning');
});

test('Package Manifest Hygiene (Issue #149): peerDependencies does not self-reference @deepseek-ai/dsh-goal', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.equal(pkg.peerDependencies?.['@deepseek-ai/dsh-goal'], undefined, 'Must not declare @deepseek-ai/dsh-goal as peer');
  assert.equal(pkg.peerDependenciesMeta?.['@deepseek-ai/dsh-goal'], undefined, 'Must not declare peerDependenciesMeta for dsh-goal');
  assert.equal(pkg.dependencies?.['@deepseek-ai/schemastery'], undefined, 'Must not duplicate schemastery in dependencies');
});

test('Dead Code Hygiene (Issue #131 & #147): dead modules are removed from lib', () => {
  assert.equal(fs.existsSync(path.join(rootDir, 'lib', 'command-handler.js')), false, 'lib/command-handler.js must be deleted');
  assert.equal(fs.existsSync(path.join(rootDir, 'lib', 'card-form-state.js')), false, 'lib/card-form-state.js must be deleted');
});
