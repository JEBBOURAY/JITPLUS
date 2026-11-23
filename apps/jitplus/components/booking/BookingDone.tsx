import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { CalendarCheck, Hourglass, QrCode } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, wp } from '@/utils/responsive';
import BookingRecapCard from './BookingRecapCard';
import { BookingBottomBar, BookingPrimaryButton, bookingStyles } from './BookingParts';

interface Props {
  /** PENDING: the shop still has to accept the request. */
  pending: boolean;
  booking: ComponentProps<typeof BookingRecapCard>;
  onViewBooking: () => void;
  onDone: () => void;
}

/** Last step: booked (or requested), the recap, and a reminder to show the QR code at the shop. */
export default function BookingDone({ pending, booking, onViewBooking, onDone }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const tint = pending ? theme.warning : theme.success;
  return (
    <>
      <ScrollView contentContainerStyle={[bookingStyles.scrollBody, styles.doneBody]} showsVerticalScrollIndicator={false}>
        <View style={[styles.doneIcon, { backgroundColor: `${tint}18` }]}>
          {pending
            ? <Hourglass size={ms(34)} color={tint} strokeWidth={1.8} />
            : <CalendarCheck size={ms(34)} color={tint} strokeWidth={1.8} />}
        </View>
        <Text style={[styles.doneTitle, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">
          {pending ? t('booking.donePendingTitle') : t('booking.doneConfirmedTitle')}
        </Text>
        <Text style={[styles.doneBodyText, { color: theme.textSecondary, fontFamily: fonts.regular }]}>
          {pending ? t('booking.donePendingBody') : t('booking.doneConfirmedBody')}
        </Text>

        <BookingRecapCard {...booking} />

        <View style={[styles.qrHint, { backgroundColor: `${palette.violet}10` }]}>
          <QrCode size={ms(18)} color={palette.violet} strokeWidth={2} />
          <Text style={[styles.qrHintText, { color: theme.textSecondary, fontFamily: fonts.medium }]}>{t('booking.qrReminder')}</Text>
        </View>
      </ScrollView>

      <BookingBottomBar style={styles.doneActions}>
        <BookingPrimaryButton label={t('booking.viewBooking')} onPress={onViewBooking} />
        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: theme.border }]}
          onPress={onDone}
          activeOpacity={0.8}
          accessibilityRole="button"
        >
          <Text style={[styles.secondaryText, { color: theme.text, fontFamily: fonts.semibold }]}>{t('booking.done')}</Text>
        </TouchableOpacity>
      </BookingBottomBar>
    </>
  );
}

const styles = StyleSheet.create({
  doneBody: { alignItems: 'stretch', paddingTop: hp(16) },
  doneIcon: { alignSelf: 'center', width: ms(76), height: ms(76), borderRadius: ms(24), alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: ms(22), textAlign: 'center', marginTop: hp(6) },
  doneBodyText: { fontSize: ms(14), lineHeight: ms(21), textAlign: 'center', marginBottom: hp(8) },
  qrHint: { flexDirection: 'row', alignItems: 'center', gap: wp(10), borderRadius: 14, padding: wp(14), marginTop: hp(4) },
  qrHintText: { flex: 1, fontSize: ms(13), lineHeight: ms(19), textAlign: 'left' },
  secondaryBtn: { borderWidth: 1, borderRadius: ms(14), paddingVertical: hp(13), alignItems: 'center' },
  secondaryText: { fontSize: ms(15) },
  doneActions: { gap: hp(10) },
});
