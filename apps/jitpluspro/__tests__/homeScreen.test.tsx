import { render, fireEvent } from '@testing-library/react-native';
import { Platform } from 'react-native';
import HomeScreen from '@/app/(tabs)/index';
import { useGuideSheetStore } from '@/components/home/guideSheetStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('expo-router/react-navigation', () => ({ useIsFocused: () => true }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'light', bg: '#fff', bgCard: '#fff', border: '#e2e8f0', text: '#0f172a',
    textMuted: '#64748b', primary: '#7c3aed', danger: '#dc2626',
  }),
  palette: { violet: '#7C3AED', violetDeep: '#4C1D95', violetDark: '#5B21B6', heroMuted: '#ddd' },
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, isRTL: false, locale: 'fr' }),
}));

let mockAuth = { merchant: { id: 'm1', nom: 'Café Atlas', onboardingCompleted: true }, isTeamMember: false };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: typeof mockAuth) => unknown) => select(mockAuth),
}));
let mockPlan = { isPremium: true, isFreePlan: false, isTrial: false, daysRemaining: 0 };
jest.mock('@/hooks/usePlanStatus', () => ({ usePlanStatus: () => mockPlan }));
let mockRewards: { id: string }[] | undefined = [{ id: 'r1' }];
let mockUnread = 0;
jest.mock('@/hooks/useQueryHooks', () => ({
  useAdminNotifUnreadCount: () => ({ data: { count: mockUnread } }),
  useHomeStats: () => ({ data: undefined, isLoading: false, isRefetching: false, refetch: jest.fn() }),
  useRewards: () => ({ data: mockRewards }),
  usePendingBookingsCount: () => 0,
}));
jest.mock('@/hooks/useExitOnBack', () => ({ useExitOnBack: jest.fn() }));
jest.mock('@/hooks/usePersistedFlag', () => ({ usePersistedFlag: () => ({ value: true, setValue: jest.fn() }) }));
// Saved tool usage of the merchant; the real ranking runs on it.
let mockToolUsage: Record<string, { score: number; at: number }> = {};
const mockRecordToolUse = jest.fn();
jest.mock('@/hooks/useToolUsage', () => ({
  ...jest.requireActual('@/hooks/useToolUsage'),
  useToolUsage: () => ({ usage: mockToolUsage, record: mockRecordToolUse }),
}));

// Covered by their own tests; only the screen's wiring matters here.
jest.mock('@/components/home/HomeHero', () => () => null);
jest.mock('@/components/home/HomeGuide', () => () => null);
jest.mock('@/components/TipsCarousel', () => () => null);
jest.mock('@/components/NotificationPermissionSheet', () => () => null);
jest.mock('@/components/PremiumLockModal', () => () => null);
jest.mock('@/components/MerchantLogo', () => () => null);
jest.mock('@/components/demo/DemoVideoModal', () => ({ DemoVideoModal: () => null }));

