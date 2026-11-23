import { Platform, Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { GameDetailMissing, useBackTo } from '@/components/games/GameScreen';
import { DiscoverPremiumButton } from '@/components/games/GameList';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: mockCanGoBack }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, isRTL: false }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  palette: { gold: '#FCD34D', violet: '#7C3AED', premiumBg: '#1F1235', charbonUltraLight: '#E5E7EB' },
  useTheme: () => ({
    bg: '#fff', bgCard: '#fff', bgElevated: '#f8fafc', bgInput: '#f1f5f9',
    text: '#0f172a', textSecondary: '#334155', textMuted: '#64748b',
    primary: '#7c3aed', border: '#e2e8f0', borderLight: '#f1f5f9',
    danger: '#dc2626', warning: '#d97706', success: '#16a34a',
  }),
}));

function BackButton({ to }: { to: '/deals' }) {
  const back = useBackTo(to);
  return <Text onPress={back}>back</Text>;
}

describe('GameDetailMissing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers to try again after a network error (no HTTP status)', () => {
    const refetch = jest.fn();
    const { getByText, queryByText } = render(
      <GameDetailMissing title="T" onBack={jest.fn()} ns="deals" query={{ error: new Error('Network Error'), refetch, isRefetching: false }} />,
    );
    expect(getByText('deals.wizard.loadError')).toBeTruthy();
    expect(queryByText('deals.detail.notFound')).toBeNull();
    fireEvent.press(getByText('common.retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('offers to try again after a server error', () => {
    const error = Object.assign(new Error('boom'), { response: { status: 503 } });
    const { getByText } = render(
      <GameDetailMissing title="T" onBack={jest.fn()} ns="scratch" query={{ error, refetch: jest.fn(), isRefetching: false }} />,
    );
    expect(getByText('scratch.wizard.loadError')).toBeTruthy();
  });

  it('says the campaign is gone on a 404 or when the list no longer has it', () => {
    const error = Object.assign(new Error('nope'), { response: { status: 404 } });
    const { getByText, queryByText, rerender } = render(
      <GameDetailMissing title="T" onBack={jest.fn()} ns="collection" query={{ error, refetch: jest.fn(), isRefetching: false }} />,
    );
    expect(getByText('collection.detail.notFound')).toBeTruthy();
    expect(queryByText('common.retry')).toBeNull();

    rerender(<GameDetailMissing title="T" onBack={jest.fn()} ns="luckyWheel" query={{ error: null, refetch: jest.fn(), isRefetching: false }} />);
    expect(getByText('luckyWheel.detail.notFound')).toBeTruthy();
  });
});

describe('useBackTo', () => {
  beforeEach(() => jest.clearAllMocks());

  it('goes back when there is history, else to the list', () => {
    const { getByText } = render(<BackButton to="/deals" />);
    fireEvent.press(getByText('back'));
    expect(mockBack).toHaveBeenCalledTimes(1);

    mockCanGoBack.mockReturnValueOnce(false);
    fireEvent.press(getByText('back'));
    expect(mockReplace).toHaveBeenCalledWith('/deals');
  });
});

describe('DiscoverPremiumButton', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS });
  });

  it('opens the plan page on Android', () => {
    Object.defineProperty(Platform, 'OS', { value: 'android' });
    const { getByText } = render(<DiscoverPremiumButton />);
    fireEvent.press(getByText('messages.discoverPremium'));
    expect(mockPush).toHaveBeenCalledWith('/plan');
  });

  it('is not shown on iOS (App Store 3.1.1)', () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios' });
    const { queryByText } = render(<DiscoverPremiumButton />);
    expect(queryByText('messages.discoverPremium')).toBeNull();
  });
});
