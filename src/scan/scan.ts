import { GmailError, type GmailClient } from '../gmail/client';
import { getHeader, parseAddressList } from '../gmail/headers';
import type { GmailMessage, GmailMessageRef } from '../gmail/types';
import type { StorageAdapter } from '../storage';
import type { ScanWindow } from '../storage/types';
import { ingestMessages, type IngestResult } from './ingest';
import { mapPool } from './pool';
import { SCAN_HEADERS, toScannedMessage, type ScannedMessage } from './senders';
import {
  coveredRange,
  daysAgo,
  initialWindow,
  MAIL_TARGET_DAYS,
  olderWindow,
  PEOPLE_TARGET_DAYS,
  sentQuery,
  windowQuery,
  windowSince,
} from './windows';

const PEOPLE_HEADERS = ['To', 'Cc', 'Bcc'] as const;
const BATCH_SIZE = 100;
const CONCURRENCY = 10;

export type ScanProgress =
  | { phase: 'people'; done: number; total: number }
  | { phase: 'listing'; found: number }
  | { phase: 'reading'; done: number; total: number; senders: number };

export interface ScanDeps {
  gmail: GmailClient;
  storage: StorageAdapter;
  selfAddress: string;
  onProgress(progress: ScanProgress): void;
}

const EMPTY: IngestResult = { messages: 0, newSenders: 0, newOffenders: [], changed: [] };

/** Fetches metadata, treating a message deleted since it was listed as absent. */
async function getMetadataOrSkip(gmail: GmailClient, id: string, headers: readonly string[]): Promise<GmailMessage | null> {
  try {
    return await gmail.getMessageMetadata(id, headers);
  } catch (error) {
    if (error instanceof GmailError && error.status === 404) return null;
    throw error;
  }
}

/** Everyone on To, Cc or Bcc of these sent messages, skipping the unsubscribe emails the app sent. */
async function readRecipients(
  { gmail, storage, onProgress }: Pick<ScanDeps, 'gmail' | 'storage'> & { onProgress?: ScanDeps['onProgress'] },
  sent: readonly GmailMessageRef[],
): Promise<Set<string>> {
  const sentByApp = await storage.listSentByApp();
  const refs = sent.filter((ref) => !sentByApp.has(ref.id));
  const people = new Set<string>();
  let done = 0;
  onProgress?.({ phase: 'people', done: 0, total: refs.length });
  await mapPool(refs, CONCURRENCY, async (ref) => {
    const message = await getMetadataOrSkip(gmail, ref.id, PEOPLE_HEADERS);
    for (const name of message ? PEOPLE_HEADERS : []) {
      for (const address of parseAddressList(getHeader(message!, name))) people.add(address);
    }
    done++;
    if (done % 25 === 0 || done === refs.length) onProgress?.({ phase: 'people', done, total: refs.length });
  });
  return people;
}

/**
 * Adds addresses to the people set. A card for someone who turns out to be a person is removed,
 * unless you already acted on it (queued, unsubscribed, blocked), which keeps it in History.
 */
export async function addToPeople(storage: StorageAdapter, addresses: Iterable<string>, selfAddress: string): Promise<string[]> {
  const known = await storage.listPeople();
  const added = [...new Set(addresses)].filter((a) => !known.has(a) && a !== selfAddress.toLowerCase());
  if (added.length === 0) return [];
  await storage.addPeople(added);
  const existing = await storage.getSenders(added);
  const removable = [...existing.values()].filter((s) => s.status === 'new' || s.status === 'saved' || s.status === 'kept').map((s) => s.id);
  await storage.removeSenders(removable);
  return removable;
}

/**
 * The people-you-email set. Their mail never becomes a card. The first run reads only recent sent mail
 * so the deck opens fast; `runBackfill` reads the rest of the year in the background.
 */
export async function ensurePeopleSet(deps: ScanDeps): Promise<Set<string>> {
  const { gmail, storage, selfAddress } = deps;
  if (await storage.getMeta('peopleScannedAt')) return withSelf(await storage.listPeople(), selfAddress);

  const window = initialWindow();
  const people = await readRecipients(deps, await gmail.listAllMessages(sentQuery(window)));
  await storage.addPeople([...people]);
  await storage.setMeta('peopleCoveredAfter', window.after);
  await storage.setMeta('peopleTarget', daysAgo(PEOPLE_TARGET_DAYS));
  await storage.setMeta('peopleScannedAt', new Date().toISOString());
  return withSelf(people, selfAddress);
}

