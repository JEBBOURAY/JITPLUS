import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';

interface Reward {
  id: string;
  titre: string;
  cout: number;
  description?: string;
}

interface Props {
  theme: Record<string, any>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  rewards: Reward[];
  loadingRewards: boolean;
  selectedRewardId: string | null;
  setSelectedRewardId: (id: string | null) => void;
  customerPoints: number;
  isStampsMode: boolean;
  redeemOnly?: boolean;
}

export function RewardSelector({
  theme,
  t,
  rewards,
  loadingRewards,
  selectedRewardId,
  setSelectedRewardId,
  customerPoints,
  isStampsMode,
  redeemOnly = false,
}: Props) {
  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard }]}>
      <Text style={[styles.title, { color: theme.text }]}>
        {redeemOnly ? t('transactionAmount.redeemChooseGift') : t('transaction.chooseGift')}
      </Text>
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        {redeemOnly
          ? t('transactionAmount.redeemOnlyHint')
          : t('transactionAmount.selectRewardHint')}
      </Text>

      {loadingRewards ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : rewards.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>
          {t('transaction.noGifts')}
        </Text>
      ) : (
        <View style={styles.list}>
          {rewards.map((reward) => {
            const isSelected = reward.id === selectedRewardId;
            const isAffordable = customerPoints >= reward.cout;
            return (
              <TouchableOpacity
                key={reward.id}
                style={[
                  styles.row,
                  {
                    borderColor: isSelected ? theme.primary : theme.border,
                    backgroundColor: isSelected ? theme.primaryBg : theme.bg,
                    opacity: isAffordable ? 1 : 0.5,
                  },
                ]}
                onPress={() => setSelectedRewardId(selectedRewardId === reward.id ? null : reward.id)}
                disabled={!isAffordable}
                activeOpacity={0.7}
              >
                <View style={styles.info}>
                  <Text style={[styles.name, { color: theme.text }]}>
                    {reward.titre}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>
                    {reward.cout} {isStampsMode ? t('common.stamps') : t('common.points')}
                  </Text>
                </View>
                {isAffordable ? (
                  <View
                    style={[
                      styles.indicator,
                      {
                        borderColor: isSelected ? theme.primary : theme.border,
                        backgroundColor: isSelected ? theme.primary : 'transparent',
                      },
                    ]}
                  />
                ) : (
                  <Text style={[styles.badge, { color: theme.danger }]}>
                    {t('transaction.insufficient')}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  loading: { paddingVertical: 20, alignItems: 'center' },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 2 },
  badge: { fontSize: 12, fontWeight: '600' },
  indicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
});
