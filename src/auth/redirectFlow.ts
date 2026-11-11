import { GMAIL_SCOPES } from './scopes';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

export interface AuthUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  loginHint?: string;
}

/** OAuth 2.0 implicit flow for client-side apps: the token comes back in the URL fragment. */
export function buildAuthUrl({ clientId, redirectUri, state, loginHint }: AuthUrlParams): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: GMAIL_SCOPES.join(' '),
    include_granted_scopes: 'true',
    state,
  });
  if (loginHint) params.set('login_hint', loginHint);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export type FragmentResult =
  | { kind: 'token'; accessToken: string; expiresIn: number; scopes: string[]; state: string | null }
  | { kind: 'error'; error: string; state: string | null };

/** Reads an OAuth response from `location.hash`. Returns null if the fragment isn't one. */
export function parseAuthFragment(hash: string): FragmentResult | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const state = params.get('state');
  const error = params.get('error');
  if (error) return { kind: 'error', error, state };

  const accessToken = params.get('access_token');
  if (!accessToken) return null;
  const expiresIn = Number(params.get('expires_in'));
  return {
    kind: 'token',
    accessToken,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
    scopes: (params.get('scope') ?? '').split(' ').filter(Boolean),
    state,
  };
}
