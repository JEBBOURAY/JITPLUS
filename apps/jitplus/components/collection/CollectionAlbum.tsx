// The collection drawn as a real collection game: the shop's logo on the album,
// one card per product (photo in colour once collected, faded and numbered while
// missing), and the gift as the last card, locked until the album is complete.
import { memo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { Check, Gift, Lock } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import MerchantLogo from '@/components/MerchantLogo';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { resolveImageUrl } from '@/utils/imageUrl';
import { hp, ms, wp, fontSize, radius } from '@/utils/responsive';
import type { ClientCollection } from '@jitplus/shared/src/collection';

type Item = ClientCollection['items'][number];

/** Colours of the album: the merchant page (theme) or the dark games stage. */
interface AlbumTone {
  text: string;
  muted: string;
  /** Background of a missing card */
  slot: string;
  slotBorder: string;
  /** Collected tick and progress */
  accent: string;
  /** Gift card (rewards colour) */
  gift: string;
}

export function useLightAlbumTone(accent: string): AlbumTone {
  const theme = useTheme();
  return {
    text: theme.text, muted: theme.textMuted, slot: theme.bgInput, slotBorder: theme.border, accent, gift: theme.accent,
  };
}

export const STAGE_ALBUM_TONE: AlbumTone = {
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.6)',
  slot: 'rgba(255,255,255,0.06)',
  slotBorder: 'rgba(255,255,255,0.18)',
  accent: '#FBBF24',
  gift: '#FBBF24',
};

