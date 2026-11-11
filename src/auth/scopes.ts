export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
] as const;

export function hasAllScopes(granted: readonly string[]): boolean {
  return GMAIL_SCOPES.every((scope) => granted.includes(scope));
}
