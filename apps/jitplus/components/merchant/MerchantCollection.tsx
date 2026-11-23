import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { formatDate } from '@jitplus/shared/src/date';
import type { ClientCollection } from '@jitplus/shared/src/collection';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, fontSize } from '@/utils/responsive';
import { AlbumGrid, AlbumHeader, useLightAlbumTone } from '@/components/collection/CollectionAlbum';
import FicheSection from './FicheSection';

interface Props {
  collection: ClientCollection;
  accent: string;
}

/**
 * The merchant's collection with the client's progress, drawn as a collection
 * album: one card per product (in colour once collected) and the gift at the end.
 * The shop logo and name are left out: the page is already the shop's.
 */
function MerchantCollection({ collection, accent }: Props) {
  const { t, locale } = useLanguage();
  const fonts = useAppFonts();
  const router = useRouter();
  const tone = useLightAlbumTone(accent);
  const { checked, total, giftCouponId } = collection;
  const remaining = total - checked;
  const openGift = (id: string) => router.push({ pathname: '/coupons/[id]', params: { id } });

  const hint = giftCouponId
    ? t('merchant.collectionGiftReady')
    : collection.completed
      ? t('merchant.collectionCompleted')
      : remaining === 1
        ? t('merchant.collectionLastOne')
        : t('merchant.collectionHint');

  return (
    <FicheSection
      title={t('merchant.collectionLabel')}
      action={giftCouponId
        ? { label: t('merchant.collectionSeeGift'), onPress: () => openGift(giftCouponId) }
        : undefined}
    >
      <AlbumHeader name={collection.name} checked={checked} total={total} tone={tone} />
      <AlbumGrid
        items={collection.items}
        giftLabel={collection.giftLabel}
        giftImageUrl={collection.giftImageUrl}
        completed={collection.completed}
        giftCouponId={giftCouponId}
        tone={tone}
        onOpenGift={openGift}
      />
      <Text style={[styles.hint, { color: tone.muted, fontFamily: fonts.regular }]}>
        {hint}
        {collection.endsAt ? ` ${t('merchant.collectionEnds', { date: formatDate(collection.endsAt, locale) })}` : ''}
      </Text>
    </FicheSection>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: fontSize.sm, lineHeight: ms(18), marginTop: hp(12) },
});

export default memo(MerchantCollection);
