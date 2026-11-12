import { useMemo, useState } from 'react';
import { useDeck } from '../state/deck';
import { useQueue } from '../state/queue';
import type { Sender } from '../storage';
import { Button } from './Button';
import { countLine, senderName } from './format';

function linksFor(sender: Sender): string[] {
  const { httpUrl, bodyLinks = [] } = sender.unsubMethods;
  return [...new Set([httpUrl, ...bodyLinks].filter((l): l is string => Boolean(l)))];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function ManualScreen() {
  const senders = useDeck((s) => s.senders);
  const manual = useMemo(
    () => Object.values(senders).filter((s) => s.status === 'manual').sort((a, b) => b.lastReceivedAt.localeCompare(a.lastReceivedAt)),
    [senders],
  );

  return (
    <div className="mx-auto flex max-w-[400px] flex-col gap-4 px-4 py-8">
      <header className="flex flex-col gap-1 px-2">
        <h1 className="text-title font-bold">Manual</h1>
        <p className="text-body text-ink-muted">
          {manual.length === 0
            ? 'Nothing needs you. Senders that need a link clicked show up here after you unsubscribe.'
            : 'These senders need you to click their unsubscribe link. Mark each one done once you have, and the grace period starts. Or block or report them.'}
        </p>
      </header>
      <ul className="flex flex-col gap-3">
        {manual.map((sender) => (
          <ManualRow key={sender.id} sender={sender} />
        ))}
      </ul>
    </div>
  );
}

function ManualRow({ sender }: { sender: Sender }) {
  const markDone = useQueue((s) => s.markDone);
  const blockOrReport = useQueue((s) => s.blockOrReport);
  const [opened, setOpened] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const links = linksFor(sender);

  return (
    <li className="flex flex-col gap-3 rounded-card border border-rule bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{senderName(sender)}</p>
          <p className="truncate text-caption text-ink-muted">{sender.id}</p>
          <p className="text-caption text-ink-muted">{countLine(sender)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-rule px-2.5 py-0.5 text-caption font-semibold text-ink-muted">
          {links.length > 0 ? 'Link' : 'No link found'}
        </span>
      </div>

      {links.length > 0 ? (
        <div className="flex flex-col gap-2">
          {links.map((link, i) => (
            <a
              key={link}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpened(link)}
              className="flex h-11 items-center justify-between gap-3 rounded-card border border-rule px-4 text-body font-semibold text-post hover:bg-paper"
            >
              <span>{links.length > 1 ? `Open link ${i + 1}` : 'Open link'}</span>
              <span className="truncate text-caption font-normal text-ink-muted">{hostOf(link)}</span>
            </a>
          ))}
        </div>
      ) : (
        <p className="text-caption text-ink-muted">
          No unsubscribe link in the headers or the newest email. Block or report them instead.
        </p>
      )}

      {links.length > 0 && (
        <Button
          variant={opened ? 'primary' : 'secondary'}
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await markDone(sender.id, opened);
          }}
        >
          Mark done
        </Button>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1 text-cancel"
          disabled={saving}
          onClick={async () => {
            if (!window.confirm(`Block ${sender.id}? Unsubber creates a Gmail filter so their mail skips the inbox and gets the Unsubber/Blocked label.`)) return;
            setSaving(true);
            await blockOrReport(sender.id, 'block');
            setSaving(false);
          }}
        >
          Block
        </Button>
        <Button
          variant="secondary"
          className="flex-1 text-cancel"
          disabled={saving}
          onClick={async () => {
            if (!window.confirm(`Report ${sender.id} as spam? All their mail moves to Spam.`)) return;
            setSaving(true);
            await blockOrReport(sender.id, 'report_spam');
            setSaving(false);
          }}
        >
          Report spam
        </Button>
      </div>
    </li>
  );
}
