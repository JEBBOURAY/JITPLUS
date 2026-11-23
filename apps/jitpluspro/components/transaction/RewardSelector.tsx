import { memo, useMemo } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/AppText';
import { Check } from 'lucide-react-native';
import { JitGift, JitLock, JitStamp } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { font, icon } from '@/constants/design';
import { ms, radius } from '@/utils/responsive';
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
const PHOTO_HEIGHT = ms(84);
/** Without any photo the area only holds an icon: keep it short. */
const ICON_HEIGHT = ms(56);

/**
 * Rewards as picture tiles: the cashier recognises the gift by its photo,
 * sees its price in stamps, and taps it. Nothing shows when no gift is available.
 */
function RewardSelectorBase({ rewards, loading, selectedRewardId, onSelect, currentStamps, stampsAfterPurchase }: Props) {
  const theme = useTheme();
  const { t, isRTL } = useLanguage();
  const row = isRTL ? 'row-reverse' : 'row';
  const textAlign = isRTL ? 'right' : 'left';

  const items = useMemo(
    () =>
      rewards
        .map((reward) => ({ reward, availability: rewardAvailability(reward.cout, currentStamps, stampsAfterPurchase) }))
        .sort((a, b) => ORDER[a.availability.state] - ORDER[b.availability.state] || a.reward.cout - b.reward.cout),
    [rewards, currentStamps, stampsAfterPurchase],
  );
  // Only gifts the client can take now (or with this purchase). A picked gift stays
  // visible if the amount changes and it is no longer affordable, so it can be unpicked.
  const visible = items.filter((i) => i.availability.state !== 'missing' || i.reward.id === selectedRewardId);
  const tileBorder = theme.mode === 'dark' ? theme.border : theme.borderLight;

  if (loading || visible.length === 0) return null;
  const photoHeight = visible.some((i) => i.reward.imageUrl) ? PHOTO_HEIGHT : ICON_HEIGHT;

  const renderTile = ({ reward, availability }: (typeof items)[number]) => {
    const selected = reward.id === selectedRewardId;
    const isLocked = availability.state === 'missing';
    const disabled = isLocked && !selected;
    const cost = t(reward.cout === 1 ? 'stampScreen.rewardCost_one' : 'stampScreen.rewardCost_other', { count: reward.cout });
    const status =
      availability.state === 'missing'
        ? t('stampScreen.rewardMissing', { count: availability.missing })
        : availability.state === 'afterPurchase'
          ? t('stampScreen.rewardAfter')
          : null;
    return (
      <TouchableOpacity
        key={reward.id}
        style={[
          styles.tile,
          {
            borderColor: selected ? theme.primary : tileBorder,
            backgroundColor: selected ? theme.primaryBg : theme.bgCard,
            opacity: disabled ? 0.55 : 1,
          },
        ]}
        onPress={() => onSelect(selected ? null : reward.id)}
        disabled={disabled}
        activeOpacity={0.75}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        accessibilityLabel={[reward.titre, cost, status].filter(Boolean).join(', ')}
      >
        <View style={[styles.photo, { height: photoHeight, backgroundColor: isLocked ? theme.bgInput : theme.primaryBg }]}>
          {reward.imageUrl ? (
            <Image
              source={{ uri: resolveImageUrl(reward.imageUrl) }}
              style={styles.photoImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessible={false}
            />
          ) : (
            <JitGift size={ms(28)} color={isLocked ? theme.textMuted : theme.primary} strokeWidth={icon.stroke} />
          )}
          {(selected || isLocked) && (
            <View
              style={[
                styles.corner,
                isRTL ? styles.cornerRtl : styles.cornerLtr,
                selected
                  ? { backgroundColor: theme.primary, borderColor: theme.primary }
                  : { backgroundColor: theme.bgCard, borderColor: theme.border },
              ]}
            >
              {selected ? (
                <Check size={ms(14)} color="#fff" strokeWidth={icon.strokeSmall} />
              ) : (
                <JitLock size={ms(13)} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
              )}
            </View>
          )}
        </View>
        <View style={styles.tileBody}>
          <Text style={[styles.name, { color: theme.text, textAlign }]} numberOfLines={2}>
            {reward.titre}
          </Text>
          <View style={[styles.costRow, { flexDirection: row }]}>
            <JitStamp size={ms(14)} color={theme.textSecondary} strokeWidth={icon.strokeSmall} />
            <Text style={[styles.costText, { color: theme.textSecondary }]}>{reward.cout}</Text>
            {status && (
              <Text
                style={[styles.status, { color: isLocked ? theme.textMuted : theme.primary, textAlign }]}
                numberOfLines={1}
              >
                · {status}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[cardStyles.card, cardSurface(theme), styles.card]}>
      <View style={[styles.header, { flexDirection: row }]}>
        <JitGift size={ms(20)} color={theme.primary} strokeWidth={icon.stroke} />
        <Text style={[styles.title, { color: theme.text, textAlign }]} accessibilityRole="header">
          {t('stampScreen.rewardsTitle')}
        </Text>
      </View>

      <View style={[styles.grid, { flexDirection: row }]}>{visible.map(renderTile)}</View>
    </View>
  );
}

export const RewardSelector = memo(RewardSelectorBase);

const styles = StyleSheet.create({
  card: { marginTop: 16, gap: 12 },
  header: { alignItems: 'center', gap: 8, minHeight: 32 },
  title: { flex: 1, fontSize: ms(17), fontFamily: font.semibold },
  grid: { flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  tile: { width: '48.8%', borderRadius: radius.md, borderWidth: 1.5, overflow: 'hidden' },
  photo: { alignItems: 'center', justifyContent: 'center' },
  photoImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  corner: {
    position: 'absolute',
    top: 6,
    width: ms(24),
    height: ms(24),
    borderRadius: ms(12),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerLtr: { right: 6 },
  cornerRtl: { left: 6 },
  tileBody: { padding: 10, gap: 4 },
  name: { fontSize: ms(15), fontFamily: font.semibold, lineHeight: ms(20) },
  costRow: { alignItems: 'center', gap: 4 },
  costText: { fontSize: ms(13), fontFamily: font.semibold, fontVariant: ['tabular-nums'] },
  status: { flexShrink: 1, fontSize: ms(13), fontFamily: font.regular },
});
