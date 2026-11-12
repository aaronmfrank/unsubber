import { useEffect, useRef } from 'react';
import { useQueue, type QueueGroup } from '../../state/queue';
import { useSession } from '../../state/session';
import { Button } from '../Button';
import { number, senderName } from '../format';

const BREAKDOWN: [QueueGroup, string][] = [
  ['one_click', 'one-click'],
  ['email', 'email'],
  ['block', 'block'],
  ['report_spam', 'report spam'],
  ['needs_you', 'need you'],
];

/** "8 one-click, 2 email, 1 block, 2 need you" */
export function breakdown(groups: QueueGroup[]): string {
  return BREAKDOWN.map(([group, label]) => [groups.filter((g) => g === group).length, label] as const)
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${number.format(count)} ${label}`)
    .join(', ');
}

export function ConfirmSheet() {
  const { sheetOpen, items, running, progress, closeSheet, removeFromQueue, commit } = useQueue();
  const signedIn = useSession((s) => s.status === 'signed_in');
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sheetOpen) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sheetOpen, closeSheet]);

  if (!sheetOpen) return null;
  const label = `Unsubscribe from ${number.format(items.length)}`;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 min-[900px]:items-center" onClick={closeSheet}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="flex max-h-[85dvh] w-full max-w-[440px] flex-col gap-4 rounded-t-card border border-rule bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] min-[900px]:rounded-card"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex flex-col gap-1">
          <h2 id="confirm-title" className="text-title font-bold">
            {label}
          </h2>
          <p className="text-body text-ink-muted">{breakdown(items.map((i) => i.group))}</p>
        </header>

        <p className="text-caption text-ink-muted">
          One-click and email unsubscribes go out from here, and every sender's inbox mail is archived. Senders that need a link
          clicked move to Manual. Block creates a Gmail filter that skips the inbox; Report spam moves their mail to Spam. This
          can't be undone.
        </p>

        <ul className="-mx-5 min-h-0 flex-1 divide-y divide-rule overflow-y-auto border-y border-rule">
          {items.map(({ sender, group, label: rowLabel }) => (
            <li key={sender.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">{senderName(sender)}</p>
                <p className="truncate text-caption text-ink-muted">{sender.id}</p>
              </div>
              <span
                className={`shrink-0 text-caption ${
                  group === 'needs_you' ? 'text-ink-muted' : group === 'block' || group === 'report_spam' ? 'text-cancel' : 'text-post'
                }`}
              >
                {rowLabel}
              </span>
              <Button variant="quiet" disabled={running} onClick={() => void removeFromQueue(sender.id)} aria-label={`Remove ${senderName(sender)} from the queue`}>
                Remove
              </Button>
            </li>
          ))}
        </ul>

        {progress && (
          <div className="flex flex-col gap-1.5" aria-live="polite">
            <div className="h-2 overflow-hidden rounded-full bg-rule">
              <div className="h-full rounded-full bg-cancel transition-[width]" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="text-caption text-ink-muted">
              Unsubscribing… {number.format(progress.done)} of {number.format(progress.total)}
            </p>
          </div>
        )}

        {!signedIn && <p className="text-caption text-cancel">Gmail sign-in expired. Sign in again to keep going.</p>}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={closeSheet} disabled={running}>
            Cancel
          </Button>
          <Button ref={confirmRef} variant="danger" className="flex-1" disabled={running || !signedIn || items.length === 0} onClick={() => void commit()}>
            {running ? 'Unsubscribing…' : label}
          </Button>
        </div>
      </div>
    </div>
  );
}
