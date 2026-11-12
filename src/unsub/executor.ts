import { AuthExpiredError } from '../auth/AuthProvider';
import { GmailError, type GmailClient } from '../gmail/client';
import type { StorageAdapter } from '../storage/StorageAdapter';
import type { Attempt, AttemptMethod, AttemptResult, Sender } from '../storage/types';
import { unsubscribeLinksFromMessage } from './bodyLinks';
import { createBlockFilter, nextEscalation, type EscalationStep } from './escalation';
import { buildEmail, toBase64Url } from './mime';
import { resolveMethods, type AutomaticMethod } from './resolve';

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

export type RunOutcome = 'unsubscribed' | 'manual' | 'blocked' | 'failed';

export interface RunResult {
  sender: Sender;
  outcome: RunOutcome;
  /** The escalation step run, for a repeat offender. */
  step?: EscalationStep;
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

/** Collects attempts for one sender and saves them together. */
function attemptLog(senderId: string, storage: StorageAdapter, now: () => string) {
  const attempts: Attempt[] = [];
  return {
    record: (method: AttemptMethod, result: AttemptResult, detail: string) =>
      attempts.push({ id: newAttemptId(), senderId, method, at: now(), result, detail }),
    save: () => Promise.all(attempts.map((a) => storage.addAttempt(a))),
  };
}

async function runAutomatic(method: AutomaticMethod, deps: RunDeps, log: ReturnType<typeof attemptLog>): Promise<void> {
  if (method.kind === 'one_click') {
    const { result, detail } = await deps.executor.oneClick(method.url);
    log.record('one_click', result, detail);
  } else {
    const raw = toBase64Url(buildEmail({ from: deps.selfAddress, ...method.target }));
    const sent = await deps.gmail.sendMessage(raw);
    await deps.storage.addSentByApp(sent.id);
    log.record('mailto', 'sent', sent.id);
  }
}

/** Saves the sender's new state, takes them out of the queue, then archives their inbox mail. */
async function finish(updated: Sender, deps: RunDeps, outcome: RunOutcome, step?: EscalationStep): Promise<RunResult> {
  await deps.storage.upsertSenders([updated]);
  await deps.storage.dequeue(updated.id);
  let archived: number | null;
  try {
    archived = await deps.gmail.archiveFrom(updated.id);
  } catch {
    archived = null;
  }
  return { sender: updated, outcome, step, archived };
}

/** Unsubscribes one queued sender: one-click, then email, then the manual queue. Repeat offenders get their next escalation step. */
export async function runUnsubscribe(sender: Sender, deps: RunDeps): Promise<RunResult> {
  if (sender.prevStatus === 'repeat_offender') return runEscalation(sender, deps);

  const now = () => (deps.now?.() ?? new Date()).toISOString();
  const log = attemptLog(sender.id, deps.storage, now);
  const resolution = resolveMethods(sender.unsubMethods, deps.people);
  let unsubscribed = false;

  for (const method of resolution.automatic) {
    try {
      await runAutomatic(method, deps, log);
      unsubscribed = true;
      break;
    } catch (error) {
      if (isRunStoppingError(error)) {
        await log.save();
        throw error;
      }
      log.record(method.kind, 'failed', errorText(error));
    }
  }

  let unsubMethods = sender.unsubMethods;
  if (!unsubscribed && resolution.needsBodySearch) {
    try {
      const message = await deps.gmail.getMessageFull(sender.latestMessageId);
      unsubMethods = { ...unsubMethods, bodyLinks: unsubscribeLinksFromMessage(message.payload) };
    } catch (error) {
      if (isRunStoppingError(error)) {
        await log.save();
        throw error;
      }
    }
  }

  await log.save();
  return finish(
    {
      ...sender,
      unsubMethods,
      status: unsubscribed ? 'unsubscribed' : 'manual',
      prevStatus: undefined,
      ...(unsubscribed && { unsubscribedAt: now(), escalationStep: sender.escalationStep + 1 }),
    },
    deps,
    unsubscribed ? 'unsubscribed' : 'manual',
  );
}

/**
 * Runs a repeat offender's next step. Retries and email start a new grace period; Block and Report spam
 * end tracking. A failed retry returns the sender to Main stamped, one rung further up the ladder.
 */
async function runEscalation(sender: Sender, deps: RunDeps): Promise<RunResult> {
  const now = () => (deps.now?.() ?? new Date()).toISOString();
  const log = attemptLog(sender.id, deps.storage, now);
  const step = nextEscalation(sender, deps.people);
  const nextRung = { prevStatus: undefined, escalationStep: sender.escalationStep + 1 };

  try {
    if (step === 'retry_one_click' || step === 'email') {
      const resolution = resolveMethods(sender.unsubMethods, deps.people);
      const method = resolution.automatic.find((m) => m.kind === (step === 'email' ? 'mailto' : 'one_click'))!;
      try {
        await runAutomatic(method, deps, log);
      } catch (error) {
        if (isRunStoppingError(error)) throw error;
        log.record(method.kind, 'failed', errorText(error));
        await log.save();
        return finish({ ...sender, ...nextRung, status: 'repeat_offender' }, deps, 'failed', step);
      }
      await log.save();
      return finish({ ...sender, ...nextRung, status: 'unsubscribed', unsubscribedAt: now() }, deps, 'unsubscribed', step);
    }

    if (step === 'manual_link') {
      return finish({ ...sender, prevStatus: undefined, status: 'manual' }, deps, 'manual', step);
    }

    let blocked: Sender;
    try {
      blocked = step === 'block' ? await blockSender(sender, deps, log) : await reportSpamSender(sender, deps, log);
    } catch (error) {
      if (isRunStoppingError(error)) throw error;
      log.record(step === 'block' ? 'filter_block' : 'report_spam', 'failed', errorText(error));
      await log.save();
      return finish({ ...sender, prevStatus: undefined, status: 'repeat_offender' }, deps, 'failed', step);
    }
    await log.save();
    return finish({ ...blocked, ...nextRung }, deps, 'blocked', step);
  } catch (error) {
    await log.save();
    throw error;
  }
}

async function blockSender(sender: Sender, deps: Pick<RunDeps, 'gmail' | 'storage'>, log: ReturnType<typeof attemptLog>): Promise<Sender> {
  const filterId = await createBlockFilter(sender, deps.gmail, deps.storage);
  log.record('filter_block', 'sent', filterId);
  return { ...sender, status: 'blocked' };
}

async function reportSpamSender(sender: Sender, deps: Pick<RunDeps, 'gmail' | 'storage'>, log: ReturnType<typeof attemptLog>): Promise<Sender> {
  const moved = await deps.gmail.reportSpamFrom(sender.id);
  log.record('report_spam', 'sent', `${moved} ${moved === 1 ? 'message' : 'messages'} moved to Spam`);
  return { ...sender, status: 'blocked' };
}

/** Block or Report spam straight from the manual queue, without going through the unsubscribe queue. */
export async function blockOrReportNow(
  sender: Sender,
  action: 'block' | 'report_spam',
  deps: Pick<RunDeps, 'gmail' | 'storage' | 'now'>,
): Promise<Sender> {
  const now = () => (deps.now?.() ?? new Date()).toISOString();
  const log = attemptLog(sender.id, deps.storage, now);
  try {
    const blocked = action === 'block' ? await blockSender(sender, deps, log) : await reportSpamSender(sender, deps, log);
    const updated: Sender = { ...blocked, prevStatus: undefined, escalationStep: sender.escalationStep + 1 };
    await deps.storage.upsertSenders([updated]);
    if (action === 'block') await deps.gmail.archiveFrom(sender.id).catch(() => 0);
    return updated;
  } finally {
    await log.save();
  }
}
