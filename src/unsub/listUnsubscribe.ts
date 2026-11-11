import type { UnsubMethods } from '../storage/types';

/** Every URI in a `List-Unsubscribe` header, in header order. Tolerates missing angle brackets. */
export function listUnsubscribeUris(header: string | undefined): string[] {
  if (!header) return [];
  const bracketed = [...header.matchAll(/<([^>]*)>/g)].map((m) => m[1]!);
  const candidates = bracketed.length > 0 ? bracketed : header.split(',');
  return candidates.map((uri) => uri.replace(/\s+/g, '')).filter((uri) => /^(mailto|https?):/i.test(uri));
}

export function isOneClickPost(postHeader: string | undefined): boolean {
  return /List-Unsubscribe\s*=\s*One-Click/i.test(postHeader ?? '');
}

function isValidUrl(uri: string): boolean {
  try {
    new URL(uri);
    return true;
  } catch {
    return false;
  }
}

/** The unsubscribe methods a message offers, from its `List-Unsubscribe` and `List-Unsubscribe-Post` headers. */
export function parseUnsubMethods(header: string | undefined, postHeader: string | undefined): UnsubMethods {
  const uris = listUnsubscribeUris(header).filter(isValidUrl);
  const https = uris.find((uri) => /^https:/i.test(uri));
  const http = https ?? uris.find((uri) => /^http:/i.test(uri));
  const mailto = uris.find((uri) => /^mailto:/i.test(uri));

  const methods: UnsubMethods = {};
  if (https && isOneClickPost(postHeader)) methods.oneClickUrl = https;
  if (mailto) methods.mailto = mailto;
  if (http) methods.httpUrl = http;
  return methods;
}
