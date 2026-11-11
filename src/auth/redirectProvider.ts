import { AuthError, AuthExpiredError, MissingScopesError, type AuthProvider } from './AuthProvider';
import { buildAuthUrl, parseAuthFragment } from './redirectFlow';
import { hasAllScopes } from './scopes';
import { toAccessToken, usableToken, type AccessToken } from './token';

const STATE_KEY = 'unsubber.oauthState';

/**
 * Full-page redirect sign-in, for when the GIS popup can't hand a token back
 * (iOS home-screen apps). There is no silent refresh: a redirect would lose app state,
 * so an expired token asks the user to sign in again.
 */
export class RedirectAuthProvider implements AuthProvider {
  readonly mode = 'redirect' as const;
  private token: AccessToken | null = null;

  constructor(
    private readonly clientId: string,
    private readonly redirectUri: string,
  ) {}

  async init(): Promise<void> {
    const result = parseAuthFragment(window.location.hash);
    if (!result) return;

    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    const expectedState = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);

    if (!expectedState || result.state !== expectedState) {
      throw new AuthError('Sign-in response did not match this session. Sign in again.');
    }
    if (result.kind === 'error') {
      throw new AuthError(
        result.error === 'access_denied' ? 'Sign-in was cancelled. Try again when ready.' : `Google sign-in failed: ${result.error}.`,
      );
    }
    if (!hasAllScopes(result.scopes)) throw new MissingScopesError();
    this.token = toAccessToken(result.accessToken, result.expiresIn);
  }

  signIn(loginHint?: string): Promise<void> {
    const state = crypto.randomUUID();
    sessionStorage.setItem(STATE_KEY, state);
    window.location.assign(buildAuthUrl({ clientId: this.clientId, redirectUri: this.redirectUri, state, loginHint }));
    return new Promise<void>(() => {});
  }

  getToken(): string | null {
    return usableToken(this.token);
  }

  refresh(): Promise<string> {
    this.token = null;
    return Promise.reject(new AuthExpiredError());
  }

  async signOut(): Promise<void> {
    const token = this.token?.value;
    this.token = null;
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
    }
  }
}
