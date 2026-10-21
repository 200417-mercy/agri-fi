/**
 * Payout split helpers for escrow release (Issue #955).
 *
 * Delegates to the shared `splitRatio` utility so there is a single source
 * of truth for floor+remainder dust semantics across the backend.
 */
import { splitRatio } from '../common/money';

export const FARMER_RATIO = 0.98;
export const PLATFORM_RATIO = 0.02;

/**
 * Splits a total USD value into [farmerAmount, platformAmount].
 * Uses floor arithmetic with remainder going to the farmer.
 *
 * @param totalUsd  Deal total value in USD
 * @returns         [farmerAmount, platformAmount] in USD
 */
export function splitPayoutUsd(totalUsd: number): [number, number] {
  // Work in cents to avoid floating-point issues
  const totalCents = Math.round(totalUsd * 100);
  const [farmerCents, platformCents] = splitRatio(totalCents, [
    FARMER_RATIO,
    PLATFORM_RATIO,
  ]);
  return [farmerCents / 100, platformCents / 100];
}

/**
 * Proportionally distributes `investorPoolUsd` across investors according to
 * their token weights. Uses floor+remainder so the sum always equals the pool.
 *
 * @param investorPoolUsd  Total USD to distribute to investors
 * @param tokenWeights     Each investor's token count
 * @returns                USD amount per investor (same order as tokenWeights)
 */
export function allocateInvestorPayouts(
  investorPoolUsd: number,
  tokenWeights: number[],
): number[] {
  if (tokenWeights.length === 0) return [];

  const totalWeight = tokenWeights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error('allocateInvestorPayouts: total weight must be positive');

  const poolCents = Math.round(investorPoolUsd * 100);
  const ratios = tokenWeights.map((w) => w / totalWeight);
  return splitRatio(poolCents, ratios).map((cents) => cents / 100);
}
