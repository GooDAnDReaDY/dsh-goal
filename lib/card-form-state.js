/**
 * Чистая логика состояния и валидации формы настроек dsh-goal.
 * Не зависит от DOM/React, полностью тестируема через node --test.
 */

export const DEFAULT_SETTINGS = {
  maxIterations: 25,
  autoDrive: true,
  enableSound: true,
};

/**
 * Парсинг числового значения настроек:
 * - пустая строка / null / undefined -> undefined (сброс к базовому значению)
 * - валидное число >= 1 -> number
 * - иначе -> NaN (invalid)
 */
export function parseNumberField(raw) {
  if (raw === '' || raw === null || raw === undefined) {
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    return NaN;
  }
  return n;
}

/**
 * Вычисление состояния конкретного поля:
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
        // Пустая строка = сброс к базовому значению (не ошибка)
        invalid = false;
        isDirty = userVal !== undefined; // dirty если было переопределено
      } else {
        const parsed = parseNumberField(draftValue);
        if (Number.isNaN(parsed)) {
          invalid = true;
          isDirty = true;
        } else {
          isDirty = parsed !== (userVal !== undefined ? userVal : baseVal);
        }
      }
    }
  } else {
    // boolean fields (autoDrive, enableSound)
    if (draftValue !== undefined) {
      isDirty = draftValue !== (userVal !== undefined ? userVal : baseVal);
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
 * Вычисление списка операций записи (writes) для scope.set:
 * @param {Object|null} draft
 * @param {Object} snap - { value, base, user }
 * @returns {Array<[string, any]>}
 */
export function computeSavePlan(draft, snap) {
  if (!draft) return [];

  const writes = [];
  const fields = ['maxIterations', 'autoDrive', 'enableSound'];

  for (const f of fields) {
    if (draft[f] === undefined) continue;

    const status = getFieldStatus(f, draft[f], snap);
    if (status.invalid) continue;

    if (status.isDirty) {
      if (f === 'maxIterations' && draft[f] === '') {
        // Сброс переопределения
        writes.push([f, undefined]);
      } else if (f === 'maxIterations') {
        writes.push([f, parseNumberField(draft[f])]);
      } else {
        writes.push([f, Boolean(draft[f])]);
      }
    }
  }

  return writes;
}
