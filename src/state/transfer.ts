import { isStandalone } from '../auth';
import { BUILD } from '../pwa';
import { storage } from '../storage';
import { ExportFormatError, parseExport, type UnsubberExport } from '../storage/exportFormat';
import { useDeck } from './deck';
import { useOlderScan } from './olderScan';
import { useScan } from './scan';
import { useSession } from './session';

/**
 * Saves everything on this device to a JSON file. The home-screen app on iPhone can't download files,
 * so it opens the share sheet (Save to Files, AirDrop); browsers download.
 */
export async function exportToFile(): Promise<{ senders: number; shared: boolean }> {
  const data = await storage.exportAll({ account: useSession.getState().email, appVersion: BUILD.version });
  const name = `unsubber-export-${data.exportedAt.slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });

  if (isStandalone() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Unsubber export' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { senders: 0, shared: false };
      throw error;
    }
    return { senders: data.data.senders.length, shared: true };
  }

  const url = URL.createObjectURL(file);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { senders: data.data.senders.length, shared: false };
}

/** Reads and checks an export before anything is replaced. */
export async function readExportFile(file: File): Promise<UnsubberExport> {
  const data = parseExport(await file.text());
  const email = useSession.getState().email?.toLowerCase();
  if (data.account && email && data.account.toLowerCase() !== email) {
    throw new ExportFormatError(`That export is for ${data.account}, but you're signed in as ${email}. Sign in with that account to import it.`);
  }
  return data;
}

/** Replaces this device's data with an export, then reloads the decks and syncs from the export's history id. */
export async function applyImport(data: UnsubberExport): Promise<void> {
  await storage.importAll(data);
  await useDeck.getState().load();
  await useOlderScan.getState().refresh();
  useScan.setState((s) => ({ status: 'done', version: s.version + 1 }));
}
