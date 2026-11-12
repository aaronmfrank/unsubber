import { create } from 'zustand';
import { AuthExpiredError } from '../auth';
import { GmailError } from '../gmail/client';
import { syncNewMail, type SyncResult } from '../scan/scan';
import { storage } from '../storage';
import { useDeck } from './deck';
import { gmail, useSession } from './session';
import { useToast } from './toast';

/** Coming back to the app after this long checks for new mail again. */
const RESUME_SYNC_AFTER_MS = 10 * 60 * 1000;

interface SyncState {
  running: boolean;
  lastSyncedAt: number | null;
  /** `manual` always reports a result; automatic syncs only speak up when something changed. */
  sync(trigger: 'open' | 'resume' | 'manual'): Promise<void>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function resultMessage(result: SyncResult): string | null {
  const parts: string[] = [];
  if (result.newOffenders.length > 0) {
    parts.push(
      `${plural(result.newOffenders.length, 'repeat offender is', 'repeat offenders are')} back at the front of Main.`,
    );
  }
  if (result.newSenders > 0) parts.push(`${plural(result.newSenders, 'new sender', 'new senders')} to swipe.`);
  return parts.length > 0 ? parts.join(' ') : null;
}

export const useSync = create<SyncState>()((set, get) => ({
  running: false,
  lastSyncedAt: null,

  async sync(trigger) {
    const { running, lastSyncedAt } = get();
    if (running) return;
    if (trigger === 'resume' && lastSyncedAt && Date.now() - lastSyncedAt < RESUME_SYNC_AFTER_MS) return;
    const email = useSession.getState().email;
    if (!email || useSession.getState().status !== 'signed_in') return;

    set({ running: true });
    try {
      const result = await syncNewMail({ gmail, storage, selfAddress: email });
      useDeck.getState().absorbSync(result.changed);
      const message = resultMessage(result);
      if (message) useToast.getState().show({ message, tone: 'ok' });
      else if (trigger === 'manual') useToast.getState().show({ message: 'No new mail since the last check.', tone: 'ok' });
      set({ lastSyncedAt: Date.now() });
    } catch (error) {
      if (error instanceof AuthExpiredError) return;
      const message =
        error instanceof GmailError && error.rateLimited
          ? 'Gmail asked Unsubber to slow down. Check mail again in a minute.'
          : `Couldn't check for new mail: ${error instanceof Error ? error.message : 'unknown error'}. Try Check mail again.`;
      useToast.getState().show({ message, tone: 'error' });
    } finally {
      set({ running: false });
    }
  },
}));
