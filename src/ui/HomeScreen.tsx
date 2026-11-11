import { useEffect, useState } from 'react';
import { isStandalone } from '../auth';
import { storage, type Sender } from '../storage';
import { useScan } from '../state/scan';
import { gmail, useSession } from '../state/session';
import { Button } from './Button';
import { ExpiredNotice } from './ExpiredNotice';

type CheckResult = { ok: boolean; message: string } | null;

const number = new Intl.NumberFormat();
const shortDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function methodBadge({ unsubMethods: m }: Sender): string {
  if (m.oneClickUrl) return 'One-click';
  if (m.mailto) return 'Email';
  if (m.httpUrl) return 'Link';
  return 'No link found';
}

export function HomeScreen() {
  const { status, email, authMode, tokenRefreshes, signOut } = useSession();
  const { version, resetAndRescan } = useScan();
  const [senders, setSenders] = useState<Sender[] | null>(null);
  const [messageCount, setMessageCount] = useState(0);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([storage.listSenders({ status: ['new', 'repeat_offender'], sort: 'messageCount' }), storage.countMessages()]).then(
      ([list, count]) => {
        if (cancelled) return;
        setSenders(list);
        setMessageCount(count);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [version]);

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

      <ExpiredNotice />

      <section className="flex flex-col gap-3">
        <h2 className="text-lead font-semibold">
          {senders === null
            ? 'Loading senders…'
            : `${number.format(senders.length)} senders from ${number.format(messageCount)} emails in the last 90 days`}
        </h2>
        <p className="text-caption text-ink-muted">Swiping arrives in the next build. For now this is the Main deck as a list.</p>
        <ol className="flex flex-col divide-y divide-rule rounded-card border border-rule bg-card">
          {senders?.map((sender) => (
            <li key={sender.id} className="flex flex-col gap-0.5 px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold">{sender.displayName || sender.id}</span>
                <span className="shrink-0 text-caption text-ink-muted">{methodBadge(sender)}</span>
              </div>
              <span className="truncate text-caption text-ink-muted">{sender.id}</span>
              <span className="text-caption">
                {number.format(sender.messageCount)} {sender.messageCount === 1 ? 'email' : 'emails'}, last on{' '}
                {shortDate.format(new Date(sender.lastReceivedAt))}
              </span>
              <span className="truncate text-caption text-ink-muted">{sender.latestSubject}</span>
            </li>
          ))}
        </ol>
      </section>

      <details className="rounded-card border border-rule bg-card p-4">
        <summary className="cursor-pointer text-lead font-semibold">Sign-in checks</summary>
        <div className="mt-4 flex flex-col gap-4">
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
          <Button
            variant="secondary"
            disabled={status !== 'signed_in' || !email}
            onClick={() => {
              if (email && window.confirm('Delete everything Unsubber stored on this device and scan again?')) void resetAndRescan(email);
            }}
          >
            Clear data and rescan
          </Button>
        </div>
      </details>

      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </main>
  );
}
