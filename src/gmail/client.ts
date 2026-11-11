import { AuthExpiredError, type AuthProvider } from '../auth';

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class GmailError extends Error {
  override name = 'GmailError';
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GmailProfile {
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId: string;
}

export interface GmailClientEvents {
  onTokenRefreshed?(): void;
  onAuthExpired?(): void;
}

export type GmailClient = ReturnType<typeof createGmailClient>;

export function createGmailClient(auth: AuthProvider, events: GmailClientEvents = {}) {
  let forceInvalidTokenOnce = false;

  async function refreshToken(): Promise<string> {
    try {
      const token = await auth.refresh();
      events.onTokenRefreshed?.();
      return token;
    } catch (error) {
      if (error instanceof AuthExpiredError) events.onAuthExpired?.();
      throw error;
    }
  }

  async function send(path: string, init: RequestInit, token: string): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${BASE_URL}${path}`, { ...init, headers });
  }

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let token = auth.getToken() ?? (await refreshToken());
    if (forceInvalidTokenOnce) {
      forceInvalidTokenOnce = false;
      token = 'invalid-token-for-refresh-check';
    }

    let response = await send(path, init, token);
    if (response.status === 401) response = await send(path, init, await refreshToken());

    if (!response.ok) throw new GmailError(response.status, await errorMessage(response));
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    request,
    getProfile: () => request<GmailProfile>('/profile'),
    /** Makes the next request use a bad token so Gmail returns a real 401. */
    forceUnauthorizedOnce() {
      forceInvalidTokenOnce = true;
    },
  };
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
