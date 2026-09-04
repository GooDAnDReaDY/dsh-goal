import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumberField, getFieldStatus, computeSavePlan, DEFAULT_SETTINGS } from '../lib/card-form-state.js';

test('parseNumberField parses positive integers, clears on empty string, rejects invalid', () => {
  assert.equal(parseNumberField('25'), 25);
  assert.equal(parseNumberField('1'), 1);
  assert.equal(parseNumberField(50), 50);

  // Empty string / null / undefined -> undefined (unset / reset override)
  assert.equal(parseNumberField(''), undefined);
  assert.equal(parseNumberField(null), undefined);
  assert.equal(parseNumberField(undefined), undefined);

  // Invalid numbers -> NaN
  assert.ok(Number.isNaN(parseNumberField('0')));
  assert.ok(Number.isNaN(parseNumberField('-5')));
  assert.ok(Number.isNaN(parseNumberField('abc')));
  assert.ok(Number.isNaN(parseNumberField('12.34')));
});

test('getFieldStatus computes status, dirty, invalid and overridden flags accurately', () => {
  const baseSnap = {
    value: { maxIterations: 25, autoDrive: true, enableSound: true },
    base: { maxIterations: 25, autoDrive: true, enableSound: true },
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

  // 4. Overridden field in user settings
  const overriddenSnap = {
    value: { maxIterations: 50, autoDrive: false, enableSound: true },
    base: { maxIterations: 25, autoDrive: true, enableSound: true },
    user: { maxIterations: 50, autoDrive: false },
  };

  const statusOverridden = getFieldStatus('maxIterations', undefined, overriddenSnap);
  assert.equal(statusOverridden.value, 50);
  assert.equal(statusOverridden.isOverridden, true);
  assert.equal(statusOverridden.isDirty, false);

  // 5. Clearing an overridden field via empty string resets override
  const statusCleared = getFieldStatus('maxIterations', '', overriddenSnap);
  assert.equal(statusCleared.invalid, false);
  assert.equal(statusCleared.isDirty, true);
});

test('computeSavePlan generates correct writes for changes and unsets', () => {
  const snap = {
    value: { maxIterations: 50, autoDrive: false, enableSound: true },
    base: { maxIterations: 25, autoDrive: true, enableSound: true },
    user: { maxIterations: 50, autoDrive: false },
  };

  // Draft with maxIterations cleared (reset to base) and autoDrive set to true (base)
  const draft = {
    maxIterations: '',
    autoDrive: true,
    enableSound: true,
  };

  const writes = computeSavePlan(draft, snap);
  // maxIterations: undefined (to unset override)
  // autoDrive: true
  assert.deepEqual(writes, [
    ['maxIterations', undefined],
    ['autoDrive', true],
  ]);
});
