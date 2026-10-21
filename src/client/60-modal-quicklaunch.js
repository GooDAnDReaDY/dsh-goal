    // --- QUICK LAUNCH MODAL ---

    function QuickLaunchModal({ onClose, onStart, t }) {

      const [title, setTitle] = useState('');
      const [launchMode, setLaunchMode] = useState('act');
      const [activeQuickTpl, setActiveQuickTpl] = useState(null);
      const [quickTplVars, setQuickTplVars] = useState({});
      const [showTemplates, setShowTemplates] = useState(false);
      const [backendTemplates, setBackendTemplates] = useState([]);
      const [selectedTpl, setSelectedTpl] = useState(null);
      const [tplInputs, setTplInputs] = useState({});
      const [loadingTpls, setLoadingTpls] = useState(false);

      const inputRef = useRef(null);

      useEffect(() => {
        if (showTemplates && backendTemplates.length === 0) {
          setLoadingTpls(true);
          fetch('/dsh-goal/templates')
            .then((r) => r.json())
            .then((d) => {
              if (d && Array.isArray(d.templates)) {
                setBackendTemplates(d.templates);
              }
            })
            .catch((err) => { console.warn('[dsh-goal] Fetch templates error:', err); })
            .finally(() => setLoadingTpls(false));
        }
      }, [showTemplates, backendTemplates.length]);

      const handleApplyTemplate = async () => {
        if (!selectedTpl) return;
        try {
          const res = await fetch('/dsh-goal/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'instantiate_template',
              templateId: selectedTpl.id,
              inputs: tplInputs,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.ok && data.template) {
              setTitle(data.template.title);
              setShowTemplates(false);
            }
          }
        } catch (err) { console.warn('[dsh-goal] Apply template error:', err); }
      };

      useEffect(() => {

        if (inputRef.current) inputRef.current.focus();

      }, []);

      const handleSubmit = (e) => {

        if (e) e.preventDefault();

        const trimmed = title.trim();

        if (trimmed) {

          onStart(trimmed, { mode: launchMode });

        }

      };

      return React.createElement(

        'div',

        { className: 'dsh-goal-modal-overlay', onClick: onClose },

        React.createElement(

          'div',

          {

            className: 'dsh-goal-modal',

            style: { maxWidth: 480 },

            onClick: (e) => e.stopPropagation(),

          },

          React.createElement(

            'div',

            { className: 'dsh-goal-modal-head' },

            React.createElement(

              'div',

              { className: 'dsh-goal-modal-title' },

              React.createElement(IconTarget, { size: 18 }),

              t('quickLaunchTitle') || 'Quick Launch Goal',

            ),

            React.createElement(

              'button',

              { className: 'dsh-goal-btn icon-only close', onClick: onClose, title: t('close') || 'Close' },

              '✕',

            ),

          ),

          React.createElement(

            'form',

            { onSubmit: handleSubmit },

            React.createElement(

              'div',

              { className: 'dsh-goal-modal-body' },

              React.createElement(

                'div',

                { style: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8 } },

                t('quickLaunchDesc') || 'Define the objective for the agent in autonomous mode:',

              ),

              React.createElement(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
                React.createElement('span', { style: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' } }, t('launchModeLabel') || 'Mode:'),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: `dsh-goal-chip-btn ${launchMode === 'act' ? 'active' : ''}`,
                    style: launchMode === 'act' ? { fontWeight: 600, borderColor: 'var(--dsw-alias-state-success-primary)', color: 'var(--dsw-alias-state-success-primary)' } : {},
                    onClick: () => setLaunchMode('act'),
                    title: t('actModeDesc') || 'Direct execution right away',
                  },
                  '⚡ ' + (t('actMode') || 'Act Mode')
                ),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: `dsh-goal-chip-btn ${launchMode === 'plan' ? 'active' : ''}`,
                    style: launchMode === 'plan' ? { fontWeight: 600, borderColor: 'var(--dsw-alias-brand-primary)', color: 'var(--dsw-alias-brand-primary)' } : {},
                    onClick: () => setLaunchMode('plan'),
                    title: t('planModeDesc') || 'Plan first, review milestones, then execute',
                  },
                  '📋 ' + (t('planMode') || 'Plan Mode')
                )
              ),

              React.createElement(

                'div',

                { className: 'dsh-goal-template-chips' },

                QUICK_LAUNCH_TEMPLATES.map((tmpl) => {

                  const lang = t('localeCode') || 'en';

                  const label = tmpl.label[lang] || tmpl.label.en;

                  const prefix = tmpl.prefix[lang] || tmpl.prefix.en;

                  return React.createElement(

                    'button',

                    {

                      key: tmpl.id,

                      type: 'button',

                      className: `dsh-goal-template-chip ${activeQuickTpl?.id === tmpl.id ? 'active' : ''}`,
                      style: activeQuickTpl?.id === tmpl.id ? { borderColor: 'var(--dsw-alias-brand-primary)', fontWeight: 600 } : {},

                      title: prefix,

                      onClick: () => {
                        const isSelected = activeQuickTpl?.id === tmpl.id;
                        if (isSelected) {
                          setActiveQuickTpl(null);
                          setQuickTplVars({});
                        } else {
                          setActiveQuickTpl(tmpl);
                          const initial = {};
                          (tmpl.variables || []).forEach((v) => { initial[v.id] = ""; });
                          setQuickTplVars(initial);
                          const generated = typeof formatQuickLaunchPrompt === "function"
                            ? formatQuickLaunchPrompt(tmpl, initial, lang)
                            : prefix;
                          setTitle(generated || prefix);
                        }
                        if (inputRef.current) inputRef.current.focus();
                      },

                    },

                    `${tmpl.icon} ${label}`,

                  );

                }),

              ),

              activeQuickTpl?.variables && activeQuickTpl.variables.length > 0
                ? React.createElement(
                    'div',
                    {
                      className: 'dsh-goal-tpl-vars-box',
                      style: {
                        background: 'var(--dsw-alias-bg-sunken)',
                        border: '1px solid var(--dsw-alias-border-l1)',
                        borderRadius: 6,
                        padding: '8px 10px',
                        marginBottom: 10,
                      },
                    },
                    React.createElement(
                      'div',
                      {
                        style: {
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--dsw-alias-label-secondary)',
                          marginBottom: 6,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        },
                      },
                      React.createElement('span', null, `${activeQuickTpl.icon} ${activeQuickTpl.label[lang] || activeQuickTpl.label.en} ${t('quickTplVariablesTitle') || 'Parameters:'}`),
                      React.createElement(
                        'button',
                        {
                          type: 'button',
                          className: 'dsh-goal-btn icon-only',
                          style: { fontSize: 10, padding: '2px 4px', height: 'auto' },
                          onClick: () => { setActiveQuickTpl(null); setQuickTplVars({}); },
                        },
                        '✕'
                      )
                    ),
                    activeQuickTpl.variables.map((v) => {
                      const vLabel = v.label ? (v.label[lang] || v.label.en) : v.id;
                      return React.createElement(
                        'div',
                        { key: v.id, style: { marginBottom: 6 } },
                        React.createElement(
                          'label',
                          { style: { fontSize: 11, display: 'block', color: 'var(--dsw-alias-label-primary)', marginBottom: 2 } },
                          vLabel,
                          v.required ? React.createElement('span', { style: { color: 'var(--dsw-alias-state-danger-primary)', marginLeft: 3 } }, '*') : null
                        ),
                        React.createElement('input', {
                          type: 'text',
                          className: 'dsh-goal-card-input',
                          style: { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 8px' },
                          placeholder: v.placeholder || '',
                          value: quickTplVars[v.id] || '',
                          onChange: (e) => {
                            const updated = { ...quickTplVars, [v.id]: e.target.value };
                            setQuickTplVars(updated);
                            const generated = typeof formatQuickLaunchPrompt === 'function'
                              ? formatQuickLaunchPrompt(activeQuickTpl, updated, lang)
                              : activeQuickTpl.prefix[lang] || activeQuickTpl.prefix.en;
                            setTitle(generated);
                          },
                        })
                      );
                    })
                  )
                : null,

              React.createElement('input', {

                ref: inputRef,

                type: 'text',

                className: 'dsh-goal-card-input',

                style: { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px' },

                placeholder: t('quickLaunchPlaceholder') || 'e.g. Implement report export and cover with unit tests...',

                value: title,

                onChange: (e) => setTitle(e.target.value),

                onKeyDown: (e) => {

                  if (e.key === 'Enter' && !e.shiftKey) {

                    e.preventDefault();

                    handleSubmit();

                  }

                },

              }),

              React.createElement(
                'div',
                { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 } },
                [
                  { id: 'quickfix', label: '⚡ Quick Fix', template: 'Fix issue: ' },
                  { id: 'feature', label: '✨ Feature', template: 'Implement feature: ' },
                  { id: 'refactor', label: '♻️ Refactor', template: 'Refactor module: ' },
                  { id: 'repro', label: '🐛 Bug Repro', template: 'Reproduce and resolve bug: ' },
                  { id: 'audit', label: '🔍 Audit', template: 'Deep audit codebase: ' },
                  { id: 'security', label: '🛡️ Security', template: 'Security hardening for: ' },
                ].map((tpl) =>
                  React.createElement(
                    'button',
                    {
                      key: tpl.id,
                      type: 'button',
                      className: 'dsh-goal-chip-btn',
                      onClick: () => setTitle(tpl.template),
                    },
                    tpl.label
                  )
                ),
                React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-goal-chip-btn',
                    style: { fontWeight: 600, borderColor: 'var(--dsw-alias-border-brand, var(--dsw-alias-border-l2))' },
                    onClick: () => setShowTemplates(!showTemplates),
                  },
                  (showTemplates ? '▲ ' : '▼ ') + '📋 ' + (t('templatesTitle') || 'Engineering Templates')
                )
              ),
              showTemplates
                ? React.createElement(
                    'div',
                    {
                      style: {
                        marginTop: 10,
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: '1px solid var(--dsw-alias-border-l1)',
                        background: 'var(--dsw-alias-bg-hover)',
                      },
                    },
                    loadingTpls
                      ? React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, 'Loading templates…')
                      : React.createElement(
                          'div',
                          null,
                          React.createElement(
                            'div',
                            { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 } },
                            backendTemplates.map((bt) =>
                              React.createElement(
                                'button',
                                {
                                  key: bt.id,
                                  type: 'button',
                                  className: `dsh-goal-chip-btn ${selectedTpl?.id === bt.id ? 'active' : ''}`,
                                  style: selectedTpl?.id === bt.id ? { fontWeight: 600, border: '1px solid var(--dsw-alias-accent-primary)' } : {},
                                  onClick: () => {
                                    setSelectedTpl(bt);
                                    const initial = {};
                                    (bt.inputs || []).forEach((inp) => {
                                      initial[inp.key] = inp.defaultValue || '';
                                    });
                                    setTplInputs(initial);
                                  },
                                },
                                bt.title
                              )
                            )
                          ),
                          selectedTpl
                            ? React.createElement(
                                'div',
                                { style: { borderTop: '1px solid var(--dsw-alias-border-l1)', paddingTop: 8 } },
                                React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 6 } }, selectedTpl.description),
                                (selectedTpl.inputs || []).map((inp) =>
                                  React.createElement(
                                    'div',
                                    { key: inp.key, style: { marginBottom: 6 } },
                                    React.createElement('label', { style: { fontSize: 11, display: 'block', marginBottom: 2 } }, inp.label),
                                    React.createElement('input', {
                                      type: 'text',
                                      className: 'dsh-goal-card-input',
                                      style: { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 8px' },
                                      placeholder: inp.placeholder || '',
                                      value: tplInputs[inp.key] || '',
                                      onChange: (e) => setTplInputs({ ...tplInputs, [inp.key]: e.target.value }),
                                    })
                                  )
                                ),
                                React.createElement(
                                  'button',
                                  {
                                    type: 'button',
                                    className: 'dsh-goal-btn dsh-goal-btn-primary',
                                    style: { marginTop: 4, padding: '4px 10px', fontSize: 12 },
                                    onClick: handleApplyTemplate,
                                  },
                                  'Apply Template'
                                )
                              )
                            : null
                        )
                  )
                : null
            ),

            React.createElement(

              'div',

              { className: 'dsh-goal-modal-foot' },

              React.createElement(

                'button',

                { type: 'button', className: 'dsh-goal-btn', onClick: onClose },

                t('close') || 'Cancel',

              ),

              React.createElement(

                'button',

                {

                  type: 'submit',

                  className: 'dsh-goal-btn dsh-goal-btn-primary',

                  disabled: !title.trim(),

                },

                t('startGoal') || 'Start Goal',

              ),

            ),

          ),

        ),

      );

    }

    function sessionIdOf(ctx, props) {

      try {

        if (props?.session?.id) return String(props.session.id);

        if (props?.session?.sessionId) return String(props.session.sessionId);

        if (props?.input?.sessionId) return String(props.input.sessionId);

        if (ctx?.scope?.session) return String(ctx.scope.session.id || ctx.scope.session.header?.id || '');

        if (typeof ctx?.scope?.id === 'string') return ctx.scope.id;

        if (ctx?.session) return String(ctx.session.id || ctx.session.header?.id || '');

        if (typeof window !== 'undefined' && window.location) {

          const params = new URLSearchParams(window.location.search);

          const fromUrl = params.get('session') || params.get('sessionId');

          if (fromUrl) return fromUrl;

        }

      } catch (err) { /* handled defensively */ }

      return 'default';

    }

