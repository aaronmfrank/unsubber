import { create } from 'zustand';
import { storage, type Sender } from '../storage';
import { applySwipe, deckOrder, type DeckId, type SwipeDirection } from './deckLogic';

interface UndoEntry {
  id: string;
  direction: SwipeDirection;
  before: Sender;
}

interface DeckState {
  loaded: boolean;
  deck: DeckId;
  senders: Record<string, Sender>;
  /** Card order for this deck session, frozen when the deck opens so cards never jump. */
  order: string[];
  index: number;
  /** Swipes this session, newest last. Switching decks starts a new session. */
  undoStack: UndoEntry[];
  queueCount: number;
  writeError: string | null;
  load(): Promise<void>;
  selectDeck(deck: DeckId): void;
  /** Ignored unless `expectedId` is still the top card, so a late drag release can't swipe the next one. */
  swipe(direction: SwipeDirection, expectedId?: string): void;
  undo(): void;
}

/** Which way each card left, read by its exit animation. */
export const exitDirections = new Map<string, SwipeDirection>();

let writes: Promise<void> = Promise.resolve();

/** Storage writes run one at a time in swipe order, so an undo never lands before its swipe. */
function persist(task: () => Promise<unknown>) {
  writes = writes
    .then(task)
    .then(() => undefined)
    .catch((error: unknown) => {
      useDeck.setState({ writeError: `Couldn't save that swipe: ${error instanceof Error ? error.message : 'unknown error'}. Reload to see saved state.` });
    });
}

export function flushDeckWrites(): Promise<void> {
  return writes;
}

export const useDeck = create<DeckState>()((set, get) => ({
  loaded: false,
  deck: 'main',
  senders: {},
  order: [],
  index: 0,
  undoStack: [],
  queueCount: 0,
  writeError: null,

  async load() {
    await writes;
    const [list, queue] = await Promise.all([storage.listSenders(), storage.listQueue()]);
    const senders = Object.fromEntries(list.map((s) => [s.id, s]));
    set({ loaded: true, senders, order: deckOrder(get().deck, list), index: 0, undoStack: [], queueCount: queue.length });
  },

  selectDeck(deck) {
    set({ deck, order: deckOrder(deck, Object.values(get().senders)), index: 0, undoStack: [] });
  },

  swipe(direction, expectedId) {
    const { order, index, senders, undoStack, queueCount } = get();
    const id = order[index];
    if (!id || (expectedId !== undefined && expectedId !== id)) return;
    const before = senders[id]!;
    const after = applySwipe(before, direction, new Date().toISOString());

    exitDirections.set(id, direction);
    set({
      senders: { ...senders, [id]: after },
      index: index + 1,
      undoStack: [...undoStack, { id, direction, before }],
      queueCount: direction === 'left' ? queueCount + 1 : queueCount,
    });

    persist(async () => {
      await storage.upsertSenders([after]);
      if (direction === 'left') await storage.enqueue({ senderId: id, createdAt: new Date().toISOString() });
    });
  },

  undo() {
    const { undoStack, senders, index, order, queueCount } = get();
    const entry = undoStack.at(-1);
    if (!entry || order[index - 1] !== entry.id) return;

    set({
      senders: { ...senders, [entry.id]: entry.before },
      index: index - 1,
      undoStack: undoStack.slice(0, -1),
      queueCount: entry.direction === 'left' ? queueCount - 1 : queueCount,
    });

    persist(async () => {
      await storage.upsertSenders([entry.before]);
      if (entry.direction === 'left') await storage.dequeue(entry.id);
    });
  },
}));
