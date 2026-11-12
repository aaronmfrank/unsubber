import { mapPool } from '../scan/pool';
import type { Sender } from '../storage/types';
import { newAttemptId, runUnsubscribe, type RunDeps, type RunResult } from './executor';
import { runFilter } from './filter';

const CONCURRENCY = 4;

export interface CommitSummary {
  unsubscribed: number;
  manual: number;
  blocked: number;
  filtered: number;
  /** Escalations that failed; those senders are back in Main, stamped. */
  failed: number;
  archiveFailed: number;
  /** Set when the run stopped early; the senders it didn't reach stay queued. */
  stoppedBy: Error | null;
  remaining: number;
}

export interface CommitOptions {
  onProgress?(done: number, total: number): void;
  onSender?(sender: Sender): void;
}

/** Runs every queued sender, four at a time: unsubscribes, escalations and filters. */
export async function commitQueue(deps: Omit<RunDeps, 'people'>, { onProgress, onSender }: CommitOptions = {}): Promise<CommitSummary> {
  const { storage } = deps;
  const queue = await storage.listQueue();
  const filters = new Map(queue.filter((item) => item.filter).map((item) => [item.senderId, item.filter!]));
  const senders = [...(await storage.getSenders(queue.map((item) => item.senderId))).values()].filter((s) => s.status === 'queued');
  const people = new Set([...(await storage.listPeople()), deps.selfAddress.toLowerCase()]);

  let stoppedBy: Error | null = null;
  let done = 0;
  onProgress?.(0, senders.length);

  const results = await mapPool(senders, CONCURRENCY, async (sender): Promise<RunResult | null> => {
    if (stoppedBy) return null;
    try {
      const filter = filters.get(sender.id);
      const result = filter ? await runFilter(sender, filter, deps) : await runUnsubscribe(sender, { ...deps, people });
      onSender?.(result.sender);
      return result;
    } catch (error) {
      stoppedBy ??= error instanceof Error ? error : new Error(String(error));
      return null;
    } finally {
      onProgress?.(++done, senders.length);
    }
  });

  const finished = results.filter((r): r is RunResult => r !== null);
  return {
    unsubscribed: finished.filter((r) => r.outcome === 'unsubscribed').length,
    manual: finished.filter((r) => r.outcome === 'manual').length,
    blocked: finished.filter((r) => r.outcome === 'blocked').length,
    filtered: finished.filter((r) => r.outcome === 'filtered').length,
    failed: finished.filter((r) => r.outcome === 'failed').length,
    archiveFailed: finished.filter((r) => r.archived === null).length,
    stoppedBy,
    remaining: senders.length - finished.length,
  };
}

/** Mark done on a manual-queue sender: they're unsubscribed and the grace period starts now. */
export async function markManualDone(sender: Sender, openedLink: string | null, deps: Pick<RunDeps, 'storage' | 'now'>): Promise<Sender> {
  const at = (deps.now?.() ?? new Date()).toISOString();
  const updated: Sender = { ...sender, status: 'unsubscribed', unsubscribedAt: at, escalationStep: sender.escalationStep + 1 };
  await deps.storage.addAttempt({
    id: newAttemptId(),
    senderId: sender.id,
    method: 'manual_link',
    at,
    result: 'done_by_user',
    detail: openedLink ?? 'Marked done without opening a link from Unsubber',
  });
  await deps.storage.upsertSenders([updated]);
  return updated;
}
