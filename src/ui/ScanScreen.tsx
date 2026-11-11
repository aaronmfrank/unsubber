import type { ScanProgress } from '../scan/scan';
import { useScan } from '../state/scan';
import { useSession } from '../state/session';
import { Button } from './Button';
import { ExpiredNotice } from './ExpiredNotice';

const number = new Intl.NumberFormat();

function describe(progress: ScanProgress | null): { label: string; detail: string; fraction: number | null } {
  if (!progress) return { label: 'Starting the scan', detail: '', fraction: null };
  switch (progress.phase) {
    case 'people':
      return {
        label: 'Finding people you email',
        detail: progress.total ? `${number.format(progress.done)} of ${number.format(progress.total)} sent messages` : 'Reading your sent mail',
        fraction: progress.total ? progress.done / progress.total : null,
      };
    case 'listing':
      return { label: 'Listing the last 90 days of mail', detail: `${number.format(progress.found)} messages found`, fraction: null };
    case 'reading':
      return {
        label: 'Reading messages',
        detail: `${number.format(progress.done)} of ${number.format(progress.total)} messages · ${number.format(progress.senders)} senders found`,
        fraction: progress.total ? progress.done / progress.total : 1,
      };
  }
}

export function ScanScreen() {
  const { status, progress, error, ensureScanned } = useScan();
  const sessionStatus = useSession((s) => s.status);
  const email = useSession((s) => s.email);
  const { label, detail, fraction } = describe(progress);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-bold">{status === 'error' ? 'Scan paused' : label}</h1>
        <p className="text-body text-ink-muted" aria-live="polite">
          {status === 'error' ? error : detail || 'Only headers, subjects and snippets are read.'}
        </p>
      </div>

      {status !== 'error' && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}
          className="h-2 overflow-hidden rounded-full bg-rule"
        >
          <div
            className={`h-full rounded-full bg-post transition-[width] ${fraction === null ? 'w-1/3 animate-pulse' : ''}`}
            style={fraction === null ? undefined : { width: `${Math.max(2, fraction * 100)}%` }}
          />
        </div>
      )}

      <ExpiredNotice />

      {status === 'error' && sessionStatus === 'signed_in' && email && (
        <Button onClick={() => void ensureScanned(email)}>Try again</Button>
      )}

      <p className="text-caption text-ink-muted">Keep this screen open. The deck opens when the scan finishes.</p>
    </main>
  );
}
