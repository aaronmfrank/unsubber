import { useEffect } from 'react';
import { useNav } from '../state/nav';
import { useQueue } from '../state/queue';
import { number } from './format';

const AUTO_DISMISS_MS = 10_000;

export function Toast() {
  const toast = useQueue((s) => s.toast);
  const dismiss = useQueue((s) => s.dismissToast);
  const setScreen = useNav((s) => s.setScreen);

  useEffect(() => {
    if (!toast || toast.tone === 'error') return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-card border bg-card px-4 py-3 text-body shadow-[0_8px_24px_rgba(15,23,42,0.18)] ${
        toast.tone === 'error' ? 'border-cancel' : 'border-rule'
      }`}
    >
      <p className="flex-1">
        {toast.message}{' '}
        {toast.needYou > 0 && (
          <button
            className="font-semibold text-post underline underline-offset-2"
            onClick={() => {
              setScreen('manual');
              dismiss();
            }}
          >
            {number.format(toast.needYou)} {toast.needYou === 1 ? 'needs' : 'need'} you.
          </button>
        )}
      </p>
      <button onClick={dismiss} aria-label="Dismiss" className="text-ink-muted hover:text-ink">
        ✕
      </button>
    </div>
  );
}
