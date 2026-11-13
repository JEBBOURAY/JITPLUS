import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import {
  JitCard,
  JitGames,
  JitGift,
  JitSettings,
  JitStamp,
  JitStore,
  JitTicket,
} from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { formatCurrency, getIntlLocale } from '@/config/currency';
import { useCurrency } from '@/hooks/useCurrency';
import { font, icon } from '@/constants/design';
import type { ClientDetailTransaction, Transaction, TransactionType } from '@/types';

/** Fields the activity rows read; the client-detail endpoint omits the client and staff info. */
type ActivityItem = ClientDetailTransaction & Partial<Pick<Transaction, 'client' | 'performedByName' | 'teamMember'>>;

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

// JitPlus icons only, drawn plain (no tinted tile).
const ACTIVITY_ICONS: Record<TransactionType, LucideIcon> = {
  EARN_STAMPS: JitStamp,
  REDEEM_REWARD: JitGift,
  ADJUST_STAMPS: JitSettings,
  LOYALTY_PROGRAM_CHANGE: JitCard,
  LUCKY_WHEEL_WIN: JitGames,
  COUPON_REDEEM: JitTicket,
  PURCHASE: JitStore,
};

const TYPE_LABEL_KEYS: Record<TransactionType, string> = {
  EARN_STAMPS: 'clientDetail.txEarned',
  REDEEM_REWARD: 'clientDetail.txRedeemed',
  ADJUST_STAMPS: 'clientDetail.txAdjustment',
  LOYALTY_PROGRAM_CHANGE: 'clientDetail.txProgramChange',
  LUCKY_WHEEL_WIN: 'common.luckyWheelWin',
  COUPON_REDEEM: 'clientDetail.txCoupon',
  PURCHASE: 'clientDetail.txPurchase',
};

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * One activity row of the full history and of the client profile. Rows sit
 * under a date header, so only the time is shown, plus a muted line with the
 * amount, staff member, reward or note. `showType` titles the row with the
 * transaction type instead of the client name (client profile).
 */
const TransactionRow = React.memo(function TransactionRow({
  item,
  isFirst = false,
  showType = false,
}: {
  item: ActivityItem;
  isFirst?: boolean;
  showType?: boolean;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const currency = useCurrency();
  const dir = useDir();
  const isEarn = item.type === 'EARN_STAMPS';
  const isReward = item.type === 'REDEEM_REWARD';
  const isAdjust = item.type === 'ADJUST_STAMPS';
  const isProgram = item.type === 'LOYALTY_PROGRAM_CHANGE';
  const isWheel = item.type === 'LUCKY_WHEEL_WIN';
  const isCoupon = item.type === 'COUPON_REDEEM';
  const isCancelled = item.status === 'CANCELLED';

  // One ink for every activity type; cancelled rows fade to muted instead of turning red.
  const color = isCancelled ? theme.textMuted : theme.text;
  const IconComp = ACTIVITY_ICONS[item.type] ?? JitStamp;
  const title = showType
    ? t(TYPE_LABEL_KEYS[item.type])
    : [item.client?.prenom, item.client?.nom].filter(Boolean).join(' ') || t('clients.unnamed');

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
  const when = isNaN(date.getTime()) ? null : formatTime(date);
  const performerName = item.performedByName || item.teamMember?.nom || null;
  // "Cancelled" goes first: at the end it is the part an ellipsis cuts.
  const subLine = [
    isCancelled ? t('activity.cancelled') : null,
    when,
    item.amount > 0 ? formatCurrency(item.amount, currency, getIntlLocale(locale)) : null,
    performerName ? t('activity.by', { name: performerName }) : null,
  ].filter(Boolean).join(' · ');

  const detailLine = [
    (isAdjust || isProgram || isWheel || isCoupon) && item.note ? stripEmojis(item.note) : null,
    !isEarn && !isProgram && item.reward ? stripEmojis(item.reward.titre) : null,
    isReward && !isCancelled && item.giftStatus === 'FULFILLED' ? t('gift.fulfilled') : null,
  ].filter(Boolean).join(' · ');

  const rowStyle = [
    styles.row,
    { flexDirection: dir.row },
    isFirst ? styles.rowFirstNoBorder : { borderTopColor: theme.borderLight },
  ];
  const a11yLabel = [title, amountText, subLine, detailLine].filter(Boolean).join(', ');

  const content = (
    <>
      <IconComp size={22} color={color} strokeWidth={icon.stroke} />
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
        { backgroundColor: theme.bgCard, borderColor: theme.border },
        row.isFirst && styles.groupCardFirst,
        row.isLast && styles.groupCardLast,
      ]}
    >
      <TransactionRow item={row.tx} isFirst={row.isFirst} showType={showType} />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    gap: 14,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowFirstNoBorder: { borderTopWidth: 0 },
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
    fontFamily: font.semibold,
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
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  groupCardLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
});
