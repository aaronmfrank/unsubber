import { create } from 'zustand';
import { AuthExpiredError } from '../auth';
import { GmailError } from '../gmail/client';
import { hasCompletedInitialScan, runInitialScan, type ScanProgress } from '../scan/scan';
import { requestPersistentStorage, storage } from '../storage';
import { gmail } from './session';

const AUTO_RESUME_MS = 60_000;

export type ScanStatus = 'checking' | 'running' | 'done' | 'error';

interface ScanState {
  status: ScanStatus;
  progress: ScanProgress | null;
  error: string | null;
  /** When a rate-limited scan restarts on its own. */
  resumeAt: number | null;
  /** Bumped when a scan finishes so screens reload their data. */
  version: number;
  ensureScanned(selfAddress: string): Promise<void>;
  resetAndRescan(selfAddress: string): Promise<void>;
}

let resumeTimer: ReturnType<typeof setTimeout> | null = null;

export const useScan = create<ScanState>()((set, get) => ({
  status: 'checking',
  progress: null,
  error: null,
  resumeAt: null,
  version: 0,

  async ensureScanned(selfAddress) {
    if (get().status === 'running') return;
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = null;
    void requestPersistentStorage();
    const account = selfAddress.toLowerCase();
    const owner = await storage.getMeta('accountEmail');
    if (owner && owner !== account) await storage.clearAll();
    if (owner !== account) await storage.setMeta('accountEmail', account);

    if (await hasCompletedInitialScan(storage)) {
      set({ status: 'done', error: null, resumeAt: null });
      return;
    }
    set({ status: 'running', progress: null, error: null, resumeAt: null });
    try {
      await runInitialScan({ gmail, storage, selfAddress, onProgress: (progress) => set({ progress }) });
      set((s) => ({ status: 'done', progress: null, version: s.version + 1 }));
    } catch (error) {
      if (error instanceof GmailError && error.rateLimited) {
        resumeTimer = setTimeout(() => void get().ensureScanned(selfAddress), AUTO_RESUME_MS);
        set({
          status: 'error',
          error: 'Gmail asked Unsubber to slow down. The scan picks up where it stopped in a minute.',
          resumeAt: Date.now() + AUTO_RESUME_MS,
        });
        return;
      }
      const message =
        error instanceof AuthExpiredError
          ? 'Gmail sign-in expired during the scan. Sign in again and it picks up where it stopped.'
          : `The scan stopped: ${error instanceof Error ? error.message : 'unknown error'}. Try again and it picks up where it stopped.`;
      set({ status: 'error', error: message });
    }
  },

  async resetAndRescan(selfAddress) {
    if (get().status === 'running') return;
    await storage.clearAll();
    set({ status: 'checking' });
    await get().ensureScanned(selfAddress);
  },
}));
