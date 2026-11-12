import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GmailError, type GmailClient } from '../gmail/client';
import type { GmailMessage } from '../gmail/types';
import { DexieStorage } from '../storage/dexieAdapter';
import { deckOrder } from '../state/deckLogic';
import { needsBackfill, runBackfill, runInitialScan, scanOlderMail, syncNewMail, type ScanDeps } from './scan';
import { daysAgo } from './windows';

interface FakeMessage {
  id: string;
  from: string;
  to?: string;
  sent?: boolean;
  date?: number;
  listId?: string;
}

function fakeGmail(messages: FakeMessage[], options: { failAfterGets?: number; historyExpired?: boolean; newlySent?: string[] } = {}) {
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
      return { ids: messages.filter((m) => !m.sent).map((m) => m.id), sentIds: options.newlySent ?? [], historyId: 'h2' };
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

describe('scanOlderMail', () => {
  it('scans the previous 90 days, adds counts to known senders and records the window', async () => {
    await runInitialScan(deps(fakeGmail(inbox)));
    const older = fakeGmail([
      ...inbox.filter((m) => m.sent),
      { id: 'old-1', from: 'Brand X <deals@brandx.com>', date: Date.UTC(2026, 5, 1) },
      { id: 'old-2', from: 'Vintage <hi@vintage.com>', date: Date.UTC(2026, 5, 2) },
    ]);
    const { window, result } = await scanOlderMail(deps(older));

    expect(older.queries.at(-1)).toBe(`after:${window.after} before:${window.before} -in:sent -in:drafts -in:chats`);
    expect(result.newSenders).toBe(1);
    expect((await storage.getSender('deals@brandx.com'))?.messageCount).toBe(3);
    expect((await storage.getSender('hi@vintage.com'))?.status).toBe('new');
    expect(await storage.getMeta('scannedWindows')).toHaveLength(2);
    expect(await storage.getMeta('olderScanInProgress')).toBeUndefined();
  });

  it('resumes the same window after an interruption', async () => {
    await runInitialScan(deps(fakeGmail(inbox)));
    const failing = fakeGmail(inbox, { failAfterGets: 0 });
    await expect(scanOlderMail(deps(failing))).rejects.toThrow('boom');
    const pending = await storage.getMeta('olderScanInProgress');
    expect(pending).toBeDefined();

    const { window } = await scanOlderMail(deps(fakeGmail(inbox)));
    expect(window).toEqual(pending);
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
    expect(gmail.queries.some((q) => /^after:\d{4}\/\d{2}\/\d{2} before:\d{4}\/\d{2}\/\d{2} -in:sent/.test(q))).toBe(true);
    expect(gmail.queries.some((q) => q.startsWith('in:sent after:'))).toBe(true);
    expect(result.newOffenders).toHaveLength(1);
    expect(await storage.getMeta('historyId')).toBe('h-profile');
  });
});

describe('quick first scan and background loading', () => {
  it('scans 30 days first and records what to fill in later', async () => {
    const gmail = fakeGmail(inbox);
    await runInitialScan(deps(gmail));
    const [window] = (await storage.getMeta('scannedWindows'))!;
    expect(window!.after).toBe(daysAgo(30));
    expect(await storage.getMeta('mailTarget')).toBe(daysAgo(90));
    expect(await storage.getMeta('peopleTarget')).toBe(daysAgo(365));
    expect(await storage.getMeta('peopleCoveredAfter')).toBe(daysAgo(30));
    expect(gmail.queries[0]).toBe(`in:sent after:${daysAgo(30)} before:${window!.before}`);
    expect(await needsBackfill(storage)).toBe(true);
  });

  it('reads a year of sent mail, removes cards for people, then loads incoming mail back to 90 days', async () => {
    await runInitialScan(deps(fakeGmail(inbox)));
    await storage.upsertSenders([{ ...(await storage.getSender('deals@brandx.com'))!, status: 'unsubscribed', unsubscribedAt: '2026-11-01T00:00:00.000Z' }]);
    expect(await storage.getSender('news@paper.com')).toBeDefined();

    const older = fakeGmail([
      ...inbox,
      { id: 's-old', from: 'me@gmail.com', to: 'news@paper.com, deals@brandx.com', sent: true },
      { id: 'old-1', from: 'Vintage <hi@vintage.com>', date: Date.UTC(2026, 8, 1) },
      { id: 'old-2', from: 'News <news@paper.com>', date: Date.UTC(2026, 8, 2) },
    ]);
    const result = await runBackfill(deps(older));

    expect(older.queries[0]).toBe(`in:sent after:${daysAgo(365)} before:${daysAgo(30)}`);
    expect(result.removedSenders).toEqual(['news@paper.com']);
    expect(await storage.getSender('news@paper.com')).toBeUndefined();
    expect((await storage.getSender('deals@brandx.com'))?.status).toBe('unsubscribed');

    expect(result.window).toEqual({ after: daysAgo(90), before: daysAgo(30) });
    expect(older.queries.at(-1)).toBe(`after:${daysAgo(90)} before:${daysAgo(30)} -in:sent -in:drafts -in:chats`);
    expect((await storage.getSender('hi@vintage.com'))?.status).toBe('new');
    expect(await storage.getSender('news@paper.com')).toBeUndefined();

    expect(await needsBackfill(storage)).toBe(false);
    expect(await storage.getMeta('scannedWindows')).toHaveLength(2);
    expect((await runBackfill(deps(older))).window).toBeNull();
  });

  it('resumes the same window after an interruption', async () => {
    await runInitialScan(deps(fakeGmail(inbox)));
    await expect(runBackfill(deps(fakeGmail(inbox, { failAfterGets: 2 })))).rejects.toThrow('boom');
    expect(await storage.getMeta('peopleTarget')).toBeUndefined();
    expect(await storage.getMeta('olderScanInProgress')).toEqual({ after: daysAgo(90), before: daysAgo(30) });
    expect(await needsBackfill(storage)).toBe(true);

    const { window } = await runBackfill(deps(fakeGmail(inbox)));
    expect(window).toEqual({ after: daysAgo(90), before: daysAgo(30) });
    expect(await needsBackfill(storage)).toBe(false);
  });

  it('leaves existing 90-day installs alone', async () => {
    await storage.setMeta('peopleScannedAt', '2026-11-01T00:00:00.000Z');
    await storage.setMeta('scannedWindows', [{ after: daysAgo(90), before: daysAgo(-1) }]);
    expect(await needsBackfill(storage)).toBe(false);
  });
});

describe('people you start emailing', () => {
  it('joins the people set during sync, and their card and new mail stay out of the deck', async () => {
    await runInitialScan(deps(fakeGmail(inbox)));
    const news = (await storage.getSender('news@paper.com'))!;
    await storage.upsertSenders([{ ...news, status: 'kept' }]);

    const gmail = fakeGmail(
      [
        ...inbox,
        { id: 's-new', from: 'me@gmail.com', to: 'News <news@paper.com>, New Pal <pal@newfriend.com>', sent: true },
        { id: 'from-pal', from: 'New Pal <pal@newfriend.com>' },
      ],
      { newlySent: ['s-new'] },
    );
    const result = await syncNewMail({ gmail, storage, selfAddress: 'me@gmail.com' });

    expect(result.removedSenders).toEqual(['news@paper.com']);
    expect(await storage.getSender('news@paper.com')).toBeUndefined();
    expect(await storage.getSender('pal@newfriend.com')).toBeUndefined();
    expect(await storage.listPeople()).toContain('pal@newfriend.com');
  });

  it("ignores the app's own unsubscribe emails", async () => {
    await runInitialScan(deps(fakeGmail(inbox)));
    await storage.addSentByApp('s-unsub');
    const gmail = fakeGmail([...inbox, { id: 's-unsub', from: 'me@gmail.com', to: 'deals@brandx.com', sent: true }], { newlySent: ['s-unsub'] });
    await syncNewMail({ gmail, storage, selfAddress: 'me@gmail.com' });
    expect(await storage.listPeople()).not.toContain('deals@brandx.com');
    expect(await storage.getSender('deals@brandx.com')).toBeDefined();
  });
});
