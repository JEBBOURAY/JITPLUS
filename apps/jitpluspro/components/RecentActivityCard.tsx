import React, { useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, I18nManager } from 'react-native';
import { Gift, ArrowUpRight, ChevronRight, Aperture, RefreshCw, Star, Stamp } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/config/currency';
import type { Transaction } from '@/types';

const GREEN = '#10B981';
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

/** Compact "Aujourd'hui, 16:35" / "Hier, 18:47" formatter for the grouped card. */
function formatRelativeTime(dateStr: string, t: (k: string) => string, locale: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86_400_000;
  const ts = date.getTime();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (ts >= startToday) return `${t('activity.today')}, ${time}`;
  if (ts >= startYesterday) return `${t('activity.yesterday')}, ${time}`;
  const d = date.toLocaleDateString(getIntlLocale(locale), { day: 'numeric', month: 'short' });
  return `${d}, ${time}`;
}

function RecentRow({
  tx,
  isFirst,
  merchantLoyaltyType,
  onPress,
}: {
  tx: Transaction;
  isFirst: boolean;
  merchantLoyaltyType?: string | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const isEarn = tx.type === 'EARN_POINTS';
  const isReward = tx.type === 'REDEEM_REWARD';
  const isWheel = tx.type === 'LUCKY_WHEEL_WIN';
  const isProgram = tx.type === 'LOYALTY_PROGRAM_CHANGE';
  const isCancelled = tx.status === 'CANCELLED';

  const color = isCancelled ? theme.danger : isEarn ? GREEN : isReward ? theme.primary : theme.accent;
  const IconComp = isReward ? Gift : isWheel ? Aperture : isProgram ? RefreshCw : ArrowUpRight;

  const isStampsUnit = (tx.loyaltyType ?? merchantLoyaltyType) === 'STAMPS';

  const name = [tx.client?.prenom, tx.client?.nom].filter(Boolean).join(' ') || '?';

  // Gains show "+N" followed by a star/stamp icon (never the unit as text, §3/§7).
  const isGain = !isReward && !isProgram;
  let amountText: string;
  let amountColor: string;
  if (isReward) {
    amountText = t('home.redeemed');
    amountColor = theme.textMuted;
  } else if (isProgram) {
    amountText = t('home.programChanged');
    amountColor = theme.textMuted;
  } else {
    amountText = `+${tx.points}`;
    amountColor = isCancelled ? theme.textMuted : GREEN;
  }

  return (
    <TouchableOpacity
      style={[styles.row, !isFirst && { borderTopColor: theme.borderLight }, isFirst && styles.rowFirstNoBorder]}
      activeOpacity={0.6}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${amountText}`}
    >
      <View style={[styles.icon, { backgroundColor: `${color}1A` }]} importantForAccessibility="no">
        <IconComp size={17} color={color} strokeWidth={2.2} />
      </View>
      <View style={styles.info}>
        <Text
          style={[styles.name, { color: theme.text }, isCancelled && styles.strike]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.5}
        >
          {name}
        </Text>
        <Text style={[styles.sub, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
          {formatRelativeTime(tx.createdAt, t, locale)}
        </Text>
      </View>
      {isGain ? (
        <View style={styles.amountRow}>
          <Text
            style={[styles.amount, { color: amountColor }, isCancelled && styles.strike]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {amountText}
          </Text>
          {isStampsUnit ? (
            <Stamp size={13} color={amountColor} strokeWidth={2.4} />
          ) : (
            <Star size={13} color={amountColor} fill={isCancelled ? 'transparent' : amountColor} strokeWidth={isCancelled ? 2 : 0} />
          )}
        </View>
      ) : (
        <Text
          style={[styles.amount, { color: amountColor }, isCancelled && styles.strike]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {amountText}
        </Text>
      )}
    </TouchableOpacity>
  );
}

/**
 * Single grouped card holding the 3-5 most recent transactions with hairline
 * separators and a bottom "View all" button that opens the full history.
 */
function RecentActivityCard({
  transactions,
  merchantLoyaltyType,
  onViewAll,
}: {
  transactions: Transaction[];
  merchantLoyaltyType?: string | null;
  onViewAll: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();

  const handleRowPress = useCallback(() => onViewAll(), [onViewAll]);

  if (transactions.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      {transactions.map((tx, i) => (
        <RecentRow
          key={tx.id}
          tx={tx}
          isFirst={i === 0}
          merchantLoyaltyType={merchantLoyaltyType}
          onPress={handleRowPress}
        />
      ))}
      <TouchableOpacity
        style={[styles.viewAll, { borderTopColor: theme.borderLight }]}
        activeOpacity={0.6}
        onPress={onViewAll}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t('home.viewAll')}
      >
        <Text style={[styles.viewAllText, { color: theme.primary }]} maxFontSizeMultiplier={1.4}>
          {t('home.viewAll')}
        </Text>
        <ChevronRight size={16} color={theme.primary} strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );
}

export default React.memo(RecentActivityCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowFirstNoBorder: { borderTopWidth: 0 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  info: { flex: 1, marginRight: 10 },
  name: {
    fontSize: 14.5,
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 11.5,
    marginTop: 2,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.1,
  },
  amount: {
    fontSize: 14,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.2,
    textAlign: I18nManager.isRTL ? 'left' : 'right',
  },
  strike: { textDecorationLine: 'line-through', opacity: 0.5 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  viewAll: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  viewAllText: {
    fontSize: 14,
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
});
