import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/AppText';
import { LayoutGrid } from 'lucide-react-native';
import type { CollectionStatus } from '@jitplus/shared/src/collection';
import { JitGift } from '@/components/icons';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { StatusPill } from '@/components/scratch/ScratchUI';
import type { GamePushMessage } from '@/components/games/useGamePush';
import { formatYmd } from '@/components/scratch/DateField';
import { font, icon } from '@/constants/design';
import { ms, radius } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';

function statusColor(theme: ThemeColors, status: CollectionStatus): string {
  if (status === 'ACTIVE') return theme.success;
  return status === 'DRAFT' ? theme.warning : theme.textMuted;
}

export function CollectionStatusPill({ status }: { status: CollectionStatus }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return <StatusPill label={t(`collection.status.${status}`)} color={statusColor(theme, status)} />;
}

/** The rules of a collection as short sentences (wizard recap and detail page). */
export function collectionRuleLines(
  t: (key: string, params?: Record<string, unknown>) => string,
  locale: string,
  rules: { onePerVisit: boolean; repeatable: boolean; giftNextDay: boolean; couponValidityDays: number; endsOn: string },
): string[] {
  return [
    t(rules.onePerVisit ? 'collection.detail.ruleOne' : 'collection.detail.ruleMany'),
    t(rules.repeatable ? 'collection.detail.ruleRepeat' : 'collection.detail.ruleOnce'),
    t(rules.giftNextDay ? 'collection.detail.ruleGiftNext' : 'collection.detail.ruleGiftNow', { days: rules.couponValidityDays }),
    rules.endsOn ? t('collection.detail.ruleEnds', { date: formatYmd(rules.endsOn, locale) }) : t('collection.detail.ruleNoEnd'),
  ];
}

/** Notification announcing a collection to every client of the merchant. */
export function collectionPushMessage(
  t: (key: string, params?: Record<string, unknown>) => string,
  collection: { name: string; giftLabel: string; items: unknown[] },
): GamePushMessage {
  return {
    title: collection.name,
    body: t('collection.push.body', { count: collection.items.length, gift: collection.giftLabel }),
  };
}

/** Square visual of a collection in the list. */
export function CollectionTile({ size }: { size: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: theme.primaryBg }]}>
      <LayoutGrid size={size * 0.46} color={theme.primary} strokeWidth={icon.stroke} />
    </View>
  );
}

/**
 * The collection as a numbered list: each product, then the gift on its own
 * tinted row. `meta` is an optional value at the end of a product row.
 */
export function CollectionSteps({ items, gift, giftImageUrl, giftCaption }: {
  items: { key: string; label: string; imageUrl?: string | null; meta?: string }[];
  gift: string;
  giftImageUrl?: string | null;
  giftCaption: string;
}) {
  const theme = useTheme();
  const { row, textAlign } = useDir();
  return (
    <View style={styles.steps}>
      {items.map((item, i) => (
        <View key={item.key} style={[styles.stepRow, { flexDirection: row }]}>
          {item.imageUrl ? (
            <Image source={resolveImageUrl(item.imageUrl)} style={[styles.photo, { backgroundColor: theme.bgInput }]} contentFit="cover" cachePolicy="memory-disk" accessible={false} />
          ) : (
            <View style={[styles.badge, { backgroundColor: theme.bgInput }]}>
              <Text style={[styles.badgeText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.2}>{i + 1}</Text>
            </View>
          )}
          <Text style={[styles.label, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {item.label}
          </Text>
          {item.meta ? (
            <Text style={[styles.meta, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{item.meta}</Text>
          ) : null}
        </View>
      ))}
      <View style={[styles.giftRow, { flexDirection: row, backgroundColor: theme.primaryBg }]}>
        {giftImageUrl ? (
          <Image source={resolveImageUrl(giftImageUrl)} style={[styles.photo, { backgroundColor: theme.bgInput }]} contentFit="cover" cachePolicy="memory-disk" accessible={false} />
        ) : (
          <View style={[styles.badge, { backgroundColor: theme.primary }]}>
            <JitGift size={ms(14)} color={theme.bgCard} strokeWidth={icon.strokeSmall} />
          </View>
        )}
        <View style={styles.giftBody}>
          <Text style={[styles.giftCaption, { color: theme.primary, textAlign }]} maxFontSizeMultiplier={1.3}>{giftCaption}</Text>
          <Text style={[styles.label, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>{gift}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  steps: { gap: 10 },
  stepRow: { alignItems: 'center', gap: 10 },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  photo: { width: 40, height: 40, borderRadius: radius.sm },
  badgeText: { fontSize: ms(13), fontFamily: font.semibold },
  label: { flex: 1, fontSize: ms(15), lineHeight: ms(20), fontFamily: font.medium },
  meta: { fontSize: ms(13), fontFamily: font.regular },
  giftRow: { alignItems: 'center', gap: 10, borderRadius: radius.md, padding: 10, marginTop: 2 },
  giftBody: { flex: 1, gap: 2 },
  giftCaption: { fontSize: ms(12), fontFamily: font.semibold },
});
