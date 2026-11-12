import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GmailError, type GmailClient } from '../gmail/client';
import type { GmailMessage } from '../gmail/types';
import { DexieStorage } from '../storage/dexieAdapter';
import { deckOrder } from '../state/deckLogic';
import { runInitialScan, syncNewMail, type ScanDeps } from './scan';

interface FakeMessage {
  id: string;
  from: string;
  to?: string;
  sent?: boolean;
  date?: number;
  listId?: string;
}

function fakeGmail(messages: FakeMessage[], options: { failAfterGets?: number; historyExpired?: boolean } = {}) {
  let gets = 0;
  const toGmail = (m: FakeMessage): GmailMessage => ({
    id: m.id,
    threadId: `t-${m.id}`,
    snippet: `snippet ${m.id}`,
    internalDate: String(m.date ?? Date.UTC(2026, 10, 1)),
    payload: {
      headers: [
        { name: 'From', value: m.from },
        { name: 'To', value: m.to ?? 'me@gmail.com' },
        { name: 'Subject', value: `subject ${m.id}` },
        ...(m.listId ? [{ name: 'List-Id', value: `<${m.listId}>` }] : []),
      ],
    },
  });
  const client = {
    gets: () => gets,
    queries: [] as string[],
    getProfile: async () => ({ emailAddress: 'me@gmail.com', messagesTotal: 0, threadsTotal: 0, historyId: 'h-profile' }),
    listAddedMessageIds: async () => {
      if (options.historyExpired) throw new GmailError(404, 'Requested entity was not found.');
      return { ids: messages.filter((m) => !m.sent).map((m) => m.id), historyId: 'h2' };
    },
    listAllMessages: async (q: string) => {
      client.queries.push(q);
      return messages.filter((m) => Boolean(m.sent) === q.startsWith('in:sent')).map((m) => ({ id: m.id, threadId: `t-${m.id}` }));
    },
    getMessageMetadata: async (id: string) => {
      gets++;
      if (options.failAfterGets !== undefined && gets > options.failAfterGets) throw new GmailError(500, 'boom');
      const message = messages.find((m) => m.id === id);
      if (!message) throw new GmailError(404, 'gone');
      return toGmail(message);
    },
  };
  return client as typeof client & GmailClient;
}

const inbox: FakeMessage[] = [
  { id: 's1', from: 'Me <me@gmail.com>', to: '"Friend, Best" <friend@example.com>, coworker@work.com', sent: true },
  { id: 's2', from: 'me@gmail.com', to: 'unsub@brandx.com', sent: true },
  { id: 'm1', from: 'Brand X <deals@brandx.com>' },
  { id: 'm2', from: 'Brand X <deals@brandx.com>' },
  { id: 'm3', from: 'Best Friend <Friend@example.com>' },
  { id: 'm4', from: 'Co Worker <coworker@work.com>' },
  { id: 'm5', from: 'News <news@paper.com>' },
  { id: 'm6', from: 'Me <me@gmail.com>' },
];

let storage: DexieStorage;
let dbCount = 0;

beforeEach(() => {
  storage = new DexieStorage(`test-${dbCount++}`);
});

function deps(gmail: GmailClient): ScanDeps {
  return { gmail, storage, selfAddress: 'me@gmail.com', onProgress: () => {} };
}

describe('runInitialScan', () => {
  it('groups senders and drops everyone you email, including yourself', async () => {
    await runInitialScan(deps(fakeGmail(inbox)));
    const senders = await storage.listSenders({ sort: 'messageCount' });
    expect(senders.map((s) => [s.id, s.messageCount])).toEqual([
      ['deals@brandx.com', 2],
      ['news@paper.com', 1],
    ]);
    expect(await storage.getMeta('historyId')).toBe('h-profile');
    expect(await storage.getMeta('scannedWindows')).toHaveLength(1);
    expect(await storage.getMeta('scanInProgress')).toBeUndefined();
  });

  it('leaves unsubscribe emails the app sent out of the people set', async () => {
    await storage.addSentByApp('s2');
    await runInitialScan(deps(fakeGmail([...inbox, { id: 'm7', from: 'unsub@brandx.com' }])));
    expect(await storage.getSender('unsub@brandx.com')).toBeDefined();
  });

  it('resumes an interrupted scan without double counting', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ id: `bulk${i}`, from: `promo${i % 3}@shop.com` }));
    const all = [...inbox, ...many];

    // People scan uses 2 gets; fail partway through the second batch of 100.
    await expect(runInitialScan(deps(fakeGmail(all, { failAfterGets: 150 })))).rejects.toThrow('boom');
    expect(await storage.getMeta('scanInProgress')).toBeDefined();

    const resumed = fakeGmail(all);
    await runInitialScan(deps(resumed));
    expect(resumed.gets()).toBeLessThan(all.length - 50);

    const counts = Object.fromEntries((await storage.listSenders()).map((s) => [s.id, s.messageCount]));
    expect(counts).toEqual({ 'deals@brandx.com': 2, 'news@paper.com': 1, 'promo0@shop.com': 84, 'promo1@shop.com': 83, 'promo2@shop.com': 83 });
    expect(await storage.countMessages()).toBe(253);
  });
});

