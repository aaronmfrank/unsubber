import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isStandalone } from '../auth';
import { BUILD, MILESTONE, useUpdate } from '../pwa';
import { coveredRange } from '../scan/windows';
import { useDeck } from '../state/deck';
import { useOlderScan } from '../state/olderScan';
import { useScan } from '../state/scan';
import { gmail, useSession } from '../state/session';
import { useToast } from '../state/toast';
import { applyImport, exportToFile, readExportFile } from '../state/transfer';
import { Button } from './Button';
import { number, windowLabel } from './format';

type CheckResult = { ok: boolean; message: string } | null;

const builtAt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const exportDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
      <h2 className="text-lead font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsScreen() {
  const { status, email, signOut } = useSession();
  const signedIn = status === 'signed_in';

  return (
    <div className="mx-auto flex max-w-[400px] flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-title font-bold">Settings</h1>
        <p className="text-body text-ink-muted">
          Signed in as <span className="font-semibold text-ink">{email}</span>
        </p>
      </header>

      <MailSection signedIn={signedIn} />
      <DecksSection />
      <TransferSection signedIn={signedIn} />
      <AboutSection />
      <SignInChecks />
      <DeviceSection signedIn={signedIn} email={email} onSignOut={() => void signOut()} />
    </div>
  );
}

function MailSection({ signedIn }: { signedIn: boolean }) {
  const { running, progress, scanned, next, resuming, refresh, run } = useOlderScan();
  const covered = coveredRange(scanned);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const detail =
    progress?.phase === 'reading'
      ? `Reading ${number.format(progress.done)} of ${number.format(progress.total)} messages · ${number.format(progress.senders)} senders`
      : progress?.phase === 'listing'
        ? `Listing messages · ${number.format(progress.found)} found`
        : 'Starting…';

  return (
    <Section title="Mail">
      <p className="text-body">{covered ? `Scanned ${windowLabel(covered)}.` : 'Nothing scanned yet.'}</p>
      <p className="text-caption text-ink-muted">
        Scan older mail looks 90 days further back. New senders join Main; known senders get their counts added.
      </p>
      {running ? (
        <div className="flex flex-col gap-1.5" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-rule">
            <div
              className={`h-full rounded-full bg-post transition-[width] ${progress?.phase === 'reading' ? '' : 'w-1/3 animate-pulse'}`}
              style={progress?.phase === 'reading' && progress.total ? { width: `${Math.max(2, (progress.done / progress.total) * 100)}%` } : undefined}
            />
          </div>
          <p className="text-caption text-ink-muted">{detail}</p>
        </div>
      ) : (
        <Button variant="secondary" disabled={!signedIn || !next} onClick={() => void run()}>
          {next ? `${resuming ? 'Resume scanning' : 'Scan'} ${windowLabel(next)}` : 'Scan older mail'}
        </Button>
      )}
    </Section>
  );
}

function DecksSection() {
  const laterCount = useDeck((s) => Object.values(s.senders).filter((sender) => sender.status === 'saved').length);
  const resetLater = useDeck((s) => s.resetLater);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <Section title="Decks">
      <p className="text-caption text-ink-muted">Moves every sender in Later back into Main, so they come up for a swipe again.</p>
      <Button
        variant="secondary"
        disabled={laterCount === 0}
        onClick={async () => {
          if (!window.confirm(`Move ${laterCount} ${laterCount === 1 ? 'sender' : 'senders'} from Later back to Main?`)) return;
          const moved = await resetLater();
          setMessage(`Moved ${moved} ${moved === 1 ? 'sender' : 'senders'} back to Main.`);
        }}
      >
        {laterCount === 0 ? 'Later is empty' : `Reset Later (${laterCount})`}
      </Button>
      {message && (
        <p role="status" className="text-caption text-post">
          {message}
        </p>
      )}
    </Section>
  );
}

function TransferSection({ signedIn }: { signedIn: boolean }) {
  const show = useToast((s) => s.show);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const fail = (error: unknown, action: string) =>
    show({ message: error instanceof Error ? error.message : `${action} failed. Try again.`, tone: 'error' });

  return (
    <Section title="Move to another device">
      <p className="text-caption text-ink-muted">
        Everything lives on this device. Export a file here and import it on your other device to carry over decks, the queue and
        history. Importing replaces what's on that device.
      </p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { senders, shared } = await exportToFile();
              if (senders > 0) show({ message: `Exported ${number.format(senders)} senders${shared ? '.' : ' to your downloads.'}`, tone: 'ok' });
            } catch (error) {
              fail(error, 'Export');
            } finally {
              setBusy(false);
            }
          }}
        >
          Export
        </Button>
        <Button variant="secondary" className="flex-1" disabled={busy || !signedIn} onClick={() => fileInput.current?.click()}>
          Import
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const data = await readExportFile(file);
            const count = data.data.senders.length;
            const from = exportDate.format(new Date(data.exportedAt));
            if (!window.confirm(`Replace everything on this device with the export from ${from}? It has ${count} senders.`)) return;
            await applyImport(data);
            show({ message: `Imported ${number.format(count)} senders from ${from}.`, tone: 'ok' });
          } catch (error) {
            fail(error, 'Import');
          } finally {
            setBusy(false);
          }
        }}
      />
    </Section>
  );
}

function AboutSection() {
  const { ready: updateReady, apply: applyUpdate } = useUpdate();
  return (
    <Section title="About this build">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body">
        <dt className="text-ink-muted">Version</dt>
        <dd>{BUILD.version}</dd>
        <dt className="text-ink-muted">Milestone</dt>
        <dd>{MILESTONE} is the latest done</dd>
        <dt className="text-ink-muted">Build</dt>
        <dd className="font-mono text-caption leading-[22px]">{BUILD.commit}</dd>
        <dt className="text-ink-muted">Built</dt>
        <dd>{builtAt.format(new Date(BUILD.builtAt))}</dd>
      </dl>
      {updateReady ? (
        <Button variant="primary" onClick={applyUpdate}>
          Reload for the new version
        </Button>
      ) : (
        <p className="text-caption text-ink-muted">Up to date. New versions install the next time the app opens.</p>
      )}
    </Section>
  );
}

function SignInChecks() {
  const { status, authMode, tokenRefreshes } = useSession();
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
    <details className="rounded-card border border-rule bg-card p-4">
      <summary className="cursor-pointer text-lead font-semibold">Sign-in checks</summary>
      <div className="mt-3 flex flex-col gap-4">
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
      </div>
    </details>
  );
}

function DeviceSection({ signedIn, email, onSignOut }: { signedIn: boolean; email: string | null; onSignOut(): void }) {
  const resetAndRescan = useScan((s) => s.resetAndRescan);
  return (
    <Section title="This device">
      <p className="text-caption text-ink-muted">
        Clear data deletes every sender, swipe, queued unsubscribe and history entry here, then scans the last 90 days again. Gmail
        isn't changed. Export first if you want to keep it.
      </p>
      <Button
        variant="secondary"
        className="text-cancel"
        disabled={!signedIn || !email}
        onClick={() => {
          if (email && window.confirm('Delete everything Unsubber stored on this device and scan again? This cannot be undone.'))
            void resetAndRescan(email);
        }}
      >
        Clear data and rescan
      </Button>
      <Button variant="secondary" onClick={onSignOut}>
        Sign out
      </Button>
    </Section>
  );
}
