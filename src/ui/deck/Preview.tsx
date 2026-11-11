import { useEffect, useState } from 'react';
import { decodeMimeWords, getHeader } from '../../gmail/headers';
import { storage, type Sender } from '../../storage';
import { gmail, useSession } from '../../state/session';
import { cleanSnippet, gmailThreadUrl, shortDate } from '../format';

interface RecentSubject {
  subject: string;
  date: string;
}

const cache = new Map<string, RecentSubject[]>();

async function recentSubjects(senderId: string): Promise<RecentSubject[]> {
  const cached = cache.get(senderId);
  if (cached) return cached;
  const rows = await storage.listRecentMessages(senderId, 3);
  const messages = await Promise.all(rows.map((row) => gmail.getMessageMetadata(row.id, ['Subject'])));
  const subjects = messages.map((m, i) => ({
    subject: decodeMimeWords(getHeader(m, 'Subject') ?? '').trim() || '(no subject)',
    date: rows[i]!.date,
  }));
  cache.set(senderId, subjects);
  return subjects;
}

/** Snippet and newest subjects only. Email HTML is never rendered: its remote images are tracking pixels. */
export function Preview({ sender }: { sender: Sender }) {
  const email = useSession((s) => s.email);
  const [subjects, setSubjects] = useState<RecentSubject[] | null>(() => cache.get(sender.id) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    recentSubjects(sender.id)
      .then((result) => !cancelled && setSubjects(result))
      .catch(() => !cancelled && setError("Couldn't load recent subjects. Check your connection and open the preview again."));
    return () => {
      cancelled = true;
    };
  }, [sender.id]);

  return (
    <div className="flex flex-col gap-3 border-t border-rule pt-3">
      <p className="line-clamp-5 text-body text-ink-muted">{cleanSnippet(sender.latestSnippet) || 'No preview text.'}</p>
      <div className="flex flex-col gap-1">
        <h3 className="text-caption font-semibold text-ink-muted">Newest emails</h3>
        {error && <p className="text-caption text-cancel">{error}</p>}
        {!error && !subjects && <p className="text-caption text-ink-muted">Loading…</p>}
        {subjects?.length === 0 && <p className="text-caption text-ink-muted">No emails from this sender are stored yet.</p>}
        <ul className="flex flex-col gap-1">
          {subjects?.map((s, i) => (
            <li key={i} className="flex gap-2 text-caption">
              <span className="shrink-0 text-ink-muted tabular-nums">{shortDate(s.date)}</span>
              <span className="truncate">{s.subject}</span>
            </li>
          ))}
        </ul>
      </div>
      <a
        href={gmailThreadUrl(sender.latestThreadId, email)}
        target="_blank"
        rel="noopener noreferrer"
        data-no-toggle
        className="self-start text-caption font-semibold text-post underline-offset-2 hover:underline"
      >
        Open in Gmail
      </a>
    </div>
  );
}
