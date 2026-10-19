    // --- SETTINGS FORM LOGIC ---

    const DEFAULT_SETTINGS = {
      maxIterations: 25,
      autoDrive: true,
      enableSound: true,
      showQuickLaunchButton: true,
      consecutiveToolFailureLimit: 3,
      enableBrowserNotifications: true,
      maxTokenBudget: 0,
      budgetWarningThreshold: 80,
      autoCheckpointOnMilestone: false,
      storagePath: '',
    };

    const NUMERIC_FIELDS = {
      maxIterations: 1,
      consecutiveToolFailureLimit: 0,
      maxTokenBudget: 0,
      budgetWarningThreshold: 0,
    };

    function parseNumberField(raw, min = 1) {
      if (raw === '' || raw === null || raw === undefined) {
        return undefined;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < min || !Number.isInteger(n)) {
        return NaN;
      }
      return n;
    }

    function getFieldStatus(field, draftValue, snap) {
      const baseVal = snap?.base?.[field] ?? DEFAULT_SETTINGS[field];
      const userVal = snap?.user?.[field];
      const effectiveVal = snap?.value?.[field] ?? baseVal;

      const isOverridden = userVal !== undefined && userVal !== null;
      const currentVal = draftValue !== undefined ? draftValue : effectiveVal;

      let invalid = false;
      let isDirty = false;

      if (field in NUMERIC_FIELDS) {
        if (draftValue !== undefined) {
          if (draftValue === '') {
            invalid = false;
            isDirty = userVal !== undefined;
          } else {
            const min = NUMERIC_FIELDS[field];
            const parsed = parseNumberField(draftValue, min);
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

    function computeSavePlan(draft, snap) {
      if (!draft) return [];

      const fields = [
        'maxIterations',
        'autoDrive',
        'enableSound',
        'showQuickLaunchButton',
        'consecutiveToolFailureLimit',
        'enableBrowserNotifications',
        'maxTokenBudget',
        'budgetWarningThreshold',
        'autoCheckpointOnMilestone',
        'storagePath',
      ];

      const writes = [];

      for (const f of fields) {
        if (draft[f] === undefined) continue;

        const status = getFieldStatus(f, draft[f], snap);
        if (status.invalid) continue;

        if (status.isDirty) {
          if (f in NUMERIC_FIELDS) {
            if (draft[f] === '') {
              writes.push([f, undefined]);
            } else {
              writes.push([f, parseNumberField(draft[f], NUMERIC_FIELDS[f])]);
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

