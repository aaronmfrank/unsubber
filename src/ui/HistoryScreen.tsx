import { useEffect, useMemo, useState } from 'react';
import { graceEndsAt } from '../offenders/grace';
import { useDeck } from '../state/deck';
import { storage, type Attempt, type Sender } from '../storage';
import { attemptDetail, METHOD_LABEL, RESULT_LABEL } from './attemptLabels';
import { number, senderName, shortDate } from './format';

type Filter = 'all' | 'unsubscribed' | 'repeat_offender' | 'blocked';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unsubscribed', label: 'Unsubscribed' },
  { id: 'repeat_offender', label: 'Repeat offenders' },
  { id: 'blocked', label: 'Blocked' },
];

const STATUS_BADGE: Record<Exclude<Filter, 'all'>, { label: string; tone: string }> = {
  unsubscribed: { label: 'Unsubscribed', tone: 'border-rule text-ink-muted' },
  repeat_offender: { label: 'Repeat offender', tone: 'border-cancel text-cancel' },
  blocked: { label: 'Blocked', tone: 'border-ink text-ink' },
};

const inHistory = (s: Sender): s is Sender & { status: Exclude<Filter, 'all'> } =>
  s.status === 'unsubscribed' || s.status === 'repeat_offender' || s.status === 'blocked';

/** One line on where the sender stands now. */
function standing(sender: Sender, attempts: Attempt[], now = new Date()): string {
  const emails = (n: number) => `${number.format(n)} ${n === 1 ? 'email' : 'emails'}`;
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
    const result: Record<Filter, number> = { all: history.length, unsubscribed: 0, repeat_offender: 0, blocked: 0 };
    for (const s of history) result[s.status]++;
    return result;
  }, [history]);

  const needle = query.trim().toLowerCase();
  const visible = history.filter(
    (s) => (filter === 'all' || s.status === filter) && (!needle || s.id.includes(needle) || s.displayName.toLowerCase().includes(needle)),
  );

  return (
    <div className="mx-auto flex max-w-[400px] flex-col gap-4 px-4 py-8">
      <header className="flex flex-col gap-1 px-2">
        <h1 className="text-title font-bold">History</h1>
        <p className="text-body text-ink-muted">
          {history.length === 0
            ? 'No unsubscribes yet. Senders you unsubscribe from or block show up here.'
            : `${number.format(counts.unsubscribed)} unsubscribed, ${number.format(counts.repeat_offender)} repeat ${counts.repeat_offender === 1 ? 'offender' : 'offenders'}, ${number.format(counts.blocked)} blocked.`}
        </p>
      </header>

      {history.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter history">
            {FILTERS.map(({ id, label }) => (
              <button
                key={id}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                className={`rounded-full border px-3 py-1 text-caption font-semibold transition ${
                  filter === id ? 'border-ink bg-ink text-card' : 'border-rule bg-card text-ink-muted hover:text-ink'
                }`}
              >
                {label} <span className="tabular-nums">{number.format(counts[id])}</span>
              </button>
            ))}
          </div>

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search senders"
            aria-label="Search senders"
            className="h-11 rounded-card border border-rule bg-card px-4 text-body placeholder:text-ink-muted"
          />

          {visible.length === 0 && <p className="px-2 text-body text-ink-muted">No senders match. Try another filter or search.</p>}

          <ul className="flex flex-col gap-2">
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
  return (
    <li className="rounded-card border border-rule bg-card">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full flex-col gap-1 px-4 py-3 text-left">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate font-semibold">{senderName(sender)}</span>
            <span className="block truncate text-caption text-ink-muted">{sender.id}</span>
          </span>
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-caption font-semibold ${badge.tone}`}>{badge.label}</span>
        </span>
        <span className="text-caption">{standing(sender, attempts)}</span>
      </button>

      {open && (
        <div className="border-t border-rule px-4 py-3">
          {attempts.length === 0 ? (
            <p className="text-caption text-ink-muted">No attempts recorded on this device.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {attempts.map((attempt) => {
                const detail = attemptDetail(attempt);
                return (
                  <li key={attempt.id} className="flex gap-3 text-caption">
                    <span className="w-14 shrink-0 tabular-nums text-ink-muted">{shortDate(attempt.at)}</span>
                    <span className="min-w-0">
                      <span className="font-semibold">{METHOD_LABEL[attempt.method]}</span>
                      <span className={attempt.result === 'failed' ? 'text-cancel' : 'text-ink-muted'}> · {RESULT_LABEL[attempt.result]}</span>
                      {detail && <span className="block truncate text-ink-muted">{detail}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}
