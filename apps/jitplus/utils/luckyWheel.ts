export interface WheelSegment {
  label: string;
  color: string;
  prizeId?: string;
  isLost?: boolean;
}

interface PrizeLike {
  id?: string;
  label: string;
  weight?: number;
}

export const PRIZE_COLORS = ['#7C3AED', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#F97316'];
export const LOST_COLOR = '#475569';
const MIN_SEGMENTS = 8;
const MAX_SEGMENTS = 14;

/** Splits `total` into integer parts proportional to `weights` (largest-remainder), each at least `min`. */
function apportion(weights: number[], total: number, min = 0): number[] {
  const sum = weights.reduce((s, w) => s + w, 0) || 1;
  const base = weights.map(() => min);
  const free = Math.max(0, total - min * weights.length);
  const raw = weights.map((w) => (w / sum) * free);
  const out = base.map((b, i) => b + Math.floor(raw[i]));
  let remainder = total - out.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remainder > 0 && order.length > 0; k = (k + 1) % order.length) {
    out[order[k].i] += 1;
    remainder -= 1;
  }
  return out;
}

/**
 * Normalize prize percentages so they sum exactly to the global win rate
 * (no rounding drift) and return the leftover as the lost share.
 */
export function computeOddsBreakdown(
  prizes: PrizeLike[],
  globalWinRate: number,
): { perPrize: number[]; lostPct: number } {
  const totalPct = Math.max(0, Math.min(100, Math.round(globalWinRate * 100)));
  if (!prizes.length || totalPct === 0) {
    return { perPrize: prizes.map(() => 0), lostPct: 100 };
  }
  const perPrize = apportion(prizes.map((p) => p.weight || 1), totalPct);
  const lostPct = Math.max(0, 100 - perPrize.reduce((s, v) => s + v, 0));
  return { perPrize, lostPct };
}

export function prizeColor(index: number): string {
  return PRIZE_COLORS[index % PRIZE_COLORS.length];
}

/**
 * Builds the visual wheel. Segment counts follow the merchant's win rate and
 * prize weights; the result itself is always decided by the server. There is
 * always at least one "lost" segment because the server can return LOST even
 * at a 100 % win rate (prize stock exhausted).
 */
export function buildWheelSegments(
  prizes: PrizeLike[],
  globalWinRate: number,
  lostLabel: string,
): WheelSegment[] {
  if (!prizes.length) return [];
  const winRate = Math.max(0, Math.min(1, globalWinRate));
  const total = Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, prizes.length * 3));
  const lostCount = Math.max(1, Math.min(total - prizes.length, Math.round(total * (1 - winRate))));
  const winCount = Math.max(prizes.length, total - lostCount);
  const counts = apportion(prizes.map((p) => p.weight || 1), winCount, 1);

  // Round-robin so identical prizes are spread around the wheel.
  const prizeSegs: WheelSegment[] = [];
  const left = [...counts];
  while (prizeSegs.length < winCount) {
    prizes.forEach((p, i) => {
      if (left[i] > 0) {
        left[i] -= 1;
        prizeSegs.push({ label: p.label, color: prizeColor(i), prizeId: p.id });
      }
    });
  }

  const segs: WheelSegment[] = [];
  const size = prizeSegs.length + lostCount;
  let placedLost = 0;
  let pi = 0;
  for (let i = 0; i < size; i++) {
    const lostDue = Math.round(((i + 1) * lostCount) / size);
    if (placedLost < lostDue || pi >= prizeSegs.length) {
      segs.push({ label: lostLabel, color: LOST_COLOR, isLost: true });
      placedLost += 1;
    } else {
      segs.push(prizeSegs[pi++]);
    }
  }
  return segs;
}

/** Picks a random segment index that matches the server result. */
export function pickTargetSegment(
  segments: WheelSegment[],
  prize: { id?: string; label: string } | null,
  random: () => number = Math.random,
): number {
  let candidates: number[] = [];
  if (prize) {
    segments.forEach((s, i) => { if (!s.isLost && prize.id && s.prizeId === prize.id) candidates.push(i); });
    if (!candidates.length) {
      segments.forEach((s, i) => { if (!s.isLost && s.label === prize.label) candidates.push(i); });
    }
  } else {
    segments.forEach((s, i) => { if (s.isLost) candidates.push(i); });
  }
  if (!candidates.length) candidates = segments.map((_, i) => i);
  if (!candidates.length) return 0;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

/**
 * Absolute rotation (deg) that lands segment `index` under the top pointer,
 * at least `minTravel` degrees ahead of `current`. `jitter` in [-0.5, 0.5]
 * moves the stop point inside the segment so it never looks scripted.
 */
export function computeLandingRotation(
  current: number,
  index: number,
  count: number,
  minTravel: number,
  jitter = 0,
): number {
  const seg = 360 / Math.max(1, count);
  const clampedJitter = Math.max(-0.5, Math.min(0.5, jitter)) * 0.7;
  const offset = index * seg + seg / 2 + clampedJitter * seg;
  const landing = -offset;
  const turns = Math.ceil((current + minTravel - landing) / 360);
  return turns * 360 + landing;
}

/** Index of the segment currently under the top pointer for a wheel rotated by `rotation` deg. */
export function segmentAtPointer(rotation: number, count: number): number {
  if (count <= 0) return 0;
  const seg = 360 / count;
  const inWheel = (((-rotation) % 360) + 360) % 360;
  return Math.min(count - 1, Math.floor(inWheel / seg));
}

export interface TicketGroup<T> {
  campaignId: string;
  tickets: T[];
}

/** Groups tickets by campaign, keeping the API order of first appearance. */
export function groupTicketsByCampaign<T extends { campaignId: string }>(tickets: T[]): TicketGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const ticket of tickets) {
    const list = map.get(ticket.campaignId);
    if (list) list.push(ticket);
    else map.set(ticket.campaignId, [ticket]);
  }
  return Array.from(map, ([campaignId, list]) => ({ campaignId, tickets: list }));
}

export type DrawStatus = 'lost' | 'pending' | 'claimed' | 'expired';

export function getDrawStatus(
  draw: { result: 'WON' | 'LOST'; fulfilment: string | null; claimBefore: string | null },
  now: Date = new Date(),
): DrawStatus {
  if (draw.result !== 'WON') return 'lost';
  if (draw.fulfilment === 'CLAIMED') return 'claimed';
  if (draw.fulfilment === 'EXPIRED') return 'expired';
  if (draw.claimBefore && new Date(draw.claimBefore).getTime() < now.getTime()) return 'expired';
  return 'pending';
}
