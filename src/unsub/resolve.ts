import type { UnsubMethods } from '../storage/types';
import { parseMailto, type MailtoTarget } from './mailto';

export type AutomaticMethod = { kind: 'one_click'; url: string } | { kind: 'mailto'; target: MailtoTarget };

export interface Resolution {
  /** Methods the app can run itself, in the order to try them. */
  automatic: AutomaticMethod[];
  /** Links a person has to open. Never fetched automatically. */
  links: string[];
  /** True when there's no header link either, so the email body should be searched. */
  needsBodySearch: boolean;
}

export type MethodGroup = 'one_click' | 'email' | 'needs_you';

/**
 * Picks unsubscribe methods in order: one-click, then email, then a link for the manual queue.
 * Never emails someone in the people-you-email set.
 */
export function resolveMethods(methods: UnsubMethods, people: ReadonlySet<string>): Resolution {
  const automatic: AutomaticMethod[] = [];
  if (methods.oneClickUrl) automatic.push({ kind: 'one_click', url: methods.oneClickUrl });

  const target = methods.mailto ? parseMailto(methods.mailto) : null;
  if (target && !target.to.some((address) => people.has(address))) automatic.push({ kind: 'mailto', target });

  const links = [...new Set([methods.httpUrl, ...(methods.bodyLinks ?? [])].filter((l): l is string => Boolean(l)))];
  return { automatic, links, needsBodySearch: links.length === 0 && methods.bodyLinks === undefined };
}

/** How the confirm sheet counts a sender: "8 one-click, 2 email, 2 need you". */
export function methodGroup(resolution: Resolution): MethodGroup {
  const first = resolution.automatic[0];
  if (first?.kind === 'one_click') return 'one_click';
  if (first?.kind === 'mailto') return 'email';
  return 'needs_you';
}
