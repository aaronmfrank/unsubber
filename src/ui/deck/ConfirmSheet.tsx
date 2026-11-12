import { useEffect, useRef } from 'react';
import { useQueue, type QueueGroup } from '../../state/queue';
import { useSession } from '../../state/session';
import { number, senderName } from '../format';
import { Close } from '../icons';
import { SlideToConfirm } from '../SlideToConfirm';

const BREAKDOWN: [QueueGroup, string][] = [
  ['one_click', 'one-click'],
  ['email', 'email'],
  ['block', 'block'],
  ['report_spam', 'report spam'],
  ['needs_you', 'need you'],
];

/** ["5 one-click", "1 email", "2 need you"] */
export function breakdown(groups: QueueGroup[]): string[] {
  return BREAKDOWN.map(([group, label]) => [groups.filter((g) => g === group).length, label] as const)
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${number.format(count)} ${label}`);
}

export function ConfirmSheet() {
  const { sheetOpen, items, running, progress, closeSheet, removeFromQueue, commit } = useQueue();
  const signedIn = useSession((s) => s.status === 'signed_in');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sheetOpen) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSheet();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sheetOpen, closeSheet]);

  if (!sheetOpen) return null;
  const count = number.format(items.length);
  const groups = new Set(items.map((i) => i.group));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(10,14,22,0.55)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] min-[900px]:items-center" onClick={closeSheet}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="flex max-h-[calc(100dvh-140px)] w-full max-w-[440px] flex-col overflow-hidden rounded-sheet bg-card min-[900px]:max-h-[85dvh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="mt-2.5 h-[5px] w-10 shrink-0 self-center rounded-full bg-rule min-[900px]:hidden" />
        <header className="flex flex-col gap-2 px-6 pt-[18px] pb-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="confirm-title" className="text-display font-bold tracking-[-0.01em]">
              Unsubscribe from {count}
            </h2>
            <button
              ref={closeRef}
              onClick={closeSheet}
              disabled={running}
              aria-label="Cancel and go back"
              className="grid size-12 shrink-0 place-items-center rounded-full bg-chip text-ink disabled:opacity-50"
            >
              <Close size={20} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {breakdown(items.map((i) => i.group)).map((chip) => (
              <span key={chip} className="inline-flex h-[30px] items-center rounded-full bg-chip px-3 text-caption font-semibold">
                {chip}
              </span>
            ))}
          </div>
          <div className="mt-1 flex flex-col gap-1 text-caption text-muted">
            {(groups.has('one_click') || groups.has('email')) && (
              <p>
                <span className="font-semibold text-ink">One-click and email</span> go out from here. Their inbox mail is archived.
              </p>
            )}
            {groups.has('needs_you') && (
              <p>
                <span className="font-semibold text-ink">Need you</span> move to Manual so you can click the link.
              </p>
            )}
            {(groups.has('block') || groups.has('report_spam')) && (
              <p>
                <span className="font-semibold text-ink">Block and report spam</span> filter or move their mail.
              </p>
            )}
            <p className="font-semibold text-ink">This can't be undone.</p>
          </div>
        </header>

        <ul className="mx-4 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
          {items.map(({ sender, label }) => (
            <li key={sender.id} className="flex items-center justify-between gap-3 rounded-row bg-paper px-3.5 py-2">
              <div className="min-w-0">
                <p className="truncate text-body leading-5 font-semibold">{senderName(sender)}</p>
                <p className="truncate text-caption text-muted">{sender.id}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3.5 text-caption">
                <span className="text-muted">{label}</span>
                <button
                  disabled={running}
                  onClick={() => void removeFromQueue(sender.id)}
                  aria-label={`Remove ${senderName(sender)} from the queue`}
                  className="font-semibold text-ink underline underline-offset-[3px] disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 px-4 pt-4 pb-5">
          {!signedIn && <p className="px-2 text-caption text-unsub">Gmail sign-in expired. Sign in again to keep going.</p>}
          {progress ? (
            <div className="relative flex h-14 items-center justify-center overflow-hidden rounded-full bg-track text-body font-semibold text-on-track" aria-live="polite">
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 rounded-full transition-[width]"
                style={{
                  width: `${progress.total ? Math.max(12, (progress.done / progress.total) * 100) : 12}%`,
                  background: 'color-mix(in srgb, var(--knob) 22%, var(--track))',
                }}
              />
              <span className="relative">
                Unsubscribing… {number.format(progress.done)} of {number.format(progress.total)}
              </span>
            </div>
          ) : (
            <SlideToConfirm
              label={`Slide to unsubscribe from ${count}`}
              confirmPhrase={`unsubscribe from ${count}`}
              disabled={!signedIn || items.length === 0}
              onConfirm={() => void commit()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
