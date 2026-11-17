    // --- COMPOSER DOCK VIEWS: EXPANDED CARD & PILL (Issue 203) ---

    function GoalDockBannerView(props) {
      const {
        state, isCompleted, isWaitingOperator, isPlanMode, isPaused,
        isDockCollapsed, toggleDockCollapse, liveElapsedStr, etaStr,
        isBudgetExceeded, isCostExceeded, handleAction, setIsModalOpen,
        isModalOpen, operatorAnswerText, setOperatorAnswerText,
        submittingOperatorAnswer, setSubmittingOperatorAnswer, t
      } = props;

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'div',
          { className: 'dsh-goal-dock', 'data-goal-dock': 'true' },
          isDockCollapsed
            ? React.createElement(
                'div',
                { className: 'dsh-goal-dock-pill' },
                React.createElement(
                  'span',
                  { className: 'dsh-goal-icon' },
                  isCompleted ? React.createElement(IconCheck, { size: 14 }) : React.createElement(IconTarget, { size: 13 })
                ),
                React.createElement(
                  'span',
                  { className: `dsh-goal-badge ${isCompleted ? 'dsh-goal-badge-ok' : isWaitingOperator ? 'dsh-goal-badge-warn' : isPlanMode ? 'dsh-goal-badge-plan' : isPaused ? 'dsh-goal-badge-warn' : ''}` },
                  isCompleted ? (t('goalCompleted') || 'Done') : isWaitingOperator ? ('❓ ' + (t('operatorInputRequired') || 'Input Needed')) : isPlanMode ? (t('planMode') || 'Plan Mode') : isPaused ? (t('paused') || 'Paused') : (t('goalLabel') || 'Goal')
                ),
                React.createElement('span', { className: 'dsh-goal-title', title: state.title }, state.title),
                state.costUsage && state.costUsage.totalCost > 0 ? React.createElement('span', { className: 'dsh-goal-time dsh-goal-stat-cost', title: (t('costUsage') || 'Cost') + ': ' + state.costUsage.formattedCost }, '💰 ' + state.costUsage.formattedCost) : null,
                React.createElement('span', { className: 'dsh-goal-time' }, `⏱ ${liveElapsedStr}`),
                isPlanMode && !isCompleted ? React.createElement(
                  'button',
                  {
                    className: 'dsh-goal-btn dsh-goal-btn-approve',
                    style: { padding: '2px 6px', height: 22, fontSize: 11 },
                    title: t('approveAndExecute') || 'Approve & Execute',
                    onClick: () => handleAction('approve_plan'),
                  },
                  '✓ ' + (t('approveAndExecute') || 'Approve')
                ) : null,
                !isCompleted ? React.createElement(
                  'button',
                  {
                    className: 'dsh-goal-btn icon-only',
                    style: { padding: '2px 4px', height: 22 },
                    title: isPaused ? (t('resume') || 'Resume') : (t('pause') || 'Pause'),
                    onClick: () => handleAction(isPaused ? 'resume' : 'pause'),
                  },
                  isPaused ? React.createElement(IconPlay, { size: 12 }) : React.createElement(IconPause, { size: 12 })
                ) : null,
                React.createElement(
                  'button',
                  {
                    className: 'dsh-goal-btn icon-only',
                    style: { padding: '2px 4px', height: 22 },
                    title: t('details') || 'Expand goal details',
                    onClick: () => setIsModalOpen(true),
                  },
                  React.createElement(IconExpand, { size: 12 })
                ),
                React.createElement(
                  'button',
                  {
                    className: 'dsh-goal-btn icon-only',
                    style: { padding: '2px 4px', height: 22 },
                    title: t('expandDock') || 'Expand goal banner',
                    onClick: toggleDockCollapse,
                  },
                  '⤢'
                )
              )
            : React.createElement(
            'div',
            { className: `dsh-goal-banner${isCompleted ? ' completed' : ''}` },
            React.createElement(
              'div',
              { className: 'dsh-goal-left' },
              React.createElement(
                'span',
                { className: 'dsh-goal-icon' },
                isCompleted ? React.createElement(IconCheck, { size: 16 }) : React.createElement(IconTarget, { size: 15 }),
              ),
              React.createElement(
                'span',
                {
                  className: `dsh-goal-badge ${isCompleted ? 'dsh-goal-badge-ok' : isPlanMode ? 'dsh-goal-badge-plan' : isPaused ? 'dsh-goal-badge-warn' : ''}`,
                },
                isCompleted ? (t('goalCompleted') || 'Goal completed') : isPlanMode ? (t('planMode') || 'Plan Mode') : isPaused ? (t('paused') || 'Paused') : (t('goalLabel') || 'Current goal'),
              ),
              state.isSubGoal
                ? React.createElement(
                    'span',
                    { className: 'dsh-goal-badge dsh-goal-badge-subgoal', title: t('subGoalBadge') || 'Sub-goal' },
                    '🌱 ' + (t('subGoalBadge') || 'Sub-goal')
                  )
                : null,
              state.breadcrumbs && state.breadcrumbs.length > 1
                ? React.createElement(
                    'span',
                    { className: 'dsh-goal-breadcrumbs', title: state.title },
                    state.breadcrumbs.map((crumb, idx) =>
                      React.createElement(
                        'span',
                        { key: crumb.sessionId || idx, className: 'dsh-goal-breadcrumb-item' + (crumb.isCurrent ? ' active' : '') },
                        idx > 0 && React.createElement('span', { className: 'dsh-goal-crumb-sep' }, ' / '),
                        crumb.title
                      )
                    )
                  )
                : React.createElement('span', { className: 'dsh-goal-title', title: state.title }, state.title),
            ),
            React.createElement(
              'div',
              { className: 'dsh-goal-right' },
              state.subGoals && state.subGoals.length > 0
                ? React.createElement(
                    'span',
                    {
                      className: 'dsh-goal-stat-pill',
                      style: { cursor: 'pointer' },
                      title: t('subGoalsTitle') || 'Sub-goals',
                      onClick: () => setIsModalOpen(true),
                    },
                    '🌿 ' + state.subGoals.filter((s) => s.state === 'COMPLETED').length + '/' + state.subGoals.length + ' ' + (t('subGoalsPill') || 'sub-goals')
                  )
                : null,
              state.costUsage && state.costUsage.totalCost > 0
                ? React.createElement(
                    'span',
                    {
                      className: 'dsh-goal-stat-pill dsh-goal-stat-cost',
                      style: { cursor: 'pointer' },
                      title: (t('costUsage') || 'Cost') + ': ' + state.costUsage.formattedCost + (state.maxCostBudget ? ' / ' + state.costUsage.currency + ' ' + state.maxCostBudget.toFixed(2) : ''),
                      onClick: () => setIsModalOpen(true),
                    },
                    '💰 ' + state.costUsage.formattedCost
                  )
                : null,
              React.createElement(
                'span',
                { className: 'dsh-goal-time' },
                `⏱ ${liveElapsedStr}${etaStr}`,
              ),
              isPlanMode && !isCompleted
                ? React.createElement(
                    'button',
                    {
                      className: 'dsh-goal-btn dsh-goal-btn-approve',
                      style: { fontSize: 12, padding: '2px 8px' },
                      title: t('approveAndExecute') || 'Approve & Execute',
                      onClick: () => handleAction('approve_plan'),
                    },
                    '✓ ' + (t('approveAndExecute') || 'Approve & Execute')
                  )
                : null,
              !isCompleted
                ? React.createElement(
                    'button',
                    {
                      className: 'dsh-goal-btn icon-only',
                      title: isPaused ? (t('resume') || 'Resume') : (t('pause') || 'Pause'),
                      onClick: () => handleAction(isPaused ? 'resume' : 'pause'),
                    },
                    isPaused ? React.createElement(IconPlay, { size: 14 }) : React.createElement(IconPause, { size: 14 }),
                  )
                : null,
              isCostExceeded
                ? React.createElement(
                    'span',
                    {
                      className: 'dsh-goal-badge dsh-goal-badge-cost-limit',
                      title: t('costLimitReached') || 'Cost Budget Exceeded',
                    },
                    '🚨 ' + (t('costLimitReached') || 'Cost Limit')
                  )
                : null,
              isBudgetExceeded
                ? React.createElement(
                    'button',
                    {
                      className: 'dsh-goal-btn',
                      style: { background: 'var(--dsw-alias-state-warn-primary)', color: 'var(--dsw-alias-bg-layer-2)', fontWeight: 600, fontSize: 12, padding: '2px 8px' },
                      title: t('extendBudgetBtn') || '+50k Tokens & Resume',
                      onClick: () => handleAction('extend_budget', { addTokens: 50000 }),
                    },
                    t('extendBudgetBtn') || '+50k & Resume'
                  )
                : null,
              React.createElement(
                'button',
                {
                  className: 'dsh-goal-btn icon-only',
                  title: t('compactDock') || 'Collapse to compact pill',
                  onClick: toggleDockCollapse,
                },
                React.createElement(IconMinimize, { size: 14 }),
              ),
              React.createElement(
                'button',
                {
                  className: 'dsh-goal-btn icon-only',
                  title: t('details') || 'Expand goal details',
                  onClick: () => setIsModalOpen(true),
                },
                React.createElement(IconExpand, { size: 14 }),
              ),
              isCompleted
                ? React.createElement(
                    'button',
                    {
                      className: 'dsh-goal-btn icon-only close',
                      title: t('closeBanner') || 'Close goal banner',
                      onClick: () => handleAction('clear'),
                    },
                    '✕',
                  )
                : null,
            ),
            isWaitingOperator
              ? React.createElement(
                  'div',
                  {
                    className: 'dsh-goal-operator-card',
                    style: {
                      background: 'var(--dsw-alias-bg-layer-1)',
                      border: '1px solid var(--dsw-alias-state-warn-primary)',
                      borderRadius: 6,
                      padding: '10px 12px',
                      marginTop: 8,
                    },
                  },
                  React.createElement(
                    'div',
                    {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--dsw-alias-state-warn-primary)',
                        marginBottom: 4,
                      },
                    },
                    React.createElement('span', null, '❓'),
                    React.createElement('span', null, t('operatorInputRequired') || 'Operator Input Required')
                  ),
                  React.createElement(
                    'div',
                    {
                      style: {
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--dsw-alias-label-primary)',
                        marginBottom: 8,
                        wordBreak: 'break-word',
                      },
                    },
                    state.operatorQuery.question
                  ),
                  Array.isArray(state.operatorQuery.options) && state.operatorQuery.options.length > 0
                    ? React.createElement(
                        'div',
                        {
                          className: 'dsh-goal-operator-options',
                          style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
                        },
                        state.operatorQuery.options.map((opt, idx) =>
                          React.createElement(
                            'button',
                            {
                              key: idx,
                              type: 'button',
                              className: 'dsh-goal-btn',
                              style: {
                                fontSize: 12,
                                padding: '4px 10px',
                                borderColor: 'var(--dsw-alias-brand-primary)',
                                color: 'var(--dsw-alias-brand-primary)',
                              },
                              onClick: () => handleAction('answer_operator', { answer: opt, optionIndex: idx }),
                            },
                            opt
                          )
                        )
                      )
                    : null,
                  React.createElement(
                    'div',
                    { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                    React.createElement('input', {
                      type: 'text',
                      className: 'dsh-goal-card-input',
                      style: { flex: 1, fontSize: 12, padding: '4px 8px' },
                      placeholder: t('answerPlaceholder') || 'Type your answer or select an option above...',
                      value: operatorAnswerInput,
                      onChange: (e) => setOperatorAnswerInput(e.target.value),
                      onKeyDown: (e) => {
                        if (e.key === 'Enter' && operatorAnswerInput.trim()) {
                          e.preventDefault();
                          handleAction('answer_operator', { answer: operatorAnswerInput.trim() });
                          setOperatorAnswerInput('');
                        }
                      },
                    }),
                    React.createElement(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-goal-btn dsh-goal-btn-primary',
                        style: { fontSize: 12, padding: '4px 12px', whiteSpace: 'nowrap' },
                        disabled: !operatorAnswerInput.trim(),
                        onClick: () => {
                          if (operatorAnswerInput.trim()) {
                            handleAction('answer_operator', { answer: operatorAnswerInput.trim() });
                            setOperatorAnswerInput('');
                          }
                        },
                      },
                      t('submitAnswer') || 'Submit'
                    )
                  )
                )
              : null
          ),
        ),
        isModalOpen
          ? React.createElement(GoalDetailsModal, {
              state,
              onClose: () => setIsModalOpen(false),
              onAction: handleAction,
              t,
            })
          : null,
      );;
    }
