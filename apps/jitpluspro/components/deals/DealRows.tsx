import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Globe, Hourglass } from 'lucide-react-native';
import { JitStore } from '@/components/icons';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { StatusPill } from '@/components/scratch/ScratchUI';
import type { DealDisplayStatus, DealOffer, DealScope, DealType } from '@jitplus/shared/src/deals';
import DealThumb from './DealThumb';
import { dealBadgeLabel, dealPrices, dealTimeLeftLabel } from './dealVisual';

const DEAL_ROW_THUMB = 88;

function statusColor(theme: ThemeColors, status: DealDisplayStatus): string {
  switch (status) {
    case 'LIVE':
      return theme.success;
    case 'SCHEDULED':
      return theme.warning;
    case 'REMOVED':
      return theme.danger;
    default:
      return theme.textMuted;
  }
}

export function DealStatusPill({ status }: { status: DealDisplayStatus }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return <StatusPill label={t(`deals.status.${status}`)} color={statusColor(theme, status)} />;
}

export interface DealMerchantLook {
  nom: string;
  coverUrl?: string | null;
  themeColor?: string | null;
  categorie?: string | null;
}

/** The signed-in merchant's name and visuals, as shown on their deals. */
export function useDealMerchantLook(): DealMerchantLook {
  const merchant = useAuthStore((s) => s.merchant);
  return useMemo(() => ({
    nom: merchant?.nom ?? '',
    coverUrl: merchant?.coverUrl ?? null,
    themeColor: merchant?.themeColor ?? null,
    categorie: merchant?.categorie ?? null,
  }), [merchant?.nom, merchant?.coverUrl, merchant?.themeColor, merchant?.categorie]);
}

/** Promo price, original price (struck for a price drop, "value of" for a free item) and badge. */
export function DealPriceRow({ type, price, original, badge, large }: {
  type: DealType;
  price: string | null;
  original: string | null;
  badge: string | null;
  /** Bigger texts, for the deal detail */
  large?: boolean;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row } = useDir();
  if (!price && !original && !badge) return null;
  return (
    <View style={[styles.priceRow, { flexDirection: row }]}>
      {price ? <Text style={[styles.price, large && styles.priceLarge, { color: theme.danger }]} maxFontSizeMultiplier={1.3}>{price}</Text> : null}
      {original ? (
        <Text
          style={[styles.original, large && styles.originalLarge, { color: theme.textMuted }, type === 'PRICE_DROP' && styles.struck]}
          maxFontSizeMultiplier={1.3}
        >
          {type === 'FREE_ITEM' ? t('deals.valueOf', { value: original }) : original}
        </Text>
      ) : null}
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.danger }]}>
          <Text style={[styles.badgeText, large && styles.badgeTextLarge]} maxFontSizeMultiplier={1.2}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The deal as clients see it in the JitPlus list (compact, Dealabs style):
 * square visual, title on two lines, prices and badge, merchant, time left.
 */
export const DealPreviewRow = React.memo(function DealPreviewRow({ title, offer, scope, imageUrl, endsAt, merchant }: {
  title: string;
  offer: Required<DealOffer>;
  scope: DealScope;
  imageUrl: string | null;
  endsAt: string;
  merchant: DealMerchantLook;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign } = useDir();
  const badge = dealBadgeLabel(offer, t);
  const { price, original } = dealPrices(offer, t, locale);
  const time = dealTimeLeftLabel(endsAt, t);
  const timeColor = time.urgent ? theme.warning : theme.textMuted;
  const ScopeIcon = scope === 'ONLINE' ? Globe : JitStore;

  return (
    <View style={[styles.row, { flexDirection: row, backgroundColor: theme.bgCard }]}>
      <DealThumb
        imageUrl={imageUrl}
        coverUrl={merchant.coverUrl}
        themeColor={merchant.themeColor}
        category={merchant.categorie}
        badge={badge}
        width={ms(DEAL_ROW_THUMB)}
      />
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {title || t('deals.wizard.titlePlaceholder')}
        </Text>
        <DealPriceRow type={offer.type} price={price} original={original} badge={badge} />
        <View style={[styles.metaRow, { flexDirection: row }]}>
          <ScopeIcon size={13} color={theme.textMuted} strokeWidth={icon.stroke} />
          <Text style={[styles.meta, { color: theme.textSecondary, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {scope === 'ONLINE' ? `${merchant.nom} · ${t('deals.scope.ONLINE')}` : merchant.nom}
          </Text>
        </View>
        <View style={[styles.metaRow, { flexDirection: row }]}>
          <Hourglass size={13} color={timeColor} strokeWidth={icon.stroke} />
          <Text style={[styles.meta, { color: timeColor, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {time.text}
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { gap: 12, padding: 10, borderRadius: 14, alignItems: 'flex-start' },
  body: { flex: 1, gap: 4 },
  title: { fontSize: ms(14), lineHeight: ms(19), fontFamily: font.semibold },
  priceRow: { alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  price: { fontSize: ms(15), fontFamily: font.bold },
  priceLarge: { fontSize: ms(16) },
  original: { fontSize: ms(12), fontFamily: font.regular },
  originalLarge: { fontSize: ms(13) },
  struck: { textDecorationLine: 'line-through' },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#FFFFFF', fontSize: ms(11), fontFamily: font.bold },
  badgeTextLarge: { fontSize: ms(12) },
  metaRow: { alignItems: 'center', gap: 5 },
  meta: { flexShrink: 1, fontSize: ms(12), fontFamily: font.regular },
});