describe('syncNewMail', () => {
  const unsubscribedAt = '2026-10-01T15:00:00.000Z';
  const day = (d: number) => Date.UTC(2026, 9, d, 12);

  async function seedUnsubscribed() {
    await runInitialScan(deps(fakeGmail([...inbox.filter((m) => m.sent), { id: 'old', from: 'Brand <deals@brand.com>', listId: 'deals.brand.com', date: day(1) }])));
    const brand = (await storage.getSender('deals@brand.com'))!;
    await storage.upsertSenders([{ ...brand, status: 'unsubscribed', unsubscribedAt, escalationStep: 1 }]);
    await storage.upsertSenders([
      { ...brand, id: 'kept@brand.com', status: 'kept', listIds: [] },
    ]);
  }

  const arrivals: FakeMessage[] = [
    { id: 'in-grace', from: 'Brand <deals@brand.com>', listId: 'deals.brand.com', date: day(8) },
    { id: 'after-grace', from: 'Brand <deals@brand.com>', listId: 'deals.brand.com', date: day(20) },
    { id: 'rotated', from: 'Brand <promo7@brand.com>', listId: 'deals.brand.com', date: day(21) },
    { id: 'kept-mail', from: 'Brand <kept@brand.com>', date: day(22) },
    { id: 'friend', from: 'Best Friend <friend@example.com>', date: day(22) },
    { id: 'fresh', from: 'Newcomer <hi@newcomer.com>', date: day(22) },
  ];

  it('stamps a sender that emails after the grace period and puts it at the front of Main', async () => {
    await seedUnsubscribed();
    const result = await syncNewMail({ gmail: fakeGmail([...inbox.filter((m) => m.sent), ...arrivals]), storage, selfAddress: 'me@gmail.com' });

    const brand = await storage.getSender('deals@brand.com');
    expect(brand).toMatchObject({ status: 'repeat_offender', returnCount: 2, messageCount: 4 });
    expect(brand?.lastReturnAt).toBe(new Date(day(21)).toISOString());
    expect(await storage.getSender('promo7@brand.com')).toBeUndefined();
    expect((await storage.getSender('kept@brand.com'))?.status).toBe('kept');
    expect(await storage.getSender('friend@example.com')).toBeUndefined();
    expect((await storage.getSender('hi@newcomer.com'))?.status).toBe('new');

    expect(result.newOffenders.map((s) => s.id)).toEqual(['deals@brand.com']);
    expect(result.newSenders).toBe(1);
    expect(await storage.getMeta('historyId')).toBe('h2');

    const main = deckOrder('main', await storage.listSenders());
    expect(main[0]).toBe('deals@brand.com');
  });

  it('only counts mail once when sync runs again', async () => {
    await seedUnsubscribed();
    const gmail = fakeGmail([...inbox.filter((m) => m.sent), ...arrivals]);
    await syncNewMail({ gmail, storage, selfAddress: 'me@gmail.com' });
    const second = await syncNewMail({ gmail, storage, selfAddress: 'me@gmail.com' });
    expect(second.messages).toBe(0);
    expect((await storage.getSender('deals@brand.com'))?.returnCount).toBe(2);
  });

  it('rescans from the last sync when the history id has expired', async () => {
    await seedUnsubscribed();
    const gmail = fakeGmail([...inbox.filter((m) => m.sent), ...arrivals], { historyExpired: true });
    const result = await syncNewMail({ gmail, storage, selfAddress: 'me@gmail.com' });
    expect(gmail.queries.at(-1)).toMatch(/^after:\d{4}\/\d{2}\/\d{2} before:\d{4}\/\d{2}\/\d{2} -in:sent/);
    expect(result.newOffenders).toHaveLength(1);
    expect(await storage.getMeta('historyId')).toBe('h-profile');
  });
});
