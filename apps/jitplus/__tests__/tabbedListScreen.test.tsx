import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Ticket } from 'lucide-react-native';
import TabbedListScreen from '@/components/TabbedListScreen';

const mockRouter = { canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, isRTL: false, locale: 'fr' }) }));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    bg: '#fff', bgCard: '#fff', border: '#ddd', borderLight: '#eee', text: '#111',
    textSecondary: '#333', textMuted: '#666', primary: '#7C3AED', bgSkeleton: '#eee', bgSkeletonHighlight: '#fff',
  }),
  palette: { violet: '#7C3AED' },
}));
jest.mock('@/components/Skeleton', () => () => null);

const TABS = [
  { key: 'active', labelKey: 'tab.active' },
  { key: 'used', labelKey: 'tab.used' },
] as const;

function setup(query: Partial<{ isLoading: boolean; isError: boolean }>, data: { id: string }[] = []) {
  const refetch = jest.fn();
  const onTabChange = jest.fn();
  const utils = render(
    <TabbedListScreen
      title="Mes coupons"
      tabs={TABS}
      tab="active"
      onTabChange={onTabChange}
      query={{ isLoading: false, isError: false, isRefetching: false, refetch, ...query }}
      data={data}
      keyExtractor={(x) => x.id}
      renderItem={({ item }) => <Text>{`row ${item.id}`}</Text>}
      errorText="Erreur de chargement"
      emptyIcon={Ticket}
      emptyText="Aucun coupon"
      emptyHint="Grattez une carte"
    />,
  );
  return { ...utils, refetch, onTabChange };
}

describe('TabbedListScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders rows, and switches tab on press', () => {
    const { getByText, onTabChange } = setup({}, [{ id: 'a' }, { id: 'b' }]);
    expect(getByText('row a')).toBeTruthy();
    fireEvent.press(getByText('tab.used'));
    expect(onTabChange).toHaveBeenCalledWith('used');
  });

  it('shows the empty state with its hint', () => {
    const { getByText } = setup({});
    expect(getByText('Aucun coupon')).toBeTruthy();
    expect(getByText('Grattez une carte')).toBeTruthy();
  });

  it('offers a retry on error', () => {
    const { getByText, refetch } = setup({ isError: true });
    fireEvent.press(getByText('common.retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('goes back when it can, and home when opened without history', () => {
    mockRouter.canGoBack.mockReturnValue(true);
    const first = setup({});
    fireEvent.press(first.getByLabelText('common.back'));
    expect(mockRouter.back).toHaveBeenCalled();
    first.unmount();

    mockRouter.canGoBack.mockReturnValue(false);
    const second = setup({});
    fireEvent.press(second.getByLabelText('common.back'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
