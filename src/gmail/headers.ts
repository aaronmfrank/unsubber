import type { GmailMessage } from './types';

export function getHeader(message: GmailMessage, name: string): string | undefined {
  const lower = name.toLowerCase();
  return message.payload?.headers?.find((h) => h.name.toLowerCase() === lower)?.value;
}

const ENCODED_WORD = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text.replace(/[^A-Za-z0-9+/=]/g, ''));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function qToBytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '_') bytes.push(0x20);
    else if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(c.charCodeAt(0));
  }
  return Uint8Array.from(bytes);
}

/** Decodes RFC 2047 encoded words. Adjacent words in one charset are joined before decoding so split characters survive. */
export function decodeMimeWords(input: string): string {
  if (!input.includes('=?')) return input;
  let out = '';
  let last = 0;
  let run: { charset: string; bytes: number[] } | null = null;

  const flush = () => {
    if (!run) return;
    try {
      out += new TextDecoder(run.charset).decode(Uint8Array.from(run.bytes));
    } catch {
      out += new TextDecoder().decode(Uint8Array.from(run.bytes));
    }
    run = null;
  };

  for (const match of input.matchAll(ENCODED_WORD)) {
    const [whole, rawCharset, encoding, text] = match;
    const between = input.slice(last, match.index);
    const charset = rawCharset!.split('*')[0]!.toLowerCase();
    if (run && (/\S/.test(between) || run.charset !== charset)) flush();
    if (!run) {
      out += between;
      run = { charset, bytes: [] };
    }
    const bytes = encoding!.toUpperCase() === 'B' ? base64ToBytes(text!) : qToBytes(text!);
    (run as { bytes: number[] }).bytes.push(...bytes);
    last = match.index + whole.length;
  }
  flush();
  return out + input.slice(last);
}

export interface Mailbox {
  name: string;
  address: string;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return trimmed;
}

/** Parses one mailbox, such as `"Brand X" <deals@brandx.com>` or `deals@brandx.com (Brand X)`. */
export function parseMailbox(value: string): Mailbox | null {
  const angle = value.match(/<([^<>]*)>\s*$/) ?? value.match(/<([^<>]*@[^<>]*)>/);
  if (angle) {
    const address = angle[1]!.trim().toLowerCase();
    if (!address.includes('@')) return null;
    const name = decodeMimeWords(unquote(value.slice(0, angle.index)));
    return { name: name === address ? '' : name, address };
  }
  const comment = value.match(/^\s*([^\s()]+@[^\s()]+)\s*\(([^)]*)\)\s*$/);
  if (comment) return { name: decodeMimeWords(comment[2]!.trim()), address: comment[1]!.toLowerCase() };

  const bare = value.trim().replace(/^"|"$/g, '');
  return /^[^\s@]+@[^\s@]+$/.test(bare) ? { name: '', address: bare.toLowerCase() } : null;
}

/** Splits an address list on commas that aren't inside quotes, angle brackets or comments. */
function splitAddressList(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let angleDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === '\\' && inQuotes) {
      current += c + (value[i + 1] ?? '');
      i++;
      continue;
    }
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (c === '<') angleDepth++;
      else if (c === '>') angleDepth = Math.max(0, angleDepth - 1);
      else if (c === '(') parenDepth++;
      else if (c === ')') parenDepth = Math.max(0, parenDepth - 1);
      else if ((c === ',' || c === ';') && angleDepth === 0 && parenDepth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
    }
    current += c;
  }
  parts.push(current);
  return parts;
}

/** Lowercased addresses from a To, Cc or Bcc header, including members of groups like `Team: a@x.com, b@x.com;`. */
export function parseAddressList(value: string | undefined): string[] {
  if (!value) return [];
  const addresses: string[] = [];
  for (const raw of splitAddressList(value)) {
    const part = raw.replace(/^[^"<@:]*:/, '');
    const mailbox = parseMailbox(part);
    if (mailbox) addresses.push(mailbox.address);
  }
  return addresses;
}
