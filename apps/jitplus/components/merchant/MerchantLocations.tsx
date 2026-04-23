import React from 'react';
import { View, Text, Pressable, Linking, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Phone, ChevronRight } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { haptic } from '@/utils/haptics';
import { merchantStyles as styles } from './merchantStyles';
import { getDistanceSafe, formatDistance } from '@/utils/distance';
import { ms } from '@/utils/responsive';
import type { Merchant } from '@/types';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface MerchantLocationsProps {
  merchant: Merchant;
  userLocation: { latitude: number; longitude: number } | null;
  theme: ThemeColors;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function MerchantLocations({ merchant, userLocation, theme, t }: MerchantLocationsProps) {
  if (!merchant.stores?.length) return null;

  return (
    <LinearGradient
      colors={[theme.bgCard, `${palette.violet}10`, `${palette.violet}18`]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[styles.otherLocationsCard, { backgroundColor: theme.bgCard }]}
    >
      <View style={styles.otherLocationsHeader}>
        <View style={[styles.cardIconBadge, { backgroundColor: `${palette.gold}12` }]}>
          <MapPin size={ms(16)} color={palette.gold} strokeWidth={1.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
            {merchant.stores.length > 1 ? t('merchant.otherLocationsTitle') : t('merchant.locationTitle')}
          </Text>
          {merchant.stores.length > 1 && (
            <Text style={[styles.otherLocationsCount, { color: theme.textMuted }]}>
              {t('merchant.otherLocationsCount', { count: merchant.stores.length })}
            </Text>
          )}
        </View>
      </View>
      {merchant.stores.map((store, idx: number) => (
        <Pressable
          key={store.id}
          onPress={async () => {
            haptic();
            if (store.latitude == null || store.longitude == null) return;
            if (isNaN(store.latitude) || isNaN(store.longitude)) return;
            const label = encodeURIComponent(store.nom || merchant.nomBoutique);
            const url = Platform.select({
              ios: `maps:0,0?q=${label}@${store.latitude},${store.longitude}`,
              default: `geo:${store.latitude},${store.longitude}?q=${store.latitude},${store.longitude}(${label})`,
            });
            if (!url) return;
            try {
              const canOpen = await Linking.canOpenURL(url);
              if (canOpen) await Linking.openURL(url);
              else await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${store.latitude},${store.longitude}`);
            } catch { /* maps app unavailable */ }
          }}
          style={({ pressed }) => [
            styles.storeItem,
            { backgroundColor: pressed ? `${palette.gold}06` : 'transparent' },
            idx === 0 && { borderTopWidth: 0 },
          ]}
        >
          <View style={[styles.storeItemDot, { backgroundColor: palette.gold }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.storeItemName, { color: theme.text }]} numberOfLines={1}>{store.nom}</Text>
            {(store.adresse || store.quartier || store.ville) && (
              <Text style={[styles.storeAddress, { color: theme.textMuted }]} numberOfLines={1}>
                {store.adresse || [store.quartier, store.ville].filter(Boolean).join(', ')}
              </Text>
            )}
            {!!store.telephone && (
              <Pressable
                onPress={async () => {
                  haptic();
                  const url = `tel:${store.telephone}`;
                  try {
                    const canOpen = await Linking.canOpenURL(url);
                    if (canOpen) await Linking.openURL(url);
                  } catch { /* no phone capability (iPad, etc.) */ }
                }}
                hitSlop={4}
                style={({ pressed }) => [styles.storePhoneRow, { opacity: pressed ? 0.6 : 1 }]}
                accessibilityRole="button" accessibilityLabel={`${t('merchant.call')} ${store.nom}`}
              >
                <Phone size={13} color={palette.emerald} strokeWidth={2} />
                <Text style={[styles.storePhone, { color: palette.emerald }]} numberOfLines={1}>{store.telephone}</Text>
              </Pressable>
            )}
          </View>
          {userLocation && store.latitude != null && store.longitude != null && (
            <Text style={[styles.storeDistance, { color: theme.textMuted }]} numberOfLines={1}>
              {formatDistance(getDistanceSafe(userLocation.latitude, userLocation.longitude, store.latitude, store.longitude))}
            </Text>
          )}
          {store.latitude != null && store.longitude != null && (
            <ChevronRight size={16} color={palette.gold} strokeWidth={2} />
          )}
        </Pressable>
      ))}
    </LinearGradient>
  );
}

export default React.memo(MerchantLocations);
