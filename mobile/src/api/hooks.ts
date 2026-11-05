import { useQuery } from '@tanstack/react-query';

import { useActive } from '@/accounts/store';
import { api, publicApi } from './client';
import type { Me, PhoneSession, SchoolLookup } from './types';

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

/** The signed-in person. Every account's data is keyed by its id first. */
export function useMe() {
  const account = useActive();
  return useQuery({
    queryKey: [account.id, 'me'],
    queryFn: () => api<Me>(account.id, 'me'),
  });
}

export function usePhones() {
  const account = useActive();
  return useQuery({
    queryKey: [account.id, 'sessions'],
    queryFn: () => api<{ items: PhoneSession[] }>(account.id, 'me/sessions'),
  });
}
