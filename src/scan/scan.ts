import { GmailError, type GmailClient } from '../gmail/client';
import { getHeader, parseAddressList } from '../gmail/headers';
import type { GmailMessage } from '../gmail/types';
import type { StorageAdapter } from '../storage';
import type { ScanWindow } from '../storage/types';
import { ingestMessages, type IngestResult } from './ingest';
import { mapPool } from './pool';
import { SCAN_HEADERS, toScannedMessage, type ScannedMessage } from './senders';
import { initialWindow, windowQuery, windowSince } from './windows';

const PEOPLE_QUERY = 'in:sent newer_than:365d';
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

/** Fetches metadata, treating a message deleted since it was listed as absent. */
async function getMetadataOrSkip(gmail: GmailClient, id: string, headers: readonly string[]): Promise<GmailMessage | null> {
  try {
    return await gmail.getMessageMetadata(id, headers);
  } catch (error) {
    if (error instanceof GmailError && error.status === 404) return null;
    throw error;
  }
}

/** Everyone you've emailed in the past year. Their mail never becomes a card. Built once and reused. */
export async function ensurePeopleSet({ gmail, storage, selfAddress, onProgress }: ScanDeps): Promise<Set<string>> {
  if (await storage.getMeta('peopleScannedAt')) return withSelf(await storage.listPeople(), selfAddress);

  onProgress({ phase: 'people', done: 0, total: 0 });
  const sentByApp = await storage.listSentByApp();
  const refs = (await gmail.listAllMessages(PEOPLE_QUERY)).filter((ref) => !sentByApp.has(ref.id));

  const people = new Set<string>();
  let done = 0;
  await mapPool(refs, CONCURRENCY, async (ref) => {
    const message = await getMetadataOrSkip(gmail, ref.id, PEOPLE_HEADERS);
    if (message) {
      for (const name of PEOPLE_HEADERS) {
        for (const address of parseAddressList(getHeader(message, name))) people.add(address);
      }
    }
    done++;
    if (done % 25 === 0 || done === refs.length) onProgress({ phase: 'people', done, total: refs.length });
  });

  await storage.addPeople([...people]);
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
export async function scanWindow(deps: ScanDeps, window: ScanWindow): Promise<void> {
  const { gmail, storage, onProgress } = deps;
  const people = await ensurePeopleSet(deps);

  onProgress({ phase: 'listing', found: 0 });
  const refs = await gmail.listAllMessages(windowQuery(window), (found) => onProgress({ phase: 'listing', found }));
  const pending = await storage.filterNewMessageIds(refs.map((ref) => ref.id));

  const skipped = refs.length - pending.length;
  let senders = await storage.countSenders();
  onProgress({ phase: 'reading', done: skipped, total: refs.length, senders });

  await readAndIngest(deps, pending, people, (done, batch) => {
    senders += batch.newSenders;
    onProgress({ phase: 'reading', done: skipped + done, total: refs.length, senders });
  });
}

/** Fetches metadata for new message ids in batches and folds each batch into senders. */
async function readAndIngest(
  { gmail, storage }: Pick<ScanDeps, 'gmail' | 'storage'>,
  ids: string[],
  people: ReadonlySet<string>,
  onBatch?: (done: number, batch: IngestResult) => void,
): Promise<IngestResult> {
  const total: IngestResult = { messages: 0, newSenders: 0, newOffenders: [], changed: [] };
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

export type SyncResult = IngestResult;

/**
 * Pulls mail that arrived since the last sync and checks it for repeat offenders.
 * History ids expire after about a week; then it rescans from the last sync date instead.
 */
export async function syncNewMail(deps: Omit<ScanDeps, 'onProgress'>): Promise<SyncResult> {
  const { gmail, storage } = deps;
  const startHistoryId = await storage.getMeta('historyId');
  if (!startHistoryId) return { messages: 0, newSenders: 0, newOffenders: [], changed: [] };
  const startedAt = new Date().toISOString();

  let ids: string[];
  let historyId: string;
  try {
    ({ ids, historyId } = await gmail.listAddedMessageIds(startHistoryId));
  } catch (error) {
    if (!(error instanceof GmailError && error.status === 404)) throw error;
    historyId = (await gmail.getProfile()).historyId;
    const lastSyncAt = (await storage.getMeta('lastSyncAt')) ?? startedAt;
    ids = (await gmail.listAllMessages(windowQuery(windowSince(new Date(lastSyncAt))))).map((ref) => ref.id);
  }

  const pending = await storage.filterNewMessageIds(ids);
  const people = await ensurePeopleSet({ ...deps, onProgress: () => {} });
  const result = await readAndIngest(deps, pending, people);

  await storage.setMeta('historyId', historyId);
  await storage.setMeta('lastSyncAt', startedAt);
  return result;
}

/** First run: the last 90 days. Resumes an interrupted scan with the same window and history id. */
export async function runInitialScan(deps: ScanDeps): Promise<void> {
  const { gmail, storage } = deps;
  const inProgress = await storage.getMeta('scanInProgress');
  const scan = inProgress ?? {
    window: initialWindow(),
    historyId: (await gmail.getProfile()).historyId,
    startedAt: new Date().toISOString(),
  };
  if (!inProgress) await storage.setMeta('scanInProgress', scan);

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
