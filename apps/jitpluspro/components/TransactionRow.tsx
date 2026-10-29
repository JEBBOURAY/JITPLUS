import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  ArrowUpRight,
  RefreshCw,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react-native';
import {
  JitGames,
  JitGift,
  JitStamp,
  JitTicket,
} from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { formatCurrency, DEFAULT_CURRENCY, getIntlLocale } from '@/config/currency';
import { font, icon } from '@/constants/design';
import type { ClientDetailTransaction, Transaction, TransactionType } from '@/types';

/** Fields the activity rows read; the client-detail endpoint omits the client and staff info. */
export type ActivityItem = ClientDetailTransaction & Partial<Pick<Transaction, 'client' | 'performedByName' | 'teamMember'>>;

// Home/history list row: either a date-group header or a transaction.
// isFirst/isLast mark the row's position inside its date group so the list can draw one card per group.
export type HomeRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'tx'; id: string; tx: ActivityItem; isFirst: boolean; isLast: boolean };

/** Strips emojis from user-entered text (bounded LRU cache for smooth scrolling). */
const EMOJI_CACHE_LIMIT = 500;
const emojiCache = new Map<string, string>();
const stripEmojis = (str: string | null | undefined) => {
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

/** Local-midnight timestamps for today and yesterday. */
function dayBounds() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return { today, yesterday: today - 86_400_000 };
}

/**
 * Groups transactions into date sections (Today / Yesterday / full date) and
 * flattens them into a single list of rows for a FlatList.
 */
export function buildHomeRows(
  transactions: readonly ActivityItem[],
  t: (key: string) => string,
  locale: string,
): HomeRow[] {
  const rows: HomeRow[] = [];
  const { today, yesterday } = dayBounds();
  const intlLocale = getIntlLocale(locale);
  // Intl formatting is slow on Hermes and the whole list is rebuilt on every page load.
  const dayLabels = new Map<string, string>();
  let lastLabel: string | null = null;
  let prevTx: Extract<HomeRow, { kind: 'tx' }> | null = null;

  for (const tx of transactions) {
    const date = new Date(tx.createdAt);
    const ts = date.getTime();
    let label: string;
    if (ts >= today) label = t('activity.today');
    else if (ts >= yesterday) label = t('activity.yesterday');
    else {
      const dayKey = date.toDateString();
      label = dayLabels.get(dayKey) ?? date.toLocaleDateString(intlLocale, { day: 'numeric', month: 'long', year: 'numeric' });
      dayLabels.set(dayKey, label);
    }
    const isNewGroup = label !== lastLabel;
    if (isNewGroup) {
      if (prevTx) prevTx.isLast = true;
      rows.push({ kind: 'header', id: `h-${label}`, label });
      lastLabel = label;
    }
    const row: Extract<HomeRow, { kind: 'tx' }> = { kind: 'tx', id: tx.id, tx, isFirst: isNewGroup, isLast: false };
    rows.push(row);
    prevTx = row;
  }
  if (prevTx) prevTx.isLast = true;
  return rows;
}

const ACTIVITY_ICONS: Record<TransactionType, LucideIcon> = {
  EARN_STAMPS: ArrowUpRight,
  REDEEM_REWARD: JitGift,
  ADJUST_STAMPS: SlidersHorizontal,
  LOYALTY_PROGRAM_CHANGE: RefreshCw,
  LUCKY_WHEEL_WIN: JitGames,
  COUPON_REDEEM: JitTicket,
};

const TYPE_LABEL_KEYS: Record<TransactionType, string> = {
  EARN_STAMPS: 'clientDetail.txEarned',
  REDEEM_REWARD: 'clientDetail.txRedeemed',
  ADJUST_STAMPS: 'clientDetail.txAdjustment',
  LOYALTY_PROGRAM_CHANGE: 'clientDetail.txProgramChange',
  LUCKY_WHEEL_WIN: 'common.luckyWheelWin',
  COUPON_REDEEM: 'clientDetail.txCoupon',
};

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Compact "Aujourd'hui, 16:35" / "Hier, 18:47" / "12 oct., 09:10" formatter. */
function formatRelativeTime(date: Date, t: (k: string) => string, locale: string): string {
  const { today, yesterday } = dayBounds();
  const ts = date.getTime();
  const time = formatTime(date);
  if (ts >= today) return `${t('activity.today')}, ${time}`;
  if (ts >= yesterday) return `${t('activity.yesterday')}, ${time}`;
  const d = date.toLocaleDateString(getIntlLocale(locale), { day: 'numeric', month: 'short' });
  return `${d}, ${time}`;
}

/**
 * Shared activity row for the home "Recent activity" card, the full history and the client profile.
 * `detailed` (history, client profile) shows only the time, since rows sit under a date header,
 * plus a muted line with the amount, staff member, reward or note.
 * `showType` titles the row with the transaction type instead of the client name (client profile).
 */
