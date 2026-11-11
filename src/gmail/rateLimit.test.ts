import { afterEach, describe, expect, it, vi } from 'vitest';
import { backoffDelay, createLimiter } from './rateLimit';

describe('backoffDelay', () => {
  it('doubles each attempt up to 32 seconds', () => {
    const noJitter = () => 0;
    expect([0, 1, 2, 5, 9].map((a) => backoffDelay(a, null, noJitter))).toEqual([1000, 2000, 4000, 32000, 32000]);
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

  it('frees the slot when a task throws', async () => {
    const limiter = createLimiter({ maxConcurrent: 1, perSecond: 100 });
    await expect(limiter.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(limiter.run(async () => 'ok')).resolves.toBe('ok');
  });
});
