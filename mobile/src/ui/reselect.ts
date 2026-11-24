import { useEffect } from 'react';

// Tapping the tab that is already shown takes its screen back to the top,
// as in most phone apps: a long list (every student of the school) is one
// tap from its search box again.
const listeners = new Set<() => void>();

export function tabReselected() {
  for (const listener of listeners) listener();
}

/** Runs `onReselect` when the shown tab is tapped again, while `active`. */
export function useTabReselect(onReselect: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    listeners.add(onReselect);
    return () => {
      listeners.delete(onReselect);
    };
  }, [onReselect, active]);
}
