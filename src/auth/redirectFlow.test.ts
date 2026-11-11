import { describe, expect, it } from 'vitest';
import { buildAuthUrl, parseAuthFragment } from './redirectFlow';
import { GMAIL_SCOPES, hasAllScopes } from './scopes';
import { toAccessToken, usableToken } from './token';

describe('buildAuthUrl', () => {
  it('requests a token for all Gmail scopes', () => {
    const url = new URL(buildAuthUrl({ clientId: 'abc', redirectUri: 'https://x.github.io/unsubber/', state: 's1' }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('client_id')).toBe('abc');
    expect(url.searchParams.get('redirect_uri')).toBe('https://x.github.io/unsubber/');
    expect(url.searchParams.get('state')).toBe('s1');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([...GMAIL_SCOPES]);
    expect(url.searchParams.has('login_hint')).toBe(false);
  });

  it('passes the login hint when given', () => {
    const url = new URL(buildAuthUrl({ clientId: 'abc', redirectUri: 'r', state: 's', loginHint: 'a@gmail.com' }));
    expect(url.searchParams.get('login_hint')).toBe('a@gmail.com');
  });
});

describe('parseAuthFragment', () => {
  it('reads a token response', () => {
    const scope = encodeURIComponent(GMAIL_SCOPES.join(' '));
    const result = parseAuthFragment(`#state=s1&access_token=ya29.x&token_type=Bearer&expires_in=3599&scope=${scope}`);
    expect(result).toEqual({ kind: 'token', accessToken: 'ya29.x', expiresIn: 3599, scopes: [...GMAIL_SCOPES], state: 's1' });
  });

  it('reads an error response', () => {
    expect(parseAuthFragment('#error=access_denied&state=s1')).toEqual({ kind: 'error', error: 'access_denied', state: 's1' });
  });

  it('ignores fragments that are not OAuth responses', () => {
    expect(parseAuthFragment('')).toBeNull();
    expect(parseAuthFragment('#settings')).toBeNull();
  });

  it('defaults a missing or bad expires_in to one hour', () => {
    const result = parseAuthFragment('#access_token=t&expires_in=nope');
    expect(result).toMatchObject({ kind: 'token', expiresIn: 3600, scopes: [], state: null });
  });
});

describe('scopes and tokens', () => {
  it('requires every Gmail scope', () => {
    expect(hasAllScopes([...GMAIL_SCOPES, 'openid'])).toBe(true);
    expect(hasAllScopes(GMAIL_SCOPES.slice(0, 2))).toBe(false);
  });

  it('treats a token as unusable in its last minute', () => {
    const token = toAccessToken('t', 3600, 0);
    expect(usableToken(token, 3600_000 - 61_000)).toBe('t');
    expect(usableToken(token, 3600_000 - 59_000)).toBeNull();
    expect(usableToken(null)).toBeNull();
  });
});
