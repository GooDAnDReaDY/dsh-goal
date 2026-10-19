    // --- COMPOSER DOCK WIDGET ---

    function GoalTopBanner(props) {

      const { ctx } = props || {};

      const sid = sessionIdOf(ctx, props);

      const [state, setState] = useState(null);

      const [isModalOpen, setIsModalOpen] = useState(false);

      const [isQuickLaunchOpen, setIsQuickLaunchOpen] = useState(false);

      const [isDockCollapsed, setIsDockCollapsed] = useState(() => {
        try {
          return localStorage.getItem('dsh_goal_dock_collapsed') === 'true';
        } catch (e) {
          return false;
        }
      });

      const toggleDockCollapse = () => {
        setIsDockCollapsed((prev) => {
          const next = !prev;
          try {
            localStorage.setItem('dsh_goal_dock_collapsed', String(next));
          } catch (e) {
            // Handled defensively: localStorage might be unavailable or quota exceeded
          }
          return next;
        });
      };

      const [now, setNow] = useState(() => Date.now());

      const stateRef = useRef(null);

      stateRef.current = state;

      const lastStateRef = useRef(null);

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

        if (state?.lang) {

          if (state.lang === 'zh') active = 'zh';

          else active = 'en';

        }

        return active;

      };

      const t = (key) => {

        const active = resolveLocale();

        return LOCALES[active]?.[key] || LOCALES.en?.[key] || key;

      };

      useEffect(() => {

        injectStylesOnce();

      }, []);

      // Local 1-second interval for smooth timer ticking

      useEffect(() => {

        const ticker = setInterval(() => {

          setNow(Date.now());

        }, 1000);

        return () => clearInterval(ticker);

      }, []);

      const fetchState = useCallback(async () => {

        try {

          const query = sid && sid !== 'default' ? `?sessionId=${encodeURIComponent(sid)}` : '';

          const res = await fetch(`/dsh-goal/state${query}`, {

            headers: { 'x-dsh-session-id': sid },

          });

          if (res.ok) {

            const data = await res.json();

            updateStateWithAudio(data);

            return data;

          }

        } catch (err) { /* handled defensively */ }

      }, [sid]);

      // Audio chime on transition to COMPLETED or FAILED

      const updateStateWithAudio = useCallback((nextState) => {

        if (nextState && lastStateRef.current) {

          const prev = lastStateRef.current;

          if (prev.state !== nextState.state && nextState.enableSound !== false) {

            if (nextState.state === 'COMPLETED') {

              playGoalChime(true, nextState.soundScheme || 'default');
              speakGoalAnnouncement('Goal completed: ' + (nextState.title || ''), Boolean(nextState.enableVoiceAnnouncements));

            } else if (nextState.state === 'FAILED') {

              playGoalChime(false, nextState.soundScheme || 'default');
              speakGoalAnnouncement('Goal failed: ' + (nextState.title || ''), Boolean(nextState.enableVoiceAnnouncements));

            }

            // HTML5 Browser Desktop Notification

            if (typeof window !== 'undefined' && 'Notification' in window) {

              if (nextState.enableBrowserNotifications !== false && Notification.permission === 'granted') {

                try {

                  const isOk = nextState.state === 'COMPLETED';

                  new Notification(

                    isOk ? '🎯 Goal Completed' : '⚠️ Goal Failed',

                    {

                      body: `${nextState.title} (${nextState.formattedElapsed || ''})`,

                      icon: '/favicon.ico',

                    }

                  );

                } catch (err) { /* handled defensively */ }

              }

            }

          }

        }

        lastStateRef.current = nextState;

        setState(nextState);

      }, []);

      // Realtime Server-Sent Events (SSE) with adaptive fallback polling

      useEffect(() => {

        let es = null;

        let timer = null;

        let reconnectTimer = null;

        let isDisposed = false;

        let sseActive = false;

        let retryCount = 0;

        const scheduleNextPoll = () => {

          if (isDisposed || sseActive) return;

          const currentState = stateRef.current;

          const isDocHidden = typeof document !== 'undefined' && document.hidden;

          const isRunning = currentState?.hasActiveGoal && currentState?.state === 'RUNNING';

          let delay = 1500;

          if (isDocHidden) {

            delay = 10000;

          } else if (!isRunning) {

            delay = 8000;

          }

          timer = setTimeout(async () => {

            await fetchState();

            scheduleNextPoll();

          }, delay);

        };

        const connectSSE = () => {

          if (isDisposed) return;

          if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {

            scheduleNextPoll();

            return;

          }

          try {

            if (es) {

              es.close();

              es = null;

            }

            const query = sid && sid !== 'default' ? `?sessionId=${encodeURIComponent(sid)}` : '';

            es = new window.EventSource(`/dsh-goal/events${query}`);

            es.onopen = () => {

              sseActive = true;

              retryCount = 0;

              if (timer) {

                clearTimeout(timer);

                timer = null;

              }

              if (reconnectTimer) {

                clearTimeout(reconnectTimer);

                reconnectTimer = null;

              }

            };

            es.onmessage = (event) => {

              if (isDisposed) return;

              try {

                const data = JSON.parse(event.data);

                if (data && typeof data === 'object') {

                  updateStateWithAudio(data);

                }

              } catch (err) { /* handled defensively */ }

            };

            es.onerror = () => {

              sseActive = false;

              if (es) {

                es.close();

                es = null;

              }

              if (!isDisposed) {

                // Trigger immediate polling for UI continuity

                if (!timer) scheduleNextPoll();

                // Exponential backoff for SSE reconnect (2s to 30s) with jitter

                retryCount = Math.min(retryCount + 1, 5);

                const backoffBase = Math.min(30000, 2000 * Math.pow(1.8, retryCount - 1));

                const jitter = Math.random() * 1000;

                const reconnectDelay = Math.round(backoffBase + jitter);

                if (reconnectTimer) clearTimeout(reconnectTimer);

                reconnectTimer = setTimeout(() => {

                  reconnectTimer = null;

                  connectSSE();

                }, reconnectDelay);

              }

            };

          } catch (_) {

            sseActive = false;

            scheduleNextPoll();

          }

        };

        connectSSE();

        // Initial state load

        fetchState().then(() => {

          if (!sseActive) scheduleNextPoll();

        });

        const onVisibilityChange = () => {

          if (typeof document !== 'undefined' && !document.hidden) {

            if (!sseActive) {

              if (timer) clearTimeout(timer);

              fetchState().then(() => {

                scheduleNextPoll();

              });

              // Reconnect SSE when tab becomes visible

              if (!reconnectTimer && !sseActive) {

                connectSSE();

              }

            }

          }

        };

        if (typeof document !== 'undefined' && document.addEventListener) {

          document.addEventListener('visibilitychange', onVisibilityChange);

        }

        return () => {

          isDisposed = true;

          if (es) {

            es.close();

            es = null;

          }

          if (timer) clearTimeout(timer);

          if (reconnectTimer) clearTimeout(reconnectTimer);

          if (typeof document !== 'undefined' && document.removeEventListener) {

            document.removeEventListener('visibilitychange', onVisibilityChange);

          }

        };

      }, [sid, fetchState, updateStateWithAudio]);

      const handleAction = async (action, extra = {}) => {

        try {

          const res = await fetch('/dsh-goal/action', {

            method: 'POST',

            headers: {

              'Content-Type': 'application/json',

              'x-dsh-session-id': sid,

            },

            body: JSON.stringify({ action, sessionId: sid, ...extra }),

          });

          if (res.ok) {

            const data = await res.json();

            if (data.state) updateStateWithAudio(data.state);

          }

        } catch (err) { /* handled defensively */ }

      };

      const showQuickLaunch = state ? (state.showQuickLaunchButton !== false) : true;

      if (!state || !state.hasActiveGoal) {

        if (!showQuickLaunch) return null;

        return React.createElement(

          React.Fragment,

          null,

          React.createElement(

            'div',

            { className: 'dsh-goal-dock dsh-goal-dock-quick', 'data-goal-dock': 'true' },

            React.createElement(

              'button',

              {

                className: 'dsh-goal-quicklaunch-btn',

                title: t('quickLaunch') || 'Start Goal (Goal Mode)',

                onClick: () => setIsQuickLaunchOpen(true),

              },

              React.createElement(IconTarget, { size: 14 }),

              React.createElement('span', null, t('quickLaunch') || 'Start Goal'),

            ),

          ),

          isQuickLaunchOpen

            ? React.createElement(QuickLaunchModal, {

                onClose: () => setIsQuickLaunchOpen(false),

                onStart: async (title, opts) => {

                  await handleAction('start', { title, mode: opts?.mode });

                  setIsQuickLaunchOpen(false);

                },

                t,

              })

            : null,

        );

      }

      const isPaused = state.state === 'PAUSED';

      const isCompleted = state.state === 'COMPLETED';

      const isPlanMode = state.mode === 'plan' || state.state === 'PLANNING';

      const formatElapsed = (totalSeconds) => {
        const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        const remS = s % 60;
        if (m < 60) return remS > 0 ? `${m}m ${remS}s` : `${m}m`;
        const h = Math.floor(m / 60);
        const remM = m % 60;
        return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
      };

      const formatLiveElapsed = () => {

        if (!state) return '0s';

        if (!state.startedAt) return state.formattedElapsed || '0s';

        const endTime = state.completedAt || (state.pausedAt || now);

        const elapsedSec = Math.max(0, Math.floor((endTime - state.startedAt - (state.totalPausedDurationMs || 0)) / 1000));

        return formatElapsed(elapsedSec);

      };

      const liveElapsedStr = formatLiveElapsed();

      const etaStr = state?.formattedETA ? ` (ETA ${state.formattedETA})` : '';

      const isBudgetExceeded = state?.state === 'PAUSED' && state?.logs?.some((l) => l.message?.includes('Token budget reached'));

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
                  { className: `dsh-goal-badge ${isCompleted ? 'dsh-goal-badge-ok' : isPlanMode ? 'dsh-goal-badge-plan' : isPaused ? 'dsh-goal-badge-warn' : ''}` },
                  isCompleted ? (t('goalCompleted') || 'Done') : isPlanMode ? (t('planMode') || 'Plan Mode') : isPaused ? (t('paused') || 'Paused') : (t('goalLabel') || 'Goal')
                ),
                React.createElement('span', { className: 'dsh-goal-title', title: state.title }, state.title),
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

              React.createElement('span', { className: 'dsh-goal-title', title: state.title }, state.title),

            ),

            React.createElement(

              'div',

              { className: 'dsh-goal-right' },

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

              isBudgetExceeded
                ? React.createElement(
                    'button',
                    {
                      className: 'dsh-goal-btn',
                      style: { background: 'var(--dsw-alias-status-warning)', color: 'var(--dsw-alias-surface-raised)', fontWeight: 600, fontSize: 12, padding: '2px 8px' },
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

      );

    }

