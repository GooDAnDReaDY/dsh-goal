import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../src/client/80-settings-logic.js', import.meta.url), 'utf8');
const fn = new Function(`${code}\nreturn { DEFAULT_SETTINGS, NUMERIC_FIELDS, parseNumberField, getFieldStatus, computeSavePlan };`);
const { DEFAULT_SETTINGS, NUMERIC_FIELDS, parseNumberField, getFieldStatus, computeSavePlan } = fn();

test('DEFAULT_SETTINGS contains all canonical configuration fields (10 fields)', () => {
  assert.equal(DEFAULT_SETTINGS.maxIterations, 25);
  assert.equal(DEFAULT_SETTINGS.autoDrive, true);
  assert.equal(DEFAULT_SETTINGS.enableSound, true);
  assert.equal(DEFAULT_SETTINGS.showQuickLaunchButton, true);
  assert.equal(DEFAULT_SETTINGS.consecutiveToolFailureLimit, 3);
  assert.equal(DEFAULT_SETTINGS.enableBrowserNotifications, true);
  assert.equal(DEFAULT_SETTINGS.maxTokenBudget, 0);
  assert.equal(DEFAULT_SETTINGS.budgetWarningThreshold, 80);
  assert.equal(DEFAULT_SETTINGS.autoCheckpointOnMilestone, false);
  assert.equal(DEFAULT_SETTINGS.storagePath, '');
});

test('parseNumberField parses positive integers, clears on empty string, rejects invalid', () => {
  assert.equal(parseNumberField('25'), 25);
  assert.equal(parseNumberField('1'), 1);
  assert.equal(parseNumberField(50), 50);

  // min=0 allows 0
  assert.equal(parseNumberField('0', 0), 0);
  assert.ok(Number.isNaN(parseNumberField('0', 1)));

  // Empty string / null / undefined -> undefined (unset / reset override)
  assert.equal(parseNumberField(''), undefined);
  assert.equal(parseNumberField(null), undefined);
  assert.equal(parseNumberField(undefined), undefined);

  // Invalid numbers -> NaN
  assert.ok(Number.isNaN(parseNumberField('-5', 0)));
  assert.ok(Number.isNaN(parseNumberField('abc')));
  assert.ok(Number.isNaN(parseNumberField('12.34')));
});

test('getFieldStatus computes status, dirty, invalid and overridden flags accurately', () => {
  const baseSnap = {
    value: { ...DEFAULT_SETTINGS },
    base: { ...DEFAULT_SETTINGS },
    user: {},
  };

  // 1. Initial clean state
  const status1 = getFieldStatus('maxIterations', undefined, baseSnap);
  assert.equal(status1.value, 25);
  assert.equal(status1.isDirty, false);
  assert.equal(status1.invalid, false);
  assert.equal(status1.isOverridden, false);

  // 2. Typing invalid number in draft
  const statusInvalid = getFieldStatus('maxIterations', '-10', baseSnap);
  assert.equal(statusInvalid.invalid, true);
  assert.equal(statusInvalid.isDirty, true);

  // 3. Modifying valid number
  const statusModified = getFieldStatus('maxIterations', '40', baseSnap);
  assert.equal(statusModified.value, '40');
  assert.equal(statusModified.invalid, false);
  assert.equal(statusModified.isDirty, true);

  // 4. consecutiveToolFailureLimit allows 0
  const statusZero = getFieldStatus('consecutiveToolFailureLimit', '0', baseSnap);
  assert.equal(statusZero.invalid, false);
  assert.equal(statusZero.isDirty, true);

  // 5. maxTokenBudget allows 0 and non-zero
  const statusBudget = getFieldStatus('maxTokenBudget', '50000', baseSnap);
  assert.equal(statusBudget.invalid, false);
  assert.equal(statusBudget.isDirty, true);

  // 6. Overridden field in user settings
  const overriddenSnap = {
    value: { maxIterations: 50, autoDrive: false, maxTokenBudget: 100000 },
    base: { maxIterations: 25, autoDrive: true, maxTokenBudget: 0 },
    user: { maxIterations: 50, autoDrive: false, maxTokenBudget: 100000 },
  };

  const statusOverridden = getFieldStatus('maxIterations', undefined, overriddenSnap);
  assert.equal(statusOverridden.value, 50);
  assert.equal(statusOverridden.isOverridden, true);
  assert.equal(statusOverridden.isDirty, false);

  // 7. Clearing an overridden field via empty string resets override
  const statusCleared = getFieldStatus('maxTokenBudget', '', overriddenSnap);
  assert.equal(statusCleared.invalid, false);
  assert.equal(statusCleared.isDirty, true);

  // 8. String field: storagePath
  const statusStorage = getFieldStatus('storagePath', '  /custom/storage  ', baseSnap);
  assert.equal(statusStorage.invalid, false);
  assert.equal(statusStorage.isDirty, true);
});

test('computeSavePlan covers all 10 settings and generates correct writes for changes and unsets', () => {
  const snap = {
    value: {
      maxIterations: 50,
      autoDrive: false,
      enableSound: true,
      showQuickLaunchButton: true,
      consecutiveToolFailureLimit: 5,
      enableBrowserNotifications: true,
      maxTokenBudget: 100000,
      budgetWarningThreshold: 85,
      autoCheckpointOnMilestone: true,
      storagePath: '/custom/path',
    },
    base: { ...DEFAULT_SETTINGS },
    user: {
      maxIterations: 50,
      autoDrive: false,
      consecutiveToolFailureLimit: 5,
      maxTokenBudget: 100000,
      budgetWarningThreshold: 85,
      autoCheckpointOnMilestone: true,
      storagePath: '/custom/path',
    },
  };

  // Modify fields across all categories
  const draft = {
    maxIterations: '',
    autoDrive: true,
    enableSound: false,
    showQuickLaunchButton: false,
    consecutiveToolFailureLimit: '0',
    enableBrowserNotifications: false,
    maxTokenBudget: '200000',
    budgetWarningThreshold: '75',
    autoCheckpointOnMilestone: false,
    storagePath: '',
  };

  const writes = computeSavePlan(draft, snap);
  assert.deepEqual(writes, [
    ['maxIterations', undefined],
    ['autoDrive', true],
    ['enableSound', false],
    ['showQuickLaunchButton', false],
    ['consecutiveToolFailureLimit', 0],
    ['enableBrowserNotifications', false],
    ['maxTokenBudget', 200000],
    ['budgetWarningThreshold', 75],
    ['autoCheckpointOnMilestone', false],
    ['storagePath', undefined],
  ]);
});
