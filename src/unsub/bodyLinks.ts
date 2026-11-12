import type { GmailMessagePart } from '../gmail/types';

const MAX_LINKS = 5;
const KEYWORDS = /unsubscribe|opt[\s_-]?out|manage[\s_-]+(?:your[\s_-]+)?(?:email[\s_-]+|subscription[\s_-]+|communication[\s_-]+)?preferences|email[\s_-]+preferences/i;

function base64UrlToText(data: string, charset: string): string {
  const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function partCharset(part: GmailMessagePart): string {
  const contentType = part.headers?.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? '';
  return contentType.match(/charset="?([^";\s]+)"?/i)?.[1] ?? 'utf-8';
}

/** Every decoded part of one MIME type, depth first. */
export function partsOfType(part: GmailMessagePart | undefined, mimeType: string): string[] {
  if (!part) return [];
  const own = part.mimeType === mimeType && part.body?.data ? [base64UrlToText(part.body.data, partCharset(part))] : [];
  return [...own, ...(part.parts ?? []).flatMap((child) => partsOfType(child, mimeType))];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function isHttpUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Links in an HTML body whose URL or anchor text mentions unsubscribing, opting out or managing preferences. */
export function findUnsubscribeLinks(html: string): string[] {
  const links: string[] = [];
  const anchor = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (const match of html.matchAll(anchor)) {
    const href = decodeEntities((match[1] ?? match[2] ?? match[3] ?? '').trim());
    const text = decodeEntities(match[4]!.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ');
    if (!isHttpUrl(href) || !(KEYWORDS.test(text) || KEYWORDS.test(href))) continue;
    if (!links.includes(href)) links.push(href);
    if (links.length === MAX_LINKS) break;
  }
  return links;
}

/** Plain-text fallback: bare URLs that mention unsubscribing. */
export function findUnsubscribeUrlsInText(text: string): string[] {
  const urls = [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map((m) => m[0]);
  return [...new Set(urls.filter((url) => KEYWORDS.test(url) && isHttpUrl(url)))].slice(0, MAX_LINKS);
}

export function unsubscribeLinksFromMessage(payload: GmailMessagePart | undefined): string[] {
  const fromHtml = partsOfType(payload, 'text/html').flatMap(findUnsubscribeLinks);
  const links = fromHtml.length > 0 ? fromHtml : partsOfType(payload, 'text/plain').flatMap(findUnsubscribeUrlsInText);
  return [...new Set(links)].slice(0, MAX_LINKS);
}
