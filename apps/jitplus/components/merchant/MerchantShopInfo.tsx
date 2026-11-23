import { memo, useState } from 'react';
import { View, Pressable, StyleSheet, LayoutAnimation } from 'react-native';
import { Text } from '@/components/AppText';
import { ChevronDown, ChevronUp, Clock, MapPin, Navigation, Phone } from 'lucide-react-native';
import { WEEK_DAYS, formatDaySlots, hasCoords, hasOpeningHours, toTel, weekDayOf } from '@jitplus/shared';
import { openDirections, openFirst } from '@jitplus/shared/src/openLinks';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { formatDistance } from '@/utils/distance';
import type { StoreWithDistance } from '@/utils/merchantStores';
import { wp, hp, ms, fontSize } from '@/utils/responsive';
import type { OpeningHours } from '@/types';
import FicheSection from './FicheSection';

interface Props {
  /** Nearest first. */
  stores: StoreWithDistance[];
  hours: OpeningHours | null | undefined;
  merchantName: string;
}

/**
 * Practical info as a maps listing shows it: one row per address (tap for
 * directions), then today's hours, which open onto the whole week. The open
 * status and the call/WhatsApp buttons are already at the top of the page.
 */
function MerchantShopInfo({ stores, hours, merchantName }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const [weekOpen, setWeekOpen] = useState(false);

  const showHours = hasOpeningHours(hours);
  if (stores.length === 0 && !showHours) return null;
  const multiple = stores.length > 1;
  const today = weekDayOf(new Date());
  const todaySlots = showHours ? formatDaySlots(hours![today]) : null;
  const Chevron = weekOpen ? ChevronUp : ChevronDown;

  const toggleWeek = () => {
    haptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setWeekOpen((v) => !v);
  };

  return (
    <FicheSection variant="list">
      {stores.map((store, i) => {
        const name = store.nom || merchantName;
        const address = store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ');
        const canNavigate = hasCoords(store);
        const tel = toTel(store.telephone);
        const meta = [address, multiple && store.distanceKm != null ? formatDistance(store.distanceKm) : null].filter(Boolean).join(' · ');
        // Without an address the name is the only line, so the row is never blank.
        const showName = multiple || !meta || (!!store.nom && store.nom !== merchantName);
        return (
          <Pressable
            key={store.id}
            onPress={() => {
              if (!hasCoords(store)) return;
              haptic();
              void openDirections(store.latitude, store.longitude, name);
            }}
            disabled={!canNavigate}
            style={({ pressed }) => [styles.row, i > 0 && [styles.divider, { borderTopColor: theme.border }], pressed && styles.pressed]}
            accessibilityRole={canNavigate ? 'button' : undefined}
            accessibilityLabel={canNavigate ? `${t('merchant.directions')} ${name}` : name}
          >
            <MapPin size={ms(20)} color={theme.textSecondary} strokeWidth={1.75} />
            <View style={styles.flex}>
              {showName && (
                <Text style={[styles.main, { color: theme.text, fontFamily: fonts.medium }]} numberOfLines={1}>{name}</Text>
              )}
              {!!meta && (
                <Text
                  style={showName
                    ? [styles.sub, { color: theme.textMuted, fontFamily: fonts.regular }]
                    : [styles.main, { color: theme.text, fontFamily: fonts.regular }]}
                  numberOfLines={2}
                >
                  {meta}
                </Text>
              )}
            </View>
            {multiple && !!tel && (
              <Pressable
                onPress={() => { haptic(); void openFirst([tel]); }}
                style={({ pressed }) => [styles.action, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel={`${t('merchant.call')} ${name}`}
                hitSlop={4}
              >
                <Phone size={ms(16)} color={theme.text} strokeWidth={1.75} />
              </Pressable>
            )}
            {multiple && canNavigate && (
              <View style={[styles.action, { borderColor: theme.border }]}>
                <Navigation size={ms(16)} color={theme.text} strokeWidth={1.75} />
              </View>
            )}
          </Pressable>
        );
      })}

      {showHours && (
        <View style={stores.length > 0 && [styles.divider, { borderTopColor: theme.border }]}>
          <Pressable
            onPress={toggleWeek}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityState={{ expanded: weekOpen }}
            accessibilityLabel={t('merchant.hoursTitle')}
          >
            <Clock size={ms(20)} color={theme.textSecondary} strokeWidth={1.75} />
            <Text style={[styles.main, styles.flex, { color: theme.text, fontFamily: fonts.regular }]} numberOfLines={1}>
              {`${t('merchant.today')} · ${todaySlots ?? t('merchant.dayClosed')}`}
            </Text>
            <Chevron size={ms(18)} color={theme.textMuted} strokeWidth={1.75} />
          </Pressable>

          {weekOpen && (
            <View style={styles.week}>
              {WEEK_DAYS.map((day) => {
                const isToday = day === today;
                const slots = formatDaySlots(hours![day]);
                const font = isToday ? fonts.semibold : fonts.regular;
                return (
                  <View key={day} style={styles.dayRow}>
                    <Text style={[styles.sub, { color: theme.text, fontFamily: font }]}>{t(`merchant.days.${day}`)}</Text>
                    <Text style={[styles.sub, styles.slots, { color: slots ? theme.text : theme.textMuted, fontFamily: font }]}>
                      {slots ?? t('merchant.dayClosed')}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </FicheSection>
  );
}

const ICON_GUTTER = ms(20) + wp(12);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: wp(12), minHeight: ms(48), paddingVertical: hp(10) },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  pressed: { opacity: 0.6 },
  main: { fontSize: fontSize.md, lineHeight: ms(20) },
  sub: { fontSize: fontSize.sm, lineHeight: ms(18) },
  action: { width: ms(44), height: ms(44), borderRadius: ms(22), borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  // Under the hours text, aligned past the icon like a maps listing.
  week: { paddingStart: ICON_GUTTER, paddingBottom: hp(10), gap: hp(6) },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', gap: wp(12) },
  slots: { flexShrink: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
});

export default memo(MerchantShopInfo);
