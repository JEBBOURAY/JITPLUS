import { getDistanceKm, getDistanceSafe, formatDistance } from '@/utils/distance';

describe('getDistanceKm', () => {
  it('returns 0 for the same point', () => {
    expect(getDistanceKm(33.5731, -7.5898, 33.5731, -7.5898)).toBe(0);
  });

  it('computes Casablanca → Rabat ≈ 82 km', () => {
    const d = getDistanceKm(33.5731, -7.5898, 34.0209, -6.8417);
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(90);
  });

  it('computes Casablanca → Marrakech ≈ 240 km', () => {
    const d = getDistanceKm(33.5731, -7.5898, 31.6295, -7.9811);
    expect(d).toBeGreaterThan(210);
    expect(d).toBeLessThan(250);
  });

  it('handles across-hemisphere points', () => {
    const d = getDistanceKm(0, 0, 0, 180);
    expect(Math.round(d)).toBe(20015); // half Earth circumference
  });
});

describe('getDistanceSafe', () => {
  it('returns Infinity when lat is null', () => {
    expect(getDistanceSafe(33, -7, null, -7)).toBe(Infinity);
  });

  it('returns Infinity when lng is undefined', () => {
    expect(getDistanceSafe(33, -7, 34, undefined)).toBe(Infinity);
  });

  it('delegates to getDistanceKm for valid coords', () => {
    const safe = getDistanceSafe(33.5731, -7.5898, 34.0209, -6.8417);
    const direct = getDistanceKm(33.5731, -7.5898, 34.0209, -6.8417);
    expect(safe).toBe(direct);
  });
});

describe('formatDistance', () => {
  it('formats sub-1km as meters', () => {
    expect(formatDistance(0.35)).toBe('350 m');
  });

  it('rounds meters', () => {
    expect(formatDistance(0.001)).toBe('1 m');
  });

  it('formats 1+ km with one decimal', () => {
    expect(formatDistance(2.123)).toBe('2.1 km');
  });

  it('formats exactly 1 km', () => {
    expect(formatDistance(1)).toBe('1.0 km');
  });
});
