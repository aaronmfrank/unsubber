import { describe, expect, it } from 'vitest';
import { findUnsubscribeLinks, findUnsubscribeUrlsInText, unsubscribeLinksFromMessage } from './bodyLinks';
import { parseMailto } from './mailto';
import { buildEmail, toBase64Url } from './mime';
import { methodGroup, resolveMethods } from './resolve';

describe('parseMailto', () => {
  it('reads the address and subject and body parameters', () => {
    expect(parseMailto('mailto:u@x.com?subject=unsub%20me&body=Remove%20please')).toEqual({
      to: ['u@x.com'],
      subject: 'unsub me',
      body: 'Remove please',
    });
  });

  it('defaults the subject and body to unsubscribe', () => {
    expect(parseMailto('mailto:U@X.com')).toEqual({ to: ['u@x.com'], subject: 'unsubscribe', body: 'unsubscribe' });
  });

  it('collects multiple addresses, including a to parameter', () => {
    expect(parseMailto('mailto:a@x.com,b@x.com?to=c@x.com')?.to).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('is case-insensitive about the scheme and parameter names', () => {
    expect(parseMailto('MAILTO:u@x.com?Subject=Stop')?.subject).toBe('Stop');
  });

  it('rejects mailto links without a valid address', () => {
    expect(parseMailto('mailto:?subject=unsub')).toBeNull();
    expect(parseMailto('mailto:not-an-address')).toBeNull();
    expect(parseMailto('https://x.com/u')).toBeNull();
  });

  it('survives bad percent-encoding', () => {
    expect(parseMailto('mailto:u@x.com?subject=100%off')?.subject).toBe('100%off');
  });
});

describe('resolveMethods', () => {
  const nobody = new Set<string>();

  it('tries one-click first, then email, and keeps the link for the manual queue', () => {
    const resolution = resolveMethods({ oneClickUrl: 'https://x.com/1c', mailto: 'mailto:u@x.com', httpUrl: 'https://x.com/1c' }, nobody);
    expect(resolution.automatic.map((m) => m.kind)).toEqual(['one_click', 'mailto']);
    expect(resolution.links).toEqual(['https://x.com/1c']);
    expect(methodGroup(resolution)).toBe('one_click');
  });

  it('uses email when there is no one-click header', () => {
    expect(methodGroup(resolveMethods({ mailto: 'mailto:u@x.com', httpUrl: 'https://x.com/u' }, nobody))).toBe('email');
  });

  it('never emails someone you email', () => {
    const resolution = resolveMethods({ mailto: 'mailto:friend@x.com' }, new Set(['friend@x.com']));
    expect(resolution.automatic).toEqual([]);
    expect(methodGroup(resolution)).toBe('needs_you');
  });

  it('sends a plain link to the manual queue without fetching it', () => {
    const resolution = resolveMethods({ httpUrl: 'https://x.com/prefs' }, nobody);
    expect(resolution).toEqual({ automatic: [], links: ['https://x.com/prefs'], needsBodySearch: false });
  });

  it('asks for a body search only when there is no header and none was done', () => {
    expect(resolveMethods({}, nobody).needsBodySearch).toBe(true);
    expect(resolveMethods({ bodyLinks: [] }, nobody).needsBodySearch).toBe(false);
    expect(resolveMethods({ bodyLinks: ['https://x.com/b'] }, nobody).links).toEqual(['https://x.com/b']);
  });
});

describe('buildEmail', () => {
  const decode = (raw: string) => atob(raw.replace(/-/g, '+').replace(/_/g, '/'));

  it('builds a plain-text message Gmail can send', () => {
    const message = buildEmail({ from: 'me@gmail.com', to: ['u@x.com'], subject: 'unsubscribe', body: 'unsubscribe' });
    expect(message).toContain('From: me@gmail.com\r\nTo: u@x.com\r\nSubject: unsubscribe\r\n');
    expect(message).toContain('Content-Transfer-Encoding: base64\r\n\r\ndW5zdWJzY3JpYmU=');
    expect(decode(toBase64Url(message))).toBe(message);
    expect(toBase64Url(message)).not.toMatch(/[+/=]/);
  });

  it('blocks header injection through the subject or address', () => {
    const message = buildEmail({ from: 'me@gmail.com', to: ['u@x.com\r\nBcc: victim@y.com'], subject: 'unsub\r\nBcc: victim@y.com', body: 'x' });
    const headers = message.split('\r\n\r\n')[0]!.split('\r\n');
    expect(headers.filter((h) => h.startsWith('Bcc'))).toEqual([]);
    expect(headers).toHaveLength(6);
  });

  it('encodes non-ASCII subjects', () => {
    expect(buildEmail({ from: 'a@b.c', to: ['u@x.com'], subject: 'Désabonner', body: 'x' })).toContain('Subject: =?UTF-8?B?RMOpc2Fib25uZXI=?=');
  });
});

describe('body links', () => {
  it('finds links by anchor text or URL, decoding entities', () => {
    const html = `
      <p><a href="https://shop.com/sale">Shop the sale</a></p>
      <a class="x" href='https://shop.com/email/prefs?u=1&amp;t=2'>Manage email preferences</a>
      <a href=https://shop.com/unsubscribe/abc>here</a>
      <a href="https://shop.com/opt-out"><span>Opt</span> <b>out</b></a>
      <a href="javascript:unsubscribe()">Unsubscribe</a>
      <a href="mailto:unsubscribe@shop.com">Unsubscribe by email</a>`;
    expect(findUnsubscribeLinks(html)).toEqual([
      'https://shop.com/email/prefs?u=1&t=2',
      'https://shop.com/unsubscribe/abc',
      'https://shop.com/opt-out',
    ]);
  });

  it('finds unsubscribe URLs in plain text', () => {
    expect(findUnsubscribeUrlsInText('To stop: https://x.com/unsubscribe?id=9. Visit https://x.com/home')).toEqual([
      'https://x.com/unsubscribe?id=9.',
    ]);
  });

  it('walks nested MIME parts and prefers HTML', () => {
    const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_');
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64('https://x.com/unsubscribe/plain') } },
            { mimeType: 'text/html', body: { data: b64('<a href="https://x.com/unsubscribe/html">Unsubscribe</a>') } },
          ],
        },
      ],
    };
    expect(unsubscribeLinksFromMessage(payload)).toEqual(['https://x.com/unsubscribe/html']);
  });
});
