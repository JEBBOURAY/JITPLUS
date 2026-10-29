import React, { useCallback } from 'react';
import {
  ActivityIndicator, StatusBar, StyleSheet, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
// Gesture-handler ScrollView: the scratch Pan (minDistance 0) activates on
// touch-down and cancels scrolling only while the finger is on the coating.
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AlertCircle, Clock, RefreshCw, X } from 'lucide-react-native';

import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { wp, hp, ms, fontSize as FS } from '@/utils/responsive';
import { useAppFonts } from '@/utils/fonts';
import { resolveImageUrl } from '@/utils/imageUrl';
import { useScratchSession } from '@/hooks/useScratchSession';
import { getScratchDesign, rewardDisplay } from '@jitplus/shared/src/scratch';
import { ScratchCardFace, getScratchZone, scratchCardHeight } from '@jitplus/shared/src/scratch/ScratchCardFace';
import ScratchCardInfo from '@/components/scratch/ScratchCardInfo';
import ScratchCoating from '@/components/scratch/ScratchCoating';
import ScratchConfetti from '@/components/scratch/ScratchConfetti';
import ScratchIntro from '@/components/scratch/ScratchIntro';
import ScratchResultPanel from '@/components/scratch/ScratchResultPanel';
import ScratchStateView from '@/components/scratch/ScratchStateView';
import { scratchSharedStyles as shared } from '@/components/scratch/scratchStyles';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const BG_GRADIENT = ['#24104A', '#150830', '#0B0418'] as const;

