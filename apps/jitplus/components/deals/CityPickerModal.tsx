import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, MapPin, Navigation, Search, X } from 'lucide-react-native';
import { nearestMoroccoCity, type MoroccoCity } from '@jitplus/shared/src/deals';
import { Text, TextInput } from '@/components/AppText';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDealLocation } from '@/hooks/useDealLocation';
import type { Coords } from '@/hooks/useKnownLocation';
import { searchMoroccoCities } from '@/utils/dealAlerts';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { fontSize, hp, ms, radius, wp } from '@/utils/responsive';

interface Props {
  visible: boolean;
  selectedKey: string | null;
  onSelect: (cityKey: string) => void;
  onClose: () => void;
}

const ROW_HEIGHT = ms(52);
/** Gives up waiting for a position the user may have refused. */
const LOCATE_TIMEOUT_MS = 15_000;

/** Moroccan cities with a search field. "Use my location" picks the closest city on the device: only its key is kept. */
export default function CityPickerModal({ visible, selectedKey, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible && <PickerContent selectedKey={selectedKey} onSelect={onSelect} onClose={onClose} />}
    </Modal>
  );
}

const PickerContent = memo(function PickerContent({ selectedKey, onSelect, onClose }: Omit<Props, 'visible'>) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const cities = useMemo(() => searchMoroccoCities(query), [query]);

  // Mounted only while the sheet is open: the position is read then, never prompted for.
  const { coords, request } = useDealLocation(t);
  const [locating, setLocating] = useState(false);
  const awaitingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = locating && !coords;

  const pickNearest = useCallback((position: Coords) => {
    const city = nearestMoroccoCity(position.latitude, position.longitude);
    if (city) onSelect(city.key);
    else Alert.alert(t('deals.alerts.noNearbyCityTitle'), t('deals.alerts.noNearbyCityBody'));
  }, [onSelect, t]);

  useEffect(() => {
    if (!awaitingRef.current || !coords) return;
    awaitingRef.current = false;
    pickNearest(coords);
  }, [coords, pickNearest]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const locate = useCallback(() => {
    haptic();
    if (coords) { pickNearest(coords); return; }
    awaitingRef.current = true;
    setLocating(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { awaitingRef.current = false; setLocating(false); }, LOCATE_TIMEOUT_MS);
    void request();
  }, [coords, pickNearest, request]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<MoroccoCity>) => {
    const selected = item.key === selectedKey;
    const label = locale === 'ar' ? item.ar : locale === 'en' ? item.en : item.fr;
    return (
      <Pressable
        onPress={() => { haptic(); onSelect(item.key); }}
        style={({ pressed }) => [styles.row, selected && { backgroundColor: `${palette.violet}12` }, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <MapPin size={ms(16)} color={selected ? palette.violet : theme.textMuted} strokeWidth={2} />
        <Text style={[styles.rowText, { color: theme.text, fontFamily: selected ? fonts.semibold : fonts.regular }]} numberOfLines={1}>
          {label}
        </Text>
        {selected && <Check size={ms(18)} color={palette.violet} strokeWidth={2.4} />}
      </Pressable>
    );
  }, [selectedKey, locale, onSelect, theme, fonts]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      <View style={[styles.sheet, { backgroundColor: theme.bgCard, paddingBottom: insets.bottom + hp(12) }]} accessibilityViewIsModal>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header">
            {t('deals.alerts.cityPickerTitle')}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <X size={ms(22)} color={theme.text} strokeWidth={2} />
          </Pressable>
        </View>

        <Pressable
          onPress={locate}
          disabled={busy}
          style={({ pressed }) => [styles.locate, { borderColor: `${palette.violet}40`, backgroundColor: `${palette.violet}0D` }, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityState={{ busy }}
        >
          {busy
            ? <ActivityIndicator size="small" color={palette.violet} />
            : <Navigation size={ms(18)} color={palette.violet} strokeWidth={2} />}
          <View style={styles.locateTexts}>
            <Text style={[styles.locateTitle, { color: palette.violet, fontFamily: fonts.semibold }]}>{t('deals.alerts.useMyLocation')}</Text>
            <Text style={[styles.locateHint, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('deals.alerts.privacy')}</Text>
          </View>
        </Pressable>

        <View style={[styles.search, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder }]}>
          <Search size={ms(16)} color={theme.inputPlaceholder} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: theme.text, fontFamily: fonts.regular }]}
            placeholder={t('deals.alerts.searchCity')}
            placeholderTextColor={theme.inputPlaceholder}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={40}
            returnKeyType="search"
          />
        </View>

        <FlatList
          data={cities}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('deals.alerts.noCityFound')}</Text>
          }
        />
      </View>
    </KeyboardAvoidingView>
  );
});

const keyExtractor = (city: MoroccoCity) => city.key;
const getItemLayout = (_: ArrayLike<MoroccoCity> | null | undefined, index: number) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index });

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { maxHeight: '80%', borderTopLeftRadius: ms(20), borderTopRightRadius: ms(20), paddingTop: hp(16) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wp(20), marginBottom: hp(12) },
  title: { fontSize: fontSize.lg },
  locate: {
    flexDirection: 'row', alignItems: 'center', gap: wp(12), marginHorizontal: wp(16), marginBottom: hp(10),
    paddingHorizontal: wp(14), paddingVertical: hp(10), borderRadius: radius.lg, borderWidth: 1,
  },
  locateTexts: { flex: 1 },
  locateTitle: { fontSize: fontSize.md, textAlign: 'left' },
  locateHint: { fontSize: fontSize.xs, marginTop: hp(2), textAlign: 'left' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: wp(8), marginHorizontal: wp(16), marginBottom: hp(6),
    paddingHorizontal: wp(12), height: ms(44), borderRadius: radius.md, borderWidth: 1.5,
  },
  searchInput: { flex: 1, fontSize: fontSize.sm, textAlign: 'left' },
  row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: wp(12), paddingHorizontal: wp(20) },
  rowText: { flex: 1, fontSize: fontSize.md, textAlign: 'left' },
  pressed: { opacity: 0.7 },
  empty: { textAlign: 'center', marginTop: hp(20), marginBottom: hp(12), fontSize: fontSize.sm },
});
