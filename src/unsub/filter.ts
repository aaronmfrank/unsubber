import { GmailError, type GmailClient } from '../gmail/client';
import type { Sender, FilterActions } from '../storage/types';
import { isRunStoppingError, newAttemptId, type RunDeps, type RunResult } from './executor';

export const defaultFilterLabel = (sender: Sender) => `Unsubber/${sender.domain}`;

export function hasAnyAction({ skipInbox, markRead, label }: FilterActions): boolean {
  return skipInbox || markRead || Boolean(label?.trim());
}

/** "skips the inbox, marked as read, labeled Unsubber/brand.com" */
export function describeFilter({ skipInbox, markRead, label }: FilterActions): string {
  return [skipInbox && 'skips the inbox', markRead && 'marked as read', label && `labeled ${label}`].filter(Boolean).join(', ');
}

/** The Gmail label change a filter makes, for both the filter and the mail already in the inbox. */
export function labelChange(actions: FilterActions, labelId: string | null): { addLabelIds?: string[]; removeLabelIds?: string[] } {
  const remove = [actions.skipInbox && 'INBOX', actions.markRead && 'UNREAD'].filter((l): l is string => Boolean(l));
  return { ...(labelId && { addLabelIds: [labelId] }), ...(remove.length > 0 && { removeLabelIds: remove }) };
}

/** Finds or creates a label, creating parents first so `Unsubber/brand.com` nests under `Unsubber`. */
export async function ensureLabel(gmail: GmailClient, name: string): Promise<string> {
  const labels = [...(await gmail.listLabels())];
  const parts = name.split('/').map((p) => p.trim()).filter(Boolean);
  let id = '';
  for (let i = 1; i <= parts.length; i++) {
    const path = parts.slice(0, i).join('/');
    const existing = labels.find((l) => l.name.toLowerCase() === path.toLowerCase());
    if (existing) {
      id = existing.id;
      continue;
    }
    const created = await gmail.createLabel(path);
    labels.push(created);
    id = created.id;
  }
  return id;
}

/**
 * Commits a filter swipe: creates the Gmail filter for the sender's address, then applies the same
 * change to their inbox mail now. A failure puts the sender back where they were.
 */
export async function runFilter(sender: Sender, actions: FilterActions, deps: Pick<RunDeps, 'gmail' | 'storage' | 'now'>): Promise<RunResult> {
  const { gmail, storage } = deps;
  const at = (deps.now?.() ?? new Date()).toISOString();
  const log = (result: 'sent' | 'failed', detail: string) =>
    storage.addAttempt({ id: newAttemptId(), senderId: sender.id, method: 'filter_archive', at, result, detail });

  try {
    const label = actions.label?.trim() || null;
    const change = labelChange({ ...actions, label }, label ? await ensureLabel(gmail, label) : null);
    let filterId: string;
    try {
      filterId = (await gmail.createFilter({ criteria: { from: sender.id }, action: change })).id;
    } catch (error) {
      if (!(error instanceof GmailError) || error.rateLimited || !/already exists/i.test(error.message)) throw error;
      filterId = 'existing filter';
    }

    const inbox = await gmail.listAllMessages(`from:${sender.id} in:inbox`);
    await gmail.batchModify(
      inbox.map((ref) => ref.id),
      change,
    );

    await log('sent', filterId);
    const updated: Sender = { ...sender, status: 'filtered', prevStatus: undefined, filter: { id: filterId, actions: { ...actions, label }, at } };
    await storage.upsertSenders([updated]);
    await storage.dequeue(sender.id);
    return { sender: updated, outcome: 'filtered', archived: inbox.length };
  } catch (error) {
    if (isRunStoppingError(error)) throw error;
    await log('failed', error instanceof Error ? error.message : String(error));
    const restored: Sender = { ...sender, status: sender.prevStatus ?? 'new', prevStatus: undefined };
    await storage.upsertSenders([restored]);
    await storage.dequeue(sender.id);
    return { sender: restored, outcome: 'failed', archived: null };
  }
}

/** Remove filter, from History: deletes the Gmail filter and treats the sender as a keep from now on. */
export async function removeFilter(sender: Sender, deps: Pick<RunDeps, 'gmail' | 'storage' | 'now'>): Promise<Sender> {
  if (sender.filter && sender.filter.id !== 'existing filter') await deps.gmail.deleteFilter(sender.filter.id);
  const at = (deps.now?.() ?? new Date()).toISOString();
  const updated: Sender = { ...sender, status: 'kept', keptAt: at, countAtKeep: sender.messageCount, filter: undefined };
  await deps.storage.upsertSenders([updated]);
  return updated;
}
