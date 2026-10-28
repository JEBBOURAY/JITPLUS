import { render, fireEvent } from '@testing-library/react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import GamesScreen from '@/app/games';
import fr from '@/i18n/locales/fr';
import en from '@/i18n/locales/en';
import ar from '@/i18n/locales/ar';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useRequireAuth', () => ({ useRequireAuth: jest.fn(() => false) }));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: jest.fn(() => ({ t: (key: string) => key, isRTL: false })),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  palette: {
    gold: '#FCD34D', charbon: '#1F2937', violetLight: '#A78BFA',
    premiumBadgeBg: '#7C3AED28', premiumBadgeBorder: '#7C3AED55',
  },
  useTheme: () => ({
    bg: '#fff', bgCard: '#fff', bgElevated: '#f8fafc', bgInput: '#f1f5f9',
    text: '#0f172a', textSecondary: '#334155', textMuted: '#64748b',
    primary: '#7c3aed', primaryBg: '#ede9fe', border: '#e2e8f0',
  }),
}));

describe('GamesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useRequireAuth).mockReturnValue(false);
    jest.mocked(useLanguage).mockReturnValue({
      t: (key: string) => key,
      isRTL: false,
    } as ReturnType<typeof useLanguage>);
  });

  it('lists the lucky wheel and the scratch card', () => {
    const { getByText } = render(<GamesScreen />);
    expect(getByText('games.title')).toBeTruthy();
    expect(getByText('games.wheelTitle')).toBeTruthy();
    expect(getByText('games.scratchTitle')).toBeTruthy();
    expect(getByText('games.scratchDescription')).toBeTruthy();
  });

  it('opens the existing lucky wheel screen', () => {
    const { getByRole } = render(<GamesScreen />);
    fireEvent.press(getByRole('button', { name: 'games.wheelTitle, games.premium' }));
    expect(mockPush).toHaveBeenCalledWith('/lucky-wheel');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('opens the scratch card campaigns', () => {
    const { getByRole } = render(<GamesScreen />);
    fireEvent.press(getByRole('button', { name: 'games.scratchTitle, games.premium' }));
    expect(mockPush).toHaveBeenCalledWith('/scratch-campaigns');
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('returns to the previous screen', () => {
    const { getByRole } = render(<GamesScreen />);
    fireEvent.press(getByRole('button', { name: 'common.back' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('does not show protected content while authentication is pending', () => {
    jest.mocked(useRequireAuth).mockReturnValue(true);
    const { toJSON } = render(<GamesScreen />);
    expect(toJSON()).toBeNull();
  });

  it.each([
    ['fr', fr, false],
    ['en', en, false],
    ['ar', ar, true],
  ] as const)('renders translated game categories in %s', (_locale, translations, isRTL) => {
    jest.mocked(useLanguage).mockReturnValue({
      t: (key: string) => key.startsWith('games.')
        ? translations.games[key.slice(6) as keyof typeof translations.games]
        : key,
      isRTL,
    } as ReturnType<typeof useLanguage>);
    const { getByText } = render(<GamesScreen />);
    expect(getByText(translations.games.title)).toBeTruthy();
    expect(getByText(translations.games.wheelTitle)).toBeTruthy();
    expect(getByText(translations.games.scratchTitle)).toBeTruthy();
    expect(translations.home.qaGames).toBe(translations.games.title);
  });
});
