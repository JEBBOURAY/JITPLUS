import React from 'react';
import { View, Text, StyleSheet, Image, I18nManager } from 'react-native';
import {
  Smartphone,
  Bell,
  Ticket,
  History,
  Store,
  Repeat,
  MessageCircle,
  Leaf,
  Quote,
  Share2,
  Check,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import PromoSheet, { SheetSectionLabel, useSheetColors, type LucideIcon } from '@/components/home/PromoSheet';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';

// Same tone as the "Vos clients" promo banner that opens this sheet.
const TONE: PromoTone = 'emerald';
const ACCENT = PROMO_TONES[TONE].fill;

interface ClientAppPitchSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Primary CTA: jump to the sharing tools (link, PLV poster, social post). */
  onShare: () => void;
}

/**
 * Pitch sheet explaining why customers should install the JitPlus client app
 * (not JitPlus Pro): which app is for whom, what customers gain, what the
 * merchant gains, and three ready-to-say sentences for the checkout.
 */
function ClientAppPitchSheet({ visible, onClose, onShare }: ClientAppPitchSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const isRTL = I18nManager.isRTL;
  const accentInk = ink(TONE);
  const divider = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline };

  const customerBenefits: { Icon: LucideIcon; tone: PromoTone; title: string; text: string }[] = [
    { Icon: Smartphone, tone: 'emerald', title: t('home.clientBenefitsItem1Title'), text: t('home.clientBenefitsItem1Text') },
    { Icon: Bell, tone: 'blue', title: t('home.clientBenefitsItem2Title'), text: t('home.clientBenefitsItem2Text') },
    { Icon: Ticket, tone: 'amber', title: t('home.clientBenefitsItem3Title'), text: t('home.clientBenefitsItem3Text') },
    { Icon: History, tone: 'violet', title: t('home.clientBenefitsItem4Title'), text: t('home.clientBenefitsItem4Text') },
  ];

  const merchantGains: { Icon: LucideIcon; title: string; text: string }[] = [
    { Icon: Repeat, title: t('home.clientPitchGain1Title'), text: t('home.clientPitchGain1Text') },
    { Icon: MessageCircle, title: t('home.clientPitchGain2Title'), text: t('home.clientPitchGain2Text') },
    { Icon: Leaf, title: t('home.clientPitchGain3Title'), text: t('home.clientPitchGain3Text') },
  ];

  const scripts = [t('home.clientPitchScript1'), t('home.clientPitchScript2'), t('home.clientPitchScript3')];

  return (
    <PromoSheet
      visible={visible}
      onClose={onClose}
      tone={TONE}
      heroLabel={t('home.clientPitchHeroLabel')}
      title={t('home.clientBenefitsSheetTitle')}
      subtitle={t('home.clientPitchHeroSubtitle')}
      heroBadge={
        <Image
          source={require('@/assets/images/jitpluslogo.png')}
          style={styles.heroLogo}
          resizeMode="contain"
          accessibilityLabel={t('home.clientBenefitsLogoHint')}
        />
      }
      cta={{ label: t('home.clientPitchCta'), Icon: Share2, onPress: onShare }}
    >
      {/* ── 1. Quelle app pour qui ── */}
      <SheetSectionLabel text={t('home.clientPitchAppsLabel')} tone={TONE} />
      <View style={[styles.appsRow, isRTL && styles.rowRtl]}>
        <View style={[styles.appCard, { backgroundColor: softFill, borderColor: hairline }]}>
          <View style={[styles.appIcon, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#EEF2F7' }]}>
            <Store size={16} color={theme.textSecondary} strokeWidth={2} />
          </View>
          <Text style={[styles.appRole, { color: muted }]} maxFontSizeMultiplier={1.2}>
            {t('home.clientPitchProRole').toUpperCase()}
          </Text>
          <Text style={[styles.appName, { color: theme.text }]} maxFontSizeMultiplier={1.25}>
            {t('home.clientPitchProName')}
          </Text>
          <Text style={[styles.appText, { color: muted }]} maxFontSizeMultiplier={1.4}>
            {t('home.clientPitchProText')}
          </Text>
        </View>
        <View style={[styles.appCard, styles.appCardClient]}>
          <View style={[styles.appIcon, styles.appIconClient]}>
            <Smartphone size={16} color={accentInk} strokeWidth={2} />
          </View>
          <Text style={[styles.appRole, { color: accentInk }]} maxFontSizeMultiplier={1.2}>
            {t('home.clientPitchClientRole').toUpperCase()}
          </Text>
          <Text style={[styles.appName, { color: theme.text }]} maxFontSizeMultiplier={1.25}>
            {t('home.clientPitchClientName')}
          </Text>
          <Text style={[styles.appText, { color: muted }]} maxFontSizeMultiplier={1.4}>
            {t('home.clientPitchClientText')}
          </Text>
        </View>
      </View>

      {/* ── 2. Ce que vos clients y gagnent ── */}
      <SheetSectionLabel text={t('home.clientPitchBenefitsLabel')} tone={TONE} />
      <View style={[styles.listCard, { backgroundColor: softFill, borderColor: hairline }]}>
        {customerBenefits.map((b, i) => (
          <View key={i} style={[styles.row, isRTL && styles.rowRtl, i > 0 && divider]}>
            <View style={[styles.benefitIcon, { backgroundColor: `${PROMO_TONES[b.tone].fill}1A` }]}>
              <b.Icon size={16} color={ink(b.tone)} strokeWidth={2} />
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.rowTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
                {b.title}
              </Text>
              <Text style={[styles.rowText, { color: muted }]} maxFontSizeMultiplier={1.45}>
                {b.text}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── 3. Ce que vous y gagnez ── */}
      <SheetSectionLabel text={t('home.clientPitchGainsLabel')} tone={TONE} />
      <View style={[styles.listCard, { backgroundColor: softFill, borderColor: hairline }]}>
        {merchantGains.map((g, i) => (
          <View key={i} style={[styles.row, isRTL && styles.rowRtl, i > 0 && divider]}>
            <View style={styles.gainCheck}>
              <Check size={12} color="#FFFFFF" strokeWidth={3} />
            </View>
            <View style={styles.flex1}>
              <View style={[styles.gainTitleRow, isRTL && styles.rowRtl]}>
                <g.Icon size={14} color={accentInk} strokeWidth={2} />
                <Text style={[styles.rowTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
                  {g.title}
                </Text>
              </View>
              <Text style={[styles.rowText, { color: muted }]} maxFontSizeMultiplier={1.45}>
                {g.text}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── 4. 3 phrases à dire en caisse ── */}
      <SheetSectionLabel text={t('home.clientPitchScriptLabel')} tone={TONE} />
      <View style={styles.scripts}>
        {scripts.map((line, i) => (
          <View key={i} style={[styles.scriptBubble, isRTL && styles.rowRtl]}>
            <View style={styles.scriptNumber}>
              <Text style={styles.scriptNumberText} maxFontSizeMultiplier={1.1}>{i + 1}</Text>
            </View>
            <Text style={[styles.scriptText, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
              {line}
            </Text>
            <Quote size={14} color={accentInk} strokeWidth={2} />
          </View>
        ))}
      </View>

      <Text style={[styles.storeHint, { color: muted }]} maxFontSizeMultiplier={1.3}>
        {t('home.clientBenefitsAppHint')}
      </Text>
    </PromoSheet>
  );
}

export default React.memo(ClientAppPitchSheet);

const styles = StyleSheet.create({
  rowRtl: { flexDirection: 'row-reverse' },
  flex1: { flex: 1 },
  heroLogo: { width: 34, height: 34 },

  // Apps comparison
  appsRow: { flexDirection: 'row', gap: 10 },
  appCard: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 12 },
  appCardClient: { backgroundColor: `${ACCENT}10`, borderColor: `${ACCENT}55` },
  appIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  appIconClient: { backgroundColor: `${ACCENT}1F` },
  appRole: { fontSize: 9.5, letterSpacing: 0.9, fontFamily: 'Lexend_700Bold' },
  appName: { fontSize: 14, fontFamily: 'Lexend_700Bold', marginTop: 2 },
  appText: { fontSize: 11.5, lineHeight: 16, marginTop: 4, fontFamily: 'Lexend_400Regular' },

  // Benefit / gain lists
  listCard: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingVertical: 11 },
  benefitIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  rowTitle: { fontSize: 13, fontFamily: 'Lexend_600SemiBold' },
  rowText: { fontSize: 11.5, lineHeight: 16.5, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  gainCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  gainTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Checkout scripts
  scripts: { gap: 8 },
  scriptBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: `${ACCENT}0F`,
    borderColor: `${ACCENT}30`,
  },
  scriptNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scriptNumberText: { color: '#FFFFFF', fontSize: 11.5, fontFamily: 'Lexend_700Bold' },
  scriptText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontFamily: 'Lexend_500Medium', fontStyle: 'italic' },

  storeHint: { fontSize: 11.5, marginTop: 16, textAlign: 'center', fontFamily: 'Lexend_400Regular' },
});
