import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  I18nManager,
  type LayoutChangeEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Share2, ChevronRight, Check, Printer, Stamp, Gift, Ticket, Clock, Settings2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useTheme, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import PlvPoster, { PLV_TEMPLATES, type PlvTemplateId } from '@/components/plv/PlvPoster';
import { usePlvProgram } from '@/components/plv/usePlvProgram';

export default function ClientAppQrScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const insets = useSafeAreaInsets();
  const posterRef = useRef<View | null>(null);
  const [exporting, setExporting] = useState(false);
  const [templateId, setTemplateId] = useState<PlvTemplateId>('classic');
  const [posterW, setPosterW] = useState(0);
  const isRTL = I18nManager.isRTL;

  const program = usePlvProgram();
  const programRows = useMemo(
    () => [
      { Icon: Stamp, text: program.earnLine },
      { Icon: Gift, text: program.rewardHeadline },
      ...program.otherRewards.map((r) => ({ Icon: Gift, text: r.label })),
      ...(program.wheelLine ? [{ Icon: Ticket, text: program.wheelLine }] : []),
      ...(program.validityLine ? [{ Icon: Clock, text: program.validityLine }] : []),
    ],
    [program],
  );

  const selected = PLV_TEMPLATES.find((d) => d.id === templateId) ?? PLV_TEMPLATES[0];
  const hairline = theme.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';

  const onPosterLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setPosterW((prev) => (prev === w ? prev : w));
  }, []);

  const exportPosterImage = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (!sharingAvailable) {
        Alert.alert(t('common.error'), t('home.clientQrShareUnavailable'));
        return;
      }
      if (!posterRef.current) {
        throw new Error('Poster view unavailable');
      }
      const fileUri = await captureRef(posterRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(fileUri, {
        mimeType: 'image/png',
        dialogTitle: t('home.clientQrExportDialog'),
      });
    } catch {
      Alert.alert(t('common.error'), t('home.clientQrExportError'));
    } finally {
      setExporting(false);
    }
  }, [exporting, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, isRTL && styles.rowRtl, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft
            size={22}
            color={theme.text}
            strokeWidth={2}
            style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
          {t('home.clientQrHeader')}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 26 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
          {t('home.clientQrTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
          {t('home.clientQrSubtitle')}
        </Text>

        <Text style={[styles.sectionLabel, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>
          {t('home.clientPlvPickerLabel').toUpperCase()}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pickerTrack}
          style={styles.picker}
        >
          {PLV_TEMPLATES.map((tpl) => {
            const active = tpl.id === templateId;
            return (
              <TouchableOpacity
                key={tpl.id}
                onPress={() => setTemplateId(tpl.id)}
                activeOpacity={0.85}
                style={[
                  styles.pickerItem,
                  { backgroundColor: theme.bgCard, borderColor: active ? theme.primary : hairline },
                  active && styles.pickerItemActive,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(tpl.nameKey)}
              >
                <LinearGradient
                  colors={[tpl.swatch[0], tpl.swatch[1]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.swatch, { aspectRatio: 1 / Math.min(tpl.ratio, 1.2), borderColor: hairline }]}
                >
                  {active ? (
                    <View style={[styles.swatchCheck, { backgroundColor: theme.primary }]}>
                      <Check size={12} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  ) : null}
                </LinearGradient>
                <Text style={[styles.pickerName, { color: theme.text }]} maxFontSizeMultiplier={1.25} numberOfLines={1}>
                  {t(tpl.nameKey)}
                </Text>
                <Text style={[styles.pickerUse, { color: theme.textMuted }]} maxFontSizeMultiplier={1.25} numberOfLines={2}>
                  {t(tpl.useKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View
          style={[styles.previewFrame, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#EEF2F7' }]}
        >
          <View style={styles.previewInner} onLayout={onPosterLayout}>
            {posterW > 0 ? (
              <View ref={posterRef} collapsable={false} style={styles.posterShadow}>
                {/* Remount per template so the native root never keeps styles from another layout. */}
                <PlvPoster
                  key={templateId}
                  template={templateId}
                  width={posterW}
                  merchantName={merchant?.nom || t('home.clientShareStoreFallback')}
                  logoUrl={merchant?.logoUrl}
                  brandColor={merchant?.themeColor}
                  program={program}
                  t={t}
                />
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.programCard, { backgroundColor: theme.bgCard, borderColor: hairline }]}>
          <Text style={[styles.programLabel, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>
            {t('home.clientPlvProgramLabel').toUpperCase()}
          </Text>
          {programRows.map((row, i) => (
            <View key={i} style={[styles.programRow, isRTL && styles.rowRtl]}>
              <row.Icon size={15} color={theme.primary} strokeWidth={2.2} />
              <Text style={[styles.programText, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                {row.text}
              </Text>
            </View>
          ))}
          {/* Settings are owner-only; team members get a dead end there. */}
          {!isTeamMember ? (
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              activeOpacity={0.7}
              style={[styles.programEdit, isRTL && styles.rowRtl]}
              accessibilityRole="button"
              accessibilityLabel={t('home.clientPlvProgramEdit')}
            >
              <Settings2 size={14} color={theme.textMuted} strokeWidth={2} />
              <Text style={[styles.programEditText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                {t('home.clientPlvProgramEdit')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.useRow, isRTL && styles.rowRtl]}>
          <Printer size={14} color={theme.textMuted} strokeWidth={2} />
          <Text style={[styles.useText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
            {t(selected.useKey)}
          </Text>
        </View>

        <LinearGradient
          colors={[brandGradient[0], brandGradient[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.ctaGradient}
        >
          <TouchableOpacity
            onPress={exportPosterImage}
            activeOpacity={0.85}
            style={[styles.ctaButton, isRTL ? styles.rowRtl : styles.rowLtr]}
            accessibilityRole="button"
            accessibilityLabel={t('home.clientQrExportCta')}
            disabled={exporting || posterW === 0}
          >
            <Share2 size={16} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.ctaText} maxFontSizeMultiplier={1.25}>
              {exporting ? t('common.loading') : t('home.clientQrExportCta')}
            </Text>
            <ChevronRight
              size={16}
              color="#FFFFFF"
              strokeWidth={2}
              style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
            />
          </TouchableOpacity>
        </LinearGradient>

        <Text style={[styles.hint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
          {t('home.clientQrHint')}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.2,
    flex: 1,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  title: { fontSize: 19, lineHeight: 25, fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  subtitle: { marginTop: 4, fontSize: 12.5, lineHeight: 18, fontFamily: 'Lexend_400Regular' },
  sectionLabel: { fontSize: 11, letterSpacing: 1, fontFamily: 'Lexend_700Bold', marginTop: 18, marginBottom: 8 },

  picker: { marginHorizontal: -16 },
  pickerTrack: { paddingHorizontal: 16, gap: 10 },
  pickerItem: { width: 118, borderWidth: 1.5, borderRadius: 16, padding: 8 },
  pickerItemActive: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  swatch: { width: '100%', borderRadius: 10, borderWidth: 1, alignItems: 'flex-end', padding: 6 },
  swatchCheck: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pickerName: { marginTop: 8, fontSize: 13, fontFamily: 'Lexend_700Bold' },
  pickerUse: { marginTop: 2, fontSize: 10.5, lineHeight: 14, fontFamily: 'Lexend_400Regular' },

  previewFrame: { marginTop: 16, borderRadius: 20, padding: 16 },
  previewInner: { width: '100%', alignItems: 'center' },
  posterShadow: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },

  programCard: { marginTop: 14, borderWidth: 1, borderRadius: 16, padding: 14, gap: 9 },
  programLabel: { fontSize: 11, letterSpacing: 1, fontFamily: 'Lexend_700Bold' },
  programRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  programText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: 'Lexend_500Medium' },
  programEdit: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  programEditText: { fontSize: 11.5, fontFamily: 'Lexend_500Medium', flexShrink: 1 },

  useRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  useText: { fontSize: 12, fontFamily: 'Lexend_500Medium', textAlign: 'center', flexShrink: 1 },

  ctaGradient: { width: '100%', marginTop: 14, borderRadius: 14, overflow: 'hidden' },
  ctaButton: {
    width: '100%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ctaText: { color: '#FFFFFF', fontSize: 13.5, fontFamily: 'Lexend_700Bold', textAlign: 'center', flexShrink: 1 },
  hint: { marginTop: 10, fontSize: 11, lineHeight: 16, textAlign: 'center', fontFamily: 'Lexend_400Regular' },
  rowLtr: { flexDirection: 'row' },
  rowRtl: { flexDirection: 'row-reverse' },
});