/** Initials of a product without photo ("Jus d'orange" → "JO"). */
function initials(label: string): string {
  return label.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// ── Header: shop logo, collection name, big count ─────────────────────────
// Without merchantName (on the merchant's own page) the logo and shop line are left out.

export const AlbumHeader = memo(function AlbumHeader({
  name, merchantName, logoUrl, checked, total, tone,
}: {
  name: string;
  merchantName?: string;
  logoUrl?: string | null;
  checked: number;
  total: number;
  tone: AlbumTone;
}) {
  const fonts = useAppFonts();
  return (
    <View style={styles.header}>
      {!!merchantName && <MerchantLogo logoUrl={logoUrl} merchantName={merchantName} style={styles.headerLogo} />}
      <View style={styles.headerText}>
        <Text style={[styles.headerName, { color: tone.text, fontFamily: fonts.semibold }]} numberOfLines={2}>{name}</Text>
        {!!merchantName && (
          <Text style={[styles.headerMerchant, { color: tone.muted, fontFamily: fonts.regular }]} numberOfLines={1}>
            {merchantName}
          </Text>
        )}
      </View>
      <Text style={[styles.count, { color: tone.text, fontFamily: fonts.semibold }]}>
        {checked}
        <Text style={[styles.countTotal, { color: tone.muted, fontFamily: fonts.regular }]}>/{total}</Text>
      </Text>
    </View>
  );
});

// ── Full album: grid of product cards + gift card ─────────────────────────

const GAP = wp(8);

function columnsFor(count: number): number {
  return count <= 4 ? 2 : 3;
}

export const AlbumGrid = memo(function AlbumGrid({
  items, giftLabel, giftImageUrl, completed, giftCouponId, tone, onOpenGift,
}: {
  items: Item[];
  giftLabel: string;
  giftImageUrl: string | null;
  completed: boolean;
  giftCouponId: string | null;
  tone: AlbumTone;
  onOpenGift?: (couponId: string) => void;
}) {
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const [width, setWidth] = useState(0);
  const cols = columnsFor(items.length + 1);
  // Floor: fractional widths can wrap the last card of a row to the next line.
  const cardW = width > 0 ? Math.floor((width - GAP * (cols - 1)) / cols) : 0;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const unlocked = completed || !!giftCouponId;

  const giftCard = (
    <View
      style={[
        styles.card,
        { width: cardW, borderColor: unlocked ? tone.gift : tone.slotBorder, backgroundColor: unlocked ? `${tone.gift}1F` : tone.slot },
        !unlocked && styles.dashed,
      ]}
    >
      <View style={[styles.photo, styles.giftPhoto, { width: cardW - 2, height: cardW - 2 }]}>
        {giftImageUrl ? (
          <>
            <Image
              source={resolveImageUrl(giftImageUrl)}
              style={[StyleSheet.absoluteFill, !unlocked && styles.faded]}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessible={false}
            />
            <View style={[styles.stamp, { backgroundColor: unlocked ? tone.gift : 'rgba(15,23,42,0.55)' }]}>
              {unlocked
                ? <Gift size={ms(13)} color="#fff" strokeWidth={2.5} />
                : <Lock size={ms(12)} color="#fff" strokeWidth={2.5} />}
            </View>
          </>
        ) : unlocked
          ? <Gift size={ms(30)} color={tone.gift} strokeWidth={1.75} />
          : <Lock size={ms(24)} color={tone.muted} strokeWidth={1.75} />}
      </View>
      <Text style={[styles.cardLabel, { color: tone.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{giftLabel}</Text>
      <Text style={[styles.cardState, { color: unlocked ? tone.gift : tone.muted, fontFamily: fonts.medium }]} numberOfLines={1}>
        {unlocked ? t('collections.album.giftWon') : t('collections.album.giftLocked')}
      </Text>
    </View>
  );

  return (
    <View style={styles.grid} onLayout={onLayout}>
      {cardW > 0 && items.map((item, i) => (
        <View
          key={item.id}
          style={[
            styles.card,
            { width: cardW, borderColor: item.checked ? tone.accent : tone.slotBorder, backgroundColor: item.checked ? 'transparent' : tone.slot },
            !item.checked && styles.dashed,
          ]}
          accessible
          accessibilityLabel={t(item.checked ? 'collections.album.itemCollectedA11y' : 'collections.album.itemMissingA11y', { label: item.label })}
        >
          <View style={[styles.photo, { width: cardW - 2, height: cardW - 2, backgroundColor: tone.slot }]}>
            {item.imageUrl ? (
              <Image
                source={resolveImageUrl(item.imageUrl)}
                style={[StyleSheet.absoluteFill, !item.checked && styles.faded]}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
                accessible={false}
              />
            ) : (
              <Text style={[styles.initials, { color: item.checked ? tone.accent : tone.muted, fontFamily: fonts.semibold }]}>
                {initials(item.label)}
              </Text>
            )}
            {item.checked ? (
              <View style={[styles.stamp, { backgroundColor: tone.accent }]}>
                <Check size={ms(14)} color="#fff" strokeWidth={3} />
              </View>
            ) : (
              <View style={styles.number}>
                <Text style={[styles.numberText, { fontFamily: fonts.semibold }]}>{i + 1}</Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.cardLabel, styles.itemLabel, { color: item.checked ? tone.text : tone.muted, fontFamily: fonts.medium }]}
            numberOfLines={2}
          >
            {item.label}
          </Text>
        </View>
      ))}
      {cardW > 0 && (giftCouponId && onOpenGift ? (
        <TouchableOpacity
          onPress={() => onOpenGift(giftCouponId)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`${giftLabel}, ${t('collections.album.giftWon')}`}
        >
          {giftCard}
        </TouchableOpacity>
      ) : giftCard)}
    </View>
  );
});

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  headerLogo: { width: ms(44), height: ms(44), borderRadius: ms(22), backgroundColor: '#fff' },
  headerText: { flex: 1, gap: hp(2) },
  headerName: { fontSize: fontSize.md, lineHeight: ms(20) },
  headerMerchant: { fontSize: fontSize.sm },
  count: { fontSize: fontSize.xl, fontVariant: ['tabular-nums'] },
  countTotal: { fontSize: fontSize.md },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: hp(16) },
  card: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden', paddingBottom: hp(8) },
  dashed: { borderStyle: 'dashed' },
  photo: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  giftPhoto: { backgroundColor: 'transparent' },
  faded: { opacity: 0.3 },
  initials: { fontSize: fontSize.lg },
  stamp: {
    position: 'absolute', top: ms(6), end: ms(6), width: ms(24), height: ms(24), borderRadius: ms(12),
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  number: {
    position: 'absolute', top: ms(6), start: ms(6), minWidth: ms(22), height: ms(22), borderRadius: ms(11),
    paddingHorizontal: ms(5), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.55)',
  },
  numberText: { color: '#fff', fontSize: fontSize.xs, fontVariant: ['tabular-nums'] },
  cardLabel: { fontSize: fontSize.sm, lineHeight: ms(17), marginTop: hp(6), paddingHorizontal: wp(8) },
  // Two lines tall for every card: the gift's label + state line takes the same room.
  itemLabel: { minHeight: ms(17) * 2 },
  cardState: { fontSize: fontSize.xs, lineHeight: ms(17), paddingHorizontal: wp(8) },
});
