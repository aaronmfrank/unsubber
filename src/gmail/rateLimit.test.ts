import { afterEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay, createLimiter, isRateLimitError } from './rateLimit';

describe('backoffDelay', () => {
  it('doubles each attempt up to 64 seconds', () => {
    const noJitter = () => 0;
    expect([0, 1, 2, 5, 6, 9].map((a) => backoffDelay(a, null, noJitter))).toEqual([1000, 2000, 4000, 32000, 64000, 64000]);
  });

  it('adds up to a second of jitter', () => {
    expect(backoffDelay(0, null, () => 0.999)).toBe(1999);
  });

  it('waits at least as long as Retry-After', () => {
    expect(backoffDelay(0, '10', () => 0)).toBe(10_000);
    expect(backoffDelay(3, '1', () => 0)).toBe(8000);
    expect(backoffDelay(0, 'Wed, 21 Oct 2026 07:28:00 GMT', () => 0)).toBe(1000);
  });
});

describe('isRateLimitError', () => {
  const body = (reason: string, message = '') => ({ error: { message, errors: [{ reason }] } });

  it('treats every 429 as a rate limit', () => {
    expect(isRateLimitError(429, null)).toBe(true);
  });

  it('recognizes rate-limit 403s by reason or message', () => {
    expect(isRateLimitError(403, body('userRateLimitExceeded'))).toBe(true);
    expect(isRateLimitError(403, body('quotaExceeded'))).toBe(true);
    expect(
      isRateLimitError(403, body('', "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'")),
    ).toBe(true);
  });

  it('leaves permission errors alone', () => {
    expect(isRateLimitError(403, body('insufficientPermissions', 'Request had insufficient authentication scopes.'))).toBe(false);
    expect(isRateLimitError(403, null)).toBe(false);
    expect(isRateLimitError(500, null)).toBe(false);
  });
});

describe('createLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never runs more than maxConcurrent tasks at once', async () => {
    const limiter = createLimiter({ maxConcurrent: 3, perSecond: 1000 });
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    };
    await Promise.all(Array.from({ length: 12 }, () => limiter.run(task)));
    expect(peak).toBe(3);
  });

  it('starts at most perSecond tasks in any second', async () => {
    vi.useFakeTimers();
    const limiter = createLimiter({ maxConcurrent: 100, perSecond: 4, now: () => Date.now() });
    const started: number[] = [];
    const all = Promise.all(Array.from({ length: 10 }, () => limiter.run(async () => void started.push(Date.now()))));
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(started).toHaveLength(8);
    await vi.advanceTimersByTimeAsync(1000);
    await all;
    expect(started).toHaveLength(10);
  });

  it('holds every queued task during a pause', async () => {
    vi.useFakeTimers();
    const limiter = createLimiter({ maxConcurrent: 10, perSecond: 100, now: () => Date.now() });
    limiter.pause(5000);
    limiter.pause(2000);
    let ran = 0;
    const all = Promise.all(Array.from({ length: 3 }, () => limiter.run(async () => void ran++)));
    await vi.advanceTimersByTimeAsync(4999);
    expect(ran).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await all;
    expect(ran).toBe(3);
  });

  it('frees the slot when a task throws', async () => {
    const limiter = createLimiter({ maxConcurrent: 1, perSecond: 100 });
    await expect(limiter.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(limiter.run(async () => 'ok')).resolves.toBe('ok');
  });
});
