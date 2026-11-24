import { useEffect, useSyncExternalStore } from 'react';

/**
 * Counts work in progress (server requests, page code loading) so one bar at the top of
 * the window can show that something is happening.
 */
let active = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Marks the start of some work. Call the returned function once when it finishes. */
export function beginActivity() {
  active += 1;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    active = Math.max(0, active - 1);
    emit();
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True while any work is in progress. */
export function useBusy() {
  return useSyncExternalStore(subscribe, () => active > 0);
}

/** Counts as work in progress for as long as the calling component is mounted. */
export function useActivityWhileMounted() {
  useEffect(() => beginActivity(), []);
}
