// Sign-outs the server has not heard about yet.
//
// Signing out ends the session on the server, and with it every notification
// the server sends this phone for that account. Without a connection the app
// still forgets the account at once, but keeps the session's refresh token
// (in secure storage) until the server confirms. Until then the server would
// go on sending this phone that account's notices, attendance and fees, so the
// sign-out is tried again at start, on return to the app, and when the offline
// queue runs.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api, ApiError, forgetTokens } from '@/api/client';

export type SignOutPath = 'auth/signout' | 'auth/signout-all';

const KEY = 'schoolcore.leaving';

async function pending(): Promise<Record<string, SignOutPath>> {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as unknown;
    return saved && typeof saved === 'object' ? (saved as Record<string, SignOutPath>) : {};
  } catch {
    return {};
  }
}

async function keep(list: Record<string, SignOutPath>) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => undefined);
}

/** True when the session is over on the server: it said so, or it had already
 *  ended it (401). Offline, a server error or a refusal to serve this version
 *  leaves it for another try. */
async function tell(accountId: string, path: SignOutPath): Promise<boolean> {
  try {
    await api(accountId, path, { method: 'POST', body: {} });
    return true;
  } catch (error) {
    return error instanceof ApiError && error.status === 401;
  }
}

/** End the session on the server, or remember to. The tokens are forgotten
 *  once the server has heard. */
export async function signOutOnServer(accountId: string, path: SignOutPath): Promise<void> {
  if (await tell(accountId, path)) {
    await forgetTokens(accountId);
    return;
  }
  await keep({ ...(await pending()), [accountId]: path });
}

let running: Promise<void> | null = null;

/** Try the waiting sign-outs again. */
export function retrySignOuts(): Promise<void> {
  running ??= (async () => {
    const list = await pending();
    const ids = Object.keys(list);
    if (!ids.length) return;
    for (const id of ids) {
      if (await tell(id, list[id])) {
        await forgetTokens(id);
        delete list[id];
      }
    }
    await keep(list);
  })().finally(() => {
    running = null;
  });
  return running;
}
