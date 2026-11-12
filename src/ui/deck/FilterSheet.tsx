import { forwardRef, useEffect, useRef, useState } from 'react';
import { useDeck } from '../../state/deck';
import { useFilterSheet } from '../../state/filterSheet';
import type { Sender } from '../../storage';
import { defaultFilterLabel, hasAnyAction } from '../../unsub/filter';
import { Button } from '../Button';
import { senderName } from '../format';
import { Check, Close } from '../icons';

/** The down swipe's sheet: keep the sender, but file their mail out of the way with a Gmail filter. */
export function FilterSheet() {
  const senderId = useFilterSheet((s) => s.senderId);
  const sender = useDeck((s) => (senderId ? s.senders[senderId] : undefined));
  if (!sender) return null;
  return <Sheet key={sender.id} sender={sender} />;
}

function Sheet({ sender }: { sender: Sender }) {
  const { defaults, close, remember } = useFilterSheet();
  const swipe = useDeck((s) => s.swipe);
  const [skipInbox, setSkipInbox] = useState(defaults.skipInbox);
  const [markRead, setMarkRead] = useState(defaults.markRead);
  const [applyLabel, setApplyLabel] = useState(defaults.applyLabel);
  const [label, setLabel] = useState(defaultFilterLabel(sender));
  const firstRef = useRef<HTMLButtonElement>(null);

  const actions = { skipInbox, markRead, label: applyLabel ? label.trim() || null : null };
  const valid = hasAnyAction(actions) && (!applyLabel || Boolean(label.trim()));

  useEffect(() => {
    firstRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  const queue = () => {
    if (!valid) return;
    remember(actions);
    close();
    swipe('down', sender.id, actions);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(10,14,22,0.55)] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] min-[900px]:items-center" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-title"
        className="flex max-h-[calc(100dvh-80px)] w-full max-w-[440px] flex-col gap-4 overflow-y-auto rounded-sheet bg-card px-5 pt-2.5 pb-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div aria-hidden="true" className="h-[5px] w-10 shrink-0 self-center rounded-full bg-rule min-[900px]:hidden" />
        <header className="flex items-start justify-between gap-3 pt-2">
          <div className="min-w-0">
            <h2 id="filter-title" className="truncate text-display font-bold tracking-[-0.01em]">
              Filter {senderName(sender)}
            </h2>
            <p className="truncate text-body text-muted">{sender.id}</p>
          </div>
          <button onClick={close} aria-label="Cancel and go back" className="grid size-12 shrink-0 place-items-center rounded-full bg-chip text-ink">
            <Close size={20} />
          </button>
        </header>

        <p className="text-caption text-muted">
          Keep getting their mail, just out of the way. Gmail files new mail from this address the way you choose, and mail already in
          your inbox gets the same change when you commit the queue. You can remove the filter later in History.
        </p>

        <div className="flex flex-col gap-2" role="group" aria-label="What the filter does">
          <Toggle ref={firstRef} checked={skipInbox} onChange={setSkipInbox} title="Skip the inbox" description="Archive it. It stays in All Mail." />
          <Toggle checked={markRead} onChange={setMarkRead} title="Mark as read" description="No unread count from this sender." />
          <Toggle checked={applyLabel} onChange={setApplyLabel} title="Apply a label" description="Find their mail under one label." />
          {applyLabel && (
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              aria-label="Label name"
              className="ml-11 h-11 rounded-full border border-ctl bg-card px-4 text-body"
            />
          )}
        </div>

        {!valid && <p className="text-caption text-unsub">Choose at least one, and give the label a name.</p>}

        <Button onClick={queue} disabled={!valid} className="h-14 w-full text-[16px] font-bold">
          Queue filter
        </Button>
      </div>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange(checked: boolean): void;
  title: string;
  description: string;
}

const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle({ checked, onChange, title, description }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 rounded-row bg-paper px-3.5 py-3 text-left"
    >
      <span
        aria-hidden="true"
        className={`grid size-7 shrink-0 place-items-center rounded-full border-2 ${checked ? 'border-accent bg-accent text-on-accent' : 'border-ctl bg-card'}`}
      >
        {checked && <Check size={16} />}
      </span>
      <span className="min-w-0">
        <span className="block text-body font-semibold">{title}</span>
        <span className="block text-caption text-muted">{description}</span>
      </span>
    </button>
  );
});
