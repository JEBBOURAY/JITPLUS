import { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/keys';
import { DEFAULT_TRANSACTION_FILTERS } from '@/utils/historyFilters';
import {
  invalidateAfterTransaction,
  isLocalTransactionEcho,
  markLocalTransaction,
} from '@/hooks/queries/transactionCache';

const SEEDED = {
  status: queryKeys.clientStatus('c1'),
  detail: queryKeys.clientDetail('c1'),
  otherStatus: queryKeys.clientStatus('c2'),
  history: queryKeys.transactionList(DEFAULT_TRANSACTION_FILTERS),
  home: queryKeys.homeStats,
  clients: queryKeys.clientList('', 'all', null),
  kpis: queryKeys.dashboardKpis,
  trends: queryKeys.dashboardTrends('7d'),
  games: queryKeys.dashboardGames,
  rewards: queryKeys.rewards,
};

function seededClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const key of Object.values(SEEDED)) qc.setQueryData(key, { seeded: true });
  return qc;
}

const invalidated = (qc: QueryClient, key: readonly unknown[]) => qc.getQueryState(key)?.isInvalidated;

describe('invalidateAfterTransaction', () => {
  it('refreshes the client, the history, the home stats and marks lists and statistics stale', () => {
    const qc = seededClient();
    invalidateAfterTransaction(qc, 'c1');
    for (const key of [SEEDED.status, SEEDED.detail, SEEDED.history, SEEDED.home, SEEDED.clients, SEEDED.kpis, SEEDED.trends, SEEDED.games]) {
      expect(invalidated(qc, key)).toBe(true);
    }
    // Another client and unrelated merchant data stay as they are.
    expect(invalidated(qc, SEEDED.otherStatus)).toBe(false);
    expect(invalidated(qc, SEEDED.rewards)).toBe(false);
  });

  it('works without a client (anonymous transaction)', () => {
    const qc = seededClient();
    invalidateAfterTransaction(qc);
    expect(invalidated(qc, SEEDED.home)).toBe(true);
    expect(invalidated(qc, SEEDED.status)).toBe(false);
  });

  it('marks the client so the socket echo of this transaction is ignored', () => {
    invalidateAfterTransaction(seededClient(), 'c-echo');
    expect(isLocalTransactionEcho('c-echo')).toBe(true);
  });
});

describe('isLocalTransactionEcho', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is false for a client this device did not touch', () => {
    expect(isLocalTransactionEcho('never-seen')).toBe(false);
  });

  it('expires after the echo window', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    markLocalTransaction('c3');
    now.mockReturnValue(1_002_999);
    expect(isLocalTransactionEcho('c3')).toBe(true);
    now.mockReturnValue(1_003_001);
    expect(isLocalTransactionEcho('c3')).toBe(false);
  });
});
