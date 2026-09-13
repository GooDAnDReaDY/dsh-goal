import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const clientSource = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

test('client.js registers into conversation.input.dock with defensive try/catch', () => {
  assert.ok(
    clientSource.includes('conversation.input.dock'),
    'Client bundle must register into composer dock slot conversation.input.dock',
  );

  // Must NOT register into core-owned conversation.session.header slot
  const lines = clientSource.split('\n');
  const registersSessionHeaderDirectly = lines.some(
    (line) => line.includes("'conversation.session.header'") && !line.includes('.utilities') && !line.includes('.dock'),
  );
  assert.equal(
    registersSessionHeaderDirectly,
    false,
    'Client bundle must NOT register into conversation.session.header to avoid colliding with core chat header',
  );

  assert.ok(
    clientSource.includes('settings.plugin.item'),
    'Client bundle must register settings card into settings.plugin.item',
  );
});

test('client.js does not contain dead registration to non-existent conversation.header.utilities slot (Issue #14)', () => {
  assert.equal(
    clientSource.includes('conversation.header.utilities'),
    false,
    'Dead registration to conversation.header.utilities must be removed',
  );
});

test('client.js details modal displays plan of work without static 0/0 progress bar (Issue #16)', () => {
  assert.ok(
    clientSource.includes("milestones: 'Plan of work:'"),
    'Milestones label should be "Plan of work:" in English locale',
  );
  assert.ok(
    clientSource.includes("milestones: '工作计划：'"),
    'Milestones label should be "工作计划：" in Chinese locale',
  );
  assert.ok(
    clientSource.includes("noMilestones: 'Agent is preparing the plan of work...'"),
    'Empty milestones label should be in English locale',
  );
  assert.equal(
    clientSource.includes('dsh-goal-progress-fill'),
    false,
    'Progress bar element should be removed from details modal',
  );
});

test('client.js displays completed banner with checkmark and manual close button (Issue #18)', () => {
  assert.ok(
    clientSource.includes("goalCompleted: 'Goal completed'"),
    'English locale must include goalCompleted label',
  );
  assert.ok(
    clientSource.includes("goalCompleted: '目标已完成'"),
    'Chinese locale must include goalCompleted label',
  );
  assert.ok(
    clientSource.includes("closeBanner: 'Close goal banner'"),
    'English locale must include closeBanner label',
  );
  assert.ok(
    clientSource.includes('IconCheck'),
    'IconCheck component must be defined for completed goal status',
  );
  assert.ok(
    clientSource.includes('formatLiveElapsed'),
    'GoalTopBanner must compute local live ticking elapsed time',
  );
});

test('client.js CSS uses clean DSH tokens without hardcoded fallback colors', () => {
  const hexFallbackRegex = /var\(--[a-zA-Z0-9_-]+,\s*#[0-9a-fA-F]+\)/g;
  const rgbFallbackRegex = /var\(--[a-zA-Z0-9_-]+,\s*rgba?\([^)]+\)\)/g;

  const hexMatches = clientSource.match(hexFallbackRegex) || [];
  const rgbMatches = clientSource.match(rgbFallbackRegex) || [];

  assert.deepEqual(hexMatches, [], `Found hardcoded hex fallbacks in CSS tokens: ${hexMatches.join(', ')}`);
  assert.deepEqual(rgbMatches, [], `Found hardcoded rgb fallbacks in CSS tokens: ${rgbMatches.join(', ')}`);
});

test('client.js uses Discard changes for discard button in English and Chinese locale', () => {
  assert.ok(
    clientSource.includes("discard: 'Discard changes'"),
    'Discard button label in English locale must be "Discard changes"',
  );
  assert.ok(
    clientSource.includes("discard: '放弃更改'"),
    'Discard button label in Chinese locale must be "放弃更改"',
  );
});
