import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TipsCarousel from '@/components/TipsCarousel';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: { isTeamMember: boolean }) => unknown) => select({ isTeamMember: false }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, isRTL: false }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'light', primary: '#7c3aed', border: '#e2e8f0' }),
  palette: { gold: '#FCD34D', violet: '#7C3AED' },
}));
// The sheets are covered by their own tests; only the banners matter here.
jest.mock('@/components/home/WhyLoyaltySheet', () => () => null);
jest.mock('@/components/home/GamesGuideSheet', () => () => null);
jest.mock('@/components/home/ClientAppPitchSheet', () => () => null);
jest.mock('@/components/home/ClientShareSheet', () => () => null);
jest.mock('@/components/home/DealsGuideSheet', () => () => null);

const bannerTitles = (getAllByRole: ReturnType<typeof render>['getAllByRole']) =>
  getAllByRole('button').map((b) => String(b.props.accessibilityLabel).split('. ')[1]);

describe('Accueil promo carousel', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('follows the learning path: understand, customers, share, go further, deals', () => {
    const { getAllByRole } = render(<TipsCarousel />);
    expect(bannerTitles(getAllByRole)).toEqual([
      'home.promoWhyTitle',
      'home.promoClientTitle',
      'home.promoShareTitle',
      'home.promoGamesTitle',
      'home.promoDealsTitle',
    ]);
  });

  it('moves an opened banner to the end and keeps the others in order', async () => {
    const { getAllByRole, getByLabelText } = render(<TipsCarousel />);
    fireEvent.press(getByLabelText('home.promoWhyLabel. home.promoWhyTitle. home.promoWhyCta'));
    await waitFor(() =>
      expect(bannerTitles(getAllByRole)).toEqual([
        'home.promoClientTitle',
        'home.promoShareTitle',
        'home.promoGamesTitle',
        'home.promoDealsTitle',
        'home.promoWhyTitle',
      ]),
    );
    expect(JSON.parse((await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.PROMO_CARDS_READ)) ?? '[]')).toEqual(['why']);
  });
});
