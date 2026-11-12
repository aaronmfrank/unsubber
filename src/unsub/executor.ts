import { AuthExpiredError } from '../auth/AuthProvider';
import { GmailError, type GmailClient } from '../gmail/client';
import type { StorageAdapter } from '../storage/StorageAdapter';
import type { Attempt, AttemptMethod, AttemptResult, Sender } from '../storage/types';
import { unsubscribeLinksFromMessage } from './bodyLinks';
import { buildEmail, toBase64Url } from './mime';
import { resolveMethods } from './resolve';

/** Sends the RFC 8058 one-click POST. The browser can't read the response; a server version could. */
export interface UnsubExecutor {
  oneClick(url: string): Promise<{ result: AttemptResult; detail: string }>;
}

const ONE_CLICK_TIMEOUT_MS = 15_000;

export const browserExecutor: UnsubExecutor = {
  async oneClick(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ONE_CLICK_TIMEOUT_MS);
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
        signal: controller.signal,
      });
      return { result: 'sent_unconfirmed', detail: url };
    } finally {
      clearTimeout(timer);
    }
  },
};

let attemptSequence = 0;

/** Sorts in creation order, so attempts logged in the same millisecond still list in the order they ran. */
export function newAttemptId(): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const sequence = (attemptSequence++ % 36 ** 4).toString(36).padStart(4, '0');
  return `${time}-${sequence}-${crypto.randomUUID().slice(0, 8)}`;
}

export interface RunDeps {
  gmail: GmailClient;
  storage: StorageAdapter;
  executor: UnsubExecutor;
  selfAddress: string;
  people: ReadonlySet<string>;
  now?: () => Date;
}

export interface RunResult {
  sender: Sender;
  outcome: 'unsubscribed' | 'manual';
  /** Inbox messages archived, or null if archiving failed. */
  archived: number | null;
}

/** Errors that should stop the whole run, leaving the rest queued, rather than push one sender to the manual queue. */
export function isRunStoppingError(error: unknown): boolean {
  return error instanceof AuthExpiredError || (error instanceof GmailError && error.rateLimited);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Unsubscribes one queued sender: one-click, then email, then the manual queue. Archives their inbox mail either way. */
export async function runUnsubscribe(sender: Sender, deps: RunDeps): Promise<RunResult> {
  const { gmail, storage, executor } = deps;
  const now = () => (deps.now?.() ?? new Date()).toISOString();
  const attempts: Attempt[] = [];
  const record = (method: AttemptMethod, result: AttemptResult, detail: string) =>
    attempts.push({ id: newAttemptId(), senderId: sender.id, method, at: now(), result, detail });
  const saveAttempts = () => Promise.all(attempts.map((a) => storage.addAttempt(a)));

  const resolution = resolveMethods(sender.unsubMethods, deps.people);
  let unsubscribed = false;

  for (const method of resolution.automatic) {
    try {
      if (method.kind === 'one_click') {
        const { result, detail } = await executor.oneClick(method.url);
        record('one_click', result, detail);
      } else {
        const raw = toBase64Url(buildEmail({ from: deps.selfAddress, ...method.target }));
        const sent = await gmail.sendMessage(raw);
        await storage.addSentByApp(sent.id);
        record('mailto', 'sent', sent.id);
      }
      unsubscribed = true;
      break;
    } catch (error) {
      if (isRunStoppingError(error)) {
        await saveAttempts();
        throw error;
      }
      record(method.kind, 'failed', errorText(error));
    }
  }

  let unsubMethods = sender.unsubMethods;
  if (!unsubscribed && resolution.needsBodySearch) {
    try {
      const message = await gmail.getMessageFull(sender.latestMessageId);
      unsubMethods = { ...unsubMethods, bodyLinks: unsubscribeLinksFromMessage(message.payload) };
    } catch (error) {
      if (isRunStoppingError(error)) {
        await saveAttempts();
        throw error;
      }
    }
  }

  const updated: Sender = {
    ...sender,
    unsubMethods,
    status: unsubscribed ? 'unsubscribed' : 'manual',
    prevStatus: undefined,
    ...(unsubscribed && { unsubscribedAt: now(), escalationStep: sender.escalationStep + 1 }),
  };
  await saveAttempts();
  await storage.upsertSenders([updated]);
  await storage.dequeue(sender.id);

  let archived: number | null = null;
  try {
    archived = await gmail.archiveFrom(sender.id);
  } catch {
    archived = null;
  }
  return { sender: updated, outcome: unsubscribed ? 'unsubscribed' : 'manual', archived };
}
