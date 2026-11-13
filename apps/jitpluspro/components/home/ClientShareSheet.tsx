import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Send, Lightbulb, ChevronRight } from 'lucide-react-native';
import { JitMessages, JitPoster, JitStar } from '@/components/icons';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { CLIENT_APP_ANDROID_URL, CLIENT_APP_IOS_URL } from '@/constants/app';
import PromoSheet, { useSheetColors, type LucideIcon } from '@/components/home/PromoSheet';
import { PROMO_TONES, type PromoTone } from '@/components/home/promoTones';

// Same tone as the "Partager" promo banner that opens this sheet.
const TONE: PromoTone = 'sky';
const ACCENT = PROMO_TONES[TONE].fill;
const GOLD = palette.gold;

interface ClientShareSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface ChannelCardProps {
  Icon: LucideIcon;
  tone: PromoTone;
  /** Where the support is used: "En boutique", "Réseaux sociaux"… */
  place: string;
  title: string;
  text: string;
  cta: string;
  onPress: () => void;
  badge?: string;
}

/** One way to spread the app. The whole card is the button. */
function ChannelCard({ Icon, tone, place, title, text, cta, onPress, badge }: ChannelCardProps) {
  const theme = useTheme();
  const dir = useDir();
  const { softFill, hairline, muted, ink } = useSheetColors();
  const tint = PROMO_TONES[tone].fill;
  const tintInk = ink(tone);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: softFill, borderColor: hairline }]}
      accessibilityRole="button"
      accessibilityLabel={cta}
      accessibilityHint={`${place}. ${text}`}
    >
      <View style={[styles.cardHead, { flexDirection: dir.row }]}>
        <View style={[styles.cardIcon, { backgroundColor: `${tint}1A` }]}>
          <Icon size={22} color={tintInk} strokeWidth={2} />
        </View>
        <View style={styles.flex1}>
          <View style={[styles.placeRow, { flexDirection: dir.row }]}>
            <Text style={[styles.place, { color: tintInk }]} maxFontSizeMultiplier={1.2}>
              {place}
            </Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: tint, flexDirection: dir.row }]}>
                <JitStar size={10} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.badgeText} maxFontSizeMultiplier={1.15}>{badge}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.cardTitle, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
        </View>
      </View>

      <Text style={[styles.cardText, { color: muted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.45}>
        {text}
      </Text>

      <View style={[styles.cardBtn, { backgroundColor: tint, flexDirection: dir.row }]}>
        <Text style={styles.cardBtnText} maxFontSizeMultiplier={1.2}>{cta}</Text>
        <ChevronRight size={16} color="#FFFFFF" strokeWidth={2.2} style={dir.flip} />
      </View>
    </TouchableOpacity>
  );
}

/**
 * Sharing toolkit to get customers onto the JitPlus client app, one card per
 * place: the printable poster in store, the ready-made post for social media,
 * then the download link by message.
 */
function ClientShareSheet({ visible, onClose }: ClientShareSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();
  const { ink } = useSheetColors();
  const router = useRouter();

  const openPoster = useCallback(() => {
    onClose();
    router.push('/client-app-qr' as never);
  }, [onClose, router]);

  const openSocialPost = useCallback(() => {
    onClose();
    router.push('/social-post' as never);
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

  return (
    <PromoSheet
      visible={visible}
      onClose={onClose}
      tone={TONE}
      heroLabel={t('home.clientShareHeroLabel')}
      title={t('home.clientShareSheetTitle')}
      subtitle={t('home.clientShareSheetSubtitle')}
      heroBadge={<JitMessages size={20} color={ACCENT} strokeWidth={2.2} />}
    >
      <View style={styles.cards}>
        <ChannelCard
          Icon={JitPoster}
          tone={TONE}
          place={t('home.clientShareStoreSection')}
          title={t('home.clientSharePlvTitle')}
          text={t('home.clientSharePlvText')}
          cta={t('home.clientSharePlvCta')}
          onPress={openPoster}
          badge={t('home.clientShareBestBadge')}
        />
        <ChannelCard
          Icon={JitMessages}
          tone="pink"
          place={t('home.clientShareSocialSection')}
          title={t('home.clientShareSocialTitle')}
          text={t('home.clientShareSocialText')}
          cta={t('home.clientShareSocialCta')}
          onPress={openSocialPost}
        />
        <ChannelCard
          Icon={Send}
          tone="green"
          place={t('home.clientShareMessageSection')}
          title={t('home.clientShareLinkTitle')}
          text={t('home.clientShareLinkText')}
          cta={t('home.clientShareLinkCta')}
          onPress={shareLink}
        />
      </View>

      <View style={[styles.tip, { flexDirection: dir.row }]}>
        <View style={styles.tipIcon}>
          <Lightbulb size={16} color={ink('amber')} strokeWidth={2.2} />
        </View>
        <View style={styles.flex1}>
          <Text style={[styles.tipTitle, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('home.clientShareTipTitle')}
          </Text>
          <Text style={[styles.tipText, { color: theme.textSecondary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.45}>
            {t('home.clientShareTipText')}
          </Text>
        </View>
      </View>
    </PromoSheet>
  );
}

export default React.memo(ClientShareSheet);

const styles = StyleSheet.create({
  flex1: { flex: 1 },

  cards: { gap: 12, marginTop: 14 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14 },
  cardHead: { alignItems: 'center', gap: 12 },
  cardIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  placeRow: { alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  place: { fontSize: 12, fontFamily: 'Lexend_500Medium' },
  badge: { alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: '#FFFFFF', fontSize: 9.5, fontFamily: 'Lexend_600SemiBold' },
  cardTitle: { fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontFamily: 'Lexend_600SemiBold' },
  cardText: { fontSize: 13, lineHeight: 19, marginTop: 10, fontFamily: 'Lexend_400Regular' },
  cardBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  cardBtnText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Lexend_600SemiBold', flexShrink: 1, textAlign: 'center' },

  tip: {
    alignItems: 'flex-start',
    gap: 11,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 16,
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
  tipTitle: { fontSize: 13, fontFamily: 'Lexend_600SemiBold' },
  tipText: { fontSize: 12, lineHeight: 17.5, marginTop: 2, fontFamily: 'Lexend_400Regular' },
});
