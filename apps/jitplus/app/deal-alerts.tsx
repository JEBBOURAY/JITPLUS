import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, ArrowLeft, BellOff, BellRing, Clock, Globe, MapPin } from 'lucide-react-native';
import { moroccoCityLabel } from '@jitplus/shared/src/deals';
import { Text } from '@/components/AppText';
import GuestGuard from '@/components/GuestGuard';
import Skeleton from '@/components/Skeleton';
import CityPickerModal from '@/components/deals/CityPickerModal';
import SettingsGroup from '@/components/profile/SettingsGroup';
import SettingsRow from '@/components/profile/SettingsRow';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { useDealAlerts, useUpdateDealAlerts, type DealAlertUpdate } from '@/hooks/useDealHooks';
import { usePreferenceToggle } from '@/hooks/usePreferenceToggle';
import { CATEGORIES, CATEGORY_EMOJI } from '@/utils/categories';
import { isDealAlertNeedsCityError, toggleAlertCategory } from '@/utils/dealAlerts';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { fontSize as FS, hp, ms, radius, wp } from '@/utils/responsive';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const ALERT_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'all');
/** Category taps are grouped into one PATCH (the endpoint allows 20 calls a minute). */
const CATEGORY_SAVE_DELAY_MS = 800;

export default function DealAlertsScreen() {
  const { isGuest } = useAuth();
  if (isGuest) return <GuestGuard />;
  return <DealAlertsSettings />;
}

