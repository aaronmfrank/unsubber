import { create } from 'zustand';
import { AuthExpiredError } from '../auth';
import { GmailError } from '../gmail/client';
import { storage, type Sender } from '../storage';
import { commitQueue, markManualDone, type CommitSummary } from '../unsub/commit';
import { nextEscalation, STEP_LABEL } from '../unsub/escalation';
import { blockOrReportNow, browserExecutor } from '../unsub/executor';
import { methodGroup, resolveMethods } from '../unsub/resolve';
import { flushDeckWrites, useDeck } from './deck';
import { gmail, useSession } from './session';
import { useToast, type Toast } from './toast';

/** How the confirm sheet counts a sender. Repeat offenders count by their escalation step. */
export type QueueGroup = 'one_click' | 'email' | 'needs_you' | 'block' | 'report_spam';

export interface QueuedSender {
  sender: Sender;
  group: QueueGroup;
  /** Row label: the method, or the escalation step for a repeat offender. */
  label: string;
}

interface QueueState {
  sheetOpen: boolean;
  items: QueuedSender[];
  running: boolean;
  progress: { done: number; total: number } | null;
  openSheet(): Promise<void>;
  closeSheet(): void;
  /** Takes a sender out of the queue before commit, restoring the status it had. */
  removeFromQueue(senderId: string): Promise<void>;
  commit(): Promise<void>;
  markDone(senderId: string, openedLink: string | null): Promise<void>;
  blockOrReport(senderId: string, action: 'block' | 'report_spam'): Promise<void>;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const GROUP_LABEL: Record<QueueGroup, string> = {
  one_click: 'One-click',
  email: 'Email',
  needs_you: 'Needs you',
  block: 'Block',
  report_spam: 'Report spam',
};

function classify(sender: Sender, people: ReadonlySet<string>): QueuedSender {
  if (sender.prevStatus === 'repeat_offender') {
    const step = nextEscalation(sender, people);
    const group: QueueGroup =
      step === 'retry_one_click' ? 'one_click' : step === 'email' ? 'email' : step === 'manual_link' ? 'needs_you' : step;
    return { sender, group, label: STEP_LABEL[step] };
  }
  const group = methodGroup(resolveMethods(sender.unsubMethods, people));
  return { sender, group, label: GROUP_LABEL[group] };
}

function errorText(error: Error): string {
  if (error instanceof AuthExpiredError) return 'Gmail sign-in expired.';
  if (error instanceof GmailError && error.rateLimited) return 'Gmail asked Unsubber to slow down.';
  return `${error.message}.`;
}

function summaryToast(summary: CommitSummary): Toast {
  const parts: string[] = [];
  if (summary.stoppedBy) {
    const retry = summary.stoppedBy instanceof AuthExpiredError ? 'Sign in again and tap Unsubscribe.' : 'Try again in a minute.';
    parts.push(`${errorText(summary.stoppedBy)} ${summary.remaining} still queued. ${retry}`);
  }
  if (summary.unsubscribed > 0) parts.push(`Unsubscribed from ${summary.unsubscribed}.`);
  if (summary.blocked > 0) parts.push(`Blocked ${summary.blocked}.`);
  if (summary.failed > 0)
    parts.push(`${summary.failed} ${plural(summary.failed, 'escalation', 'escalations')} failed and ${plural(summary.failed, 'is', 'are')} back in Main.`);
  if (summary.archiveFailed > 0)
    parts.push(`Couldn't archive mail from ${summary.archiveFailed} ${plural(summary.archiveFailed, 'sender', 'senders')}.`);
  return { message: parts.join(' '), needYou: summary.manual, tone: summary.stoppedBy ? 'error' : 'ok' };
}

async function peopleWithSelf(): Promise<Set<string>> {
  const self = useSession.getState().email?.toLowerCase();
  return new Set([...(await storage.listPeople()), ...(self ? [self] : [])]);
}

export const useQueue = create<QueueState>()((set, get) => ({
  sheetOpen: false,
  items: [],
  running: false,
  progress: null,

  async openSheet() {
    await flushDeckWrites();
    const queue = await storage.listQueue();
    const senders = await storage.getSenders(queue.map((item) => item.senderId));
    const people = await peopleWithSelf();
    const items = queue
      .map((item) => senders.get(item.senderId))
      .filter((s): s is Sender => s?.status === 'queued')
      .map((sender) => classify(sender, people));
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
    useDeck.getState().lockSwipes(get().items.map((i) => i.sender.id));
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
      summary = {
        unsubscribed: 0,
        manual: 0,
        blocked: 0,
        failed: 0,
        archiveFailed: 0,
        stoppedBy: error instanceof Error ? error : new Error(String(error)),
        remaining: get().items.length,
      };
    }

    useDeck.getState().setQueueCount((await storage.listQueue()).length);
    set({ running: false, sheetOpen: false, items: [], progress: null });
    useToast.getState().show(summaryToast(summary));
  },

  async markDone(senderId, openedLink) {
    const sender = useDeck.getState().senders[senderId];
    if (!sender || sender.status !== 'manual') return;
    const updated = await markManualDone(sender, openedLink, { storage });
    useDeck.getState().patchSenders([updated]);
  },

  async blockOrReport(senderId, action) {
    const sender = useDeck.getState().senders[senderId];
    if (!sender) return;
    try {
      const updated = await blockOrReportNow(sender, action, { gmail, storage });
      useDeck.getState().patchSenders([updated]);
      useToast.getState().show({
        message: action === 'block' ? `Blocked ${sender.id}. New mail skips the inbox.` : `Reported ${sender.id} as spam.`,
        tone: 'ok',
      });
    } catch (error) {
      useToast.getState().show({
        message: `Couldn't ${action === 'block' ? 'block' : 'report'} ${sender.id}: ${errorText(error instanceof Error ? error : new Error(String(error)))} Try again.`,
        tone: 'error',
      });
    }
  },
}));
