import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpRight, ArrowDownLeft, RefreshCw, Gift, Aperture } from 'lucide-react-native';
import { getTransactionConfig } from '@/constants/transactions';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatCurrency, DEFAULT_CURRENCY, getIntlLocale } from '@/config/currency';
import { formatDateTime } from '@/utils/date';
import type { Transaction } from '@/types';

// ── Home/history list row: either a date-group header or a transaction ──
export type HomeRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'tx'; id: string; tx: Transaction };

/** Removes emojis from text to let the custom icons shine (bounded LRU cache for 60fps scrolling). */
const EMOJI_CACHE_LIMIT = 500;
const emojiCache = new Map<string, string>();
export const stripEmojis = (str: string | null | undefined) => {
  if (!str) return '';
  const hit = emojiCache.get(str);
  if (hit !== undefined) {
    emojiCache.delete(str);
    emojiCache.set(str, hit);
    return hit;
  }
  const stripped = str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '').trim();
  if (emojiCache.size >= EMOJI_CACHE_LIMIT) {
    const oldest = emojiCache.keys().next().value;
    if (oldest !== undefined) emojiCache.delete(oldest);
  }
  emojiCache.set(str, stripped);
  return stripped;
};

/**
 * Groups transactions into date sections (Today / Yesterday / full date) and
 * flattens them into a single list of rows for a FlatList.
 */
