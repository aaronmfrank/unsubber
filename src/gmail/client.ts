import { AuthExpiredError, type AuthProvider } from '../auth';
import { backoffDelay, createLimiter, isRateLimitError, isServerError, sleep } from './rateLimit';
import type {
  GmailFilter,
  GmailHistoryPage,
  GmailLabel,
  GmailMessage,
  GmailMessageList,
  GmailMessageRef,
  GmailProfile,
} from './types';

const BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';
/** With backoff capped at 64 seconds, this rides out a full per-minute quota window several times over. */
const MAX_RETRIES = 8;
const BATCH_MODIFY_LIMIT = 1000;
const SKIPPED_LABELS = new Set(['SENT', 'DRAFT', 'CHAT', 'SPAM', 'TRASH']);

export class GmailError extends Error {
  override name = 'GmailError';
  constructor(
    readonly status: number,
    message: string,
    readonly rateLimited = false,
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
  // Gmail's per-user quota is 15,000 units a minute and most calls cost 5. 25 calls a second
  // uses half of it, leaving room for bursts and for the app open on a second device.
  const limiter = createLimiter({ maxConcurrent: 10, perSecond: 25 });
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
    let refreshedToken: string | null = null;
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await send(path, init, refreshedToken ?? (await currentToken()));
      } catch (error) {
        if (error instanceof AuthExpiredError || attempt >= MAX_RETRIES) throw error;
        await sleep(backoffDelay(attempt));
        continue;
      }

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      }
      if (response.status === 401 && !refreshedToken) {
        refreshedToken = await refreshToken();
        attempt--;
        continue;
      }

      const body = await readJson(response);
      const canRetry = attempt < MAX_RETRIES;
      if (isRateLimitError(response.status, body)) {
        if (!canRetry) throw new GmailError(response.status, errorMessage(response, body), true);
        // Per-user limits are shared, so every request waits, not just this one.
        limiter.pause(backoffDelay(attempt + 1, response.headers.get('Retry-After')));
        continue;
      }
      if (isServerError(response.status) && canRetry) {
        await sleep(backoffDelay(attempt));
        continue;
      }
      throw new GmailError(response.status, errorMessage(response, body));
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

    /** The whole message, body included. Only used to look for unsubscribe links; bodies are never stored. */
    getMessageFull(id: string) {
      return request<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`);
    },

    /** Sends a base64url-encoded RFC 2822 message. */
    sendMessage(raw: string) {
      return request<GmailMessageRef>('/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
    },

    async batchModify(ids: string[], change: { addLabelIds?: string[]; removeLabelIds?: string[] }) {
      for (let start = 0; start < ids.length; start += BATCH_MODIFY_LIMIT) {
        await request<void>('/messages/batchModify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ids.slice(start, start + BATCH_MODIFY_LIMIT), ...change }),
        });
      }
    },

    /** Archives a sender's inbox mail. `in:inbox` keeps Spam and Trash out of reach. Returns how many moved. */
    async archiveFrom(address: string): Promise<number> {
      const refs = await this.listAllMessages(`from:${address} in:inbox`);
      await this.batchModify(
        refs.map((ref) => ref.id),
        { removeLabelIds: ['INBOX'] },
      );
      return refs.length;
    },

    /**
     * Messages added since `startHistoryId`: incoming `ids` (skipping drafts, chats, spam and trash) and
     * `sentIds`, whose recipients join the people-you-email set.
     * Throws a 404 GmailError when the history id has expired (after about a week).
     */
    async listAddedMessageIds(startHistoryId: string): Promise<{ ids: string[]; sentIds: string[]; historyId: string }> {
      const ids = new Set<string>();
      const sentIds = new Set<string>();
      let pageToken: string | undefined;
      let historyId = startHistoryId;
      do {
        const params = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded', maxResults: '500' });
        if (pageToken) params.set('pageToken', pageToken);
        const page = await request<GmailHistoryPage>(`/history?${params}`);
        for (const entry of page.history ?? []) {
          for (const { message } of entry.messagesAdded ?? []) {
            const labels = message.labelIds ?? [];
            if (labels.includes('SENT')) sentIds.add(message.id);
            else if (!labels.some((label) => SKIPPED_LABELS.has(label))) ids.add(message.id);
          }
        }
        historyId = page.historyId;
        pageToken = page.nextPageToken;
      } while (pageToken);
      return { ids: [...ids], sentIds: [...sentIds], historyId };
    },

    listLabels: async () => (await request<{ labels?: GmailLabel[] }>('/labels')).labels ?? [],

    createLabel: (name: string) =>
      request<GmailLabel>('/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
      }),

    createFilter: (filter: Omit<GmailFilter, 'id'>) =>
      request<GmailFilter>('/settings/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filter),
      }),

    /** Moves a sender's mail to Spam. Mail already in Spam or Trash is left alone. Returns how many moved. */
    async reportSpamFrom(address: string): Promise<number> {
      const refs = await this.listAllMessages(`from:${address} -in:spam -in:trash`);
      await this.batchModify(
        refs.map((ref) => ref.id),
        { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
      );
      return refs.length;
    },

    /** Makes the next request use a bad token so Gmail returns a real 401. */
    forceUnauthorizedOnce() {
      forceInvalidTokenOnce = true;
    },
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(response: Response, body: unknown): string {
  const message = (body as { error?: { message?: string } } | null)?.error?.message;
  return message || `Gmail request failed (${response.status} ${response.statusText}).`;
}
