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
