    // --- MODAL DETAILS: TABS & VIEWS (Issue 203) ---

    function GoalDetailsDiffBox({ state, diffData, diffLoading, diffError, fetchDiff, selectedFile, setSelectedFile, t }) {
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

    function GoalDetailsSubGoalsBox({ state, t }) {
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

    function GoalDetailsRetrospectiveCard({ state, isCompleted, t }) {
      if (!isCompleted || !state?.retrospective) return null;
      return React.createElement(
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
                );
    }


    function GoalDetailsMilestonesList({ state, milestones, onAction, t }) {
      return React.createElement(
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
              : null;
    }
