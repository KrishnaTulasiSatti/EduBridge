import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { IDLE_MS, lastActivity, markActivity } from '@/lib/session';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
/** Record activity at most this often, so moving the mouse doesn't write to storage constantly. */
const MARK_EVERY_MS = 15 * 1000;

/**
 * Quietly signs the user out after IDLE_MINUTES with no activity in any tab.
 * There is no countdown; the sign-in page explains why the user was signed out.
 */
export function IdleSignOut() {
  const { user, signOutIdle } = useAuth();
  const navigate = useNavigate();
  const lastMarkRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    if (lastActivity() === null) markActivity();

    const onActivity = () => {
      const now = Date.now();
      if (now - lastMarkRef.current < MARK_EVERY_MS) return;
      lastMarkRef.current = now;
      markActivity(now);
    };
    const tick = () => {
      const left = IDLE_MS - (Date.now() - (lastActivity() ?? Date.now()));
      if (left <= 0) void signOutIdle().then(() => navigate('/login', { replace: true }));
    };

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    // Returning to a tab after sleep or a long time away: check at once.
    document.addEventListener('visibilitychange', tick);
    const id = window.setInterval(tick, 15 * 1000);
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      document.removeEventListener('visibilitychange', tick);
      window.clearInterval(id);
    };
  }, [user, signOutIdle, navigate]);

  return null;
}
