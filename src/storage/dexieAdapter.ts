import Dexie, { type EntityTable } from 'dexie';
import { DEVICE_ONLY_META, EXPORT_FORMAT, EXPORT_VERSION, type UnsubberExport } from './exportFormat';
import type { ListSendersOptions, StorageAdapter } from './StorageAdapter';
import type { Attempt, MessageIndexRow, MetaKey, MetaValues, QueueItem, Sender } from './types';

interface MetaRow {
  key: MetaKey;
  value: unknown;
}

class UnsubberDb extends Dexie {
  senders!: EntityTable<Sender, 'id'>;
  messages!: EntityTable<MessageIndexRow, 'id'>;
  attempts!: EntityTable<Attempt, 'id'>;
  queue!: EntityTable<QueueItem, 'senderId'>;
  people!: EntityTable<{ address: string }, 'address'>;
  sentByApp!: EntityTable<{ messageId: string }, 'messageId'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      senders: 'id, status, domain, messageCount',
      messages: 'id, senderId, date, [senderId+date]',
      attempts: 'id, senderId, at',
      queue: 'senderId, createdAt',
      people: 'address',
      sentByApp: 'messageId',
      meta: 'key',
    });
  }
}

export class DexieStorage implements StorageAdapter {
  private readonly db: UnsubberDb;

  constructor(name = 'unsubber') {
    this.db = new UnsubberDb(name);
  }

  getSender(id: string) {
    return this.db.senders.get(id);
  }

  async getSenders(ids: string[]) {
    const rows = await this.db.senders.bulkGet(ids);
    return new Map(rows.filter((s): s is Sender => Boolean(s)).map((s) => [s.id, s]));
  }

  async upsertSenders(senders: Sender[]) {
    await this.db.senders.bulkPut(senders);
  }

  async listSenders({ status, sort }: ListSendersOptions = {}) {
    const statuses = status === undefined ? null : Array.isArray(status) ? status : [status];
    const senders = statuses ? await this.db.senders.where('status').anyOf(statuses).toArray() : await this.db.senders.toArray();
    if (sort === 'messageCount') senders.sort((a, b) => b.messageCount - a.messageCount);
    if (sort === 'lastReceivedAt') senders.sort((a, b) => b.lastReceivedAt.localeCompare(a.lastReceivedAt));
    return senders;
  }

  listSendersByDomain(domains: string[]) {
    return domains.length === 0 ? Promise.resolve([]) : this.db.senders.where('domain').anyOf(domains).toArray();
  }

  async removeSenders(ids: string[]) {
    if (ids.length === 0) return;
    await this.db.transaction('rw', this.db.senders, this.db.messages, async () => {
      await this.db.senders.bulkDelete(ids);
      await this.db.messages.where('senderId').anyOf(ids).delete();
    });
  }

  countSenders() {
    return this.db.senders.count();
  }

  async addMessages(messages: MessageIndexRow[]) {
    await this.db.messages.bulkPut(messages);
  }

  countMessages({ senderId, after }: { senderId?: string; after?: string } = {}) {
    const { messages } = this.db;
    if (senderId) {
      return messages
        .where('[senderId+date]')
        .between([senderId, after ?? Dexie.minKey], [senderId, Dexie.maxKey], !after, true)
        .count();
    }
    return after ? messages.where('date').above(after).count() : messages.count();
  }

  listRecentMessages(senderId: string, limit: number) {
    return this.db.messages
      .where('[senderId+date]')
      .between([senderId, Dexie.minKey], [senderId, Dexie.maxKey])
      .reverse()
      .limit(limit)
      .toArray();
  }

  async filterNewMessageIds(ids: string[]) {
    const existing = await this.db.messages.bulkGet(ids);
    return ids.filter((_, i) => !existing[i]);
  }

  async saveScanBatch(messages: MessageIndexRow[], senders: Sender[]) {
    await this.db.transaction('rw', this.db.messages, this.db.senders, async () => {
      await this.db.messages.bulkPut(messages);
      await this.db.senders.bulkPut(senders);
    });
  }

  async addAttempt(attempt: Attempt) {
    await this.db.attempts.put(attempt);
  }

  listAttempts(senderId: string) {
    return this.db.attempts.where('senderId').equals(senderId).sortBy('at');
  }

  async enqueue(item: QueueItem) {
    await this.db.queue.put(item);
  }

  async dequeue(senderId: string) {
    await this.db.queue.delete(senderId);
  }

  listQueue() {
    return this.db.queue.orderBy('createdAt').toArray();
  }

  async addPeople(addresses: string[]) {
    await this.db.people.bulkPut(addresses.map((address) => ({ address })));
  }

  async listPeople() {
    return new Set((await this.db.people.toCollection().primaryKeys()) as string[]);
  }

  async addSentByApp(messageId: string) {
    await this.db.sentByApp.put({ messageId });
  }

  async listSentByApp() {
    return new Set((await this.db.sentByApp.toCollection().primaryKeys()) as string[]);
  }

  async getMeta<K extends MetaKey>(key: K) {
    const row = await this.db.meta.get(key);
    return row?.value as MetaValues[K] | undefined;
  }

  async setMeta<K extends MetaKey>(key: K, value: MetaValues[K]) {
    await this.db.meta.put({ key, value });
  }

  async deleteMeta(key: MetaKey) {
    await this.db.meta.delete(key);
  }

  async clearAll() {
    await this.db.transaction('rw', this.db.tables, () => Promise.all(this.db.tables.map((t) => t.clear())));
  }

  async exportAll({ account, appVersion }: { account: string | null; appVersion: string }): Promise<UnsubberExport> {
    const { db } = this;
    return db.transaction('r', db.tables, async () => {
      const metaRows = await db.meta.toArray();
      return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        account,
        appVersion,
        data: {
          senders: await db.senders.toArray(),
          messages: await db.messages.toArray(),
          attempts: await db.attempts.orderBy('id').toArray(),
          queue: await db.queue.toArray(),
          people: (await db.people.toCollection().primaryKeys()) as string[],
          sentByApp: (await db.sentByApp.toCollection().primaryKeys()) as string[],
          meta: Object.fromEntries(metaRows.filter((row) => !DEVICE_ONLY_META.includes(row.key)).map((row) => [row.key, row.value])),
        },
      };
    });
  }

  async importAll({ data }: UnsubberExport) {
    const { db } = this;
    await db.transaction('rw', db.tables, async () => {
      const keepHere = await db.meta.bulkGet([...DEVICE_ONLY_META]);
      await Promise.all(db.tables.map((table) => table.clear()));
      await db.senders.bulkPut(data.senders);
      await db.messages.bulkPut(data.messages);
      await db.attempts.bulkPut(data.attempts);
      await db.queue.bulkPut(data.queue);
      await db.people.bulkPut(data.people.map((address) => ({ address })));
      await db.sentByApp.bulkPut(data.sentByApp.map((messageId) => ({ messageId })));
      await db.meta.bulkPut([
        ...Object.entries(data.meta)
          .filter(([key]) => !DEVICE_ONLY_META.includes(key as MetaKey))
          .map(([key, value]) => ({ key: key as MetaKey, value })),
        ...keepHere.filter((row): row is MetaRow => Boolean(row)),
      ]);
    });
  }

  listAllAttempts() {
    return this.db.attempts.orderBy('id').toArray();
  }
}
