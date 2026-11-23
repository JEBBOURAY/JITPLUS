import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { CalendarDays } from 'lucide-react-native';

import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import TabbedListScreen from '@/components/TabbedListScreen';
import BookingRow from '@/components/booking/BookingRow';
import { useClientBookings } from '@/hooks/useBookingHooks';
import type { ClientBookingScope } from '@/services/api/booking';
import type { ClientBooking } from '@jitplus/shared/src/booking';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const TABS: { key: ClientBookingScope; labelKey: string }[] = [
  { key: 'upcoming', labelKey: 'booking.tabUpcoming' },
  { key: 'past', labelKey: 'booking.tabPast' },
];

const keyOf = (b: ClientBooking) => b.id;

export default function BookingsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState<ClientBookingScope>('upcoming');

  const query = useClientBookings(tab, isAuthenticated);
  const bookings = useMemo(() => query.data ?? [], [query.data]);

  const openBooking = useCallback((b: ClientBooking) => {
    router.push({ pathname: '/bookings/[id]', params: { id: b.id } });
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: ClientBooking }) => <BookingRow booking={item} onPress={openBooking} />,
    [openBooking],
  );

  // Signed out (logout in progress): the root layout is already leaving for the login screen.
  if (!isAuthenticated) return null;

  return (
    <TabbedListScreen
      title={t('booking.myBookings')}
      tabs={TABS}
      tab={tab}
      onTabChange={setTab}
      query={query}
      data={bookings}
      keyExtractor={keyOf}
      renderItem={renderItem}
      errorText={t('booking.listError')}
      emptyIcon={CalendarDays}
      emptyText={tab === 'upcoming' ? t('booking.emptyUpcoming') : t('booking.emptyPast')}
      emptyHint={tab === 'upcoming' ? t('booking.emptyUpcomingHint') : null}
    />
  );
}
