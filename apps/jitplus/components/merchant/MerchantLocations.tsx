import { memo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { MapPin, Navigation, Phone } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { formatDistance } from '@/utils/distance';
import { hasCoords, toTel } from '@jitplus/shared';
import { openDirections, openFirst } from '@jitplus/shared/src/openLinks';
import type { StoreWithDistance } from '@/utils/merchantStores';
import { wp, hp, ms } from '@/utils/responsive';
import FicheSection from './FicheSection';

interface Props {
  stores: StoreWithDistance[];
  merchantName: string;
}

/**
 * With a single store, the quick actions already call it and open directions,
 * and the hero already shows its distance: only the address is listed.
 */
function MerchantLocations({ stores, merchantName }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();

  if (stores.length === 0) return null;
  const multiple = stores.length > 1;

  return (
    <FicheSection title={multiple ? `${t('merchant.otherLocationsTitle')} (${stores.length})` : t('merchant.locationTitle')}>
      {stores.map((store, i) => {
        const name = store.nom || merchantName;
        const address = store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ');
        const canNavigate = hasCoords(store);
        const tel = toTel(store.telephone);
        const navigate = () => {
          if (!hasCoords(store)) return;
          haptic();
          void openDirections(store.latitude, store.longitude, name);
        };
        const showName = multiple || (!!store.nom && store.nom !== merchantName);
        const meta = [address, multiple && store.distanceKm != null ? formatDistance(store.distanceKm) : null].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={store.id}
            onPress={navigate}
            disabled={!canNavigate}
            style={({ pressed }) => [
              styles.row,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
              pressed && { opacity: 0.6 },
            ]}
            accessibilityRole={canNavigate ? 'button' : undefined}
            accessibilityLabel={canNavigate ? `${t('merchant.directions')} ${name}` : name}
          >
            <MapPin size={ms(20)} color={theme.textSecondary} strokeWidth={1.8} />
            <View style={styles.flex}>
              {showName && (
                <Text style={[styles.name, { color: theme.text, fontFamily: fonts.medium }]} numberOfLines={1}>{name}</Text>
              )}
              {!!meta && (
                <Text
                  style={showName
                    ? [styles.address, { color: theme.textMuted, fontFamily: fonts.regular }]
                    : [styles.name, { color: theme.text, fontFamily: fonts.regular }]}
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
                <Phone size={ms(17)} color={theme.text} strokeWidth={2} />
              </Pressable>
            )}
            {multiple && canNavigate && (
              <View style={[styles.action, { borderColor: theme.border }]}>
                <Navigation size={ms(17)} color={theme.text} strokeWidth={2} />
              </View>
            )}
          </Pressable>
        );
      })}
    </FicheSection>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: wp(14), paddingVertical: hp(10) },
  name: { fontSize: ms(15) },
  address: { fontSize: ms(13), lineHeight: ms(18), marginTop: hp(2) },
  action: { width: ms(38), height: ms(38), borderRadius: ms(19), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

export default memo(MerchantLocations);
