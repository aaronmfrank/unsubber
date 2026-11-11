import type { AuthMode, AuthProvider } from './AuthProvider';
import { GisAuthProvider } from './gisProvider';
import { parseAuthFragment } from './redirectFlow';
import { RedirectAuthProvider } from './redirectProvider';

export * from './AuthProvider';

const MODE_KEY = 'unsubber.authMode';

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function getAuthMode(): AuthMode {
  if (parseAuthFragment(window.location.hash)) return 'redirect';
  return localStorage.getItem(MODE_KEY) === 'redirect' ? 'redirect' : 'popup';
}

/** Switching modes reloads the app so a fresh provider is created. */
export function switchAuthMode(mode: AuthMode): void {
  localStorage.setItem(MODE_KEY, mode);
  window.location.reload();
}

export function redirectUri(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}

export function createAuthProvider(mode: AuthMode, clientId: string): AuthProvider {
  return mode === 'redirect' ? new RedirectAuthProvider(clientId, redirectUri()) : new GisAuthProvider(clientId);
}