function DealAlertsSettings() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, locale, isRTL } = useLanguage();
  const notifPush = useAuthStore((s) => s.client?.notifPush ?? true);
  const { toggle: togglePreference, savingKey } = usePreferenceToggle();
  const { data: prefs, isLoading, isError, refetch } = useDealAlerts();
  const { mutate } = useUpdateDealAlerts();

  const [pickerOpen, setPickerOpen] = useState(false);
  const enableAfterPickRef = useRef(false);
  const [draftCategories, setDraftCategories] = useState<string[] | null>(null);
  const draftRef = useRef<string[] | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/deals');
  }, [router]);

  const save = useCallback((update: DealAlertUpdate) => {
    mutate(update, {
      onError: (error) => {
        Alert.alert(t('common.error'), isDealAlertNeedsCityError(error) ? t('deals.alerts.needsCity') : t('deals.alerts.saveError'));
      },
    });
  }, [mutate, t]);

  const flushCategories = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const next = draftRef.current;
    if (!next) return;
    draftRef.current = null;
    // The optimistic update puts `next` in the cache, so the draft can go.
    save({ categories: next });
    setDraftCategories(null);
  }, [save]);

  const flushRef = useRef(flushCategories);
  useEffect(() => { flushRef.current = flushCategories; }, [flushCategories]);
  useEffect(() => () => flushRef.current(), []);

  const categories = draftCategories ?? prefs?.categories ?? [];

  const setCategories = useCallback((next: string[]) => {
    haptic();
    draftRef.current = next;
    setDraftCategories(next);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushRef.current(), CATEGORY_SAVE_DELAY_MS);
  }, []);

  const toggleCity = useCallback(() => {
    if (!prefs) return;
    haptic();
    if (prefs.enabled) save({ enabled: false });
    else if (prefs.cityKey) save({ enabled: true });
    else { enableAfterPickRef.current = true; setPickerOpen(true); }
  }, [prefs, save]);

  const openPicker = useCallback(() => { haptic(); enableAfterPickRef.current = false; setPickerOpen(true); }, []);
  const closePicker = useCallback(() => { enableAfterPickRef.current = false; setPickerOpen(false); }, []);
  const pickCity = useCallback((cityKey: string) => {
    const enable = enableAfterPickRef.current;
    enableAfterPickRef.current = false;
    setPickerOpen(false);
    if (cityKey === prefs?.cityKey && !enable) return;
    save(enable ? { cityKey, enabled: true } : { cityKey });
  }, [prefs?.cityKey, save]);

  const toggleOnline = useCallback(() => {
    if (!prefs) return;
    haptic();
    save({ online: !prefs.online });
  }, [prefs, save]);

  const enablePush = useCallback(() => { void togglePreference('notifPush'); }, [togglePreference]);

  let content: React.ReactNode;
  if (isLoading) {
    content = (
      <View style={styles.skeletons}>
        <Skeleton width="100%" height={ms(124)} borderRadius={ms(20)} />
        <Skeleton width="100%" height={ms(160)} borderRadius={ms(20)} />
        <Skeleton width="100%" height={ms(64)} borderRadius={ms(20)} />
      </View>
    );
  } else if (isError || !prefs) {
    content = (
      <View style={styles.error}>
        <AlertCircle size={ms(30)} color={theme.danger} strokeWidth={1.8} />
        <Text style={[styles.errorText, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('deals.alerts.loadError')}</Text>
        <Pressable onPress={() => { void refetch(); }} style={styles.retry} accessibilityRole="button">
          <Text style={[styles.retryText, { fontFamily: fonts.semibold }]}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  } else {
    const cityLabel = prefs.cityKey ? moroccoCityLabel(prefs.cityKey, locale) : '';
    content = (
      <>
        <Text style={[styles.intro, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('deals.alerts.intro')}</Text>

        {!notifPush && (
          <View style={[styles.warning, { backgroundColor: `${palette.gold}14`, borderColor: `${palette.gold}40` }]}>
            <BellOff size={ms(18)} color={palette.goldDark} strokeWidth={2} />
            <View style={styles.warningTexts}>
              <Text style={[styles.warningTitle, { color: theme.text, fontFamily: fonts.semibold }]}>{t('deals.alerts.pushOffTitle')}</Text>
              <Text style={[styles.warningBody, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{t('deals.alerts.pushOffBody')}</Text>
              <Pressable
                onPress={enablePush}
                disabled={savingKey === 'notifPush'}
                style={({ pressed }) => [styles.warningBtn, { opacity: pressed || savingKey === 'notifPush' ? 0.7 : 1 }]}
                accessibilityRole="button"
              >
                <BellRing size={ms(13)} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={[styles.warningBtnText, { fontFamily: fonts.semibold }]}>{t('deals.alerts.pushOffAction')}</Text>
              </Pressable>
            </View>
          </View>
        )}

        <SettingsGroup>
          <SettingsRow
            icon={BellRing}
            title={t('deals.alerts.cityToggle')}
            subtitle={t('deals.alerts.cityToggleDesc')}
            accessory="switch"
            checked={prefs.enabled}
            onPress={toggleCity}
          />
          <SettingsRow
            icon={MapPin}
            title={t('deals.alerts.city')}
            valueText={cityLabel || t('deals.alerts.chooseCity')}
            onPress={openPicker}
          />
        </SettingsGroup>
        <Text style={[styles.note, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('deals.alerts.privacy')}</Text>

        <Text style={[styles.groupTitle, { color: theme.textMuted, fontFamily: fonts.semibold }]} accessibilityRole="header">
          {t('deals.alerts.categoriesTitle')}
        </Text>
        <View style={[styles.categoriesCard, { backgroundColor: theme.bgCard, borderColor: theme.border, opacity: prefs.enabled ? 1 : 0.6 }]}>
          <Text style={[styles.hint, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('deals.alerts.categoriesHint')}</Text>
          <View style={styles.chips}>
            <CategoryChip
              label={t('deals.alerts.allCategories')}
              selected={categories.length === 0}
              onPress={() => setCategories([])}
              fontFamily={fonts.medium}
            />
            {ALERT_CATEGORIES.map((cat) => (
              <CategoryChip
                key={cat.id}
                label={`${CATEGORY_EMOJI[cat.id] ?? ''} ${t(cat.labelKey)}`.trim()}
                selected={categories.includes(cat.id)}
                onPress={() => setCategories(toggleAlertCategory(categories, cat.id))}
                fontFamily={fonts.medium}
              />
            ))}
          </View>
        </View>

        <SettingsGroup>
          <SettingsRow
            icon={Globe}
            title={t('deals.alerts.onlineToggle')}
            subtitle={t('deals.alerts.onlineToggleDesc')}
            accessory="switch"
            checked={prefs.online}
            onPress={toggleOnline}
          />
        </SettingsGroup>

        <View style={styles.frequency}>
          <Clock size={ms(15)} color={theme.textMuted} strokeWidth={2} />
          <Text style={[styles.frequencyText, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('deals.alerts.frequency')}</Text>
        </View>
      </>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { paddingTop: insets.top + hp(10), backgroundColor: theme.bg }]}>
        <View style={styles.titleRow}>
          <Pressable
            onPress={goBack}
            hitSlop={12}
            style={[styles.backBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={ms(20)} color={theme.text} strokeWidth={2} style={isRTL ? styles.flip : undefined} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header" numberOfLines={1}>
            {t('deals.alerts.title')}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + hp(24) }]}
      >
        {content}
      </ScrollView>

      <CityPickerModal visible={pickerOpen} selectedKey={prefs?.cityKey ?? null} onSelect={pickCity} onClose={closePicker} />
    </View>
  );
}

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  fontFamily: string;
}

function CategoryChip({ label, selected, onPress, fontFamily }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected
        ? { backgroundColor: `${palette.violet}18`, borderColor: palette.violet }
        : { backgroundColor: 'transparent', borderColor: theme.border }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
    >
      <Text style={[styles.chipText, { color: selected ? palette.violet : theme.textSecondary, fontFamily }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: wp(20), paddingBottom: hp(12) },
  titleRow: { minHeight: ms(46), flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  backBtn: { width: ms(40), height: ms(40), borderRadius: ms(20), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  flip: { transform: [{ scaleX: -1 }] },
  title: { flex: 1, fontSize: FS['2xl'], letterSpacing: -0.4, textAlign: 'left' },
  content: { paddingHorizontal: wp(16), paddingTop: hp(4) },
  intro: { fontSize: FS.sm, lineHeight: ms(20), marginBottom: hp(16), marginHorizontal: wp(4), textAlign: 'left' },
  warning: { flexDirection: 'row', gap: wp(12), padding: ms(14), borderRadius: radius.xl, borderWidth: 1, marginBottom: hp(16) },
  warningTexts: { flex: 1 },
  warningTitle: { fontSize: FS.md, textAlign: 'left' },
  warningBody: { fontSize: ms(13), lineHeight: ms(18), marginTop: hp(2), textAlign: 'left' },
  warningBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: wp(6), marginTop: hp(10),
    paddingHorizontal: wp(12), paddingVertical: hp(7), borderRadius: ms(12), backgroundColor: palette.goldDark,
  },
  warningBtnText: { color: '#FFFFFF', fontSize: ms(13) },
  note: { fontSize: FS.xs, marginTop: -hp(12), marginBottom: hp(20), marginHorizontal: wp(6), textAlign: 'left' },
  groupTitle: { fontSize: FS.xs, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: hp(8), marginHorizontal: wp(6), textAlign: 'left' },
  categoriesCard: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: ms(14), marginBottom: hp(20) },
  hint: { fontSize: FS.xs, marginBottom: hp(10), textAlign: 'left' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(8) },
  chip: { paddingHorizontal: wp(12), paddingVertical: hp(7), borderRadius: ms(16), borderWidth: 1 },
  chipText: { fontSize: ms(13) },
  frequency: { flexDirection: 'row', alignItems: 'center', gap: wp(8), marginHorizontal: wp(6), marginTop: -hp(8) },
  frequencyText: { flex: 1, fontSize: FS.xs, lineHeight: ms(17), textAlign: 'left' },
  skeletons: { gap: hp(16), paddingTop: hp(8) },
  error: { alignItems: 'center', paddingVertical: hp(48), gap: hp(12) },
  errorText: { fontSize: FS.md, textAlign: 'center' },
  retry: { paddingHorizontal: wp(18), paddingVertical: hp(10), borderRadius: ms(14), backgroundColor: palette.violet },
  retryText: { color: '#FFFFFF', fontSize: FS.md },
});
