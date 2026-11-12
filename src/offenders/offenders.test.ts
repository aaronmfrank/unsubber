import { describe, expect, it } from 'vitest';
import type { Sender } from '../storage/types';
import { addBusinessDays, graceEndsAt, isAfterGrace } from './grace';
import { findTrackedSender, isTracked, recordReturn } from './match';

function sender(id: string, overrides: Partial<Sender> = {}): Sender {
  return {
    id,
    displayName: id,
    domain: id.slice(id.indexOf('@') + 1),
    listIds: [],
    messageCount: 5,
    lastReceivedAt: '2026-10-01T00:00:00.000Z',
    latestSubject: '',
    latestSnippet: '',
    latestMessageId: 'm',
    latestThreadId: 't',
    unsubMethods: {},
    status: 'unsubscribed',
    unsubscribedAt: '2026-10-01T15:00:00.000Z',
    escalationStep: 1,
    returnCount: 0,
    ...overrides,
  };
}

describe('business-day grace period', () => {
  it('skips weekends', () => {
    // Thu Oct 1 2026 + 10 business days = Thu Oct 15.
    expect(addBusinessDays(new Date('2026-10-01T15:00:00Z'), 10).toISOString()).toBe('2026-10-15T15:00:00.000Z');
    // Fri Oct 2 + 1 = Mon Oct 5.
    expect(addBusinessDays(new Date('2026-10-02T09:00:00Z'), 1).toISOString()).toBe('2026-10-05T09:00:00.000Z');
  });

  it('starts counting from the next business day when unsubscribed on a weekend', () => {
    // Sat Oct 3 + 1 = Mon Oct 5; + 10 = Fri Oct 16.
    expect(addBusinessDays(new Date('2026-10-03T12:00:00Z'), 1).toISOString()).toBe('2026-10-05T12:00:00.000Z');
    expect(graceEndsAt('2026-10-03T12:00:00.000Z').toISOString()).toBe('2026-10-16T12:00:00.000Z');
  });

  it('only counts mail strictly after the grace period', () => {
    const unsubscribedAt = '2026-10-01T15:00:00.000Z';
    expect(isAfterGrace('2026-10-14T23:00:00.000Z', unsubscribedAt)).toBe(false);
    expect(isAfterGrace('2026-10-15T15:00:00.000Z', unsubscribedAt)).toBe(false);
    expect(isAfterGrace('2026-10-15T15:00:01.000Z', unsubscribedAt)).toBe(true);
  });
});

describe('sender matching', () => {
  const tracked = sender('deals@brand.com', { listIds: ['deals.brand.com'] });

  it('matches the same address', () => {
    expect(findTrackedSender({ fromAddress: 'deals@brand.com', domain: 'brand.com' }, [tracked])).toBe(tracked);
  });

  it('matches a rotated address on the same domain with a known List-Id', () => {
    expect(findTrackedSender({ fromAddress: 'promo7@brand.com', domain: 'brand.com', listId: 'deals.brand.com' }, [tracked])).toBe(tracked);
  });

  it('needs both the domain and the List-Id', () => {
    expect(findTrackedSender({ fromAddress: 'promo7@brand.com', domain: 'brand.com', listId: 'news.brand.com' }, [tracked])).toBeUndefined();
    expect(findTrackedSender({ fromAddress: 'promo@other.com', domain: 'other.com', listId: 'deals.brand.com' }, [tracked])).toBeUndefined();
    expect(findTrackedSender({ fromAddress: 'promo7@brand.com', domain: 'brand.com' }, [tracked])).toBeUndefined();
  });

  it('prefers an exact address over a List-Id match', () => {
    const exact = sender('promo7@brand.com');
    expect(findTrackedSender({ fromAddress: 'promo7@brand.com', domain: 'brand.com', listId: 'deals.brand.com' }, [tracked, exact])).toBe(exact);
  });

  it('never checks kept, blocked or not-yet-unsubscribed senders', () => {
    for (const status of ['kept', 'blocked', 'new', 'manual', 'queued'] as const) {
      expect(isTracked(sender('a@b.com', { status }))).toBe(false);
    }
    expect(isTracked(sender('a@b.com', { unsubscribedAt: undefined }))).toBe(false);
    expect(isTracked(sender('a@b.com', { status: 'repeat_offender' }))).toBe(true);
  });
});

describe('recordReturn', () => {
  it('stamps a sender that emails after the grace period', () => {
    expect(recordReturn(sender('a@b.com'), '2026-10-20T10:00:00.000Z')).toMatchObject({
      status: 'repeat_offender',
      returnCount: 1,
      lastReturnAt: '2026-10-20T10:00:00.000Z',
    });
  });

  it('counts mail inside the grace period without flagging it', () => {
    const s = sender('a@b.com');
    expect(recordReturn(s, '2026-10-05T10:00:00.000Z')).toBe(s);
  });

  it('keeps counting returns from an existing repeat offender', () => {
    const offender = sender('a@b.com', { status: 'repeat_offender', returnCount: 3, lastReturnAt: '2026-10-25T00:00:00.000Z' });
    expect(recordReturn(offender, '2026-10-21T00:00:00.000Z')).toMatchObject({ returnCount: 4, lastReturnAt: '2026-10-25T00:00:00.000Z' });
  });
});
