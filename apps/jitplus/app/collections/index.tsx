import { useCallback, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHubPhase } from '@/hooks/useHubPhase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Gift } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { wp, hp, ms } from '@/utils/responsive';
import { useMyCollections } from '@/hooks/useCollectionHooks';
import { GameStateCard, gameListStyles as list } from '@/components/GameStage';
import GameHubScreen from '@/components/GameHubScreen';
import { AlbumGrid, AlbumHeader, STAGE_ALBUM_TONE } from '@/components/collection/CollectionAlbum';
import CollectionHistory from '@/components/collection/CollectionHistory';
import { splitCollectionGifts } from '@/utils/collectionHistory';
import type { ClientCollectionCard } from '@jitplus/shared/src/collection';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';


/** Collections hub: progress in every shop of the client, and the gifts won (history). */
export default function CollectionsHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const fonts = useAppFonts();
  const params = useLocalSearchParams<{ view?: string }>();

  const { data, isLoading, isError, refetch } = useMyCollections();
  const collections = data?.collections ?? [];
  const { toUse, past } = useMemo(() => splitCollectionGifts(data?.history ?? []), [data?.history]);

  const { inHistory, showMain, showHistory } = useHubPhase(params.view);

  const goBack = useCallback(() => { router.back(); }, [router]);
  const openCoupon = useCallback((couponId: string) => {
    router.push({ pathname: '/coupons/[id]', params: { id: couponId } });
  }, [router]);
  // The row always opens the progress (what is left to buy); the gift pill opens the coupon.
  const openCollection = useCallback((card: ClientCollectionCard) => {
    router.push({ pathname: '/merchant/[id]', params: { id: card.merchant.id, tab: 'loyalty' } });
  }, [router]);

  const renderMain = () => {
    if (collections.length === 0) {
      return (
        <Animated.View entering={FadeInDown.duration(200)} style={styles.emptyBlock}>
          <GameStateCard
            Icon={Gift}
            title={t('collections.hub.emptyTitle')}
            hint={t('collections.hub.emptyHint')}
            action={toUse.length > 0
              ? { label: t('collections.hub.viewGifts'), onPress: showHistory, badge: toUse.length }
              : undefined}
            fonts={fonts}
          />
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeInDown.duration(200)}>
        <Text style={[list.section, { fontFamily: fonts.semibold }]}>
          {t('collections.hub.inProgress', { count: collections.length })}
        </Text>
        {collections.map((card) => {
          const merchant = card.merchant.nom;
          const progress = t('merchant.collectionProgress', { checked: card.checked, total: card.total });
          return (
            <View key={card.id} style={[list.group, styles.album]}>
              <TouchableOpacity
                onPress={() => openCollection(card)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={t('collections.hub.rowA11y', { collection: card.name, merchant, progress })}
                accessibilityHint={t('collections.hub.openShopHint')}
              >
                <AlbumHeader
                  name={card.name}
                  merchantName={merchant}
                  logoUrl={card.merchant.logoUrl}
                  checked={card.checked}
                  total={card.total}
                  tone={STAGE_ALBUM_TONE}
                />
              </TouchableOpacity>
              <AlbumGrid
                items={card.items}
                giftLabel={card.giftLabel}
                giftImageUrl={card.giftImageUrl}
                completed={card.completed}
                giftCouponId={card.giftCouponId}
                tone={STAGE_ALBUM_TONE}
                onOpenGift={openCoupon}
              />
            </View>
          );
        })}
        <Text style={[styles.footHint, { fontFamily: fonts.regular }]}>{t('merchant.collectionHint')}</Text>
      </Animated.View>
    );
  };

  return (
    <GameHubScreen
      title={t('home.collectionTileTitle')}
      historyLabel={t('collections.hub.history')}
      badgeLabel={t('collections.hub.toUse', { count: toUse.length })}
      badgeCount={toUse.length}
      inHistory={inHistory}
      onClose={goBack}
      onShowMain={showMain}
      onShowHistory={showHistory}
      isLoading={isLoading}
      loadError={isError && !data ? { title: t('collections.hub.loadError'), onRetry: () => { void refetch(); } } : null}
      history={(
        <CollectionHistory
          toUse={toUse}
          past={past}
          locale={locale}
          bottomInset={insets.bottom}
          fonts={fonts}
          t={t}
          onOpen={openCoupon}
        />
      )}
    >
      {renderMain()}
    </GameHubScreen>
  );
}

const styles = StyleSheet.create({
  album: { padding: ms(14), marginBottom: hp(10) },
  footHint: {
    color: 'rgba(255,255,255,0.45)', fontSize: ms(11), lineHeight: ms(16),
    paddingHorizontal: wp(24), marginTop: hp(14),
  },

  emptyBlock: { alignItems: 'center', paddingHorizontal: wp(24), paddingTop: hp(40) },
});
