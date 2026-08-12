import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
  Pressable,
  I18nManager,
  Share,
  Alert,
  Image,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { HelpCircle, ShieldCheck, Smartphone, ChevronRight, Users, Check, Bell, Ticket, History, Share2, QrCode } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTour } from '@/components/GuidedTour';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

const CARD_GAP = 12;
const H_PAD = 16; // matches the Accueil content horizontal padding
const NEXT_PEEK = 14; // how much of the next card peeks on the right
const CLIENT_APP_ANDROID = 'https://play.google.com/store/apps/details?id=com.jitplus.client';
const CLIENT_APP_IOS = 'https://apps.apple.com/app/jitplus/id6762307929';

type LucideIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

interface CardVM {
  key: string;
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  iconBg: string;
  onPress: () => void;
}

/**
 * Horizontally-snapping "tips" carousel on the Accueil (§6): usage guide and a
 * why-loyalty info card, with pagination dots. The setup-progress banner stays
 * a separate widget (SetupChecklist) — this carousel only holds the two tips.
 */
function TipsCarousel() {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const merchant = useAuthStore((s) => s.merchant);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const tour = useTour();
  const hasLoyaltyProgram = !!merchant?.loyaltyType;

  const [activeIndex, setActiveIndex] = useState(0);
  const [whyVisible, setWhyVisible] = useState(false);
  const [clientBenefitsVisible, setClientBenefitsVisible] = useState(false);

  const cardW = winW - H_PAD * 2 - NEXT_PEEK;
  const interval = cardW + CARD_GAP;

  const openGuide = useCallback(() => { tour?.start(); }, [tour]);
  const openWhy = useCallback(() => setWhyVisible(true), []);
  const closeWhy = useCallback(() => setWhyVisible(false), []);
  const openLoyaltySettings = useCallback(() => {
    setWhyVisible(false);
    if (!hasLoyaltyProgram) {
      router.push('/settings?section=loyalty' as never);
    }
  }, [hasLoyaltyProgram, router]);
  const openClientBenefits = useCallback(() => setClientBenefitsVisible(true), []);
  const closeClientBenefits = useCallback(() => setClientBenefitsVisible(false), []);

  const shareClientAppLink = useCallback(async () => {
    try {
      await Share.share({
        title: t('home.clientBenefitsShareCta'),
        message: t('home.clientBenefitsShareMessage', {
          androidUrl: CLIENT_APP_ANDROID,
          iosUrl: CLIENT_APP_IOS,
        }),
      });
    } catch {
      Alert.alert(t('common.error'), t('home.clientBenefitsShareError'));
    }
  }, [t]);

  const openClientQrScreen = useCallback(() => {
    setClientBenefitsVisible(false);
    router.push('/client-app-qr' as never);
  }, [router]);

  const cards = useMemo<CardVM[]>(() => ([
    {
      key: 'guide',
      title: t('home.tipGuideTitle'),
      subtitle: t('home.tipGuideSub'),
      Icon: HelpCircle,
      iconBg: palette.violetLight,
      onPress: openGuide,
    },
    {
      key: 'why',
      title: t('home.tipWhyTitle'),
      subtitle: t('home.tipWhySub'),
      Icon: ShieldCheck,
      iconBg: '#B45309',
      onPress: openWhy,
    },
    {
      key: 'client',
      title: t('home.clientBenefitsTitle'),
      subtitle: t('home.clientBenefitsSubtitle'),
      Icon: Smartphone,
      iconBg: '#0F766E',
      onPress: openClientBenefits,
    },
  ]), [t, openGuide, openWhy, openClientBenefits]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = Math.round(e.nativeEvent.contentOffset.x / interval);
      const idx = Math.max(0, Math.min(cards.length - 1, raw));
      setActiveIndex(idx);
    },
    [interval, cards.length],
  );

  const whyBenefits = useMemo(() => ([
    {
      key: 'return',
      title: t('home.whyBenefit1Title'),
      text: t('home.whyBenefit1Text'),
    },
    {
      key: 'basket',
      title: t('home.whyBenefit2Title'),
      text: t('home.whyBenefit2Text'),
    },
    {
      key: 'wordmouth',
      title: t('home.whyBenefit3Title'),
      text: t('home.whyBenefit3Text'),
    },
    {
      key: 'paperless',
      title: t('home.whyBenefit4Title'),
      text: t('home.whyBenefit4Text'),
    },
  ]), [t]);

  const whyHairlineColor = theme.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.09)';
  const whySurface = theme.mode === 'dark' ? '#1A1F2B' : theme.bgCard;
  const clientHairlineColor = theme.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)';
  const clientSurface = theme.mode === 'dark' ? '#1A1F2B' : theme.bgCard;

  const clientBenefitsRows = useMemo(() => ([
    {
      key: 'points',
      Icon: Smartphone,
      title: t('home.clientBenefitsItem1Title'),
      text: t('home.clientBenefitsItem1Text'),
    },
    {
      key: 'offers',
      Icon: Bell,
      title: t('home.clientBenefitsItem2Title'),
      text: t('home.clientBenefitsItem2Text'),
    },
    {
      key: 'wheel',
      Icon: Ticket,
      title: t('home.clientBenefitsItem3Title'),
      text: t('home.clientBenefitsItem3Text'),
    },
    {
      key: 'history',
      Icon: History,
      title: t('home.clientBenefitsItem4Title'),
      text: t('home.clientBenefitsItem4Text'),
    },
  ]), [t]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={interval}
        snapToAlignment="start"
        disableIntervalMomentum
        directionalLockEnabled
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.track}
      >
        {cards.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={[
              styles.card,
              { width: cardW, backgroundColor: theme.primaryBg, borderColor: theme.primary + '29' },
            ]}
            activeOpacity={0.8}
            onPress={c.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${c.title}. ${c.subtitle}`}
          >
            <View style={styles.cardTop}>
              <View style={[styles.cardIcon, { backgroundColor: c.iconBg }]}>
                <c.Icon size={16} color="#fff" strokeWidth={2} />
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {c.title}
                </Text>
                <Text style={[styles.cardSub, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {c.subtitle}
                </Text>
              </View>
              <ChevronRight
                size={16}
                color={theme.primary}
                strokeWidth={2}
                style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
              />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {cards.map((c, i) => (
          <View
            key={c.key}
            style={[
              styles.dot,
              i === activeIndex
                ? { width: 16, backgroundColor: theme.primary }
                : { width: 6, backgroundColor: theme.border },
            ]}
          />
        ))}
      </View>

      {/* ── "Why loyalty" info sheet (§6) ── */}
      <Modal visible={whyVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={closeWhy}>
        <Pressable style={styles.backdrop} onPress={closeWhy} accessibilityLabel={t('common.close')}>
          <Pressable
            style={[styles.sheet, styles.whySheet, { backgroundColor: whySurface, paddingBottom: Math.max(insets.bottom + 12, 20) }]}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal
          >
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />

            <LinearGradient
              colors={['rgba(180,83,9,0.18)', 'rgba(180,83,9,0.08)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sheetIcon}
            >
              <ShieldCheck size={22} color="#B45309" strokeWidth={2} />
            </LinearGradient>

            <Text style={[styles.sheetTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
              {t('home.tipWhyTitle')}
            </Text>

            <ScrollView
              style={styles.whyScroll}
              contentContainerStyle={styles.whyScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <LinearGradient
                colors={['#0f031e', '#1a0533']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0.9 }}
                style={styles.shockCard}
              >
                <View style={styles.shockHalo} pointerEvents="none" />
                <View
                  style={[
                    styles.shockRow,
                    I18nManager.isRTL ? styles.rowRtl : styles.rowLtr,
                  ]}
                >
                  <Text style={styles.shockValue} maxFontSizeMultiplier={1.2}>
                    {t('home.whyMetricValue')}
                  </Text>
                  <Text style={styles.shockText} maxFontSizeMultiplier={1.4}>
                    {t('home.whyMetricText')}
                  </Text>
                </View>
              </LinearGradient>

              <View style={[styles.competitionRow, { borderBottomColor: whyHairlineColor }]}> 
                <View
                  style={[
                    styles.competitionMain,
                    I18nManager.isRTL ? styles.rowRtl : styles.rowLtr,
                  ]}
                >
                  <View style={[styles.peopleIconWrap, { backgroundColor: theme.primaryBg }]}> 
                    <Users size={16} color={theme.primary} strokeWidth={2} />
                  </View>
                  <Text style={[styles.competitionText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.5}>
                    {t('home.whyCompetitionText')}
                  </Text>
                </View>
              </View>

              <Text style={[styles.whySectionLabel, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                {t('home.whyBenefitsLabel')}
              </Text>

              <View style={styles.whyBenefitsList}>
                {whyBenefits.map((item, index) => (
                  <View
                    key={item.key}
                    style={[
                      styles.benefitLine,
                      index < whyBenefits.length - 1 ? { borderBottomColor: whyHairlineColor } : null,
                    ]}
                  >
                    <View
                      style={[
                        styles.benefitLineMain,
                        I18nManager.isRTL ? styles.rowRtl : styles.rowLtr,
                      ]}
                    >
                      <View style={[styles.checkCircle, { backgroundColor: 'rgba(16,185,129,0.12)' }]}> 
                        <Check size={14} color={theme.success} strokeWidth={2.5} />
                      </View>
                      <View style={styles.benefitLineBody}>
                        <Text style={[styles.benefitLineTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
                          {item.title}
                        </Text>
                        <Text style={[styles.benefitLineText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.45}>
                          {item.text}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <LinearGradient
                colors={[brandGradient[0], brandGradient[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.whyCtaGradient}
              >
                <TouchableOpacity
                  onPress={openLoyaltySettings}
                  activeOpacity={0.85}
                  style={styles.whyCtaBtn}
                  accessibilityRole="button"
                  accessibilityLabel={hasLoyaltyProgram ? t('common.gotIt') : t('home.whyCta')}
                >
                  <Text style={styles.whyCtaText} maxFontSizeMultiplier={1.25}>
                    {hasLoyaltyProgram ? t('common.gotIt') : t('home.whyCta')}
                  </Text>
                </TouchableOpacity>
              </LinearGradient>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={clientBenefitsVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={closeClientBenefits}>
        <Pressable style={styles.backdrop} onPress={closeClientBenefits} accessibilityLabel={t('common.close')}>
          <Pressable
            style={[styles.sheet, styles.clientSheet, { backgroundColor: clientSurface, paddingBottom: Math.max(insets.bottom + 12, 20) }]}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal
          >
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <View style={[styles.clientLogoFrame, { borderColor: theme.borderLight }]}> 
              <Image
                source={require('@/assets/images/jitpluslogo.png')}
                style={styles.clientLogo}
                resizeMode="contain"
                accessibilityLabel={t('home.clientBenefitsLogoHint')}
              />
            </View>
            <Text style={[styles.sheetTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
              {t('home.clientBenefitsSheetTitle')}
            </Text>

            <ScrollView
              style={styles.clientScroll}
              contentContainerStyle={styles.clientScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.clientBenefitsList}>
                {clientBenefitsRows.map((item, index) => (
                  <View
                    key={item.key}
                    style={[
                      styles.clientBenefitLine,
                      index < clientBenefitsRows.length - 1 ? { borderBottomColor: clientHairlineColor } : null,
                    ]}
                  >
                    <View style={[styles.clientBenefitMain, I18nManager.isRTL ? styles.rowRtl : styles.rowLtr]}>
                      <View style={[styles.clientBenefitIconBox, { backgroundColor: theme.primaryBg }]}> 
                        <item.Icon size={15} color={theme.primary} strokeWidth={2} />
                      </View>
                      <View style={styles.clientBenefitBody}>
                        <Text style={[styles.clientBenefitTitle, { color: theme.text }]} maxFontSizeMultiplier={1.35}>
                          {item.title}
                        </Text>
                        <Text style={[styles.clientBenefitText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.45}>
                          {item.text}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              <LinearGradient
                colors={[brandGradient[0], brandGradient[1]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.clientPrimaryCtaGradient}
              >
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={shareClientAppLink}
                  style={[styles.clientCtaBtn, I18nManager.isRTL ? styles.rowRtl : styles.rowLtr]}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.clientBenefitsShareCta')}
                >
                  <Share2 size={16} color="#FFFFFF" strokeWidth={2} />
                  <Text style={styles.clientPrimaryCtaText} maxFontSizeMultiplier={1.25}>{t('home.clientBenefitsShareCta')}</Text>
                  <ChevronRight
                    size={16}
                    color="#FFFFFF"
                    strokeWidth={2}
                    style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                  />
                </TouchableOpacity>
              </LinearGradient>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={openClientQrScreen}
                style={[
                  styles.clientSecondaryCtaBtn,
                  { borderColor: clientHairlineColor },
                  I18nManager.isRTL ? styles.rowRtl : styles.rowLtr,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('home.clientBenefitsQrCta')}
              >
                <QrCode size={16} color={theme.textSecondary} strokeWidth={2} />
                <Text style={[styles.clientSecondaryCtaText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.25}>
                  {t('home.clientBenefitsQrCta')}
                </Text>
                <ChevronRight
                  size={16}
                  color={theme.textMuted}
                  strokeWidth={2}
                  style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
                />
              </TouchableOpacity>

              <Text style={[styles.storeHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                {t('home.clientBenefitsAppHint')}
              </Text>

              <TouchableOpacity
                onPress={closeClientBenefits}
                activeOpacity={0.7}
                style={styles.clientCloseLink}
                accessibilityRole="button"
                accessibilityLabel={t('common.gotIt')}
              >
                <Text style={[styles.sheetCloseText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>
                  {t('common.gotIt')}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export default React.memo(TipsCarousel);

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -H_PAD },
  track: { paddingHorizontal: H_PAD, paddingTop: 14 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginRight: CARD_GAP,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_700Bold', letterSpacing: -0.2 },
  cardSub: { fontSize: 11.5, marginTop: 1, fontFamily: 'Lexend_400Regular' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 12 },
  dot: { height: 6, borderRadius: 3 },

  backdrop: { flex: 1, backgroundColor: 'rgba(11,15,20,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 12, alignItems: 'center' },
  whySheet: { maxHeight: '85%' },
  grabber: { width: 40, height: 4, borderRadius: 2, marginBottom: 18 },
  sheetIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', fontFamily: 'Lexend_700Bold', textAlign: 'center', letterSpacing: -0.2 },
  sheetBody: { fontSize: 14, lineHeight: 22, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 10 },
  whyScroll: { width: '100%' },
  whyScrollContent: { paddingBottom: 4 },
  shockCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    overflow: 'hidden',
    marginTop: 10,
  },
  shockHalo: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: 'rgba(252,211,77,0.12)',
    top: -68,
    right: -38,
  },
  shockRow: { alignItems: 'center', gap: 10 },
  shockValue: {
    color: '#FCD34D',
    fontSize: 26,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },
  shockText: {
    color: '#E5E7EB',
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Lexend_500Medium',
  },
  competitionRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 12,
    marginTop: 14,
  },
  competitionMain: { alignItems: 'flex-start', gap: 10 },
  peopleIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  competitionText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: 'Lexend_400Regular',
  },
  whySectionLabel: {
    marginTop: 12,
    marginBottom: 8,
    fontSize: 10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: 'Lexend_600SemiBold',
  },
  whyBenefitsList: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  benefitLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  benefitLineMain: {
    alignItems: 'flex-start',
    gap: 10,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benefitLineBody: {
    flex: 1,
  },
  benefitLineTitle: {
    fontSize: 12.5,
    fontFamily: 'Lexend_700Bold',
    lineHeight: 16,
  },
  benefitLineText: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Lexend_400Regular',
  },
  whyCtaGradient: {
    marginTop: 14,
    borderRadius: 14,
    overflow: 'hidden',
    width: '100%',
  },
  whyCtaBtn: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  whyCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  rowLtr: { flexDirection: 'row' },
  rowRtl: { flexDirection: 'row-reverse' },
  clientSheet: { maxHeight: '85%' },
  clientLogoFrame: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  clientScroll: { width: '100%' },
  clientScrollContent: { paddingTop: 10, paddingBottom: 6 },
  clientBenefitsList: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  clientBenefitLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  clientBenefitMain: { alignItems: 'flex-start', gap: 10 },
  clientBenefitIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  clientBenefitBody: { flex: 1 },
  clientBenefitTitle: {
    fontSize: 12.5,
    lineHeight: 16,
    fontFamily: 'Lexend_700Bold',
  },
  clientBenefitText: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Lexend_400Regular',
  },
  clientPrimaryCtaGradient: {
    marginTop: 14,
    borderRadius: 14,
    overflow: 'hidden',
    width: '100%',
  },
  clientCtaBtn: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  clientPrimaryCtaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
    flexShrink: 1,
  },
  clientSecondaryCtaBtn: {
    marginTop: 10,
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  clientSecondaryCtaText: {
    fontSize: 13,
    fontFamily: 'Lexend_600SemiBold',
    textAlign: 'center',
    flexShrink: 1,
  },
  benefitRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  benefitPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  benefitPillText: { fontSize: 12, fontFamily: 'Lexend_600SemiBold' },
  storeRow: { width: '100%', marginTop: 16 },
  storeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 12 },
  storeBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  storeHint: { fontSize: 12, marginTop: 10, textAlign: 'center' },
  clientLogo: { width: 44, height: 44 },
  sheetClose: { paddingVertical: 12, marginTop: 16 },
  clientCloseLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6, paddingHorizontal: 14 },
  sheetCloseText: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
});
