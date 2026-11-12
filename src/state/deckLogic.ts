import type { Sender, SenderStatus } from '../storage/types';

export type DeckId = 'main' | 'later' | 'rereview';
/** Left unsubscribes, right keeps, up saves for later, down filters. */
export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

/** Directions that put the sender in the queue for the confirm sheet. */
export const QUEUES = (direction: SwipeDirection) => direction === 'left' || direction === 'down';

export const DECK_STATUSES: Record<DeckId, readonly SenderStatus[]> = {
  main: ['new', 'repeat_offender'],
  later: ['saved'],
  rereview: ['kept'],
};

export function messagesSinceKeep(sender: Sender): number {
  return Math.max(0, sender.messageCount - (sender.countAtKeep ?? sender.messageCount));
}

const byCount = (a: Sender, b: Sender) => b.messageCount - a.messageCount || a.id.localeCompare(b.id);

const comparators: Record<DeckId, (a: Sender, b: Sender) => number> = {
  main: (a, b) => Number(b.status === 'repeat_offender') - Number(a.status === 'repeat_offender') || byCount(a, b),
  later: byCount,
  rereview: (a, b) => messagesSinceKeep(b) - messagesSinceKeep(a) || byCount(a, b),
};

export function inDeck(deck: DeckId, sender: Sender): boolean {
  return DECK_STATUSES[deck].includes(sender.status);
}

/** Sender ids in deck order. */
export function deckOrder(deck: DeckId, senders: Iterable<Sender>): string[] {
  return [...senders]
    .filter((s) => inDeck(deck, s))
    .sort(comparators[deck])
    .map((s) => s.id);
}

/** The sender after a swipe. Left and down only queue; the unsubscribe or filter runs when the queue is committed. */
export function applySwipe(sender: Sender, direction: SwipeDirection, now: string): Sender {
  switch (direction) {
    case 'left':
    case 'down':
      return { ...sender, status: 'queued', prevStatus: sender.status };
    case 'right':
      return { ...sender, status: 'kept', keptAt: now, countAtKeep: sender.messageCount };
    case 'up':
      return { ...sender, status: 'saved' };
  }
}
