/**
 * @deprecated Import from '../common/retry-policy' directly.
 * Re-exported here for backwards compatibility.
 */
export { createRetryPolicy, DEFAULT_RETRY_POLICY, STELLAR_RETRY_POLICY } from '../common/retry-policy';
export type { RetryPolicy, RetryPolicyOptions } from '../common/retry-policy';

// ─── Legacy helpers kept for compatibility ────────────────────────────────────

export const DEFAULT_QUEUE_MAX_RETRIES = 3;

export function isTransientQueueError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');

  return [
    'stellar',
    'horizon',
    'timeout',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'connection',
    'database',
  ].some((needle) => message.includes(needle));
}

export function getExponentialBackoffDelayMs(
  attempt: number,
  baseDelayMs: number,
): number {
  const normalizedAttempt = Math.max(1, attempt);
  return Math.pow(2, normalizedAttempt - 1) * baseDelayMs;
}
