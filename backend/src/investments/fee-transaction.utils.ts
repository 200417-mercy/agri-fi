/**
 * Fee transaction utilities for investment processing (Issue #955).
 *
 * Delegates to the shared `splitRatio` utility for platform fee calculations.
 */
import { splitRatio } from '../common/money';

export const PLATFORM_FEE_RATIO = 0.02;

/**
 * Calculates the platform fee in cents from a total USD amount.
 *
 * @param totalUsd  Transaction total in USD
 * @returns         Platform fee in USD (floor semantics)
 */
export function calcPlatformFeeUsd(totalUsd: number): number {
  const totalCents = Math.round(totalUsd * 100);
  const [, feeCents] = splitRatio(totalCents, [1 - PLATFORM_FEE_RATIO, PLATFORM_FEE_RATIO]);
  return feeCents / 100;
}

/**
 * Calculates the net amount after deducting the platform fee.
 *
 * @param totalUsd  Transaction total in USD
 * @returns         Net amount in USD (total minus platform fee)
 */
export function calcNetAmountUsd(totalUsd: number): number {
  const totalCents = Math.round(totalUsd * 100);
  const [netCents] = splitRatio(totalCents, [1 - PLATFORM_FEE_RATIO, PLATFORM_FEE_RATIO]);
  return netCents / 100;
}