export default function ScratchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, isRTL, locale } = useLanguage();
  const fonts = useAppFonts();
  const { width: screenW } = useWindowDimensions();
  const params = useLocalSearchParams<{ id: string; mode?: string }>();
  const isCampaignMode = params.mode === 'campaign';

  // ── Scratch layer (covers the zone under the merchant header) ──
  const cardW = Math.min(screenW - wp(40), 400);
  const cardH = scratchCardHeight(cardW);
  const zone = getScratchZone(cardW);

  const {
    card, isLoading, isError, knownCoupon, drawError, drawGone, revealed, coverGone, showRevealAll, reduceMotion,
    scratchable, scratching, showScratchLabel, triggerDraw, revealAll, pan, cardStyle, labelStyle, coverStyle,
    scratchPathProps, confettiProgress,
  } = useScratchSession(params.id, isCampaignMode, zone.width, zone.height);

  const design = getScratchDesign(card?.campaign.designId);

  const reward = knownCoupon
    ? rewardDisplay({ type: knownCoupon.type, value: knownCoupon.value, label: knownCoupon.label }, t)
    : null;
  const rewardText = reward?.headline ?? null;

  const goBack = useCallback(() => { router.back(); }, [router]);
  const openMyCard = useCallback(() => { router.dismissTo('/(tabs)/qr'); }, [router]);

  const merchantName = card?.merchant.nom ?? '';

  const renderState = (icon: React.ReactNode, title: string) => (
    <ScratchStateView icon={icon} title={title} onBack={goBack} fonts={fonts} t={t} />
  );

  const renderBody = () => {
    if (isLoading) {
      return (
        <View style={shared.stateWrap}>
          <View style={[styles.placeholder, { width: cardW, height: cardH }]}>
            <ActivityIndicator color={palette.goldLight} />
          </View>
          <Text style={[shared.hint, { fontFamily: fonts.regular }]}>{t('scratch.screen.loading')}</Text>
        </View>
      );
    }
    if (isError || !card) {
      return renderState(<AlertCircle size={ms(28)} color="#F87171" strokeWidth={1.8} />, t('scratch.screen.notFound'));
    }
    if (card.status === 'EXPIRED' || card.status === 'CANCELLED') {
      return renderState(
        <Clock size={ms(28)} color={palette.goldLight} strokeWidth={1.8} />,
        card.status === 'EXPIRED' ? t('scratch.screen.expired') : t('scratch.screen.cancelled'),
      );
    }
    if (drawGone && !knownCoupon) {
      return renderState(<Clock size={ms(28)} color={palette.goldLight} strokeWidth={1.8} />, t('scratch.screen.unavailable'));
    }

    return (
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + hp(28) }]}
        showsVerticalScrollIndicator={false}
      >
        {scratching && <ScratchIntro expiresAt={card.expiresAt} locale={locale} fonts={fonts} t={t} />}

        <Animated.View style={[styles.cardWrap, cardStyle]}>
          <View pointerEvents="none" style={[styles.cardGlow, { width: cardW * 0.85, height: cardH * 0.7, backgroundColor: design.gradient[0] }]} />
          <View style={[styles.cardShadow, { width: cardW, height: cardH }]}>
            <ScratchCardFace
              designId={card.campaign.designId}
              width={cardW}
              merchantName={card.merchant.nom}
              logoUrl={card.merchant.logoUrl ? resolveImageUrl(card.merchant.logoUrl) : null}
              caption={knownCoupon ? t('scratch.card.youWon') : t('scratch.card.alwaysWin')}
              rewardText={rewardText}
              rewardDetail={reward?.detail}
              footer={card.campaign.name || t('scratch.card.offeredBy', { merchant: card.merchant.nom })}
              isRTL={isRTL}
            />
            <ScratchCoating
              zone={zone}
              design={design}
              pan={pan}
              coverStyle={coverStyle}
              labelStyle={labelStyle}
              scratchPathProps={scratchPathProps}
              coverVisible={scratchable && !coverGone}
              scratching={scratching}
              showScratchLabel={showScratchLabel}
              fonts={fonts}
              t={t}
            />
          </View>
        </Animated.View>

        {scratching ? (
          <View style={styles.scratchHelp}>
            <Text style={[shared.hint, { fontFamily: fonts.regular }]}>{t('scratch.screen.hint')}</Text>
            {drawError && (
              <TouchableOpacity onPress={triggerDraw} activeOpacity={0.8} style={shared.ghostBtn} accessibilityRole="button">
                <RefreshCw size={ms(16)} color="#fff" strokeWidth={2} />
                <Text style={[shared.ghostBtnText, { fontFamily: fonts.semibold }]}>{t('scratch.screen.drawError')}</Text>
              </TouchableOpacity>
            )}
            {showRevealAll && (
              <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(300)}>
                <TouchableOpacity onPress={revealAll} activeOpacity={0.8} style={shared.ghostBtn} accessibilityRole="button">
                  <Text style={[shared.ghostBtnText, { fontFamily: fonts.semibold }]}>{t('scratch.screen.revealAll')}</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        ) : (
          <ScratchResultPanel
            coupon={knownCoupon}
            reward={reward}
            drawError={drawError}
            reduceMotion={reduceMotion}
            scratchable={scratchable}
            merchantName={merchantName}
            locale={locale}
            fonts={fonts}
            t={t}
            onRetry={triggerDraw}
            onDone={goBack}
            onOpenMyCard={openMyCard}
          />
        )}

        <ScratchCardInfo message={card.campaign.message} merchantName={merchantName} fonts={fonts} t={t} />
      </ScrollView>
    );
  };

  return (
    <LinearGradient colors={BG_GRADIENT} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + hp(8) }]}>
        <TouchableOpacity
          onPress={goBack}
          activeOpacity={0.7}
          style={styles.iconBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <X size={ms(20)} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontFamily: fonts.bold }]} numberOfLines={1} accessibilityRole="header">
          {t('scratch.card.title')}
        </Text>
        <View style={styles.iconBtnSpacer} />
      </View>
      {renderBody()}
      {revealed && !reduceMotion && (
        <ScratchConfetti progress={confettiProgress} screenW={screenW} accent={design.accent} />
      )}
    </LinearGradient>
  );
}

const ICON_BTN = ms(40);

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(16),
    paddingBottom: hp(8),
  },
  headerTitle: { flex: 1, color: '#fff', fontSize: FS.lg, textAlign: 'center', marginHorizontal: ms(8) },
  iconBtn: {
    width: ICON_BTN,
    height: ICON_BTN,
    borderRadius: ICON_BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  iconBtnSpacer: { width: ICON_BTN, height: ICON_BTN },

  scroll: { alignItems: 'center', paddingTop: hp(10), paddingHorizontal: wp(20) },

  cardWrap: { alignItems: 'center', justifyContent: 'center' },
  cardGlow: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.45,
    shadowColor: palette.violetVivid,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 50,
  },
  cardShadow: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 16,
  },

  scratchHelp: { alignItems: 'center', gap: hp(12), marginTop: hp(18) },

  placeholder: {
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
});
