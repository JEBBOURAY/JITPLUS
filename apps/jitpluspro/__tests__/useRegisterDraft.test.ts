import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { useRegisterDraft, type RegisterDraft } from '@/hooks/useRegisterDraft';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
  setItemAsync: jest.fn((key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: jest.fn((key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  }),
}));

const KEY = 'jitpluspro_register_draft_v1';
const DAY = 24 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function saveDraft(draft: RegisterDraft, savedAt = Date.now()) {
  mockStore.set(KEY, JSON.stringify({ savedAt, draft }));
}

describe('register draft', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  it('gives back a recent draft once on mount', async () => {
    saveDraft({ email: 'cafe@atlas.ma', nomCommerce: 'Café Atlas' });
    const onRestore = jest.fn();
    renderHook(() => useRegisterDraft({}, onRestore));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith({ email: 'cafe@atlas.ma', nomCommerce: 'Café Atlas' }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it('drops a draft older than 7 days', async () => {
    saveDraft({ email: 'old@atlas.ma' }, Date.now() - 8 * DAY);
    const onRestore = jest.fn();
    renderHook(() => useRegisterDraft({}, onRestore));
    await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY));
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('saves the form as it changes, never the password', async () => {
    const { rerender } = renderHook(({ draft }: { draft: RegisterDraft }) => useRegisterDraft(draft, jest.fn()), {
      initialProps: { draft: {} },
    });
    await act(async () => { await sleep(0); }); // storage read done
    rerender({ draft: { email: 'new@atlas.ma', phoneNumber: '+212612345678' } });
    await waitFor(() => expect(mockStore.has(KEY)).toBe(true), { timeout: 2000 });
    const saved = JSON.parse(mockStore.get(KEY)!);
    expect(saved.draft).toEqual({ email: 'new@atlas.ma', phoneNumber: '+212612345678' });
    expect(JSON.stringify(saved)).not.toMatch(/password/i);
  });

  it('does not overwrite the saved draft before it was read', async () => {
    let resolveRead!: (value: string | null) => void;
    jest.mocked(SecureStore.getItemAsync).mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const { rerender } = renderHook(({ draft }: { draft: RegisterDraft }) => useRegisterDraft(draft, jest.fn()), {
      initialProps: { draft: {} },
    });
    rerender({ draft: { email: 'typing@atlas.ma' } });
    await act(async () => { await sleep(800); });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    await act(async () => { resolveRead(null); });
  });

  it('stops saving once cleared (account created)', async () => {
    const { result, rerender } = renderHook(({ draft }: { draft: RegisterDraft }) => useRegisterDraft(draft, jest.fn()), {
      initialProps: { draft: {} },
    });
    await act(async () => { await sleep(0); });
    act(() => result.current.clear());
    rerender({ draft: { email: 'after@atlas.ma' } });
    await act(async () => { await sleep(800); });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
