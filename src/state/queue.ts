import { create } from 'zustand';
import { AuthExpiredError } from '../auth';
import { GmailError } from '../gmail/client';
import { storage, type Sender } from '../storage';
import { commitQueue, markManualDone, type CommitSummary } from '../unsub/commit';
import { browserExecutor } from '../unsub/executor';
import { methodGroup, resolveMethods, type MethodGroup } from '../unsub/resolve';
import { flushDeckWrites, useDeck } from './deck';
import { gmail, useSession } from './session';

export interface QueuedSender {
  sender: Sender;
  group: MethodGroup;
}

export interface Toast {
  message: string;
  /** Senders that landed in the manual queue; the toast links there. */
  needYou: number;
  tone: 'ok' | 'error';
}

interface QueueState {
  sheetOpen: boolean;
  items: QueuedSender[];
  running: boolean;
  progress: { done: number; total: number } | null;
  toast: Toast | null;
  openSheet(): Promise<void>;
  closeSheet(): void;
  /** Takes a sender out of the queue before commit, restoring the status it had. */
  removeFromQueue(senderId: string): Promise<void>;
  commit(): Promise<void>;
  markDone(senderId: string, openedLink: string | null): Promise<void>;
  dismissToast(): void;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function summaryToast(summary: CommitSummary): Toast {
  const parts: string[] = [];
  if (summary.stoppedBy) {
    const still = `${summary.remaining} still queued.`;
    if (summary.stoppedBy instanceof AuthExpiredError) parts.push(`Gmail sign-in expired. ${still} Sign in again and tap Unsubscribe.`);
    else if (summary.stoppedBy instanceof GmailError && summary.stoppedBy.rateLimited)
      parts.push(`Gmail asked Unsubber to slow down. ${still} Try again in a minute.`);
    else parts.push(`Unsubscribing stopped: ${summary.stoppedBy.message}. ${still}`);
  }
  if (summary.unsubscribed > 0) parts.push(`Unsubscribed from ${summary.unsubscribed}.`);
  if (summary.archiveFailed > 0)
    parts.push(`Couldn't archive mail from ${summary.archiveFailed} ${plural(summary.archiveFailed, 'sender', 'senders')}.`);
  return { message: parts.join(' '), needYou: summary.manual, tone: summary.stoppedBy ? 'error' : 'ok' };
}

export const useQueue = create<QueueState>()((set, get) => ({
  sheetOpen: false,
  items: [],
  running: false,
  progress: null,
  toast: null,

  async openSheet() {
    await flushDeckWrites();
    const queue = await storage.listQueue();
    const senders = await storage.getSenders(queue.map((item) => item.senderId));
    const self = useSession.getState().email?.toLowerCase();
    const people = new Set([...(await storage.listPeople()), ...(self ? [self] : [])]);
    const items = queue
      .map((item) => senders.get(item.senderId))
      .filter((s): s is Sender => s?.status === 'queued')
      .map((sender) => ({ sender, group: methodGroup(resolveMethods(sender.unsubMethods, people)) }));
    set({ sheetOpen: true, items, progress: null });
  },

  closeSheet() {
    if (!get().running) set({ sheetOpen: false });
  },

  async removeFromQueue(senderId) {
    const item = get().items.find((i) => i.sender.id === senderId);
    if (!item || get().running) return;
    const restored: Sender = { ...item.sender, status: item.sender.prevStatus ?? 'new', prevStatus: undefined };
    await storage.upsertSenders([restored]);
    await storage.dequeue(senderId);
    const items = get().items.filter((i) => i.sender.id !== senderId);
    set({ items, sheetOpen: items.length > 0 });
    useDeck.getState().patchSenders([restored]);
    useDeck.getState().setQueueCount(items.length);
  },

  async commit() {
    const email = useSession.getState().email;
    if (get().running || !email) return;
    const deck = useDeck.getState();
    deck.lockSwipes(get().items.map((i) => i.sender.id));
    set({ running: true, progress: { done: 0, total: get().items.length } });

    let summary: CommitSummary;
    try {
      summary = await commitQueue(
        { gmail, storage, executor: browserExecutor, selfAddress: email },
        {
          onProgress: (done, total) => set({ progress: { done, total } }),
          onSender: (sender) => useDeck.getState().patchSenders([sender]),
        },
      );
    } catch (error) {
      summary = { unsubscribed: 0, manual: 0, archiveFailed: 0, stoppedBy: error instanceof Error ? error : new Error(String(error)), remaining: get().items.length };
    }

    useDeck.getState().setQueueCount((await storage.listQueue()).length);
    set({ running: false, sheetOpen: false, items: [], progress: null, toast: summaryToast(summary) });
  },

  async markDone(senderId, openedLink) {
    const sender = useDeck.getState().senders[senderId];
    if (!sender || sender.status !== 'manual') return;
    const updated = await markManualDone(sender, openedLink, { storage });
    useDeck.getState().patchSenders([updated]);
  },

  dismissToast() {
    set({ toast: null });
  },
}));
