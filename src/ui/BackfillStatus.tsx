import { useBackfill } from '../state/backfill';
import { number } from './format';

/** A quiet line while the rest of the first scan's range loads in the background. */
export function BackfillStatus({ className = '' }: { className?: string }) {
  const { status, progress } = useBackfill();
  if (status !== 'running' && status !== 'paused') return null;

  let text: string;
  if (status === 'paused') text = 'Loading older mail paused. It picks up again on its own.';
  else if (progress?.phase === 'people')
    text = progress.total ? `Finding more people you email · ${number.format(progress.done)} of ${number.format(progress.total)}` : 'Finding more people you email';
  else if (progress?.phase === 'reading')
    text = `Loading 30–90 days back · ${number.format(progress.done)} of ${number.format(progress.total)}`;
  else text = 'Loading 30–90 days back';

  return (
    <p role="status" className={`inline-flex h-8 items-center gap-2 rounded-full bg-chip px-3.5 text-caption font-semibold text-muted ${className}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${status === 'running' ? 'animate-pulse bg-gline' : 'bg-ctl'}`} />
      {text}
    </p>
  );
}
