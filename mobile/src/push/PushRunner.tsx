import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAccounts } from '@/accounts/store';
import type { Role } from '@/api/types';
import { requestChild } from '@/screens/child/context';
import { openTab, tabAt } from '@/ui/RoleTabs';
import { refreshPush, syncPush } from './push';

/** Registers every account on the phone for notifications: in full at start,
 *  and any change on return to the app. */
export function PushRunner() {
  const { accounts } = useAccounts();
  const ids = accounts.map((a) => a.id).join(',');

  useEffect(() => {
    if (!ids) return;
    const all = ids.split(',');
    void refreshPush(true).then(() => syncPush(all, true));
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

const ID = /^\d{1,12}$/;

/** The screen a notification opens, under its role. A homework message
 *  opens its thread; ids from the payload are checked to be plain numbers. */
function screenFor(role: Role, data: { type?: string; student?: string; homework?: string }): string {
  if (data.type === 'homework_message' && data.homework && ID.test(data.homework)) {
    if (role === 'student') return `/homework/${data.homework}/messages`;
    if (role === 'staff' && data.student && ID.test(data.student)) {
      return `/homework/${data.homework}/messages/${data.student}`;
    }
  }
  return SCREENS[role][data.type ?? ''] ?? '';
}

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
      homework?: string;
    };
    // A notification for an account no longer on this phone just opens the
    // app: it must not open another account's screens or child.
    const account = data.session ? accounts.find((a) => a.id === data.session) : active;
    if (!account) return;
    // `student` names a parent's child; for staff it is the student of a thread
    const family = account.role === 'parent' || account.role === 'student';
    if (data.student && family) requestChild(account.id, Number(data.student));
    if (account.id !== active?.id) switchTo(account.id);
    const path = `/${account.role}${screenFor(account.role, data)}`;
    // A tab is switched to, not opened again on top of the tabs.
    const tab = tabAt(account.role, path);
    // after the switch has moved the app into the account's screens
    setTimeout(() => (tab ? openTab(account.role, tab.name) : router.push(path as Href)), 300);
  }, [response, accounts, active, switchTo]);

  return null;
}
