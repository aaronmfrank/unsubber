import { AuthExpiredError, type AuthProvider } from '../auth';
import { backoffDelay, createLimiter, isRetryableStatus, sleep } from './rateLimit';
import type { GmailMessage, GmailMessageList, GmailMessageRef, GmailProfile } from './types';

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const MAX_RETRIES = 6;

export class GmailError extends Error {
  override name = 'GmailError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GmailClientEvents {
  onTokenRefreshed?(): void;
  onAuthExpired?(): void;
}

export type GmailClient = ReturnType<typeof createGmailClient>;

export function createGmailClient(auth: AuthProvider, events: GmailClientEvents = {}) {
  // Gmail allows 250 quota units per user per second; most calls cost 5.
  const limiter = createLimiter({ maxConcurrent: 10, perSecond: 40 });
  let forceInvalidTokenOnce = false;
  let refreshing: Promise<string> | null = null;

  function refreshToken(): Promise<string> {
    refreshing ??= auth
      .refresh()
      .then((token) => {
        events.onTokenRefreshed?.();
        return token;
      })
      .catch((error: unknown) => {
        if (error instanceof AuthExpiredError) events.onAuthExpired?.();
        throw error;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  async function currentToken(): Promise<string> {
    if (refreshing) return refreshing;
    if (forceInvalidTokenOnce) {
      forceInvalidTokenOnce = false;
      return 'invalid-token-for-refresh-check';
    }
    return auth.getToken() ?? refreshToken();
  }

  function send(path: string, init: RequestInit, token: string): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return limiter.run(() => fetch(`${BASE_URL}${path}`, { ...init, headers }));
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await send(path, init, await currentToken());
      } catch (error) {
        if (error instanceof AuthExpiredError || attempt >= MAX_RETRIES) throw error;
        await sleep(backoffDelay(attempt));
        continue;
      }

      if (response.status === 401 && !refreshed) {
        refreshed = true;
        await refreshToken();
        attempt--;
        continue;
      }
      if ((isRetryableStatus(response.status) || (await isRateLimited403(response))) && attempt < MAX_RETRIES) {
        await sleep(backoffDelay(attempt, response.headers.get('Retry-After')));
        continue;
      }
      if (!response.ok) throw new GmailError(response.status, await errorMessage(response));
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
  }

  return {
    request,

    getProfile: () => request<GmailProfile>('/profile'),

    listMessages(q: string, pageToken?: string) {
      const params = new URLSearchParams({ q, maxResults: '500' });
      if (pageToken) params.set('pageToken', pageToken);
      return request<GmailMessageList>(`/messages?${params}`);
    },

    /** Pages through every message matching `q`. */
    async listAllMessages(q: string, onPage?: (countSoFar: number) => void): Promise<GmailMessageRef[]> {
      const all: GmailMessageRef[] = [];
      let pageToken: string | undefined;
      do {
        const page = await this.listMessages(q, pageToken);
        all.push(...(page.messages ?? []));
        onPage?.(all.length);
        pageToken = page.nextPageToken;
      } while (pageToken);
      return all;
    },

    getMessageMetadata(id: string, headers: readonly string[]) {
      const params = new URLSearchParams({ format: 'metadata' });
      for (const header of headers) params.append('metadataHeaders', header);
      return request<GmailMessage>(`/messages/${encodeURIComponent(id)}?${params}`);
    },

    /** Makes the next request use a bad token so Gmail returns a real 401. */
    forceUnauthorizedOnce() {
      forceInvalidTokenOnce = true;
    },
  };
}

async function isRateLimited403(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const body = (await response.clone().json()) as { error?: { errors?: { reason?: string }[] } };
    const reason = body.error?.errors?.[0]?.reason;
    return reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded';
  } catch {
    return false;
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // Body wasn't JSON; fall through to the status text.
  }
  return `Gmail request failed (${response.status} ${response.statusText}).`;
}
