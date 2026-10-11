import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createGoalBranch, mergeGoalBranch, discardGoalBranch } from '../lib/engine-git-branch.js';

test('Git Branch Lifecycle (Issue #157): positive merge and discard on real git repository', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-goal-branch-test-'));

  try {
    // 1. Initialize git repo and initial commit on main
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Tester'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'tester@example.com'], { cwd: tmpDir, stdio: 'ignore' });

    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'initial commit\n', 'utf8');
    execFileSync('git', ['add', 'file.txt'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'chore: initial'], { cwd: tmpDir, stdio: 'ignore' });

    // 2. Test createGoalBranch and mergeGoalBranch
    const branchName = 'goal/test-branch-1';
    const created = createGoalBranch(tmpDir, branchName, [tmpDir]);
    assert.equal(created, true, 'createGoalBranch must succeed');

    // Add a commit on the goal branch
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'goal commit\n', 'utf8');
    execFileSync('git', ['add', 'file.txt'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'feat: goal work'], { cwd: tmpDir, stdio: 'ignore' });

    // Merge goal branch back to main
    const merged = mergeGoalBranch(tmpDir, branchName, 'main', [tmpDir]);
    assert.equal(merged, true, 'mergeGoalBranch must succeed and checkout main without -- error');

    // Verify current branch is main and content is merged
    const currentBranch = execFileSync('git', ['branch', '--show-current'], { cwd: tmpDir, encoding: 'utf8' }).trim();
    assert.equal(currentBranch, 'main');
    const content = fs.readFileSync(path.join(tmpDir, 'file.txt'), 'utf8');
    assert.equal(content, 'goal commit\n');

    // 3. Test createGoalBranch and discardGoalBranch
    const discardBranchName = 'goal/test-branch-2';
    const created2 = createGoalBranch(tmpDir, discardBranchName, [tmpDir]);
    assert.equal(created2, true, 'createGoalBranch must succeed for discard target');

    const discarded = discardGoalBranch(tmpDir, discardBranchName, 'main', [tmpDir]);
    assert.equal(discarded, true, 'discardGoalBranch must succeed and delete branch');

    const branches = execFileSync('git', ['branch'], { cwd: tmpDir, encoding: 'utf8' });
    assert.ok(!branches.includes(discardBranchName), 'discarded branch must no longer exist');
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
});
