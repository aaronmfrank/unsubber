import type { Attempt, AttemptMethod, AttemptResult } from '../storage';

export const METHOD_LABEL: Record<AttemptMethod, string> = {
  one_click: 'One-click',
  mailto: 'Unsubscribe email',
  manual_link: 'Link you opened',
  filter_block: 'Block filter',
  report_spam: 'Reported spam',
  filter_archive: 'Inbox filter',
};

export const RESULT_LABEL: Record<AttemptResult, string> = {
  sent_unconfirmed: 'Sent, unconfirmed',
  sent: 'Sent',
  failed: 'Failed',
  done_by_user: 'Done by you',
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Extra context worth showing: the failure reason, or the site a link went to. Message and filter ids stay hidden. */
export function attemptDetail(attempt: Attempt): string | null {
  if (attempt.result === 'failed') return attempt.detail || null;
  if (attempt.method === 'one_click' || attempt.method === 'manual_link') return hostOf(attempt.detail);
  if (attempt.method === 'report_spam') return attempt.detail;
  return null;
}
