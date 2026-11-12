import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthExpiredError } from '../auth/AuthProvider';
import { GmailError, type GmailClient } from '../gmail/client';
import { DexieStorage } from '../storage/dexieAdapter';
import type { FilterActions, Sender } from '../storage/types';
import { commitQueue, markManualDone } from './commit';
import { describeFilter, removeFilter } from './filter';
import { deckOrder } from '../state/deckLogic';
import { escalationLadder, nextEscalation } from './escalation';
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

function fakeGmail(options: { sendFails?: Error; bodyHtml?: string; filterFails?: Error } = {}) {
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
    labels: [] as { id: string; name: string }[],
    filters: [] as unknown[],
    listLabels: vi.fn(async () => gmail.labels),
    createLabel: vi.fn(async (name: string) => {
      const label = { id: `Label_${gmail.labels.length + 1}`, name };
      gmail.labels.push(label);
      return label;
    }),
    createFilter: vi.fn(async (filter: unknown) => {
      if (options.filterFails) throw options.filterFails;
      gmail.filters.push(filter);
      return { id: `filter-${gmail.filters.length}` };
    }),
    reportSpamFrom: vi.fn(async () => 7),
    listAllMessages: vi.fn(async (q: string) => (q.includes('in:inbox') ? [{ id: 'i1', threadId: 't' }, { id: 'i2', threadId: 't' }] : [])),
    modified: [] as unknown[],
    batchModify: vi.fn(async (ids: string[], change: unknown) => void gmail.modified.push({ ids, change })),
    deleteFilter: vi.fn(async () => {}),
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

    expect(summary).toEqual({ unsubscribed: 2, manual: 2, blocked: 0, filtered: 0, failed: 0, archiveFailed: 0, stoppedBy: null, remaining: 0 });
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

describe('escalation', () => {
  const offender = (id: string, methods: Sender['unsubMethods'], escalationStep: number): Sender => ({
    ...sender(id, methods),
    prevStatus: 'repeat_offender',
    escalationStep,
    unsubscribedAt: '2026-09-01T00:00:00.000Z',
    returnCount: 3,
  });
  const run = (gmail = fakeGmail()) => commitQueue({ gmail, storage, executor: okExecutor, selfAddress: 'me@gmail.com' });

  it('builds the ladder from what the sender supports', () => {
    const all = offender('a@x.com', { oneClickUrl: 'https://x.com/1c', mailto: 'mailto:u@x.com', httpUrl: 'https://x.com/1c' }, 1);
    expect(escalationLadder(all, new Set())).toEqual(['retry_one_click', 'email', 'manual_link', 'block', 'report_spam']);
    expect(escalationLadder(offender('b@x.com', {}, 1), new Set())).toEqual(['block', 'report_spam']);
    expect(escalationLadder(offender('c@x.com', { mailto: 'mailto:friend@x.com' }, 1), new Set(['friend@x.com']))).toEqual(['block', 'report_spam']);
  });

  it('walks up one rung per escalation and stays on the last', () => {
    const methods = { oneClickUrl: 'https://x.com/1c', mailto: 'mailto:u@x.com' };
    expect([1, 2, 3, 4, 9].map((step) => nextEscalation(offender('a@x.com', methods, step), new Set()))).toEqual([
      'retry_one_click',
      'email',
      'block',
      'report_spam',
      'report_spam',
    ]);
  });

  it('retries one-click and starts a new grace period', async () => {
    await queue(offender('a@x.com', { oneClickUrl: 'https://x.com/1c' }, 1));
    const summary = await run();
    expect(summary.unsubscribed).toBe(1);
    const stored = await storage.getSender('a@x.com');
    expect(stored).toMatchObject({ status: 'unsubscribed', escalationStep: 2, returnCount: 3 });
    expect(stored!.unsubscribedAt! > '2026-09-01T00:00:00.000Z').toBe(true);
  });

  it('blocks with a labelled Gmail filter, creating the label on first use', async () => {
    await queue(offender('b@x.com', { oneClickUrl: 'https://x.com/1c' }, 2));
    const gmail = fakeGmail();
    const summary = await run(gmail);
    expect(summary.blocked).toBe(1);
    expect(gmail.labels.map((l) => l.name)).toEqual(['Unsubber', 'Unsubber/Blocked']);
    expect(gmail.filters).toEqual([{ criteria: { from: 'b@x.com' }, action: { addLabelIds: ['Label_2'], removeLabelIds: ['INBOX'] } }]);
    expect(await storage.getMeta('blockedLabelId')).toBe('Label_2');
    expect((await storage.getSender('b@x.com'))?.status).toBe('blocked');
    expect((await storage.listAttempts('b@x.com')).map((a) => `${a.method}:${a.detail}`)).toEqual(['filter_block:filter-1']);
  });

  it('reports spam as the last step', async () => {
    await queue(offender('c@x.com', {}, 2));
    const gmail = fakeGmail();
    await run(gmail);
    expect(gmail.reportSpamFrom).toHaveBeenCalledWith('c@x.com');
    expect((await storage.getSender('c@x.com'))?.status).toBe('blocked');
  });

  it('sends a link-only offender back to the manual queue', async () => {
    await queue(offender('d@x.com', { httpUrl: 'https://x.com/prefs' }, 1));
    expect((await run()).manual).toBe(1);
    expect((await storage.getSender('d@x.com'))?.status).toBe('manual');
  });

  it('puts a failed escalation back in Main without stopping the run', async () => {
    await queue(offender('e@x.com', {}, 1), sender('f@x.com', { oneClickUrl: 'https://x.com/1c' }));
    const summary = await run(fakeGmail({ filterFails: new GmailError(400, 'Invalid filter') }));
    expect(summary).toMatchObject({ failed: 1, unsubscribed: 1, stoppedBy: null });
    expect((await storage.getSender('e@x.com'))?.status).toBe('repeat_offender');
    expect(deckOrder('main', await storage.listSenders())).toEqual(['e@x.com']);
  });

  it('treats an existing identical filter as blocked', async () => {
    await queue(offender('g@x.com', {}, 1));
    await run(fakeGmail({ filterFails: new GmailError(400, 'Filter already exists') }));
    expect((await storage.getSender('g@x.com'))?.status).toBe('blocked');
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

describe('filter swipe', () => {
  const actions: FilterActions = { skipInbox: true, markRead: true, label: 'Unsubber/x.com' };
  async function queueFilter(s: Sender, filter = actions) {
    await storage.upsertSenders([{ ...s, status: 'queued', prevStatus: 'new' }]);
    await storage.enqueue({ senderId: s.id, createdAt: new Date().toISOString(), filter });
  }

  it('creates the Gmail filter, nests the label, and applies it to inbox mail now', async () => {
    await queueFilter(sender('receipts@x.com', { oneClickUrl: 'https://x.com/1c' }));
    const gmail = fakeGmail();
    const summary = await commitQueue({ gmail, storage, executor: okExecutor, selfAddress: 'me@gmail.com' });

    expect(summary).toMatchObject({ filtered: 1, unsubscribed: 0, failed: 0 });
    expect(okExecutor.oneClick).not.toHaveBeenCalledWith('https://x.com/1c');
    expect(gmail.labels.map((l) => l.name)).toEqual(['Unsubber', 'Unsubber/x.com']);
    expect(gmail.filters).toEqual([
      { criteria: { from: 'receipts@x.com' }, action: { addLabelIds: ['Label_2'], removeLabelIds: ['INBOX', 'UNREAD'] } },
    ]);
    expect(gmail.listAllMessages).toHaveBeenCalledWith('from:receipts@x.com in:inbox');
    expect(gmail.modified).toEqual([{ ids: ['i1', 'i2'], change: { addLabelIds: ['Label_2'], removeLabelIds: ['INBOX', 'UNREAD'] } }]);

    const stored = await storage.getSender('receipts@x.com');
    expect(stored).toMatchObject({ status: 'filtered', filter: { id: 'filter-1', actions } });
    expect(await storage.listQueue()).toEqual([]);
    expect((await storage.listAttempts('receipts@x.com')).map((a) => `${a.method}:${a.result}`)).toEqual(['filter_archive:sent']);
  });

  it('can just mark as read without moving anything', async () => {
    await queueFilter(sender('news@x.com', {}), { skipInbox: false, markRead: true, label: null });
    const gmail = fakeGmail();
    await commitQueue({ gmail, storage, executor: okExecutor, selfAddress: 'me@gmail.com' });
    expect(gmail.filters).toEqual([{ criteria: { from: 'news@x.com' }, action: { removeLabelIds: ['UNREAD'] } }]);
    expect(gmail.createLabel).not.toHaveBeenCalled();
  });

  it('puts the sender back if the filter fails', async () => {
    await queueFilter(sender('bad@x.com', {}));
    await commitQueue({ gmail: fakeGmail({ filterFails: new GmailError(400, 'Invalid filter') }), storage, executor: okExecutor, selfAddress: 'me@gmail.com' });
    expect((await storage.getSender('bad@x.com'))?.status).toBe('new');
    expect((await storage.listAttempts('bad@x.com')).map((a) => a.result)).toEqual(['failed']);
  });

  it('removes the filter from History and treats the sender as a keep', async () => {
    const filtered: Sender = { ...sender('r@x.com', {}), status: 'filtered', filter: { id: 'f-9', actions, at: '2026-11-12T00:00:00.000Z' } };
    await storage.upsertSenders([filtered]);
    const gmail = fakeGmail();
    const updated = await removeFilter(filtered, { gmail, storage });
    expect(gmail.deleteFilter).toHaveBeenCalledWith('f-9');
    expect(updated).toMatchObject({ status: 'kept', countAtKeep: 3, filter: undefined });
  });

  it('describes what a filter does', () => {
    expect(describeFilter(actions)).toBe('skips the inbox, marked as read, labeled Unsubber/x.com');
    expect(describeFilter({ skipInbox: false, markRead: true, label: null })).toBe('marked as read');
  });
});
