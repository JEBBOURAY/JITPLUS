import { useState } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Maximize2, Navigation, X } from 'lucide-react-native';
import { JitPin } from '@/components/icons';
import SafeMapView, { Marker } from '@/components/SafeMapView';
import { ActionButton } from '@/components/ui/ActionButton';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import type { StoreLocationState } from '@/hooks/useStoreLocation';
import { font, icon } from '@/constants/design';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { formStyles, HIT_SLOP } from './formStyles';

interface Props {
  location: StoreLocationState;
  disabled?: boolean;
}

/** Optional store position: "my location" button, map preview and full-screen picker. */
export function LocationField({ location, disabled }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const [mapOpen, setMapOpen] = useState(false);
  const { marker, region, label, locating, mapRef, setFromMap, locateMe } = location;

  const addressChip = marker ? (
    <View style={[styles.address, { flexDirection: dir.row, backgroundColor: `${palette.charbon}0D` }]}>
      <Check size={ms(14)} color={palette.charbon} strokeWidth={icon.strokeSmall} />
      <Text style={[styles.addressText, { color: palette.charbon, textAlign: dir.textAlign }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  ) : null;

  // Same button under the label and inside the full-screen map.
  const locateButton = (
    <ActionButton
      variant="secondary"
      label={t('registerExtra.locateMe')}
      icon={Navigation}
      onPress={locateMe}
      disabled={disabled}
      loading={locating}
      style={formStyles.secondaryBtn}
      labelStyle={formStyles.secondaryBtnText}
      iconColor={palette.charbon}
    />
  );

  return (
    <View style={formStyles.field}>
      <View style={[formStyles.labelRow, { flexDirection: dir.row }]}>
        <JitPin size={ms(15)} color={theme.text} strokeWidth={icon.stroke} />
        <Text style={[formStyles.label, formStyles.labelInline, { color: theme.text }]}>
          {t('registerExtra.mapTitle')}{' '}
          <Text style={[formStyles.optionalTag, { color: theme.textMuted }]}>({t('registerExtra.optional')})</Text>
        </Text>
      </View>
      {locateButton}

      {/* Static preview: a live map inside the scroll view steals the scroll
          gesture. Tapping it opens the full-screen map instead. */}
      <Pressable
        style={styles.preview}
        onPress={() => { Keyboard.dismiss(); setMapOpen(true); }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('registerExtra.openMap')}
      >
        <View style={formStyles.flex1} pointerEvents="none">
          <SafeMapView
            style={formStyles.flex1}
            region={region}
            showsUserLocation={false}
            zoomEnabled={false}
            scrollEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            showsPointsOfInterests={false}
            showsBuildings={false}
          >
            {marker ? <Marker coordinate={marker} pinColor={palette.violet} /> : null}
          </SafeMapView>
        </View>
        <View style={[styles.openChip, { flexDirection: dir.row, backgroundColor: theme.bgCard }]}>
          <Maximize2 size={ms(14)} color={palette.charbon} strokeWidth={icon.stroke} />
          <Text style={[styles.openChipText, { color: palette.charbon }]}>{t('registerExtra.openMap')}</Text>
        </View>
      </Pressable>
      {addressChip}

      <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)}>
        <SafeAreaView style={[formStyles.flex1, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
          <View style={[styles.modalHeader, { flexDirection: dir.row }]}>
            <Text style={[styles.modalTitle, { color: theme.text, textAlign: dir.textAlign }]}>{t('registerExtra.mapTitle')}</Text>
            <TouchableOpacity
              onPress={() => setMapOpen(false)}
              style={[formStyles.iconBtn, { backgroundColor: `${theme.text}08` }]}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <X size={ms(20)} color={theme.text} strokeWidth={icon.stroke} />
            </TouchableOpacity>
          </View>
          <SafeMapView
            ref={mapRef}
            style={formStyles.flex1}
            initialRegion={region}
            onPress={setFromMap}
            showsUserLocation={false}
            zoomEnabled
            scrollEnabled
            pitchEnabled={false}
            rotateEnabled={false}
            showsPointsOfInterests={false}
            showsBuildings={false}
          >
            {marker ? (
              <Marker draggable coordinate={marker} pinColor={palette.violet} onDragEnd={setFromMap} />
            ) : null}
          </SafeMapView>
          <View style={styles.modalFooter}>
            {addressChip}
            {locateButton}
            <ActionButton
              label={t('registerExtra.mapConfirm')}
              onPress={() => setMapOpen(false)}
              disabled={marker == null}
              icon={Check}
              iconPosition="end"
              style={formStyles.primaryBtn}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    marginTop: hp(12),
    borderRadius: radius.lg,
    overflow: 'hidden',
    height: hp(200),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(124,58,237,0.20)',
  },
  openChip: {
    position: 'absolute',
    bottom: hp(10),
    alignSelf: 'center',
    alignItems: 'center',
    gap: wp(6),
    paddingHorizontal: wp(12),
    paddingVertical: hp(7),
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  openChipText: { fontSize: fontSize.xs, fontFamily: font.semibold },
  address: {
    marginTop: hp(10),
    borderRadius: radius.md,
    paddingHorizontal: wp(10),
    paddingVertical: hp(8),
    alignItems: 'center',
    gap: wp(8),
  },
  addressText: { flex: 1, fontSize: ms(12), fontFamily: font.semibold },
  modalHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(16),
    paddingVertical: hp(10),
    gap: wp(10),
  },
  modalTitle: { flex: 1, fontSize: ms(17), fontFamily: font.bold },
  modalFooter: { paddingHorizontal: wp(16), paddingTop: hp(12), paddingBottom: hp(8), gap: hp(10) },
});
