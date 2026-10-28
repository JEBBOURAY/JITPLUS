import { render, fireEvent } from '@testing-library/react-native';
import WhyLoyaltySheet from '@/components/home/WhyLoyaltySheet';
import ClientAppPitchSheet from '@/components/home/ClientAppPitchSheet';
import ClientShareSheet from '@/components/home/ClientShareSheet';
import GamesGuideSheet from '@/components/home/GamesGuideSheet';
import DealsGuideSheet from '@/components/home/DealsGuideSheet';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: { merchant: { nom: string } }) => unknown) => select({ merchant: { nom: 'Café Atlas' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}(${Object.values(params).join(',')})` : key,
    isRTL: false,
  }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'light', bg: '#fff', bgCard: '#fff', text: '#0f172a', textSecondary: '#334155',
    textMuted: '#64748b', primary: '#7c3aed', border: '#e2e8f0',
  }),
  palette: { gold: '#FCD34D', violet: '#7C3AED', violetDark: '#5B21B6' },
}));

describe('Accueil promo sheets', () => {
  beforeEach(() => jest.clearAllMocks());

  it('article: runs the configure CTA', () => {
    const onConfigure = jest.fn();
    const { getByLabelText, queryByLabelText } = render(
      <WhyLoyaltySheet visible onClose={jest.fn()} onConfigure={onConfigure} />,
    );
    fireEvent.press(getByLabelText('home.whyCta'));
    expect(onConfigure).toHaveBeenCalledTimes(1);
    expect(queryByLabelText('common.gotIt')).toBeNull();
  });

  it('article: without access to settings, only offers to close', () => {
    const onClose = jest.fn();
    const { getByLabelText, queryByLabelText } = render(<WhyLoyaltySheet visible onClose={onClose} />);
    expect(queryByLabelText('home.whyCta')).toBeNull();
    fireEvent.press(getByLabelText('common.gotIt'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('client app pitch: CTA opens the sharing tools', () => {
    const onShare = jest.fn();
    const { getByLabelText } = render(<ClientAppPitchSheet visible onClose={jest.fn()} onShare={onShare} />);
    fireEvent.press(getByLabelText('home.clientPitchCta'));
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('games guide: covers both games and the CTA launches a game', () => {
    const onStart = jest.fn();
    const { getByLabelText, getByText } = render(
      <GamesGuideSheet visible onClose={jest.fn()} onStart={onStart} />,
    );
    expect(getByText('home.gamesGuideWheelStepsLabel'.toUpperCase())).toBeTruthy();
    expect(getByText('home.gamesGuideScratchStepsLabel'.toUpperCase())).toBeTruthy();
    expect(getByLabelText('home.gamesGuideChoice3 : home.gamesGuidePickScratch')).toBeTruthy();
    fireEvent.press(getByLabelText('home.gamesGuideCta'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('deals guide: shows an example deal and the CTA opens the creation', () => {
    const onCreate = jest.fn();
    const { getByLabelText, getByText } = render(<DealsGuideSheet visible onClose={jest.fn()} onCreate={onCreate} />);
    expect(getByText('home.dealsGuidePreviewExample')).toBeTruthy();
    fireEvent.press(getByLabelText('home.dealsGuideCta'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('deals guide: without the right to create, only offers to close', () => {
    const { getByLabelText, queryByLabelText } = render(<DealsGuideSheet visible onClose={jest.fn()} />);
    expect(queryByLabelText('home.dealsGuideCta')).toBeNull();
    expect(getByLabelText('common.gotIt')).toBeTruthy();
  });

  it('share: poster card closes the sheet and opens the PLV screen', () => {
    const onClose = jest.fn();
    const { getByLabelText, getByText } = render(<ClientShareSheet visible onClose={onClose} />);
    expect(getByText(/home\.clientShareSocialMessage\(Café Atlas/)).toBeTruthy();
    fireEvent.press(getByLabelText('home.clientSharePlvCta'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/client-app-qr');
  });
});
