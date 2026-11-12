import { create } from 'zustand';
import { AuthExpiredError } from '../auth';
import { GmailError } from '../gmail/client';
import { needsBackfill, runBackfill, type ScanProgress } from '../scan/scan';
import { storage } from '../storage';
import { useDeck } from './deck';
import { gmail, useSession } from './session';
import { useToast } from './toast';

const RETRY_AFTER_RATE_LIMIT_MS = 60_000;
const RETRY_AFTER_ERROR_MS = 2 * 60_000;

export type BackfillStatus = 'checking' | 'running' | 'paused' | 'done';

interface BackfillState {
  status: BackfillStatus;
  progress: ScanProgress | null;
  /** Starts or resumes loading the rest of the first scan's range. Safe to call repeatedly. */
  start(): Promise<void>;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** After the quick 30-day first scan, loads a year of sent mail and 90 days of incoming in the background. */
export const useBackfill = create<BackfillState>()((set, get) => ({
  status: 'checking',
  progress: null,

  async start() {
    if (get().status === 'running') return;
    const email = useSession.getState().email;
    if (!email || useSession.getState().status !== 'signed_in') return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    if (!(await needsBackfill(storage))) {
      set({ status: 'done', progress: null });
      return;
    }

    set({ status: 'running', progress: null });
    try {
      const result = await runBackfill({ gmail, storage, selfAddress: email, onProgress: (progress) => set({ progress }) });
      useDeck.getState().absorbSync(result.changed, result.removedSenders);
      if (result.window) {
        const more = result.newSenders > 0 ? `${plural(result.newSenders, 'more sender', 'more senders')} in Main.` : 'No new senders.';
        useToast.getState().show({ message: `Finished loading the last 90 days. ${more}`, tone: 'ok' });
      }
      set({ status: 'done', progress: null });
    } catch (error) {
      set({ status: 'paused', progress: null });
      // An expired sign-in resumes from AppShell once you sign in again.
      if (error instanceof AuthExpiredError) return;
      const wait = error instanceof GmailError && error.rateLimited ? RETRY_AFTER_RATE_LIMIT_MS : RETRY_AFTER_ERROR_MS;
      retryTimer = setTimeout(() => void get().start(), wait);
    }
  },
}));
