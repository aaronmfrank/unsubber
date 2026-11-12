import { create } from 'zustand';

export type Screen = 'deck' | 'manual' | 'history' | 'settings';

export const useNav = create<{ screen: Screen; setScreen(screen: Screen): void }>()((set) => ({
  screen: 'deck',
  setScreen: (screen) => set({ screen }),
}));
