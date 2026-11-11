import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthProvider } from '../auth';
import { createGmailClient, GmailError } from './client';

const auth: AuthProvider = {
  mode: 'popup',
  init: async () => {},
  signIn: async () => {},
  getToken: () => 'token',
  refresh: async () => 'token-2',
  signOut: async () => {},
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const quotaError = () =>
  json(429, { error: { code: 429, message: "Quota exceeded for quota metric 'Total Query Cost'", status: 'RESOURCE_EXHAUSTED' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Gmail client retries', () => {
  it('pauses every request after a rate limit, then retries', async () => {
    fetchMock.mockResolvedValueOnce(quotaError()).mockImplementation(async () => json(200, { id: 'ok' }));
    const gmail = createGmailClient(auth);

    const first = gmail.request('/messages/a');
    await vi.advanceTimersByTimeAsync(0);
    const second = gmail.request('/messages/b');

    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toEqual({ id: 'ok' });
    await expect(second).resolves.toEqual({ id: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up with a rate-limited error once retries run out', async () => {
    fetchMock.mockImplementation(async () => quotaError());
    const gmail = createGmailClient(auth);
    const result = gmail.request('/messages/a').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10 * 65_000);
    const error = await result;
    expect(error).toBeInstanceOf(GmailError);
    expect((error as GmailError).rateLimited).toBe(true);
  });

  it('refreshes the token once on a 401', async () => {
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(200, { ok: true }));
    const gmail = createGmailClient(auth);
    await expect(gmail.request('/profile')).resolves.toEqual({ ok: true });
    const secondAuth = new Headers((fetchMock.mock.calls[1]![1] as RequestInit).headers).get('Authorization');
    expect(secondAuth).toBe('Bearer token-2');
  });

  it('does not retry permission errors', async () => {
    fetchMock.mockResolvedValue(json(403, { error: { message: 'Insufficient Permission', errors: [{ reason: 'insufficientPermissions' }] } }));
    const gmail = createGmailClient(auth);
    await expect(gmail.request('/profile')).rejects.toMatchObject({ status: 403, rateLimited: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
