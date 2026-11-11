export type AuthMode = 'popup' | 'redirect';

export interface AuthProvider {
  readonly mode: AuthMode;
  /** Loads the sign-in library, or reads a token handed back by a redirect. */
  init(): Promise<void>;
  /** Interactive sign-in. Call from a click handler so the popup isn't blocked. */
  signIn(loginHint?: string): Promise<void>;
  /** The current access token, or null when signed out or about to expire. */
  getToken(): string | null;
  /** Gets a new token without the consent screen. Rejects with AuthExpiredError when the user must act. */
  refresh(): Promise<string>;
  signOut(): Promise<void>;
}

export class AuthError extends Error {
  override name = 'AuthError';
}

export class AuthExpiredError extends AuthError {
  override name = 'AuthExpiredError';
  constructor(message = 'Gmail sign-in expired. Sign in again to keep going.') {
    super(message);
  }
}

export class MissingScopesError extends AuthError {
  override name = 'MissingScopesError';
  constructor() {
    super('Unsubber needs every Gmail permission on the consent screen. Sign in again and leave all boxes checked.');
  }
}
