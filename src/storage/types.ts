export type SenderStatus = 'new' | 'kept' | 'saved' | 'queued' | 'unsubscribed' | 'manual' | 'repeat_offender' | 'blocked';

export interface UnsubMethods {
  oneClickUrl?: string;
  mailto?: string;
  httpUrl?: string;
  bodyLinks?: string[];
}

export interface Sender {
  /** Lowercased from-address. */
  id: string;
  displayName: string;
  domain: string;
  listIds: string[];
  messageCount: number;
  lastReceivedAt: string;
  latestSubject: string;
  latestSnippet: string;
  latestMessageId: string;
  latestThreadId: string;
  unsubMethods: UnsubMethods;
  /** Date of the message `unsubMethods` was parsed from, so only a newer header replaces it. */
  unsubMethodsFrom?: string;
  status: SenderStatus;
  prevStatus?: SenderStatus;
  keptAt?: string;
  countAtKeep?: number;
  unsubscribedAt?: string;
  escalationStep: number;
  returnCount: number;
  lastReturnAt?: string;
}

export interface MessageIndexRow {
  id: string;
  threadId: string;
  senderId: string;
  date: string;
  listId?: string;
}

export type AttemptMethod = 'one_click' | 'mailto' | 'manual_link' | 'filter_block' | 'report_spam';
export type AttemptResult = 'sent_unconfirmed' | 'sent' | 'failed' | 'done_by_user';

export interface Attempt {
  id: string;
  senderId: string;
  method: AttemptMethod;
  at: string;
  result: AttemptResult;
  detail: string;
}

export interface QueueItem {
  senderId: string;
  createdAt: string;
  /** Escalation step for repeat offenders; absent for a plain unsubscribe. */
  escalationStep?: number;
}

/** A date range in Gmail's `YYYY/MM/DD` search format; `after` inclusive, `before` exclusive. */
export interface ScanWindow {
  after: string;
  before: string;
}

export interface MetaValues {
  historyId: string;
  lastSyncAt: string;
  scannedWindows: ScanWindow[];
  /** Set while a scan runs, so an interrupted scan resumes instead of starting over. */
  scanInProgress: { window: ScanWindow; historyId: string; startedAt: string };
  peopleScannedAt: string;
  storagePersisted: boolean;
}

export type MetaKey = keyof MetaValues;

export type SenderSort = 'messageCount' | 'lastReceivedAt';
