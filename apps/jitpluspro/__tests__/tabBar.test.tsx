import { render, fireEvent } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import CustomTabBar from '@/components/CustomTabBar';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', bgCard: '#111', border: '#333', primary: '#a78bfa', primaryBg: '#222', textMuted: '#aaa' }),
  palette: { violet: '#7c3aed' },
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));
jest.mock('@/components/WhatsAppLogo', () => () => null);
const mockPush = jest.fn();
let mockPremium = true;
jest.mock('@/stores/authStore', () => ({ useAuthStore: (sel: (s: { merchant: null }) => unknown) => sel({ merchant: null }) }));
jest.mock('@/hooks/usePlanStatus', () => ({ usePlanStatus: () => ({ isPremium: mockPremium }) }));
jest.mock('@/components/PremiumLockModal', () => {
  const { Text } = jest.requireActual('react-native');
  return function MockPremiumLockModal({ visible, titleKey }: { visible: boolean; titleKey: string }) {
    return visible ? <Text>{titleKey}</Text> : null;
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const routes = ['index', 'clients', 'transactions'].map((name) => ({ name, key: name }));
const makeProps = (index = 0) => ({
  state: { index, routes },
  emitter: { emit: jest.fn(() => ({ defaultPrevented: false })) },
  navigateToTab: jest.fn(),
} as unknown as BottomTabBarProps);

describe('tab navigation', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockPremium = true;
  });

  it('keeps clients and scanning reachable after removing animated decoration', () => {
    const props = makeProps();
    const { getByRole } = render(<CustomTabBar {...props} />);
    fireEvent.press(getByRole('button', { name: 'tabs.clients' }));
    expect(props.navigateToTab).toHaveBeenCalledWith('clients');
    fireEvent.press(getByRole('button', { name: 'tabs.scan' }));
    expect(mockPush).toHaveBeenCalledWith('/scan-qr');
  });

  it('switches to transactions as a tab and opens the dashboard as a full screen', () => {
    const props = makeProps();
    const { getByRole } = render(<CustomTabBar {...props} />);
    fireEvent.press(getByRole('button', { name: 'tabs.transactions' }));
    expect(props.navigateToTab).toHaveBeenCalledWith('transactions');
    expect(mockPush).not.toHaveBeenCalledWith('/transactions');
    fireEvent.press(getByRole('button', { name: 'tabs.dashboard' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the upgrade sheet instead of the statistics on a free account', () => {
    mockPremium = false;
    const { getByRole, getByText, queryByText } = render(<CustomTabBar {...makeProps()} />);
    expect(queryByText('account.dashboardLockedTitle')).toBeNull();
    fireEvent.press(getByRole('button', { name: 'tabs.dashboard' }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(getByText('account.dashboardLockedTitle')).toBeTruthy();
  });

  it('shows the WhatsApp support button on Accueil only', () => {
    const home = render(<CustomTabBar {...makeProps(0)} />);
    expect(home.getByRole('button', { name: 'account.contactViaWhatsApp' })).toBeTruthy();
    expect(home.queryByRole('button', { name: 'account.contactViaEmail' })).toBeNull();
    home.unmount();

    const clients = render(<CustomTabBar {...makeProps(1)} />);
    expect(clients.queryByRole('button', { name: 'account.contactViaWhatsApp' })).toBeNull();
  });
});
