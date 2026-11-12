import { create } from 'zustand';
import { AuthExpiredError } from '../auth';
import { GmailError } from '../gmail/client';
import { scanOlderMail, type ScanProgress } from '../scan/scan';
import { olderWindow } from '../scan/windows';
import { storage } from '../storage';
import type { ScanWindow } from '../storage/types';
import { windowLabel } from '../ui/format';
import { useDeck } from './deck';
import { gmail, useSession } from './session';
import { useToast } from './toast';

interface OlderScanState {
  running: boolean;
  progress: ScanProgress | null;
  scanned: ScanWindow[];
  /** The window the next run covers: an interrupted one, or the 90 days before everything scanned. */
  next: ScanWindow | null;
  resuming: boolean;
  refresh(): Promise<void>;
  run(): Promise<void>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const useOlderScan = create<OlderScanState>()((set, get) => ({
  running: false,
  progress: null,
  scanned: [],
  next: null,
  resuming: false,

  async refresh() {
    const [scanned = [], pending] = await Promise.all([storage.getMeta('scannedWindows'), storage.getMeta('olderScanInProgress')]);
    set({ scanned, next: pending ?? olderWindow(scanned), resuming: Boolean(pending) });
  },

  async run() {
    const email = useSession.getState().email;
    if (get().running || !email) return;
    set({ running: true, progress: null });
    try {
      const { window, result } = await scanOlderMail({ gmail, storage, selfAddress: email, onProgress: (progress) => set({ progress }) });
      useDeck.getState().absorbSync(result.changed);
      const parts = [`Scanned ${windowLabel(window)}.`];
      parts.push(result.newSenders > 0 ? `${plural(result.newSenders, 'new sender is', 'new senders are')} in Main.` : 'No new senders.');
      if (result.newOffenders.length > 0) parts.push(`${plural(result.newOffenders.length, 'repeat offender', 'repeat offenders')} found.`);
      useToast.getState().show({ message: parts.join(' '), tone: 'ok' });
    } catch (error) {
      if (!(error instanceof AuthExpiredError)) {
        const reason =
          error instanceof GmailError && error.rateLimited
            ? 'Gmail asked Unsubber to slow down.'
            : `The scan stopped: ${error instanceof Error ? error.message : 'unknown error'}.`;
        useToast.getState().show({ message: `${reason} Tap Resume to pick up where it stopped.`, tone: 'error' });
      }
    } finally {
      set({ running: false, progress: null });
      await get().refresh();
    }
  },
}));
