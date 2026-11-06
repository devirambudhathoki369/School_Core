// Push notifications (mobile/SPEC.md, phase 6).
//
// The phone asks once for permission, gets its Expo push token and gives it
// to every account signed in on it (PUT /me/push-token). The server sends the
// school's notices, homework, attendance and fee news to that token. An
// account can turn its notifications off in Account; signing out ends them.
//
// Push needs a build of the app (not Expo Go) made after `eas init`, which
// sets the project id, with the Firebase and Apple keys from `eas credentials`.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import { api } from '@/api/client';

export const CHANNEL = 'school';

export type PushStatus = 'unavailable' | 'undetermined' | 'denied' | 'granted';
type State = { status: PushStatus; token: string | null; off: Record<string, boolean> };

let state: State = { status: Platform.OS === 'web' ? 'unavailable' : 'undetermined', token: null, off: {} };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

const sentKey = (accountId: string) => `schoolcore.push.sent.${accountId}`;
const offKey = (accountId: string) => `schoolcore.push.off.${accountId}`;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function projectId(): string | undefined {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

/** Find out (and, with `ask`, ask once) whether this phone takes notifications,
 *  and get its token when it does. */
export async function refreshPush(ask: boolean): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice || !projectId()) {
    set({ status: 'unavailable', token: null });
    return;
  }
  try {
    if (Platform.OS === 'android') {
      // Android 13 shows the permission prompt only once a channel exists
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'School news',
        description: 'Notices, homework, attendance and fees',
        importance: AndroidImportance.HIGH,
        lightColor: '#F5A524',
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain && ask) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) {
      set({ status: permission.canAskAgain ? 'undetermined' : 'denied', token: null });
      return;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
    set({ status: 'granted', token });
  } catch {
    // offline, or no push setup in this build: try again on the next start
    set({ status: state.token ? 'granted' : 'unavailable' });
  }
}

/** Give the token to each account on the phone, or take it back from those
 *  that turned notifications off. */
export async function syncPush(accountIds: string[]): Promise<void> {
  const off: Record<string, boolean> = {};
  for (const id of accountIds) {
    try {
      off[id] = (await AsyncStorage.getItem(offKey(id))) === '1';
      const sent = await AsyncStorage.getItem(sentKey(id));
      if (off[id] || !state.token) {
        if (sent && off[id]) {
          await api(id, 'me/push-token', { method: 'DELETE' });
          await AsyncStorage.removeItem(sentKey(id));
        }
      } else if (sent !== state.token) {
        await api(id, 'me/push-token', { method: 'PUT', body: { token: state.token } });
        await AsyncStorage.setItem(sentKey(id), state.token);
      }
    } catch {
      // offline: the next start or return to the app tries again
    }
  }
  set({ off });
}

export async function setPushFor(accountId: string, on: boolean, accountIds: string[]) {
  await AsyncStorage.setItem(offKey(accountId), on ? '0' : '1');
  if (on) await refreshPush(true);
  await syncPush(accountIds);
}

/** A new sign-in gets the token again even if this phone sent it before. */
export async function forgetPushFor(accountId: string) {
  await AsyncStorage.multiRemove([sentKey(accountId), offKey(accountId)]).catch(() => undefined);
}

export function usePush() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
