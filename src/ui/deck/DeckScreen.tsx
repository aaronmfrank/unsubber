import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { exitDirections, useDeck } from '../../state/deck';
import { inDeck, type DeckId, type SwipeDirection } from '../../state/deckLogic';
import { useQueue } from '../../state/queue';
import { useSync } from '../../state/sync';
import type { Sender } from '../../storage';
import { nextEscalation, STEP_LABEL, STEP_SHORT_LABEL } from '../../unsub/escalation';
import { number } from '../format';
import { ArrowLeft, ArrowRight, ArrowUp, Refresh, Undo } from '../icons';
import { SwipeCard } from './SwipeCard';

const DECKS: { id: DeckId; label: string }[] = [
  { id: 'main', label: 'Main' },
  { id: 'later', label: 'Later' },
  { id: 'rereview', label: 'Re-review' },
];

const EMPTY_STATE: Record<DeckId, string> = {
  main: 'Main deck is clear. Scan older mail to find more senders.',
  later: 'Nothing saved for later. Swipe up on a card in Main to save it here.',
  rereview: 'No keeps to re-review. Swipe right on a sender to keep it, and it shows up here.',
};

/** Card heights from the design boards. Offender cards and open previews grow upward; the action row never moves. */
const CARD_HEIGHT = { normal: 384, offender: 430, expanded: 560 } as const;

const KEY_DIRECTIONS: Record<string, SwipeDirection> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up' };

