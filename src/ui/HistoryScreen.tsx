import { useEffect, useMemo, useState } from 'react';
import { graceEndsAt } from '../offenders/grace';
import { useDeck } from '../state/deck';
import { storage, type Attempt, type Sender } from '../storage';
import { attemptDetail, METHOD_LABEL, RESULT_LABEL } from './attemptLabels';
import { number, senderName, shortDate } from './format';
import { Search } from './icons';
import { Button } from './Button';
import { useQueue } from '../state/queue';
import { describeFilter } from '../unsub/filter';

type Filter = 'all' | 'unsubscribed' | 'repeat_offender' | 'blocked' | 'filtered';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unsubscribed', label: 'Unsubscribed' },
  { id: 'repeat_offender', label: 'Repeat offenders' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'filtered', label: 'Filtered' },
];

const STATUS_BADGE: Record<Exclude<Filter, 'all'>, { label: string; tone: string }> = {
  unsubscribed: { label: 'Unsubscribed', tone: 'border-ctl text-muted' },
  repeat_offender: { label: 'Repeat offender', tone: 'border-unsub text-unsub' },
  blocked: { label: 'Blocked', tone: 'border-ink text-ink' },
  filtered: { label: 'Filtered', tone: 'border-ctl text-ink' },
};

const inHistory = (s: Sender): s is Sender & { status: Exclude<Filter, 'all'> } =>
  s.status === 'unsubscribed' || s.status === 'repeat_offender' || s.status === 'blocked' || s.status === 'filtered';

/** One line on where the sender stands now. */
function standing(sender: Sender, attempts: Attempt[], now = new Date()): string {
  const emails = (n: number) => `${number.format(n)} ${n === 1 ? 'email' : 'emails'}`;
  if (sender.status === 'filtered') {
    return sender.filter ? `Filtered on ${shortDate(sender.filter.at)}: ${describeFilter(sender.filter.actions)}.` : 'Filtered.';
  }
  if (sender.status === 'blocked') {
    const last = attempts.filter((a) => a.method === 'filter_block' || a.method === 'report_spam').at(-1);
    return last ? `${last.method === 'report_spam' ? 'Reported as spam' : 'Blocked'} on ${shortDate(last.at)}. Tracking stopped.` : 'Blocked. Tracking stopped.';
  }
  if (sender.status === 'repeat_offender') {
    return `${emails(sender.returnCount)} after the grace period${sender.lastReturnAt ? `, last on ${shortDate(sender.lastReturnAt)}` : ''}.`;
  }
  if (!sender.unsubscribedAt) return 'Unsubscribed.';
  const graceEnd = graceEndsAt(sender.unsubscribedAt);
  if (graceEnd > now) return `Unsubscribed on ${shortDate(sender.unsubscribedAt)}. Grace period until ${shortDate(graceEnd.toISOString())}.`;
  return sender.returnCount > 0
    ? `Unsubscribed again on ${shortDate(sender.unsubscribedAt)}. Quiet since the grace period ended ${shortDate(graceEnd.toISOString())}.`
    : `Unsubscribed on ${shortDate(sender.unsubscribedAt)}. Quiet since the grace period ended ${shortDate(graceEnd.toISOString())}.`;
}

function lastActivity(sender: Sender, attempts: Attempt[]): string {
  return [attempts.at(-1)?.at, sender.lastReturnAt, sender.unsubscribedAt].filter((d): d is string => Boolean(d)).sort().at(-1) ?? '';
}

