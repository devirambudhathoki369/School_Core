import { useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { accountEnded, api, APP_VERSION, forgetTokens, rememberTokens } from '@/api/client';
import type { Me, Role, School, SignedIn } from '@/api/types';
import { dropAccount } from '@/offline/queue';
import { forgetPushFor } from '@/push/push';
import { readSecret, writeSecret } from './secure';

/** One signed-in account on this phone. Its id is the server's session id. */
export type Account = {
  id: string;
  role: Role;
  name: string;
  school: Pick<School, 'id' | 'code' | 'name' | 'logo_url'>;
};

type Saved = { accounts: Account[]; activeId: string | null };

const INDEX_KEY = 'schoolcore.accounts';

export const ROLE_LABEL: Record<Role, string> = {
  parent: 'Parent',
  student: 'Student',
  staff: 'Staff',
  admin: 'School admin',
};

/** "Staff · Demo School", or just the role when the name is the school's own
 *  (a school admin account is named after its school). */
export function accountLine(account: Pick<Account, 'role' | 'name' | 'school'>) {
  return account.name === account.school.name
    ? ROLE_LABEL[account.role]
    : `${ROLE_LABEL[account.role]} · ${account.school.name}`;
}

export function device() {
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    label: (Device.modelName ?? '').slice(0, 80),
    app_version: APP_VERSION,
  };
}

type Accounts = {
  ready: boolean;
  accounts: Account[];
  active: Account | null;
  /** Signing another account in while one is active. */
  adding: boolean;
  setAdding: (adding: boolean) => void;
  /** A line to show after the server ended an account's session. */
  notice: string | null;
  clearNotice: () => void;
  signedIn: (answer: SignedIn) => Promise<Account>;
  switchTo: (id: string) => void;
  signOut: (id: string) => Promise<void>;
  signOutEverywhere: (id: string) => Promise<void>;
  /** Forget every account on this phone (the app lock's fifth wrong PIN). */
  forgetAll: () => Promise<void>;
};

const Context = createContext<Accounts | null>(null);

export function useAccounts(): Accounts {
  const value = use(Context);
  if (!value) throw new Error('useAccounts must be used inside <AccountsProvider>');
  return value;
}

export function useActive(): Account {
  const { active } = useAccounts();
  if (!active) throw new Error('No account is signed in');
  return active;
}

function fromMe(me: Me): Account {
  return {
    id: me.session_id,
    role: me.role,
    name: me.profile.name,
    school: { id: me.school.id, code: me.school.code, name: me.school.name, logo_url: me.school.logo_url },
  };
}

export function AccountsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<Saved>({ accounts: [], activeId: null });
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    readSecret(INDEX_KEY)
      .then((text) => {
        if (!text) return;
        const parsed = JSON.parse(text) as Saved;
        if (Array.isArray(parsed.accounts)) setSaved(parsed);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback((next: Saved) => {
    setSaved(next);
    void writeSecret(INDEX_KEY, JSON.stringify(next));
  }, []);

  const drop = useCallback(
    async (id: string, message?: string) => {
      await forgetTokens(id);
      dropAccount(id);
      void forgetPushFor(id);
      queryClient.removeQueries({ queryKey: [id] });
      setSaved((current) => {
        const gone = current.accounts.find((a) => a.id === id);
        const accounts = current.accounts.filter((a) => a.id !== id);
        const activeId = current.activeId === id ? (accounts[0]?.id ?? null) : current.activeId;
        const next = { accounts, activeId };
        void writeSecret(INDEX_KEY, JSON.stringify(next));
        if (message && gone) setNotice(`${message} (${gone.name}, ${gone.school.name})`);
        return next;
      });
    },
    [queryClient],
  );

  useEffect(
    () =>
      accountEnded.listen((id) => {
        void drop(id, 'You were signed out. Please sign in again');
      }),
    [drop],
  );

  const value = useMemo<Accounts>(() => {
    const active = saved.accounts.find((a) => a.id === saved.activeId) ?? null;
    return {
      ready,
      accounts: saved.accounts,
      active,
      adding,
      setAdding,
      notice,
      clearNotice: () => setNotice(null),
      signedIn: async (answer) => {
        const account = fromMe(answer.me);
        await rememberTokens(account.id, answer.tokens);
        queryClient.setQueryData([account.id, 'me'], answer.me);
        persist({ accounts: [...saved.accounts.filter((a) => a.id !== account.id), account], activeId: account.id });
        setAdding(false);
        setNotice(null);
        return account;
      },
      switchTo: (id) => {
        if (saved.accounts.some((a) => a.id === id)) persist({ ...saved, activeId: id });
      },
      signOut: async (id) => {
        await api(id, 'auth/signout', { method: 'POST', body: {} }).catch(() => undefined);
        await drop(id);
      },
      signOutEverywhere: async (id) => {
        await api(id, 'auth/signout-all', { method: 'POST', body: {} }).catch(() => undefined);
        await drop(id);
      },
      forgetAll: async () => {
        for (const account of saved.accounts) {
          await api(account.id, 'auth/signout', { method: 'POST', body: {} }).catch(() => undefined);
          await forgetTokens(account.id);
          dropAccount(account.id);
        }
        queryClient.clear();
        persist({ accounts: [], activeId: null });
      },
    };
  }, [saved, ready, adding, notice, persist, drop, queryClient]);

  return <Context value={value}>{children}</Context>;
}
