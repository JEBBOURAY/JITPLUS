import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import { invalidateNotifications, queryKeys } from '@/hooks/useQueryHooks';
import { useAppForegroundRefresh } from '@/hooks/useRealtimeEvents';
import { useWsStore } from '@/stores/wsStore';

jest.mock('@/services/api', () => ({ api: {} }));
jest.mock('@/utils/booking', () => ({ isBookingNotFound: () => false }));

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('invalidateNotifications', () => {
  it('invalidates the feed and the badge, nothing else', async () => {
    const qc = newClient();
    qc.setQueryData(queryKeys.notifications, { pages: [] });
    qc.setQueryData(queryKeys.unreadCount, { unreadCount: 1 });
    qc.setQueryData(queryKeys.stamps, { cards: [] });
    await invalidateNotifications(qc);
    expect(qc.getQueryState(queryKeys.notifications)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKeys.unreadCount)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(queryKeys.stamps)?.isInvalidated).toBe(false);
  });
});

describe('useAppForegroundRefresh', () => {
  let emit: (state: AppStateStatus) => void;
  let now = 0;

  beforeEach(() => {
    jest.useFakeTimers();
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    // The jest-expo AppState mock has no current state.
    (AppState as { currentState: AppStateStatus }).currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      emit = listener as (state: AppStateStatus) => void;
      return { remove: jest.fn() } as never;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function setup() {
    const qc = newClient();
    const invalidate = jest.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    renderHook(() => useAppForegroundRefresh(), { wrapper });
    return invalidate;
  }

  function resumeAfter(ms: number) {
    emit('background');
    now += ms;
    emit('active');
  }

  it('lets the reconnected socket do the catch-up', () => {
    const invalidate = setup();
    resumeAfter(6 * 60_000);
    useWsStore.getState().setConnected(true);
    jest.advanceTimersByTime(10_000);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('catches up over HTTP when the socket stays down', () => {
    const invalidate = setup();
    useWsStore.getState().setConnected(false);
    resumeAfter(6 * 60_000);
    expect(invalidate).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10_000);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.stamps });
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ predicate: expect.any(Function) }));
  });

  it('refetches nothing after a quick app switch', () => {
    const invalidate = setup();
    useWsStore.getState().setConnected(false);
    resumeAfter(60_000);
    jest.advanceTimersByTime(10_000);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
