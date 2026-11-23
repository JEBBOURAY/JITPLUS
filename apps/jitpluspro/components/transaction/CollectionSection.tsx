import { memo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/AppText';
import { Check } from 'lucide-react-native';
import { JitGift, JitParcel } from '@/components/icons';
import type { TillCollection } from '@jitplus/shared/src/collection';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { ms, radius } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import { cardStyles, cardSurface } from './ui';

interface Props {
  collection: TillCollection;
  /** Products picked for this visit, not sent yet */
  selected: string[];
  onToggle: (itemId: string) => void;
  /** Gifts already won with a collection and not handed over yet (listed in the client's winnings). */
  giftsDue: number;
}

/**
 * The client's collection at the till: products already collected are ticked
 * and locked, the cashier taps the ones bought today. They are sent with the
 * main button of the screen.
 */
function CollectionSectionBase({ collection, selected, onToggle, giftsDue }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const { canCheck, onePerVisit } = collection;
  // One a day: picking a product replaces the previous pick (handled by the screen).
  const hint = collection.completed
    ? t('collection.till.completed')
    : !canCheck
      ? t('collection.till.doneToday')
      : t(onePerVisit ? 'collection.till.hintOne' : 'collection.till.hint');

  return (
    <View style={[cardStyles.card, cardSurface(theme), styles.card]}>
      <View style={[styles.head, { flexDirection: row }]}>
        <Text style={[styles.title, { color: theme.text, textAlign }]} numberOfLines={1} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {t('collection.till.title')}
        </Text>
        <Text style={[styles.progress, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
          {t('collection.till.progress', { checked: collection.checked + selected.length, total: collection.total })}
        </Text>
      </View>
      <View style={[styles.giftRow, { flexDirection: row }]}>
        <JitGift size={ms(14)} color={theme.textSecondary} strokeWidth={icon.strokeSmall} />
        <Text style={[styles.gift, { color: theme.textSecondary, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
          {t('collection.till.gift', { gift: collection.giftLabel })}
        </Text>
      </View>
      {giftsDue > 0 && (
        <View style={[styles.due, { flexDirection: row, backgroundColor: theme.primaryBg }]} accessibilityRole="alert">
          <JitGift size={ms(16)} color={theme.primary} strokeWidth={icon.stroke} />
          <Text style={[styles.dueText, { color: theme.primary, textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('collection.till.giftDue')}
          </Text>
        </View>
      )}

      <View style={[styles.items, { flexDirection: row }]}>
        {collection.items.map((item) => {
          const picked = selected.includes(item.id);
          const locked = item.checked || !canCheck;
          const on = item.checked || picked;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => onToggle(item.id)}
              disabled={locked}
              activeOpacity={0.75}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: locked }}
              accessibilityLabel={item.checked ? `${item.label}, ${t('collection.till.collected')}` : item.label}
              style={[
                styles.item,
                { flexDirection: row, borderColor: picked ? theme.primary : theme.border, backgroundColor: picked ? theme.primaryBg : theme.bgCard },
                item.checked && { backgroundColor: theme.bgInput, borderColor: theme.bgInput },
                // Not collected and not tickable today: look inactive, not just ignore the tap.
                locked && !item.checked && styles.itemLocked,
              ]}
            >
              <View style={[styles.thumb, { backgroundColor: theme.bgInput }]}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: resolveImageUrl(item.imageUrl) }}
                    style={[styles.thumbImage, item.checked && styles.thumbDone]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
                    accessible={false}
                  />
                ) : (
                  <JitParcel size={ms(18)} color={theme.textMuted} strokeWidth={icon.stroke} />
                )}
              </View>
              <Text
                style={[styles.itemLabel, { color: item.checked ? theme.textMuted : theme.text, textAlign }]}
                numberOfLines={2}
                maxFontSizeMultiplier={1.3}
              >
                {item.label}
              </Text>
              <View style={[styles.box, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }, item.checked && { backgroundColor: theme.textMuted, borderColor: theme.textMuted }]}>
                {on && <Check size={ms(13)} color={theme.bgCard} strokeWidth={icon.stroke} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>{hint}</Text>
    </View>
  );
}

export const CollectionSection = memo(CollectionSectionBase);

const styles = StyleSheet.create({
  card: { marginTop: 14, gap: 8 },
  head: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: ms(16), fontFamily: font.semibold },
  progress: { fontSize: ms(15), fontFamily: font.semibold },
  giftRow: { alignItems: 'center', gap: 6 },
  gift: { flex: 1, fontSize: ms(13), lineHeight: ms(18), fontFamily: font.regular },
  items: { flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginTop: 2 },
  item: { width: '48.8%', alignItems: 'center', gap: 8, minHeight: 52, borderWidth: 1, borderRadius: radius.md, padding: 6 },
  thumb: { width: ms(40), height: ms(40), borderRadius: radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: '100%', height: '100%' },
  thumbDone: { opacity: 0.45 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { flex: 1, fontSize: ms(14), fontFamily: font.medium },
  itemLocked: { opacity: 0.5 },
  hint: { fontSize: ms(12), lineHeight: ms(17), fontFamily: font.regular },
  due: { alignItems: 'center', gap: 8, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  dueText: { flex: 1, fontSize: ms(13), lineHeight: ms(18), fontFamily: font.semibold },
});
