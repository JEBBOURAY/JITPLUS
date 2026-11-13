import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import MessagesScreen from '@/app/messages';
import type { BroadcastStatus } from '@/types';

const mockPush = jest.fn();
const mockCheckContent = jest.fn();
const mockSendPush = jest.fn();
let mockStatus: BroadcastStatus | undefined;

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('@/utils/haptics', () => ({ safeImpact: jest.fn(), safeSelection: jest.fn(), safeNotification: jest.fn() }));
jest.mock('@/contexts/AuthContext', () => ({
  useAuthState: () => ({ merchant: { id: 'm1', nom: 'Café Atlas', logoUrl: 'https://x/logo.png' }, isTeamMember: false }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}(${Object.values(params).join(',')})` : key),
    locale: 'fr',
    isRTL: false,
  }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    bg: '#fff', bgCard: '#fff', bgInput: '#fff', bgElevated: '#fff', text: '#0f172a', textSecondary: '#334155',
    textMuted: '#64748b', primary: '#7c3aed', border: '#e2e8f0', borderLight: '#f1f5f9', danger: '#ef4444', warning: '#f59e0b',
  }),
  palette: { gold: '#FCD34D', violet: '#7C3AED', violetDark: '#5B21B6' },
}));
jest.mock('@/hooks/useQueryHooks', () => ({
  useBroadcastStatus: () => ({ data: mockStatus }),
  useCheckNotificationContent: () => ({ mutateAsync: mockCheckContent, isPending: false }),
  useSendPushNotification: () => ({ mutateAsync: mockSendPush, isPending: false }),
}));
jest.mock('@/components/demo/DemoVideoButton', () => ({ DemoVideoButton: () => null }));
jest.mock('@/components/ReminderBanner', () => ({ ReminderBanner: () => null }));
jest.mock('@/components/MerchantLogo', () => () => null);

const OPEN_STATUS: BroadcastStatus = { recipientCount: 120, dailyLimit: 3, remaining: 2, nextSendAt: null };

function setup() {
  const view = render(<MessagesScreen />);
  const type = (title: string, body: string) => {
    fireEvent.changeText(view.getByLabelText('messages.messageTitle'), title);
    fireEvent.changeText(view.getByLabelText('messages.messageBody'), body);
  };
  return { ...view, type };
}

describe('notification send screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = OPEN_STATUS;
    mockCheckContent.mockResolvedValue(undefined);
    mockSendPush.mockResolvedValue({ recipientCount: 120, successCount: 120, failureCount: 0 });
  });

  it('shows what is left of the daily quota', () => {
    const { getByText } = setup();
    expect(getByText('messages.quotaLeft(2,3)')).toBeTruthy();
  });

  it('does not check or send an incomplete message', async () => {
    const { getByText, type, queryByText } = setup();
    type('Promo', '');
    await act(async () => { fireEvent.press(getByText('messages.sendToAll')); });
    expect(mockCheckContent).not.toHaveBeenCalled();
    expect(queryByText('messages.confirmSheetTitle')).toBeNull();
  });

  it('reports a refused content next to the fields, before any recap', async () => {
    mockCheckContent.mockRejectedValue({ response: { status: 400, data: { message: 'Termes interdits' } } });
    const { getByText, type, queryByText } = setup();
    type('Promo', 'Envoyez votre mot de passe');
    await act(async () => { fireEvent.press(getByText('messages.sendToAll')); });
    expect(getByText('Termes interdits')).toBeTruthy();
    expect(queryByText('messages.confirmSheetTitle')).toBeNull();
    // Editing the text withdraws the refusal.
    type('Promo', 'Bonjour');
    expect(queryByText('Termes interdits')).toBeNull();
  });

  it('recaps with the customer count, sends the trimmed text, then empties the form', async () => {
    const { getByText, getByLabelText, type } = setup();
    type('  Promo ', ' Bonjour  ');
    await act(async () => { fireEvent.press(getByText('messages.sendToAll')); });
    expect(mockCheckContent).toHaveBeenCalledWith({ title: 'Promo', body: 'Bonjour' });
    expect(getByText('messages.audienceCount_other(120)')).toBeTruthy();

    await act(async () => { fireEvent.press(getByText('messages.sendNow')); });

    expect(mockSendPush).toHaveBeenCalledTimes(1);
    expect(mockSendPush).toHaveBeenCalledWith({ title: 'Promo', body: 'Bonjour' });
    await waitFor(() => expect(getByText('messages.pushSuccessBody_other(120)')).toBeTruthy());
    expect(getByLabelText('messages.messageTitle').props.value).toBe('');
  });

  it('still reaches the recap when the content check itself is unavailable', async () => {
    mockCheckContent.mockRejectedValue(new Error('Network Error'));
    const { getByText, type } = setup();
    type('Promo', 'Bonjour');
    await act(async () => { fireEvent.press(getByText('messages.sendToAll')); });
    expect(getByText('messages.confirmSheetTitle')).toBeTruthy();
  });

  it('keeps the recap open and explains a failed send', async () => {
    mockSendPush.mockRejectedValue({ response: { status: 429, data: { code: 'PUSH_DAILY_LIMIT', message: 'Limite atteinte' } } });
    const { getByText, type } = setup();
    type('Promo', 'Bonjour');
    await act(async () => { fireEvent.press(getByText('messages.sendToAll')); });
    await act(async () => { fireEvent.press(getByText('messages.sendNow')); });
    expect(getByText('Limite atteinte')).toBeTruthy();
    expect(getByText('messages.confirmSheetTitle')).toBeTruthy();
  });

  it('blocks the send once the daily quota is spent', async () => {
    mockStatus = { recipientCount: 120, dailyLimit: 3, remaining: 0, nextSendAt: '2026-11-12T09:30:00.000Z' };
    const { getByText, type, queryByText } = setup();
    expect(queryByText(/^messages\.quotaReached\(3,/)).toBeTruthy();
    type('Promo', 'Bonjour');
    await act(async () => { fireEvent.press(getByText('messages.sendToAll')); });
    expect(mockCheckContent).not.toHaveBeenCalled();
  });
});
