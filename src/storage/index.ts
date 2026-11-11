import { DexieStorage } from './dexieAdapter';
import type { StorageAdapter } from './StorageAdapter';

export type { StorageAdapter } from './StorageAdapter';
export * from './types';

export const storage: StorageAdapter = new DexieStorage();

/** Asks the browser not to evict our data. Home-screen apps on iOS are exempt anyway. */
export async function requestPersistentStorage(): Promise<void> {
  if (await storage.getMeta('storagePersisted')) return;
  const persisted = (await navigator.storage?.persist?.()) ?? false;
  if (persisted) await storage.setMeta('storagePersisted', true);
}
