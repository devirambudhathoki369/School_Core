import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useCallback } from 'react';

import { useActive } from '@/accounts/store';
import { api, type Method, publicApi } from './client';
import type { Me, Page, PhoneList, SchoolLookup } from './types';

/** A school by its app code (no sign-in needed). */
export function useSchool(code: string | undefined) {
  return useQuery({
    queryKey: ['school', code],
    queryFn: () => publicApi<SchoolLookup>(`schools/${encodeURIComponent(code!)}`),
    enabled: !!code,
    retry: false,
    staleTime: 10 * 60_000,
  });
}

/** One answer of the signed-in account. Every account's data is keyed by its
 *  id first, so switching accounts never shows another account's data. */
export function useApi<T>(path: string | null | undefined, options: { staleTime?: number } = {}) {
  const account = useActive();
  return useQuery({
    queryKey: [account.id, path],
    queryFn: () => api<T>(account.id, path!),
    enabled: !!path,
    ...options,
  });
}

/** A list in pages of 30: `items` is every page so far. */
export function usePages<T>(path: string | null | undefined) {
  const account = useActive();
  const query = useInfiniteQuery({
    queryKey: [account.id, path, 'pages'],
    queryFn: ({ pageParam }) => {
      const join = path!.includes('?') ? '&' : '?';
      return api<Page<T>>(account.id, pageParam ? `${path}${join}cursor=${encodeURIComponent(pageParam)}` : path!);
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.next_cursor || undefined,
    enabled: !!path,
  });
  return { ...query, items: query.data?.pages.flatMap((page) => page.items) ?? [] };
}

export function useMe() {
  return useApi<Me>('me');
}

export function usePhones() {
  return useApi<PhoneList>('me/sessions');
}

export function newKey(): string {
  return Crypto.randomUUID();
}

/** A write as the signed-in account, with a fresh Idempotency-Key, then the
 *  account's answers are refreshed. */
export function useWrite() {
  const account = useActive();
  const queryClient = useQueryClient();
  return useCallback(
    async <T>(path: string, method: Method, body?: unknown, key: string = newKey()): Promise<T> => {
      const answer = await api<T>(account.id, path, { method, body, idempotencyKey: key });
      await queryClient.invalidateQueries({ queryKey: [account.id] });
      return answer;
    },
    [account.id, queryClient],
  );
}
