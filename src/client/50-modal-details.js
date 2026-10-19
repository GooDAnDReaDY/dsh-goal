    // --- MODAL DETAILS ---

    function GoalDetailsModal({ state, onClose, onAction, t }) {

      if (!state) return null;

      const milestones = state.milestones || [];

      const isCompleted = state.state === 'COMPLETED';
      const isPlanMode = state.mode === 'plan' || state.state === 'PLANNING';

      const [copied, setCopied] = useState(false);

      const [prCopied, setPrCopied] = useState(false);

      const [gitCopied, setGitCopied] = useState(false);

      const [artifactSaved, setArtifactSaved] = useState(false);

      const [savingArtifact, setSavingArtifact] = useState(false);

      const [nudgeText, setNudgeText] = useState('');

      const [nudgeSent, setNudgeSent] = useState(false);

      const [interveneText, setInterveneText] = useState('');

      const [interveneSent, setInterveneSent] = useState(false);

      const totalTokens = state.tokensUsage?.totalTokens || 0;

      const promptTokens = state.tokensUsage?.promptTokens || 0;

      const compTokens = state.tokensUsage?.completionTokens || 0;

      const tokensFormatted = totalTokens > 0

        ? (totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : `${totalTokens}`)

        : '—';

      const tokensTooltip = totalTokens > 0

        ? `Prompt: ${promptTokens.toLocaleString('en-US')} | Completion: ${compTokens.toLocaleString('en-US')} | Total: ${totalTokens.toLocaleString('en-US')}`

        : 'Tokens not recorded yet';

      const handleCopyReport = () => {

        const md = generateMarkdownReport(state);

        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {

          navigator.clipboard.writeText(md).then(() => {

            setCopied(true);

            setTimeout(() => setCopied(false), 2500);

          }).catch((err) => {

            console.warn('[dsh-goal] Clipboard copy failed:', err);

          });

        }

      };

      return React.createElement(

        'div',

        { className: 'dsh-goal-modal-overlay', onClick: onClose },

        React.createElement(

          'div',

          {

            className: 'dsh-goal-modal',

            onClick: (e) => e.stopPropagation(),

          },

          React.createElement(

            'div',

            { className: 'dsh-goal-modal-head' },

            React.createElement(

              'div',

              { className: 'dsh-goal-modal-title' },

              isCompleted

                ? React.createElement(IconCheck, { size: 18, className: 'dsh-goal-badge-ok' })

                : React.createElement(IconTarget, { size: 18 }),

              isCompleted ? (t('modalTitleCompleted') || 'Goal completed: plan and results') : (t('modalTitle') || 'Goal plan and status'),

            ),

            React.createElement(

              'button',

              {

                className: 'dsh-goal-btn icon-only close',

                onClick: onClose,

                title: t('close') || 'Close',

              },

              '✕',

            ),

          ),

          React.createElement(

            'div',

            { className: 'dsh-goal-modal-body' },

            React.createElement(

              'div',

              null,

              React.createElement('div', { style: { fontWeight: 600, fontSize: 16, marginBottom: 4, color: 'var(--dsw-alias-label-primary)' } }, state.title),

              state.description ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 13, marginBottom: 6, lineHeight: 1.4 } }, state.description) : null,

            ),

            isPlanMode && !isCompleted
              ? React.createElement(
                  'div',
                  { className: 'dsh-goal-plan-banner' },
                  React.createElement(
                    'div',
                    { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
                    React.createElement(
                      'div',
                      { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                      React.createElement('span', { className: 'dsh-goal-badge dsh-goal-badge-plan' }, t('planMode') || 'Plan Mode'),
                      React.createElement('strong', { style: { fontSize: 13, color: 'var(--dsw-alias-brand-primary)' } }, t('planningPhase') || 'Planning Phase (Read-Only)')
                    ),
                    React.createElement('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('planPhaseNotice') || 'Agent is formulating the plan. File modifications are guarded until operator approval.')
                  ),
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-goal-btn dsh-goal-btn-approve',
                      style: { padding: '6px 14px', fontSize: 12 },
                      onClick: async () => {
                        await onAction('approve_plan');
                      },
                    },
                    '✓ ' + (t('approveAndExecute') || 'Approve & Execute')
                  )
                )
              : null,

            !isCompleted

              ? React.createElement(

                  'div',

                  { className: 'dsh-goal-nudge-box', style: { marginBottom: 12 } },

                  React.createElement('input', {

                    type: 'text',

                    className: 'dsh-goal-card-input',

                    style: { flex: 1, fontSize: 12 },

                    placeholder: t('nudgePlaceholder') || '💡 Clarify task or steer agent...',

                    value: nudgeText,

                    onChange: (e) => setNudgeText(e.target.value),

                    onKeyDown: (e) => {

                      if (e.key === 'Enter' && nudgeText.trim()) {

                        onAction('nudge', { text: nudgeText.trim() });

                        setNudgeText('');

                        setNudgeSent(true);

                        setTimeout(() => setNudgeSent(false), 2000);

                      }

                    },

                  }),

                  React.createElement(

                    'button',

                    {

                      type: 'button',

                      className: `dsh-goal-btn ${nudgeSent ? 'dsh-goal-btn-primary' : ''}`,

                      disabled: !nudgeText.trim(),

                      onClick: () => {

                        if (nudgeText.trim()) {

                          onAction('nudge', { text: nudgeText.trim() });

                          setNudgeText('');

                          setNudgeSent(true);

                          setTimeout(() => setNudgeSent(false), 2000);

                        }

                      },

                    },

                    nudgeSent ? (t('nudgeSent') || '✅ Steering sent!') : (t('sendNudge') || 'Steer'),

                  ),

                )

              : null,

            state.gitStartCommit

              ? React.createElement(

                  'div',

                  { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 } },

                  React.createElement(

                    'span',

                    {

                      className: 'dsh-goal-git-badge',

                      title: t('copyGitDiff') || 'Click to copy git diff command',

                      onClick: () => {

                        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {

                          navigator.clipboard.writeText(`git diff ${state.gitStartCommit}`).then(() => {

                            setGitCopied(true);

                            setTimeout(() => setGitCopied(false), 2000);

                          });

                        }

                      },

                    },

                    gitCopied ? '✅ Diff copied!' : `📌 Git: ${state.gitStartCommit}`,

                  ),

                )

              : null,

            // Smart Pre-planning Draft Card (#85)
            state.preplan && state.preplan.active && Array.isArray(state.preplan.draftMilestones) && state.preplan.draftMilestones.length > 0
              ? React.createElement(
                  'div',
                  { className: 'dsh-goal-preplan-card' },
                  React.createElement('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 } },
                    React.createElement('span', null, '📋'),
                    React.createElement('span', null, t('preplanTitle') || 'Smart Pre-plan Ready')
                  ),
                  React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8 } },
                    `Generated ${state.preplan.draftMilestones.length} draft milestone(s). Review and approve to start.`
                  ),
                  React.createElement('div', { style: { display: 'flex', gap: 8 } },
                    React.createElement('button', {
                      type: 'button',
                      className: 'dsh-goal-btn dsh-goal-btn-primary',
                      onClick: () => onAction('preplan_approve', { sessionId: state.sessionId, approvedMilestones: state.preplan.draftMilestones })
                    }, t('preplanApprove') || 'Approve & Start Plan')
                  )
                )
              : null,

            // Pause & Intervene Card (#83)
            state.state === 'PAUSED'
              ? React.createElement(
                  'div',
                  { className: 'dsh-goal-intervene-card' },
                  React.createElement('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 } },
                    React.createElement('span', null, '⏸️'),
                    React.createElement('span', null, t('interveneTitle') || 'Pause & Intervene')
                  ),
                  React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 8 } },
                    t('interveneDesc') || 'Goal is paused. Steer agent behavior with direct guidance before resuming.'
                  ),
                  React.createElement('textarea', {
                    className: 'dsh-goal-card-input',
                    style: { width: '100%', minHeight: 60, fontSize: 12, resize: 'vertical', marginBottom: 8 },
                    placeholder: t('interveneDirectivePlaceholder') || 'Enter directive instructions for the agent...',
                    value: interveneText,
                    onChange: (e) => setInterveneText(e.target.value),
                  }),
                  React.createElement('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
                    React.createElement('button', {
                      type: 'button',
                      className: 'dsh-goal-btn dsh-goal-btn-primary',
                      disabled: !interveneText.trim() && !interveneSent,
                      onClick: () => {
                        if (interveneText.trim()) {
                          onAction('intervene', { directive: interveneText.trim() });
                          setInterveneSent(true);
                          setTimeout(() => setInterveneSent(false), 2000);
                        }
                      }
                    }, interveneSent ? (t('interveneApplied') || '✅ Applied') : (t('interveneApply') || 'Apply Directive & Resume'))
                  )
                )
              : null,

            React.createElement(

              'div',

              { className: 'dsh-goal-stat-grid' },

              React.createElement(

                'div',

                { className: 'dsh-goal-stat-box' },

                React.createElement('span', { className: 'dsh-goal-stat-val' }, state.formattedElapsed || '0s'),

                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('time') || 'Running time'),

              ),

              React.createElement(

                'div',

                { className: 'dsh-goal-stat-box' },

                React.createElement('span', { className: 'dsh-goal-stat-val' }, state.formattedETA || (isCompleted ? (t('done') || 'Done') : '—')),

                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('eta') || 'ETA'),

              ),

              React.createElement(

                'div',

                { className: 'dsh-goal-stat-box', title: tokensTooltip },

                React.createElement('span', { className: 'dsh-goal-stat-val' }, tokensFormatted),

                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('tokens') || 'Tokens'),

              ),

              React.createElement(

                'div',

                { className: 'dsh-goal-stat-box' },

                React.createElement('span', { className: 'dsh-goal-stat-val' }, `${state.iterationsCount || 0}/${state.maxIterations || 25}`),

                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('iterations') || 'Iterations'),

              ),

              React.createElement(

                'div',

                { className: 'dsh-goal-stat-box' },

                React.createElement('span', { className: 'dsh-goal-stat-val' }, `${state.progressPercent || 0}%`),

                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('progress') || 'Progress'),

              ),

            ),

            React.createElement(

              'div',

              { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 } },

              React.createElement('div', { style: { fontWeight: 600, fontSize: 13, color: 'var(--dsw-alias-label-primary)' } }, t('milestones') || 'Plan of work:'),

              milestones.length === 0

                ? React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, padding: '8px 0' } }, t('noMilestones') || 'Agent is preparing the plan of work...')

                : milestones.map((m, i) =>

                    React.createElement(

                      'div',

                      { key: m.id || i, className: 'dsh-goal-milestone-item' },

                      React.createElement('span', { style: { fontSize: 15 } }, m.status === 'completed' ? '✅' : m.status === 'in_progress' ? '🔄' : '⏳'),

                      React.createElement(

                        'div',

                        { style: { flex: 1, minWidth: 0 } },

                        React.createElement(

                          'div',

                          {

                            style: {

                              textDecoration: m.status === 'completed' ? 'line-through' : 'none',

                              color: m.status === 'completed' ? 'var(--dsw-alias-label-tertiary)' : 'inherit',

                              fontWeight: m.status === 'in_progress' ? 600 : 400,

                            },

                          },

                          `${i + 1}. ${m.title}`,
                            Array.isArray(m.dependsOn) && m.dependsOn.some((depId) => {
                              const prereq = milestones.find((x) => x.id === depId || x.title === depId);
                              return prereq && prereq.status !== 'completed';
                            })
                              ? React.createElement('span', { className: 'dsh-goal-lock-badge' }, `🔒 ${t('waitingPrereq') || 'waiting for prereq'}`)
                              : null,

                        ),

                        m.notes ? React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 } }, m.notes) : null,

                        Array.isArray(m.checklist) && m.checklist.length > 0
                          ? React.createElement(
                              'div',
                              { className: 'dsh-goal-checklist' },
                              m.checklist.map((item, itemIdx) =>
                                React.createElement(
                                  'label',
                                  { key: itemIdx, className: 'dsh-goal-checklist-item' },
                                  React.createElement('input', {
                                    type: 'checkbox',
                                    checked: Boolean(item.done),
                                    onChange: () => onAction?.('toggle_checklist_item', { milestoneId: m.id, itemIndex: itemIdx, done: !item.done }),
                                  }),
                                  React.createElement(
                                    'span',
                                    { style: { textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--dsw-alias-label-tertiary)' : 'inherit' } },
                                    item.text
                                  )
                                )
                              )
                            )
                          : null,

                        m.checkpointCommit
                          ? React.createElement(
                              'div',
                              { style: { marginTop: 4 } },
                              React.createElement(
                                'button',
                                {
                                  type: 'button',
                                  className: 'dsh-goal-btn-inline-reset',
                                  style: { fontSize: 11, padding: '1px 6px' },
                                  title: t('rollbackBtn') || 'Rollback to Checkpoint',
                                  onClick: () => {
                                    if (confirm(t('rollbackConfirm') || `Rollback working tree to checkpoint ${m.checkpointCommit}?`)) {
                                      onAction?.('rollback_milestone', { commit: m.checkpointCommit });
                                    }
                                  },
                                },
                                `↩ ${m.checkpointCommit}`
                              )
                            )
                          : null,

                      ),

                    ),

                  ),

            ),

            // Git Branch Action Controls (#86)
            state.gitBranch
              ? React.createElement(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l2)', marginTop: 8 } },
                  React.createElement('span', { className: 'dsh-goal-git-badge', style: { margin: 0 } }, `🌿 ${state.gitBranch}`),
                  (isCompleted || state.state === 'CANCELLED')
                    ? React.createElement(
                        'div',
                        { style: { display: 'flex', gap: 6 } },
                        React.createElement('button', {
                          type: 'button',
                          className: 'dsh-goal-btn',
                          style: { fontSize: 11, padding: '2px 8px' },
                          onClick: () => onAction('branch_action', { action: 'merge', sessionId: state.sessionId })
                        }, t('mergeBranch') || 'Merge Branch'),
                        React.createElement('button', {
                          type: 'button',
                          className: 'dsh-goal-btn',
                          style: { fontSize: 11, padding: '2px 8px' },
                          onClick: () => onAction('branch_action', { action: 'discard', sessionId: state.sessionId })
                        }, t('discardBranch') || 'Discard Branch')
                      )
                    : null
                )
              : null,

            // Live Activity Mini-Feed (#84)
            state.enableLiveActivityFeed !== false && Array.isArray(state.activityFeed) && state.activityFeed.length > 0
              ? React.createElement(
                  'div',
                  { className: 'dsh-goal-activity-feed' },
                  React.createElement('div', { style: { fontWeight: 600, fontSize: 12, marginBottom: 6, color: 'var(--dsw-alias-label-primary)', display: 'flex', alignItems: 'center', gap: 6 } },
                    React.createElement('span', null, '⚡'),
                    React.createElement('span', null, t('liveActivityTitle') || 'Live Activity Feed'),
                    React.createElement('span', { style: { fontSize: 10, color: 'var(--dsw-alias-label-tertiary)', fontWeight: 400 } }, `(${state.activityFeed.length})`)
                  ),
                  React.createElement(
                    'div',
                    { className: 'dsh-goal-activity-list' },
                    state.activityFeed.slice(-6).reverse().map((act, actIdx) =>
                      React.createElement('div', { key: act.id || actIdx, className: 'dsh-goal-activity-row' },
                        React.createElement('span', { className: 'dsh-goal-activity-dot' }),
                        React.createElement('span', { className: 'dsh-goal-activity-text' }, act.details || act.tool || act.type)
                      )
                    )
                  )
                )
              : null,

            // Post-Goal Retrospective Card (#88)
            isCompleted && state.retrospective
              ? React.createElement(
                  'div',
                  { className: 'dsh-goal-retrospective-card' },
                  React.createElement('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 } },
                    React.createElement('span', null, '📊'),
                    React.createElement('span', null, t('retrospectiveTitle') || 'Goal Retrospective')
                  ),
                  React.createElement(
                    'div',
                    { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11 } },
                    React.createElement('div', null,
                      React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, 'Duration'),
                      React.createElement('div', { style: { fontWeight: 600 } }, state.retrospective.formattedDuration || state.formattedElapsed || '0s')
                    ),
                    React.createElement('div', null,
                      React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, 'Tokens'),
                      React.createElement('div', { style: { fontWeight: 600 } }, state.retrospective.tokensTotal ? `${state.retrospective.tokensTotal}` : '—')
                    ),
                    React.createElement('div', null,
                      React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, 'Files Modified'),
                      React.createElement('div', { style: { fontWeight: 600 } }, `${state.retrospective.filesModifiedCount || 0}`)
                    ),
                    React.createElement('div', null,
                      React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, 'Tool Calls'),
                      React.createElement('div', { style: { fontWeight: 600 } }, `${state.retrospective.toolCallsCount || 0}`)
                    ),
                    React.createElement('div', null,
                      React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, 'Stall Recoveries'),
                      React.createElement('div', { style: { fontWeight: 600 } }, `${state.retrospective.stallsEncountered || 0}`)
                    ),
                    React.createElement('div', null,
                      React.createElement('div', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, 'Milestones'),
                      React.createElement('div', { style: { fontWeight: 600 } }, `${state.retrospective.milestonesCompleted || 0}/${state.retrospective.milestonesTotal || 0}`)
                    )
                  )
                )
              : null,

          ),

          React.createElement(

            'div',

            { className: 'dsh-goal-modal-foot' },

            isCompleted

              ? React.createElement(

                  React.Fragment,

                  null,

                  React.createElement(

                    'button',

                    {

                      className: `dsh-goal-btn dsh-goal-btn-copy${copied ? ' copied' : ''}`,

                      onClick: handleCopyReport,

                      title: t('copyReport') || 'Copy Report in Markdown',

                    },

                    copied ? (t('reportCopied') || '✅ Copied!') : (t('copyReport') || '📋 Copy Report in Markdown'),

                  ),

                  React.createElement(

                    'button',

                    {

                      className: `dsh-goal-btn dsh-goal-btn-copy${prCopied ? ' copied' : ''}`,

                      onClick: () => {

                        const prMd = generateGitHubPRComment(state);

                        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {

                          navigator.clipboard.writeText(prMd).then(() => {

                            setPrCopied(true);

                            setTimeout(() => setPrCopied(false), 2500);

                          });

                        }

                      },

                      title: 'Copy Report for GitHub / Gitea PR Comment',

                    },

                    prCopied ? (t('prCommentCopied') || '✅ PR Report Copied!') : (t('copyPRComment') || '🐙 Copy for GitHub PR'),

                  ),

                  React.createElement(
                    'button',
                    {
                      className: `dsh-goal-btn dsh-goal-btn-copy${artifactSaved ? ' copied' : ''}`,
                      disabled: savingArtifact,
                      onClick: async () => {
                        setSavingArtifact(true);
                        try {
                          await onAction?.('save_artifact');
                          setArtifactSaved(true);
                          setTimeout(() => setArtifactSaved(false), 3000);
                        } catch (err) {
                          console.warn('[dsh-goal] Save artifact error:', err);
                        } finally {
                          setSavingArtifact(false);
                        }
                      },
                      title: t('saveArtifact') || 'Save Run Artifact to .dsh/goals/',
                    },
                    artifactSaved ? (t('artifactSaved') || '✅ Saved to .dsh/goals/') : (t('saveArtifact') || '💾 Save Run Artifact')
                  ),

                )

              : null,

            isCompleted

              ? React.createElement(

                  'button',

                  {

                    className: 'dsh-goal-btn dsh-goal-btn-danger',

                    onClick: () => {

                      onAction('clear');

                      onClose();

                    },

                  },

                  t('closeBanner') || 'Close goal banner',

                )

              : null,

            isPlanMode && !isCompleted
              ? React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-goal-btn dsh-goal-btn-approve',
                    onClick: async () => {
                      await onAction('approve_plan');
                    },
                  },
                  '✓ ' + (t('approveAndExecute') || 'Approve & Execute')
                )
              : null,

            React.createElement(

              'button',

              {

                className: 'dsh-goal-btn dsh-goal-btn-primary',

                onClick: onClose,

              },

              t('close') || 'Close',

            ),

          ),

        ),

      );

    }

