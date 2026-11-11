import type { Sender } from '../storage';

export const number = new Intl.NumberFormat();

const sameYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const otherYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function shortDate(iso: string): string {
  const date = new Date(iso);
  return (date.getFullYear() === new Date().getFullYear() ? sameYear : otherYear).format(date);
}

/** "47 emails, last on Nov 9" */
export function countLine(sender: Sender): string {
  const emails = `${number.format(sender.messageCount)} ${sender.messageCount === 1 ? 'email' : 'emails'}`;
  return `${emails}, last on ${shortDate(sender.lastReceivedAt)}`;
}

export type MethodBadge = 'One-click' | 'Email' | 'Link' | 'No link found';

export function methodBadge({ unsubMethods: m }: Sender): MethodBadge {
  if (m.oneClickUrl) return 'One-click';
  if (m.mailto) return 'Email';
  if (m.httpUrl || m.bodyLinks?.length) return 'Link';
  return 'No link found';
}

export function senderName(sender: Sender): string {
  return sender.displayName || sender.id.slice(0, sender.id.indexOf('@')) || sender.id;
}

// Zero-width and soft characters marketers pad preheaders with.
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u2028-\u202F\u2060-\u206F\u3164\uFEFF]/g;

let decoder: HTMLTextAreaElement | null = null;

/** Gmail snippets arrive HTML-escaped (`&#39;`), sometimes padded with invisible characters. */
export function cleanSnippet(snippet: string): string {
  let text = snippet;
  if (text.includes('&') && typeof document !== 'undefined') {
    decoder ??= document.createElement('textarea');
    decoder.innerHTML = text;
    text = decoder.value;
  }
  return text.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

export function gmailThreadUrl(threadId: string, account: string | null): string {
  const authuser = account ? `?authuser=${encodeURIComponent(account)}` : '';
  return `https://mail.google.com/mail/${authuser}#all/${threadId}`;
}
