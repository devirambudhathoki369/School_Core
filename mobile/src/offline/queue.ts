// Writes taken with no signal (mobile/SPEC.md §6: "Attendance marks taken
// offline wait in a queue and go when the phone is back online").
//
// Each job keeps the Idempotency-Key it was first tried with, so sending it
// again, after a dropped connection, a restart or hours later, can never
// save it twice. Jobs go one at a time, oldest first. A job the server
// refuses (a 4xx) leaves the queue and is kept in `failed` so the person
// can see what did not go.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { api, ApiError, type Method } from '@/api/client';

export type Job = {
  key: string;
  accountId: string;
  path: string;
  method: Method;
  body: unknown;
  /** What it is, for the list on screen: "Class 5 A, 19 Kartik". */
  label: string;
  createdAt: number;
  error?: string;
};

type State = { pending: Job[]; failed: Job[]; sending: boolean };

const STORAGE_KEY = 'schoolcore.queue';
let state: State = { pending: [], failed: [], sending: false };
let loaded = false;
const listeners = new Set<() => void>();
const sentListeners = new Set<(job: Job, answer: unknown) => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ pending: state.pending, failed: state.failed })).catch(
    () => undefined,
  );
}

export async function loadQueue() {
  if (loaded) return;
  loaded = true;
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? 'null');
    if (saved && Array.isArray(saved.pending)) {
      state = { pending: saved.pending, failed: Array.isArray(saved.failed) ? saved.failed : [], sending: false };
      listeners.forEach((l) => l());
    }
  } catch {
    // an unreadable queue starts empty
  }
}

export function enqueue(job: Omit<Job, 'createdAt'>) {
  // the same thing queued again (a second save of the same class and day)
  // replaces the waiting one
  const pending = state.pending.filter((j) => !(j.accountId === job.accountId && j.path === job.path));
  set({ pending: [...pending, { ...job, createdAt: Date.now() }] });
}

export function dismissFailed(key: string) {
  set({ failed: state.failed.filter((j) => j.key !== key) });
}

/** Forget an account's jobs (it was signed out). */
export function dropAccount(accountId: string) {
  set({
    pending: state.pending.filter((j) => j.accountId !== accountId),
    failed: state.failed.filter((j) => j.accountId !== accountId),
  });
}

export function onSent(listener: (job: Job, answer: unknown) => void) {
  sentListeners.add(listener);
  return () => {
    sentListeners.delete(listener);
  };
}

/** Send what is waiting. Stops at the first job that cannot reach the server. */
export async function flush(): Promise<void> {
  if (state.sending || !state.pending.length) return;
  set({ sending: true });
  try {
    while (state.pending.length) {
      const job = state.pending[0];
      try {
        const answer = await api(job.accountId, job.path, {
          method: job.method,
          body: job.body,
          idempotencyKey: job.key,
        });
        set({ pending: state.pending.slice(1) });
        sentListeners.forEach((l) => l(job, answer));
      } catch (error) {
        const retryLater =
          !(error instanceof ApiError) ||
          error.status === 0 || // no connection
          error.status === 401 || // signed out; the account's jobs go with it
          error.status === 426 || // the app must update first
          error.status >= 500 ||
          error.code === 'in_progress'; // the same key is still being saved
        if (!retryLater) {
          set({
            pending: state.pending.slice(1),
            failed: [...state.failed, { ...job, error: (error as Error).message }],
          });
          continue;
        }
        break;
      }
    }
  } finally {
    set({ sending: false });
  }
}

export function useQueue(accountId?: string) {
  const snapshot = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  if (!accountId) return snapshot;
  return {
    sending: snapshot.sending,
    pending: snapshot.pending.filter((j) => j.accountId === accountId),
    failed: snapshot.failed.filter((j) => j.accountId === accountId),
  };
}
