import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  type LayoutChangeEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Share2, Check } from 'lucide-react-native';
import { JitClock, JitGames, JitGift, JitPoster, JitSettings, JitStamp } from '@/components/icons';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';
import { DemoVideoButton } from '@/components/demo/DemoVideoButton';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
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
  const { row, textAlign, alignEnd } = useDir();

  const program = usePlvProgram();
  const programRows = useMemo(
    () => [
      { Icon: JitStamp, text: program.earnLine },
      { Icon: JitGift, text: program.rewardHeadline },
      ...program.otherRewards.map((r) => ({ Icon: JitGift, text: r.label })),
      ...(program.wheelLine ? [{ Icon: JitGames, text: program.wheelLine }] : []),
      ...(program.validityLine ? [{ Icon: JitClock, text: program.validityLine }] : []),
    ],
    [program],
  );

  const selected = PLV_TEMPLATES.find((d) => d.id === templateId) ?? PLV_TEMPLATES[0];

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
      <ScreenHeader title={t('home.clientPosterStore')} right={<DemoVideoButton id="affiche" variant="header" />} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 26 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.subtitle, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
          {t('home.clientQrSubtitle')}
        </Text>

        <Text style={[styles.sectionTitle, { color: theme.text, textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {t('home.clientPlvPickerLabel')}
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
                  { backgroundColor: theme.bgCard, borderColor: active ? theme.primary : theme.border },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(tpl.nameKey)}
              >
                {/* The two colours of the template: paper on top, a band of its accent below. */}
                <View
                  style={[
                    styles.swatch,
                    { aspectRatio: 1 / Math.min(tpl.ratio, 1.2), backgroundColor: tpl.swatch[0], borderColor: theme.border, alignItems: alignEnd },
                  ]}
                >
                  <View style={[styles.swatchBand, { backgroundColor: tpl.swatch[1] }]} />
                  {active ? (
                    <View style={[styles.swatchCheck, { backgroundColor: theme.primary }]}>
                      <Check size={12} color="#FFFFFF" strokeWidth={icon.strokeSmall} />
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.pickerName, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.25} numberOfLines={1}>
                  {t(tpl.nameKey)}
                </Text>
                <Text style={[styles.pickerUse, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.25} numberOfLines={2}>
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

        <View style={[styles.programCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          <Text style={[styles.programLabel, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.2}>
            {t('home.clientPlvProgramLabel')}
          </Text>
          {programRows.map((item, i) => (
            <View key={i} style={[styles.programRow, { flexDirection: row }]}>
              <item.Icon size={18} color={theme.text} strokeWidth={icon.stroke} />
              <Text style={[styles.programText, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
                {item.text}
              </Text>
            </View>
          ))}
          {/* Settings are owner-only; team members get a dead end there. */}
          {!isTeamMember ? (
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              activeOpacity={0.7}
              style={[styles.programEdit, { flexDirection: row }]}
              accessibilityRole="button"
              accessibilityLabel={t('home.clientPlvProgramEdit')}
            >
              <JitSettings size={14} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
              <Text style={[styles.programEditText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                {t('home.clientPlvProgramEdit')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.useRow, { flexDirection: row }]}>
          <JitPoster size={16} color={theme.textMuted} strokeWidth={icon.stroke} />
          <Text style={[styles.useText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
            {t(selected.useKey)}
          </Text>
        </View>

        <ActionButton
          label={t('home.clientQrExportCta')}
          icon={Share2}
          size="lg"
          onPress={exportPosterImage}
          loading={exporting}
          disabled={posterW === 0}
          accessibilityLabel={t('home.clientQrExportCta')}
          style={styles.cta}
        />

        <Text style={[styles.hint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
          {t('home.clientQrHint')}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, fontFamily: font.regular, paddingHorizontal: 4 },
  // Same section title and cards as "Mes outils" on Accueil.
  sectionTitle: { fontSize: 18, fontFamily: font.semibold, letterSpacing: -0.3, marginTop: 18, marginBottom: 10 },

  picker: { marginHorizontal: -16 },
  pickerTrack: { paddingHorizontal: 16, gap: 10 },
  pickerItem: { width: 118, borderWidth: 1.5, borderRadius: 18, padding: 8 },
  swatch: { width: '100%', borderRadius: 10, borderWidth: 1, padding: 6, overflow: 'hidden' },
  swatchBand: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%' },
  swatchCheck: { width: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  pickerName: { marginTop: 8, fontSize: 13, fontFamily: font.semibold },
  pickerUse: { marginTop: 2, fontSize: 11, lineHeight: 14, fontFamily: font.regular },

  previewFrame: { marginTop: 16, borderRadius: 18, padding: 16 },
  previewInner: { width: '100%', alignItems: 'center' },
  posterShadow: {
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },

  programCard: { marginTop: 12, borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 },
  programLabel: { fontSize: 15, fontFamily: font.semibold, letterSpacing: -0.2 },
  programRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  programText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: font.medium },
  programEdit: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  programEditText: { fontSize: 12, fontFamily: font.medium, flexShrink: 1 },

  useRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  useText: { fontSize: 12, fontFamily: font.medium, textAlign: 'center', flexShrink: 1 },

  cta: { width: '100%', marginTop: 14, borderWidth: 0 },
  hint: { marginTop: 10, fontSize: 11, lineHeight: 16, textAlign: 'center', fontFamily: font.regular },
});
