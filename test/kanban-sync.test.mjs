import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MILESTONE_TO_KANBAN_COLUMN,
  KANBAN_COLUMN_TO_MILESTONE_STATUS,
  formatMilestoneExternalRef,
  parseMilestoneExternalRef,
  syncGoalToKanban,
  syncMilestoneStatusToKanban,
  handleKanbanCardMoved,
} from '../lib/engine-kanban-sync.js';
import { GoalEngine, MilestoneStatus } from '../lib/goal-engine.js';
import { registerRoutes } from '../lib/routes.js';

test('Issue #164: externalRef formatting and parsing', () => {
  const ref = formatMilestoneExternalRef('goal-123', 'ms-456');
  assert.equal(ref, 'dsh-goal:goal-123:ms-456');

  const parsed = parseMilestoneExternalRef(ref);
  assert.deepEqual(parsed, { goalId: 'goal-123', milestoneId: 'ms-456' });

  assert.equal(parseMilestoneExternalRef('invalid:ref'), null);
  assert.equal(parseMilestoneExternalRef(null), null);
});

test('Issue #164: Status to Column mappings', () => {
  assert.equal(MILESTONE_TO_KANBAN_COLUMN[MilestoneStatus.PENDING], 'todo');
  assert.equal(MILESTONE_TO_KANBAN_COLUMN[MilestoneStatus.IN_PROGRESS], 'in_progress');
  assert.equal(MILESTONE_TO_KANBAN_COLUMN[MilestoneStatus.COMPLETED], 'done');

  assert.equal(KANBAN_COLUMN_TO_MILESTONE_STATUS.todo, MilestoneStatus.PENDING);
  assert.equal(KANBAN_COLUMN_TO_MILESTONE_STATUS.backlog, MilestoneStatus.PENDING);
  assert.equal(KANBAN_COLUMN_TO_MILESTONE_STATUS.in_progress, MilestoneStatus.IN_PROGRESS);
  assert.equal(KANBAN_COLUMN_TO_MILESTONE_STATUS.done, MilestoneStatus.COMPLETED);
});

test('Issue #164: Graceful degradation when kanban service is unavailable', async () => {
  const engine = new GoalEngine({ storagePath: ':memory:' });
  engine.startGoal('Goal Without Kanban', {
    description: 'Description',
    milestones: [{ title: 'Task 1' }, { title: 'Task 2' }],
  }, 'sess-no-kanban');

  const syncRes = await engine.syncKanban('sess-no-kanban');
  assert.equal(syncRes.ok, false);
  assert.equal(syncRes.skipped, true);
  assert.equal(syncRes.reason, 'kanban-unavailable');
});

test('Issue #164: syncGoalToKanban provisions tasks via kanbanService', async () => {
  const createdTasks = [];
  const mockKanbanService = {
    createTask: async (input) => {
      const task = { id: `task-${createdTasks.length + 1}`, ...input };
      createdTasks.push(task);
      return { ok: true, taskId: task.id, task };
    },
  };

  const engine = new GoalEngine({ storagePath: ':memory:', kanbanService: mockKanbanService });
  engine.startGoal('Kanban Integration Goal', {
    description: 'Testing',
    milestones: [
      { title: 'Milestone 1', status: MilestoneStatus.PENDING },
      { title: 'Milestone 2', status: MilestoneStatus.IN_PROGRESS },
      { title: 'Milestone 3', status: MilestoneStatus.COMPLETED },
    ],
  }, 'sess-kanban');

  const syncRes = await engine.syncKanban('sess-kanban');
  assert.equal(syncRes.ok, true);
  assert.equal(syncRes.synced, 3);
  assert.equal(createdTasks.length, 3);

  assert.equal(createdTasks[0].column, 'todo');
  assert.equal(createdTasks[1].column, 'in_progress');
  assert.equal(createdTasks[2].column, 'done');
  assert.ok(createdTasks[0].externalRef.startsWith('dsh-goal:'));
});

