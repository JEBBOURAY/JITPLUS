import { memo, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Check, ChevronDown, ChevronUp, Gift, Lock, Stamp } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import { rewardAvailability, type RewardAvailability } from '@/utils/stampTransaction';
import type { Reward } from '@/types';
import { cardSurface, cardStyles } from './ui';

interface Props {
  rewards: Reward[];
  loading: boolean;
  selectedRewardId: string | null;
  onSelect: (id: string | null) => void;
  currentStamps: number;
  /** Balance once this purchase is credited (without any reward). */
  stampsAfterPurchase: number;
}

const ORDER: Record<RewardAvailability['state'], number> = { now: 0, afterPurchase: 1, missing: 2 };
const THUMB = ms(46);

function RewardSelectorBase({ rewards, loading, selectedRewardId, onSelect, currentStamps, stampsAfterPurchase }: Props) {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const row = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';
  const [showLocked, setShowLocked] = useState(false);

  const items = useMemo(
    () =>
      rewards
        .map((reward) => ({ reward, availability: rewardAvailability(reward.cout, currentStamps, stampsAfterPurchase) }))
        .sort((a, b) => ORDER[a.availability.state] - ORDER[b.availability.state] || a.reward.cout - b.reward.cout),
    [rewards, currentStamps, stampsAfterPurchase],
  );
  const reachable = items.filter((i) => i.availability.state !== 'missing' || i.reward.id === selectedRewardId);
  const locked = items.filter((i) => i.availability.state === 'missing' && i.reward.id !== selectedRewardId);

  const renderItem = ({ reward, availability }: (typeof items)[number]) => {
    const selected = reward.id === selectedRewardId;
    const isLocked = availability.state === 'missing';
    const badge =
      availability.state === 'now'
        ? { text: t('stampScreen.rewardNow'), color: theme.success }
        : availability.state === 'afterPurchase'
          ? { text: t('stampScreen.rewardAfter'), color: theme.primary }
          : { text: t('stampScreen.rewardMissing', { count: availability.missing }), color: theme.textMuted };
    return (
      <TouchableOpacity
        key={reward.id}
        style={[
          styles.row,
          {
            flexDirection: row,
            borderColor: selected ? theme.primary : theme.mode === 'dark' ? theme.border : theme.borderLight,
            backgroundColor: selected ? theme.primaryBg : theme.bg,
            opacity: isLocked && !selected ? 0.6 : 1,
          },
        ]}
        onPress={() => onSelect(selected ? null : reward.id)}
        disabled={isLocked && !selected}
        activeOpacity={0.75}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled: isLocked && !selected }}
      >
        <View style={[styles.thumb, { backgroundColor: isLocked ? theme.bgInput : theme.primaryBg }]}>
          {reward.imageUrl ? (
            <Image source={{ uri: resolveImageUrl(reward.imageUrl) }} style={styles.thumbImage} />
          ) : (
            <Gift size={ms(20)} color={isLocked ? theme.textMuted : theme.primary} strokeWidth={1.7} />
          )}
          {isLocked && (
            <View style={[styles.lockBadge, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
              <Lock size={ms(10)} color={theme.textMuted} strokeWidth={2.2} />
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: theme.text, textAlign }]} numberOfLines={2}>
            {reward.titre}
          </Text>
          <View style={[styles.metaRow, { flexDirection: row }]}>
            <View style={[styles.cost, { flexDirection: row }]}>
              <Stamp size={ms(12)} color={theme.textSecondary} strokeWidth={2} />
              <Text style={[styles.costText, { color: theme.textSecondary }]}>
                {t('stampScreen.rewardCost', { count: reward.cout })}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: `${badge.color}1A` }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.text}</Text>
            </View>
          </View>
        </View>
        <View
          style={[
            styles.radio,
            { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : 'transparent' },
          ]}
        >
          {selected && <Check size={ms(14)} color="#fff" strokeWidth={3} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[cardStyles.card, cardSurface(theme), styles.card]}>
      <View style={[styles.header, { flexDirection: row }]}>
        <View style={[styles.headerIcon, { backgroundColor: theme.primaryBg }]}>
          <Gift size={ms(18)} color={theme.primary} strokeWidth={1.8} />
        </View>
        <Text style={[styles.title, { color: theme.text, textAlign }]}>{t('stampScreen.rewardsTitle')}</Text>
        <View style={[styles.optional, { backgroundColor: theme.bgInput }]}>
          <Text style={[styles.optionalText, { color: theme.textMuted }]}>{t('stampScreen.rewardsOptional')}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} color={theme.primary} />
      ) : rewards.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted, textAlign }]}>{t('stampScreen.rewardsEmpty')}</Text>
      ) : (
        <>
          {reachable.length === 0 && (
            <Text style={[styles.empty, { color: theme.textMuted, textAlign }]}>{t('stampScreen.rewardsNoneReachable')}</Text>
          )}
          {reachable.length > 0 && <View style={styles.list}>{reachable.map(renderItem)}</View>}
          {locked.length > 0 && (
            <>
              <TouchableOpacity
                style={[styles.toggle, { flexDirection: row, backgroundColor: theme.bgInput }]}
                onPress={() => setShowLocked((v) => !v)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ expanded: showLocked }}
              >
                <Text style={[styles.toggleText, { color: theme.textSecondary }]}>
                  {showLocked ? t('stampScreen.hideLocked') : t('stampScreen.showLocked', { count: locked.length })}
                </Text>
                {showLocked ? (
                  <ChevronUp size={ms(16)} color={theme.textSecondary} strokeWidth={2} />
                ) : (
                  <ChevronDown size={ms(16)} color={theme.textSecondary} strokeWidth={2} />
                )}
              </TouchableOpacity>
              {showLocked && <View style={styles.list}>{locked.map(renderItem)}</View>}
            </>
          )}
        </>
      )}
    </View>
  );
}

export const RewardSelector = memo(RewardSelectorBase);

const styles = StyleSheet.create({
  card: { marginTop: 14, gap: 12 },
  header: { alignItems: 'center', gap: 10 },
  headerIcon: { width: ms(34), height: ms(34), borderRadius: ms(10), alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: ms(15.5), fontFamily: 'Lexend_600SemiBold' },
  optional: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  optionalText: { fontSize: ms(11.5), fontFamily: 'Lexend_500Medium' },
  loading: { paddingVertical: 16 },
  empty: { fontSize: ms(13), fontFamily: 'Lexend_400Regular', lineHeight: ms(19) },
  list: { gap: 8 },
  row: { alignItems: 'center', padding: 10, borderRadius: 16, borderWidth: 1.5, gap: 12, minHeight: ms(68) },
  thumb: { width: THUMB, height: THUMB, borderRadius: ms(12), alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: THUMB, height: THUMB, borderRadius: ms(12) },
  lockBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: ms(18),
    height: ms(18),
    borderRadius: ms(9),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 5 },
  name: { fontSize: ms(14.5), fontFamily: 'Lexend_600SemiBold' },
  metaRow: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cost: { alignItems: 'center', gap: 4 },
  costText: { fontSize: ms(12.5), fontFamily: 'Lexend_500Medium' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: ms(11.5), fontFamily: 'Lexend_600SemiBold' },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  toggle: { alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, paddingVertical: 8, minHeight: 40 },
  toggleText: { fontSize: ms(13), fontFamily: 'Lexend_600SemiBold' },
});
