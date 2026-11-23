import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { bookingStatusTone } from '@/utils/booking';
import { hp, ms, wp } from '@/utils/responsive';
import type { BookingStatus } from '@jitplus/shared/src/booking';

/** Coloured pill with the booking status ("Confirmé", "En attente"…). */
function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();
  const tone = bookingStatusTone(status);
  const color = tone === 'success' ? theme.success
    : tone === 'warning' ? theme.warning
    : tone === 'danger' ? theme.danger
    : theme.textMuted;

  return (
    <View style={[styles.pill, { backgroundColor: `${color}18` }]}>
      <Text style={[styles.text, { color, fontFamily: fonts.semibold }]} numberOfLines={1}>
        {t(`booking.status.${status}`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: wp(10), paddingVertical: hp(3), borderRadius: 999 },
  text: { fontSize: ms(11) },
});

export default memo(BookingStatusBadge);
