import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, I18nManager } from 'react-native';
import { Text } from '@/components/AppText';
import { Clock, MapPin, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { formatDaySlots, hasCoords, weekDayOf, type OpenStatus } from '@jitplus/shared';
import { openDirections } from '@jitplus/shared/src/openLinks';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import type { StoreWithDistance } from '@/utils/merchantStores';
import { wp, hp, ms } from '@/utils/responsive';
import type { OpeningHours } from '@/types';
import FicheSection from './FicheSection';

interface Props {
  hours: OpeningHours | null | undefined;
  status: OpenStatus | null;
  /** Nearest store first. */
  stores: StoreWithDistance[];
  merchantName: string;
  /** Opens the info tab. */
  onOpen: () => void;
}

function Row({ Icon, title, trailing, onPress, label }: {
  Icon: LucideIcon;
  title: string;
  trailing?: ReactNode;
  onPress?: () => void;
  label: string;
}) {
  const theme = useTheme();
  const fonts = useAppFonts();
  return (
    <Pressable
      onPress={onPress && (() => { haptic(); onPress(); })}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
    >
      <Icon size={ms(20)} color={theme.textSecondary} strokeWidth={1.8} />
      <Text style={[styles.title, { color: theme.text, fontFamily: fonts.regular }]} numberOfLines={2}>{title}</Text>
      {trailing}
    </Pressable>
  );
}

/**
 * Overview block: nearest address and today's hours. The open status and the
 * distance are already in the hero, so they are not repeated here.
 */
function MerchantInfoSummary({ hours, status, stores, merchantName, onOpen }: Props) {
  const { t } = useLanguage();
  const theme = useTheme();
  const store = stores[0];
  if (!status && !store) return null;

  const Chevron = I18nManager.isRTL ? ChevronLeft : ChevronRight;
  const todaySlots = hours ? formatDaySlots(hours[weekDayOf(new Date())]) : null;
  const storeName = store?.nom || merchantName;
  const address = store ? store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ') || storeName : '';
  const target = store && hasCoords(store) ? store : null;

  return (
    <FicheSection title={t('merchant.tabInfo')} action={{ label: t('merchant.seeAll'), onPress: onOpen }}>
      {store && (
        <Row
          Icon={MapPin}
          title={address}
          onPress={target ? () => { void openDirections(target.latitude, target.longitude, storeName); } : undefined}
          label={target ? `${t('merchant.directions')} ${storeName}` : address}
        />
      )}
      {status && (
        <Row
          Icon={Clock}
          title={`${t('merchant.today')} · ${todaySlots ?? t('merchant.dayClosed')}`}
          trailing={<Chevron size={ms(18)} color={theme.textMuted} strokeWidth={2} />}
          onPress={onOpen}
          label={t('merchant.hoursTitle')}
        />
      )}
    </FicheSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: wp(16), paddingVertical: hp(10) },
  pressed: { opacity: 0.6 },
  title: { flex: 1, fontSize: ms(15), lineHeight: ms(20) },
});

export default memo(MerchantInfoSummary);
