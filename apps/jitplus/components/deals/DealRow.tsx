import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Flame, Globe, Hourglass, MapPin, Store } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { formatDistance } from '@/utils/distance';
import { ms, wp, hp } from '@/utils/responsive';
import { dealBadgeLabel, dealPrices, dealTimeLeftLabel } from '@/utils/dealVisual';
import type { ClientDealSummary } from '@jitplus/shared/src/deals';
import DealThumb from './DealThumb';

export const DEAL_ROW_THUMB = 88;

interface Props {
  deal: ClientDealSummary;
  onPress: (deal: ClientDealSummary) => void;
  /** On the merchant page the merchant name is redundant. */
  hideMerchant?: boolean;
}

/** Compact deal row: square visual, title on two lines, prices, merchant, time left. */
function DealRow({ deal, onPress, hideMerchant }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const badge = dealBadgeLabel(deal, t);
  const { price, original } = dealPrices(deal, t, locale);
  const time = dealTimeLeftLabel(deal.endsAt, t);
  const timeColor = time.urgent ? theme.warning : theme.textMuted;
  const online = deal.scope === 'ONLINE';
  const ScopeIcon = online ? Globe : Store;
  const metaParts = [
    hideMerchant ? null : deal.merchant.nom,
    online ? t('deals.scope.ONLINE') : null,
  ].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() => onPress(deal)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.bgCard, borderColor: theme.border },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={[deal.title, badge, price, hideMerchant ? null : deal.merchant.nom, time.text].filter(Boolean).join(', ')}
    >
      <DealThumb
        imageUrl={deal.imageUrl}
        coverUrl={deal.merchant.coverUrl}
        themeColor={deal.merchant.themeColor}
        category={deal.merchant.categorie}
        badge={badge}
        width={ms(DEAL_ROW_THUMB)}
      />
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {deal.title}
        </Text>
        {(price || original || badge) && (
          <View style={styles.priceRow}>
            {price ? (
              <Text style={[styles.price, { color: theme.danger, fontFamily: fonts.bold }]} maxFontSizeMultiplier={1.3}>{price}</Text>
            ) : null}
            {original ? (
              <Text
                style={[styles.original, { color: theme.textMuted, fontFamily: fonts.regular }, deal.type === 'PRICE_DROP' && styles.struck]}
                maxFontSizeMultiplier={1.3}
              >
                {deal.type === 'FREE_ITEM' ? t('deals.valueOf', { value: original }) : original}
              </Text>
            ) : null}
            {badge ? (
              <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                <Text style={[styles.badgeText, { fontFamily: fonts.bold }]} maxFontSizeMultiplier={1.2}>{badge}</Text>
              </View>
            ) : null}
          </View>
        )}
        {(!!metaParts || deal.distanceKm != null) && (
          <View style={styles.metaRow}>
            <ScopeIcon size={ms(13)} color={theme.textMuted} strokeWidth={2} />
            {!!metaParts && (
              <Text style={[styles.meta, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {metaParts}
              </Text>
            )}
            {deal.distanceKm != null && (
              <>
                <MapPin size={ms(12)} color={theme.primary} strokeWidth={2} />
                <Text style={[styles.distance, { color: theme.primary, fontFamily: fonts.semibold }]} maxFontSizeMultiplier={1.3}>
                  {formatDistance(deal.distanceKm)}
                </Text>
              </>
            )}
          </View>
        )}
        <View style={styles.metaRow}>
          <Hourglass size={ms(13)} color={timeColor} strokeWidth={2} />
          <Text style={[styles.meta, { color: timeColor, fontFamily: fonts.regular }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {time.text}
          </Text>
          {deal.isPopular && (
            <View style={[styles.popular, { backgroundColor: `${theme.warning}1F` }]}>
              <Flame size={ms(11)} color={theme.warning} strokeWidth={2.4} />
              <Text style={[styles.popularText, { color: theme.warning, fontFamily: fonts.semibold }]} maxFontSizeMultiplier={1.2}>
                {t('deals.popular')}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default React.memo(DealRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: wp(12), padding: ms(10), borderRadius: ms(16),
    borderWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start',
  },
  pressed: { opacity: 0.85 },
  body: { flex: 1, gap: hp(4) },
  title: { fontSize: ms(14), lineHeight: ms(19) },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: wp(6) },
  price: { fontSize: ms(15) },
  original: { fontSize: ms(12) },
  struck: { textDecorationLine: 'line-through' },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#FFFFFF', fontSize: ms(11) },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: wp(5) },
  meta: { flexShrink: 1, fontSize: ms(12) },
  distance: { fontSize: ms(12) },
  popular: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, marginStart: 'auto' },
  popularText: { fontSize: ms(10) },
});
