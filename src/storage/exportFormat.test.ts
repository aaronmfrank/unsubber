import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deckOrder } from '../state/deckLogic';
import { DexieStorage } from './dexieAdapter';
import { parseExport } from './exportFormat';
import type { Sender } from './types';

function sender(id: string, overrides: Partial<Sender> = {}): Sender {
  return {
    id,
    displayName: id,
    domain: 'x.com',
    listIds: ['list.x.com'],
    messageCount: 4,
    lastReceivedAt: '2026-11-01T00:00:00.000Z',
    latestSubject: 's',
    latestSnippet: 'p',
    latestMessageId: `m-${id}`,
    latestThreadId: `t-${id}`,
    unsubMethods: { oneClickUrl: 'https://x.com/1c' },
    status: 'new',
    escalationStep: 0,
    returnCount: 0,
    ...overrides,
  };
}

async function seedDesktop() {
  const desktop = new DexieStorage(`desktop-${Math.random()}`);
  await desktop.upsertSenders([
    sender('a@x.com', { messageCount: 9 }),
    sender('b@x.com', { status: 'kept', keptAt: '2026-10-01T00:00:00.000Z', countAtKeep: 2 }),
    sender('c@x.com', { status: 'saved' }),
    sender('d@x.com', { status: 'unsubscribed', unsubscribedAt: '2026-10-01T00:00:00.000Z', escalationStep: 1 }),
    sender('e@x.com', { status: 'repeat_offender', unsubscribedAt: '2026-09-01T00:00:00.000Z', escalationStep: 1, returnCount: 4 }),
    sender('f@x.com', { status: 'queued', prevStatus: 'new' }),
  ]);
  await desktop.addMessages([{ id: 'm1', threadId: 't1', senderId: 'a@x.com', date: '2026-11-01T00:00:00.000Z' }]);
  await desktop.addAttempt({ id: '001', senderId: 'd@x.com', method: 'one_click', at: '2026-10-01T00:00:00.000Z', result: 'sent_unconfirmed', detail: 'https://x.com/1c' });
  await desktop.addAttempt({ id: '002', senderId: 'e@x.com', method: 'mailto', at: '2026-09-01T00:00:00.000Z', result: 'sent', detail: 'sent-1' });
  await desktop.enqueue({ senderId: 'f@x.com', createdAt: '2026-11-11T00:00:00.000Z' });
  await desktop.addPeople(['friend@y.com']);
  await desktop.addSentByApp('sent-1');
  await desktop.setMeta('historyId', 'h9');
  await desktop.setMeta('scannedWindows', [{ after: '2026/08/13', before: '2026/11/12' }]);
  await desktop.setMeta('accountEmail', 'me@gmail.com');
  await desktop.setMeta('storagePersisted', true);
  return desktop;
}

const comparable = async (s: DexieStorage) => {
  const { exportedAt: _ignored, ...rest } = await s.exportAll({ account: 'me@gmail.com', appVersion: 'test' });
  return rest;
};

describe('export and import', () => {
  it('reproduces the same decks, queue and history on another device', async () => {
    const desktop = await seedDesktop();
    const file = JSON.stringify(await desktop.exportAll({ account: 'me@gmail.com', appVersion: '0.7.0' }));

    const phone = new DexieStorage(`phone-${Math.random()}`);
    await phone.upsertSenders([sender('stale@x.com')]);
    await phone.setMeta('storagePersisted', true);
    await phone.importAll(parseExport(file));

    expect(await comparable(phone)).toEqual(await comparable(desktop));
    expect(await phone.getSender('stale@x.com')).toBeUndefined();

    const senders = await phone.listSenders();
    for (const deck of ['main', 'later', 'rereview'] as const) {
      expect(deckOrder(deck, senders)).toEqual(deckOrder(deck, await desktop.listSenders()));
    }
    expect(await phone.listAttempts('e@x.com')).toEqual(await desktop.listAttempts('e@x.com'));
    expect(await phone.listQueue()).toHaveLength(1);
    expect(await phone.getMeta('historyId')).toBe('h9');
  });

  it("keeps this device's own settings and leaves out the other device's", async () => {
    const desktop = await seedDesktop();
    await desktop.setMeta('scanInProgress', { window: { after: 'a', before: 'b' }, historyId: 'h', startedAt: 'now' });
    const exported = await desktop.exportAll({ account: 'me@gmail.com', appVersion: 'test' });
    expect(Object.keys(exported.data.meta)).not.toContain('storagePersisted');
    expect(Object.keys(exported.data.meta)).not.toContain('scanInProgress');

    const phone = new DexieStorage(`phone-${Math.random()}`);
    await phone.setMeta('storagePersisted', true);
    await phone.importAll(exported);
    expect(await phone.getMeta('storagePersisted')).toBe(true);
    expect(await phone.getMeta('scanInProgress')).toBeUndefined();
  });
});

describe('parseExport', () => {
  it('rejects files that are not Unsubber exports', () => {
    expect(() => parseExport('not json')).toThrow("isn't an Unsubber export");
    expect(() => parseExport('{"hello":1}')).toThrow("isn't an Unsubber export");
  });

  it('rejects other versions and damaged files', () => {
    expect(() => parseExport(JSON.stringify({ format: 'unsubber-export', version: 99 }))).toThrow('different version');
    expect(() => parseExport(JSON.stringify({ format: 'unsubber-export', version: 1, data: { senders: [] } }))).toThrow('incomplete');
    const damaged = { format: 'unsubber-export', version: 1, data: { senders: [{}], messages: [], attempts: [], queue: [], people: [], sentByApp: [], meta: {} } };
    expect(() => parseExport(JSON.stringify(damaged))).toThrow('damaged sender');
  });
});
