import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, use, useEffect, useMemo, useState } from 'react';

import { useActive } from '@/accounts/store';
import { useMe } from '@/api/hooks';
import type { Child } from '@/api/types';

type ChildChoice = {
  /** The student every child screen shows: the chosen child, or the student themself. */
  child: Child | null;
  children: Child[];
  choose: (id: number) => void;
};

const Context = createContext<ChildChoice | null>(null);

/** For parents: which of their children the screens show, remembered per
 *  account. For students: always themself. */
export function ChildProvider({ children: content }: { children: ReactNode }) {
  const account = useActive();
  const me = useMe().data;
  const [chosen, setChosen] = useState<number | null>(null);
  const storageKey = `schoolcore.child.${account.id}`;

  useEffect(() => {
    AsyncStorage.getItem(storageKey)
      .then((saved) => {
        if (saved) setChosen(Number(saved));
      })
      .catch(() => undefined);
  }, [storageKey]);

  const value = useMemo<ChildChoice>(() => {
    const list: Child[] =
      account.role === 'parent'
        ? (me?.children ?? [])
        : me?.profile.id
          ? [
              {
                id: me.profile.id,
                name: me.profile.name,
                class_name: me.profile.class_name ?? '',
                roll_no: me.profile.roll_no ?? null,
                photo_url: me.profile.photo_url ?? null,
              },
            ]
          : [];
    return {
      child: list.find((c) => c.id === chosen) ?? list[0] ?? null,
      children: list,
      choose: (id) => {
        setChosen(id);
        void AsyncStorage.setItem(storageKey, String(id)).catch(() => undefined);
      },
    };
  }, [account.role, me, chosen, storageKey]);

  return <Context value={value}>{content}</Context>;
}

export function useChild(): ChildChoice {
  const value = use(Context);
  if (!value) throw new Error('useChild must be used inside <ChildProvider>');
  return value;
}
