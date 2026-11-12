import type { ScanWindow } from '../storage/types';

/** The quick first scan, so the deck opens fast. The rest loads in the background. */
export const FIRST_SCAN_DAYS = 30;
/** How far back incoming mail reaches once background loading finishes. */
export const MAIL_TARGET_DAYS = 90;
/** How far back sent mail is read for the people-you-email set. */
export const PEOPLE_TARGET_DAYS = 365;
/** Each Scan older mail step. */
export const OLDER_SCAN_DAYS = 90;

/** Gmail's `after:`/`before:` date format, in local time. */
export function formatGmailDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function daysAgo(days: number, now = new Date()): string {
  return formatGmailDate(addDays(now, -days));
}

/** The last `days` days, with `before` set to tomorrow so today's mail is included. */
export function initialWindow(now = new Date(), days = FIRST_SCAN_DAYS): ScanWindow {
  return { after: daysAgo(days, now), before: formatGmailDate(addDays(now, 1)) };
}

export function parseGmailDate(value: string): Date {
  const [year, month, day] = value.split('/').map(Number);
  return new Date(year!, month! - 1, day!);
}

/** The `days` days just before the oldest window scanned so far. */
export function olderWindow(scanned: readonly ScanWindow[], now = new Date(), days = OLDER_SCAN_DAYS): ScanWindow {
  const oldest = scanned.length > 0 ? scanned.map((w) => w.after).sort()[0]! : initialWindow(now).after;
  return { after: formatGmailDate(addDays(parseGmailDate(oldest), -days)), before: oldest };
}

/** The span every scanned window covers together, or null before the first scan. */
export function coveredRange(scanned: readonly ScanWindow[]): ScanWindow | null {
  if (scanned.length === 0) return null;
  return { after: scanned.map((w) => w.after).sort()[0]!, before: scanned.map((w) => w.before).sort().at(-1)! };
}

/** From the day before `since` through today, for catching up after the history id expired. */
export function windowSince(since: Date, now = new Date()): ScanWindow {
  return { after: formatGmailDate(addDays(since, -1)), before: formatGmailDate(addDays(now, 1)) };
}

export function windowQuery({ after, before }: ScanWindow): string {
  return `after:${after} before:${before} -in:sent -in:drafts -in:chats`;
}

export function sentQuery({ after, before }: ScanWindow): string {
  return `in:sent after:${after} before:${before}`;
}
