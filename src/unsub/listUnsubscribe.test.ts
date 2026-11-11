import { describe, expect, it } from 'vitest';
import { listUnsubscribeUris, parseUnsubMethods } from './listUnsubscribe';

const ONE_CLICK = 'List-Unsubscribe=One-Click';

describe('listUnsubscribeUris', () => {
  it('reads every bracketed URI in order', () => {
    expect(listUnsubscribeUris('<mailto:u@x.com?subject=unsub>, <https://x.com/u/abc>')).toEqual([
      'mailto:u@x.com?subject=unsub',
      'https://x.com/u/abc',
    ]);
  });

  it('removes whitespace from folded headers', () => {
    expect(listUnsubscribeUris('<https://x.com/u/\r\n abc>')).toEqual(['https://x.com/u/abc']);
  });

  it('tolerates missing angle brackets and ignores junk', () => {
    expect(listUnsubscribeUris('https://x.com/u, not a uri, mailto:u@x.com')).toEqual(['https://x.com/u', 'mailto:u@x.com']);
    expect(listUnsubscribeUris('<javascript:alert(1)>')).toEqual([]);
    expect(listUnsubscribeUris(undefined)).toEqual([]);
  });
});

describe('parseUnsubMethods', () => {
  it('finds one-click, email and link methods', () => {
    expect(parseUnsubMethods('<mailto:u@x.com?subject=unsub>, <https://x.com/u/abc>', ONE_CLICK)).toEqual({
      oneClickUrl: 'https://x.com/u/abc',
      mailto: 'mailto:u@x.com?subject=unsub',
      httpUrl: 'https://x.com/u/abc',
    });
  });

  it('needs the Post header for one-click', () => {
    expect(parseUnsubMethods('<https://x.com/u/abc>', undefined)).toEqual({ httpUrl: 'https://x.com/u/abc' });
    expect(parseUnsubMethods('<https://x.com/u/abc>', 'something-else')).toEqual({ httpUrl: 'https://x.com/u/abc' });
  });

  it('never treats plain http as one-click', () => {
    expect(parseUnsubMethods('<http://x.com/u>', ONE_CLICK)).toEqual({ httpUrl: 'http://x.com/u' });
  });

  it('prefers https over http links', () => {
    expect(parseUnsubMethods('<http://x.com/a>, <https://x.com/b>', undefined).httpUrl).toBe('https://x.com/b');
  });

  it('returns nothing for malformed headers', () => {
    expect(parseUnsubMethods('<https://>', ONE_CLICK)).toEqual({});
    expect(parseUnsubMethods('garbage', undefined)).toEqual({});
  });
});
