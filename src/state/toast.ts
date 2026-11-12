import { create } from 'zustand';

export interface Toast {
  message: string;
  /** Senders that landed in the manual queue; the toast links there. */
  needYou?: number;
  tone: 'ok' | 'error';
}

export const useToast = create<{ toast: Toast | null; show(toast: Toast): void; dismiss(): void }>()((set) => ({
  toast: null,
  show: (toast) => set({ toast }),
  dismiss: () => set({ toast: null }),
}));