export function HistoryScreen() {
  const senders = useDeck((s) => s.senders);
  const [attempts, setAttempts] = useState<Map<string, Attempt[]> | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void storage.listAllAttempts().then((all) => {
      if (cancelled) return;
      const bySender = new Map<string, Attempt[]>();
      for (const attempt of all) bySender.set(attempt.senderId, [...(bySender.get(attempt.senderId) ?? []), attempt]);
      setAttempts(bySender);
    });
    return () => {
      cancelled = true;
    };
  }, [senders]);

  const history = useMemo(() => {
    const rows = Object.values(senders).filter(inHistory);
    const forSender = (s: Sender) => attempts?.get(s.id) ?? [];
    return rows.sort((a, b) => lastActivity(b, forSender(b)).localeCompare(lastActivity(a, forSender(a))));
  }, [senders, attempts]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: history.length, unsubscribed: 0, repeat_offender: 0, blocked: 0, filtered: 0 };
    for (const s of history) result[s.status]++;
    return result;
  }, [history]);

  const needle = query.trim().toLowerCase();
  const visible = history.filter(
    (s) => (filter === 'all' || s.status === filter) && (!needle || s.id.includes(needle) || s.displayName.toLowerCase().includes(needle)),
  );

  return (
    <div className="mx-auto flex max-w-[420px] flex-col gap-3 px-5 pt-7 pb-6">
      <header className="flex flex-col gap-0.5">
        <h1 className="text-display font-bold tracking-[-0.01em]">History</h1>
        <p className="text-body text-muted">
          {history.length === 0
            ? 'No unsubscribes yet. Senders you unsubscribe from or block show up here.'
            : `${number.format(counts.unsubscribed)} unsubscribed, ${number.format(counts.repeat_offender)} repeat ${counts.repeat_offender === 1 ? 'offender' : 'offenders'}, ${number.format(counts.blocked)} blocked${counts.filtered > 0 ? `, ${number.format(counts.filtered)} filtered` : ''}.`}
        </p>
      </header>

      {history.length > 0 && (
        <>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter history">
            {FILTERS.filter(({ id }) => id !== 'filtered' || counts.filtered > 0).map(({ id, label }) => (
              <button
                key={id}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={`inline-flex h-10 items-center gap-1 rounded-full px-4 text-[14px] transition ${
                  filter === id ? 'bg-accent font-bold text-on-accent' : 'bg-chip font-semibold text-ink hover:brightness-95'
                }`}
              >
                {label} <span className="tabular-nums">{number.format(counts[id])}</span>
              </button>
            ))}
          </div>

          <label className="flex h-[52px] items-center gap-2.5 rounded-full border border-ctl bg-card px-[18px] text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
            <Search size={18} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search senders"
              aria-label="Search senders"
              className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-muted"
            />
          </label>

          {visible.length === 0 && <p className="px-2 text-body text-muted">No senders match. Try another filter or search.</p>}

          <ul className="flex flex-col gap-2.5">
            {visible.map((sender) => (
              <HistoryRow
                key={sender.id}
                sender={sender}
                attempts={attempts?.get(sender.id) ?? []}
                open={openId === sender.id}
                onToggle={() => setOpenId((id) => (id === sender.id ? null : sender.id))}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function HistoryRow({
  sender,
  attempts,
  open,
  onToggle,
}: {
  sender: Sender & { status: Exclude<Filter, 'all'> };
  attempts: Attempt[];
  open: boolean;
  onToggle(): void;
}) {
  const badge = STATUS_BADGE[sender.status];
  const removeFilter = useQueue((s) => s.removeFilter);
  return (
    <li className="overflow-hidden rounded-history border border-rule bg-card">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full flex-col gap-0.5 px-[18px] py-4 text-left">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-lead font-bold">{senderName(sender)}</span>
          <span className={`inline-flex h-7 shrink-0 items-center rounded-full border-[1.5px] px-3 text-caption font-bold ${badge.tone}`}>{badge.label}</span>
        </span>
        <span className="truncate text-caption text-muted">{sender.id}</span>
        <span className="mt-1.5 text-body">{standing(sender, attempts)}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-rule bg-paper px-[18px] pt-3.5 pb-4">
          {attempts.length === 0 ? (
            <p className="text-[14px] leading-5 text-muted">No attempts recorded on this device.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {attempts.map((attempt) => {
                const detail = attemptDetail(attempt);
                return (
                  <li key={attempt.id} className="flex gap-3.5 text-[14px] leading-5">
                    <span className="w-12 shrink-0 text-muted tabular-nums">{shortDate(attempt.at)}</span>
                    <span className="min-w-0">
                      <span className="font-bold">{METHOD_LABEL[attempt.method]}</span>{' '}
                      <span className={attempt.result === 'failed' ? 'font-semibold text-unsub' : 'text-muted'}>{RESULT_LABEL[attempt.result]}</span>
                      {detail && <span className="block truncate text-muted">{detail}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {sender.status === 'filtered' && (
            <Button variant="secondary" className="self-start" onClick={() => void removeFilter(sender.id)}>
              Remove filter
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
