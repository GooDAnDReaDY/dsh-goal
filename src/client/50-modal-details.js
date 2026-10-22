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

      const renderDiffBox = () => {
        return React.createElement(
          "div",
          { className: "dsh-goal-diff-box" },
          React.createElement(
            "div",
            { className: "dsh-goal-diff-summary" },
            React.createElement(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 8 } },
              React.createElement("span", null, (t("diffBaseCommit") || "Base:") + " ", React.createElement("code", null, (diffData && diffData.base ? diffData.base : (state.gitStartCommit || "main")).slice(0, 7))),
              React.createElement("span", null, "→"),
              React.createElement("span", null, (t("diffTargetBranch") || "Target:") + " ", React.createElement("code", null, (diffData && diffData.target) || state.gitBranch || state.branchName || "HEAD"))
            ),
            React.createElement(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 8 } },
              diffData && diffData.stats ? React.createElement(
                "span",
                { className: "dsh-goal-diff-stat-pill" },
                React.createElement("span", { className: "dsh-goal-diff-ins" }, "+" + diffData.stats.insertions),
                React.createElement("span", { className: "dsh-goal-diff-del" }, "-" + diffData.stats.deletions)
              ) : null,
              React.createElement(
                "button",
                {
                  type: "button",
                  className: "dsh-goal-btn icon-only",
                  style: { padding: "2px 8px", fontSize: 11 },
                  onClick: fetchDiff,
                  title: t("diffRefresh") || "Refresh Diff",
                },
                "🔄"
              )
            )
          ),
          diffData && diffData.files && diffData.files.length > 0 ? React.createElement(
            "div",
            { className: "dsh-goal-diff-files-list" },
            React.createElement(
              "span",
              {
                className: `dsh-goal-diff-file-chip${selectedFile === null ? " active" : ""}`,
                onClick: () => setSelectedFile(null),
              },
              (t("allFiles") || "All Files") + ` (${diffData.files.length})`
            ),
            diffData.files.map((f) => React.createElement(
              "span",
              {
                key: f.path,
                className: `dsh-goal-diff-file-chip${selectedFile === f.path ? " active" : ""}`,
                onClick: () => setSelectedFile(selectedFile === f.path ? null : f.path),
                title: `${f.path} (+${f.insertions} / -${f.deletions})`,
              },
              `${f.path.split("/").pop()} `,
              React.createElement("span", { className: "dsh-goal-diff-ins" }, "+" + f.insertions),
              "/",
              React.createElement("span", { className: "dsh-goal-diff-del" }, "-" + f.deletions)
            ))
          ) : null,
          diffLoading ? React.createElement("div", { className: "dsh-goal-diff-empty" }, t("diffLoading") || "Loading diff...")
            : diffError ? React.createElement("div", { className: "dsh-goal-diff-empty dsh-goal-gate-error" }, "Error: " + diffError)
            : !diffData || !diffData.diff || diffData.diff.trim().length === 0 ? React.createElement("div", { className: "dsh-goal-diff-empty" }, t("diffNoChanges") || "No git changes detected relative to base commit.")
            : React.createElement(
                "div",
                { className: "dsh-goal-diff-viewer" },
                (() => {
                  const allLines = diffData.diff.split("\n");
                  let linesToShow = allLines;
                  if (selectedFile) {
                    const fileChunks = [];
                    let collecting = false;
                    for (const l of allLines) {
                      if (l.startsWith("diff --git ")) {
                        const bPart = l.split(" b/")[1] || "";
                        collecting = bPart === selectedFile;
                      }
                      if (collecting) fileChunks.push(l);
                    }
                    if (fileChunks.length > 0) linesToShow = fileChunks;
                  }
                  return linesToShow.map((line, idx) => {
                    let lineClass = "dsh-goal-diff-line";
                    if (line.startsWith("+") && !line.startsWith("+++")) {
                      lineClass += " dsh-goal-diff-line-add";
                    } else if (line.startsWith("-") && !line.startsWith("---")) {
                      lineClass += " dsh-goal-diff-line-del";
                    } else if (line.startsWith("@@")) {
                      lineClass += " dsh-goal-diff-line-hunk";
                    } else if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) {
                      lineClass += " dsh-goal-diff-line-header";
                    }
                    return React.createElement("span", { key: idx, className: lineClass }, line || " ");
                  });
                })()
              )
        );
      };

      const renderSubGoalsBox = () => {
        const subList = Array.isArray(state.subGoals) ? state.subGoals : [];
        return React.createElement(
          'div',
          { className: 'dsh-goal-subgoals-box' },
          state.isSubGoal
            ? React.createElement(
                'div',
                { className: 'dsh-goal-subgoal-card', style: { borderStyle: 'dashed' } },
                React.createElement('div', { style: { fontSize: 11, color: 'var(--dsw-alias-brand-primary)', fontWeight: 600 } }, '🌱 ' + (t('parentGoalBanner') || 'Child Sub-goal of:')),
                React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, state.parentGoalId || 'Parent Goal')
              )
            : null,
          subList.length === 0
            ? React.createElement('div', { className: 'dsh-goal-diff-empty' }, t('noSubGoals') || 'No sub-goals spawned yet.')
            : React.createElement(
                'div',
                { className: 'dsh-goal-subgoals-list' },
                subList.map((sub, idx) =>
                  React.createElement(
                    'div',
                    { key: sub.id || sub.subGoalId || idx, className: 'dsh-goal-subgoal-card' },
                    React.createElement(
                      'div',
                      { className: 'dsh-goal-subgoal-header' },
                      React.createElement('span', { className: 'dsh-goal-subgoal-title' }, sub.title),
                      React.createElement(
                        'span',
                        {
                          className: 'dsh-goal-badge ' + (sub.state === 'COMPLETED' ? 'dsh-goal-badge-ok' : sub.state === 'RUNNING' ? 'dsh-goal-badge-plan' : ''),
                        },
                        sub.state || 'PENDING'
                      )
                    ),
                    sub.resultSummary
                      ? React.createElement(
                          'div',
                          { className: 'dsh-goal-subgoal-summary' },
                          sub.resultSummary
                        )
                      : null
                  )
                )
              )
        );
      };

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
              ? renderDiffBox()
              : activeTab === 'subgoals'
              ? renderSubGoalsBox()
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
                          m.compactionSummary
                            ? React.createElement(
                                'span',
                                { className: 'dsh-goal-compacted-pill', title: m.compactionSummary },
                                '⚡ ' + (t('compactedBadge') || 'Compacted')
                              )
                            : null,
                          m.verificationCommand
                            ? React.createElement(
                                'span',
                                {
                                  className: 'dsh-goal-gate-badge',
                                  title: `${t('verificationGate') || 'Acceptance gate'}: ${m.verificationCommand}`,
                                },
                                `🛡️ ${m.verificationCommand}`
                              )
                            : null,
                          Array.isArray(m.dependsOn) && m.dependsOn.some((depId) => {
                            const prereq = milestones.find((x) => x.id === depId || x.title === depId);
                            return prereq && prereq.status !== 'completed';
                          })
                            ? React.createElement('span', { className: 'dsh-goal-lock-badge' }, `🔒 ${t('waitingPrereq') || 'waiting for prereq'}`)
                            : null,

                        ),

                        m.notes ? React.createElement('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', marginTop: 2 } }, m.notes) : null,
                        m.verificationError
                          ? React.createElement(
                              'div',
                              { className: 'dsh-goal-gate-error' },
                              `⚠️ ${t('verificationFailed') || 'Gate failed'}: ${m.verificationError}`
                            )
                          : null,

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
              : null
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

