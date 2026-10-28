export {
  LOST_COLOR,
  computeOddsBreakdown,
  prizeColor,
  buildWheelSegments,
  pickTargetSegment,
  computeLandingRotation,
  segmentAtPointer,
  type WheelSegment,
} from '@jitplus/shared/src/luckyWheel';

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
