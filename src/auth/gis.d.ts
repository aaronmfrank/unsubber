// Minimal typings for the parts of Google Identity Services we use.
// https://developers.google.com/identity/oauth2/web/reference/js-reference

declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string;
    expires_in: number | string;
    scope: string;
    token_type: string;
    error?: string;
    error_description?: string;
  }

  interface ClientConfigError {
    type: 'popup_failed_to_open' | 'popup_closed' | 'unknown';
    message: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: ClientConfigError) => void;
    include_granted_scopes?: boolean;
    login_hint?: string;
  }

  interface OverridableTokenClientConfig {
    prompt?: '' | 'none' | 'consent' | 'select_account';
    login_hint?: string;
  }

  interface TokenClient {
    requestAccessToken(overrides?: OverridableTokenClientConfig): void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
  function revoke(accessToken: string, done?: () => void): void;
}
