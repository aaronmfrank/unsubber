import { describe, expect, it } from 'vitest';
import type { GmailMessage } from '../gmail/types';
import { mergeIntoSenders, normalizeListId, senderDomain, toScannedMessage, type ScannedMessage } from './senders';
import { coveredRange, formatGmailDate, initialWindow, olderWindow, windowQuery } from './windows';

function msg(overrides: Partial<ScannedMessage> & { id: string; date: string }): ScannedMessage {
  return {
    threadId: `t-${overrides.id}`,
    fromAddress: 'deals@brandx.com',
    fromName: 'Brand X',
    subject: `Subject ${overrides.id}`,
    snippet: `Snippet ${overrides.id}`,
    ...overrides,
  };
}

describe('senderDomain', () => {
  it('returns the registrable domain', () => {
    expect(senderDomain('deals@brandx.com')).toBe('brandx.com');
    expect(senderDomain('news@mail.brand.co.uk')).toBe('brand.co.uk');
  });
});

describe('normalizeListId', () => {
  it('keeps the bracketed id, lowercased', () => {
    expect(normalizeListId('Brand News <News.Brand.com>')).toBe('news.brand.com');
    expect(normalizeListId(' news.brand.com ')).toBe('news.brand.com');
  });
});

describe('toScannedMessage', () => {
  const gmailMessage = (headers: Record<string, string>): GmailMessage => ({
    id: 'm1',
    threadId: 't1',
    snippet: 'Our biggest sale',
    internalDate: String(Date.UTC(2026, 10, 9, 12)),
    payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
  });

  it('reads headers case-insensitively and uses internalDate', () => {
    const scanned = toScannedMessage(
      gmailMessage({
        from: '"Brand X" <Deals@BrandX.com>',
        SUBJECT: '=?UTF-8?Q?30=25_off?=',
        'List-Id': 'Deals <deals.brandx.com>',
        'List-Unsubscribe': '<https://brandx.com/u>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      }),
    );
    expect(scanned).toMatchObject({
      fromAddress: 'deals@brandx.com',
      fromName: 'Brand X',
      subject: '30% off',
      snippet: 'Our biggest sale',
      date: '2026-11-09T12:00:00.000Z',
      listId: 'deals.brandx.com',
      listUnsubscribe: '<https://brandx.com/u>',
    });
  });

  it('skips messages without a usable From', () => {
    expect(toScannedMessage(gmailMessage({ Subject: 'hi' }))).toBeNull();
  });
});

describe('mergeIntoSenders', () => {
  it('groups by address and keeps the newest subject, snippet and ids', () => {
    const merged = mergeIntoSenders(new Map(), [
      msg({ id: 'a', date: '2026-11-01T00:00:00.000Z' }),
      msg({ id: 'b', date: '2026-11-09T00:00:00.000Z' }),
      msg({ id: 'c', date: '2026-11-05T00:00:00.000Z' }),
      msg({ id: 'd', date: '2026-11-02T00:00:00.000Z', fromAddress: 'other@brandx.com' }),
    ]);
    expect(merged.size).toBe(2);
    expect(merged.get('deals@brandx.com')).toMatchObject({
      messageCount: 3,
      lastReceivedAt: '2026-11-09T00:00:00.000Z',
      latestSubject: 'Subject b',
      latestMessageId: 'b',
      latestThreadId: 't-b',
      domain: 'brandx.com',
      status: 'new',
    });
  });

  it('adds counts to existing senders without changing their status', () => {
    const [first] = mergeIntoSenders(new Map(), [msg({ id: 'a', date: '2026-11-01T00:00:00.000Z' })]).values();
    const existing = new Map([[first!.id, { ...first!, status: 'kept' as const }]]);
    const merged = mergeIntoSenders(existing, [msg({ id: 'old', date: '2026-08-01T00:00:00.000Z' })]);
    expect(merged.get('deals@brandx.com')).toMatchObject({ messageCount: 2, status: 'kept', latestMessageId: 'a' });
    expect(existing.get('deals@brandx.com')?.messageCount).toBe(1);
  });

  it('collects distinct list ids', () => {
    const merged = mergeIntoSenders(new Map(), [
      msg({ id: 'a', date: '2026-11-01T00:00:00.000Z', listId: 'deals.brandx.com' }),
      msg({ id: 'b', date: '2026-11-02T00:00:00.000Z', listId: 'deals.brandx.com' }),
      msg({ id: 'c', date: '2026-11-03T00:00:00.000Z', listId: 'news.brandx.com' }),
    ]);
    expect(merged.get('deals@brandx.com')?.listIds).toEqual(['deals.brandx.com', 'news.brandx.com']);
  });

  it('parses unsubscribe methods from the newest message that has the header', () => {
    const merged = mergeIntoSenders(new Map(), [
      msg({ id: 'new', date: '2026-11-09T00:00:00.000Z', listUnsubscribe: '<https://x.com/new>' }),
      msg({ id: 'newest-no-header', date: '2026-11-10T00:00:00.000Z' }),
      msg({ id: 'old', date: '2026-11-01T00:00:00.000Z', listUnsubscribe: '<mailto:u@x.com>' }),
    ]);
    expect(merged.get('deals@brandx.com')?.unsubMethods).toEqual({ httpUrl: 'https://x.com/new' });
  });

  it('keeps an earlier display name when the latest message has none', () => {
    const merged = mergeIntoSenders(new Map(), [
      msg({ id: 'a', date: '2026-11-01T00:00:00.000Z', fromName: 'Brand X' }),
      msg({ id: 'b', date: '2026-11-02T00:00:00.000Z', fromName: '' }),
    ]);
    expect(merged.get('deals@brandx.com')?.displayName).toBe('Brand X');
  });
});

describe('scan windows', () => {
  it('covers the last 30 days through today, or another span', () => {
    expect(initialWindow(new Date(2026, 10, 11))).toEqual({ after: '2026/10/12', before: '2026/11/12' });
    expect(initialWindow(new Date(2026, 10, 11), 90)).toEqual({ after: '2026/08/13', before: '2026/11/12' });
    expect(formatGmailDate(new Date(2026, 0, 5))).toBe('2026/01/05');
  });

  it('steps back 90 days from the oldest window scanned', () => {
    const scanned = [
      { after: '2026/08/13', before: '2026/11/12' },
      { after: '2026/05/15', before: '2026/08/13' },
    ];
    expect(olderWindow(scanned)).toEqual({ after: '2026/02/14', before: '2026/05/15' });
    expect(coveredRange(scanned)).toEqual({ after: '2026/05/15', before: '2026/11/12' });
    expect(coveredRange([])).toBeNull();
  });

  it('excludes sent, drafts and chats', () => {
    expect(windowQuery({ after: '2026/08/13', before: '2026/11/12' })).toBe(
      'after:2026/08/13 before:2026/11/12 -in:sent -in:drafts -in:chats',
    );
  });
});
