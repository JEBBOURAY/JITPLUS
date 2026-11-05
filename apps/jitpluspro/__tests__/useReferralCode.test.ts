import { act, renderHook } from '@testing-library/react-native';
import api from '@/services/api';
import { hapticLight } from '@/utils/haptics';
import { referralCodeFromLink, useReferralCode } from '@/hooks/useReferralCode';

jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('@/utils/haptics', () => ({ hapticLight: jest.fn() }));

const get = jest.mocked(api.get);
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

/** Runs the 600 ms debounce, then lets the mocked request resolve. */
async function answer() {
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  await act(async () => {});
}

describe('referral code field', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    get.mockReset();
    jest.mocked(hapticLight).mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it('shows the sponsor for an existing code', async () => {
    get.mockResolvedValue({ data: { nom: 'Café Atlas' } });
    const { result } = renderHook(() => useReferralCode());
    act(() => result.current.onChange('abcd12'));
    expect(result.current.status).toBe('checking');
    await answer();
    expect(get).toHaveBeenCalledWith('/auth/referral/check/ABCD12');
    expect(result.current.status).toBe('valid');
    expect(result.current.sponsorName).toBe('Café Atlas');
    expect(hapticLight).toHaveBeenCalledTimes(1);
  });

  it('says "invalid" only when the server does not know the code (404)', async () => {
    get.mockRejectedValue(httpError(404));
    const { result } = renderHook(() => useReferralCode());
    act(() => result.current.onChange('NOPE99'));
    await answer();
    expect(result.current.status).toBe('invalid');
  });

  it('gives no verdict when rate limited or offline', async () => {
    get.mockRejectedValueOnce(httpError(429)).mockRejectedValueOnce(new Error('Network Error'));
    const { result } = renderHook(() => useReferralCode());
    act(() => result.current.onChange('ABCD12'));
    await answer();
    expect(result.current.status).toBe('idle');
    act(() => result.current.onChange('ABCD13'));
    await answer();
    expect(result.current.status).toBe('idle');
  });

  it('asks the server once per code, and only after typing pauses', async () => {
    get.mockResolvedValue({ data: { nom: 'Café Atlas' } });
    const { result } = renderHook(() => useReferralCode());
    act(() => result.current.onChange('ABCD'));
    act(() => result.current.onChange('ABCD1'));
    act(() => result.current.onChange('ABCD12'));
    await answer();
    act(() => result.current.onChange('ABCD1'));
    act(() => result.current.onChange('ABCD12')); // back to a known code
    expect(result.current.status).toBe('valid');
    await answer();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('ignores codes shorter than 4 characters', () => {
    const { result } = renderHook(() => useReferralCode());
    act(() => result.current.onChange('AB'));
    expect(result.current.status).toBe('idle');
    expect(get).not.toHaveBeenCalled();
  });

  it('opens and checks a code from an invitation link, without a buzz', async () => {
    get.mockResolvedValue({ data: { nom: 'Café Atlas' } });
    const { result } = renderHook(() => useReferralCode('INVITE1'));
    expect(result.current.open).toBe(true);
    expect(result.current.status).toBe('checking');
    await answer();
    expect(result.current.status).toBe('valid');
    expect(hapticLight).not.toHaveBeenCalled();
  });
});

describe('referralCodeFromLink', () => {
  it('keeps a well-formed code, upper-cased', () => {
    expect(referralCodeFromLink(' abcd12 ')).toBe('ABCD12');
  });

  it('drops anything else', () => {
    expect(referralCodeFromLink('"><script>')).toBe('');
    expect(referralCodeFromLink('ab')).toBe('');
    expect(referralCodeFromLink(undefined)).toBe('');
    expect(referralCodeFromLink(['ABCD12'])).toBe('');
  });
});
