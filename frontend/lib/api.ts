'use client';

import type { ApiResponse } from '@platform/shared';

/**
 * Tiny API client. Access token kept in memory (not localStorage → resilient to
 * XSS token theft); the refresh token lives in an httpOnly cookie set by the
 * backend. On a 401 we transparently call /auth/refresh once and retry.
 */
/**
 * Resolve the API origin. An explicit NEXT_PUBLIC_API_URL always wins (prod, or
 * a custom dev setup). Otherwise, in the browser, talk to the SAME host the page
 * is served from — `http://localhost:3000` → `http://localhost:4000`,
 * `http://127.0.0.1:3000` → `http://127.0.0.1:4000`, `http://<lan-ip>:3000` →
 * `http://<lan-ip>:4000`. This keeps the refresh cookie first-party: it's set
 * `SameSite=Lax`, so if the page is on 127.0.0.1 but the API on localhost, the
 * cookie is withheld on reload and the user gets bounced to /login even though
 * login itself succeeds. Resolved per-call (not at module load) so SSR can't
 * freeze in a `localhost` value that the browser then reuses on the wrong host.
 */
export function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

async function raw<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return raw<T>(path, init, false);
  }

  const body = (await res.json()) as ApiResponse<T>;
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}

/**
 * Single-flight refresh. Concurrent callers (React Strict Mode double-fires the
 * mount effect in dev, and a burst of 401s can each trigger a retry) share ONE
 * in-flight request. Without this, two refreshes with the same rotating cookie
 * make the backend's reuse-detection revoke the session — which looks exactly
 * like "login doesn't work / I get bounced to /login on reload".
 */
let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${getApiBase()}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
      const body = (await res.json()) as ApiResponse<{ accessToken: string | null }>;
      if (body.ok && body.data.accessToken) { setAccessToken(body.data.accessToken); return true; }
    } catch { /* fall through */ }
    return false;
  })();
  // Clear the cache once settled so the NEXT genuine 401 can refresh again.
  void refreshInFlight.finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export const api = {
  get: <T>(p: string) => raw<T>(p),
  post: <T>(p: string, body?: unknown) => raw<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(p: string, body?: unknown) => raw<T>(p, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  put: <T>(p: string, body?: unknown) => raw<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T>(p: string) => raw<T>(p, { method: 'DELETE' }),
  refresh: tryRefresh,
};

/** Open a realtime WS bound to the current access token, subscribe to channels. */
export function openRealtime(channels: string[], onMessage: (m: { channel: string; payload: unknown }) => void) {
  if (!accessToken) return () => {};
  const ws = new WebSocket(`${getApiBase().replace(/^http/, 'ws')}/ws?token=${accessToken}`);
  ws.onopen = () => channels.forEach((c) => ws.send(JSON.stringify({ type: 'subscribe', channel: c })));
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore */ } };
  return () => ws.close();
}
