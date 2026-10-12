import { randomInt } from 'crypto';

/**
 * Picks one item with probability weight / sum(weights), using a
 * cryptographically secure RNG. Items with a weight <= 0 are never picked.
 * Returns null when the list is empty or every weight is <= 0.
 *
 * `rng(max)` must return an integer in [0, max); it is injectable for tests.
 */
export function weightedRandomPick<T extends { weight: number }>(
  items: readonly T[],
  rng: (max: number) => number = (max) => randomInt(0, max),
): T | null {
  const eligible = items.filter((item) => Number.isFinite(item.weight) && item.weight > 0);
  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, item) => sum + Math.floor(item.weight), 0);
  if (totalWeight <= 0) return eligible[0];

  const roll = rng(totalWeight);
  let cumulative = 0;
  for (const item of eligible) {
    cumulative += Math.floor(item.weight);
    if (roll < cumulative) return item;
  }
  return eligible[eligible.length - 1];
}
