import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { storage, type Sender } from '../storage';
import { flushDeckWrites, useDeck } from './deck';
import { applySwipe, deckOrder, messagesSinceKeep, type SwipeDirection } from './deckLogic';

function sender(id: string, overrides: Partial<Sender> = {}): Sender {
  return {
    id,
    displayName: id,
    domain: 'x.com',
    listIds: [],
    messageCount: 1,
    lastReceivedAt: '2026-11-01T00:00:00.000Z',
    latestSubject: '',
    latestSnippet: '',
    latestMessageId: `m-${id}`,
    latestThreadId: `t-${id}`,
    unsubMethods: {},
    status: 'new',
    escalationStep: 0,
    returnCount: 0,
    ...overrides,
  };
}

describe('deckOrder', () => {
  const senders = [
    sender('a', { messageCount: 5 }),
    sender('b', { messageCount: 50 }),
    sender('c', { messageCount: 2, status: 'repeat_offender' }),
    sender('d', { messageCount: 9, status: 'saved' }),
    sender('e', { messageCount: 30, status: 'kept', countAtKeep: 28 }),
    sender('f', { messageCount: 10, status: 'kept', countAtKeep: 1 }),
    sender('g', { status: 'queued' }),
  ];

  it('puts repeat offenders first in Main, then by message count', () => {
    expect(deckOrder('main', senders)).toEqual(['c', 'b', 'a']);
  });

  it('holds saved senders in Later and keeps in Re-review, by messages since keep', () => {
    expect(deckOrder('later', senders)).toEqual(['d']);
    expect(deckOrder('rereview', senders)).toEqual(['f', 'e']);
    expect(messagesSinceKeep(senders[5]!)).toBe(9);
  });
});

describe('applySwipe', () => {
  const now = '2026-11-11T12:00:00.000Z';

  it('queues on left and remembers the previous status', () => {
    expect(applySwipe(sender('a', { status: 'saved' }), 'left', now)).toMatchObject({ status: 'queued', prevStatus: 'saved' });
  });

  it('keeps on right, resetting the keep point on a re-keep', () => {
    const kept = applySwipe(sender('a', { messageCount: 12, status: 'kept', keptAt: '2026-01-01', countAtKeep: 3 }), 'right', now);
    expect(kept).toMatchObject({ status: 'kept', keptAt: now, countAtKeep: 12 });
  });

  it('saves on up', () => {
    expect(applySwipe(sender('a'), 'up', now).status).toBe('saved');
  });
});

describe('deck store', () => {
  beforeEach(async () => {
    await storage.clearAll();
    useDeck.setState({ deck: 'main', loaded: false });
  });

  async function seed(count: number) {
    await storage.upsertSenders(Array.from({ length: count }, (_, i) => sender(`s${String(i).padStart(2, '0')}`, { messageCount: 1000 - i })));
    await useDeck.getState().load();
  }

  it('clears 50 cards from back-to-back swipes with none dropped or doubled', async () => {
    await seed(60);
    const directions: SwipeDirection[] = ['left', 'right', 'up'];
    const expected = new Map<string, SwipeDirection>();
    for (let i = 0; i < 50; i++) {
      const direction = directions[i % 3]!;
      expected.set(useDeck.getState().order[i]!, direction);
      useDeck.getState().swipe(direction);
    }
    await flushDeckWrites();

    const state = useDeck.getState();
    expect(state.index).toBe(50);
    expect(state.undoStack).toHaveLength(50);

    const stored = await storage.getSenders([...expected.keys()]);
    const statusFor = { left: 'queued', right: 'kept', up: 'saved' } as const;
    for (const [id, direction] of expected) expect(stored.get(id)?.status).toBe(statusFor[direction]);

    const lefts = [...expected.values()].filter((d) => d === 'left').length;
    expect(await storage.listQueue()).toHaveLength(lefts);
    expect(state.queueCount).toBe(lefts);
    expect(await storage.listSenders({ status: 'new' })).toHaveLength(10);
  });

  it('ignores a swipe meant for a card that already left', async () => {
    await seed(3);
    const first = useDeck.getState().order[0]!;
    useDeck.getState().swipe('right', first);
    useDeck.getState().swipe('right', first);
    expect(useDeck.getState().index).toBe(1);
  });

  it('undoes swipes in reverse order back to the start of the session', async () => {
    await seed(4);
    const [a, b] = useDeck.getState().order;
    useDeck.getState().swipe('left');
    useDeck.getState().swipe('right');
    useDeck.getState().undo();
    useDeck.getState().undo();
    useDeck.getState().undo();
    await flushDeckWrites();

    expect(useDeck.getState().index).toBe(0);
    expect((await storage.getSender(a!))?.status).toBe('new');
    expect((await storage.getSender(b!))?.keptAt).toBeUndefined();
    expect(await storage.listQueue()).toHaveLength(0);
    expect(useDeck.getState().queueCount).toBe(0);
  });

  it('moves every Later sender back to Main', async () => {
    await seed(5);
    useDeck.getState().swipe('up');
    useDeck.getState().swipe('up');
    useDeck.getState().swipe('right');
    expect(await useDeck.getState().resetLater()).toBe(2);

    expect(await storage.listSenders({ status: 'saved' })).toHaveLength(0);
    expect(await storage.listSenders({ status: 'new' })).toHaveLength(4);
    expect(useDeck.getState().order).toHaveLength(4);
    expect(useDeck.getState().index).toBe(0);
    expect(await useDeck.getState().resetLater()).toBe(0);
  });

  it('takes in a background load mid-session without reshuffling', async () => {
    await seed(4);
    const [first, second, third] = useDeck.getState().order;
    useDeck.getState().swipe('right');
    useDeck.getState().absorbSync([sender('late@x.com', { messageCount: 5000 })], [third!]);

    const { order, index, senders } = useDeck.getState();
    expect(order[0]).toBe(first);
    expect(order[index]).toBe(second);
    expect(order).not.toContain(third);
    expect(order.at(-1)).toBe('late@x.com');
    expect(senders[third!]).toBeUndefined();
  });

  it('rebuilds the order before the session starts', async () => {
    await seed(3);
    useDeck.getState().absorbSync([sender('late@x.com', { messageCount: 5000 })]);
    expect(useDeck.getState().order[0]).toBe('late@x.com');
  });

  it('shows kept senders in Re-review after switching decks', async () => {
    await seed(3);
    useDeck.getState().swipe('right');
    useDeck.getState().selectDeck('rereview');
    expect(useDeck.getState().order).toHaveLength(1);
    expect(useDeck.getState().undoStack).toHaveLength(0);
  });
});
