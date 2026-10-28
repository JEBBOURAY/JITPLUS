import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  I18nManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';

export type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/** Surface and text colours shared by the Accueil promo sheets, light and dark. */
export function useSheetColors() {
  const theme = useTheme();
  const dark = theme.mode === 'dark';
  return useMemo(
    () => ({
      surface: dark ? '#1A1F2B' : theme.bgCard,
      softFill: dark ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
      hairline: dark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)',
      // The theme's dark textMuted (#64748B) is only 3:1 on the sheet cards.
      muted: dark ? '#94A3B8' : theme.textMuted,
      /** Tone readable as text or icon on the current surface. */
      ink: (tone: PromoTone): string => (dark ? PROMO_TONES[tone].dark : PROMO_TONES[tone].light),
    }),
    [dark, theme.bgCard, theme.textMuted],
  );
}

export function SheetSectionLabel({ text, tone, Icon }: { text: string; tone: PromoTone; Icon?: LucideIcon }) {
  const color = useSheetColors().ink(tone);
  const label = (
    <Text style={[styles.sectionLabel, { color }]} maxFontSizeMultiplier={1.2}>
      {text.toUpperCase()}
    </Text>
  );
  if (!Icon) return <View style={styles.sectionLabelWrap}>{label}</View>;
  return (
    <View style={[styles.sectionLabelWrap, styles.sectionLabelRow, I18nManager.isRTL && styles.rowRtl]}>
      <Icon size={13} color={color} strokeWidth={2.2} />
      {label}
    </View>
  );
}

interface PromoSheetCta {
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
}

interface PromoSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Same tone as the promo card that opens the sheet. */
  tone: PromoTone;
  heroLabel: string;
  title: string;
  subtitle: string;
  /** Icon or logo shown in the white frame at the top-right of the hero. */
  heroBadge?: React.ReactNode;
  /** Drawn behind the hero content (e.g. a zellige pattern). */
  heroBackground?: React.ReactNode;
  /** Extra hero content under the subtitle (progress, steps…). */
  heroFooter?: React.ReactNode;
  /** Fixed primary button at the bottom of the sheet. */
  cta?: PromoSheetCta;
  /** "Compris" link under the CTA. Always shown when there is no CTA. */
  showClose?: boolean;
  children: React.ReactNode;
}

/**
 * Shared shell of the Accueil promo sheets: bottom modal, gradient hero,
 * scrollable body and a fixed footer with the primary action.
 */
export default function PromoSheet({
  visible,
  onClose,
  tone,
  heroLabel,
  title,
  subtitle,
  heroBadge,
  heroBackground,
  heroFooter,
  cta,
  showClose = true,
  children,
}: PromoSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { surface, hairline } = useSheetColors();
  const isRTL = I18nManager.isRTL;
  const { fill: accent, deep: accentDeep } = PROMO_TONES[tone];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Backdrop is a sibling, not a parent: a Pressable wrapping the sheet
            grabs the touch and the ScrollView never scrolls (Android). */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View style={[styles.sheet, { backgroundColor: surface }]} accessibilityViewIsModal>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <LinearGradient colors={[accent, accentDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
              {heroBackground}
              <View style={styles.grabber} />
              <View style={[styles.heroTopRow, isRTL && styles.rowRtl]}>
                <View style={styles.heroChip}>
                  <Text style={styles.heroChipText} maxFontSizeMultiplier={1.2}>
                    {heroLabel.toUpperCase()}
                  </Text>
                </View>
                {heroBadge ? <View style={styles.heroBadge}>{heroBadge}</View> : null}
              </View>
              <Text style={styles.heroTitle} maxFontSizeMultiplier={1.15} accessibilityRole="header">
                {title}
              </Text>
              <Text style={styles.heroSubtitle} maxFontSizeMultiplier={1.3}>
                {subtitle}
              </Text>
              {heroFooter}
            </LinearGradient>

            <View style={styles.content}>{children}</View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              { backgroundColor: surface, paddingBottom: Math.max(insets.bottom + 6, 14), borderTopColor: hairline },
            ]}
          >
            {cta ? (
              <TouchableOpacity
                onPress={cta.onPress}
                activeOpacity={0.88}
                style={[
                  styles.ctaBtn,
                  isRTL && styles.rowRtl,
                  { backgroundColor: accent, borderBottomColor: accentDeep, shadowColor: accent },
                ]}
                accessibilityRole="button"
                accessibilityLabel={cta.label}
              >
                <cta.Icon size={17} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.ctaText} maxFontSizeMultiplier={1.2} numberOfLines={2}>
                  {cta.label}
                </Text>
                <ChevronRight
                  size={16}
                  color="rgba(255,255,255,0.85)"
                  strokeWidth={2.2}
                  style={isRTL ? styles.flipX : undefined}
                />
              </TouchableOpacity>
            ) : null}
            {showClose || !cta ? (
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.7}
                style={styles.closeLink}
                accessibilityRole="button"
                accessibilityLabel={t('common.gotIt')}
              >
                <Text style={[styles.closeText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                  {t('common.gotIt')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(11,15,20,0.55)', justifyContent: 'flex-end' },
  // Hug the content, shrink and scroll once the sheet reaches maxHeight.
  scroll: { flexGrow: 0, flexShrink: 1 },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  scrollContent: { paddingBottom: 16 },
  rowRtl: { flexDirection: 'row-reverse' },
  flipX: { transform: [{ scaleX: -1 }] },

  hero: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 22 },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: 12,
  },
  heroChip: {
    // Dark veil, not a white one: gold text on a lightened gradient drops under 3:1.
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroChipText: { color: palette.gold, fontSize: 10.5, letterSpacing: 1.2, fontFamily: 'Lexend_600SemiBold' },
  heroBadge: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.3,
    fontFamily: 'Lexend_700Bold',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 8,
    fontFamily: 'Lexend_400Regular',
  },
  content: { paddingHorizontal: 20, paddingTop: 6 },
  sectionLabelWrap: { marginTop: 18, marginBottom: 8 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionLabel: { fontSize: 11, letterSpacing: 1, fontFamily: 'Lexend_700Bold' },

  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 15,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 3,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  ctaText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Lexend_700Bold', flexShrink: 1, textAlign: 'center' },
  closeLink: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  closeText: { fontSize: 13.5, fontFamily: 'Lexend_600SemiBold' },
});
