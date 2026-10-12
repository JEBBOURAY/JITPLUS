import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  I18nManager,
} from 'react-native';
import { ChevronRight, Gift, Camera, X, Plus, Trash2, Sparkles } from 'lucide-react-native';
// expo-image-picker is lazy-loaded inside the reward image picker handler.
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import PremiumLockModal from '@/components/PremiumLockModal';
import InfoHint from '@/components/settings/InfoHint';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import { useUploadRewardImage, queryKeys } from '@/hooks/useQueryHooks';
import { useQueryClient } from '@tanstack/react-query';

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
  isPremium: boolean;
  hasAccumulationLimit: boolean;
  accumulationLimit: string;
  /** Saved stampsForReward, used to size the one-tap suggestions. */
  stampsForReward: number;
  /** Called when rewards change so parent can react (e.g. preview) */
  onRewardsChange?: (rewards: Reward[]) => void;
  /** External trigger to reload rewards */
  reloadToken?: number;
}

function RewardManagerBase({
  theme, t, isPremium, hasAccumulationLimit, accumulationLimit, stampsForReward,
  onRewardsChange, reloadToken,
}: Props) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loadingRewards, setLoadingRewards] = useState(false);
  const [savingReward, setSavingReward] = useState(false);
  const [rewardTitle, setRewardTitle] = useState('');
  const [rewardCost, setRewardCost] = useState('');
  const [rewardDescription, setRewardDescription] = useState('');
  const [rewardImageUrl, setRewardImageUrl] = useState<string | null>(null);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [premiumLockVisible, setPremiumLockVisible] = useState(false);
  const uploadRewardImage = useUploadRewardImage();
  const qc = useQueryClient();
  const unit = t('common.stamps');
  const stampUnit = (n: number) => (n === 1 ? t('common.stamp') : t('common.stamps'));
  const isDark = theme.mode === 'dark';
  const fill = isDark ? 'rgba(255,255,255,0.06)' : theme.bgInput;
  const rowFill = isDark ? 'rgba(255,255,255,0.04)' : theme.bgElevated;
  const shadow = isDark
    ? null
    : { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 };

  const suggestions = [
    { title: t('settingsPage.suggestCoffee'), cost: stampsForReward },
    { title: t('settingsPage.suggestDiscount'), cost: Math.max(1, Math.round(stampsForReward / 2)) },
    { title: t('settingsPage.suggestFreeItem'), cost: stampsForReward },
  ];

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
      setShowForm(false);
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
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingRewardId(null);
    setRewardTitle(''); setRewardCost(''); setRewardDescription(''); setRewardImageUrl(null);
    setShowForm(false);
  };

  // "+ Add a reward" — gated at the free-plan limit (1 reward) with an upsell (§9/§5).
  const handleOpenAddForm = () => {
    if (!isPremium && rewards.length >= 1) {
      setPremiumLockVisible(true);
      return;
    }
    setEditingRewardId(null);
    setRewardTitle(''); setRewardCost(''); setRewardDescription(''); setRewardImageUrl(null);
    setShowForm(true);
  };

  // One tap fills the form; the merchant still reviews it before saving.
  const handleUseSuggestion = (title: string, cost: number) => {
    setEditingRewardId(null);
    setRewardTitle(title);
    setRewardCost(String(cost));
    setRewardDescription('');
    setRewardImageUrl(null);
    setShowForm(true);
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
      setShowForm(false);
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

  return (
    <>
      {/* ── Panel: Cadeaux (§9) ── */}
      <View style={[styles.panel, { backgroundColor: theme.bgCard }, shadow]}>
        <View style={styles.panelHeader}>
          <View style={[styles.panelIcon, { backgroundColor: theme.primaryBg }]}>
            <Gift size={17} color={theme.primary} strokeWidth={1.9} />
          </View>
          <Text style={[styles.panelTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
            {rewards.length > 0 ? t('settingsPage.giftsCount', { count: rewards.length }) : t('settingsPage.giftsSection')}
          </Text>
        </View>

        <View style={styles.panelBody}>
          {showForm ? (
            /* ── Separate add / edit form (progressive disclosure) ── */
            <View style={styles.rewardForm}>
              <Text style={[styles.formTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                {editingRewardId ? t('settingsPage.editGiftTitle') : t('settingsPage.newGiftTitle')}
              </Text>
              {/* Image picker */}
              <View style={styles.imagePickerRow}>
                <TouchableOpacity
                  style={[styles.imagePickerThumb, { backgroundColor: fill }]}
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
                  <View style={styles.imagePickerLabelRow}>
                    <Text style={[styles.imagePickerLabel, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                      {t('settingsPage.rewardImageLabel')}
                    </Text>
                    <InfoHint text={t('settingsPage.rewardImageInfo')} />
                  </View>
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
                style={[styles.input, { backgroundColor: fill, color: theme.text }]}
                value={rewardTitle}
                onChangeText={setRewardTitle}
                placeholder={t('settingsPage.giftName')}
                placeholderTextColor={theme.textMuted}
                maxLength={80}
                maxFontSizeMultiplier={1.3}
              />
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.input, { backgroundColor: fill, color: theme.text }]}
                  value={rewardCost}
                  onChangeText={setRewardCost}
                  keyboardType="numeric"
                  placeholder={t('settingsPage.giftCost')}
                  placeholderTextColor={theme.textMuted}
                  maxLength={9}
                  maxFontSizeMultiplier={1.3}
                />
                <Text style={[styles.inputSuffix, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                  {stampUnit(parseInt(rewardCost, 10))}
                </Text>
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: fill, color: theme.text }]}
                value={rewardDescription}
                onChangeText={setRewardDescription}
                placeholder={t('settingsPage.giftDesc')}
                placeholderTextColor={theme.textMuted}
                maxLength={200}
                maxFontSizeMultiplier={1.3}
              />
              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.addRewardBtn, { backgroundColor: fill, flex: 1 }]}
                  onPress={handleCancelEdit}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={[styles.addRewardBtnText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.addRewardBtn, styles.solidBtn, { flex: 1 }]}
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
          ) : loadingRewards ? (
            <View style={[styles.giftEmpty, { backgroundColor: rowFill }]}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : rewards.length === 0 ? (
            /* ── Empty state (§9) ── */
            <>
              <View style={[styles.giftEmpty, { backgroundColor: rowFill }]}>
                <View style={[styles.giftEmptyIcon, { backgroundColor: theme.primaryBg }]}>
                  <Gift size={20} color={theme.primary} strokeWidth={1.8} />
                </View>
                <View style={styles.giftEmptyTitleRow}>
                  <Text style={[styles.giftEmptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                    {t('settingsPage.noGiftsConfigured')}
                  </Text>
                  <InfoHint text={t('settingsPage.giftEmptyInfo')} />
                </View>
              </View>
              <View style={styles.suggestHeader}>
                <Sparkles size={13} color={theme.textMuted} strokeWidth={2} />
                <Text style={[styles.suggestTitle, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                  {t('settingsPage.suggestionsTitle')}
                </Text>
              </View>
              <View style={styles.suggestRow}>
                {suggestions.map((s) => {
                  const label = t(s.cost === 1 ? 'settingsPage.suggestionLabel_one' : 'settingsPage.suggestionLabel_other', {
                    title: s.title,
                    count: s.cost,
                  });
                  return (
                    <TouchableOpacity
                      key={s.title}
                      style={[styles.suggestChip, { backgroundColor: theme.primaryBg }]}
                      onPress={() => handleUseSuggestion(s.title, s.cost)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                    >
                      <Plus size={13} color={theme.primary} strokeWidth={2.4} />
                      <Text style={[styles.suggestChipText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                onPress={handleOpenAddForm}
                activeOpacity={0.85}
                style={[styles.addGiftBtn, styles.solidBtn]}
                accessibilityRole="button"
                accessibilityLabel={t('settingsPage.addGiftButton')}
              >
                <Plus size={16} color="#fff" strokeWidth={2.3} />
                <Text style={styles.addGiftBtnText} maxFontSizeMultiplier={1.2}>{t('settingsPage.addGiftButton')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ── List state (§9) ── */
            <>
              <View style={styles.rewardList}>
                {rewards.map((reward) => (
                  <TouchableOpacity
                    key={reward.id}
                    style={[styles.rewardRow, { backgroundColor: rowFill }]}
                    onPress={() => handleEditReward(reward)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={reward.titre}
                  >
                    {reward.imageUrl ? (
                      <Image source={{ uri: resolveImageUrl(reward.imageUrl) as string }} style={styles.rewardRowThumb} />
                    ) : (
                      <View style={[styles.rewardRowThumb, styles.rewardRowThumbFallback, { backgroundColor: theme.primaryBg }]}>
                        <Gift size={ms(20)} color={theme.primary} strokeWidth={1.6} />
                      </View>
                    )}
                    <View style={styles.rewardRowInfo}>
                      <Text style={[styles.rewardRowTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                        {reward.titre}
                      </Text>
                      <Text style={[styles.rewardRowMeta, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                        {reward.cout} {stampUnit(reward.cout)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.rewardDeleteBtn, { backgroundColor: theme.danger + '14' }]}
                      onPress={() => handleDeleteReward(reward.id)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t('settingsPage.deleteGift')}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Trash2 size={15} color={theme.danger} strokeWidth={2} />
                    </TouchableOpacity>
                    <ChevronRight size={16} color={theme.textMuted} style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={handleOpenAddForm} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('settingsPage.addGiftButton')}>
                <View style={[styles.addGiftBtn, { backgroundColor: theme.primaryBg }]}>
                  <Plus size={16} color={theme.primary} strokeWidth={2.3} />
                  <Text style={[styles.addGiftBtnText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>{t('settingsPage.addGiftButton')}</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <PremiumLockModal
        visible={premiumLockVisible}
        onClose={() => setPremiumLockVisible(false)}
        titleKey="settingsPage.premiumRewardTitle"
        descKey="settingsPage.premiumRewardDesc"
      />
    </>
  );
}

export const RewardManager = React.memo(RewardManagerBase);

const styles = StyleSheet.create({
  // ── Panel (§9) ──
  // Same scale as app/settings.tsx: panel title 15/SemiBold, label 13.5/Medium, caption 12/Regular.
  panel: { marginHorizontal: 16, marginTop: 18, borderRadius: 20 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingTop: 16, paddingHorizontal: 16 },
  panelIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  panelTitle: { flex: 1, fontSize: 15, fontFamily: 'Lexend_600SemiBold', letterSpacing: -0.2 },
  panelBody: { padding: 16, paddingTop: 14 },
  formTitle: { fontSize: 13.5, fontFamily: 'Lexend_600SemiBold', marginBottom: 2 },
  imagePickerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  solidBtn: {
    backgroundColor: palette.violet,
    borderBottomWidth: 3,
    borderBottomColor: palette.violetDark,
    shadowColor: palette.violet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },

  // ── Suggestions (empty state) ──
  suggestHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  suggestTitle: { fontSize: 12, fontFamily: 'Lexend_400Regular' },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  suggestChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20 },
  suggestChipText: { fontSize: 12.5, fontFamily: 'Lexend_500Medium' },

  // ── Empty state (§9) ──
  giftEmpty: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 14,
  },
  giftEmptyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  giftEmptyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  giftEmptyTitle: { fontSize: 13.5, fontFamily: 'Lexend_500Medium' },

  // ── Add button (§9) ──
  addGiftBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 14 },
  addGiftBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Lexend_600SemiBold' },

  rewardForm: { gap: 10, marginBottom: 12 },
  imagePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imagePickerThumb: {
    width: ms(64),
    height: ms(64),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePickerImg: { width: '100%', height: '100%' },
  imagePickerLabel: { fontSize: 14, fontFamily: 'Lexend_500Medium', marginBottom: 2 },
  imagePickerRemove: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  imagePickerRemoveText: { fontSize: 12, fontFamily: 'Lexend_500Medium' },
  input: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: 'Lexend_500Medium',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputSuffix: { marginLeft: 12, fontSize: 12, fontFamily: 'Lexend_500Medium' },
  formActions: { flexDirection: 'row', gap: 8 },
  addRewardBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  addRewardBtnText: { color: '#fff', fontSize: 14, fontFamily: 'Lexend_600SemiBold' },
  rewardList: { gap: 10 },
  rewardRow: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rewardRowThumb: { width: ms(44), height: ms(44), borderRadius: ms(12), overflow: 'hidden' },
  rewardRowThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  rewardRowInfo: { flex: 1, minWidth: 0 },
  rewardRowTitle: { fontSize: 13.5, fontFamily: 'Lexend_500Medium' },
  rewardRowMeta: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  rewardDeleteBtn: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
