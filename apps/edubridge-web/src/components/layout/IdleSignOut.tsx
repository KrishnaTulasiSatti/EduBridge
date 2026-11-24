import { Clock } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { IDLE_MINUTES, IDLE_MS, LAST_ACTIVITY_KEY, WARNING_MS, lastActivity, markActivity } from '@/lib/session';

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
/** Record activity at most this often, so moving the mouse doesn't write to storage constantly. */
const MARK_EVERY_MS = 15 * 1000;

const formatLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Signs the user out after IDLE_MINUTES with no activity in any tab.
 * A warning with a countdown appears shortly before; "Stay signed in" resets the clock.
 */
export function IdleSignOut() {
  const { user, signOutIdle } = useAuth();
  const navigate = useNavigate();
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const warningRef = useRef(false);
  const lastMarkRef = useRef(0);
  const stayRef = useRef<HTMLButtonElement>(null);

  const stay = useCallback(() => {
    markActivity();
    lastMarkRef.current = Date.now();
    warningRef.current = false;
    setMsLeft(null);
  }, []);

  useEffect(() => {
    if (!user) {
      warningRef.current = false;
      setMsLeft(null);
      return;
    }
    if (lastActivity() === null) markActivity();

    const onActivity = () => {
      // While the warning is showing, only the button counts, so a stray mouse move can't hide it.
      if (warningRef.current) return;
      const now = Date.now();
      if (now - lastMarkRef.current < MARK_EVERY_MS) return;
      lastMarkRef.current = now;
      markActivity(now);
    };
    const onStorage = (e: StorageEvent) => {
      // Another tab chose "Stay signed in" or the user is active there.
      if (e.key === LAST_ACTIVITY_KEY && warningRef.current) {
        const left = IDLE_MS - (Date.now() - (lastActivity() ?? Date.now()));
        if (left > WARNING_MS) {
          warningRef.current = false;
          setMsLeft(null);
        }
      }
    };

    const tick = () => {
      const left = IDLE_MS - (Date.now() - (lastActivity() ?? Date.now()));
      if (left <= 0) {
        warningRef.current = false;
        setMsLeft(null);
        void signOutIdle().then(() => navigate('/login', { replace: true }));
        return;
      }
      if (left <= WARNING_MS) {
        warningRef.current = true;
        setMsLeft(left);
      } else if (warningRef.current) {
        warningRef.current = false;
        setMsLeft(null);
      }
    };

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    window.addEventListener('storage', onStorage);
    // Returning to a tab after sleep or a long time away: check at once.
    document.addEventListener('visibilitychange', tick);
    const id = window.setInterval(tick, 1000);
    tick();
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', tick);
      window.clearInterval(id);
    };
  }, [user, signOutIdle, navigate]);

  const showing = msLeft !== null;
  useEffect(() => {
    if (showing) stayRef.current?.focus();
  }, [showing]);

  if (!showing) return null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-text">
      <div className="absolute inset-0 bg-black/30 animate-fade" />
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-pop animate-scale-in">
        <span className="grid size-10 place-items-center rounded-full bg-warning-soft text-warning">
          <Clock className="size-5" />
        </span>
        <h2 id="idle-title" className="mt-4 font-display text-xl font-medium">
          Are you still there?
        </h2>
        <p id="idle-text" className="mt-1.5 text-[15px] text-muted-foreground">
          For your security, you will be signed out after {IDLE_MINUTES} minutes without activity.
        </p>
        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
          Signing out in <span className="font-semibold tabular-nums text-foreground">{formatLeft(msLeft)}</span>
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              setMsLeft(null);
              warningRef.current = false;
              void signOutIdle().then(() => navigate('/login', { replace: true }));
            }}
          >
            Sign out now
          </Button>
          <Button ref={stayRef} onClick={stay}>
            Stay signed in
          </Button>
        </div>
      </div>
    </div>
  );
}
