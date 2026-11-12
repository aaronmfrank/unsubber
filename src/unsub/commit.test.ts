import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthExpiredError } from '../auth/AuthProvider';
import { GmailError, type GmailClient } from '../gmail/client';
import { DexieStorage } from '../storage/dexieAdapter';
import type { Sender } from '../storage/types';
import { commitQueue, markManualDone } from './commit';
import type { UnsubExecutor } from './executor';

function sender(id: string, unsubMethods: Sender['unsubMethods']): Sender {
  return {
    id,
    displayName: id,
    domain: 'x.com',
    listIds: [],
    messageCount: 3,
    lastReceivedAt: '2026-11-01T00:00:00.000Z',
    latestSubject: '',
    latestSnippet: '',
    latestMessageId: `m-${id}`,
    latestThreadId: `t-${id}`,
    unsubMethods,
    status: 'queued',
    prevStatus: 'new',
    escalationStep: 0,
    returnCount: 0,
  };
}

function fakeGmail(options: { sendFails?: Error; bodyHtml?: string } = {}) {
  const archived: string[] = [];
  const sent: string[] = [];
  let sendCount = 0;
  const gmail = {
    archived,
    sent,
    sendMessage: vi.fn(async (raw: string) => {
      if (options.sendFails) throw options.sendFails;
      sent.push(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
      return { id: `sent-${++sendCount}`, threadId: 't' };
    }),
    getMessageFull: vi.fn(async () => ({
      id: 'm',
      threadId: 't',
      internalDate: '0',
      payload: { mimeType: 'text/html', body: { data: btoa(options.bodyHtml ?? '') } },
    })),
    archiveFrom: vi.fn(async (address: string) => {
      archived.push(address);
      return 2;
    }),
  };
  return gmail as typeof gmail & GmailClient;
}

const okExecutor: UnsubExecutor = { oneClick: vi.fn(async (url: string) => ({ result: 'sent_unconfirmed' as const, detail: url })) };
const failingExecutor: UnsubExecutor = {
  oneClick: async () => {
    throw new TypeError('Failed to fetch');
  },
};

let storage: DexieStorage;
let n = 0;

async function queue(...senders: Sender[]) {
  await storage.upsertSenders(senders);
  for (const s of senders) await storage.enqueue({ senderId: s.id, createdAt: new Date().toISOString() });
}

beforeEach(() => {
  storage = new DexieStorage(`commit-${n++}`);
});

describe('commitQueue', () => {
  it('unsubscribes by one-click and email, routes the rest to manual, and archives everyone', async () => {
    await queue(
      sender('oneclick@a.com', { oneClickUrl: 'https://a.com/1c', httpUrl: 'https://a.com/1c' }),
      sender('mail@b.com', { mailto: 'mailto:unsub@b.com?subject=remove' }),
      sender('link@c.com', { httpUrl: 'https://c.com/prefs' }),
      sender('none@d.com', {}),
    );
    const gmail = fakeGmail({ bodyHtml: '<a href="https://d.com/unsubscribe">Unsubscribe</a>' });
    const summary = await commitQueue({ gmail, storage, executor: okExecutor, selfAddress: 'me@gmail.com' });

    expect(summary).toEqual({ unsubscribed: 2, manual: 2, archiveFailed: 0, stoppedBy: null, remaining: 0 });
    expect(gmail.archived.sort()).toEqual(['link@c.com', 'mail@b.com', 'none@d.com', 'oneclick@a.com']);
    expect(await storage.listQueue()).toEqual([]);

    expect(await storage.listSentByApp()).toEqual(new Set(['sent-1']));
    expect(gmail.sent[0]).toContain('To: unsub@b.com\r\nSubject: remove');

    const stored = await storage.getSenders(['oneclick@a.com', 'mail@b.com', 'link@c.com', 'none@d.com']);
    expect(stored.get('oneclick@a.com')).toMatchObject({ status: 'unsubscribed', escalationStep: 1 });
    expect(stored.get('oneclick@a.com')?.unsubscribedAt).toBeDefined();
    expect(stored.get('mail@b.com')?.status).toBe('unsubscribed');
    expect(stored.get('link@c.com')).toMatchObject({ status: 'manual', escalationStep: 0 });
    expect(stored.get('none@d.com')).toMatchObject({ status: 'manual', unsubMethods: { bodyLinks: ['https://d.com/unsubscribe'] } });

    expect((await storage.listAttempts('oneclick@a.com')).map((a) => [a.method, a.result])).toEqual([['one_click', 'sent_unconfirmed']]);
    expect((await storage.listAttempts('mail@b.com')).map((a) => [a.method, a.result, a.detail])).toEqual([['mailto', 'sent', 'sent-1']]);
  });

  it('falls back to email when the one-click request fails', async () => {
    await queue(sender('both@a.com', { oneClickUrl: 'https://a.com/1c', mailto: 'mailto:u@a.com' }));
    const gmail = fakeGmail();
    await commitQueue({ gmail, storage, executor: failingExecutor, selfAddress: 'me@gmail.com' });
    expect((await storage.listAttempts('both@a.com')).map((a) => [a.method, a.result])).toEqual([
      ['one_click', 'failed'],
      ['mailto', 'sent'],
    ]);
    expect((await storage.getSender('both@a.com'))?.status).toBe('unsubscribed');
  });

  it('never emails someone you email', async () => {
    await storage.addPeople(['friend@a.com']);
    await queue(sender('list@a.com', { mailto: 'mailto:friend@a.com' }));
    const gmail = fakeGmail();
    await commitQueue({ gmail, storage, executor: okExecutor, selfAddress: 'me@gmail.com' });
    expect(gmail.sendMessage).not.toHaveBeenCalled();
    expect((await storage.getSender('list@a.com'))?.status).toBe('manual');
  });

  it('stops on an expired sign-in and leaves the rest queued', async () => {
    await queue(sender('mail@b.com', { mailto: 'mailto:u@b.com' }));
    const summary = await commitQueue({
      gmail: fakeGmail({ sendFails: new AuthExpiredError() }),
      storage,
      executor: okExecutor,
      selfAddress: 'me@gmail.com',
    });
    expect(summary.stoppedBy).toBeInstanceOf(AuthExpiredError);
    expect(summary.remaining).toBe(1);
    expect((await storage.getSender('mail@b.com'))?.status).toBe('queued');
    expect(await storage.listQueue()).toHaveLength(1);
  });

  it('routes a sender to manual when sending fails for a non-stopping reason', async () => {
    await queue(sender('mail@b.com', { mailto: 'mailto:u@b.com', httpUrl: 'https://b.com/u' }));
    await commitQueue({
      gmail: fakeGmail({ sendFails: new GmailError(400, 'Invalid To header') }),
      storage,
      executor: okExecutor,
      selfAddress: 'me@gmail.com',
    });
    expect((await storage.getSender('mail@b.com'))?.status).toBe('manual');
  });
});

describe('markManualDone', () => {
  it('starts the grace period and logs the link the user opened', async () => {
    const s = { ...sender('link@c.com', { httpUrl: 'https://c.com/prefs' }), status: 'manual' as const };
    await storage.upsertSenders([s]);
    const updated = await markManualDone(s, 'https://c.com/prefs', { storage, now: () => new Date('2026-11-11T12:00:00Z') });
    expect(updated).toMatchObject({ status: 'unsubscribed', unsubscribedAt: '2026-11-11T12:00:00.000Z', escalationStep: 1 });
    expect(await storage.listAttempts('link@c.com')).toMatchObject([
      { method: 'manual_link', result: 'done_by_user', detail: 'https://c.com/prefs' },
    ]);
  });
});
