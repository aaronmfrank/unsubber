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
  /** People you email, for labelling a repeat offender's next step. */
  people: ReadonlySet<string>;
  writeError: string | null;
  load(): Promise<void>;
  selectDeck(deck: DeckId): void;
  /** Ignored unless `expectedId` is still the top card, so a late drag release can't swipe the next one. */
  swipe(direction: SwipeDirection, expectedId?: string): void;
  undo(): void;
  /** Takes in senders changed outside a swipe. Their swipes can no longer be undone. */
  patchSenders(updated: Sender[]): void;
  /** Drops these senders' swipes from the undo stack, for a commit that's about to run them. */
  lockSwipes(ids: string[]): void;
  setQueueCount(count: number): void;
  /** Moves every saved sender back to Main. Returns how many moved. */
  resetLater(): Promise<number>;
  /**
   * Takes in senders changed by a sync or background load, and drops cards for people you email.
   * Before the session starts the order is rebuilt, so new repeat offenders come first; after, new
   * cards join the end.
   */
  absorbSync(changed: Sender[], removed?: string[]): void;
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
  people: new Set(),
  writeError: null,

  async load() {
    await writes;
    const [list, queue, people] = await Promise.all([storage.listSenders(), storage.listQueue(), storage.listPeople()]);
    const senders = Object.fromEntries(list.map((s) => [s.id, s]));
    set({ loaded: true, senders, people, order: deckOrder(get().deck, list), index: 0, undoStack: [], queueCount: queue.length });
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
      if (direction === 'left') {
        const escalation = before.status === 'repeat_offender' ? { escalationStep: before.escalationStep } : {};
        await storage.enqueue({ senderId: id, createdAt: new Date().toISOString(), ...escalation });
      }
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

  patchSenders(updated) {
    const ids = new Set(updated.map((s) => s.id));
    set((s) => ({
      senders: { ...s.senders, ...Object.fromEntries(updated.map((sender) => [sender.id, sender])) },
      undoStack: s.undoStack.filter((entry) => !ids.has(entry.id)),
    }));
  },

  lockSwipes(ids) {
    const locked = new Set(ids);
    set((s) => ({ undoStack: s.undoStack.filter((entry) => !locked.has(entry.id)) }));
  },

  setQueueCount(count) {
    set({ queueCount: count });
  },

  async resetLater() {
    const restored = Object.values(get().senders)
      .filter((s) => s.status === 'saved')
      .map((s): Sender => ({ ...s, status: 'new' }));
    if (restored.length === 0) return 0;
    persist(() => storage.upsertSenders(restored));
    await writes;
    get().patchSenders(restored);
    get().selectDeck(get().deck);
    return restored.length;
  },

  absorbSync(changed, removed = []) {
    if (changed.length === 0 && removed.length === 0) return;
    const gone = new Set(removed);
    set((s) => {
      const senders = { ...s.senders, ...Object.fromEntries(changed.map((sender) => [sender.id, sender])) };
      for (const id of removed) delete senders[id];
      return {
        senders,
        // Cards already swiped this session stay put; removed cards still ahead drop out.
        order: s.order.filter((id, i) => i < s.index || !gone.has(id)),
        undoStack: s.undoStack.filter((entry) => !gone.has(entry.id)),
      };
    });

    const { index, undoStack, deck, order, senders } = get();
    if (index === 0 && undoStack.length === 0) {
      get().selectDeck(deck);
      return;
    }
    // Mid-session, new cards for this deck join the end, so the count grows instead of cards jumping.
    const inOrder = new Set(order);
    const additions = deckOrder(
      deck,
      changed.filter((s) => !inOrder.has(s.id) && senders[s.id]).map((s) => senders[s.id]!),
    );
    if (additions.length > 0) set({ order: [...order, ...additions] });
  },
}));
