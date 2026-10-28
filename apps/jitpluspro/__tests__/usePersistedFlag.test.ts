import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePersistedFlag } from '@/hooks/usePersistedFlag';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/utils/devLogger', () => ({ logWarn: jest.fn() }));

describe('saved display preferences', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  it('waits for storage and keeps a dismissal across mounts', async () => {
    const first = renderHook(() => usePersistedFlag('welcome:m1'));
    expect(first.result.current.value).toBeNull();
    await waitFor(() => expect(first.result.current.value).toBe(false));
    act(() => first.result.current.setValue(true));
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith('welcome:m1', 'true'));
    first.unmount();
    const next = renderHook(() => usePersistedFlag('welcome:m1'));
    await waitFor(() => expect(next.result.current.value).toBe(true));
  });

  it('does not apply a late read over a new dismissal', async () => {
    let resolveRead!: (value: string | null) => void;
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const { result } = renderHook(() => usePersistedFlag('banner'));
    act(() => result.current.setValue(true));
    await act(async () => { resolveRead(null); });
    expect(result.current.value).toBe(true);
  });

  it('does not apply another merchant’s pending read', async () => {
    let resolveRead!: (value: string | null) => void;
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const { result, rerender } = renderHook(({ id }: { id: string }) => usePersistedFlag(`welcome:${id}`), { initialProps: { id: 'm1' } });
    rerender({ id: 'm2' });
    await waitFor(() => expect(result.current.value).toBe(false));
    await act(async () => { resolveRead('true'); });
    expect(result.current.value).toBe(false);
  });

  it('resets a daily dismissal without changing its storage format', async () => {
    await AsyncStorage.setItem('trial', '2026-10-22');
    const { result, rerender } = renderHook(({ day }: { day: string }) => usePersistedFlag('trial', day), { initialProps: { day: '2026-10-22' } });
    await waitFor(() => expect(result.current.value).toBe(true));
    rerender({ day: '2026-10-23' });
    await waitFor(() => expect(result.current.value).toBe(false));
    act(() => result.current.setValue(true));
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith('trial', '2026-10-23'));
  });

  it('still closes a banner if saving fails', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage unavailable'));
    const { result } = renderHook(() => usePersistedFlag('banner'));
    await waitFor(() => expect(result.current.value).toBe(false));
    await act(async () => result.current.setValue(true));
    expect(result.current.value).toBe(true);
  });
});
