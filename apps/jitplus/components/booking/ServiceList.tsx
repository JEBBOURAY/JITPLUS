import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, Clock } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, wp } from '@/utils/responsive';
import { formatMoney } from '@jitplus/shared/src/currency';
import { formatDuration, type MerchantBookingOffer } from '@jitplus/shared/src/booking';
import { bookingStyles } from './BookingParts';

interface Props {
  services: MerchantBookingOffer['services'];
  selectedId?: string;
  currency?: string;
  onPick: (id: string) => void;
}

/** Step 1 of the booking: one radio card per service (name, description, duration, price). */
export default memo(function ServiceList({ services, selectedId, currency, onPick }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  return (
    <View style={styles.list}>
      {services.map((s) => {
        const active = s.id === selectedId;
        return (
          <Pressable
            key={s.id}
            onPress={() => onPick(s.id)}
            style={({ pressed }) => [
              styles.serviceCard,
              { backgroundColor: theme.bgCard, borderColor: active ? palette.violet : theme.borderLight },
              pressed && bookingStyles.pressed,
            ]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
          >
            <View style={styles.serviceText}>
              <Text style={[styles.serviceName, { color: theme.text, fontFamily: fonts.semibold }]}>{s.nom}</Text>
              {!!s.description && (
                <Text style={[styles.serviceDesc, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={2}>
                  {s.description}
                </Text>
              )}
              <View style={styles.serviceMetaRow}>
                <Clock size={ms(13)} color={theme.textMuted} strokeWidth={2} />
                <Text style={[styles.serviceMeta, { color: theme.textSecondary, fontFamily: fonts.medium }]}>
                  {formatDuration(s.durationMin, t)}
                  {s.priceFrom != null ? `  ·  ${t('booking.priceFrom', { price: formatMoney(s.priceFrom, currency, locale) })}` : ''}
                </Text>
              </View>
            </View>
            <View style={[styles.radio, { borderColor: active ? palette.violet : theme.border, backgroundColor: active ? palette.violet : 'transparent' }]}>
              {active && <Check size={ms(13)} color="#fff" strokeWidth={3} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  list: { gap: hp(10) },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: wp(12), borderRadius: 16, borderWidth: 1.5, padding: wp(14) },
  serviceText: { flex: 1, gap: 3 },
  serviceName: { fontSize: ms(15), textAlign: 'left' },
  serviceDesc: { fontSize: ms(12), lineHeight: ms(17), textAlign: 'left' },
  serviceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: wp(5), marginTop: 2 },
  serviceMeta: { fontSize: ms(12) },
  radio: { width: ms(22), height: ms(22), borderRadius: ms(11), borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
