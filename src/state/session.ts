import { create } from 'zustand';
import { AuthExpiredError, createAuthProvider, getAuthMode, type AuthMode } from '../auth';
import { createGmailClient } from '../gmail/client';

const LOGIN_HINT_KEY = 'unsubber.loginHint';
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export type SessionStatus = 'initializing' | 'signed_out' | 'signing_in' | 'signed_in' | 'expired';

interface SessionState {
  status: SessionStatus;
  authMode: AuthMode;
  configured: boolean;
  email: string | null;
  error: string | null;
  tokenRefreshes: number;
  init(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

const auth = createAuthProvider(getAuthMode(), clientId);

export const gmail = createGmailClient(auth, {
  onTokenRefreshed: () => useSession.setState((s) => ({ tokenRefreshes: s.tokenRefreshes + 1 })),
  onAuthExpired: () => useSession.setState({ status: 'expired' }),
});

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

async function loadProfile(): Promise<string> {
  const { emailAddress } = await gmail.getProfile();
  localStorage.setItem(LOGIN_HINT_KEY, emailAddress);
  return emailAddress;
}

let initPromise: Promise<void> | null = null;

async function initialize(set: (partial: Partial<SessionState>) => void): Promise<void> {
  if (!clientId) {
    set({ status: 'signed_out', error: 'VITE_GOOGLE_CLIENT_ID is not set. Add it to .env and restart the dev server.' });
    return;
  }
  try {
    await auth.init();
    if (auth.getToken()) {
      set({ status: 'signed_in', email: await loadProfile(), error: null });
      return;
    }
    set({ status: 'signed_out' });
  } catch (error) {
    set({ status: 'signed_out', error: errorText(error) });
  }
}

export const useSession = create<SessionState>()((set, get) => ({
  status: 'initializing',
  authMode: auth.mode,
  configured: Boolean(clientId),
  email: null,
  error: null,
  tokenRefreshes: 0,

  init() {
    initPromise ??= initialize(set);
    return initPromise;
  },

  async signIn() {
    const wasExpired = get().status === 'expired';
    set({ status: 'signing_in', error: null });
    try {
      await auth.signIn(get().email ?? localStorage.getItem(LOGIN_HINT_KEY) ?? undefined);
      set({ status: 'signed_in', email: await loadProfile() });
    } catch (error) {
      const status = wasExpired || error instanceof AuthExpiredError ? 'expired' : 'signed_out';
      set({ status, error: errorText(error) });
    }
  },

  async signOut() {
    await auth.signOut();
    localStorage.removeItem(LOGIN_HINT_KEY);
    set({ status: 'signed_out', email: null, error: null, tokenRefreshes: 0 });
  },
}));
