import type { Sender } from '../storage/types';
import { isAfterGrace } from './grace';

/** Senders whose new mail counts against them. Kept and blocked senders are never checked. */
export function isTracked(sender: Sender): boolean {
  return (sender.status === 'unsubscribed' || sender.status === 'repeat_offender') && Boolean(sender.unsubscribedAt);
}

export interface IncomingMessage {
  fromAddress: string;
  domain: string;
  listId?: string;
}

/**
 * The unsubscribed sender a new message belongs to: the same address, or the same domain with a
 * `List-Id` that sender has used before. The second catches brands that rotate from-addresses.
 */
export function findTrackedSender(message: IncomingMessage, candidates: Iterable<Sender>): Sender | undefined {
  let byList: Sender | undefined;
  for (const sender of candidates) {
    if (!isTracked(sender)) continue;
    if (sender.id === message.fromAddress) return sender;
    if (!byList && message.listId && sender.domain === message.domain && sender.listIds.includes(message.listId)) byList = sender;
  }
  return byList;
}

/** Applies one message from a tracked sender. Returns the sender unchanged when the message is inside the grace period. */
export function recordReturn(sender: Sender, messageDate: string): Sender {
  if (!isTracked(sender) || !isAfterGrace(messageDate, sender.unsubscribedAt!)) return sender;
  return {
    ...sender,
    status: 'repeat_offender',
    returnCount: sender.returnCount + 1,
    lastReturnAt: !sender.lastReturnAt || messageDate > sender.lastReturnAt ? messageDate : sender.lastReturnAt,
  };
}
