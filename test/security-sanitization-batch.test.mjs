process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { resolveGiteaAuth, resolveRepoInfo, syncMilestoneWithIssue } from '../lib/engine-issue-sync.js';
import { isTrustedCaller, registerRoutes } from '../lib/routes.js';
import { isValidGitRef, isGitRepository, createGoalBranch, mergeGoalBranch, discardGoalBranch } from '../lib/engine-git-branch.js';
import { getSafeCwd, MilestoneStatus } from '../lib/goal-engine-constants.js';
import { GoalEngine } from '../lib/goal-engine.js';
import { registerTools } from '../lib/tools.js';
import { createMilestoneCheckpoint } from '../lib/engine-reports.js';

test('Issues #120 & #126: Gitea auth and repo resolution sanitation', async () => {
  // 1. Without env vars or options, auth has no token and empty baseUrl
  const origEnvCreds = process.env.DSH_GITEA_CREDENTIALS;
  const origEnvUrl = process.env.GITEA_BASE_URL;
  const origEnvToken = process.env.GITEA_TOKEN;
  delete process.env.DSH_GITEA_CREDENTIALS;
  delete process.env.GITEA_BASE_URL;
  delete process.env.GITEA_TOKEN;

  try {
    const auth = resolveGiteaAuth();
    assert.equal(auth.token, undefined);
    assert.equal(auth.baseUrl, '');
    assert.equal(auth.baseUrl.includes('3005'), false);

    // 2. Fallback repo info does not default to goodandready/dsh-goal
    const nonGitDir = os.tmpdir();
    const repoInfo = resolveRepoInfo(nonGitDir);
    assert.notEqual(repoInfo.repo, 'dsh-goal');

    // 3. syncMilestoneWithIssue gracefully fails when credentials/repo missing
    const res = await syncMilestoneWithIssue(
      { issueRef: { issueNumber: 42 } },
      { title: 'Check item' }
    );
    assert.equal(res.synced, false);
    assert.ok(res.error.includes('not configured') || res.error.includes('available'));
  } finally {
    if (origEnvCreds) process.env.DSH_GITEA_CREDENTIALS = origEnvCreds;
    if (origEnvUrl) process.env.GITEA_BASE_URL = origEnvUrl;
    if (origEnvToken) process.env.GITEA_TOKEN = origEnvToken;
  }
});

test('Issues #122, #144, #148: isTrustedCaller fail-closed LAN caller protection', () => {
  // LAN caller spoofing Origin & Host without sec-fetch-site: same-origin is REJECTED (#148)
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.150' },
    headers: {
      host: '192.168.1.111:3080',
      origin: 'http://192.168.1.111:3080',
    },
  }), false);

  // LAN caller spoofing Referer & Host without sec-fetch-site is REJECTED (#122, #144)
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.150' },
    headers: {
      host: '192.168.1.111:3080',
      referer: 'http://192.168.1.111:3080/dsh-goal',
    },
  }), false);

  // Cross-site / same-site browser request is REJECTED
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.150' },
    headers: {
      host: '192.168.1.111:3080',
      'sec-fetch-site': 'cross-site',
      origin: 'http://192.168.1.111:3080',
    },
  }), false);
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.150' },
    headers: {
      host: '192.168.1.111:3080',
      'sec-fetch-site': 'same-site',
      origin: 'http://192.168.1.111:3080',
    },
  }), false);

  // Browser UI request from LAN with verified same-origin header is ACCEPTED
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '192.168.1.150' },
    headers: {
      host: '192.168.1.111:3080',
      'sec-fetch-site': 'same-origin',
      origin: 'http://192.168.1.111:3080',
    },
  }), true);

  // Loopback callers are ACCEPTED
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3080' },
  }), true);
  assert.equal(isTrustedCaller({
    socket: { remoteAddress: '::1' },
    headers: { host: 'localhost:3080' },
  }), true);
});

