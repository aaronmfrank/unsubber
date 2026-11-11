import { AuthError, AuthExpiredError, MissingScopesError, type AuthProvider } from './AuthProvider';
import { GMAIL_SCOPES, hasAllScopes } from './scopes';
import { toAccessToken, usableToken, type AccessToken } from './token';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

let scriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new AuthError('Could not load Google sign-in. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

type Prompt = google.accounts.oauth2.OverridableTokenClientConfig['prompt'];

/** Google Identity Services token client: popup sign-in, ~1 hour tokens, no refresh token. */
export class GisAuthProvider implements AuthProvider {
  readonly mode = 'popup' as const;
  private client: google.accounts.oauth2.TokenClient | null = null;
  private token: AccessToken | null = null;
  private loginHint: string | undefined;
  private pending: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null;
  private inflight: Promise<string> | null = null;

  constructor(private readonly clientId: string) {}

  async init(): Promise<void> {
    await loadGisScript();
    this.client = google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: GMAIL_SCOPES.join(' '),
      include_granted_scopes: true,
      callback: (response) => this.handleToken(response),
      error_callback: (error) => this.handleClientError(error),
    });
  }

  async signIn(loginHint?: string): Promise<void> {
    this.loginHint = loginHint;
    await this.requestToken(undefined);
  }

  getToken(): string | null {
    return usableToken(this.token);
  }

  async refresh(): Promise<string> {
    try {
      return await this.requestToken('');
    } catch (error) {
      if (error instanceof MissingScopesError) throw error;
      throw new AuthExpiredError();
    }
  }

  async signOut(): Promise<void> {
    const token = this.token?.value;
    this.token = null;
    if (token) await new Promise<void>((resolve) => google.accounts.oauth2.revoke(token, resolve));
  }

  private requestToken(prompt: Prompt): Promise<string> {
    const client = this.client;
    if (!client) return Promise.reject(new AuthError('Google sign-in is still loading. Try again in a moment.'));
    this.inflight ??= new Promise<string>((resolve, reject) => {
      this.pending = { resolve, reject };
      client.requestAccessToken({ prompt, login_hint: this.loginHint });
    }).finally(() => {
      this.inflight = null;
      this.pending = null;
    });
    return this.inflight;
  }

  private handleToken(response: google.accounts.oauth2.TokenResponse): void {
    if (response.error) {
      this.pending?.reject(new AuthError(response.error_description ?? response.error));
      return;
    }
    if (!hasAllScopes(response.scope.split(' '))) {
      this.pending?.reject(new MissingScopesError());
      return;
    }
    this.token = toAccessToken(response.access_token, response.expires_in);
    this.pending?.resolve(response.access_token);
  }

  private handleClientError(error: google.accounts.oauth2.ClientConfigError): void {
    const message =
      error.type === 'popup_failed_to_open'
        ? 'The Google sign-in popup was blocked. Allow popups for this site and try again.'
        : error.type === 'popup_closed'
          ? 'Sign-in was closed before it finished. Try again when ready.'
          : error.message || 'Google sign-in failed. Try again.';
    this.pending?.reject(new AuthError(message));
  }
}
