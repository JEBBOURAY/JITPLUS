import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMessageDraft } from '@/hooks/useMessageDraft';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KEY = 'messages_draft_m1';

describe('notification draft', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('keeps the text across mounts, per account', async () => {
    const first = renderHook(() => useMessageDraft('m1'));
    act(() => first.result.current.update({ title: 'Promo', body: 'Hello' }));
    await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith(KEY, JSON.stringify({ title: 'Promo', body: 'Hello' })));
    first.unmount();

    const next = renderHook(() => useMessageDraft('m1'));
    await waitFor(() => expect(next.result.current.title).toBe('Promo'));
    expect(next.result.current.body).toBe('Hello');

    const other = renderHook(() => useMessageDraft('m2'));
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalledWith('messages_draft_m2'));
    expect(other.result.current.title).toBe('');
  });

  it('forgets the draft once reset', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ title: 'Promo', body: 'Hello' }));
    const { result } = renderHook(() => useMessageDraft('m1'));
    await waitFor(() => expect(result.current.title).toBe('Promo'));

    act(() => result.current.reset());

    expect(result.current.title).toBe('');
    await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalledWith(KEY));
  });

  it('does not apply a late read over text already typed', async () => {
    let resolveRead!: (value: string | null) => void;
    jest.spyOn(AsyncStorage, 'getItem').mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const { result } = renderHook(() => useMessageDraft('m1'));
    act(() => result.current.update({ title: 'Typed' }));
    await act(async () => { resolveRead(JSON.stringify({ title: 'Stored', body: 'Old' })); });
    expect(result.current.title).toBe('Typed');
  });
});
