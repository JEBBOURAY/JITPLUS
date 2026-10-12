import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, I18nManager, Share, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  QrCode,
  Send,
  Megaphone,
  Store,
  MessageCircle,
  Globe,
  Lightbulb,
  ChevronRight,
  Sparkles,
} from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { CLIENT_APP_ANDROID_URL, CLIENT_APP_IOS_URL } from '@/constants/app';
import PromoSheet, { SheetSectionLabel, useSheetColors, type LucideIcon } from '@/components/home/PromoSheet';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';

// Same tone as the "Partager" promo banner that opens this sheet.
const TONE: PromoTone = 'sky';
const ACCENT = PROMO_TONES[TONE].fill;
const GOLD = palette.gold;
// Shortened store links so the in-sheet preview stays readable.
const PREVIEW_ANDROID = 'play.google.com/…';
const PREVIEW_IOS = 'apps.apple.com/…';

const HERO_STEPS: readonly { Icon: LucideIcon; labelKey: string }[] = [
  { Icon: QrCode, labelKey: 'home.clientShareStoreSection' },
  { Icon: Send, labelKey: 'home.clientShareMessageSection' },
  { Icon: Megaphone, labelKey: 'home.clientShareSocialSection' },
];

interface ClientShareSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface ChannelCardProps {
  Icon: LucideIcon;
  tone: PromoTone;
  title: string;
  text: string;
  /** Translated "A · B · C" list of places/apps where the channel is used. */
  tags: string;
  cta: string;
  onPress: () => void;
  badge?: string;
  primary?: boolean;
  children?: React.ReactNode;
}

