import {
  createScanDeduper, detectBalanceScan, getRefreshDelayS, getScanPollInterval, scanEventKey, toBalanceMap,
} from '@/utils/qrScan';
import type { LoyaltyCard } from '@/types';

const card = (merchantId: string, balance: number): LoyaltyCard => ({
  id: `card-${merchantId}`, merchantId, clientId: 'client-1', balance, createdAt: '2026-01-01',
  merchant: { nomBoutique: `Shop ${merchantId}` } as LoyaltyCard['merchant'],
});

describe('getScanPollInterval', () => {
  it('polls fast in the first minute, then backs off', () => {
    expect(getScanPollInterval(0, false)).toBe(4_000);
    expect(getScanPollInterval(59_999, false)).toBe(4_000);
    expect(getScanPollInterval(60_000, false)).toBe(10_000);
    expect(getScanPollInterval(179_999, false)).toBe(10_000);
    expect(getScanPollInterval(180_000, false)).toBe(30_000);
  });

  it('polls less when the WebSocket is connected', () => {
    expect(getScanPollInterval(0, true)).toBe(10_000);
    expect(getScanPollInterval(120_000, true)).toBe(10_000);
    expect(getScanPollInterval(600_000, true)).toBe(30_000);
  });
});

describe('getRefreshDelayS', () => {
  const now = 1_700_000_000_000;
  const nowS = now / 1000;
  it('refreshes 10s before expiry', () => {
    expect(getRefreshDelayS(nowS + 60, now)).toBe(50);
  });
  it('never goes below 5s, even for an expired token', () => {
    expect(getRefreshDelayS(nowS + 12, now)).toBe(5);
    expect(getRefreshDelayS(nowS - 100, now)).toBe(5);
  });
});

describe('detectBalanceScan', () => {
  it('returns null when nothing changed', () => {
    const cards = [card('a', 3), card('b', 0)];
    expect(detectBalanceScan(toBalanceMap(cards), cards)).toBeNull();
  });

  it('reports an earned stamp with its merchant', () => {
    const previous = toBalanceMap([card('a', 3), card('b', 1)]);
    const ev = detectBalanceScan(previous, [card('a', 3), card('b', 3)], 42);
    expect(ev).toEqual({
      clientId: 'client-1', merchantId: 'b', merchantName: 'Shop b',
      stamps: 2, newBalance: 3, type: 'EARN_STAMPS', receivedAt: 42,
    });
  });

  it('reports a redeemed reward when the balance drops', () => {
    const ev = detectBalanceScan(toBalanceMap([card('a', 10)]), [card('a', 0)]);
    expect(ev).toMatchObject({ type: 'REDEEM_REWARD', stamps: 10, newBalance: 0 });
  });

  it('treats a new card as a change from zero', () => {
    const ev = detectBalanceScan(new Map(), [card('new', 1)]);
    expect(ev).toMatchObject({ merchantId: 'new', stamps: 1, type: 'EARN_STAMPS' });
  });
});

describe('createScanDeduper', () => {
  it('lets the same scan through once per window', () => {
    const isNew = createScanDeduper(30_000);
    const key = scanEventKey({ merchantId: 'a', type: 'EARN_STAMPS', newBalance: 4 });
    expect(isNew(key, 0)).toBe(true);
    expect(isNew(key, 29_999)).toBe(false);
    expect(isNew(key, 30_000)).toBe(true);
  });

  it('keeps different scans apart', () => {
    const isNew = createScanDeduper();
    expect(isNew(scanEventKey({ merchantId: 'a', type: 'EARN_STAMPS', newBalance: 4 }), 0)).toBe(true);
    expect(isNew(scanEventKey({ merchantId: 'a', type: 'EARN_STAMPS', newBalance: 5 }), 1)).toBe(true);
    expect(isNew(scanEventKey({ merchantId: 'b', type: 'EARN_STAMPS', newBalance: 4 }), 2)).toBe(true);
  });
});
