import type { Attempt, MessageIndexRow, MetaKey, MetaValues, QueueItem, Sender, SenderSort, SenderStatus } from './types';

export interface ListSendersOptions {
  status?: SenderStatus | SenderStatus[];
  /** Sorted descending. */
  sort?: SenderSort;
}

/** The only way the UI and logic touch storage, so a synced backend can replace Dexie later. */
export interface StorageAdapter {
  getSender(id: string): Promise<Sender | undefined>;
  getSenders(ids: string[]): Promise<Map<string, Sender>>;
  upsertSenders(senders: Sender[]): Promise<void>;
  listSenders(options?: ListSendersOptions): Promise<Sender[]>;
  listSendersByDomain(domains: string[]): Promise<Sender[]>;
  countSenders(): Promise<number>;

  addMessages(messages: MessageIndexRow[]): Promise<void>;
  countMessages(options?: { senderId?: string; after?: string }): Promise<number>;
  /** A sender's newest messages first. */
  listRecentMessages(senderId: string, limit: number): Promise<MessageIndexRow[]>;
  /** Returns the ids from `ids` that are not stored yet. */
  filterNewMessageIds(ids: string[]): Promise<string[]>;
  /** Writes a scan batch atomically, so a crash never leaves counts out of step with the message index. */
  saveScanBatch(messages: MessageIndexRow[], senders: Sender[]): Promise<void>;

  addAttempt(attempt: Attempt): Promise<void>;
  listAttempts(senderId: string): Promise<Attempt[]>;

  enqueue(item: QueueItem): Promise<void>;
  dequeue(senderId: string): Promise<void>;
  listQueue(): Promise<QueueItem[]>;

  addPeople(addresses: string[]): Promise<void>;
  listPeople(): Promise<Set<string>>;
  addSentByApp(messageId: string): Promise<void>;
  listSentByApp(): Promise<Set<string>>;

  getMeta<K extends MetaKey>(key: K): Promise<MetaValues[K] | undefined>;
  setMeta<K extends MetaKey>(key: K, value: MetaValues[K]): Promise<void>;
  deleteMeta(key: MetaKey): Promise<void>;

  clearAll(): Promise<void>;
}
