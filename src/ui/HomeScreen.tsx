import { useState } from 'react';
import { isStandalone } from '../auth';
import { gmail, useSession } from '../state/session';
import { Button } from './Button';

type CheckResult = { ok: boolean; message: string } | null;

export function HomeScreen() {
  const { status, email, error, authMode, tokenRefreshes, signIn, signOut } = useSession();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult>(null);

  async function testTokenRefresh() {
    setChecking(true);
    setResult(null);
    const before = useSession.getState().tokenRefreshes;
    try {
      gmail.forceUnauthorizedOnce();
      await gmail.getProfile();
      const refreshed = useSession.getState().tokenRefreshes > before;
      setResult(
        refreshed
          ? { ok: true, message: 'Gmail returned 401. Unsubber got a new token without the consent screen and the retry worked.' }
          : { ok: false, message: 'The request worked without a refresh, so the 401 path did not run. Try again.' },
      );
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Token refresh failed.' });
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[400px] flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-title font-bold">Unsubber</h1>
        <p className="text-body text-ink-muted">
          Signed in as <span className="font-semibold text-ink">{email}</span>
        </p>
      </header>

      {(status === 'expired' || status === 'signing_in') && (
        <section role="alert" className="flex flex-col gap-3 rounded-card border border-cancel bg-card p-4">
          <p className="text-body text-cancel">{error ?? 'Gmail sign-in expired. Sign in again to keep going.'}</p>
          <Button onClick={() => void signIn()} disabled={status === 'signing_in'}>
            {status === 'signing_in' ? 'Signing in…' : 'Sign in again'}
          </Button>
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-card border border-rule bg-card p-4">
        <h2 className="text-lead font-semibold">Sign-in checks</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
          <dt className="text-ink-muted">Sign-in method</dt>
          <dd>{authMode === 'popup' ? 'Popup' : 'Redirect'}</dd>
          <dt className="text-ink-muted">Running as</dt>
          <dd>{isStandalone() ? 'Home-screen app' : 'Browser tab'}</dd>
          <dt className="text-ink-muted">Silent refreshes</dt>
          <dd>{tokenRefreshes}</dd>
        </dl>
        <Button variant="secondary" onClick={() => void testTokenRefresh()} disabled={checking || status !== 'signed_in'}>
          {checking ? 'Testing…' : 'Test token refresh'}
        </Button>
        {result && (
          <p role="status" className={`text-caption ${result.ok ? 'text-post' : 'text-cancel'}`}>
            {result.message}
          </p>
        )}
      </section>

      <p className="text-body text-ink-muted">Scanning your inbox comes next. For now, this screen confirms Gmail access works.</p>

      <Button variant="secondary" className="mt-auto" onClick={() => void signOut()}>
        Sign out
      </Button>
    </main>
  );
}