export const TransactionRow = React.memo(function TransactionRow({
  item,
  isFirst = false,
  detailed = false,
  showType = false,
  onPress,
}: {
  item: ActivityItem;
  isFirst?: boolean;
  detailed?: boolean;
  showType?: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const dir = useDir();
  const isEarn = item.type === 'EARN_STAMPS';
  const isReward = item.type === 'REDEEM_REWARD';
  const isAdjust = item.type === 'ADJUST_STAMPS';
  const isProgram = item.type === 'LOYALTY_PROGRAM_CHANGE';
  const isWheel = item.type === 'LUCKY_WHEEL_WIN';
  const isCoupon = item.type === 'COUPON_REDEEM';
  const isCancelled = item.status === 'CANCELLED';

  // Single brand color for every activity type; cancelled rows fade to muted instead of turning red.
  const color = isCancelled ? theme.textMuted : theme.primary;
  const IconComp = ACTIVITY_ICONS[item.type] ?? ArrowUpRight;
  const title = showType
    ? t(TYPE_LABEL_KEYS[item.type])
    : [item.client?.prenom, item.client?.nom].filter(Boolean).join(' ') || '?';

  let amountText: string | null = null;
  let amountColor = theme.textMuted;
  let withStamp = false;
  if (isReward && showType && item.stamps > 0) {
    // The title already says "reward redeemed", so show the stamps it cost.
    amountText = `−${item.stamps}`;
    withStamp = true;
  } else if (isReward) {
    amountText = t('home.redeemed');
  } else if (isProgram) {
    amountText = showType ? null : t('home.programChanged');
  } else if (item.stamps) {
    amountText = `${item.stamps < 0 ? '−' : '+'}${Math.abs(item.stamps)}`;
    amountColor = isCancelled ? theme.textMuted : theme.text;
    withStamp = true;
  }

  const date = new Date(item.createdAt);
  const when = isNaN(date.getTime()) ? null : detailed ? formatTime(date) : formatRelativeTime(date, t, locale);
  const performerName = item.performedByName || item.teamMember?.nom || null;
  const subLine = [
    when,
    detailed && item.amount > 0 ? formatCurrency(item.amount, DEFAULT_CURRENCY, getIntlLocale(locale)) : null,
    detailed && performerName ? t('activity.by', { name: performerName }) : null,
    isCancelled ? t('activity.cancelled') : null,
  ].filter(Boolean).join(' · ');

  const detailLine = detailed
    ? [
        (isAdjust || isProgram || isWheel || isCoupon) && item.note ? stripEmojis(item.note) : null,
        !isEarn && !isProgram && item.reward ? stripEmojis(item.reward.titre) : null,
        isReward && !isCancelled && item.giftStatus === 'FULFILLED' ? t('gift.fulfilled') : null,
      ].filter(Boolean).join(' · ')
    : '';

  const rowStyle = [
    styles.row,
    { flexDirection: dir.row },
    isFirst ? styles.rowFirstNoBorder : { borderTopColor: theme.borderLight },
  ];
  const a11yLabel = [title, amountText, subLine, detailLine].filter(Boolean).join(', ');

  const content = (
    <>
      <View style={[styles.icon, { backgroundColor: `${color}1A` }]} importantForAccessibility="no">
        <IconComp size={18} color={color} strokeWidth={icon.stroke} />
      </View>
      <View style={styles.info}>
        <Text
          style={[styles.title, { color: theme.text, textAlign: dir.textAlign }, isCancelled && styles.strike]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.5}
        >
          {title}
        </Text>
        <Text style={[styles.sub, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
          {subLine}
        </Text>
        {detailLine ? (
          <Text style={[styles.sub, { color: theme.textSecondary, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.5}>
            {detailLine}
          </Text>
        ) : null}
      </View>
      {amountText ? (
        <View style={[styles.amountRow, { flexDirection: dir.row }]}>
          <Text
            style={[styles.amount, { color: amountColor }, isCancelled && styles.strike]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {amountText}
          </Text>
          {withStamp && <JitStamp size={13} color={amountColor} strokeWidth={icon.strokeSmall} />}
        </View>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={rowStyle}
        activeOpacity={0.6}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={t('home.viewAll')}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return (
    <View style={rowStyle} accessible accessibilityLabel={a11yLabel}>
      {content}
    </View>
  );
});

/** One item of a date-grouped history: a date label, or a row inside its group's card. */
export const HistoryListItem = React.memo(function HistoryListItem({
  row,
  showType = false,
}: {
  row: HomeRow;
  showType?: boolean;
}) {
  const theme = useTheme();
  const dir = useDir();
  if (row.kind === 'header') {
    return (
      <Text style={[styles.groupLabel, { color: theme.textMuted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
        {row.label}
      </Text>
    );
  }
  return (
    <View
      style={[
        styles.groupCard,
        { backgroundColor: theme.bgCard, borderColor: theme.borderLight },
        row.isFirst && styles.groupCardFirst,
        row.isLast && styles.groupCardLast,
      ]}
    >
      <TransactionRow item={row.tx} isFirst={row.isFirst} detailed showType={showType} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    gap: 12,
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
  },
  info: { flex: 1 },
  title: {
    fontSize: 15,
    fontFamily: font.semibold,
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: font.regular,
  },
  amount: {
    fontSize: 14,
    fontFamily: font.bold,
    letterSpacing: -0.2,
  },
  strike: { textDecorationLine: 'line-through', opacity: 0.5 },
  amountRow: {
    alignItems: 'center',
    gap: 3,
  },
  groupLabel: {
    fontSize: 13,
    fontFamily: font.semibold,
    marginTop: 16,
    marginBottom: 8,
  },
  // A date group spans several list items: side borders on each, top/bottom borders and corners on the ends.
  groupCard: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
  },
  groupCardFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  groupCardLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
});
