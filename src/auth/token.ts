export interface AccessToken {
  value: string;
  expiresAt: number;
}

/** Treat tokens as expired a minute early so a request never starts with a dying token. */
const EXPIRY_MARGIN_MS = 60_000;

export function toAccessToken(value: string, expiresInSeconds: number | string, now = Date.now()): AccessToken {
  return { value, expiresAt: now + Number(expiresInSeconds) * 1000 };
}

export function usableToken(token: AccessToken | null, now = Date.now()): string | null {
  if (!token || token.expiresAt - EXPIRY_MARGIN_MS <= now) return null;
  return token.value;
}
