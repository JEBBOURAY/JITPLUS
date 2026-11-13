import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, BackHandler, ScrollView, StatusBar, StyleSheet, TouchableOpacity,
  useWindowDimensions, View,
} from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Gift, Info, RefreshCw } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { formatDate } from '@/utils/date';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { useScratchCards } from '@/hooks/useScratchHooks';
import { splitScratchCards } from '@/utils/scratchHistory';
import { GameHeader, GameStateCard } from '@/components/GameStage';
import MerchantLogo from '@/components/MerchantLogo';
import ScratchHistory from '@/components/scratch/ScratchHistory';
import { ScratchCardCover, ScratchCardFace } from '@jitplus/shared/src/scratch/ScratchCardFace';
import type { ScratchCardDto } from '@jitplus/shared/src/scratch';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const BG_GRADIENT = ['#24104A', '#150830', '#0B0418'] as const;

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

  const [phase, setPhase] = useState<'main' | 'history'>(params.view === 'history' ? 'history' : 'main');

  useEffect(() => {
    if (phase !== 'history') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setPhase('main');
      return true;
    });
    return () => sub.remove();
  }, [phase]);

  const goBack = useCallback(() => { router.back(); }, [router]);
  const showMain = useCallback(() => setPhase('main'), []);
  const showHistory = useCallback(() => setPhase('history'), []);
  const openCard = useCallback((card: ScratchCardDto) => {
    router.push({ pathname: '/scratch/[id]', params: { id: card.id } });
  }, [router]);

  const previewW = Math.min(screenW - wp(64), 340);

  const renderMain = () => {
    if (isLoading) {
      return <ActivityIndicator color={palette.goldLight} style={{ marginTop: hp(80) }} />;
    }
    if (isError && !cards.length) {
      return (
        <GameStateCard
          title={t('scratch.hub.loadError')}
          action={{ label: t('common.retry'), onPress: () => { void refetch(); }, Icon: RefreshCw }}
          fonts={fonts}
        />
      );
    }

    if (pending.length > 0) {
      return (
        <Animated.View entering={FadeInDown.duration(200)} style={styles.pendingBlock}>
          <Text style={[styles.section, { fontFamily: fonts.semibold }]}>
            {t('scratch.hub.toScratch', { count: pending.length })}
          </Text>
          <View style={styles.group}>
            {pending.map((card) => {
              const merchant = card.merchant.nom || card.campaign.name;
              return (
                <TouchableOpacity
                  key={card.id}
                  style={styles.row}
                  onPress={() => openCard(card)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${merchant}, ${t('scratch.hub.scratchCta')}`}
                >
                  <MerchantLogo logoUrl={card.merchant.logoUrl} merchantName={merchant} style={styles.logo} />
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { fontFamily: fonts.semibold }]} numberOfLines={1}>{merchant}</Text>
                    <Text style={[styles.rowMeta, { fontFamily: fonts.regular }]} numberOfLines={1}>
                      {t('scratch.card.expiresOn', { date: formatDate(card.expiresAt, locale) })}
                    </Text>
                  </View>
                  <View style={styles.scratchPill}>
                    <Text style={[styles.scratchPillText, { fontFamily: fonts.bold }]}>{t('scratch.hub.scratchCta')}</Text>
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
            ? { label: t('scratch.hub.viewPrizes'), onPress: () => setPhase('history'), badge: toUse.length }
            : undefined}
          fonts={fonts}
        />
      </Animated.View>
    );
  };

  return (
    <LinearGradient colors={BG_GRADIENT} style={styles.root}>
      <StatusBar barStyle="light-content" />
      <GameHeader
        inHistory={phase === 'history'}
        title={phase === 'history' ? t('scratch.hub.history') : t('home.scratchTileTitle')}
        historyLabel={t('scratch.hub.history')}
        badgeLabel={t('scratch.hub.toUse', { count: toUse.length })}
        badgeCount={toUse.length}
        isRTL={isRTL}
        topInset={insets.top}
        fonts={fonts}
        t={t}
        onClose={goBack}
        onBack={showMain}
        onOpenHistory={showHistory}
      />

      {phase === 'history' ? (
        <Animated.View key="history" entering={FadeIn.duration(220)} style={styles.body}>
          <ScratchHistory
            toUse={toUse}
            past={past}
            locale={locale}
            bottomInset={insets.bottom}
            fonts={fonts}
            t={t}
            onOpen={openCard}
          />
        </Animated.View>
      ) : (
        <Animated.View key="main" entering={FadeIn.duration(220)} style={styles.body}>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + hp(28) }]}
            showsVerticalScrollIndicator={false}
          >
            {renderMain()}

            <View style={styles.legal}>
              <View style={styles.legalHeader}>
                <Info size={ms(14)} color="rgba(255,255,255,0.6)" strokeWidth={2} />
                <Text style={[styles.legalTitle, { fontFamily: fonts.semibold }]}>{t('scratch.rules.title')}</Text>
              </View>
              <Text style={[styles.legalText, { fontFamily: fonts.regular }]}>{t('scratch.rules.body')}</Text>
            </View>
          </ScrollView>
        </Animated.View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  scroll: { paddingTop: hp(8) },

  pendingBlock: { alignSelf: 'stretch' },
  section: {
    color: 'rgba(255,255,255,0.9)', fontSize: FS.sm,
    marginTop: hp(10), marginBottom: hp(4), paddingHorizontal: wp(20),
  },
  group: {
    marginHorizontal: wp(16), marginTop: hp(6), borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: ms(12), paddingHorizontal: ms(14), paddingVertical: hp(12),
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  logo: { width: ms(42), height: ms(42), borderRadius: ms(12), backgroundColor: '#fff' },
  rowBody: { flex: 1, gap: hp(2) },
  rowTitle: { color: '#fff', fontSize: FS.md },
  rowMeta: { color: 'rgba(255,255,255,0.55)', fontSize: FS.xs },
  scratchPill: {
    paddingHorizontal: ms(14),
    paddingVertical: ms(7),
    borderRadius: 999,
    backgroundColor: palette.goldLight,
  },
  scratchPillText: { color: '#3B1D06', fontSize: FS.xs },

  emptyBlock: { alignItems: 'center', paddingHorizontal: wp(24), paddingTop: hp(16), gap: hp(22) },
  preview: { opacity: 0.45, transform: [{ rotate: '-4deg' }] },

  legal: { alignSelf: 'stretch', paddingHorizontal: wp(24), marginTop: hp(26), gap: hp(6) },
  legalHeader: { flexDirection: 'row', alignItems: 'center', gap: ms(6) },
  legalTitle: { color: 'rgba(255,255,255,0.7)', fontSize: FS.xs },
  legalText: { color: 'rgba(255,255,255,0.45)', fontSize: ms(11), lineHeight: ms(16) },
});