describe('Accueil screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { merchant: { id: 'm1', nom: 'Café Atlas', onboardingCompleted: true }, isTeamMember: false };
    mockPlan = { isPremium: true, isFreePlan: false, isTrial: false, daysRemaining: 0 };
    mockRewards = [{ id: 'r1' }];
    mockUnread = 0;
    mockToolUsage = {};
    useGuideSheetStore.setState({ visible: false, progress: null });
  });

  it('greets the merchant and lists the eleven tools', () => {
    const { getByText, getAllByRole } = render(<HomeScreen />);
    expect(getByText('Café Atlas')).toBeTruthy();
    const tools = getAllByRole('button').filter((b) => String(b.props.accessibilityLabel).includes('Hint'));
    expect(tools).toHaveLength(11);
  });

  it('opens a tool, the account and the notifications', () => {
    const { getByRole } = render(<HomeScreen />);
    fireEvent.press(getByRole('button', { name: 'home.qaGames, home.toolGamesHint' }));
    expect(mockPush).toHaveBeenLastCalledWith('/games');
    fireEvent.press(getByRole('button', { name: 'home.openAccount' }));
    expect(mockPush).toHaveBeenLastCalledWith('/account');
    fireEvent.press(getByRole('button', { name: 'home.openNotifications' }));
    expect(mockPush).toHaveBeenLastCalledWith('/admin-notifications');
  });

  it('opens the step guide from its tool card', () => {
    const { getByRole } = render(<HomeScreen />);
    fireEvent.press(getByRole('button', { name: 'home.setupLabel, home.toolSetupHint' }));
    expect(useGuideSheetStore.getState().visible).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows the steps left on the guide card once the progress is known', () => {
    useGuideSheetStore.setState({ progress: { done: 4, total: 7 } });
    const several = render(<HomeScreen />);
    expect(several.getByRole('button', { name: 'home.setupLabel, home.toolSetupLeft_other' })).toBeTruthy();
    expect(several.getByText('4/7', { includeHiddenElements: true })).toBeTruthy();
    several.unmount();

    useGuideSheetStore.setState({ progress: { done: 6, total: 7 } });
    const one = render(<HomeScreen />);
    expect(one.getByRole('button', { name: 'home.setupLabel, home.toolSetupLeft_one' })).toBeTruthy();
    one.unmount();

    useGuideSheetStore.setState({ progress: { done: 7, total: 7 } });
    const done = render(<HomeScreen />);
    expect(done.getByRole('button', { name: 'home.setupLabel, home.toolSetupDone' })).toBeTruthy();
  });

  it('flags Fidélité for an owner without a reward, never for a team member', () => {
    mockRewards = [];
    const owner = render(<HomeScreen />);
    expect(owner.getByRole('button', { name: 'home.qaLoyalty, home.toolTodo' })).toBeTruthy();
    owner.unmount();

    mockAuth = { ...mockAuth, isTeamMember: true };
    const member = render(<HomeScreen />);
    expect(member.getByRole('button', { name: 'home.qaLoyalty, home.toolLoyaltyHint' })).toBeTruthy();
  });

  it('keeps the start guide first until it is finished, then last', () => {
    const toolKeys = (screen: ReturnType<typeof render>) =>
      screen.getAllByRole('button')
        .map((b) => String(b.props.accessibilityLabel))
        .filter((label) => label.includes('Hint') || label.startsWith('home.setupLabel'));

    useGuideSheetStore.setState({ progress: { done: 2, total: 7 } });
    const pending = render(<HomeScreen />);
    expect(toolKeys(pending)[0]).toMatch(/^home\.setupLabel/);
    pending.unmount();

    useGuideSheetStore.setState({ progress: { done: 7, total: 7 } });
    const done = render(<HomeScreen />);
    const labels = toolKeys(done);
    expect(labels[labels.length - 1]).toMatch(/^home\.setupLabel/);
  });

  it('orders the other tools by how often the merchant opens them', () => {
    const now = Date.now();
    mockToolUsage = { games: { score: 5, at: now }, team: { score: 2, at: now } };
    useGuideSheetStore.setState({ progress: { done: 2, total: 7 } });
    const { getAllByRole, getByRole } = render(<HomeScreen />);
    const labels = getAllByRole('button')
      .map((b) => String(b.props.accessibilityLabel))
      .filter((label) => label.includes('Hint') || label.startsWith('home.setupLabel'));
    expect(labels[0]).toMatch(/^home\.setupLabel/);
    expect(labels[1]).toBe('home.qaGames, home.toolGamesHint');
    expect(labels[2]).toBe('home.qaTeam, home.toolTeamHint');

    fireEvent.press(getByRole('button', { name: 'home.qaDeals, home.toolDealsHint' }));
    expect(mockRecordToolUse).toHaveBeenCalledWith('deals');
  });

  it('announces unread notifications on the bell', () => {
    mockUnread = 3;
    const { getByRole } = render(<HomeScreen />);
    expect(getByRole('button', { name: 'home.openNotifications' }).props.accessibilityValue).toEqual({ text: '3' });
  });

  describe('Pro teaser', () => {
    const originalOS = Platform.OS;
    afterEach(() => { Platform.OS = originalOS; });

    it('shows on a free plan only (Android)', () => {
      Platform.OS = 'android';
      const paid = render(<HomeScreen />);
      expect(paid.queryByText('home.proTeaserTitle')).toBeNull();
      paid.unmount();

      mockPlan = { isPremium: false, isFreePlan: true, isTrial: false, daysRemaining: 0 };
      const free = render(<HomeScreen />);
      expect(free.getByText('home.proTeaserTitle')).toBeTruthy();
    });

    it('never shows on iOS (App Store 3.1.1)', () => {
      Platform.OS = 'ios';
      mockPlan = { isPremium: false, isFreePlan: true, isTrial: false, daysRemaining: 0 };
      const free = render(<HomeScreen />);
      expect(free.queryByText('home.proTeaserTitle')).toBeNull();
    });
  });
});
