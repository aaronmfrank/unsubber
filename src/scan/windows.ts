import type { ScanWindow } from '../storage/types';

export const INITIAL_WINDOW_DAYS = 90;

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

/** The last 90 days, with `before` set to tomorrow so today's mail is included. */
export function initialWindow(now = new Date()): ScanWindow {
  return { after: formatGmailDate(addDays(now, -INITIAL_WINDOW_DAYS)), before: formatGmailDate(addDays(now, 1)) };
}

export function windowQuery({ after, before }: ScanWindow): string {
  return `after:${after} before:${before} -in:sent -in:drafts -in:chats`;
}
