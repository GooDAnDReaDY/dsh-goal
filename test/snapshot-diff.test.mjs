import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseNumstat, getGitDiff, getEngineGoalDiff } from '../lib/engine-diff.js';
import { GoalEngine } from '../lib/goal-engine.js';
import { registerRoutes } from '../lib/routes.js';

test('Issue #168: parseNumstat correctly parses insertions, deletions, binary and empty strings', () => {
  const empty = parseNumstat('');
  assert.deepEqual(empty, []);

  const nullVal = parseNumstat(null);
  assert.deepEqual(nullVal, []);

  const numstatText = `10\t5\tlib/routes.js\n-\t-\timages/logo.png\n0\t12\tsrc/client/old.js\n`;
  const parsed = parseNumstat(numstatText);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed[0], { path: 'lib/routes.js', insertions: 10, deletions: 5, binary: false });
  assert.deepEqual(parsed[1], { path: 'images/logo.png', insertions: 0, deletions: 0, binary: true });
  assert.deepEqual(parsed[2], { path: 'src/client/old.js', insertions: 0, deletions: 12, binary: false });
});

test('Issue #168: getGitDiff rejects invalid refs, flags, and dangerous cwd paths', () => {
  const resBadRef = getGitDiff({ base: '--output=/etc/passwd' });
  assert.equal(resBadRef.ok, false);
  assert.match(resBadRef.error, /Not a git repository|Invalid base git ref/);

  const resTraversal = getGitDiff({ cwd: '/non/existent/path/traversal' });
  assert.equal(resTraversal.ok, false);
  assert.match(resTraversal.error, /Not a git repository/);
});

test('Issue #168: getGitDiff and GoalEngine.getDiff on real git repository', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-diff-test-'));
  try {
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpDir, stdio: 'ignore' });

    // Initial commit
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'line 1\nline 2\n');
    execFileSync('git', ['add', 'file1.txt'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'commit 1'], { cwd: tmpDir, stdio: 'ignore' });
    const c1 = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim();

    // Second commit on branch
    execFileSync('git', ['checkout', '-b', 'feat/diff-branch'], { cwd: tmpDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'file1.txt'), 'line 1\nline 2 modified\nline 3\n');
    fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'new file content\n');
    execFileSync('git', ['add', '.'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'commit 2'], { cwd: tmpDir, stdio: 'ignore' });
    const c2 = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim();

    // Diff between c1 and c2
    const diffRes = getGitDiff({
      cwd: tmpDir,
      base: c1,
      target: c2,
      allowedRoots: [tmpDir],
    });

    assert.equal(diffRes.ok, true);
    assert.equal(diffRes.stats.filesChanged, 2);
    assert.ok(diffRes.stats.insertions > 0);
    assert.ok(diffRes.diff.includes('diff --git a/file1.txt b/file1.txt'));
    assert.ok(diffRes.diff.includes('diff --git a/file2.txt b/file2.txt'));

    // Test GoalEngine.getDiff integration
    const engine = new GoalEngine({ storagePath: path.join(tmpDir, 'state.json'), allowedRoots: [tmpDir] });
    engine.startGoal('Test Goal', {
      description: 'Testing diff',
      cwd: tmpDir,
      gitStartCommit: c1,
      branchName: 'feat/diff-branch',
      allowedRoots: [tmpDir],
    }, 'test-session');

    const engineDiff = engine.getDiff('test-session', { allowedRoots: [tmpDir] });
    assert.equal(engineDiff.ok, true);
    assert.equal(engineDiff.stats.filesChanged, 2);
    assert.equal(engineDiff.target, 'feat/diff-branch');
    assert.equal(engineDiff.base, c1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Issue #168: WebServer GET /dsh-goal/diff and 405 Method Not Allowed contract', async () => {
  let registeredHandler = null;
  const mockCtx = {
    webServer: {
      register: (options) => {
        registeredHandler = options.handler;
        return () => {};
      },
    },
    logger: { warn: () => {}, error: () => {} },
  };

  const engine = new GoalEngine({ storagePath: ':memory:' });
  registerRoutes(mockCtx, { engine, config: {} });
  assert.ok(typeof registeredHandler === 'function');

  // Test 405 Method Not Allowed on POST /dsh-goal/diff
  let postStatusCode = 0;
  let postHeaders = {};
  let postBody = '';
  registeredHandler(
    {
      method: 'POST',
      url: '/dsh-goal/diff',
      headers: { host: 'localhost:3080' },
    },
    {
      setHeader: (k, v) => { postHeaders[k] = v; },
      end: (data) => { postBody = data; },
      set statusCode(c) { postStatusCode = c; },
    }
  );
  assert.equal(postStatusCode, 405);
  assert.equal(postHeaders['Allow'], 'GET');
  assert.match(postBody, /Method Not Allowed: use GET/);

  // Test GET /dsh-goal/diff with active goal
  engine.startGoal('Diff Endpoint Goal', {
    description: 'Testing',
    cwd: process.cwd(),
  }, 'diff-sess');

  let getStatusCode = 0;
  let getBody = '';
  registeredHandler(
    {
      method: 'GET',
      url: '/dsh-goal/diff?sessionId=diff-sess',
      headers: { host: 'localhost:3080' },
    },
    {
      setHeader: () => {},
      end: (data) => { getBody = data; },
      set statusCode(c) { getStatusCode = c; },
    }
  );
  assert.equal(getStatusCode, 200);
  const payload = JSON.parse(getBody);
  assert.equal(payload.ok, true);
  assert.ok(payload.stats !== undefined);
  assert.ok(Array.isArray(payload.files));
});

test('Issue #168: Client bundle includes tabs, diff summary, and viewer elements', () => {
  const clientJs = fs.readFileSync(path.join(process.cwd(), 'lib/client.js'), 'utf8');
  assert.ok(clientJs.includes('dsh-goal-tabs'), 'Must contain .dsh-goal-tabs class');
  assert.ok(clientJs.includes('dsh-goal-diff-viewer'), 'Must contain .dsh-goal-diff-viewer class');
  assert.ok(clientJs.includes('dsh-goal-diff-summary'), 'Must contain .dsh-goal-diff-summary class');
  assert.ok(clientJs.includes('tabDiff'), 'Must reference tabDiff localization token');
  assert.ok(clientJs.includes('diffNoChanges'), 'Must reference diffNoChanges localization token');
});