function withSelf(people: Set<string>, selfAddress: string): Set<string> {
  return new Set([...people, selfAddress.toLowerCase()]);
}

/**
 * Scans one window of mail into sender records. Safe to rerun: messages already in the index
 * are skipped, so an interrupted scan picks up where it stopped.
 */
export async function scanWindow(deps: ScanDeps, window: ScanWindow): Promise<IngestResult> {
  const { gmail, storage, onProgress } = deps;
  const people = await ensurePeopleSet(deps);

  onProgress({ phase: 'listing', found: 0 });
  const refs = await gmail.listAllMessages(windowQuery(window), (found) => onProgress({ phase: 'listing', found }));
  const pending = await storage.filterNewMessageIds(refs.map((ref) => ref.id));

  const skipped = refs.length - pending.length;
  let senders = await storage.countSenders();
  onProgress({ phase: 'reading', done: skipped, total: refs.length, senders });

  return readAndIngest(deps, pending, people, (done, batch) => {
    senders += batch.newSenders;
    onProgress({ phase: 'reading', done: skipped + done, total: refs.length, senders });
  });
}

/**
 * Scans `window`, or the 90 days before everything scanned so far. New senders join Main as `new`;
 * senders already known get their counts added. An interrupted run resumes the same window.
 */
export async function scanOlderMail(deps: ScanDeps, requested?: ScanWindow): Promise<{ window: ScanWindow; result: IngestResult }> {
  const { storage } = deps;
  const windows = (await storage.getMeta('scannedWindows')) ?? [];
  const window = (await storage.getMeta('olderScanInProgress')) ?? requested ?? olderWindow(windows);
  await storage.setMeta('olderScanInProgress', window);

  const result = await scanWindow(deps, window);

  await storage.setMeta('scannedWindows', [...windows, window]);
  await storage.deleteMeta('olderScanInProgress');
  return { window, result };
}

/** Fetches metadata for new message ids in batches and folds each batch into senders. */
async function readAndIngest(
  { gmail, storage }: Pick<ScanDeps, 'gmail' | 'storage'>,
  ids: string[],
  people: ReadonlySet<string>,
  onBatch?: (done: number, batch: IngestResult) => void,
): Promise<IngestResult> {
  const total: IngestResult = { ...EMPTY, newOffenders: [], changed: [] };
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const batchIds = ids.slice(start, start + BATCH_SIZE);
    const fetched = await mapPool(batchIds, CONCURRENCY, (id) => getMetadataOrSkip(gmail, id, SCAN_HEADERS));
    const messages = fetched
      .map((message) => (message ? toScannedMessage(message) : null))
      .filter((message): message is ScannedMessage => message !== null && !people.has(message.fromAddress));

    const batch = await ingestMessages(storage, messages);
    total.messages += batch.messages;
    total.newSenders += batch.newSenders;
    total.newOffenders.push(...batch.newOffenders);
    total.changed.push(...batch.changed);
    onBatch?.(start + batchIds.length, batch);
  }
  return total;
}

export interface SyncResult extends IngestResult {
  /** Cards removed because their sender turned out to be someone you email. */
  removedSenders: string[];
}

/**
 * Pulls mail that arrived since the last sync and checks it for repeat offenders. Recipients of mail
 * you sent join the people set first, so a new contact's mail never becomes a card.
 * History ids expire after about a week; then it rescans from the last sync date instead.
 */
export async function syncNewMail(deps: Omit<ScanDeps, 'onProgress'>): Promise<SyncResult> {
  const { gmail, storage, selfAddress } = deps;
  const startHistoryId = await storage.getMeta('historyId');
  if (!startHistoryId) return { ...EMPTY, removedSenders: [] };
  const startedAt = new Date().toISOString();

  let ids: string[];
  let sentIds: string[];
  let historyId: string;
  try {
    ({ ids, sentIds, historyId } = await gmail.listAddedMessageIds(startHistoryId));
  } catch (error) {
    if (!(error instanceof GmailError && error.status === 404)) throw error;
    historyId = (await gmail.getProfile()).historyId;
    const window = windowSince(new Date((await storage.getMeta('lastSyncAt')) ?? startedAt));
    ids = (await gmail.listAllMessages(windowQuery(window))).map((ref) => ref.id);
    sentIds = (await gmail.listAllMessages(sentQuery(window))).map((ref) => ref.id);
  }

  const recipients = await readRecipients(deps, sentIds.map((id) => ({ id, threadId: '' })));
  const removedSenders = await addToPeople(storage, recipients, selfAddress);

  const pending = await storage.filterNewMessageIds(ids);
  const people = await ensurePeopleSet({ ...deps, onProgress: () => {} });
  const result = await readAndIngest(deps, pending, people);

  await storage.setMeta('historyId', historyId);
  await storage.setMeta('lastSyncAt', startedAt);
  return { ...result, removedSenders };
}

