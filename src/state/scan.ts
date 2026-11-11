import { create } from 'zustand';
import { AuthExpiredError } from '../auth';
import { hasCompletedInitialScan, runInitialScan, type ScanProgress } from '../scan/scan';
import { requestPersistentStorage, storage } from '../storage';
import { gmail } from './session';

export type ScanStatus = 'checking' | 'running' | 'done' | 'error';

interface ScanState {
  status: ScanStatus;
  progress: ScanProgress | null;
  error: string | null;
  /** Bumped when a scan finishes so screens reload their data. */
  version: number;
  ensureScanned(selfAddress: string): Promise<void>;
  resetAndRescan(selfAddress: string): Promise<void>;
}

export const useScan = create<ScanState>()((set, get) => ({
  status: 'checking',
  progress: null,
  error: null,
  version: 0,

  async ensureScanned(selfAddress) {
    if (get().status === 'running') return;
    void requestPersistentStorage();
    if (await hasCompletedInitialScan(storage)) {
      set({ status: 'done', error: null });
      return;
    }
    set({ status: 'running', progress: null, error: null });
    try {
      await runInitialScan({ gmail, storage, selfAddress, onProgress: (progress) => set({ progress }) });
      set((s) => ({ status: 'done', progress: null, version: s.version + 1 }));
    } catch (error) {
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
