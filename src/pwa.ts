import { registerSW } from 'virtual:pwa-register';
import { create } from 'zustand';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

interface UpdateState {
  /** A new version is downloaded and waiting for a reload. */
  ready: boolean;
  apply(): void;
}

let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;

export const useUpdate = create<UpdateState>()(() => ({
  ready: false,
  apply: () => void updateServiceWorker?.(true),
}));

/**
 * The service worker serves the cached app, so a deploy only shows after the new worker takes over.
 * Checks again whenever the app comes back to the foreground; iOS resumes home-screen apps instead of reloading them.
 */
export function startServiceWorker(): void {
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh: () => useUpdate.setState({ ready: true }),
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    },
  });
}

export const BUILD = __BUILD_INFO__;

/** 0.4.1 → 4: the minor version tracks the last finished milestone. */
export const MILESTONE = Number(BUILD.version.split('.')[1] ?? 0);
