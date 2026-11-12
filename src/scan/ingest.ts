import { findTrackedSender, isTracked, recordReturn } from '../offenders/match';
import type { StorageAdapter } from '../storage/StorageAdapter';
import type { Sender } from '../storage/types';
import { mergeIntoSenders, senderDomain, toIndexRow, type ScannedMessage } from './senders';

export interface IngestResult {
  /** Messages stored, after people you email were filtered out. */
  messages: number;
  /** Senders seen for the first time. */
  newSenders: number;
  /** Senders that became repeat offenders in this batch. */
  newOffenders: Sender[];
  changed: Sender[];
}

/**
 * Folds new messages into sender records and checks each against unsubscribed senders.
 * A message from a rotated address on a tracked sender's domain and list counts toward that sender.
 * Callers pass each message once; people you email are filtered out before this.
 */
export async function ingestMessages(storage: StorageAdapter, messages: ScannedMessage[]): Promise<IngestResult> {
  if (messages.length === 0) return { messages: 0, newSenders: 0, newOffenders: [], changed: [] };

  const addresses = [...new Set(messages.map((m) => m.fromAddress))];
  const domains = [...new Set(addresses.map(senderDomain))];
  const [byAddress, sameDomain] = await Promise.all([storage.getSenders(addresses), storage.listSendersByDomain(domains)]);
  const known = new Map<string, Sender>([...sameDomain.map((s): [string, Sender] => [s.id, s]), ...byAddress]);
  const tracked = [...known.values()].filter(isTracked);

  const attributed = messages.map((message) => {
    const exact = known.get(message.fromAddress);
    if (exact) return message;
    const owner = findTrackedSender({ fromAddress: message.fromAddress, domain: senderDomain(message.fromAddress), listId: message.listId }, tracked);
    return owner ? { ...message, fromAddress: owner.id } : message;
  });

  const merged = mergeIntoSenders(known, attributed);
  for (const message of [...attributed].sort((a, b) => a.date.localeCompare(b.date))) {
    merged.set(message.fromAddress, recordReturn(merged.get(message.fromAddress)!, message.date));
  }

  const changed = [...merged.values()];
  await storage.saveScanBatch(attributed.map(toIndexRow), changed);

  return {
    messages: attributed.length,
    newSenders: changed.filter((s) => !known.has(s.id)).length,
    newOffenders: changed.filter((s) => s.status === 'repeat_offender' && known.get(s.id)?.status !== 'repeat_offender'),
    changed,
  };
}