function ChannelCard({ Icon, tone, title, text, tags, cta, onPress, badge, primary, children }: ChannelCardProps) {
  const theme = useTheme();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const tint = PROMO_TONES[tone].fill;
  const tintInk = ink(tone);
  const isRTL = I18nManager.isRTL;
  const tagList = tags.split('·').map((s) => s.trim()).filter(Boolean);

  return (
    <View
      style={[
        styles.channelCard,
        primary
          ? { backgroundColor: `${tint}0D`, borderColor: `${tint}55` }
          : { backgroundColor: softFill, borderColor: hairline },
      ]}
    >
      <View style={[styles.channelHead, isRTL && styles.rowRtl]}>
        <View style={[styles.channelIcon, { backgroundColor: `${tint}1A` }]}>
          <Icon size={18} color={tintInk} strokeWidth={2} />
        </View>
        <View style={styles.flex1}>
          {badge ? (
            <View style={[styles.badge, { backgroundColor: tint }, isRTL && styles.selfEnd]}>
              <Sparkles size={10} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.badgeText} maxFontSizeMultiplier={1.15}>{badge.toUpperCase()}</Text>
            </View>
          ) : null}
          <Text style={[styles.channelTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
        </View>
      </View>

      <Text style={[styles.channelText, { color: muted }]} maxFontSizeMultiplier={1.45}>
        {text}
      </Text>

      <View style={[styles.tagsRow, isRTL && styles.rowRtl]}>
        {tagList.map((tag) => (
          <View
            key={tag}
            style={[styles.tag, { borderColor: hairline, backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#FFFFFF' }]}
          >
            <Text style={[styles.tagText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.2}>{tag}</Text>
          </View>
        ))}
      </View>

      {children}

      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.88}
        style={[
          styles.channelBtn,
          isRTL && styles.rowRtl,
          primary
            ? [styles.channelBtnPrimary, { backgroundColor: tint, shadowColor: tint }]
            : { backgroundColor: `${tint}14` },
        ]}
        accessibilityRole="button"
        accessibilityLabel={cta}
      >
        <Text style={[styles.channelBtnText, { color: primary ? '#FFFFFF' : tintInk }]} maxFontSizeMultiplier={1.2}>
          {cta}
        </Text>
        <ChevronRight
          size={16}
          color={primary ? '#FFFFFF' : tintInk}
          strokeWidth={2.2}
          style={isRTL ? styles.flipX : undefined}
        />
      </TouchableOpacity>
    </View>
  );
}

/** Message as it will be sent, shown in a tinted bubble. */
function MessagePreview({ text, tone }: { text: string; tone: PromoTone }) {
  const theme = useTheme();
  const { hairline } = useSheetColors();
  return (
    <View style={[styles.preview, { borderColor: hairline, backgroundColor: `${PROMO_TONES[tone].fill}${theme.mode === 'dark' ? '1A' : '0F'}` }]}>
      <Text style={[styles.previewText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.35}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Sharing toolkit to get customers onto the JitPlus client app: printable
 * in-store poster, download link by message, and a ready-to-post social
 * announcement explaining how to use JitPlus at the store.
 */
function ClientShareSheet({ visible, onClose }: ClientShareSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { muted, ink } = useSheetColors();
  const router = useRouter();
  const merchantNom = useAuthStore((s) => s.merchant?.nom);
  const isRTL = I18nManager.isRTL;
  const storeName = merchantNom || t('home.clientShareStoreFallback');

  const openPoster = useCallback(() => {
    onClose();
    router.push('/client-app-qr' as never);
  }, [onClose, router]);

  const shareLink = useCallback(async () => {
    try {
      await Share.share({
        title: t('home.clientShareLinkTitle'),
        message: t('home.clientShareLinkMessage', { androidUrl: CLIENT_APP_ANDROID_URL, iosUrl: CLIENT_APP_IOS_URL }),
      });
    } catch {
      Alert.alert(t('common.error'), t('home.clientShareLinkError'));
    }
  }, [t]);

  const shareSocial = useCallback(async () => {
    try {
      await Share.share({
        title: t('home.clientShareSocialTitle'),
        message: t('home.clientShareSocialMessage', { storeName, androidUrl: CLIENT_APP_ANDROID_URL, iosUrl: CLIENT_APP_IOS_URL }),
      });
    } catch {
      Alert.alert(t('common.error'), t('home.clientShareSocialError'));
    }
  }, [t, storeName]);

  const heroFooter = (
    <View style={[styles.heroSteps, isRTL && styles.rowRtl]}>
      {HERO_STEPS.map(({ Icon: StepIcon, labelKey }) => (
        <View key={labelKey} style={[styles.heroStep, isRTL && styles.rowRtl]}>
          <StepIcon size={12} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={styles.heroStepText} maxFontSizeMultiplier={1.15} numberOfLines={1}>
            {t(labelKey)}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <PromoSheet
      visible={visible}
      onClose={onClose}
      tone={TONE}
      heroLabel={t('home.clientShareHeroLabel')}
      title={t('home.clientShareSheetTitle')}
      subtitle={t('home.clientShareSheetSubtitle')}
      heroBadge={<Megaphone size={20} color={ACCENT} strokeWidth={2.2} />}
      heroFooter={heroFooter}
    >
      {/* ── 1. En magasin ── */}
      <SheetSectionLabel Icon={Store} text={t('home.clientShareStoreSection')} tone={TONE} />
      <ChannelCard
        Icon={QrCode}
        tone={TONE}
        title={t('home.clientSharePlvTitle')}
        text={t('home.clientSharePlvText')}
        tags={t('home.clientSharePlvTags')}
        cta={t('home.clientSharePlvCta')}
        onPress={openPoster}
        badge={t('home.clientShareBestBadge')}
        primary
      />

      {/* ── 2. Par message ── */}
      <SheetSectionLabel Icon={MessageCircle} text={t('home.clientShareMessageSection')} tone={TONE} />
      <ChannelCard
        Icon={Send}
        tone="green"
        title={t('home.clientShareLinkTitle')}
        text={t('home.clientShareLinkText')}
        tags={t('home.clientShareLinkTags')}
        cta={t('home.clientShareLinkCta')}
        onPress={shareLink}
      >
        <MessagePreview
          tone="green"
          text={t('home.clientShareLinkMessage', { androidUrl: PREVIEW_ANDROID, iosUrl: PREVIEW_IOS })}
        />
      </ChannelCard>

      {/* ── 3. Sur les réseaux ── */}
      <SheetSectionLabel Icon={Globe} text={t('home.clientShareSocialSection')} tone={TONE} />
      <ChannelCard
        Icon={Megaphone}
        tone="pink"
        title={t('home.clientShareSocialTitle')}
        text={t('home.clientShareSocialText')}
        tags={t('home.clientShareSocialTags')}
        cta={t('home.clientShareSocialCta')}
        onPress={shareSocial}
      >
        <Text style={[styles.previewLabel, { color: muted }]} maxFontSizeMultiplier={1.2}>
          {t('home.clientSharePreviewLabel').toUpperCase()}
        </Text>
        <MessagePreview
          tone="pink"
          text={t('home.clientShareSocialMessage', { storeName, androidUrl: PREVIEW_ANDROID, iosUrl: PREVIEW_IOS })}
        />
      </ChannelCard>

      {/* ── Conseil ── */}
      <View style={[styles.tip, isRTL && styles.rowRtl]}>
        <View style={styles.tipIcon}>
          <Lightbulb size={16} color={ink('amber')} strokeWidth={2.2} />
        </View>
        <View style={styles.flex1}>
          <Text style={[styles.tipTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {t('home.clientShareTipTitle')}
          </Text>
          <Text style={[styles.tipText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.45}>
            {t('home.clientShareTipText')}
          </Text>
        </View>
      </View>
    </PromoSheet>
  );
}

export default React.memo(ClientShareSheet);

const styles = StyleSheet.create({
  rowRtl: { flexDirection: 'row-reverse' },
  selfEnd: { alignSelf: 'flex-end' },
  flipX: { transform: [{ scaleX: -1 }] },
  flex1: { flex: 1 },

  heroSteps: { flexDirection: 'row', gap: 6, marginTop: 14 },
  heroStep: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  heroStepText: { color: '#FFFFFF', fontSize: 10.5, fontFamily: 'Lexend_600SemiBold', flexShrink: 1 },

  // Channel card
  channelCard: { borderRadius: 18, borderWidth: 1, padding: 14 },
  channelHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  channelIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  channelTitle: { fontSize: 14.5, fontFamily: 'Lexend_700Bold' },
  channelText: { fontSize: 12, lineHeight: 17.5, marginTop: 10, fontFamily: 'Lexend_400Regular' },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 4,
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, letterSpacing: 0.8, fontFamily: 'Lexend_700Bold' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontSize: 10.5, fontFamily: 'Lexend_500Medium' },
  channelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  channelBtnPrimary: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  channelBtnText: { fontSize: 13.5, fontFamily: 'Lexend_700Bold', flexShrink: 1, textAlign: 'center' },

  // Message previews
  previewLabel: { fontSize: 9.5, letterSpacing: 0.9, fontFamily: 'Lexend_700Bold', marginTop: 12 },
  preview: { borderWidth: 1, borderRadius: 12, padding: 11, marginTop: 8 },
  previewText: { fontSize: 11.5, lineHeight: 17, fontFamily: 'Lexend_400Regular' },

  // Tip
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 18,
    backgroundColor: `${GOLD}1F`,
    borderColor: `${GOLD}66`,
  },
  tipIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${GOLD}40`,
  },
  tipTitle: { fontSize: 13, fontFamily: 'Lexend_700Bold' },
  tipText: { fontSize: 12, lineHeight: 17.5, marginTop: 2, fontFamily: 'Lexend_400Regular' },
});
