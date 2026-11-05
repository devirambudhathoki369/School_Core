import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';

import { api, setToken, setUnauthorizedHandler } from '@/api/client';
import type { SignInResponse } from '@/api/types';
import { readToken, writeToken } from './storage';

type Session = {
  token: string | null;
  isLoading: boolean;
  /** Said on the sign-in screen after the app signed someone out. */
  notice: string | null;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
  clearNotice: () => void;
};

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((next: string | null) => {
    setToken(next);
    setTokenState(next);
  }, []);

  useEffect(() => {
    readToken()
      .then(apply)
      .finally(() => setLoading(false));
  }, [apply]);

  const forget = useCallback(
    async (message?: string) => {
      apply(null);
      queryClient.clear();
      await writeToken(null).catch(() => undefined);
      setNotice(message ?? null);
    },
    [apply, queryClient],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void forget('Your session has ended. Please sign in again.');
    });
    return () => setUnauthorizedHandler(null);
  }, [forget]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const answer = await api<SignInResponse>('/auth/student/signin', {
        method: 'POST',
        body: { username: username.trim(), password },
        auth: false,
      });
      const next = answer?.user?.token;
      if (!next || answer.user.role !== 'student') {
        throw new Error('This app is for student and parent accounts.');
      }
      await writeToken(next);
      queryClient.setQueryData(['profile'], answer.user.profile);
      setNotice(null);
      apply(next);
    },
    [apply, queryClient],
  );

  const signOut = useCallback(
    async (message?: string) => {
      // Revoke the token on the server first; the device forgets it either way.
      await api('/auth/logout', { method: 'POST', body: { role: 'student' } }).catch(() => undefined);
      await forget(message);
    },
    [forget],
  );

  const value = useMemo<Session>(
    () => ({
      token,
      isLoading,
      notice,
      signIn,
      signOut,
      clearNotice: () => setNotice(null),
    }),
    [token, isLoading, notice, signIn, signOut],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
