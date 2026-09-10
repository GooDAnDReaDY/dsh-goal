import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Изолированное ядро управления состоянием цели (Goal Engine).
 * Не имеет внешних зависимостей, 100% тестируемо через node --test.
 */

export const GoalState = {
  IDLE: 'IDLE',
  PLANNING: 'PLANNING',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

export const MilestoneStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Форматирование времени в лаконичную строку (например: "2s", "45s", "1m 15s", "2h 5m")
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatElapsed(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  if (sec < 60) return `${sec}s`;
  const mins = Math.floor(sec / 60);
  const remainingSec = sec % 60;
  if (mins < 60) {
    return remainingSec > 0 ? `${mins}m ${remainingSec}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

export class GoalEngine {
  constructor(options = {}) {
    this.defaultMaxIterations = options.defaultMaxIterations ?? 25;
    this.autoDrive = options.autoDrive ?? true;
    this.enableSound = options.enableSound ?? true;
    this.maxSessions = options.maxSessions ?? 100;
    this.goals = new Map();
    this.listeners = new Set();
    this.saveTimer = null;

    const defaultStorageDir = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
    this.storagePath = options.storagePath ?? null;

    this.loadStateFromDisk();
  }

  get currentGoal() {
    return this.goals.get('default') || null;
  }

  set currentGoal(val) {
    if (val) {
      this.goals.set('default', val);
    } else {
      this.goals.delete('default');
    }
  }

  loadStateFromDisk() {
    if (!this.storagePath) return;
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data === 'object') {
          if (data.sessions && typeof data.sessions === 'object') {
            for (const [sid, goal] of Object.entries(data.sessions)) {
              if (goal && goal.id && goal.title) {
                this.goals.set(sid, goal);
              }
            }
          } else if (data.id && data.title) {
            this.goals.set('default', data);
          }
        }
      }
    } catch (err) {
      console.warn('[GoalEngine] Failed to load state from disk:', err);
    }
  }

  scheduleSave(immediate = false) {
    if (!this.storagePath) return;
    if (immediate) {
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      this.writeStateToDiskSync();
      return;
    }
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveTimer = null;
        this.writeStateToDiskSync();
      }, 250);
      if (typeof this.saveTimer.unref === 'function') {
        this.saveTimer.unref();
      }
    }
  }

  writeStateToDiskSync() {
    if (!this.storagePath) return;
    try {
      if (this.goals.size === 0) {
        if (fs.existsSync(this.storagePath)) {
          fs.unlinkSync(this.storagePath);
        }
        return;
      }
      const sessionsObj = {};
      for (const [sid, goal] of this.goals.entries()) {
        sessionsObj[sid] = goal;
      }
      const payload = {
        version: 2,
        sessions: sessionsObj,
        ...(this.goals.has('default') ? this.goals.get('default') : {}),
      };
      const tmp = `${this.storagePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (err) {
      console.warn('[GoalEngine] Failed to write state to disk:', err);
    }
  }

  flushSync() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.writeStateToDiskSync();
  }

  saveStateToDisk() {
    this.flushSync();
  }

  /**
   * Подписка на изменение состояния
   * @param {Function} callback
   * @returns {Function} unsubscribe
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(sessionId = 'default', immediate = false) {
    this.scheduleSave(immediate);
    const sid = sessionId || 'default';
    const snapshot = this.getSnapshot(sid);
    for (const listener of this.listeners) {
      try {
        listener(snapshot, sid);
      } catch (err) {
        console.error('[GoalEngine] Listener error:', err);
      }
    }
  }

  /**
   * Динамическое обновление настроек на лету
   * @param {Object} config
   */
  updateConfig(config = {}) {
    if (typeof config.defaultMaxIterations === 'number' && config.defaultMaxIterations >= 1) {
      const prev = this.defaultMaxIterations;
      this.defaultMaxIterations = config.defaultMaxIterations;
      for (const [_, goal] of this.goals) {
        if (goal && goal.maxIterations === prev) {
          goal.maxIterations = config.defaultMaxIterations;
        }
      }
    }
    if (typeof config.autoDrive === 'boolean') {
      this.autoDrive = config.autoDrive;
    }
    if (typeof config.enableSound === 'boolean') {
      this.enableSound = config.enableSound;
    }
    this.emit();
  }

  /**
   * Запуск новой цели
   */
  getGoal(sessionId = 'default') {
    return this.goals.get(sessionId || 'default') || null;
  }

  /**
   * Очистка старых неактивных сессий во избежание утечек памяти
   */
  pruneInactiveSessions() {
    if (this.goals.size < this.maxSessions) return;
    const inactive = [];
    for (const [sid, goal] of this.goals.entries()) {
      if (sid === 'default') continue;
      if (goal.state === GoalState.COMPLETED || goal.state === GoalState.CANCELLED || goal.state === GoalState.FAILED) {
        inactive.push({ sid, completedAt: goal.completedAt || goal.startedAt || 0 });
      }
    }
    // Сортируем от самых старых к новым
    inactive.sort((a, b) => a.completedAt - b.completedAt);
    while (this.goals.size >= this.maxSessions && inactive.length > 0) {
      const oldest = inactive.shift();
      this.goals.delete(oldest.sid);
    }
  }

  /**
   * Запуск новой цели
   * @param {string} title
   * @param {Object} options
   * @param {string} [sessionId='default']
   */
  startGoal(title, options = {}, sessionId = 'default') {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('Goal title cannot be empty');
    }

    this.pruneInactiveSessions();

    const cleanTitle = title.trim();
    const now = Date.now();
    const sid = sessionId || 'default';

    const goal = {
      id: `goal-${now}-${Math.random().toString(36).substring(2, 7)}`,
      sessionId: sid,
      title: cleanTitle,
      description: options.description?.trim() || '',
      state: GoalState.RUNNING,
      startedAt: now,
      pausedAt: null,
      totalPausedDurationMs: 0,
      completedAt: null,
      iterationsCount: 0,
      maxIterations: options.maxIterations ?? this.defaultMaxIterations,
      milestones: [],
      logs: [
        {
          timestamp: now,
          type: 'info',
          message: `Goal initiated: "${cleanTitle}"`,
        },
      ],
      resultSummary: '',
    };

    this.goals.set(sid, goal);

    if (Array.isArray(options.milestones) && options.milestones.length > 0) {
      this.addMilestones(options.milestones, false, sid);
    }

    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  /**
   * Приостановка автономного цикла цели
   */
  pause(reason = 'User requested pause', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || goal.state !== GoalState.RUNNING) {
      return this.getSnapshot(sid);
    }

    goal.state = GoalState.PAUSED;
    goal.pausedAt = Date.now();
    goal.logs.push({
      timestamp: Date.now(),
      type: 'warning',
      message: `Paused: ${reason}`,
    });

    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  /**
   * Возобновление выполнения цели
   */
  resume(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || goal.state !== GoalState.PAUSED) {
      return this.getSnapshot(sid);
    }

    const now = Date.now();
    if (goal.pausedAt) {
      goal.totalPausedDurationMs += now - goal.pausedAt;
      goal.pausedAt = null;
    }

    goal.state = GoalState.RUNNING;
    goal.logs.push({
      timestamp: now,
      type: 'info',
      message: 'Goal resumed',
    });

    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  /**
   * Отмена цели
   */
  cancel(reason = 'Cancelled by user', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return null;

    goal.state = GoalState.CANCELLED;
    goal.completedAt = Date.now();
    goal.logs.push({
      timestamp: Date.now(),
      type: 'warning',
      message: `Cancelled: ${reason}`,
    });

    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  /**
   * Очистка / сброс цели в IDLE
   */
  clear(sessionId = 'default') {
    const sid = sessionId || 'default';
    this.goals.delete(sid);
    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  /**
   * Успешное завершение цели
   */
  completeGoal(summary = '', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return null;

    const now = Date.now();
    goal.state = GoalState.COMPLETED;
    goal.completedAt = now;
    goal.resultSummary = summary;
    goal.logs.push({
      timestamp: now,
      type: 'info',
      message: `Goal completed successfully: ${summary || 'All objectives met.'}`,
    });

    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    // Завершаем все активные milestones
    for (const m of goal.milestones) {
      if (m.status === MilestoneStatus.IN_PROGRESS || m.status === MilestoneStatus.PENDING) {
        m.status = MilestoneStatus.COMPLETED;
      }
    }

    this.emit(sid, true);
    return this.getSnapshot(sid);
  }

  /**
   * Добавление вех (milestones)
   */
  addMilestones(milestonesList, shouldEmit = true, sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || !Array.isArray(milestonesList)) return;

    for (const item of milestonesList) {
      const itemTitle = typeof item === 'string' ? item : item.title;
      if (!itemTitle || !itemTitle.trim()) continue;

      const mId = (typeof item === 'object' && item.id) ? item.id : `m-${goal.milestones.length + 1}`;
      goal.milestones.push({
        id: String(mId),
        title: itemTitle.trim(),
        status: (typeof item === 'object' && item.status) ? item.status : MilestoneStatus.PENDING,
        notes: (typeof item === 'object' && item.notes) ? item.notes : '',
      });
    }

    if (shouldEmit) this.emit(sid);
  }

  /**
   * Обновление конкретной вехи
   */
  updateMilestone(id, status, notes = '', sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return false;

    const target = goal.milestones.find((m) => m.id === String(id));
    if (!target) return false;

    if (status && Object.values(MilestoneStatus).includes(status)) {
      target.status = status;
    }
    if (notes) {
      target.notes = String(notes);
    }

    goal.logs.push({
      timestamp: Date.now(),
      type: 'milestone',
      message: `Milestone [${target.title}] status -> ${target.status}`,
    });

    if (goal.logs.length > 100) {
      goal.logs = goal.logs.slice(-100);
    }

    this.emit(sid);
    return true;
  }

  /**
   * Увеличение счётчика итераций turn
   */
  incrementIteration(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || goal.state !== GoalState.RUNNING) {
      return false;
    }

    goal.iterationsCount += 1;

    if (goal.iterationsCount >= goal.maxIterations) {
      goal.state = GoalState.FAILED;
      goal.logs.push({
        timestamp: Date.now(),
        type: 'error',
        message: `Safety limit reached: maximum ${goal.maxIterations} iterations exceeded.`,
      });
      if (goal.logs.length > 100) {
        goal.logs = goal.logs.slice(-100);
      }
      this.emit(sid, true);
      return false;
    }

    this.emit(sid);
    return true;
  }

  /**
   * Подсчёт времени в секундах
   */
  getElapsedSeconds(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) return 0;
    const { startedAt, pausedAt, totalPausedDurationMs, completedAt } = goal;
    const endTime = completedAt || (pausedAt || Date.now());
    const elapsedMs = Math.max(0, endTime - startedAt - totalPausedDurationMs);
    return Math.floor(elapsedMs / 1000);
  }

  /**
   * Снимок состояния для передачи клиенту / API
   */
  getSnapshot(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal) {
      return {
        sessionId: sid,
        hasActiveGoal: false,
        state: GoalState.IDLE,
        title: '',
        startedAt: null,
        pausedAt: null,
        totalPausedDurationMs: 0,
        completedAt: null,
        elapsedSeconds: 0,
        formattedElapsed: '0s',
        milestones: [],
        progressPercent: 0,
        iterationsCount: 0,
        maxIterations: this.defaultMaxIterations,
        autoDrive: this.autoDrive,
        enableSound: this.enableSound,
      };
    }

    const elapsed = this.getElapsedSeconds(sid);
    const milestones = goal.milestones;
    const completedCount = milestones.filter((m) => m.status === MilestoneStatus.COMPLETED).length;
    const progressPercent = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

    return {
      sessionId: sid,
      hasActiveGoal: true,
      id: goal.id,
      state: goal.state,
      title: goal.title,
      description: goal.description,
      startedAt: goal.startedAt,
      pausedAt: goal.pausedAt,
      totalPausedDurationMs: goal.totalPausedDurationMs,
      completedAt: goal.completedAt,
      elapsedSeconds: elapsed,
      formattedElapsed: formatElapsed(elapsed),
      iterationsCount: goal.iterationsCount,
      maxIterations: goal.maxIterations,
      milestones,
      progressPercent,
      logs: goal.logs,
      resultSummary: goal.resultSummary,
      autoDrive: this.autoDrive,
      enableSound: this.enableSound,
    };
  }

  /**
   * Формирование системного контекста для инжекта модели
   */
  getStatePromptInjection(sessionId = 'default') {
    const sid = sessionId || 'default';
    const goal = this.goals.get(sid);
    if (!goal || goal.state !== GoalState.RUNNING) {
      return '';
    }

    const snapshot = this.getSnapshot(sid);
    const hasMilestones = snapshot.milestones.length > 0;
    const milestonesText = hasMilestones
      ? snapshot.milestones.map((m, i) => `  ${i + 1}. [${m.status.toUpperCase()}] ${m.title}${m.notes ? ` (${m.notes})` : ''}`).join('\n')
      : '  (План работ ещё не сформирован — немедленно вызови goal_set_milestones со списком шагов!)';

    return `\n\n[DSH GOAL MODE ACTIVE]
Цель: "${snapshot.title}"
Время работы: ${snapshot.formattedElapsed} | Итерация: ${snapshot.iterationsCount}/${snapshot.maxIterations}
План работ:
${milestonesText}

Инструкции Goal Mode (СТРОГО ОБЯЗАТЕЛЬНЫ К ВЫПОЛНЕНИЮ):
1. ${hasMilestones ? 'Выполняй текущий активный пункт плана работ.' : 'ТВОЙ ПЕРВЫЙ ШАГ: Немедленно вызови инструмент goal_set_milestones со списком пунктов плана работ (3-7 конкретных шагов). Запрещено выполнять работу или завершать turn без вызова goal_set_milestones!'}
2. По мере выполнения каждого шага обязательно отмечай его статус через инструмент goal_update_progress (status: "in_progress" перед началом шага, status: "completed" по его завершении с кратким notes).
3. Когда все пункты плана будут выполнены, вызови инструмент goal_finish с подробным итоговым резюме достигнутых результатов.`;
  }
}
