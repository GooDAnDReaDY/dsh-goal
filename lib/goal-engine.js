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
    this.currentGoal = null;
    this.listeners = new Set();
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

  emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
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
      if (this.currentGoal && this.currentGoal.maxIterations === prev) {
        this.currentGoal.maxIterations = config.defaultMaxIterations;
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
  startGoal(title, options = {}) {
    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new Error('Goal title cannot be empty');
    }

    const cleanTitle = title.trim();
    const now = Date.now();

    this.currentGoal = {
      id: `goal-${now}-${Math.random().toString(36).substring(2, 7)}`,
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

    if (Array.isArray(options.milestones) && options.milestones.length > 0) {
      this.addMilestones(options.milestones, false);
    }

    this.emit();
    return this.getSnapshot();
  }

  /**
   * Приостановка автономного цикла цели
   */
  pause(reason = 'User requested pause') {
    if (!this.currentGoal || this.currentGoal.state !== GoalState.RUNNING) {
      return this.getSnapshot();
    }

    this.currentGoal.state = GoalState.PAUSED;
    this.currentGoal.pausedAt = Date.now();
    this.currentGoal.logs.push({
      timestamp: Date.now(),
      type: 'warning',
      message: `Paused: ${reason}`,
    });

    this.emit();
    return this.getSnapshot();
  }

  /**
   * Возобновление выполнения цели
   */
  resume() {
    if (!this.currentGoal || this.currentGoal.state !== GoalState.PAUSED) {
      return this.getSnapshot();
    }

    const now = Date.now();
    if (this.currentGoal.pausedAt) {
      this.currentGoal.totalPausedDurationMs += now - this.currentGoal.pausedAt;
      this.currentGoal.pausedAt = null;
    }

    this.currentGoal.state = GoalState.RUNNING;
    this.currentGoal.logs.push({
      timestamp: now,
      type: 'info',
      message: 'Goal resumed',
    });

    this.emit();
    return this.getSnapshot();
  }

  /**
   * Отмена цели
   */
  cancel(reason = 'Cancelled by user') {
    if (!this.currentGoal) return null;

    this.currentGoal.state = GoalState.CANCELLED;
    this.currentGoal.completedAt = Date.now();
    this.currentGoal.logs.push({
      timestamp: Date.now(),
      type: 'warning',
      message: `Cancelled: ${reason}`,
    });

    this.emit();
    return this.getSnapshot();
  }

  /**
   * Очистка / сброс цели в IDLE
   */
  clear() {
    this.currentGoal = null;
    this.emit();
    return this.getSnapshot();
  }

  /**
   * Успешное завершение цели
   */
  completeGoal(summary = '') {
    if (!this.currentGoal) return null;

    const now = Date.now();
    this.currentGoal.state = GoalState.COMPLETED;
    this.currentGoal.completedAt = now;
    this.currentGoal.resultSummary = summary;
    this.currentGoal.logs.push({
      timestamp: now,
      type: 'info',
      message: `Goal completed successfully: ${summary || 'All objectives met.'}`,
    });

    // Завершаем все активные milestones
    for (const m of this.currentGoal.milestones) {
      if (m.status === MilestoneStatus.IN_PROGRESS || m.status === MilestoneStatus.PENDING) {
        m.status = MilestoneStatus.COMPLETED;
      }
    }

    this.emit();
    return this.getSnapshot();
  }

  /**
   * Добавление вех (milestones)
   */
  addMilestones(milestonesList, shouldEmit = true) {
    if (!this.currentGoal || !Array.isArray(milestonesList)) return;

    for (const item of milestonesList) {
      const itemTitle = typeof item === 'string' ? item : item.title;
      if (!itemTitle || !itemTitle.trim()) continue;

      const mId = (typeof item === 'object' && item.id) ? item.id : `m-${this.currentGoal.milestones.length + 1}`;
      this.currentGoal.milestones.push({
        id: String(mId),
        title: itemTitle.trim(),
        status: (typeof item === 'object' && item.status) ? item.status : MilestoneStatus.PENDING,
        notes: (typeof item === 'object' && item.notes) ? item.notes : '',
      });
    }

    if (shouldEmit) this.emit();
  }

  /**
   * Обновление конкретной вехи
   */
  updateMilestone(id, status, notes = '') {
    if (!this.currentGoal) return false;

    const target = this.currentGoal.milestones.find((m) => m.id === String(id));
    if (!target) return false;

    if (status && Object.values(MilestoneStatus).includes(status)) {
      target.status = status;
    }
    if (notes) {
      target.notes = notes;
    }

    this.currentGoal.logs.push({
      timestamp: Date.now(),
      type: 'milestone',
      message: `Milestone [${target.title}] status -> ${target.status}`,
    });

    this.emit();
    return true;
  }

  /**
   * Увеличение счётчика итераций turn
   */
  incrementIteration() {
    if (!this.currentGoal || this.currentGoal.state !== GoalState.RUNNING) {
      return false;
    }

    this.currentGoal.iterationsCount += 1;

    if (this.currentGoal.iterationsCount >= this.currentGoal.maxIterations) {
      this.currentGoal.state = GoalState.FAILED;
      this.currentGoal.logs.push({
        timestamp: Date.now(),
        type: 'error',
        message: `Safety limit reached: maximum ${this.currentGoal.maxIterations} iterations exceeded.`,
      });
      this.emit();
      return false;
    }

    this.emit();
    return true;
  }

  /**
   * Подсчёт времени в секундах
   */
  getElapsedSeconds() {
    if (!this.currentGoal) return 0;
    const { startedAt, pausedAt, totalPausedDurationMs, completedAt } = this.currentGoal;
    const endTime = completedAt || (pausedAt || Date.now());
    const elapsedMs = Math.max(0, endTime - startedAt - totalPausedDurationMs);
    return Math.floor(elapsedMs / 1000);
  }

  /**
   * Снимок состояния для передачи клиенту / API
   */
  getSnapshot() {
    if (!this.currentGoal) {
      return {
        hasActiveGoal: false,
        state: GoalState.IDLE,
        title: '',
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

    const elapsed = this.getElapsedSeconds();
    const milestones = this.currentGoal.milestones;
    const completedCount = milestones.filter((m) => m.status === MilestoneStatus.COMPLETED).length;
    const progressPercent = milestones.length > 0 ? Math.round((completedCount / milestones.length) * 100) : 0;

    return {
      hasActiveGoal: true,
      id: this.currentGoal.id,
      state: this.currentGoal.state,
      title: this.currentGoal.title,
      description: this.currentGoal.description,
      elapsedSeconds: elapsed,
      formattedElapsed: formatElapsed(elapsed),
      iterationsCount: this.currentGoal.iterationsCount,
      maxIterations: this.currentGoal.maxIterations,
      milestones,
      progressPercent,
      logs: this.currentGoal.logs,
      resultSummary: this.currentGoal.resultSummary,
      autoDrive: this.autoDrive,
      enableSound: this.enableSound,
    };
  }

  /**
   * Формирование системного контекста для инжекта модели
   */
  getStatePromptInjection() {
    if (!this.currentGoal || this.currentGoal.state !== GoalState.RUNNING) {
      return '';
    }

    const snapshot = this.getSnapshot();
    const hasMilestones = snapshot.milestones.length > 0;
    const milestonesText = hasMilestones
      ? snapshot.milestones.map((m, i) => `  ${i + 1}. [${m.status.toUpperCase()}] ${m.title}${m.notes ? ` (${m.notes})` : ''}`).join('\n')
      : '  (План работ ещё не сформирован — немедленно вызови goal_set_milestones со списком шагов!)';

    return `\n\n[DSH GOAL MODE ACTIVE]
Цель: "${snapshot.title}"
Время работы: ${snapshot.formattedElapsed} | Итерация: ${snapshot.iterationsCount}/${snapshot.maxIterations}
План работ:
${milestonesText}

Инструкции Goal Mode:
1. ${hasMilestones ? 'Выполняй текущий активный пункт плана работ.' : 'ТВОЙ ПЕРВЫЙ ШАГ: Немедленно вызови инструмент goal_set_milestones со списком пунктов плана работ.'}
2. По мере выполнения каждого шага отмечай его статус через инструмент goal_update_progress (status: "in_progress" перед началом, "completed" по завершении).
3. Когда все пункты плана будут выполнены, вызови инструмент goal_finish с итоговым резюме.`;
  }
}
