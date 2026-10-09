    // --- SETTINGS CARD ---

    function GoalSettingsCard(props) {

      const { scope, ctx } = props || {};

      const [isOpen, setIsOpen] = useState(false);

      const [draft, setDraft] = useState(null);

      const [saving, setSaving] = useState(false);

      const [failed, setFailed] = useState(false);

      const [updateState, setUpdateState] = useState({
        checking: false,
        updating: false,
        currentVersion: '',
        latestVersion: '',
        updateAvailable: false,
        notice: '',
        error: '',
      });

      const checkUpdate = useCallback(async () => {
        setUpdateState((s) => ({ ...s, checking: true, error: '' }));
        try {
          const res = await fetch('/api/dsh-goal/update');
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json().catch(() => ({}));
          setUpdateState((s) => ({
            ...s,
            checking: false,
            currentVersion: data.currentVersion || s.currentVersion,
            latestVersion: data.latestVersion || '',
            updateAvailable: Boolean(data.updateAvailable),
          }));
        } catch (err) {
          setUpdateState((s) => ({ ...s, checking: false }));
        }
      }, []);

      const handleTriggerUpdate = async () => {
        if (updateState.updating) return;
        setUpdateState((s) => ({ ...s, updating: true, error: '', notice: '' }));
        try {
          const res = await fetch('/api/dsh-goal/update', {
            method: 'POST',
            headers: { 'x-dsh-plugin-update': '1' },
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.ok === false || data.error) {
            throw new Error(data.error || ('HTTP ' + res.status));
          }
          const newVer = data.version || updateState.latestVersion || updateState.currentVersion;
          setUpdateState((s) => ({
            ...s,
            updating: false,
            updateAvailable: false,
            currentVersion: newVer,
            notice: (typeof t === 'function' ? t('updateDone') : null) || `Updated to ${newVer}. Please restart DSH to apply.`,
          }));
        } catch (e) {
          setUpdateState((s) => ({
            ...s,
            updating: false,
            error: ((typeof t === 'function' ? t('updateFailed') : null) || 'Update failed: ') + (e && e.message || String(e)),
          }));
        }
      };

      useEffect(() => {
        if (isOpen) {
          checkUpdate();
        }
      }, [isOpen, checkUpdate]);


      const [snap, setSnap] = useState(() => (scope && typeof scope.getSnapshot === 'function' ? scope.getSnapshot() : null));

      useEffect(() => {

        injectStylesOnce();

      }, []);

      useEffect(() => {

        if (!scope || typeof scope.subscribe !== 'function') return;

        return scope.subscribe((next) => {

          setSnap(next || scope.getSnapshot());

        });

      }, [scope]);

      const resolveLocale = () => {

        let active = 'en';

        if (ctx?.locale?.getSnapshot) {

          const snapLoc = ctx.locale.getSnapshot();

          if (snapLoc?.active) {

            const code = snapLoc.active.toLowerCase();

            if (code.startsWith('zh')) active = 'zh';

            else active = 'en';

          }

        } else if (typeof navigator !== 'undefined' && navigator.language) {

          const code = navigator.language.toLowerCase();

          if (code.startsWith('zh')) active = 'zh';

          else active = 'en';

        }

        return active;

      };

      const t = (key) => {

        const active = resolveLocale();

        return LOCALES[active]?.[key] || LOCALES.en[key] || key;

      };

      const status = snap ? (snap.status || 'ready') : (scope ? 'loading' : 'unavailable');

      const maxIterStatus = getFieldStatus('maxIterations', draft?.maxIterations, snap);

      const autoDriveStatus = getFieldStatus('autoDrive', draft?.autoDrive, snap);

      const enableSoundStatus = getFieldStatus('enableSound', draft?.enableSound, snap);

      const quickLaunchStatus = getFieldStatus('showQuickLaunchButton', draft?.showQuickLaunchButton, snap);

      const toolFailStatus = getFieldStatus('consecutiveToolFailureLimit', draft?.consecutiveToolFailureLimit, snap);

      const notifStatus = getFieldStatus('enableBrowserNotifications', draft?.enableBrowserNotifications, snap);

      const budgetStatus = getFieldStatus('maxTokenBudget', draft?.maxTokenBudget, snap);

      const budgetWarnStatus = getFieldStatus('budgetWarningThreshold', draft?.budgetWarningThreshold, snap);

      const autoCheckpointStatus = getFieldStatus('autoCheckpointOnMilestone', draft?.autoCheckpointOnMilestone, snap);

      const dirty = maxIterStatus.isDirty || autoDriveStatus.isDirty || enableSoundStatus.isDirty || quickLaunchStatus.isDirty || toolFailStatus.isDirty || notifStatus.isDirty || budgetStatus.isDirty || budgetWarnStatus.isDirty || autoCheckpointStatus.isDirty;

      const invalid = maxIterStatus.invalid || toolFailStatus.invalid || budgetStatus.invalid || budgetWarnStatus.invalid;

      const disabled = !scope || saving || snap?.writable === false;

      const edit = (field, val) => {

        setFailed(false);

        setDraft((prev) => ({

          maxIterations: prev?.maxIterations !== undefined ? prev.maxIterations : maxIterStatus.value,

          autoDrive: prev?.autoDrive !== undefined ? prev.autoDrive : autoDriveStatus.value,

          enableSound: prev?.enableSound !== undefined ? prev.enableSound : enableSoundStatus.value,

          showQuickLaunchButton: prev?.showQuickLaunchButton !== undefined ? prev.showQuickLaunchButton : quickLaunchStatus.value,

          consecutiveToolFailureLimit: prev?.consecutiveToolFailureLimit !== undefined ? prev.consecutiveToolFailureLimit : toolFailStatus.value,

          enableBrowserNotifications: prev?.enableBrowserNotifications !== undefined ? prev.enableBrowserNotifications : notifStatus.value,

          maxTokenBudget: prev?.maxTokenBudget !== undefined ? prev.maxTokenBudget : budgetStatus.value,

          budgetWarningThreshold: prev?.budgetWarningThreshold !== undefined ? prev.budgetWarningThreshold : budgetWarnStatus.value,

          autoCheckpointOnMilestone: prev?.autoCheckpointOnMilestone !== undefined ? prev.autoCheckpointOnMilestone : autoCheckpointStatus.value,

          [field]: val,

        }));

      };

      const resetFieldToDefault = (field) => {
        if (field in NUMERIC_FIELDS) {
          edit(field, '');
        } else {
          edit(field, snap?.base?.[field] ?? DEFAULT_SETTINGS[field]);
        }
      };

      const save = async () => {

        if (!scope || !dirty || invalid) return;

        setSaving(true);

        setFailed(false);

        const writes = computeSavePlan(draft, snap);

        let landed = true;

        for (const [field, fieldValue] of writes) {

          try {

            await scope.set(field, fieldValue);

          } catch (err) {

            console.error('[dsh-goal] failed to save setting', field, err);

            landed = false;

          }

        }

        const fresh = scope.getSnapshot();

        const user = fresh.user || {};

        for (const [field, fieldValue] of writes) {

          if (fieldValue === undefined) {

            if (user[field] !== undefined) landed = false;

          } else {

            if (user[field] !== fieldValue) landed = false;

          }

        }

        setSnap(fresh);

        setSaving(false);

        if (landed) {

          setDraft(null);

        } else {

          setFailed(true);

        }

      };

      const Chevron = (Primitives && Primitives.IconChevronDownOutline14) || IconChevronDown;

      // Row seat (plugins.row.config): the host page draws title/icon/crumb and the
      // padding, so the summary is a one-liner and the page drops our card chrome.
      if (props && props.view === 'summary') {
        return React.createElement('span', { className: 'dsh-goal-sub' }, t('cardSubtitle') || 'Goal tracking with checkpoints and subgoals');
      }
      const page = !!(props && props.view === 'page');

      return React.createElement(

        page ? 'div' : 'li',

        { className: page ? 'dsh-goal-page' : 'dsh-goal-card' },

        React.createElement(

          'button',

          {

            className: 'dsh-goal-card-head',

            style: page ? { display: 'none' } : undefined,

            onClick: () => setIsOpen(!isOpen),

            'aria-expanded': page ? true : isOpen,

          },

          React.createElement(

            'div',

            { style: { flex: 1 } },

            React.createElement('div', { className: 'dsh-goal-card-title' }, t('pluginTitle') || 'Goal Mode & Autonomous Loop'),

            React.createElement('div', { className: 'dsh-goal-card-sub' }, t('pluginDesc') || 'Goal banner above composer dock, milestone decomposition, and auto-drive'),

          ),

          React.createElement(Chevron, { className: `dsh-goal-chev ${isOpen ? 'dsh-goal-chev-open' : ''}` }),

        ),

        isOpen

          ? React.createElement(

              'div',

              { className: 'dsh-goal-card-body' },

              status === 'loading'

                ? React.createElement('p', { className: 'dsh-goal-field-hint', style: { padding: '12px 0' } }, t('loading') || 'Loading settings…')

                : status !== 'ready'

                  ? React.createElement('p', { className: 'dsh-goal-foot-note', style: { padding: '12px 0' } }, t('unavailable') || 'Settings unavailable')

                  : React.createElement(

                      React.Fragment,

                      null,

                      React.createElement(
                        'div',
                        {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 0',
                            borderBottom: '1px solid var(--dsw-alias-border-l1)',
                            marginBottom: '12px',
                          },
                        },
                        React.createElement(
                          'div',
                          { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                          React.createElement('span', { style: { fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' } }, t('version') || 'Version'),
                          React.createElement('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, updateState.currentVersion ? 'v' + updateState.currentVersion : 'v0.2.12'),
                          updateState.updateAvailable
                            ? React.createElement('span', { className: 'dsh-goal-badge dsh-goal-badge-warn', style: { fontSize: 11 } }, 'v' + updateState.latestVersion + ' ' + (t('updateAvailable') || 'available'))
                            : React.createElement('span', { className: 'dsh-goal-badge dsh-goal-badge-ok', style: { fontSize: 11 } }, '✓ ' + (t('upToDate') || 'Up to date')),
                        ),
                        updateState.updateAvailable
                          ? React.createElement(
                              'button',
                              {
                                type: 'button',
                                className: 'dsh-goal-btn dsh-goal-btn-primary',
                                disabled: updateState.updating,
                                onClick: handleTriggerUpdate,
                                style: { padding: '4px 10px', fontSize: 12 },
                              },
                              updateState.updating ? (t('updating') || 'Updating…') : (t('updateBtn') || 'Update'),
                            )
                          : React.createElement(
                              'button',
                              {
                                type: 'button',
                                className: 'dsh-goal-discard',
                                disabled: updateState.checking,
                                onClick: checkUpdate,
                                style: { padding: '4px 10px', fontSize: 12 },
                              },
                              updateState.checking ? (t('checking') || 'Checking…') : (t('checkUpdate') || 'Check update'),
                            ),
                      ),
                      updateState.notice ? React.createElement('div', { className: 'dsh-goal-foot-note', style: { color: 'var(--dsw-alias-state-success-primary)', padding: '6px 0' } }, '✓ ' + updateState.notice) : null,
                      updateState.error ? React.createElement('div', { className: 'dsh-goal-foot-note', style: { color: 'var(--dsw-alias-state-error-primary)', padding: '6px 0' } }, '⚠ ' + updateState.error) : null,

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-card-field' },

                        React.createElement(

                          'div',

                          { className: 'dsh-goal-field-label-row' },

                          React.createElement('label', { htmlFor: 'dsh-goal-max-iter' }, t('maxIterLabel') || 'Max iterations (Safety Limit):'),

                          React.createElement(

                            'div',

                            { className: 'dsh-goal-field-meta' },

                            maxIterStatus.isOverridden

                              ? React.createElement('span', { className: 'dsh-goal-override-tag' }, t('overridden') || 'overridden')

                              : null,

                            maxIterStatus.isOverridden

                              ? React.createElement(

                                  'button',

                                  {

                                    type: 'button',

                                    className: 'dsh-goal-btn-inline-reset',

                                    title: t('resetField') || 'Reset to default',

                                    onClick: () => resetFieldToDefault('maxIterations'),

                                  },

                                  React.createElement(IconRotateCcw, { size: 12 }),

                                  t('resetField') || 'Default',

                                )

                              : null,

                          ),

                        ),

                        React.createElement('input', {

                          id: 'dsh-goal-max-iter',

                          type: 'number',

                          min: 1,

                          placeholder: String(maxIterStatus.baseValue),

                          className: 'dsh-goal-card-input',

                          value: maxIterStatus.value !== undefined ? maxIterStatus.value : '',

                          disabled,

                          'aria-invalid': invalid,

                          onChange: (e) => edit('maxIterations', e.target.value),

                        }),

                      ),

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-check-row' },

                        React.createElement(

                          'label',

                          { className: 'dsh-goal-check' },

                          React.createElement('input', {

                            type: 'checkbox',

                            checked: autoDriveStatus.value === true,

                            disabled,

                            onChange: (e) => edit('autoDrive', e.target.checked),

                          }),

                          t('autoDriveLabel') || 'Auto-drive: keep the loop running automatically',

                        ),

                        autoDriveStatus.isOverridden

                          ? React.createElement(

                              'button',

                              {

                                type: 'button',

                                className: 'dsh-goal-btn-inline-reset',

                                title: t('resetField') || 'Reset to default',

                                onClick: () => resetFieldToDefault('autoDrive'),

                              },

                              React.createElement(IconRotateCcw, { size: 12 }),

                            )

                          : null,

                      ),

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-check-row' },

                        React.createElement(

                          'label',

                          { className: 'dsh-goal-check' },

                          React.createElement('input', {

                            type: 'checkbox',

                            checked: enableSoundStatus.value === true,

                            disabled,

                            onChange: (e) => edit('enableSound', e.target.checked),

                          }),

                          t('soundLabel') || 'Sound when a goal completes',

                        ),

                        enableSoundStatus.isOverridden

                          ? React.createElement(

                              'button',

                              {

                                type: 'button',

                                className: 'dsh-goal-btn-inline-reset',

                                title: t('resetField') || 'Reset to default',

                                onClick: () => resetFieldToDefault('enableSound'),

                              },

                              React.createElement(IconRotateCcw, { size: 12 }),

                            )

                          : null,

                      ),

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-check-row' },

                        React.createElement(

                          'label',

                          { className: 'dsh-goal-check' },

                          React.createElement('input', {

                            type: 'checkbox',

                            checked: quickLaunchStatus.value !== false,

                            disabled,

                            onChange: (e) => edit('showQuickLaunchButton', e.target.checked),

                          }),

                          t('quickLaunchLabel') || 'Quick launch goal button above composer dock',

                        ),

                        quickLaunchStatus.isOverridden

                          ? React.createElement(

                              'button',

                              {

                                type: 'button',

                                className: 'dsh-goal-btn-inline-reset',

                                title: t('resetField') || 'Reset to default',

                                onClick: () => resetFieldToDefault('showQuickLaunchButton'),

                              },

                              React.createElement(IconRotateCcw, { size: 12 }),

                            )

                          : null,

                      ),

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-card-field' },

                        React.createElement(

                          'div',

                          { className: 'dsh-goal-field-label-row' },

                          React.createElement('label', { htmlFor: 'dsh-goal-tool-fail' }, t('toolFailLabel') || 'Tool-Failure Breaker Limit:'),

                          React.createElement(

                            'div',

                            { className: 'dsh-goal-field-meta' },

                            toolFailStatus.isOverridden

                              ? React.createElement('span', { className: 'dsh-goal-override-tag' }, t('overridden') || 'overridden')

                              : null,

                            toolFailStatus.isOverridden

                              ? React.createElement(

                                  'button',

                                  {

                                    type: 'button',

                                    className: 'dsh-goal-btn-inline-reset',

                                    title: t('resetField') || 'Reset to default',

                                    onClick: () => resetFieldToDefault('consecutiveToolFailureLimit'),

                                  },

                                  React.createElement(IconRotateCcw, { size: 12 }),

                                  t('resetField') || 'Default',

                                )

                              : null,

                          ),

                        ),

                        React.createElement('input', {

                          id: 'dsh-goal-tool-fail',

                          type: 'number',

                          min: 0,

                          placeholder: String(toolFailStatus.baseValue),

                          value: toolFailStatus.value !== undefined ? String(toolFailStatus.value) : '',

                          disabled,

                          className: 'dsh-goal-card-input',

                          onChange: (e) => edit('consecutiveToolFailureLimit', e.target.value),

                        }),

                        React.createElement(

                          'p',

                          { className: 'dsh-goal-field-hint' },

                          t('toolFailHint') || 'Auto-pause goal if N consecutive turns hit tool execution errors (0 to disable)',

                        ),

                      ),

                      React.createElement(
                        'div',
                        { className: 'dsh-goal-card-field' },
                        React.createElement(
                          'div',
                          { className: 'dsh-goal-field-label-row' },
                          React.createElement('label', { htmlFor: 'dsh-goal-token-budget' }, t('budgetLabel') || 'Token Budget (0 for unlimited):'),
                          React.createElement(
                            'div',
                            { className: 'dsh-goal-field-meta' },
                            budgetStatus.isOverridden
                              ? React.createElement('span', { className: 'dsh-goal-override-tag' }, t('overridden') || 'overridden')
                              : null,
                            budgetStatus.isOverridden
                              ? React.createElement(
                                  'button',
                                  {
                                    type: 'button',
                                    className: 'dsh-goal-btn-inline-reset',
                                    title: t('resetField') || 'Reset to default',
                                    onClick: () => resetFieldToDefault('maxTokenBudget'),
                                  },
                                  React.createElement(IconRotateCcw, { size: 12 }),
                                  t('resetField') || 'Default'
                                )
                              : null
                          )
                        ),
                        React.createElement('input', {
                          id: 'dsh-goal-token-budget',
                          type: 'number',
                          min: 0,
                          step: 10000,
                          placeholder: String(budgetStatus.baseValue),
                          value: budgetStatus.value !== undefined ? String(budgetStatus.value) : '',
                          disabled,
                          className: 'dsh-goal-card-input',
                          onChange: (e) => edit('maxTokenBudget', e.target.value),
                        })
                      ),

                      React.createElement(
                        'div',
                        { className: 'dsh-goal-card-field' },
                        React.createElement(
                          'div',
                          { className: 'dsh-goal-field-label-row' },
                          React.createElement('label', { htmlFor: 'dsh-goal-warn-thresh' }, t('budgetWarnLabel') || 'Budget Warning Threshold (%):'),
                          React.createElement(
                            'div',
                            { className: 'dsh-goal-field-meta' },
                            budgetWarnStatus.isOverridden
                              ? React.createElement('span', { className: 'dsh-goal-override-tag' }, t('overridden') || 'overridden')
                              : null,
                            budgetWarnStatus.isOverridden
                              ? React.createElement(
                                  'button',
                                  {
                                    type: 'button',
                                    className: 'dsh-goal-btn-inline-reset',
                                    title: t('resetField') || 'Reset to default',
                                    onClick: () => resetFieldToDefault('budgetWarningThreshold'),
                                  },
                                  React.createElement(IconRotateCcw, { size: 12 }),
                                  t('resetField') || 'Default'
                                )
                              : null
                          )
                        ),
                        React.createElement('input', {
                          id: 'dsh-goal-warn-thresh',
                          type: 'number',
                          min: 10,
                          max: 100,
                          placeholder: String(budgetWarnStatus.baseValue),
                          value: budgetWarnStatus.value !== undefined ? String(budgetWarnStatus.value) : '',
                          disabled,
                          className: 'dsh-goal-card-input',
                          onChange: (e) => edit('budgetWarningThreshold', e.target.value),
                        })
                      ),

                      React.createElement(
                        'div',
                        { className: 'dsh-goal-check-row' },
                        React.createElement('input', {
                          id: 'dsh-goal-auto-checkpoint',
                          type: 'checkbox',
                          checked: Boolean(autoCheckpointStatus.value),
                          disabled,
                          onChange: (e) => edit('autoCheckpointOnMilestone', e.target.checked),
                        }),
                        React.createElement('label', { htmlFor: 'dsh-goal-auto-checkpoint' }, t('autoCheckpointLabel') || 'Auto-create Git checkpoint on milestone completed')
                      ),

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-check-row' },

                        React.createElement(

                          'label',

                          { className: 'dsh-goal-check' },

                          React.createElement('input', {

                            type: 'checkbox',

                            checked: notifStatus.value !== false,

                            disabled,

                            onChange: (e) => {

                              edit('enableBrowserNotifications', e.target.checked);

                              if (e.target.checked && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {

                                Notification.requestPermission();

                              }

                            },

                          }),

                          t('notifLabel') || 'Native browser desktop notifications on completion',

                        ),

                        notifStatus.isOverridden

                          ? React.createElement(

                              'button',

                              {

                                type: 'button',

                                className: 'dsh-goal-btn-inline-reset',

                                title: t('resetField') || 'Reset to default',

                                onClick: () => resetFieldToDefault('enableBrowserNotifications'),

                              },

                              React.createElement(IconRotateCcw, { size: 12 }),

                            )

                          : null,

                      ),

                      React.createElement(

                        'div',

                        { className: 'dsh-goal-foot' },

                        failed

                          ? React.createElement('span', { className: 'dsh-goal-foot-note' }, t('saveFailed') || 'Not saved — fix the values and try again')

                          : null,

                        React.createElement(

                          'button',

                          {

                            className: 'dsh-goal-discard',

                            disabled: !dirty || disabled,

                            onClick: () => {

                              setFailed(false);

                              setDraft(null);

                            },

                          },

                          t('discard') || 'Discard changes',

                        ),

                        React.createElement(

                          'button',

                          { className: 'dsh-goal-save', disabled: !dirty || disabled || invalid, onClick: save },

                          saving ? (t('saving') || 'Saving…') : (t('save') || 'Save'),

                        ),

                      ),

                    ),

            )

          : null,

      );

    }

