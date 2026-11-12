export type SenderStatus =
  | 'new'
  | 'kept'
  | 'saved'
  | 'queued'
  | 'unsubscribed'
  | 'manual'
  | 'repeat_offender'
  | 'blocked'
  | 'filtered';

/** What a filter swipe does to a sender's mail. At least one is on. */
export interface FilterActions {
  skipInbox: boolean;
  markRead: boolean;
  /** Gmail label to add, such as `Unsubber/brand.com`, or null. */
  label: string | null;
}

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
  /** Set once a filter swipe is committed; Remove filter in History deletes it. */
  filter?: { id: string; actions: FilterActions; at: string };
}

export interface MessageIndexRow {
  id: string;
  threadId: string;
  senderId: string;
  date: string;
  listId?: string;
}

export type AttemptMethod = 'one_click' | 'mailto' | 'manual_link' | 'filter_block' | 'report_spam' | 'filter_archive';
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
  /** Present for a filter swipe: the filter to create instead of unsubscribing. */
  filter?: FilterActions;
}

/** A date range in Gmail's `YYYY/MM/DD` search format; `after` inclusive, `before` exclusive. */
export interface ScanWindow {
  after: string;
  before: string;
}

export interface MetaValues {
  /** The Gmail account this data belongs to. */
  accountEmail: string;
  historyId: string;
  lastSyncAt: string;
  scannedWindows: ScanWindow[];
  /** Set while a scan runs, so an interrupted scan resumes instead of starting over. */
  scanInProgress: { window: ScanWindow; historyId: string; startedAt: string };
  /** An older 90-day window being scanned, so an interrupted Scan older mail resumes. */
  olderScanInProgress: ScanWindow;
  peopleScannedAt: string;
  /** Oldest day (Gmail date) of sent mail read into the people set so far. */
  peopleCoveredAfter: string;
  /** How far back the people set should reach; background loading fills the gap. */
  peopleTarget: string;
  /** How far back incoming mail should reach after the quick first scan; cleared once covered. */
  mailTarget: string;
  /** Gmail id of the `Unsubber/Blocked` label, created on first Block. */
  blockedLabelId: string;
  storagePersisted: boolean;
}

export type MetaKey = keyof MetaValues;

export type SenderSort = 'messageCount' | 'lastReceivedAt';
