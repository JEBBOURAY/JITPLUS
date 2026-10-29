import { readFileSync } from 'fs';
import { join } from 'path';
import { DealScope, DealStatus, DealType } from '@prisma/client';
import { DEAL_REPORT_REASONS, DEAL_SCOPES, DEAL_TYPES, DEAL_FEED_TABS, DEAL_EVENT_TYPES } from './dto';
import { DEAL_ENDING_SOON_HOURS, DEAL_LIMITS } from './deal-limits';
import { MOROCCO_CITIES } from './morocco-cities';

// The backend cannot import packages/shared (outside rootDir and the Docker
// image), so the shared source is read as text to detect drift.
const SHARED_DIR = join(__dirname, '../../../../packages/shared/src/deals');
const sharedTypes = readFileSync(join(SHARED_DIR, 'types.ts'), 'utf8');
const sharedConstants = readFileSync(join(SHARED_DIR, 'constants.ts'), 'utf8');
const sharedCities = readFileSync(join(SHARED_DIR, 'cities.ts'), 'utf8');

function sharedArray(name: string): string[] {
  const match = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(sharedTypes);
  if (!match) throw new Error(`${name} not found in shared/deals/types.ts`);
  return [...match[1].matchAll(/'([A-Za-z_]+)'/g)].map((m) => m[1]);
}

describe('deal enums and constants stay in sync (Prisma ↔ shared ↔ backend)', () => {
  it.each([
    ['DEAL_TYPES', Object.values(DealType)],
    ['DEAL_SCOPES', Object.values(DealScope)],
    ['DEAL_STATUSES', Object.values(DealStatus)],
  ])('%s matches Prisma', (name, prismaValues) => {
    expect(sharedArray(name)).toEqual(prismaValues);
  });

  it('DTO lists match the shared ones', () => {
    expect([...DEAL_TYPES]).toEqual(Object.values(DealType));
    expect([...DEAL_SCOPES]).toEqual(Object.values(DealScope));
    expect([...DEAL_REPORT_REASONS]).toEqual(sharedArray('DEAL_REPORT_REASONS'));
    expect([...DEAL_FEED_TABS]).toEqual(sharedArray('DEAL_FEED_TABS'));
    expect([...DEAL_EVENT_TYPES]).toEqual(sharedArray('DEAL_EVENT_TYPES'));
  });

  it('limits match the shared constants', () => {
    const entries: [string, number][] = [...Object.entries(DEAL_LIMITS), ['DEAL_ENDING_SOON_HOURS', DEAL_ENDING_SOON_HOURS]];
    for (const [key, value] of entries) {
      const match = new RegExp(`\\b${key}(?::| =) ([\\d_]+)`).exec(sharedConstants);
      expect({ key, value: match ? Number(match[1].replace(/_/g, '')) : undefined }).toEqual({ key, value });
    }
  });

  it('cities match the shared list (keys, order and positions)', () => {
    const shared = [...sharedCities.matchAll(/key: '([a-z_]+)'.*?lat: (-?[\d.]+), lng: (-?[\d.]+)/g)].map((m) => [
      m[1],
      Number(m[2]),
      Number(m[3]),
    ]);
    expect(shared).toEqual(MOROCCO_CITIES.map((c) => [c.key, c.lat, c.lng]));
    expect(new Set(MOROCCO_CITIES.map((c) => c.key)).size).toBe(MOROCCO_CITIES.length);
  });
});
