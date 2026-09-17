/**
 * Enums and helpers for DSH Goal Engine
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
 * Format total elapsed seconds into concise string (e.g. "2s", "45s", "1m 15s", "2h 5m")
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

/**
 * Format estimated remaining time (ETA)
 * @param {number|null} seconds
 * @returns {string|null}
 */
export function formatETA(seconds) {
  if (seconds == null || isNaN(seconds)) return null;
  const sec = Math.max(0, Math.floor(seconds));
  if (sec < 60) return `~${sec}s`;
  const mins = Math.round(sec / 60);
  if (mins < 60) return `~${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `~${hours}h ${remainingMins}m` : `~${hours}h`;
}

/**
 * Detect language of text (Chinese characters -> zh, otherwise en)
 * @param {string} text
 * @param {string} [fallback='en']
 * @returns {'en' | 'zh'}
 */
export function detectLanguage(text, fallback = 'en') {
  if (!text || typeof text !== 'string') return fallback;
  if (/[\u4e00-\u9fa5]/.test(text)) {
    return 'zh';
  }
  return 'en';
}

/**
 * Extract session ID from invocation or HTTP request
 * @param {any} invocationOrReq
 * @param {string} [fallback='default']
 * @returns {string}
 */
export function sessionIdOf(invocationOrReq, fallback = 'default') {
  if (!invocationOrReq) return fallback;
  try {
    if (invocationOrReq.sessionId) return String(invocationOrReq.sessionId);
    if (invocationOrReq.session) {
      return String(invocationOrReq.session.id || invocationOrReq.session.header?.id || fallback);
    }
    if (invocationOrReq.data?.sessionId) return String(invocationOrReq.data.sessionId);
    if (invocationOrReq.agent?.session) {
      return String(invocationOrReq.agent.session.id || invocationOrReq.agent.session.header?.id || fallback);
    }
    if (invocationOrReq.headers) {
      const headerSid = invocationOrReq.headers['x-dsh-session-id'];
      if (headerSid) return String(headerSid);
      if (invocationOrReq.url) {
        const url = new URL(invocationOrReq.url, 'http://localhost');
        const querySid = url.searchParams.get('sessionId') || url.searchParams.get('session');
        if (querySid) return String(querySid);
      }
    }
  } catch (err) {
    // Non-fatal inspection error on malformed request or object
  }
  return fallback;
}
