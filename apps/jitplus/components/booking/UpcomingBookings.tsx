import { memo, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { fontSize, hp, wp } from '@/utils/responsive';
import type { ClientBooking } from '@jitplus/shared/src/booking';
import BookingRow from './BookingRow';


/** RDV tab block: the next appointment(s), shown only when there are some; "Voir tout" opens the full list. */
function UpcomingBookings({ bookings, max = 2 }: { bookings: ClientBooking[]; max?: number }) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const router = useRouter();

  const openOne = useCallback((b: ClientBooking) => {
    haptic();
    router.push({ pathname: '/bookings/[id]', params: { id: b.id } });
  }, [router]);
  const openAll = useCallback(() => {
    haptic();
    router.push('/bookings');
  }, [router]);

  if (bookings.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
          {t('booking.homeTitle')}
        </Text>
        <TouchableOpacity onPress={openAll} hitSlop={10} accessibilityRole="button">
          <Text style={[styles.link, { color: theme.primary, fontFamily: fonts.semibold }]}>
            {t('booking.seeAll')}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={styles.list}>
        {bookings.slice(0, max).map((b) => <BookingRow key={b.id} booking={b} onPress={openOne} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same title row as every section of the RDV tab: 24 above, 12 below.
  wrap: { marginTop: hp(24) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: hp(12), gap: wp(12) },
  title: { flex: 1, fontSize: fontSize.lg, letterSpacing: -0.2, textAlign: 'left' },
  link: { fontSize: fontSize.sm },
  list: { gap: hp(10) },
});

export default memo(UpcomingBookings);
