import { render, fireEvent } from '@testing-library/react-native';
import DemoVideosScreen from '@/app/demo-videos';
import fr from '@/i18n/locales/fr';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    bg: '#fff', bgCard: '#fff', border: '#e2e8f0', text: '#0f172a', textSecondary: '#334155',
    primary: '#7c3aed', primaryBg: '#ede9fe',
  }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));
jest.mock('@/hooks/useDir', () => ({
  useDir: () => ({ row: 'row', textAlign: 'left', alignStart: 'flex-start', isRTL: false, flip: undefined }),
}));
jest.mock('@/hooks/useRequireAuth', () => ({ useRequireAuth: () => false }));
jest.mock('@/utils/haptics', () => ({ hapticLight: jest.fn() }));
jest.mock('@/components/demo/DemoVideoModal', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    DemoVideoModal: function MockDemoVideoModal({ id }: { id: string }) {
      return <Text>{`playing:${id}`}</Text>;
    },
  };
});

describe('demo videos screen', () => {
  it('lists one row per demo clip, each with a translated title', () => {
    const ids = Object.keys(fr.demoVideos.items);
    const { getAllByRole } = render(<DemoVideosScreen />);
    const rows = getAllByRole('button').filter((b) => String(b.props.accessibilityLabel).startsWith('demo.watch'));
    expect(rows).toHaveLength(ids.length);
    expect(rows.map((r) => String(r.props.accessibilityLabel).split('demoVideos.items.')[1]).sort()).toEqual([...ids].sort());
  });

  it('plays the clip of the row that is pressed', () => {
    const { getByRole, getByText, queryByText } = render(<DemoVideosScreen />);
    expect(queryByText(/^playing:/)).toBeNull();
    fireEvent.press(getByRole('button', { name: 'demo.watch, demoVideos.items.scanner' }));
    expect(getByText('playing:scanner')).toBeTruthy();
  });

  it('ticks a clip once it has been opened', () => {
    const { getByRole } = render(<DemoVideosScreen />);
    const row = () => getByRole('button', { name: 'demo.watch, demoVideos.items.caisse' });
    expect(row().props.accessibilityState).toEqual({ checked: false });
    fireEvent.press(row());
    expect(row().props.accessibilityState).toEqual({ checked: true });
  });

  it('has no back arrow: the system back gesture is the way out', () => {
    const { queryByRole } = render(<DemoVideosScreen />);
    expect(queryByRole('button', { name: 'common.back' })).toBeNull();
  });
});
