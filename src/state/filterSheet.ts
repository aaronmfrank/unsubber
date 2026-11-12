import { create } from 'zustand';
import type { FilterActions } from '../storage/types';

const DEFAULTS_KEY = 'unsubber.filterDefaults';

/** The last choices on the sheet, so a run of similar senders takes one tap each. The label is per sender. */
export interface FilterDefaults {
  skipInbox: boolean;
  markRead: boolean;
  applyLabel: boolean;
}

function storedDefaults(): FilterDefaults {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? 'null') as Partial<FilterDefaults> | null;
    if (parsed) return { skipInbox: Boolean(parsed.skipInbox), markRead: Boolean(parsed.markRead), applyLabel: Boolean(parsed.applyLabel) };
  } catch {
    // Unreadable defaults fall back to the first-run choice.
  }
  return { skipInbox: true, markRead: false, applyLabel: true };
}

interface FilterSheetState {
  senderId: string | null;
  defaults: FilterDefaults;
  open(senderId: string): void;
  close(): void;
  remember(actions: FilterActions): void;
}

export const useFilterSheet = create<FilterSheetState>()((set) => ({
  senderId: null,
  defaults: storedDefaults(),
  open: (senderId) => set({ senderId }),
  close: () => set({ senderId: null }),
  remember({ skipInbox, markRead, label }) {
    const defaults = { skipInbox, markRead, applyLabel: Boolean(label) };
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
    set({ defaults });
  },
}));
