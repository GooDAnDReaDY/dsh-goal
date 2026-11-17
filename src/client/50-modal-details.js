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
      const [copiedNotes, setCopiedNotes] = useState(false);
      const [notifiedTelegram, setNotifiedTelegram] = useState(false);
      const [dispatchingTelegram, setDispatchingTelegram] = useState(false);
      const [activeTab, setActiveTab] = useState("overview");
      const [diffData, setDiffData] = useState(null);
      const [diffLoading, setDiffLoading] = useState(false);
      const [diffError, setDiffError] = useState(null);
      const [selectedFile, setSelectedFile] = useState(null);
      const fetchDiff = useCallback(() => {
        setDiffLoading(true);
        setDiffError(null);
        const sid = state.sessionId || "default";
        const url = "/dsh-goal/diff?sessionId=" + encodeURIComponent(sid);
        if (typeof fetch === "function") {
          fetch(url)
            .then((res) => {
              if (!res.ok) throw new Error("HTTP " + res.status);
              return res.json();
            })
            .then((data) => {
              if (data && data.ok) {
                setDiffData(data);
              } else {
                setDiffError((data && data.error) || "Failed to load diff");
              }
            })
            .catch((err) => {
              setDiffError(err.message || "Network error");
            })
            .finally(() => {
              setDiffLoading(false);
            });
        } else {
          setDiffLoading(false);
        }
      }, [state.sessionId]);
      useEffect(() => {
        if (activeTab === "diff") {
          fetchDiff();
        }
      }, [activeTab, fetchDiff]);
      const totalTokens = state.tokensUsage?.totalTokens || 0;
      const promptTokens = state.tokensUsage?.promptTokens || 0;
      const compTokens = state.tokensUsage?.completionTokens || 0;
      const tokensFormatted = totalTokens > 0
        ? (totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : `${totalTokens}`)
        : '—';
      const tokensTooltip = totalTokens > 0
        ? `Prompt: ${promptTokens.toLocaleString('en-US')} | Completion: ${compTokens.toLocaleString('en-US')} | Total: ${totalTokens.toLocaleString('en-US')}`
        : 'Tokens not recorded yet';
      const handleCopyReleaseNotes = async () => {
        try {
          const res = await fetch('/dsh-goal/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'export_release_notes', sessionId: state.sessionId }),
          });
          const json = await res.json();
          const notesText = json?.releaseNotes || '';
          if (notesText && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(notesText);
            setCopiedNotes(true);
            setTimeout(() => setCopiedNotes(false), 2500);
          }
        } catch (e) {
          console.warn('[dsh-goal] Failed to export release notes:', e);
        }
      };
      const handleSendTelegram = async () => {
        setDispatchingTelegram(true);
        try {
          const res = await fetch('/dsh-goal/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'notify_telegram', sessionId: state.sessionId }),
          });
          const json = await res.json();
          if (json?.ok) {
            setNotifiedTelegram(true);
            setTimeout(() => setNotifiedTelegram(false), 3000);
          }
        } catch (e) {
          console.warn('[dsh-goal] Failed to notify telegram:', e);
        } finally {
          setDispatchingTelegram(false);
        }
      };
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
            React.createElement(
              'div',
              { className: 'dsh-goal-tabs' },
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: `dsh-goal-tab-btn${activeTab === "overview" ? " active" : ""}`,
                  onClick: () => setActiveTab("overview"),
                },
                "📋 " + (t("tabOverview") || "Plan & Overview")
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: `dsh-goal-tab-btn${activeTab === "diff" ? " active" : ""}`,
                  onClick: () => setActiveTab("diff"),
                },
                "🔍 " + (t("tabDiff") || "Changes / Diff") + (diffData && diffData.stats && diffData.stats.filesChanged ? ` (${diffData.stats.filesChanged})` : "")
              ),
              React.createElement(
                'button',
                {
                  type: 'button',
                  className: `dsh-goal-tab-btn${activeTab === "subgoals" ? " active" : ""}`,
                  onClick: () => setActiveTab("subgoals"),
                },
                "🌳 " + (t("tabSubGoals") || "Sub-goals") + (state.subGoals && state.subGoals.length > 0 ? ` (${state.subGoals.length})` : "")
              )
            ),
            activeTab === 'diff'
              ? React.createElement(GoalDetailsDiffBox, { state, diffData, diffLoading, diffError, fetchDiff, selectedFile, setSelectedFile, t })
              : activeTab === 'subgoals'
              ? React.createElement(GoalDetailsSubGoalsBox, { state, t })
              : React.createElement(
                  React.Fragment,
                  null,
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
                {
                  className: 'dsh-goal-stat-box',
                  title: 'Cost: ' + (state.costUsage?.formattedCost || '.00') + (state.maxCostBudget ? ' / $' + state.maxCostBudget.toFixed(2) : ''),
                },
                React.createElement('span', { className: 'dsh-goal-stat-val' }, state.costUsage?.formattedCost || '.00'),
                React.createElement('span', { className: 'dsh-goal-stat-lbl' }, t('cost') || 'Cost'),
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
            React.createElement(GoalDetailsMilestonesList, { state, milestones, onAction, t }),

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
              ? React.createElement(GoalDetailsRetrospectiveCard, { state, isCompleted, t }): null
                ),
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
                  state.runtimeMode !== 'companion'
                    ? React.createElement(
                        'button',
                        {
                          className: 'dsh-goal-btn dsh-goal-btn-copy' + (copiedNotes ? ' copied' : ''),
                          onClick: handleCopyReleaseNotes,
                          title: t('copyReleaseNotes') || 'Copy Conventional Release Notes',
                        },
                        copiedNotes ? (t('releaseNotesCopied') || '✅ Release Notes Copied!') : (t('copyReleaseNotes') || '📝 Release Notes'),
                      )
                    : null,
                  state.runtimeMode !== 'companion'
                    ? React.createElement(
                        'button',
                        {
                          className: 'dsh-goal-btn dsh-goal-btn-copy' + (notifiedTelegram ? ' copied' : ''),
                          disabled: dispatchingTelegram,
                          onClick: handleSendTelegram,
                          title: t('notifyTelegram') || 'Send Digest to Telegram',
                        },
                        notifiedTelegram ? (t('telegramNotified') || '✅ Sent to Telegram!') : (t('notifyTelegram') || '✈️ Telegram'),
                      )
                    : null,
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