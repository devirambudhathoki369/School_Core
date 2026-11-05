// The one door to /api/mobile/v1/.
//
// - Signed-in calls carry `Authorization: Bearer <access token>`, refreshed
//   quietly a little before it expires, and once more on a 401.
// - Every call is sent with `credentials: 'omit'`, so no cookie is ever
//   stored or sent.
// - The server's errors are {"error": {code, message, fields}}.
// - A 426 means this app version is too old; the whole app then shows the
//   update screen.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { readSecret, writeSecret } from '@/accounts/secure';
import type { Tokens } from './types';

const ORIGIN = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
export const API_BASE = `${ORIGIN}/api/mobile/v1/`;
export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// --- app-wide signals -----------------------------------------------------
type Listener<T> = (value: T) => void;
function signal<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    emit: (value: T) => listeners.forEach((l) => l(value)),
    listen: (l: Listener<T>) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}
/** The server asked for a newer app (426). */
export const updateRequired = signal<string>();
/** The server ended an account's session; the id is the session id. */
export const accountEnded = signal<string>();

// --- requests ---------------------------------------------------------------
type Options = { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; token?: string };

async function request<T>(path: string, { method = 'GET', body, token }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-App-Version': APP_VERSION,
    'X-Platform': Platform.OS,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'offline', "Can't reach the school server. Check your internet connection.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;
  let data: unknown = null;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string; fields?: Record<string, string> } })?.error;
    const code = error?.code ?? (response.status >= 500 ? 'server_error' : 'error');
    const message =
      error?.message ??
      (response.status >= 500 ? 'The school server had a problem. Please try again shortly.' : 'Something went wrong.');
    if (response.status === 426) updateRequired.emit(message);
    throw new ApiError(response.status, code, message, error?.fields);
  }
  return data as T;
}

/** A call that needs no sign-in: the school code and the sign-ins. */
export function publicApi<T>(path: string, options?: Omit<Options, 'token'>) {
  return request<T>(path, options);
}

// --- tokens -----------------------------------------------------------------
const refreshKey = (accountId: string) => `schoolcore.refresh.${accountId}`;
const access = new Map<string, { token: string; expiresAt: number }>();
const refreshing = new Map<string, Promise<string>>();

export async function rememberTokens(accountId: string, tokens: Tokens) {
  access.set(accountId, { token: tokens.access_token, expiresAt: tokens.access_expires_at });
  await writeSecret(refreshKey(accountId), tokens.refresh_token);
}

export async function forgetTokens(accountId: string) {
  access.delete(accountId);
  await writeSecret(refreshKey(accountId), null);
}

async function accessToken(accountId: string, force = false): Promise<string> {
  const known = access.get(accountId);
  if (!force && known && known.expiresAt - 30 > Date.now() / 1000) return known.token;
  const running = refreshing.get(accountId);
  if (running) return running;
  const job = (async () => {
    const refreshToken = await readSecret(refreshKey(accountId));
    if (!refreshToken) {
      accountEnded.emit(accountId);
      throw new ApiError(401, 'signed_out', 'Please sign in again.');
    }
    try {
      const answer = await request<{ tokens: Tokens }>('auth/refresh', {
        method: 'POST',
        body: { refresh_token: refreshToken },
      });
      await rememberTokens(accountId, answer.tokens);
      return answer.tokens.access_token;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) accountEnded.emit(accountId);
      throw error;
    }
  })().finally(() => refreshing.delete(accountId));
  refreshing.set(accountId, job);
  return job;
}

/** A call as one signed-in account on this phone. */
export async function api<T>(accountId: string, path: string, options: Omit<Options, 'token'> = {}): Promise<T> {
  const token = await accessToken(accountId);
  try {
    return await request<T>(path, { ...options, token });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const fresh = await accessToken(accountId, true);
    try {
      return await request<T>(path, { ...options, token: fresh });
    } catch (again) {
      if (again instanceof ApiError && again.status === 401) accountEnded.emit(accountId);
      throw again;
    }
  }
}

/** Where a server media path points. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return /^https?:\/\//.test(path) ? path : `${ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}