test('Issue #123: Git ref validation and branch action rejection', async () => {
  // Valid refs
  assert.equal(isValidGitRef('main'), true);
  assert.equal(isValidGitRef('master'), true);
  assert.equal(isValidGitRef('feature/safe-branch-1'), true);
  assert.equal(isValidGitRef('v0.2.18'), true);

  // Dangerous / flag / traversal refs
  assert.equal(isValidGitRef('-f'), false);
  assert.equal(isValidGitRef('--upload-pack=evil'), false);
  assert.equal(isValidGitRef('../escape'), false);
  assert.equal(isValidGitRef('branch; rm -rf /'), false);
  assert.equal(isValidGitRef('ref@{1}'), false);
  assert.equal(isValidGitRef('branch with space'), false);
  assert.equal(isValidGitRef('bad..dots'), false);
  assert.equal(isValidGitRef('branch/'), false);
  assert.equal(isValidGitRef(''), false);
  assert.equal(isValidGitRef(null), false);

  // mergeGoalBranch / discardGoalBranch reject invalid refs
  assert.equal(mergeGoalBranch(process.cwd(), '--upload-pack=evil', 'main'), false);
  assert.equal(discardGoalBranch(process.cwd(), '-D', 'main'), false);
  assert.equal(mergeGoalBranch(process.cwd(), 'valid-branch', '-f'), false);

  // Route handler rejects invalid targetBranch ref with HTTP 400
  const engine = new GoalEngine();
  let routeHandler = null;
  registerRoutes({
    webServer: { register: ({ handler }) => { routeHandler = handler; return () => {}; } },
    effect: (fn) => fn(),
  }, { engine });

  const sendReq = (body) => new Promise((resolve) => {
    let output = '';
    const req = {
      method: 'POST',
      url: '/dsh-goal/action',
      headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '127.0.0.1' },
      on: (ev, fn) => {
        if (ev === 'data') fn(Buffer.from(JSON.stringify(body)));
        if (ev === 'end') fn();
      },
    };
    const res = {
      statusCode: 200,
      setHeader: () => {},
      end: (data) => {
        output = data;
        resolve({ statusCode: res.statusCode, body: JSON.parse(output || '{}') });
      },
    };
    routeHandler(req, res);
  });

  const resBadRef = await sendReq({
    action: 'branch_action',
    operation: 'merge',
    targetBranch: '--upload-pack=evil',
  });
  assert.equal(resBadRef.statusCode, 400);
  assert.ok(resBadRef.body.error.includes('Invalid targetBranch ref'));

  const resBadOp = await sendReq({
    action: 'branch_action',
    operation: 'malicious_exec',
    targetBranch: 'main',
  });
  assert.equal(resBadOp.statusCode, 400);
  assert.ok(resBadOp.body.error.includes('Invalid branch operation'));
});

test('Issues #124 & #128: Safe cwd confinement and tools milestone completion signature', async () => {
  // getSafeCwd returns default for non-existent path
  const nonExistent = path.resolve(process.cwd(), 'does-not-exist-dir-' + Date.now());
  const safe = getSafeCwd(nonExistent);
  assert.equal(safe, null);

  // startGoal normalizes cwd
  const engine = new GoalEngine();
  engine.startGoal('Confinement goal', { cwd: nonExistent, autoBranch: false }, 'conf-sess');
  const stored = engine.goals.get('conf-sess');
  assert.equal(stored.cwd, null);

  // isGitRepository returns false for non-git directory
  const tmpDir = os.tmpdir();
  assert.equal(isGitRepository(tmpDir), false);

  // createGoalBranch safely handles non-git directory without throwing
  assert.equal(createGoalBranch(tmpDir, 'test-branch'), false);

  // registerTools completes milestone passing notes string and safe cwd workspaceRoot (#128)
  let receivedGoalId = null;
  let receivedMilestoneId = null;
  let receivedNotes = null;
  let receivedWorkspaceRoot = null;

  const mockMm = {
    completeMilestone: async (gId, mId, notes, wsRoot) => {
      receivedGoalId = gId;
      receivedMilestoneId = mId;
      receivedNotes = notes;
      receivedWorkspaceRoot = wsRoot;
      return { id: mId, completed: true };
    },
  };

  let registeredToolExecutor = null;
  const mockCtx = {
    inject: (deps, fn) => fn({
      tools: {
        register: (definition) => {
          if (definition.name === 'goal_milestones') {
            registeredToolExecutor = definition.execute;
          }
        },
      },
    }),
  };

  registerTools(mockCtx, { milestoneManager: mockMm });
  assert.ok(registeredToolExecutor);

  const execRes = await registeredToolExecutor({
    action: 'complete',
    goalId: 'goal-test-123',
    milestoneId: 'm-1',
    notes: 'Finished task cleanly',
  }, {
    cwd: process.cwd(),
  });

  assert.equal(execRes.ok, true);
  assert.equal(receivedGoalId, 'goal-test-123');
  assert.equal(receivedMilestoneId, 'm-1');
  assert.equal(receivedNotes, 'Finished task cleanly');
  assert.equal(typeof receivedNotes, 'string');
  assert.equal(receivedWorkspaceRoot, process.cwd());
});

test('Issue #125: createMilestoneCheckpoint does not use --no-verify and stages tracked files only', () => {
  // Inspect source of createMilestoneCheckpoint to guarantee forbidden flags are absent
  const code = fs.readFileSync(path.resolve(process.cwd(), 'lib/engine-reports.js'), 'utf8');
  assert.equal(code.includes("'--no-verify'"), false, "Must not contain '--no-verify'");
  assert.equal(code.includes("'-A'"), false, "Must not use git add -A");
  assert.ok(code.includes("'-u'"), "Must use git add -u for tracked changes");
});