test('Issue #164: Milestone update automatically synchronizes with kanban store', async () => {
  const tasks = new Map();
  const mockStore = {
    findTaskByExternalRef: (ref) => {
      for (const t of tasks.values()) {
        if (t.externalRef === ref) return t;
      }
      return null;
    },
    moveTask: (id, { column }) => {
      const t = tasks.get(id);
      if (t) t.column = column;
      return t;
    },
  };

  const engine = new GoalEngine({ storagePath: ':memory:', kanbanStore: mockStore, enableKanbanSync: true });
  engine.startGoal('Auto Sync Goal', {
    description: 'Testing',
    milestones: [{ title: 'Phase 1', status: MilestoneStatus.PENDING }],
  }, 'sess-auto-sync');
  const goal = engine.getActiveGoal('sess-auto-sync');
  const ms = goal.milestones[0];

  const extRef = formatMilestoneExternalRef(goal.id, ms.id);
  tasks.set('task-100', { id: 'task-100', externalRef: extRef, column: 'todo' });

  // Update milestone to IN_PROGRESS
  engine.updateMilestone(ms.id, MilestoneStatus.IN_PROGRESS, 'In progress now', 'sess-auto-sync');
  // Wait a microtick for async sync
  await new Promise((resolve) => setTimeout(resolve, 20));

  const updatedTask = tasks.get('task-100');
  assert.equal(updatedTask.column, 'in_progress');

  // Update milestone to COMPLETED
  engine.updateMilestone(ms.id, MilestoneStatus.COMPLETED, 'Finished', 'sess-auto-sync');
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(updatedTask.column, 'done');
});

test('Issue #164: handleKanbanCardMoved propagates board card move to GoalEngine milestone', () => {
  const engine = new GoalEngine({ storagePath: ':memory:' });
  engine.startGoal('Inbound Sync Goal', {
    description: 'Testing',
    milestones: [{ id: 'm-1', title: 'Feature Slice', status: MilestoneStatus.PENDING }],
  }, 'sess-inbound');
  const goal = engine.getActiveGoal('sess-inbound');

  const extRef = formatMilestoneExternalRef(goal.id, 'm-1');

  // Simulate card moved to 'in_progress' on kanban board
  const move1 = engine.handleKanbanCardMove({
    externalRef: extRef,
    column: 'in_progress',
  }, 'sess-inbound');

  assert.equal(move1.ok, true);
  assert.equal(move1.newStatus, MilestoneStatus.IN_PROGRESS);
  assert.equal(goal.milestones[0].status, MilestoneStatus.IN_PROGRESS);

  // Simulate card moved to 'done' on kanban board
  const move2 = engine.handleKanbanCardMove({
    externalRef: extRef,
    column: 'done',
  }, 'sess-inbound');

  assert.equal(move2.ok, true);
  assert.equal(move2.newStatus, MilestoneStatus.COMPLETED);
  assert.equal(goal.milestones[0].status, MilestoneStatus.COMPLETED);
});

test('Issue #164: WebServer action kanban_move and kanban_sync', async () => {
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

  engine.startGoal('Route Kanban Goal', {
    description: 'Testing',
    milestones: [{ id: 'ms-route-1', title: 'Route Milestone', status: MilestoneStatus.PENDING }],
  }, 'route-sess');
  const goal = engine.getActiveGoal('route-sess');
  const extRef = formatMilestoneExternalRef(goal.id, 'ms-route-1');

  // Test POST action: 'kanban_move'
  let statusCode = 0;
  let bodyOut = '';
  const fakeReq = {
    method: 'POST',
    url: '/dsh-goal/action',
    headers: { host: 'localhost:3080' },
    on: (evt, cb) => {
      if (evt === 'data') {
        cb(Buffer.from(JSON.stringify({
          action: 'kanban_move',
          sessionId: 'route-sess',
          externalRef: extRef,
          column: 'done',
        })));
      }
      if (evt === 'end') cb();
    },
  };
  const fakeRes = {
    setHeader: () => {},
    end: (data) => { bodyOut = data; },
    set statusCode(c) { statusCode = c; },
  };

  registeredHandler(fakeReq, fakeRes);
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(statusCode, 200);
  const resObj = JSON.parse(bodyOut);
  assert.equal(resObj.ok, true);
  assert.equal(resObj.state.newStatus, MilestoneStatus.COMPLETED);
  assert.equal(goal.milestones[0].status, MilestoneStatus.COMPLETED);
});
