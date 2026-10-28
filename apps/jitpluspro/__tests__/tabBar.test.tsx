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
jest.mock('@/components/GuidedTour', () => ({ useTourTarget: () => null }));
jest.mock('@/components/WhatsAppLogo', () => () => null);

const routes = ['index', 'clients', 'scan', 'messages', 'team'].map((name) => ({ name, key: name }));
const makeProps = (index = 0) => ({
  state: { index, routes },
  emitter: { emit: jest.fn(() => ({ defaultPrevented: false })) },
  navigateToTab: jest.fn(),
} as unknown as BottomTabBarProps);

describe('tab navigation', () => {
  it('keeps clients and scanning reachable after removing animated decoration', () => {
    const props = makeProps();
    const { getByRole } = render(<CustomTabBar {...props} />);
    fireEvent.press(getByRole('button', { name: 'tabs.clients' }));
    expect(props.navigateToTab).toHaveBeenCalledWith('clients');
    fireEvent.press(getByRole('button', { name: 'tabs.scan' }));
    expect(props.navigateToTab).toHaveBeenCalledWith('scan');
  });

  it('exposes the team tab in place of help', () => {
    const props = makeProps();
    const { getByRole, queryByRole } = render(<CustomTabBar {...props} />);
    fireEvent.press(getByRole('button', { name: 'tabs.team' }));
    expect(props.emitter.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'tabPress', target: 'team' }));
    expect(queryByRole('button', { name: 'tabs.support' })).toBeNull();
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
