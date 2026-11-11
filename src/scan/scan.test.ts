import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { GmailError, type GmailClient } from '../gmail/client';
import type { GmailMessage } from '../gmail/types';
import { DexieStorage } from '../storage/dexieAdapter';
import { runInitialScan, type ScanDeps } from './scan';

interface FakeMessage {
  id: string;
  from: string;
  to?: string;
  sent?: boolean;
  date?: number;
}

function fakeGmail(messages: FakeMessage[], options: { failAfterGets?: number } = {}) {
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
      ],
    },
  });
  const client = {
    gets: () => gets,
    getProfile: async () => ({ emailAddress: 'me@gmail.com', messagesTotal: 0, threadsTotal: 0, historyId: 'h1' }),
    listAllMessages: async (q: string) =>
      messages.filter((m) => Boolean(m.sent) === q.startsWith('in:sent')).map((m) => ({ id: m.id, threadId: `t-${m.id}` })),
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
    expect(await storage.getMeta('historyId')).toBe('h1');
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
