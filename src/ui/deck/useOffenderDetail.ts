import { useEffect, useState } from 'react';
import { storage, type Sender } from '../../storage';
import type { AttemptMethod } from '../../storage/types';
import { shortDate } from '../format';

const ATTEMPT_LABEL: Record<AttemptMethod, string> = {
  one_click: 'Tried one-click',
  mailto: 'Sent an unsubscribe email',
  manual_link: 'Unsubscribed by link',
  filter_block: 'Blocked',
  report_spam: 'Reported spam',
};

const cache = new Map<string, string>();

/** "Tried one-click on Oct 2. 6 emails since." for a repeat offender's card. */
export function useOffenderDetail(sender: Sender): string | null {
  const offender = sender.status === 'repeat_offender';
  const key = `${sender.id}:${sender.returnCount}:${sender.messageCount}:${sender.escalationStep}:${sender.unsubscribedAt}`;
  const [line, setLine] = useState<string | null>(() => cache.get(key) ?? null);

  useEffect(() => {
    if (!offender || cache.has(key)) return;
    let cancelled = false;
    void (async () => {
      const last = (await storage.listAttempts(sender.id)).at(-1);
      const since = last?.at ?? sender.unsubscribedAt;
      const count = since ? await storage.countMessages({ senderId: sender.id, after: since }) : sender.returnCount;
      const emails = `${count} ${count === 1 ? 'email' : 'emails'} since.`;
      const text = last
        ? `${ATTEMPT_LABEL[last.method]} on ${shortDate(last.at)}. ${emails}`
        : `Unsubscribed${sender.unsubscribedAt ? ` on ${shortDate(sender.unsubscribedAt)}` : ''}. ${emails}`;
      cache.set(key, text);
      if (!cancelled) setLine(text);
    })();
    return () => {
      cancelled = true;
    };
  }, [offender, key, sender.id, sender.unsubscribedAt, sender.returnCount]);

  return offender ? line : null;
}
