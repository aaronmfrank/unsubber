import { useState } from 'react';
import { isStandalone } from '../auth';
import { BUILD_ID } from '../pwa';
import { useScan } from '../state/scan';
import { gmail, useSession } from '../state/session';
import { Button } from './Button';

type CheckResult = { ok: boolean; message: string } | null;

export function SettingsScreen() {
  const { status, email, authMode, tokenRefreshes, signOut } = useSession();
  const resetAndRescan = useScan((s) => s.resetAndRescan);
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
    <div className="mx-auto flex max-w-[400px] flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-title font-bold">Settings</h1>
        <p className="text-body text-ink-muted">
          Signed in as <span className="font-semibold text-ink">{email}</span>
        </p>
      </header>

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

      <section className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
        <h2 className="text-lead font-semibold">Data on this device</h2>
        <p className="text-caption text-ink-muted">Clearing deletes every sender, swipe and queued unsubscribe here, then scans the last 90 days again.</p>
        <Button
          variant="secondary"
          disabled={status !== 'signed_in' || !email}
          onClick={() => {
            if (email && window.confirm('Delete everything Unsubber stored on this device and scan again?')) void resetAndRescan(email);
          }}
        >
          Clear data and rescan
        </Button>
      </section>

      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>

      <p className="text-center text-caption text-ink-muted">Build {BUILD_ID}</p>
    </div>
  );
}
