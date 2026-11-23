import { render, fireEvent } from '@testing-library/react-native';
import AgendaScreen from '@/app/agenda/index';
import { wallTimeToIso, ymdIn } from '@/utils/bookingTime';
import type { MerchantBooking } from '@jitplus/shared/src/booking';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
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
  // Static palette read at module load by shared primitives (ProBadge via GameList).
  palette: new Proxy({}, { get: () => '#000000' }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, isRTL: false, locale: 'fr' }),
}));
jest.mock('@/hooks/useRequireAuth', () => ({ useRequireAuth: () => false }));
jest.mock('@/components/demo/DemoVideoButton', () => {
  const { Text } = jest.requireActual('react-native');
  return { DemoVideoButton: () => <Text>demo.watch</Text> };
});
let mockAuth = { isTeamMember: false, merchant: { id: 'm1', countryCode: 'MA' } };
jest.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: typeof mockAuth) => unknown) => select(mockAuth),
}));

const tz = 'Africa/Casablanca';
const today = ymdIn(new Date(), tz);
const mockBooking = (id: string, status: MerchantBooking['status'], minutes: number): MerchantBooking => ({
  id,
  status,
  source: 'APP',
  startsAt: wallTimeToIso(today, minutes, tz),
  endsAt: wallTimeToIso(today, minutes + 30, tz),
  blockedUntil: wallTimeToIso(today, minutes + 30, tz),
  serviceId: 's1',
  serviceName: 'Coupe',
  price: 80,
  note: null,
  client: { id: 'c1', prenom: 'Amine', nom: null, telephone: null, member: true },
  stampsGiven: false,
  clientName: null,
  clientPhone: null,
  cancelReason: null,
  createdAt: new Date().toISOString(),
});

let mockServices = [{ id: 's1' }];
const mockMutate = jest.fn();
let mockAction: { mutate: jest.Mock; isPending: boolean; variables?: { id: string } } = { mutate: mockMutate, isPending: false };
const mockPendingBooking = mockBooking('b-pending', 'PENDING', 23 * 60);
jest.mock('@/hooks/queries/booking', () => ({
  useBookingSetup: () => ({
    data: { settings: { enabled: true }, timeZone: 'Africa/Casablanca', services: mockServices },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useBookingAgenda: () => ({
    data: { bookings: [mockBooking('b1', 'CONFIRMED', 10 * 60), mockPendingBooking], exceptions: [] },
    isLoading: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  }),
  usePendingBookings: () => ({ data: [mockPendingBooking], isRefetching: false, refetch: jest.fn() }),
  useBookingAction: () => mockAction,
  usePrefetchAgenda: () => jest.fn(),
}));

describe('Agenda screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServices = [{ id: 's1' }];
    mockAction = { mutate: mockMutate, isPending: false };
    mockAuth = { isTeamMember: false, merchant: { id: 'm1', countryCode: 'MA' } };
  });

  it('lists the pending requests and accepts one', () => {
    const { getByText, getAllByText } = render(<AgendaScreen />);
    expect(getByText('booking.pending.title')).toBeTruthy();
    // The request shows in the pending block and in the day list.
    expect(getAllByText('Amine').length).toBeGreaterThanOrEqual(2);
    fireEvent.press(getByText('booking.actions.confirm'));
    expect(mockMutate).toHaveBeenCalledWith({ id: 'b-pending', action: 'confirm' }, expect.any(Object));
  });

  it('sends one answer at a time', () => {
    mockAction = { mutate: mockMutate, isPending: true, variables: { id: 'other' } };
    const { getByRole } = render(<AgendaScreen />);
    expect(getByRole('button', { name: 'booking.actions.decline' }).props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(getByRole('button', { name: 'booking.actions.decline' }));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('opens a booking and the quick add', () => {
    const { getByRole } = render(<AgendaScreen />);
    fireEvent.press(getByRole('button', { name: 'booking.new.title' }));
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/agenda/new', params: { date: today } });
  });

  it('keeps only the demo in the header and the actions at the bottom', () => {
    const { getByRole, getByText } = render(<AgendaScreen />);
    expect(getByText('demo.watch')).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'booking.settings' }));
    expect(mockPush).toHaveBeenLastCalledWith('/agenda/setup');
  });

  it('hides the settings from a team member', () => {
    mockAuth = { isTeamMember: true, merchant: { id: 'm1', countryCode: 'MA' } };
    const { getByRole, queryByRole } = render(<AgendaScreen />);
    expect(getByRole('button', { name: 'booking.new.title' })).toBeTruthy();
    expect(queryByRole('button', { name: 'booking.settings' })).toBeNull();
  });

  it('shows the setup invitation before any service exists', () => {
    mockServices = [];
    const { getByText } = render(<AgendaScreen />);
    fireEvent.press(getByText('booking.empty.cta'));
    expect(mockPush).toHaveBeenLastCalledWith('/agenda/setup');
  });

  it('tells a team member that only the owner sets it up', () => {
    mockServices = [];
    mockAuth = { isTeamMember: true, merchant: { id: 'm1', countryCode: 'MA' } };
    const { getByText, queryByText } = render(<AgendaScreen />);
    expect(getByText('booking.ownerOnlySetup')).toBeTruthy();
    expect(queryByText('booking.empty.cta')).toBeNull();
  });
});
