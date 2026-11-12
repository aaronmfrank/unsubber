import { GmailError, type GmailClient } from '../gmail/client';
import type { StorageAdapter } from '../storage/StorageAdapter';
import type { Sender } from '../storage/types';
import { resolveMethods } from './resolve';

export type EscalationStep = 'retry_one_click' | 'email' | 'manual_link' | 'block' | 'report_spam';

export const STEP_LABEL: Record<EscalationStep, string> = {
  retry_one_click: 'Retry one-click',
  email: 'Email unsubscribe',
  manual_link: 'Manual link',
  block: 'Block',
  report_spam: 'Report spam',
};

/** Fits the deck's left button on a phone. */
export const STEP_SHORT_LABEL: Record<EscalationStep, string> = {
  retry_one_click: 'Retry',
  email: 'Email',
  manual_link: 'Link',
  block: 'Block',
  report_spam: 'Report',
};

/** Completes "Swipe left to …" on a stamped card. */
export const STEP_HINT: Record<EscalationStep, string> = {
  retry_one_click: 'retry one-click',
  email: 'send an unsubscribe email',
  manual_link: 'open their link yourself',
  block: 'block them with a Gmail filter',
  report_spam: 'report them as spam',
};

/** The escalation steps this sender supports, in order. Block and Report spam always apply. */
export function escalationLadder(sender: Sender, people: ReadonlySet<string>): EscalationStep[] {
  const resolution = resolveMethods(sender.unsubMethods, people);
  const ladder: EscalationStep[] = [];
  if (resolution.automatic.some((m) => m.kind === 'one_click')) ladder.push('retry_one_click');
  if (resolution.automatic.some((m) => m.kind === 'mailto')) ladder.push('email');
  if (resolution.links.length > 0) ladder.push('manual_link');
  ladder.push('block', 'report_spam');
  return ladder;
}

/**
 * The step a left swipe on a repeat offender queues. `escalationStep` counts runs so far, the first
 * unsubscribe included, so a sender stamped after one unsubscribe gets the first rung.
 */
export function nextEscalation(sender: Sender, people: ReadonlySet<string>): EscalationStep {
  const ladder = escalationLadder(sender, people);
  return ladder[Math.min(Math.max(0, sender.escalationStep - 1), ladder.length - 1)]!;
}

const PARENT_LABEL = 'Unsubber';
export const BLOCKED_LABEL = 'Unsubber/Blocked';

async function blockedLabelId(gmail: GmailClient, storage: StorageAdapter): Promise<string> {
  const cached = await storage.getMeta('blockedLabelId');
  if (cached) return cached;
  const labels = await gmail.listLabels();
  if (!labels.some((l) => l.name === PARENT_LABEL)) await gmail.createLabel(PARENT_LABEL);
  const label = labels.find((l) => l.name === BLOCKED_LABEL) ?? (await gmail.createLabel(BLOCKED_LABEL));
  await storage.setMeta('blockedLabelId', label.id);
  return label.id;
}

/**
 * Creates a Gmail filter that skips the inbox for this sender and labels their mail `Unsubber/Blocked`.
 * Returns the filter id, or a note when an identical filter already existed.
 */
export async function createBlockFilter(sender: Sender, gmail: GmailClient, storage: StorageAdapter): Promise<string> {
  const create = async () =>
    gmail.createFilter({ criteria: { from: sender.id }, action: { addLabelIds: [await blockedLabelId(gmail, storage)], removeLabelIds: ['INBOX'] } });
  try {
    return (await create()).id;
  } catch (error) {
    if (!(error instanceof GmailError) || error.rateLimited) throw error;
    if (/already exists/i.test(error.message)) return 'existing filter';
    if (/label/i.test(error.message)) {
      // The user deleted the label since it was cached.
      await storage.deleteMeta('blockedLabelId');
      return (await create()).id;
    }
    throw error;
  }
}
