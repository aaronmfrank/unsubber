import type { Attempt, MessageIndexRow, MetaKey, QueueItem, Sender } from './types';

export const EXPORT_FORMAT = 'unsubber-export';
export const EXPORT_VERSION = 1;

/** Meta that only makes sense on the device that wrote it. */
export const DEVICE_ONLY_META: readonly MetaKey[] = ['storagePersisted', 'scanInProgress', 'olderScanInProgress'];

export interface UnsubberExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  /** The Gmail account the data belongs to. */
  account: string | null;
  appVersion: string;
  data: {
    senders: Sender[];
    messages: MessageIndexRow[];
    attempts: Attempt[];
    queue: QueueItem[];
    people: string[];
    sentByApp: string[];
    meta: Partial<Record<MetaKey, unknown>>;
  };
}

export class ExportFormatError extends Error {
  override name = 'ExportFormatError';
}

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

/** Parses and checks an export file. Throws ExportFormatError with a message fit for the user. */
export function parseExport(text: string): UnsubberExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ExportFormatError("That file isn't an Unsubber export. Choose the .json file from Export.");
  }
  const file = parsed as Partial<UnsubberExport> | null;
  if (!file || file.format !== EXPORT_FORMAT) {
    throw new ExportFormatError("That file isn't an Unsubber export. Choose the .json file from Export.");
  }
  if (file.version !== EXPORT_VERSION) {
    throw new ExportFormatError('That export is from a different version of Unsubber. Update both devices and export again.');
  }
  const data = file.data;
  const tables = ['senders', 'messages', 'attempts', 'queue', 'people', 'sentByApp'] as const;
  if (!data || tables.some((table) => !isArray(data[table])) || typeof data.meta !== 'object' || data.meta === null) {
    throw new ExportFormatError('That export is incomplete or damaged. Export again on the other device.');
  }
  if (data.senders.some((s) => typeof s?.id !== 'string' || typeof s?.status !== 'string')) {
    throw new ExportFormatError('That export has damaged sender records. Export again on the other device.');
  }
  return file as UnsubberExport;
}
