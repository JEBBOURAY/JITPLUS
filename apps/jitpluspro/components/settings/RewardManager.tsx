import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Pencil, ChevronDown, ChevronUp, Gift } from 'lucide-react-native';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import PremiumLockCard from '@/components/PremiumLockCard';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type { Merchant } from '@/types';

interface Reward {
  id: string;
  titre: string;
  cout: number;
  description?: string;
}

interface Props {
  theme: ThemeColors;
  t: (key: string, params?: Record<string, unknown>) => string;
  isStamps: boolean;
  isPremium: boolean;
  loyaltyType: 'POINTS' | 'STAMPS';
  merchant: Merchant | null;
  conversionX: string;
  conversionY: string;
  hasAccumulationLimit: boolean;
  accumulationLimit: string;
  /** Called when rewards change so parent can react (e.g. preview) */
  onRewardsChange?: (rewards: Reward[]) => void;
  /** External trigger to reload rewards */
  reloadToken?: number;
  /** Whether the section is expanded */
  expanded?: boolean;
  /** Toggle expand/collapse */
  onToggleExpanded?: () => void;
}

export function RewardManager({
  theme, t, isStamps, isPremium, loyaltyType, merchant,
  conversionX, conversionY, hasAccumulationLimit, accumulationLimit,
  onRewardsChange, reloadToken, expanded = true, onToggleExpanded,
}: Props) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [savingReward, setSavingReward] = useState(false);
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardCost, setRewardCost] = useState('');
  const [rewardDescription, setRewardDescription] = useState('');
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);

  const loadRewards = async () => {
    setLoadingRewards(true);
    try {
      const res = await api.get('/rewards');
      setRewards(res.data);
      onRewardsChange?.(res.data);
    } catch {
      Alert.alert(t('common.error'), t('settingsPage.loadRewardsError'));
    } finally {
      setLoadingRewards(false);
    }
  };

  useEffect(() => { loadRewards(); }, [reloadToken]);

  const doAddReward = async () => {
    const cost = parseInt(rewardCost, 10);
    setSavingReward(true);
    try {
      await api.post('/rewards', {
        titre: rewardTitle.trim(),
        cout: cost,
        description: rewardDescription.trim() || undefined,
      });
      setRewardTitle(''); setRewardCost(''); setRewardDescription('');
      loadRewards();
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('settingsPage.saveError')));
    } finally {
      setSavingReward(false);
    }
  };

  const handleAddReward = () => {
    const cost = parseInt(rewardCost, 10);
    if (!rewardTitle.trim()) {
      Alert.alert(t('common.error'), t('settingsPage.rewardNameRequired'));
      return;
    }
    if (isNaN(cost) || cost <= 0) {
      Alert.alert(t('common.error'), t('settingsPage.rewardCostError'));
      return;
    }
    const limitVal = parseInt(accumulationLimit, 10);
    if (hasAccumulationLimit && !isNaN(limitVal) && cost > limitVal) {
      const unit = isStamps ? t('common.stamps') : t('common.points');
      Alert.alert(
        t('settingsPage.rewardExceedsLimitTitle'),
        t('settingsPage.rewardExceedsLimitMessage', { cost, limit: limitVal, unit }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.confirm'), onPress: doAddReward },
        ],
      );
      return;
    }
    doAddReward();
  };

  const handleEditReward = (reward: Reward) => {
    setEditingRewardId(reward.id);
    setRewardTitle(reward.titre);
    setRewardCost(reward.cout.toString());
    setRewardDescription(reward.description || '');
  };

  const handleCancelEdit = () => {
    setEditingRewardId(null);
    setRewardTitle(''); setRewardCost(''); setRewardDescription('');
  };

  const doUpdateReward = async () => {
    const cost = parseInt(rewardCost, 10);
    setSavingReward(true);
    try {
      await api.put(`/rewards/${editingRewardId}`, {
        titre: rewardTitle.trim(),
        cout: cost,
        description: rewardDescription.trim() || undefined,
      });
      setEditingRewardId(null);
      setRewardTitle(''); setRewardCost(''); setRewardDescription('');
      loadRewards();
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('settingsPage.editRewardError')));
    } finally {
      setSavingReward(false);
    }
  };

  const handleUpdateReward = () => {
    if (!editingRewardId) return;
    const cost = parseInt(rewardCost, 10);
    if (!rewardTitle.trim()) {
      Alert.alert(t('common.error'), t('settingsPage.rewardNameRequired'));
      return;
    }
    if (isNaN(cost) || cost <= 0) {
      Alert.alert(t('common.error'), t('settingsPage.rewardCostError'));
      return;
    }
    const limitVal = parseInt(accumulationLimit, 10);
    if (hasAccumulationLimit && !isNaN(limitVal) && cost > limitVal) {
      const unit = isStamps ? t('common.stamps') : t('common.points');
      Alert.alert(
        t('settingsPage.rewardExceedsLimitTitle'),
        t('settingsPage.rewardExceedsLimitMessage', { cost, limit: limitVal, unit }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.confirm'), onPress: doUpdateReward },
        ],
      );
      return;
    }
    doUpdateReward();
  };

  const handleDeleteReward = (rewardId: string) => {
    Alert.alert(t('settingsPage.deleteRewardTitle'), t('settingsPage.deleteRewardMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/rewards/${rewardId}`);
            loadRewards();
          } catch {
            Alert.alert(t('common.error'), t('settingsPage.deleteRewardError'));
          }
        },
      },
    ]);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={onToggleExpanded}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Gift size={20} color={theme.primary} strokeWidth={1.5} />
          <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 0, marginBottom: 0, marginHorizontal: 0 }]}>{t('settingsPage.giftsSection')}</Text>
        </View>
        {expanded
          ? <ChevronUp size={20} color={theme.textMuted} />
          : <ChevronDown size={20} color={theme.textMuted} />}
      </TouchableOpacity>
      {expanded && <View style={[styles.card, { backgroundColor: theme.bgCard }]}>
        <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
          {t('settingsPage.giftsSectionHint')}
        </Text>

        {(!isPremium && rewards.length >= 1 && !editingRewardId) ? (
          <PremiumLockCard titleKey="settingsPage.premiumRewardTitle" descriptionKey="settingsPage.premiumRewardDesc" />
        ) : (
          <View style={styles.rewardForm}>
            <TextInput
              style={[styles.input, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
              value={rewardTitle}
              onChangeText={setRewardTitle}
              placeholder={t('settingsPage.giftName')}
              placeholderTextColor={theme.textMuted}
            />
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
                value={rewardCost}
                onChangeText={setRewardCost}
                keyboardType="numeric"
                placeholder={t('settingsPage.giftCost')}
                placeholderTextColor={theme.textMuted}
              />
              <Text style={[styles.inputSuffix, { color: theme.textSecondary }]}>
                {isStamps ? t('common.stamps') : t('common.points')}
              </Text>
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
              value={rewardDescription}
              onChangeText={setRewardDescription}
              placeholder={t('settingsPage.giftDesc')}
              placeholderTextColor={theme.textMuted}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {editingRewardId && (
                <TouchableOpacity
                  style={[styles.addRewardBtn, { backgroundColor: theme.border, flex: 1 }]}
                  onPress={handleCancelEdit}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.addRewardBtnText, { color: theme.text }]}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.addRewardBtn, { backgroundColor: theme.primary, flex: 1 }]}
                onPress={editingRewardId ? handleUpdateReward : handleAddReward}
                disabled={savingReward}
                activeOpacity={0.8}
              >
                {savingReward ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.addRewardBtnText}>
                    {editingRewardId ? t('settingsPage.saveGift') : t('settingsPage.addGift')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loadingRewards ? (
          <View style={[styles.rewardEmpty, { borderColor: theme.border }]}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        ) : rewards.length === 0 ? (
          <View style={[styles.rewardEmpty, { borderColor: theme.border }]}>
            <Text style={[styles.noRewardText, { color: theme.textMuted }]}>
              {t('settingsPage.noGiftsConfigured')}
            </Text>
          </View>
        ) : (
          <View style={styles.rewardList}>
            {rewards.map((reward) => (
              <View
                key={reward.id}
                style={[styles.rewardRow, { backgroundColor: theme.bg, borderColor: theme.border }]}
              >
                <View style={styles.rewardRowInfo}>
                  <Text style={[styles.rewardRowTitle, { color: theme.text }]}>
                    {reward.titre}
                  </Text>
                  {(() => {
                    const loyaltyTypeChanged = loyaltyType !== (merchant?.loyaltyType || 'POINTS');
                    const x = parseFloat(conversionX) || 10;
                    const y = parseFloat(conversionY) || 1;
                    const rate = x / y;
                    const oldUnit = merchant?.loyaltyType === 'STAMPS' ? t('common.stamps') : t('common.points');
                    const newUnit = isStamps ? t('common.stamps') : t('common.points');
                    if (loyaltyTypeChanged && rate > 0) {
                      const newCost = loyaltyType === 'STAMPS'
                        ? Math.max(Math.floor(reward.cout / rate), 1)
                        : Math.max(Math.round(reward.cout * rate), 1);
                      return (
                        <Text style={[styles.rewardRowMeta, { color: theme.textSecondary }]}>
                          <Text style={{ textDecorationLine: 'line-through', color: theme.textMuted }}>{reward.cout} {oldUnit}</Text>
                          {'  →  '}
                          <Text style={{ color: theme.primary, fontWeight: '600' }}>{newCost} {newUnit}</Text>
                        </Text>
                      );
                    }
                    return (
                      <Text style={[styles.rewardRowMeta, { color: theme.textSecondary }]}>
                        {reward.cout} {newUnit}
                      </Text>
                    );
                  })()}
                  {reward.description ? (
                    <Text style={[styles.rewardRowDesc, { color: theme.textMuted }]}>
                      {reward.description}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.rewardActions}>
                  <TouchableOpacity
                    style={styles.rewardEditBtn}
                    onPress={() => handleEditReward(reward)}
                    activeOpacity={0.7}
                  >
                    <Pencil size={14} color={theme.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rewardDeleteBtn}
                    onPress={() => handleDeleteReward(reward.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.rewardDeleteText, { color: theme.danger }]}>{t('settingsPage.deleteGift')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>}
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 16,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#1F2937',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLabel: { fontSize: 14, marginBottom: 14, lineHeight: 20 },
  rewardForm: { gap: 10, marginBottom: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputSuffix: { marginLeft: 12, fontSize: 13, fontWeight: '500' },
  addRewardBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  addRewardBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rewardEmpty: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  noRewardText: { fontSize: 14, textAlign: 'center' },
  rewardList: { gap: 8 },
  rewardRow: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 12 },
  rewardRowInfo: { flex: 1 },
  rewardRowTitle: { fontSize: 15, fontWeight: '700' },
  rewardRowMeta: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  rewardRowDesc: { fontSize: 12, marginTop: 6 },
  rewardActions: { justifyContent: 'center', alignItems: 'flex-end', gap: 8 },
  rewardEditBtn: { padding: 6 },
  rewardDeleteBtn: { paddingHorizontal: 8, justifyContent: 'center' },
  rewardDeleteText: { fontSize: 12, fontWeight: '700' },
});
