export interface MailtoTarget {
  to: string[];
  subject: string;
  body: string;
}

const ADDRESS = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Parses an RFC 6068 `mailto:` URI. Subject defaults to `unsubscribe`; returns null without a usable address. */
export function parseMailto(uri: string): MailtoTarget | null {
  const match = uri.trim().match(/^mailto:([^?]*)(?:\?(.*))?$/i);
  if (!match) return null;

  const to = match[1] ? match[1].split(',').map((a) => decode(a).trim().toLowerCase()) : [];
  let subject = '';
  let body = '';
  for (const pair of (match[2] ?? '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const name = decode(eq === -1 ? pair : pair.slice(0, eq)).toLowerCase();
    const value = eq === -1 ? '' : decode(pair.slice(eq + 1));
    if (name === 'to') to.push(...value.split(',').map((a) => a.trim().toLowerCase()));
    else if (name === 'subject') subject = value;
    else if (name === 'body') body = value;
  }

  const addresses = [...new Set(to.filter((a) => ADDRESS.test(a)))];
  if (addresses.length === 0) return null;
  return { to: addresses, subject: subject.trim() || 'unsubscribe', body: body.trim() || 'unsubscribe' };
}
