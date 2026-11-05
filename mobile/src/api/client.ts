// One door to the SchoolCore API.
//
// The token rides in the `Authorization: IGNITE <token>` header, and every
// request is sent with `credentials: 'omit'`. Sign-in also sets the portal's
// session cookie, and the server reads a cookie BEFORE the header; a write
// carried by that cookie with no Origin (an app never sends one) is refused as
// cross-site. Omitting credentials keeps React Native from storing or sending
// the cookie on Android and iOS, so the header is the only credential.

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '');
const TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let currentToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(token: string | null) {
  currentToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

type Params = Record<string, string | number | boolean | null | undefined>;

function buildUrl(path: string, params?: Params) {
  const query = Object.entries(params ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${BASE_URL}${path}${query ? `?${query}` : ''}`;
}

function messageFor(status: number, data: unknown): string {
  const body = (data ?? {}) as Record<string, unknown>;
  const raw = body.message ?? body.detail;
  // Errors raised while saving arrive as a list: {"message": ["…"]}.
  const said = Array.isArray(raw) ? raw[0] : raw;
  if (typeof said === 'string' && said.trim() && said !== 'Invalid request!') return said;
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'This is not available for your account.';
  if (status === 404) return 'Nothing was found.';
  if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (status >= 500) return 'The school server had a problem. Please try again shortly.';
  return 'The request could not be completed.';
}

export async function api<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; params?: Params; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', params, body, auth = true } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && currentToken) headers.Authorization = `IGNITE ${currentToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      "Can't reach the school server. Check your internet connection and try again.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401 && auth && currentToken) onUnauthorized?.();
    throw new ApiError(messageFor(response.status, data), response.status);
  }
  return data as T;
}

export const apiBaseUrl = BASE_URL;

/** Media paths come back relative ("/media/…") or absolute. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
