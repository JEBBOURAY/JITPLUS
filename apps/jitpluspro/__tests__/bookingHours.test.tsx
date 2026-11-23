import { render, fireEvent } from '@testing-library/react-native';
import BookingHoursScreen from '@/app/agenda/hours';
import BookingSetupScreen from '@/app/agenda/setup';

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    mode: 'light', bg: '#fff', bgCard: '#fff', bgElevated: '#eee', bgInput: '#eee', border: '#ddd', borderLight: '#eee',
    text: '#111', textSecondary: '#444', textMuted: '#777', primary: '#7c3aed', primaryBg: '#f0e', inputBg: '#fff',
    inputBorder: '#ddd', inputPlaceholder: '#999', success: '#0a0', warning: '#d70', danger: '#d00',
  }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, isRTL: false, locale: 'fr' }),
}));
jest.mock('@/hooks/useRequireAuth', () => ({ useRequireAuth: () => false }));
jest.mock('@/hooks/useCurrency', () => ({ useMoney: () => ({ money: (n: number) => `${n}`, symbol: 'DH' }) }));
jest.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: { isTeamMember: boolean }) => unknown) => select({ isTeamMember: false }),
}));
jest.mock('@/components/stores/StoreUi', () => ({ OwnerOnlyNotice: () => null }));

const shopHours = [{ weekday: 1, startMin: 540, endMin: 1080 }];
const mockSetHours = jest.fn();
const mockSettings = jest.fn();
let mockSetup: Record<string, unknown>;
jest.mock('@/hooks/queries/booking', () => ({
  useBookingSetup: () => ({ data: mockSetup, isLoading: false, isError: false, refetch: jest.fn(), isRefetching: false }),
  useSetBookingHours: () => ({ mutate: mockSetHours, isPending: false }),
  useUpdateBookingSettings: () => ({ mutate: mockSettings, isPending: false }),
  useDeleteClosure: () => ({ mutate: jest.fn() }),
}));

const service = { id: 's1', nom: 'Coupe', durationMin: 30, priceFrom: null, isActive: true, templateId: null };
const setupWith = (over: Record<string, unknown>) => ({
  settings: { enabled: false, autoConfirm: true, minNoticeMinutes: 60, maxAdvanceDays: 30, cancelDeadlineHours: 2, slotStepMinutes: 15, noShowLimit: 3 },
  timeZone: 'Africa/Casablanca',
  services: [service],
  hours: [],
  templates: [],
  exceptions: [],
  openingHours: shopHours,
  ...over,
});

describe('booking hours', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSetup = setupWith({});
  });

  it('follows the opening hours by default and saves no hours of its own', () => {
    const { getByText } = render(<BookingHoursScreen />);
    fireEvent.press(getByText('common.save'));
    expect(mockSetHours).toHaveBeenCalledWith([], expect.any(Object));
  });

  it('starts different hours from the opening hours', () => {
    const { getByRole, getByText } = render(<BookingHoursScreen />);
    fireEvent.press(getByRole('radio', { name: 'booking.hours.customTitle. booking.hours.customDesc' }));
    fireEvent.press(getByText('common.save'));
    expect(mockSetHours).toHaveBeenCalledWith(shopHours, expect.any(Object));
  });

  it('asks for hours when the shop has none, with a ready-made week', () => {
    mockSetup = setupWith({ openingHours: [] });
    const { getByText, queryByRole } = render(<BookingHoursScreen />);
    expect(getByText('booking.hours.noShop')).toBeTruthy();
    expect(queryByRole('radio')).toBeNull();
    fireEvent.press(getByText('common.save'));
    expect(mockSetHours.mock.calls[0][0]).toHaveLength(5);
  });
});

describe('booking setup switch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('can be turned on with a service and the opening hours', () => {
    mockSetup = setupWith({});
    const { getByLabelText } = render(<BookingSetupScreen />);
    expect(getByLabelText('booking.setup.enabled').props.disabled).toBeFalsy();
  });

  it('stays off until hours exist', () => {
    mockSetup = setupWith({ openingHours: [] });
    const { getByLabelText, getByText } = render(<BookingSetupScreen />);
    expect(getByLabelText('booking.setup.enabled').props.disabled).toBe(true);
    expect(getByText('booking.hours.statusMissing')).toBeTruthy();
  });
});