/**
 * First run: the last 30 days, so the deck opens fast. Records the 90-day mail target and the one-year
 * people target for `runBackfill`. Resumes an interrupted scan with the same window and history id.
 */
export async function runInitialScan(deps: ScanDeps): Promise<void> {
  const { gmail, storage } = deps;
  const inProgress = await storage.getMeta('scanInProgress');
  const scan = inProgress ?? {
    window: initialWindow(),
    historyId: (await gmail.getProfile()).historyId,
    startedAt: new Date().toISOString(),
  };
  if (!inProgress) {
    await storage.setMeta('scanInProgress', scan);
    await storage.setMeta('mailTarget', daysAgo(MAIL_TARGET_DAYS));
  }

  await scanWindow(deps, scan.window);

  const windows = (await storage.getMeta('scannedWindows')) ?? [];
  await storage.setMeta('scannedWindows', [...windows, scan.window]);
  await storage.setMeta('historyId', scan.historyId);
  await storage.setMeta('lastSyncAt', scan.startedAt);
  await storage.deleteMeta('scanInProgress');
}

export async function hasCompletedInitialScan(storage: StorageAdapter): Promise<boolean> {
  const [windows, inProgress] = await Promise.all([storage.getMeta('scannedWindows'), storage.getMeta('scanInProgress')]);
  return Boolean(windows?.length) && !inProgress;
}

export interface BackfillResult extends SyncResult {
  /** The incoming-mail window scanned, or null when only the people set needed filling in. */
  window: ScanWindow | null;
}

/** True while the quick first scan's gaps (a year of sent mail, 90 days of incoming) aren't filled in yet. */
export async function needsBackfill(storage: StorageAdapter): Promise<boolean> {
  const [peopleTarget, peopleCovered, mailTarget] = await Promise.all([
    storage.getMeta('peopleTarget'),
    storage.getMeta('peopleCoveredAfter'),
    storage.getMeta('mailTarget'),
  ]);
  return Boolean(mailTarget) || Boolean(peopleTarget && peopleCovered && peopleCovered > peopleTarget);
}

/**
 * Fills in what the quick first scan skipped, in the background: first the rest of a year of sent mail
 * (so more people are filtered before more cards arrive), then incoming mail back to 90 days.
 * Each step records its progress, so an interrupted run picks up where it stopped.
 */
export async function runBackfill(deps: ScanDeps): Promise<BackfillResult> {
  const { gmail, storage, selfAddress, onProgress } = deps;
  let removedSenders: string[] = [];

  const [peopleTarget, peopleCovered] = await Promise.all([storage.getMeta('peopleTarget'), storage.getMeta('peopleCoveredAfter')]);
  if (peopleTarget && peopleCovered && peopleCovered > peopleTarget) {
    const sent = await gmail.listAllMessages(sentQuery({ after: peopleTarget, before: peopleCovered }));
    const recipients = await readRecipients({ gmail, storage, onProgress }, sent);
    removedSenders = await addToPeople(storage, recipients, selfAddress);
    await storage.setMeta('peopleCoveredAfter', peopleTarget);
    await storage.deleteMeta('peopleTarget');
  }

  const mailTarget = await storage.getMeta('mailTarget');
  const oldest = coveredRange((await storage.getMeta('scannedWindows')) ?? [])?.after;
  if (!mailTarget || !oldest || oldest <= mailTarget) {
    if (mailTarget) await storage.deleteMeta('mailTarget');
    return { ...EMPTY, removedSenders, window: null };
  }

  const { window, result } = await scanOlderMail(deps, { after: mailTarget, before: oldest });
  await storage.deleteMeta('mailTarget');
  return { ...result, removedSenders, window };
}
