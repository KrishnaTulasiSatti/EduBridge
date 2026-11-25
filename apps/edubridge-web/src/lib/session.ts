/**
 * Idle sign-out settings and the shared "last activity" clock.
 * The clock lives in localStorage so activity in any open tab keeps every tab signed in.
 */

const fromEnv = Number(import.meta.env.VITE_SESSION_IDLE_MINUTES);
/** Minutes without activity before the user is signed out. */
export const IDLE_MINUTES = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 30;
export const IDLE_MS = IDLE_MINUTES * 60 * 1000;

const LAST_ACTIVITY = 'eb-last-activity';

export function markActivity(at = Date.now()) {
  try {
    localStorage.setItem(LAST_ACTIVITY, String(at));
  } catch {
    /* storage unavailable */
  }
}

export function lastActivity(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_ACTIVITY));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function clearActivity() {
  try {
    localStorage.removeItem(LAST_ACTIVITY);
  } catch {
    /* storage unavailable */
  }
}

/** True when the last recorded activity is older than the idle limit. */
export function isIdleExpired(now = Date.now()) {
  const last = lastActivity();
  return last !== null && now - last >= IDLE_MS;
}

export const LAST_ACTIVITY_KEY = LAST_ACTIVITY;
