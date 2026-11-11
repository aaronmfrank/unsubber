export interface LimiterOptions {
  maxConcurrent: number;
  perSecond: number;
  now?: () => number;
}

export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Holds every queued task until `ms` from now. Overlapping pauses keep the later end. */
  pause(ms: number): void;
}

/** Caps requests in flight and request starts per rolling second, with a shared pause for rate limits. */
export function createLimiter({ maxConcurrent, perSecond, now = Date.now }: LimiterOptions): Limiter {
  let active = 0;
  const waiting: Array<() => void> = [];
  const recentStarts: number[] = [];
  let pausedUntil = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function wakeIn(ms: number) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      pump();
    }, ms);
  }

  function pump() {
    while (waiting.length > 0 && active < maxConcurrent) {
      const t = now();
      if (t < pausedUntil) return wakeIn(pausedUntil - t);
      while (recentStarts.length > 0 && t - recentStarts[0]! >= 1000) recentStarts.shift();
      if (recentStarts.length >= perSecond) return wakeIn(1000 - (t - recentStarts[0]!));
      recentStarts.push(t);
      active++;
      waiting.shift()!();
    }
  }

  return {
    run<T>(task: () => Promise<T>) {
      return new Promise<void>((resolve) => {
        waiting.push(resolve);
        pump();
      })
        .then(task)
        .finally(() => {
          active--;
          pump();
        });
    },
    pause(ms: number) {
      pausedUntil = Math.max(pausedUntil, now() + ms);
    },
  };
}

const MAX_BACKOFF_MS = 64_000;

/** Exponential backoff with up to a second of jitter, never shorter than a `Retry-After` header asks. */
export function backoffDelay(attempt: number, retryAfter: string | null = null, random = Math.random): number {
  const exponential = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) + Math.floor(random() * 1000);
  const retryAfterSeconds = retryAfter === null ? NaN : Number(retryAfter);
  return Number.isFinite(retryAfterSeconds) ? Math.max(exponential, retryAfterSeconds * 1000) : exponential;
}

export function isServerError(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded', 'RATE_LIMIT_EXCEEDED']);

/** Gmail reports per-user rate limits as 429, or as 403 with a rate-limit reason. */
export function isRateLimitError(status: number, body: unknown): boolean {
  if (status === 429) return true;
  if (status !== 403 || typeof body !== 'object' || body === null) return false;
  const error = (body as { error?: { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } }).error;
  const reasons = [...(error?.errors ?? []), ...(error?.details ?? [])].map((e) => e.reason ?? '');
  return reasons.some((r) => RATE_LIMIT_REASONS.has(r)) || /quota exceeded|rate limit/i.test(error?.message ?? '');
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
