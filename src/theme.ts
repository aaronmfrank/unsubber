import { create } from 'zustand';

export type Appearance = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'unsubber.appearance';
const PAPER = { light: '#F3F4EE', dark: '#0E1116' } as const;
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function stored(): Appearance {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Sets `data-theme` for an override and points the browser chrome color at the page background. */
function apply(appearance: Appearance) {
  const root = document.documentElement;
  if (appearance === 'system') delete root.dataset.theme;
  else root.dataset.theme = appearance;

  const resolved = appearance === 'system' ? (darkQuery.matches ? 'dark' : 'light') : appearance;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = appearance === 'system' ? PAPER[meta.media.includes('dark') ? 'dark' : 'light'] : PAPER[resolved];
  }
}

export const useAppearance = create<{ appearance: Appearance; setAppearance(appearance: Appearance): void }>()((set) => ({
  appearance: stored(),
  setAppearance(appearance) {
    if (appearance === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, appearance);
    apply(appearance);
    set({ appearance });
  },
}));

/** Call before the first render so an override never flashes the system theme. */
export function startTheme(): void {
  apply(stored());
  darkQuery.addEventListener('change', () => apply(useAppearance.getState().appearance));
}
