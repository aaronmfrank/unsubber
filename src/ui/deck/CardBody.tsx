import type { Sender } from '../../storage';
import { useDeck } from '../../state/deck';
import { messagesSinceKeep, type DeckId } from '../../state/deckLogic';
import { useFilterSheet } from '../../state/filterSheet';
import { nextEscalation, STEP_HINT } from '../../unsub/escalation';
import { cleanSnippet, countLine, methodBadge, number, senderName } from '../format';
import { ArrowDown } from '../icons';
import { Stamp } from '../Stamp';
import { Preview } from './Preview';
import { useOffenderDetail } from './useOffenderDetail';

export function CardBody({ sender, deck, expanded }: { sender: Sender; deck: DeckId; expanded: boolean }) {
  const people = useDeck((s) => s.people);
  const openFilter = useFilterSheet((s) => s.open);
  const offenderDetail = useOffenderDetail(sender);
  const offender = sender.status === 'repeat_offender';
  const sinceKeep = messagesSinceKeep(sender);

  return (
    <div className="flex h-full flex-col gap-1.5 [&>*]:shrink-0">
      <h2 className="line-clamp-2 text-display font-bold tracking-[-0.01em] short:!text-title">{senderName(sender)}</h2>
      <p className="truncate text-body text-muted">{sender.id}</p>

      <p className="mt-4 short:!mt-2.5 inline-flex h-8 items-center self-start rounded-full bg-tint px-3.5 text-body font-semibold">{countLine(sender)}</p>
      {offender && <p className="sr-only">Repeat offender.</p>}
      {offenderDetail && <p className="mt-1.5 text-body font-semibold text-unsub">{offenderDetail}</p>}
      {deck === 'rereview' && (
        <p className="mt-1.5 text-body font-semibold">
          {sinceKeep === 0 ? 'No emails since you kept it' : `${number.format(sinceKeep)} ${sinceKeep === 1 ? 'email' : 'emails'} since you kept it`}
        </p>
      )}

      <p className={`line-clamp-2 text-lead font-semibold ${offender ? 'mt-2.5' : 'mt-4 short:!mt-2.5'}`}>{sender.latestSubject || '(no subject)'}</p>
      {expanded ? (
        <Preview sender={sender} />
      ) : (
        <p className={`!shrink min-h-0 text-body text-muted ${offender ? 'line-clamp-2' : 'line-clamp-3 short:!line-clamp-1'}`}>{cleanSnippet(sender.latestSnippet)}</p>
      )}

      {offender && !expanded && (
        <p className="mt-2 text-caption text-muted">
          Left to {STEP_HINT[nextEscalation(sender, people)]}, right to forgive.
        </p>
      )}

      <div className="min-h-0 flex-1 !shrink" />

      {offender && !expanded && (
        <div aria-hidden="true" className="pointer-events-none mb-3 flex justify-center">
          <Stamp className="px-3 text-[22px] leading-7">Repeat offender</Stamp>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 items-center rounded-full border border-ctl px-3.5 text-caption font-semibold">{methodBadge(sender)}</span>
        <span className="min-w-0 flex-1 truncate text-right text-caption text-muted">{expanded ? 'Tap to collapse' : 'Tap for preview'}</span>
        <button
          type="button"
          data-no-toggle
          onClick={() => openFilter(sender.id)}
          aria-label={`Filter ${senderName(sender)} instead`}
          aria-keyshortcuts="ArrowDown"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-chip px-3 text-caption font-semibold"
        >
          <ArrowDown size={14} />
          Filter
        </button>
      </div>
    </div>
  );
}