export function DeckScreen() {
  const { loaded, deck, order, index, senders, undoStack, queueCount, writeError, selectDeck, swipe, undo } = useDeck();
  const openSheet = useQueue((s) => s.openSheet);
  const sync = useSync((s) => s.sync);
  const syncing = useSync((s) => s.running);
  const people = useDeck((s) => s.people);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lean, setLean] = useState<SwipeDirection | null>(null);
  const topId = order[index];
  const top = topId ? senders[topId] : undefined;
  const visible = order.slice(index, index + 2);
  const remaining = order.length - index;
  const expanded = Boolean(topId && expandedId === topId);

  const leftLabelFor = (sender: Sender) => (sender.status === 'repeat_offender' ? STEP_LABEL[nextEscalation(sender, people)] : 'Unsubscribe');
  const leftShortLabel = top?.status === 'repeat_offender' ? STEP_SHORT_LABEL[nextEscalation(top, people)] : 'Unsubscribe';
  const cardHeight = expanded ? CARD_HEIGHT.expanded : top?.status === 'repeat_offender' ? CARD_HEIGHT.offender : CARD_HEIGHT.normal;

  const deckCounts = useMemo(() => {
    const all = Object.values(senders);
    return Object.fromEntries(DECKS.map(({ id }) => [id, all.filter((s) => inDeck(id, s)).length])) as Record<DeckId, number>;
  }, [senders]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key;
      if (event.altKey || event.ctrlKey || (event.metaKey && key.toLowerCase() !== 'z')) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return;
      if (useQueue.getState().sheetOpen) return;

      const direction = KEY_DIRECTIONS[key];
      if (direction) {
        event.preventDefault();
        // Holding a key down must not swipe a run of cards.
        if (!event.repeat) useDeck.getState().swipe(direction);
      } else if (key === 'ArrowDown') {
        event.preventDefault();
      } else if (key === ' ') {
        if (target.closest('button, a')) return;
        event.preventDefault();
        const { order: o, index: i } = useDeck.getState();
        const current = o[i];
        if (current && !event.repeat) setExpandedId((open) => (open === current ? null : current));
      } else if (key.toLowerCase() === 'z') {
        event.preventDefault();
        if (!event.repeat) useDeck.getState().undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="mx-auto flex h-full w-full max-w-[420px] flex-col px-4">
      <header className="mt-4 flex h-12 shrink-0 items-center gap-2 short:!mt-2">
        <div className="flex gap-0.5 rounded-full bg-chip p-1" role="tablist" aria-label="Decks">
          {DECKS.map(({ id, label }) => {
            const active = deck === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  selectDeck(id);
                  setExpandedId(null);
                }}
                className={`flex h-10 items-center gap-1.5 rounded-full text-body transition ${
                  active ? 'bg-accent px-4 font-bold text-on-accent' : 'px-3 font-semibold text-muted hover:text-ink'
                }`}
              >
                {label}
                <span className={`text-caption tabular-nums ${active ? 'font-semibold' : 'font-medium'}`}>{number.format(deckCounts[id])}</span>
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => void sync('manual')}
          disabled={syncing}
          aria-label={syncing ? 'Checking for new mail' : 'Check mail'}
          title="Check mail"
          className="grid size-12 shrink-0 place-items-center rounded-full bg-chip text-ink transition hover:brightness-95 disabled:opacity-60"
        >
          <Refresh size={20} className={syncing ? 'animate-spin' : ''} />
        </button>
      </header>

      {writeError && (
        <p role="alert" className="mt-3 rounded-row border border-unsub bg-card px-4 py-2 text-caption text-unsub">
          {writeError}
        </p>
      )}

      <div className="min-h-2 flex-1" />

      <p className="mb-2.5 shrink-0 short:!mb-1.5 text-center text-caption font-semibold text-muted tabular-nums" aria-live="polite">
        {order.length === 0 ? '\u00A0' : topId ? `${number.format(index + 1)} of ${number.format(order.length)}` : `All ${number.format(order.length)} cleared`}
      </p>

      <div className="relative transition-[flex-basis] duration-200" style={{ flex: `0 1 ${cardHeight}px`, minHeight: 240 }}>
        {!loaded ? (
          <p className="grid h-full place-items-center text-muted">Loading senders…</p>
        ) : topId ? (
          <>
            {remaining > 2 && <div aria-hidden="true" className="absolute inset-x-6 top-5 -bottom-5 rounded-card border border-rule bg-chip" />}
            {remaining > 1 && <div aria-hidden="true" className="absolute inset-x-3 top-2.5 -bottom-2.5 rounded-card border border-rule bg-paper" />}
            <AnimatePresence custom={exitDirections} initial={false}>
              {visible.map((id, i) => (
                <SwipeCard
                  key={id}
                  sender={senders[id]!}
                  deck={deck}
                  isTop={i === 0}
                  expanded={i === 0 && expandedId === id}
                  leftLabel={leftLabelFor(senders[id]!)}
                  onToggle={() => setExpandedId((open) => (open === id ? null : id))}
                  onSwipe={(direction) => swipe(direction, id)}
                  onLean={i === 0 ? setLean : undefined}
                />
              ))}
            </AnimatePresence>
          </>
        ) : (
          <div className="grid h-full place-items-center rounded-card border border-dashed border-ctl p-8 text-center">
            <p className="text-body text-muted">{EMPTY_STATE[deck]}</p>
          </div>
        )}
      </div>

      <div className="mt-10 flex shrink-0 justify-around short:!mt-7" aria-label="Swipe actions">
        <RoundAction label={leftShortLabel} ariaLabel={top ? leftLabelFor(top) : 'Unsubscribe'} tone="unsub" Icon={ArrowLeft} lit={lean === 'left'} disabled={!topId} onClick={() => swipe('left')} keys="ArrowLeft" />
        <RoundAction label="Later" tone="later" Icon={ArrowUp} lit={lean === 'up'} disabled={!topId} onClick={() => swipe('up')} keys="ArrowUp" />
        <RoundAction label="Keep" tone="keep" Icon={ArrowRight} lit={lean === 'right'} disabled={!topId} onClick={() => swipe('right')} keys="ArrowRight" />
        <RoundAction label="Undo" tone="neutral" Icon={Undo} disabled={undoStack.length === 0} onClick={undo} keys="Z" />
      </div>

      <div className="mt-5 h-14 shrink-0 short:!mt-3">
        <button
          onClick={() => void openSheet()}
          aria-hidden={queueCount === 0}
          tabIndex={queueCount === 0 ? -1 : 0}
          className={`flex h-14 w-full items-center justify-center gap-2 rounded-full border-2 border-gline bg-tint text-[16px] font-bold text-gtext transition hover:brightness-[0.98] ${
            queueCount === 0 ? 'invisible' : ''
          }`}
        >
          Review {number.format(queueCount)} to unsubscribe
          <ArrowRight size={18} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

const TONES = {
  unsub: { ring: 'border-2 border-unsub text-unsub', label: 'text-unsub', lit: 'var(--track)' },
  later: { ring: 'border-2 border-later text-later', label: 'text-later', lit: 'color-mix(in srgb, var(--later) 16%, var(--card))' },
  keep: { ring: 'border-2 border-keep text-keep', label: 'text-keep', lit: 'color-mix(in srgb, var(--keep) 14%, var(--card))' },
  neutral: { ring: 'border border-ctl bg-chip text-ink', label: 'text-ink', lit: '' },
} as const;

function RoundAction({
  label,
  ariaLabel,
  tone,
  Icon,
  lit = false,
  disabled,
  onClick,
  keys,
}: {
  label: string;
  ariaLabel?: string;
  tone: keyof typeof TONES;
  Icon: ComponentType<{ size?: number }>;
  lit?: boolean;
  disabled: boolean;
  onClick(): void;
  keys: string;
}) {
  const style = TONES[tone];
  return (
    <div className="flex w-20 flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        aria-keyshortcuts={keys}
        className={`grid size-16 place-items-center rounded-full transition disabled:opacity-40 ${style.ring} ${tone === 'neutral' ? '' : 'bg-card'}`}
        style={lit && style.lit ? { background: style.lit } : undefined}
      >
        <Icon size={tone === 'neutral' ? 24 : 26} />
      </button>
      <span className={`text-caption font-semibold ${style.label}`}>{label}</span>
    </div>
  );
}
