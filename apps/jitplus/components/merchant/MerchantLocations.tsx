import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MapPin, Navigation, Phone } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { formatDistance } from '@/utils/distance';
import { callPhone, openDirections } from '@/utils/merchantLinks';
import { hasCoords, type StoreWithDistance } from '@/utils/merchantStores';
import { wp, hp, ms } from '@/utils/responsive';
import MerchantSection from './MerchantSection';

interface Props {
  stores: StoreWithDistance[];
  merchantName: string;
  accent: string;
}

function MerchantLocations({ stores, merchantName, accent }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();

  if (stores.length === 0) return null;
  const multiple = stores.length > 1;

  return (
    <MerchantSection
      title={multiple ? t('merchant.otherLocationsTitle') : t('merchant.locationTitle')}
      icon={MapPin}
      accent={accent}
      right={multiple ? (
        <Text style={[styles.count, { color: theme.textMuted, fontFamily: fonts.semibold }]}>{stores.length}</Text>
      ) : undefined}
    >
      <View style={styles.list}>
        {stores.map((store, i) => {
          const name = store.nom || merchantName;
          const address = store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ');
          const canNavigate = hasCoords(store);
          const navigate = () => {
            if (!hasCoords(store)) return;
            haptic();
            void openDirections(store.latitude, store.longitude, name);
          };
          return (
            <Pressable
              key={store.id}
              onPress={navigate}
              disabled={!canNavigate}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole={canNavigate ? 'button' : undefined}
              accessibilityLabel={canNavigate ? `${t('merchant.directions')} ${name}` : name}
            >
              <View style={styles.flex}>
                <Text style={[styles.name, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{name}</Text>
                {!!address && (
                  <Text style={[styles.address, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={2}>
                    {address}
                  </Text>
                )}
                {store.distanceKm != null && (
                  <Text style={[styles.distance, { color: accent, fontFamily: fonts.semibold }]}>
                    {formatDistance(store.distanceKm)}
                  </Text>
                )}
              </View>
              {!!store.telephone && (
                <Pressable
                  onPress={() => { haptic(); void callPhone(store.telephone!); }}
                  style={({ pressed }) => [styles.action, { backgroundColor: `${theme.success}14`, opacity: pressed ? 0.7 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('merchant.call')} ${name}`}
                  hitSlop={4}
                >
                  <Phone size={ms(17)} color={theme.success} strokeWidth={2} />
                </Pressable>
              )}
              {canNavigate && (
                <View style={[styles.action, { backgroundColor: `${accent}14` }]}>
                  <Navigation size={ms(17)} color={accent} strokeWidth={2} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </MerchantSection>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  count: { fontSize: ms(13) },
  list: { marginTop: -hp(4) },
  row: { flexDirection: 'row', alignItems: 'center', gap: wp(10), paddingVertical: hp(12) },
  name: { fontSize: ms(14) },
  address: { fontSize: ms(12), lineHeight: ms(17), marginTop: hp(2) },
  distance: { fontSize: ms(12), marginTop: hp(4) },
  action: { width: ms(40), height: ms(40), borderRadius: ms(14), alignItems: 'center', justifyContent: 'center' },
});

export default memo(MerchantLocations);
