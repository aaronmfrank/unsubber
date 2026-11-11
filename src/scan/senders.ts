import { getDomain } from 'tldts';
import { decodeMimeWords, getHeader, parseMailbox } from '../gmail/headers';
import type { GmailMessage } from '../gmail/types';
import type { MessageIndexRow, Sender } from '../storage/types';
import { parseUnsubMethods } from '../unsub/listUnsubscribe';

export const SCAN_HEADERS = ['From', 'Subject', 'Date', 'List-Unsubscribe', 'List-Unsubscribe-Post', 'List-Id'] as const;

export interface ScannedMessage {
  id: string;
  threadId: string;
  fromAddress: string;
  fromName: string;
  subject: string;
  snippet: string;
  date: string;
  listId?: string;
  listUnsubscribe?: string;
  listUnsubscribePost?: string;
}

/** Registrable domain, such as `brand.co.uk` for `deals@news.brand.co.uk`. */
export function senderDomain(address: string): string {
  const host = address.slice(address.lastIndexOf('@') + 1);
  return getDomain(host) ?? host;
}

/** `Brand news <news.brand.com>` becomes `news.brand.com`. */
export function normalizeListId(value: string): string {
  const bracketed = value.match(/<([^>]+)>/);
  return (bracketed ? bracketed[1]! : value).trim().toLowerCase();
}

export function toScannedMessage(message: GmailMessage): ScannedMessage | null {
  const from = parseMailbox(decodeMimeWords(getHeader(message, 'From') ?? ''));
  if (!from) return null;
  const listId = getHeader(message, 'List-Id');
  return {
    id: message.id,
    threadId: message.threadId,
    fromAddress: from.address,
    fromName: from.name,
    subject: decodeMimeWords(getHeader(message, 'Subject') ?? '').trim(),
    snippet: message.snippet ?? '',
    date: new Date(Number(message.internalDate)).toISOString(),
    listId: listId ? normalizeListId(listId) : undefined,
    listUnsubscribe: getHeader(message, 'List-Unsubscribe'),
    listUnsubscribePost: getHeader(message, 'List-Unsubscribe-Post'),
  };
}

export function toIndexRow(message: ScannedMessage): MessageIndexRow {
  return { id: message.id, threadId: message.threadId, senderId: message.fromAddress, date: message.date, listId: message.listId };
}

function newSender(message: ScannedMessage): Sender {
  return {
    id: message.fromAddress,
    displayName: message.fromName,
    domain: senderDomain(message.fromAddress),
    listIds: [],
    messageCount: 0,
    lastReceivedAt: message.date,
    latestSubject: message.subject,
    latestSnippet: message.snippet,
    latestMessageId: message.id,
    latestThreadId: message.threadId,
    unsubMethods: {},
    status: 'new',
    escalationStep: 0,
    returnCount: 0,
  };
}

/**
 * Folds messages into sender records. `existing` holds stored senders for these addresses;
 * returns copies of every sender the messages touched. Callers must pass each message once.
 */
export function mergeIntoSenders(existing: Map<string, Sender>, messages: ScannedMessage[]): Map<string, Sender> {
  const changed = new Map<string, Sender>();
  for (const message of messages) {
    const id = message.fromAddress;
    const prior = changed.get(id) ?? existing.get(id);
    const sender: Sender = prior ? { ...prior, listIds: [...prior.listIds] } : newSender(message);

    sender.messageCount++;
    if (message.date >= sender.lastReceivedAt) {
      sender.lastReceivedAt = message.date;
      sender.latestSubject = message.subject;
      sender.latestSnippet = message.snippet;
      sender.latestMessageId = message.id;
      sender.latestThreadId = message.threadId;
      if (message.fromName) sender.displayName = message.fromName;
    } else if (!sender.displayName && message.fromName) {
      sender.displayName = message.fromName;
    }
    if (message.listId && !sender.listIds.includes(message.listId)) sender.listIds.push(message.listId);
    if (message.listUnsubscribe && (!sender.unsubMethodsFrom || message.date > sender.unsubMethodsFrom)) {
      sender.unsubMethods = parseUnsubMethods(message.listUnsubscribe, message.listUnsubscribePost);
      sender.unsubMethodsFrom = message.date;
    }
    changed.set(id, sender);
  }
  return changed;
}
