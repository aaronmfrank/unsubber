/** CAN-SPAM gives senders 10 business days to honor an unsubscribe. */
export const GRACE_BUSINESS_DAYS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/** `start` plus `days` business days, skipping Saturdays and Sundays (UTC), keeping the time of day. */
export function addBusinessDays(start: Date, days: number): Date {
  let date = new Date(start);
  let counted = 0;
  while (counted < days) {
    date = new Date(date.getTime() + DAY_MS);
    if (!isWeekend(date)) counted++;
  }
  return date;
}

export function graceEndsAt(unsubscribedAt: string): Date {
  return addBusinessDays(new Date(unsubscribedAt), GRACE_BUSINESS_DAYS);
}

/** Mail inside the grace period is counted but not held against the sender. */
export function isAfterGrace(messageDate: string, unsubscribedAt: string): boolean {
  return new Date(messageDate).getTime() > graceEndsAt(unsubscribedAt).getTime();
}
