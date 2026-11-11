import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { exitDirections, useDeck } from '../../state/deck';
import { inDeck, type DeckId, type SwipeDirection } from '../../state/deckLogic';
import { Button } from '../Button';
import { number } from '../format';
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

const KEY_DIRECTIONS: Record<string, SwipeDirection> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up' };

export function DeckScreen() {
  const { loaded, deck, order, index, senders, undoStack, queueCount, writeError, selectDeck, swipe, undo } = useDeck();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const topId = order[index];
  const visible = order.slice(index, index + 2);

  const deckCounts = useMemo(() => {
    const all = Object.values(senders);
    return Object.fromEntries(DECKS.map(({ id }) => [id, all.filter((s) => inDeck(id, s)).length])) as Record<DeckId, number>;
  }, [senders]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key;
      if (event.altKey || event.ctrlKey || (event.metaKey && key.toLowerCase() !== 'z')) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;

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
        const top = o[i];
        if (top && !event.repeat) setExpandedId((current) => (current === top ? null : top));
      } else if (key.toLowerCase() === 'z') {
        event.preventDefault();
        if (!event.repeat) useDeck.getState().undo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-[400px] items-center gap-1 px-4 py-2" role="tablist" aria-label="Decks">
        {DECKS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={deck === id}
            onClick={() => {
              selectDeck(id);
              setExpandedId(null);
            }}
            className={`rounded-md px-3 py-1.5 text-body transition ${
              deck === id ? 'bg-card font-semibold text-ink shadow-[inset_0_0_0_1px_var(--rule)]' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {label} <span className="text-caption tabular-nums text-ink-muted">{number.format(deckCounts[id])}</span>
          </button>
        ))}
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[400px] flex-1 flex-col justify-center px-4 pt-4">
        <div className="relative min-h-[300px] flex-1" style={{ maxHeight: 440 }}>
          {!loaded ? (
            <p className="grid h-full place-items-center text-ink-muted">Loading senders…</p>
          ) : topId ? (
            <AnimatePresence custom={exitDirections} initial={false}>
              {visible.map((id, i) => (
                <SwipeCard
                  key={id}
                  sender={senders[id]!}
                  deck={deck}
                  isTop={i === 0}
                  expanded={i === 0 && expandedId === id}
                  onToggle={() => setExpandedId((current) => (current === id ? null : id))}
                  onSwipe={(direction) => swipe(direction, id)}
                />
              ))}
            </AnimatePresence>
          ) : (
            <div className="grid h-full place-items-center rounded-card border border-dashed border-rule p-8 text-center">
              <p className="text-body text-ink-muted">{EMPTY_STATE[deck]}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-4" aria-label="Swipe actions">
          <ActionButton label="Unsubscribe" keyLabel="←" tone="text-cancel" disabled={!topId} onClick={() => swipe('left')} />
          <ActionButton label="Later" keyLabel="↑" tone="text-ochre" disabled={!topId} onClick={() => swipe('up')} />
          <ActionButton label="Keep" keyLabel="→" tone="text-post" disabled={!topId} onClick={() => swipe('right')} />
        </div>
        <p className="py-2 text-center text-caption tabular-nums text-ink-muted" aria-live="polite">
          {order.length === 0
            ? '\u00A0'
            : topId
              ? `${number.format(index + 1)} of ${number.format(order.length)}`
              : `All ${number.format(order.length)} cleared`}
        </p>
      </div>

      {writeError && (
        <p role="alert" className="mx-4 mb-2 rounded-card border border-cancel bg-card px-4 py-2 text-caption text-cancel">
          {writeError}
        </p>
      )}

      <div className="border-t border-rule">
      <div className="mx-auto flex max-w-[400px] items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <Button disabled className="w-full">
            {queueCount > 0 ? `Unsubscribe from ${number.format(queueCount)}` : 'Queue is empty'}
          </Button>
          {queueCount > 0 && <p className="pt-1 text-caption text-ink-muted">Sending the queue arrives in the next build.</p>}
        </div>
        <Button variant="secondary" disabled={undoStack.length === 0} onClick={undo} aria-keyshortcuts="Z">
          Undo
        </Button>
      </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  keyLabel,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  keyLabel: string;
  tone: string;
  disabled: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-card border border-rule bg-card text-body font-semibold transition hover:bg-paper disabled:opacity-50 ${tone}`}
    >
      <span aria-hidden="true">{keyLabel}</span>
      {label}
    </button>
  );
}
