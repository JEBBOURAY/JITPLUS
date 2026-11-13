import { useState } from 'react';
import { Keyboard, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Globe, Maximize2, Navigation, X } from 'lucide-react-native';
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
import { FieldError } from './FieldError';

interface Props {
  location: StoreLocationState;
  disabled?: boolean;
  /** Online-only business: the position is not asked. */
  isEcommerce: boolean;
  onToggleEcommerce: () => void;
  /** The merchant tried to continue without a position. */
  showError: boolean;
  /** Each increment opens the full-screen map (e.g. from the form validation). */
  openRequest: number;
}

/**
 * Store position, required unless the merchant ticks "I sell online only":
 * "my location" and "place on the map" buttons, full-screen picker.
 */
export function LocationField({ location, disabled, isEcommerce, onToggleEcommerce, showError, openRequest }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const [mapOpen, setMapOpen] = useState(false);
  // `openRequest` value when the merchant last closed the map: a newer request keeps it open.
  const [closedAt, setClosedAt] = useState(openRequest);
  const visible = mapOpen || openRequest > closedAt;
  const closeMap = () => {
    setMapOpen(false);
    setClosedAt(openRequest);
  };
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
          {t('registerExtra.mapTitle')}{isEcommerce ? '' : ' *'}
        </Text>
      </View>
      {isEcommerce ? null : (
        <>
          <View style={[styles.actionsRow, { flexDirection: dir.row }]}>
            <View style={formStyles.flex1}>{locateButton}</View>
            <ActionButton
              variant="secondary"
              label={t('registerExtra.openMap')}
              icon={Maximize2}
              onPress={() => { Keyboard.dismiss(); setMapOpen(true); }}
              disabled={disabled}
              style={[
                formStyles.secondaryBtn,
                formStyles.flex1,
                showError && !marker ? { borderColor: theme.danger, borderWidth: 1.5 } : null,
              ]}
              labelStyle={formStyles.secondaryBtnText}
              iconColor={palette.charbon}
            />
          </View>
          {addressChip}
          {showError && !marker ? <FieldError>{t('registerExtra.locationRequired')}</FieldError> : null}
        </>
      )}
      <TouchableOpacity
        style={[styles.ecommerceRow, { flexDirection: dir.row }]}
        onPress={onToggleEcommerce}
        disabled={disabled}
        activeOpacity={0.7}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isEcommerce }}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: isEcommerce ? palette.charbon : theme.border,
              backgroundColor: isEcommerce ? palette.charbon : 'transparent',
            },
          ]}
        >
          {isEcommerce && <Check size={ms(14)} color="#fff" strokeWidth={icon.strokeSmall} />}
        </View>
        <Globe size={ms(15)} color={theme.textSecondary} strokeWidth={icon.stroke} />
        <Text style={[styles.ecommerceText, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
          {t('registerExtra.ecommerceToggle')}
        </Text>
      </TouchableOpacity>

      <Modal visible={visible} animationType="slide" onRequestClose={() => closeMap()}>
        <SafeAreaView style={[formStyles.flex1, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
          <View style={[styles.modalHeader, { flexDirection: dir.row }]}>
            <Text style={[styles.modalTitle, { color: theme.text, textAlign: dir.textAlign }]}>{t('registerExtra.mapTitle')}</Text>
            <TouchableOpacity
              onPress={() => closeMap()}
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
              onPress={() => closeMap()}
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
  actionsRow: { gap: wp(8) },
  ecommerceRow: { alignItems: 'center', gap: wp(8), marginTop: hp(10), paddingVertical: hp(2) },
  checkbox: { width: ms(22), height: ms(22), borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  ecommerceText: { flex: 1, fontSize: fontSize.sm, fontFamily: font.medium },
  address: {
    marginTop: hp(8),
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
  modalTitle: { flex: 1, fontSize: ms(17), fontFamily: font.semibold },
  modalFooter: { paddingHorizontal: wp(16), paddingTop: hp(12), paddingBottom: hp(8), gap: hp(10) },
});
