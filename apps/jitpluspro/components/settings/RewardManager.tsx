import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Pencil, ChevronDown, ChevronUp, Gift, Camera, X } from 'lucide-react-native';
// expo-image-picker is lazy-loaded inside the reward image picker handler.
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import PremiumLockCard from '@/components/PremiumLockCard';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import { useUploadRewardImage, queryKeys } from '@/hooks/useQueryHooks';
import { useQueryClient } from '@tanstack/react-query';
import type { Merchant } from '@/types';

interface Reward {
  id: string;
  titre: string;
  cout: number;
  description?: string;
  imageUrl?: string | null;
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
  const [rewardImageUrl, setRewardImageUrl] = useState<string | null>(null);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const uploadRewardImage = useUploadRewardImage();
  const qc = useQueryClient();

  const loadRewards = useCallback(async () => {
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
  }, [onRewardsChange, t]);

  useEffect(() => {
    void loadRewards();
  }, [loadRewards, reloadToken]);

  const handlePickRewardImage = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.error'), t('upload.permissionDenied'));
        return;
      }
      const preferredMode =
        (ImagePicker as any).UIImagePickerPreferredAssetRepresentationMode?.Compatible ?? 'compatible';
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        preferredAssetRepresentationMode: preferredMode,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const data = await uploadRewardImage.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize ?? null,
      });
      setRewardImageUrl(data.url);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('upload.uploadFailed')));
    }
  };

  const doAddReward = async () => {
    const cost = parseInt(rewardCost, 10);
    setSavingReward(true);
    try {
      await api.post('/rewards', {
        titre: rewardTitle.trim(),
        cout: cost,
        description: rewardDescription.trim() || undefined,
        imageUrl: rewardImageUrl || undefined,
      });
      setRewardTitle(''); setRewardCost(''); setRewardDescription(''); setRewardImageUrl(null);
      qc.invalidateQueries({ queryKey: queryKeys.rewards });
      await loadRewards();
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
    setRewardImageUrl(reward.imageUrl || null);
  };

  const handleCancelEdit = () => {
    setEditingRewardId(null);
    setRewardTitle(''); setRewardCost(''); setRewardDescription(''); setRewardImageUrl(null);
  };

  const doUpdateReward = async () => {
    const cost = parseInt(rewardCost, 10);
    setSavingReward(true);
    try {
      await api.put(`/rewards/${editingRewardId}`, {
        titre: rewardTitle.trim(),
        cout: cost,
        description: rewardDescription.trim() || undefined,
        imageUrl: rewardImageUrl,
      });
      setEditingRewardId(null);
      setRewardTitle(''); setRewardCost(''); setRewardDescription(''); setRewardImageUrl(null);
      qc.invalidateQueries({ queryKey: queryKeys.rewards });
      await loadRewards();
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
            qc.invalidateQueries({ queryKey: queryKeys.rewards });
            await loadRewards();
          } catch {
            Alert.alert(t('common.error'), t('settingsPage.deleteRewardError'));
          }
        },
      },
    ]);
  };

  const loyaltyTypeChanged = loyaltyType !== (merchant?.loyaltyType || 'POINTS');
  const conversionRate = useMemo(() => {
    const x = parseFloat(conversionX);
    const y = parseFloat(conversionY);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) return null;
    return x / y;
  }, [conversionX, conversionY]);

  const oldUnit = merchant?.loyaltyType === 'STAMPS' ? t('common.stamps') : t('common.points');
  const newUnit = isStamps ? t('common.stamps') : t('common.points');
  const convertedCosts = useMemo(() => {
    const costs = new Map<string, number>();
    if (!loyaltyTypeChanged || conversionRate == null) return costs;
    // User typed "X fromUnit = Y toUnit" → conversionRate = X/Y.
    // In both directions the new cost is ROUND(cout / rate), min 1.
    // Must match backend recalculateBalancesTx() and settings.tsx preview.
    rewards.forEach((reward) => {
      const converted = Math.max(Math.round(reward.cout / conversionRate), 1);
      costs.set(reward.id, converted);
    });
    return costs;
  }, [rewards, loyaltyTypeChanged, conversionRate]);

  return (
    <>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={onToggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('settingsPage.giftsSection')}
        accessibilityState={{ expanded }}
      >
        <View style={styles.sectionHeaderContent}>
          <View style={styles.sectionHeaderIcon}>
            <Gift size={ms(16)} color={palette.violet} strokeWidth={2} />
          </View>
          <Text style={[styles.sectionTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">{t('settingsPage.giftsSection')}</Text>
        </View>
        {expanded
          ? <ChevronUp size={20} color={theme.textMuted} />
          : <ChevronDown size={20} color={theme.textMuted} />}
      </TouchableOpacity>
      {expanded && <View style={[styles.card, { backgroundColor: theme.bgCard }]}>
        <Text style={[styles.cardLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
          {t('settingsPage.giftsSectionHint')}
        </Text>

        {(!isPremium && rewards.length >= 1 && !editingRewardId) ? (
          <PremiumLockCard titleKey="settingsPage.premiumRewardTitle" descriptionKey="settingsPage.premiumRewardDesc" />
        ) : (
          <View style={styles.rewardForm}>
            {/* Image picker for reward */}
            <View style={styles.imagePickerRow}>
              <TouchableOpacity
                style={[styles.imagePickerThumb, { backgroundColor: theme.bgInput, borderColor: theme.border }]}
                onPress={handlePickRewardImage}
                disabled={uploadRewardImage.isPending}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('settingsPage.rewardImagePick')}
              >
                {uploadRewardImage.isPending ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : rewardImageUrl ? (
                  <Image source={{ uri: resolveImageUrl(rewardImageUrl) as string }} style={styles.imagePickerImg} />
                ) : (
                  <Camera size={ms(22)} color={theme.textMuted} strokeWidth={1.8} />
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={[styles.imagePickerLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.rewardImageLabel')}
                </Text>
                <Text style={[styles.imagePickerHint, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.rewardImageHint')}
                </Text>
                {rewardImageUrl && (
                  <TouchableOpacity
                    onPress={() => setRewardImageUrl(null)}
                    style={styles.imagePickerRemove}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                  >
                    <X size={12} color={theme.danger} strokeWidth={2} />
                    <Text style={[styles.imagePickerRemoveText, { color: theme.danger }]} maxFontSizeMultiplier={1.3}>
                      {t('common.delete')}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
              value={rewardTitle}
              onChangeText={setRewardTitle}
              placeholder={t('settingsPage.giftName')}
              placeholderTextColor={theme.textMuted}
              maxLength={80}
              maxFontSizeMultiplier={1.3}
            />
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
                value={rewardCost}
                onChangeText={setRewardCost}
                keyboardType="numeric"
                placeholder={t('settingsPage.giftCost')}
                placeholderTextColor={theme.textMuted}
                maxLength={9}
                maxFontSizeMultiplier={1.3}
              />
              <Text style={[styles.inputSuffix, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                {isStamps ? t('common.stamps') : t('common.points')}
              </Text>
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: theme.bgInput, color: theme.text, borderColor: theme.border }]}
              value={rewardDescription}
              onChangeText={setRewardDescription}
              placeholder={t('settingsPage.giftDesc')}
              placeholderTextColor={theme.textMuted}
              maxLength={200}
              maxFontSizeMultiplier={1.3}
            />
            <View style={styles.formActions}>
              {editingRewardId && (
                <TouchableOpacity
                  style={[styles.addRewardBtn, { backgroundColor: theme.border, flex: 1 }]}
                  onPress={handleCancelEdit}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={[styles.addRewardBtnText, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.addRewardBtn, { backgroundColor: theme.primary, flex: 1 }]}
                onPress={editingRewardId ? handleUpdateReward : handleAddReward}
                disabled={savingReward}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={editingRewardId ? t('settingsPage.saveGift') : t('settingsPage.addGift')}
                accessibilityState={{ disabled: savingReward, busy: savingReward }}
              >
                {savingReward ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.addRewardBtnText} maxFontSizeMultiplier={1.3}>
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
            <Text style={[styles.noRewardText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
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
                {reward.imageUrl ? (
                  <Image
                    source={{ uri: resolveImageUrl(reward.imageUrl) as string }}
                    style={styles.rewardRowThumb}
                  />
                ) : (
                  <View style={[styles.rewardRowThumb, styles.rewardRowThumbFallback, { backgroundColor: theme.bgInput }]}>
                    <Gift size={ms(22)} color={theme.primary} strokeWidth={1.6} />
                  </View>
                )}
                <View style={styles.rewardRowInfo}>
                  <Text style={[styles.rewardRowTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} numberOfLines={2}>
                    {reward.titre}
                  </Text>
                  {convertedCosts.has(reward.id) ? (
                    <Text style={[styles.rewardRowMeta, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                      <Text style={[styles.rewardOldCost, { color: theme.textMuted }]}>{reward.cout} {oldUnit}</Text>
                      {'  ->  '}
                      <Text style={[styles.rewardNewCost, { color: theme.primary }]}>{convertedCosts.get(reward.id)} {newUnit}</Text>
                    </Text>
                  ) : (
                    <Text style={[styles.rewardRowMeta, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                      {reward.cout} {newUnit}
                    </Text>
                  )}
                  {reward.description ? (
                    <Text style={[styles.rewardRowDesc, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4} numberOfLines={3}>
                      {reward.description}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.rewardActions}>
                  <TouchableOpacity
                    style={styles.rewardEditBtn}
                    onPress={() => handleEditReward(reward)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('settingsPage.saveGift')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Pencil size={14} color={theme.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rewardDeleteBtn}
                    onPress={() => handleDeleteReward(reward.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('settingsPage.deleteGift')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.rewardDeleteText, { color: theme.danger }]} maxFontSizeMultiplier={1.3}>{t('settingsPage.deleteGift')}</Text>
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
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.2,
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sectionHeaderIcon: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(10),
    backgroundColor: `${palette.violet}18`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardLabel: { fontSize: 14, marginBottom: 14, lineHeight: 20, fontFamily: 'Lexend_400Regular' },
  rewardForm: { gap: 10, marginBottom: 12 },
  imagePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imagePickerThumb: {
    width: ms(64),
    height: ms(64),
    borderRadius: ms(12),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePickerImg: { width: '100%', height: '100%' },
  imagePickerLabel: { fontSize: 14, fontFamily: 'Lexend_500Medium', marginBottom: 2 },
  imagePickerHint: { fontSize: 12, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
  imagePickerRemove: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  imagePickerRemoveText: { fontSize: 12, fontFamily: 'Lexend_500Medium' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '500',
    fontFamily: 'Lexend_500Medium',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputSuffix: { marginLeft: 12, fontSize: 13, fontWeight: '500', fontFamily: 'Lexend_500Medium' },
  formActions: { flexDirection: 'row', gap: 8 },
  addRewardBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  addRewardBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  rewardEmpty: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  noRewardText: { fontSize: 14, textAlign: 'center', fontFamily: 'Lexend_400Regular' },
  rewardList: { gap: 8 },
  rewardRow: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 12 },
  rewardRowThumb: { width: ms(48), height: ms(48), borderRadius: ms(10), overflow: 'hidden' },
  rewardRowThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  rewardRowInfo: { flex: 1 },
  rewardRowTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  rewardRowMeta: { fontSize: 13, fontWeight: '600', marginTop: 2, fontFamily: 'Lexend_600SemiBold' },
  rewardRowDesc: { fontSize: 12, marginTop: 6, fontFamily: 'Lexend_400Regular' },
  rewardOldCost: { textDecorationLine: 'line-through', fontFamily: 'Lexend_400Regular' },
  rewardNewCost: { fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  rewardActions: { justifyContent: 'center', alignItems: 'flex-end', gap: 8 },
  rewardEditBtn: { padding: 6 },
  rewardDeleteBtn: { paddingHorizontal: 8, justifyContent: 'center' },
  rewardDeleteText: { fontSize: 12, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
});
