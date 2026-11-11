export interface LimiterOptions {
  maxConcurrent: number;
  perSecond: number;
  now?: () => number;
}

export interface Limiter {
  run<T>(task: () => Promise<T>): Promise<T>;
}

/** Caps requests in flight and request starts per rolling second. */
export function createLimiter({ maxConcurrent, perSecond, now = Date.now }: LimiterOptions): Limiter {
  let active = 0;
  const waiting: Array<() => void> = [];
  const recentStarts: number[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  function pump() {
    while (waiting.length > 0 && active < maxConcurrent) {
      const t = now();
      while (recentStarts.length > 0 && t - recentStarts[0]! >= 1000) recentStarts.shift();
      if (recentStarts.length >= perSecond) {
        timer ??= setTimeout(() => {
          timer = null;
          pump();
        }, 1000 - (t - recentStarts[0]!));
        return;
      }
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
  };
}

const MAX_BACKOFF_MS = 32_000;

/** Exponential backoff with up to a second of jitter, never shorter than a `Retry-After` header asks. */
export function backoffDelay(attempt: number, retryAfter: string | null = null, random = Math.random): number {
  const exponential = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt) + Math.floor(random() * 1000);
  const retryAfterSeconds = retryAfter === null ? NaN : Number(retryAfter);
  return Number.isFinite(retryAfterSeconds) ? Math.max(exponential, retryAfterSeconds * 1000) : exponential;
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
