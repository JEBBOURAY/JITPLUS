import { useCallback, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHubPhase } from '@/hooks/useHubPhase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Gift } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { formatDate } from '@/utils/date';
import { wp, hp } from '@/utils/responsive';
import { useScratchCards } from '@/hooks/useScratchHooks';
import { splitScratchCards } from '@/utils/scratchHistory';
import { GameStateCard, gameListStyles as list } from '@/components/GameStage';
import GameHubScreen from '@/components/GameHubScreen';
import MerchantLogo from '@/components/MerchantLogo';
import ScratchHistory from '@/components/scratch/ScratchHistory';
import { ScratchRules } from '@/components/scratch/ScratchCardInfo';
import { ScratchCardCover, ScratchCardFace } from '@jitplus/shared/src/scratch/ScratchCardFace';
import type { ScratchCardDto } from '@jitplus/shared/src/scratch';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';


/** Scratch cards hub: cards waiting to be scratched, empty state and history. */
export default function ScratchHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale, isRTL } = useLanguage();
  const fonts = useAppFonts();
  const { width: screenW } = useWindowDimensions();
  const params = useLocalSearchParams<{ view?: string }>();

  const { data: cards = [], isLoading, isError, refetch } = useScratchCards(undefined);
  const { pending, toUse, past } = useMemo(() => splitScratchCards(cards), [cards]);

  const { inHistory, showMain, showHistory } = useHubPhase(params.view);

  const goBack = useCallback(() => { router.back(); }, [router]);
  const openCard = useCallback((card: ScratchCardDto) => {
    router.push({ pathname: '/scratch/[id]', params: { id: card.id } });
  }, [router]);

  const previewW = Math.min(screenW - wp(64), 340);

  const renderMain = () => {
    if (pending.length > 0) {
      return (
        <Animated.View entering={FadeInDown.duration(200)} style={styles.pendingBlock}>
          <Text style={[list.section, { fontFamily: fonts.semibold }]}>
            {t('scratch.hub.toScratch', { count: pending.length })}
          </Text>
          <View style={list.group}>
            {pending.map((card) => {
              const merchant = card.merchant.nom || card.campaign.name;
              return (
                <TouchableOpacity
                  key={card.id}
                  style={list.row}
                  onPress={() => openCard(card)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${merchant}, ${t('scratch.hub.scratchCta')}`}
                >
                  <MerchantLogo logoUrl={card.merchant.logoUrl} merchantName={merchant} style={list.logo} />
                  <View style={list.rowBody}>
                    <Text style={[list.rowTitle, { fontFamily: fonts.semibold }]} numberOfLines={1}>{merchant}</Text>
                    <Text style={[list.rowMeta, { fontFamily: fonts.regular }]} numberOfLines={1}>
                      {t('scratch.card.expiresOn', { date: formatDate(card.expiresAt, locale) })}
                    </Text>
                  </View>
                  <View style={list.pill}>
                    <Text style={[list.pillText, { fontFamily: fonts.bold }]}>{t('scratch.hub.scratchCta')}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeInDown.duration(200)} style={styles.emptyBlock}>
        <View style={[styles.preview, { width: previewW }]} pointerEvents="none" importantForAccessibility="no-hide-descendants">
          <ScratchCardFace
            width={previewW}
            merchantName="JitPlus"
            caption={t('scratch.card.alwaysWin')}
            rewardText={null}
            isRTL={isRTL}
          />
          <ScratchCardCover width={previewW} label={t('scratch.card.scratchHere')} />
        </View>

        <GameStateCard
          Icon={Gift}
          title={t('scratch.hub.emptyTitle')}
          hint={t('scratch.hub.emptyHint')}
          action={toUse.length > 0
            ? { label: t('scratch.hub.viewPrizes'), onPress: showHistory, badge: toUse.length }
            : undefined}
          fonts={fonts}
        />
      </Animated.View>
    );
  };

  return (
    <GameHubScreen
      title={t('home.scratchTileTitle')}
      historyLabel={t('scratch.hub.history')}
      badgeLabel={t('scratch.hub.toUse', { count: toUse.length })}
      badgeCount={toUse.length}
      inHistory={inHistory}
      onClose={goBack}
      onShowMain={showMain}
      onShowHistory={showHistory}
      isLoading={isLoading}
      loadError={isError && !cards.length ? { title: t('scratch.hub.loadError'), onRetry: () => { void refetch(); } } : null}
      history={(
        <ScratchHistory
          toUse={toUse}
          past={past}
          locale={locale}
          bottomInset={insets.bottom}
          fonts={fonts}
          t={t}
          onOpen={openCard}
        />
      )}
      footer={<ScratchRules fonts={fonts} t={t} style={styles.rules} />}
    >
      {renderMain()}
    </GameHubScreen>
  );
}

const styles = StyleSheet.create({
  pendingBlock: { alignSelf: 'stretch' },

  emptyBlock: { alignItems: 'center', paddingHorizontal: wp(24), paddingTop: hp(16), gap: hp(22) },
  preview: { opacity: 0.45, transform: [{ rotate: '-4deg' }] },

  rules: { paddingHorizontal: wp(24), marginTop: hp(26) },
});
