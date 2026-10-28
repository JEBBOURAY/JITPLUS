import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { TransactionRow } from '@/components/TransactionRow';
import type { Transaction } from '@/types';

const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

/**
 * Single grouped card holding the 3-5 most recent transactions with hairline
 * separators and a bottom "View all" button that opens the full history.
 */
function RecentActivityCard({
  transactions,
  onViewAll,
}: {
  transactions: Transaction[];
  onViewAll: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const dir = useDir();

  if (transactions.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      {transactions.map((tx, i) => (
        <TransactionRow
          key={tx.id}
          item={tx}
          isFirst={i === 0}
          onPress={onViewAll}
        />
      ))}
      <TouchableOpacity
        style={[styles.viewAll, { borderTopColor: theme.borderLight, flexDirection: dir.row }]}
        activeOpacity={0.6}
        onPress={onViewAll}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t('home.viewAll')}
      >
        <Text style={[styles.viewAllText, { color: theme.primary }]} maxFontSizeMultiplier={1.4}>
          {t('home.viewAll')}
        </Text>
        <ChevronRight size={16} color={theme.primary} strokeWidth={icon.stroke} style={dir.flip} />
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
  viewAll: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  viewAllText: {
    fontSize: 14,
    fontFamily: font.semibold,
    letterSpacing: -0.2,
  },
});