export function buildHomeRows(
  transactions: Transaction[],
  t: (key: string) => string,
  locale: string,
): HomeRow[] {
  const rows: HomeRow[] = [];
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  let lastLabel: string | null = null;

  for (const tx of transactions) {
    const ts = new Date(tx.createdAt).getTime();
    let label: string;
    if (ts >= startToday) label = t('activity.today');
    else if (ts >= startYesterday) label = t('activity.yesterday');
    else {
      label = new Date(tx.createdAt).toLocaleDateString(getIntlLocale(locale), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    if (label !== lastLabel) {
      rows.push({ kind: 'header', id: `h-${label}`, label });
      lastLabel = label;
    }
    rows.push({ kind: 'tx', id: tx.id, tx });
  }
  return rows;
}

/* ── Memoized rich transaction row (full history) ── */
export const TransactionRow = React.memo(function TransactionRow({
  item,
  merchantLoyaltyType,
}: {
  item: Transaction;
  merchantLoyaltyType?: string | null;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const isDark = theme.mode === 'dark';
  const isEarned = item.type === 'EARN_POINTS';
  const isCancelled = item.status === 'CANCELLED';
  const isProgramChange = item.type === 'LOYALTY_PROGRAM_CHANGE';
  const isLuckyWheelWin = item.type === 'LUCKY_WHEEL_WIN';
  const { icon: IconComp, color } = getTransactionConfig(item.type, isCancelled, theme);
  const flowColor = isCancelled ? theme.danger : isEarned ? theme.primary : theme.accent;
  const flowBg = isCancelled
    ? `${theme.danger}14`
    : isEarned
      ? (isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)')
      : (isDark ? 'rgba(156,163,175,0.12)' : 'rgba(31,41,55,0.06)');
  const performerName = item.performedByName || item.teamMember?.nom || null;
  const isReward = item.type === 'REDEEM_REWARD' && !isCancelled;

  const pointsLabel = (item.loyaltyType ?? merchantLoyaltyType) === 'STAMPS'
    ? t('common.stampsAbbr')
    : t('common.pointsAbbr');

  return (
    <View
      style={[styles.txCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
      accessible
      accessibilityRole="summary"
    >
      <View style={[styles.flowBar, { backgroundColor: flowColor }]} importantForAccessibility="no" />

      {(isReward || (isEarned && !isCancelled) || (isLuckyWheelWin && !isCancelled)) ? (
        <View style={[styles.txIconShadowWrapper, isReward && styles.giftShadow]} importantForAccessibility="no">
          <View style={[styles.txIcon, { overflow: 'hidden', borderWidth: 1, borderColor: `${color}40`, marginRight: 0 }]}>
            <LinearGradient
              colors={[color + '30', color + '05']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
            <IconComp size={isReward ? 22 : 20} color={color} strokeWidth={isReward ? 2.5 : 2} />
          </View>
        </View>
      ) : (
        <View style={[styles.txIcon, { backgroundColor: color + '14', borderWidth: 1, borderColor: 'transparent' }]} importantForAccessibility="no">
          <IconComp size={18} color={color} strokeWidth={1.8} />
        </View>
      )}

      <View style={styles.txInfo}>
        <Text
          style={[styles.txName, { color: theme.text }, isCancelled && styles.cancelled]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.6}
        >
          {[item.client?.prenom, item.client?.nom].filter(Boolean).join(' ') || '?'}
        </Text>
        <Text style={[styles.txDate, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6}>
          {formatDateTime(item.createdAt, locale)}
        </Text>
        {isProgramChange && item.note && (
          <View style={styles.inlineIconRow}>
            <RefreshCw size={11} color={theme.primary} strokeWidth={2} />
            <Text style={[styles.txMeta, { color: theme.primary, flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>
              {stripEmojis(item.note)}
            </Text>
          </View>
        )}
        {isLuckyWheelWin && item.note && (
          <View style={styles.rewardRow}>
            <Aperture size={11} color={theme.accent} strokeWidth={2} />
            <Text style={[styles.txMeta, { color: theme.accent, flex: 1 }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>
              {stripEmojis(item.note)}
            </Text>
          </View>
        )}
        {!isEarned && !isProgramChange && item.reward && (
          <View style={styles.rewardRow}>
            <Gift size={13} color={theme.accent} strokeWidth={2.5} />
            <Text style={[styles.txMeta, { color: theme.accent, flex: 1, fontWeight: '700' }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>
              {stripEmojis(item.reward.titre)}
            </Text>
            {isReward && item.giftStatus === 'FULFILLED' && (
              <View style={[styles.giftBadge, { backgroundColor: `${theme.accent}15`, borderColor: `${theme.accent}30` }]}>
                <Text style={[styles.giftBadgeText, { color: theme.accent }]} maxFontSizeMultiplier={1.4}>{t('gift.fulfilled')}</Text>
              </View>
            )}
          </View>
        )}
        {performerName && (
          <Text style={[styles.txPerformer, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.6}>
            {t('activity.by', { name: performerName })}
          </Text>
        )}
        {isCancelled && <Text style={styles.cancelLabel} maxFontSizeMultiplier={1.4}>{t('activity.cancelled')}</Text>}
      </View>

      {!isProgramChange && !isLuckyWheelWin && (
        <View style={styles.txRight}>
          {item.amount > 0 && (
            <Text style={[styles.txAmount, { color: theme.textMuted }, isCancelled && styles.cancelled]} maxFontSizeMultiplier={1.4}>
              {formatCurrency(item.amount, DEFAULT_CURRENCY, getIntlLocale(locale))}
            </Text>
          )}
          <View style={[styles.flowPill, { backgroundColor: flowBg }]}>
            {isEarned
              ? <ArrowUpRight size={11} color={flowColor} strokeWidth={2.5} />
              : <ArrowDownLeft size={11} color={flowColor} strokeWidth={2.5} />}
            <Text style={[styles.flowPillText, { color: flowColor }, isCancelled && styles.cancelled]} maxFontSizeMultiplier={1.4}>
              {isEarned ? '+' : '−'}{item.points} {pointsLabel}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingLeft: 0,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  flowBar: {
    width: 3,
    borderRadius: 2,
    alignSelf: 'stretch',
    marginRight: 12,
  },
  txIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  txIconShadowWrapper: {
    marginRight: 14,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  giftShadow: {
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  txInfo: { flex: 1, marginRight: 8 },
  txName: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
  txDate: {
    fontSize: 11,
    marginTop: 3,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.1,
  },
  txPerformer: {
    fontSize: 10,
    marginTop: 3,
    fontStyle: 'italic',
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.1,
  },
  txMeta: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
    fontFamily: 'Lexend_500Medium',
    letterSpacing: -0.1,
  },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  inlineIconRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  giftBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  giftBadgeText: { fontSize: 9, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  cancelLabel: {
    fontSize: 10,
    color: '#ef4444',
    fontWeight: '600',
    marginTop: 3,
    fontFamily: 'Lexend_500Medium',
    letterSpacing: -0.1,
  },
  cancelled: { textDecorationLine: 'line-through', opacity: 0.45 },
  txRight: { alignItems: 'flex-end', minWidth: 88 },
  txAmount: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'Lexend_400Regular',
    letterSpacing: -0.2,
    textAlign: 'right',
    marginBottom: 4,
  },
  flowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  flowPillText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },
});
