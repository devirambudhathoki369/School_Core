import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { retrySignOuts } from '@/accounts/leaving';
import { flush, loadQueue, onSent, useQueue } from './queue';

const EVERY_MS = 30_000;

/** Sends waiting writes at start, on return to the app, and every 30 seconds
 *  while any wait; refreshes the account's screens after each one goes.
 *  Sign-outs made offline are sent again at start and on return as well. */
export function QueueRunner() {
  const queryClient = useQueryClient();
  const { pending } = useQueue();
  const waiting = pending.length > 0;

  useEffect(() => {
    void loadQueue().then(flush);
    void retrySignOuts();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void flush();
      void retrySignOuts();
    });
    const stop = onSent((job) => {
      void queryClient.invalidateQueries({ queryKey: [job.accountId] });
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, [queryClient]);

  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void flush(), EVERY_MS);
    return () => clearInterval(timer);
  }, [waiting]);

  return null;
}
