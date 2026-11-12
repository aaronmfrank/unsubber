import { useEffect } from 'react';
import { useNav } from '../state/nav';
import { useToast } from '../state/toast';
import { number } from './format';

const AUTO_DISMISS_MS = 10_000;

export function Toast() {
  const { toast, dismiss } = useToast();
  const setScreen = useNav((s) => s.setScreen);

  useEffect(() => {
    if (!toast || toast.tone === 'error') return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  const needYou = toast.needYou ?? 0;
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-history border bg-card px-4 py-3 text-body shadow-float ${
        toast.tone === 'error' ? 'border-unsub' : 'border-rule'
      }`}
    >
      <p className="flex-1">
        {toast.message}{' '}
        {needYou > 0 && (
          <button
            className="font-semibold text-ink underline underline-offset-[3px]"
            onClick={() => {
              setScreen('manual');
              dismiss();
            }}
          >
            {number.format(needYou)} {needYou === 1 ? 'needs' : 'need'} you.
          </button>
        )}
      </p>
      <button onClick={dismiss} aria-label="Dismiss" className="text-muted hover:text-ink">
        ✕
      </button>
    </div>
  );
}
