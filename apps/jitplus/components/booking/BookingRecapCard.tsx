import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { formatBookingDay } from '@/utils/booking';
import { hp, ms, wp } from '@/utils/responsive';
import { formatMoney } from '@jitplus/shared/src/currency';
import { formatBookingTime, formatDuration } from '@jitplus/shared/src/booking';
import { BookingMerchantStrip } from './BookingParts';

interface Props {
  merchant?: { logoUrl?: string | null; nomBoutique: string } | null;
  serviceName: string;
  startsAt: string;
  timeZone: string;
  durationMin?: number;
  price: number | null;
  currency?: string;
}

/** The shop, service, day, time, duration and price of a booking (recap and confirmation). */
export default function BookingRecapCard({ merchant, serviceName, startsAt, timeZone, durationMin, price, currency }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  return (
    <View style={[styles.recapCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      <BookingMerchantStrip merchant={merchant} />
      <Text style={[styles.recapService, { color: theme.text, fontFamily: fonts.bold }]}>{serviceName}</Text>
      <RecapLine label={t('booking.recapDate')} value={formatBookingDay(startsAt, timeZone, locale)} />
      <RecapLine label={t('booking.recapTime')} value={formatBookingTime(startsAt, timeZone)} />
      {durationMin != null && <RecapLine label={t('booking.recapDuration')} value={formatDuration(durationMin, t)} />}
      {price != null && (
        <RecapLine label={t('booking.recapPrice')} value={t('booking.priceFrom', { price: formatMoney(price, currency, locale) })} />
      )}
    </View>
  );
}

function RecapLine({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const fonts = useAppFonts();
  return (
    <View style={styles.recapLine}>
      <Text style={[styles.recapLabel, { color: theme.textMuted, fontFamily: fonts.medium }]}>{label}</Text>
      <Text style={[styles.recapValue, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  recapCard: { borderRadius: 16, borderWidth: 1, padding: wp(16), gap: hp(8) },
  recapService: { fontSize: ms(18), marginTop: hp(4), textAlign: 'left' },
  recapLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: wp(12) },
  recapLabel: { fontSize: ms(13) },
  recapValue: { flex: 1, fontSize: ms(14), textAlign: 'right', textTransform: 'none' },
});
