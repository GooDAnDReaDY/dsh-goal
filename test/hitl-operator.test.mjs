import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalEngine } from '../lib/goal-engine.js';
import { GoalState } from '../lib/goal-engine-constants.js';
import { askOperatorQuery, answerOperatorQuery, formatOperatorAnswerPrompt } from '../lib/engine-operator-query.js';
import { buildStatePromptInjection } from '../lib/engine-prompt.js';
import { registerTools } from '../lib/tools.js';

test('Issue #166: askOperatorQuery validates question and pauses goal when blocking', () => {
  const goal = {
    id: 'g-1',
    state: GoalState.RUNNING,
    logs: [],
    activityFeed: [],
  };

  // Rejects empty question
  const errRes = askOperatorQuery(goal, { question: '   ' });
  assert.equal(errRes.ok, false);
  assert.match(errRes.error, /required/);

  // Success with choices
  const res = askOperatorQuery(goal, {
    question: 'Should we migrate to SQLite or PostgreSQL?',
    options: ['SQLite', 'PostgreSQL'],
    isBlocking: true,
  });

  assert.equal(res.ok, true);
  assert.equal(goal.waitingForOperator, true);
  assert.equal(goal.state, GoalState.PAUSED);
  assert.ok(goal.pausedAt != null);
  assert.equal(goal.operatorQuery.question, 'Should we migrate to SQLite or PostgreSQL?');
  assert.deepEqual(goal.operatorQuery.options, ['SQLite', 'PostgreSQL']);
  assert.equal(goal.operatorQuery.isBlocking, true);
  assert.equal(goal.activityFeed.length, 1);
  assert.equal(goal.activityFeed[0].type, 'operator_query');
});

test('Issue #166: answerOperatorQuery records answer and resumes execution', () => {
  const goal = {
    id: 'g-1',
    state: GoalState.RUNNING,
    logs: [],
    activityFeed: [],
  };

  askOperatorQuery(goal, {
    question: 'Select migration strategy',
    options: ['In-place', 'Side-by-side'],
    isBlocking: true,
  });

  assert.equal(goal.state, GoalState.PAUSED);

  // Answer via optionIndex
  const ansRes = answerOperatorQuery(goal, { optionIndex: 1 });
  assert.equal(ansRes.ok, true);
  assert.equal(ansRes.answer, 'Side-by-side');
  assert.equal(goal.waitingForOperator, false);
  assert.equal(goal.state, GoalState.RUNNING);
  assert.equal(goal.pausedAt, null);
  assert.ok(goal.totalPausedDurationMs >= 0);
  assert.equal(goal.operatorQuery.answer, 'Side-by-side');
  assert.equal(goal.operatorQuery.consumed, false);
  assert.equal(goal.activityFeed.length, 2);
  assert.equal(goal.activityFeed[1].type, 'operator_answer');
});

test('Issue #166: formatOperatorAnswerPrompt injects answer and marks as consumed', () => {
  const goal = {
    operatorQuery: {
      question: 'Which library to use?',
      answer: 'Use standard library node:fs',
      consumed: false,
    },
  };

  const promptEn = formatOperatorAnswerPrompt(goal, 'en');
  assert.match(promptEn, /\[OPERATOR RESPONSE TO YOUR QUERY\]/);
  assert.match(promptEn, /Which library to use\?/);
  assert.match(promptEn, /Use standard library node:fs/);
  assert.equal(goal.operatorQuery.consumed, true);

  // Second call returns empty string because it was already consumed
  const promptAgain = formatOperatorAnswerPrompt(goal, 'en');
  assert.equal(promptAgain, '');
});

test('Issue #166: GoalEngine askOperator and answerOperator state lifecycle', () => {
  const engine = new GoalEngine({ storagePath: null });
  const sid = 'sess-hitl-1';

  engine.startGoal('Complex Architecture Refactoring', { mode: 'act' }, sid);
  let snap = engine.getSnapshot(sid);
  assert.equal(snap.state, GoalState.RUNNING);
  assert.equal(snap.waitingForOperator, false);
  assert.equal(snap.operatorQuery, null);

  // Agent asks question
  const askRes = engine.askOperator({
    question: 'Do we support legacy v1 clients?',
    options: ['Yes, maintain v1 backwards compatibility', 'No, break and deprecate v1'],
    isBlocking: true,
  }, sid);

  assert.equal(askRes.ok, true);
  snap = engine.getSnapshot(sid);
  assert.equal(snap.state, GoalState.PAUSED);
  assert.equal(snap.waitingForOperator, true);
  assert.equal(snap.operatorQuery.question, 'Do we support legacy v1 clients?');

  // Operator responds
  const ansRes = engine.answerOperator({ optionIndex: 0 }, sid);
  assert.equal(ansRes.ok, true);

  snap = engine.getSnapshot(sid);
  assert.equal(snap.state, GoalState.RUNNING);
  assert.equal(snap.waitingForOperator, false);
  assert.equal(snap.operatorQuery.answer, 'Yes, maintain v1 backwards compatibility');

  // Injection check
  const injection = engine.getStatePromptInjection(sid);
  assert.match(injection, /OPERATOR RESPONSE TO YOUR QUERY/);
  assert.match(injection, /Yes, maintain v1 backwards compatibility/);
});

test('Issue #166: Tool registration goal_ask_operator invokes engine correctly', async () => {
  const engine = new GoalEngine({ storagePath: null });
  const sid = 'sess-tool-hitl';
  engine.startGoal('Database Setup', { mode: 'act' }, sid);

  const registeredTools = new Map();
  const fakeCtx = {
    goalEngine: engine,
    inject: (deps, fn) => {
      fn({
        tools: {
          register: (def) => {
            registeredTools.set(def.name, def);
            return () => registeredTools.delete(def.name);
          },
        },
      });
    },
  };

  registerTools(fakeCtx, { logger: { warn: () => {} } });

  assert.ok(registeredTools.has('goal_ask_operator'));
  const askTool = registeredTools.get('goal_ask_operator');

  // Execute tool
  const res = await askTool.execute(
    { question: 'Port number to bind?', options: ['3000', '8080'], is_blocking: true, goalId: sid },
    { sessionId: sid }
  );

  assert.equal(res.ok, true);
  assert.equal(res.isBlocking, true);
  assert.equal(engine.getSnapshot(sid).waitingForOperator, true);
  assert.equal(engine.getSnapshot(sid).state, GoalState.PAUSED);
});
