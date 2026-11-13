import { render, fireEvent } from '@testing-library/react-native';
import PostersScreen from '@/app/posters';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }) }));
jest.mock('@/hooks/useRequireAuth', () => ({ useRequireAuth: () => false }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, isRTL: false }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'light', bg: '#fff', bgCard: '#fff', text: '#0f172a', textSecondary: '#334155',
    textMuted: '#64748b', primary: '#7c3aed', border: '#e2e8f0',
  }),
}));

describe('PostersScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers the store poster and the social media poster, each on its own page', () => {
    const { getByLabelText } = render(<PostersScreen />);
    fireEvent.press(getByLabelText('home.clientPosterStore, home.clientPosterStoreDesc'));
    expect(mockPush).toHaveBeenLastCalledWith('/client-app-qr');
    fireEvent.press(getByLabelText('home.clientPosterSocial, home.clientPosterSocialDesc'));
    expect(mockPush).toHaveBeenLastCalledWith('/social-post');
  });
});
