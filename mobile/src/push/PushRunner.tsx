import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAccounts } from '@/accounts/store';
import type { Role } from '@/api/types';
import { requestChild } from '@/screens/child/context';
import { refreshPush, syncPush } from './push';

/** Registers every account on the phone for notifications, at start and on
 *  return to the app. */
export function PushRunner() {
  const { accounts } = useAccounts();
  const ids = accounts.map((a) => a.id).join(',');

  useEffect(() => {
    if (!ids) return;
    const all = ids.split(',');
    void refreshPush(true).then(() => syncPush(all));
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshPush(false).then(() => syncPush(all));
    });
    return () => subscription.remove();
  }, [ids]);

  return null;
}

const SCREENS: Record<Role, Record<string, string>> = {
  parent: { notice: '/notices', news: '/notices', homework: '/homework', attendance: '/attendance', payment: '/fees', ledger: '/fees' },
  student: { notice: '/notices', news: '/notices', homework: '/homework', attendance: '/attendance', payment: '/fees', ledger: '/fees' },
  staff: { notice: '/notices', news: '/notices' },
  admin: { notice: '/notices', news: '/notices' },
};

/** A tapped notification opens its account, its child and its screen. */
export function PushTaps() {
  const response = Notifications.useLastNotificationResponse();
  const { accounts, active, switchTo } = useAccounts();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = (response.notification.request.content.data ?? {}) as {
      type?: string;
      session?: string;
      student?: string;
    };
    const account = accounts.find((a) => a.id === data.session) ?? active;
    if (!account) return;
    if (data.student) requestChild(account.id, Number(data.student));
    if (account.id !== active?.id) switchTo(account.id);
    const screen = SCREENS[account.role][data.type ?? ''] ?? '';
    // after the switch has moved the app into the account's screens
    setTimeout(() => router.push(`/${account.role}${screen}` as Href), 300);
  }, [response, accounts, active, switchTo]);

  return null;
}
