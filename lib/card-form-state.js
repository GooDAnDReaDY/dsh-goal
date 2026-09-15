/**
 * Pure state and validation logic for dsh-goal settings form.
 * Independent from DOM/React, 100% testable via node --test.
 */

export const DEFAULT_SETTINGS = {
  maxIterations: 25,
  autoDrive: true,
  enableSound: true,
  showQuickLaunchButton: true,
  consecutiveToolFailureLimit: 3,
  enableBrowserNotifications: true,
  storagePath: '',
};

/**
 * Parse numeric settings field:
 * - empty string / null / undefined -> undefined (reset override)
 * - valid integer >= min -> number
 * - otherwise -> NaN (invalid)
 * @param {any} raw
 * @param {number} [min=1]
 * @returns {number|undefined}
 */
export function parseNumberField(raw, min = 1) {
  if (raw === '' || raw === null || raw === undefined) {
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || !Number.isInteger(n)) {
    return NaN;
  }
  return n;
}

/**
 * Compute status for a specific setting field
 * @param {string} field
 * @param {any} draftValue
 * @param {Object} snap - { value, base, user }
 */
export function getFieldStatus(field, draftValue, snap) {
  const baseVal = snap?.base?.[field] ?? DEFAULT_SETTINGS[field];
  const userVal = snap?.user?.[field];
  const effectiveVal = snap?.value?.[field] ?? baseVal;

  const isOverridden = userVal !== undefined && userVal !== null;
  const currentVal = draftValue !== undefined ? draftValue : effectiveVal;

  let invalid = false;
  let isDirty = false;

  if (field === 'maxIterations') {
    if (draftValue !== undefined) {
      if (draftValue === '') {
        invalid = false;
        isDirty = userVal !== undefined;
      } else {
        const parsed = parseNumberField(draftValue, 1);
        if (Number.isNaN(parsed)) {
          invalid = true;
          isDirty = true;
        } else {
          isDirty = parsed !== (userVal !== undefined ? userVal : baseVal);
        }
      }
    }
  } else if (field === 'consecutiveToolFailureLimit') {
    if (draftValue !== undefined) {
      if (draftValue === '') {
        invalid = false;
        isDirty = userVal !== undefined;
      } else {
        const parsed = parseNumberField(draftValue, 0);
        if (Number.isNaN(parsed)) {
          invalid = true;
          isDirty = true;
        } else {
          isDirty = parsed !== (userVal !== undefined ? userVal : baseVal);
        }
      }
    }
  } else if (field === 'storagePath') {
    if (draftValue !== undefined) {
      const cleanVal = typeof draftValue === 'string' ? draftValue.trim() : '';
      isDirty = cleanVal !== (userVal !== undefined ? userVal : (baseVal || ''));
    }
  } else {
    // boolean fields (autoDrive, enableSound, showQuickLaunchButton, enableBrowserNotifications)
    if (draftValue !== undefined) {
      isDirty = Boolean(draftValue) !== (userVal !== undefined ? Boolean(userVal) : Boolean(baseVal));
    }
  }

  return {
    value: currentVal,
    baseValue: baseVal,
    userValue: userVal,
    isOverridden,
    isDirty,
    invalid,
  };
}

/**
 * Compute list of key-value writes for scope.set
 * @param {Object|null} draft
 * @param {Object} snap - { value, base, user }
 * @returns {Array<[string, any]>}
 */
export function computeSavePlan(draft, snap) {
  if (!draft) return [];

  const writes = [];
  const fields = [
    'maxIterations',
    'autoDrive',
    'enableSound',
    'showQuickLaunchButton',
    'consecutiveToolFailureLimit',
    'enableBrowserNotifications',
    'storagePath',
  ];

  for (const f of fields) {
    if (draft[f] === undefined) continue;

    const status = getFieldStatus(f, draft[f], snap);
    if (status.invalid) continue;

    if (status.isDirty) {
      if (f === 'maxIterations') {
        if (draft[f] === '') {
          writes.push([f, undefined]);
        } else {
          writes.push([f, parseNumberField(draft[f], 1)]);
        }
      } else if (f === 'consecutiveToolFailureLimit') {
        if (draft[f] === '') {
          writes.push([f, undefined]);
        } else {
          writes.push([f, parseNumberField(draft[f], 0)]);
        }
      } else if (f === 'storagePath') {
        const clean = typeof draft[f] === 'string' ? draft[f].trim() : '';
        writes.push([f, clean ? clean : undefined]);
      } else {
        writes.push([f, Boolean(draft[f])]);
      }
    }
  }

  return writes;
}
