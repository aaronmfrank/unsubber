import type { Sender } from '../../storage';
import { useDeck } from '../../state/deck';
import { messagesSinceKeep, type DeckId } from '../../state/deckLogic';
import { nextEscalation, STEP_HINT } from '../../unsub/escalation';
import { cleanSnippet, countLine, methodBadge, number, senderName } from '../format';
import { Stamp } from '../Stamp';
import { Preview } from './Preview';
import { useOffenderDetail } from './useOffenderDetail';

export function CardBody({ sender, deck, expanded }: { sender: Sender; deck: DeckId; expanded: boolean }) {
  const people = useDeck((s) => s.people);
  const offenderDetail = useOffenderDetail(sender);
  const offender = sender.status === 'repeat_offender';
  const sinceKeep = messagesSinceKeep(sender);
  const badge = methodBadge(sender);

  return (
    <div className="relative flex h-full flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="truncate text-title font-bold">{senderName(sender)}</h2>
        <p className="truncate text-body text-ink-muted">{sender.id}</p>
      </div>

      <div className="flex flex-col gap-1">
        {offender && <p className="sr-only">Repeat offender.</p>}
        <p className="text-body">{countLine(sender)}</p>
        {offenderDetail && <p className="text-body font-semibold text-cancel">{offenderDetail}</p>}
        {deck === 'rereview' && (
          <p className="text-body text-ink-muted">
            {sinceKeep === 0
              ? 'No emails since you kept it'
              : `${number.format(sinceKeep)} ${sinceKeep === 1 ? 'email' : 'emails'} since you kept it`}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-1">
        <p className="line-clamp-2 text-lead font-semibold">{sender.latestSubject || '(no subject)'}</p>
        {!expanded && <p className="line-clamp-3 text-body text-ink-muted">{cleanSnippet(sender.latestSnippet)}</p>}
      </div>

      {expanded && <Preview sender={sender} />}

      {offender && !expanded && (
        <>
          <p className="text-caption text-ink-muted">
            Swipe left to {STEP_HINT[nextEscalation(sender, people)]}. Swipe right to forgive them and stop tracking.
          </p>
          <div aria-hidden="true" className="pointer-events-none mt-auto flex justify-center py-2">
            <Stamp>Repeat offender</Stamp>
          </div>
        </>
      )}

      <div className={`flex items-center justify-between gap-3 ${offender && !expanded ? '' : 'mt-auto'}`}>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-caption font-semibold ${
            badge === 'No link found' ? 'border-rule text-ink-muted' : 'border-post text-post'
          }`}
        >
          {badge}
        </span>
        <span className="text-caption text-ink-muted">{expanded ? 'Tap to collapse' : 'Tap for preview'}</span>
      </div>
    </div>
  );
}
