import { memo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { CalendarClock } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import MerchantLogo from '@/components/MerchantLogo';
import { DEFAULT_BOOKING_TZ } from '@/hooks/useBookingHooks';
import { formatBookingDay } from '@/utils/booking';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, wp } from '@/utils/responsive';
import { formatBookingTime, type ClientBooking } from '@jitplus/shared/src/booking';
import BookingStatusBadge from './BookingStatusBadge';

interface Props {
  booking: ClientBooking;
  onPress: (booking: ClientBooking) => void;
}

/** One appointment in a list: merchant, service, day and time, status. */
function BookingRow({ booking, onPress }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const tz = booking.timeZone || DEFAULT_BOOKING_TZ;
  const when = t('booking.dayAtTime', {
    day: formatBookingDay(booking.startsAt, tz, locale),
    time: formatBookingTime(booking.startsAt, tz),
  });
  const merchantName = booking.merchant.nom || t('common.shop');

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
      activeOpacity={0.75}
      onPress={() => onPress(booking)}
      accessibilityRole="button"
      accessibilityLabel={`${booking.serviceName}, ${merchantName}, ${when}, ${t(`booking.status.${booking.status}`)}`}
    >
      <MerchantLogo logoUrl={booking.merchant.logoUrl} merchantName={merchantName} style={styles.logo} />
      <View style={styles.info}>
        <Text style={[styles.merchant, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>
          {merchantName}
        </Text>
        <Text style={[styles.service, { color: theme.textSecondary, fontFamily: fonts.medium }]} numberOfLines={1}>
          {booking.serviceName}
        </Text>
        <View style={styles.whenRow}>
          <CalendarClock size={ms(13)} color={theme.textMuted} strokeWidth={2} />
          <Text style={[styles.when, { color: theme.textMuted, fontFamily: fonts.medium }]} numberOfLines={1}>{when}</Text>
        </View>
      </View>
      <BookingStatusBadge status={booking.status} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: wp(14), gap: wp(12) },
  logo: { width: ms(44), height: ms(44), borderRadius: ms(12) },
  info: { flex: 1, gap: 2 },
  merchant: { fontSize: ms(15), textAlign: 'left' },
  service: { fontSize: ms(12), textAlign: 'left' },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: wp(5), marginTop: hp(2) },
  when: { fontSize: ms(12), flexShrink: 1, textAlign: 'left' },
});

export default memo(BookingRow);
