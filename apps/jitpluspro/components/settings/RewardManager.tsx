import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ChevronRight, Camera, X, Plus } from 'lucide-react-native';
import { JitGift } from '@/components/icons';
// expo-image-picker is lazy-loaded inside the reward image picker handler.
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { confirmAsync } from '@/utils/confirm';
import { cheapestReward } from '@/utils/stamps';
import PremiumLockModal from '@/components/PremiumLockModal';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { resolveImageUrl } from '@/utils/imageUrl';
import { useRewards, useUploadRewardImage, queryKeys } from '@/hooks/useQueryHooks';
import { useQueryClient } from '@tanstack/react-query';
import { fieldFill } from '@/components/settings/surface';
import type { Reward } from '@/types';

const EMPTY_REWARDS: Reward[] = [];

interface Props {
  theme: ThemeColors;
  t: (key: string, params?: Record<string, unknown>) => string;
  isPremium: boolean;
  hasAccumulationLimit: boolean;
  accumulationLimit: string;
  /** Saved stampsForReward, used to size the one-tap suggestions. */
  stampsForReward: number;
}

function RewardManagerBase({
  theme, t, isPremium, hasAccumulationLimit, accumulationLimit, stampsForReward,
}: Props) {
  // Shared query: the settings screen reads the same cache, and invalidating
  // queryKeys.rewards after any change refreshes both.
  const { data: rewards = EMPTY_REWARDS, isLoading: loadingRewards, error: rewardsError } = useRewards();
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
  const { isRTL, row, textAlign, flip } = useDir();
  const insets = useSafeAreaInsets();
  const unit = t('common.stamps');
  const stampUnit = (n: number) => (n === 1 ? t('common.stamp') : t('common.stamps'));
  const fill = fieldFill(theme);

  const suggestions = [
    { title: t('settingsPage.suggestCoffee'), cost: stampsForReward },
    { title: t('settingsPage.suggestDiscount'), cost: Math.max(1, Math.round(stampsForReward / 2)) },
    { title: t('settingsPage.suggestFreeItem'), cost: stampsForReward },
  ];

  useEffect(() => {
    if (rewardsError) Alert.alert(t('common.error'), t('settingsPage.loadRewardsError'));
  }, [rewardsError, t]);

  const handlePickRewardImage = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.error'), t('upload.permissionDenied'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const data = await uploadRewardImage.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
      });
      setRewardImageUrl(data.url);
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('upload.uploadFailed')));
    }
  };

  const openForm = (
    rewardId: string | null,
    values: { titre?: string; cout?: string; description?: string; imageUrl?: string | null } = {},
  ) => {
    setEditingRewardId(rewardId);
    setRewardTitle(values.titre ?? '');
    setRewardCost(values.cout ?? '');
    setRewardDescription(values.description ?? '');
    setRewardImageUrl(values.imageUrl ?? null);
    setShowForm(true);
  };

  const closeForm = () => {
    setEditingRewardId(null);
    setRewardTitle(''); setRewardCost(''); setRewardDescription(''); setRewardImageUrl(null);
    setShowForm(false);
  };

  /**
   * Client balances are not rescaled when a gift cost changes: when clients
   * already hold stamps, say so and let the merchant confirm.
   */
  const confirmCostChange = async (cost: number): Promise<boolean> => {
    const original = rewards.find((r) => r.id === editingRewardId);
    if (!original || original.cout === cost) return true;
    const withStamps = await api
      .get('/merchant/loyalty-settings/preview-slots')
      .then((r) => r.data.clientsWithStamps as number)
      .catch(() => 0);
    if (!(withStamps > 0)) return true;
    return confirmAsync(
      t('settingsPage.giftCostConfirmTitle'),
      t(withStamps === 1 ? 'settingsPage.giftCostConfirmMessage_one' : 'settingsPage.giftCostConfirmMessage_other', {
        count: withStamps,
        from: original.cout,
        to: cost,
      }),
      t('common.cancel'),
      t('common.confirm'),
    );
  };

  /** Creates or updates the reward in the form (PUT sends imageUrl: null to remove the image). */
  const saveReward = async () => {
    const body = {
      titre: rewardTitle.trim(),
      cout: parseInt(rewardCost, 10),
      description: rewardDescription.trim() || undefined,
    };
    // Busy from the first tap: the cost check below is asynchronous.
    setSavingReward(true);
    try {
      if (!(await confirmCostChange(body.cout))) return;
      if (editingRewardId) {
        await api.put(`/rewards/${editingRewardId}`, { ...body, imageUrl: rewardImageUrl });
      } else {
        await api.post('/rewards', { ...body, imageUrl: rewardImageUrl || undefined });
      }
      closeForm();
      await qc.invalidateQueries({ queryKey: queryKeys.rewards });
    } catch (err: unknown) {
      const fallback = editingRewardId ? 'settingsPage.editRewardError' : 'settingsPage.saveError';
      Alert.alert(t('common.error'), getErrorMessage(err, t(fallback)));
    } finally {
      setSavingReward(false);
    }
  };

  /** Validates the form, asks to confirm a cost above the accumulation limit, then saves. */
  const handleSubmit = () => {
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
          { text: t('common.confirm'), onPress: saveReward },
        ],
      );
      return;
    }
    void saveReward();
  };

  const handleEditReward = (reward: Reward) => {
    openForm(reward.id, {
      titre: reward.titre,
      cout: reward.cout.toString(),
      description: reward.description || '',
      imageUrl: reward.imageUrl || null,
    });
  };

  // "+ Add a reward" — gated at the free-plan limit (1 reward) with an upsell (§9/§5).
  const handleOpenAddForm = () => {
    if (!isPremium && rewards.length >= 1) {
      setPremiumLockVisible(true);
      return;
    }
    openForm(null);
  };

  // One tap fills the form; the merchant still reviews it before saving.
  const handleUseSuggestion = (title: string, cost: number) => {
    openForm(null, { titre: title, cout: String(cost) });
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
            closeForm();
            await qc.invalidateQueries({ queryKey: queryKeys.rewards });
          } catch (err: unknown) {
            Alert.alert(t('common.error'), getErrorMessage(err, t('settingsPage.deleteRewardError')));
          }
        },
      },
    ]);
  };

  // The cheapest gift sizes the card the client sees.
  const mainId = cheapestReward(rewards)?.id ?? null;

  return (
    <>
      {loadingRewards ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      ) : rewards.length === 0 ? (
        <>
          <View style={[styles.giftEmpty, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
            <Text style={[styles.giftEmptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
              {t('settingsPage.noGiftsConfigured')}
            </Text>
            <Text style={[styles.hint, styles.giftEmptyText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
              {t('settingsPage.giftEmptyInfo')}
            </Text>
          </View>
          <Text style={[styles.suggestTitle, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('settingsPage.suggestionsTitle')}
          </Text>
          <View style={[styles.suggestRow, { flexDirection: row }]}>
            {suggestions.map((s) => {
              const label = t(s.cost === 1 ? 'settingsPage.suggestionLabel_one' : 'settingsPage.suggestionLabel_other', {
                title: s.title,
                count: s.cost,
              });
              return (
                <TouchableOpacity
                  key={s.title}
                  style={[styles.suggestChip, { backgroundColor: theme.bgCard, borderColor: theme.border, flexDirection: row }]}
                  onPress={() => handleUseSuggestion(s.title, s.cost)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  <Plus size={14} color={theme.text} strokeWidth={icon.strokeSmall} />
                  <Text style={[styles.suggestChipText, { color: theme.text }]} maxFontSizeMultiplier={1.2}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('settingsPage.giftsHint')}
          </Text>
          <View style={styles.rewardList}>
            {rewards.map((reward) => (
              <TouchableOpacity
                key={reward.id}
                style={[styles.rewardRow, { backgroundColor: theme.bgCard, borderColor: theme.border, flexDirection: row }]}
                onPress={() => handleEditReward(reward)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${reward.titre}, ${reward.cout} ${stampUnit(reward.cout)}`}
              >
                {reward.imageUrl ? (
                  <Image source={resolveImageUrl(reward.imageUrl)} style={styles.rewardRowThumb} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <View style={[styles.rewardRowThumb, styles.rewardRowThumbFallback, { backgroundColor: fill }]}>
                    <JitGift size={ms(20)} color={theme.textMuted} strokeWidth={icon.stroke} />
                  </View>
                )}
                <View style={styles.rewardRowInfo}>
                  <Text style={[styles.rewardRowTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                    {reward.titre}
                  </Text>
                  <Text style={[styles.rewardRowMeta, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
                    {reward.cout} {stampUnit(reward.cout)}
                  </Text>
                  {reward.id === mainId && (
                    <Text style={[styles.mainTag, { color: theme.primary, textAlign }]} maxFontSizeMultiplier={1.3}>
                      {t('settingsPage.mainGiftTag')}
                    </Text>
                  )}
                </View>
                <ChevronRight size={16} color={theme.textMuted} strokeWidth={icon.stroke} style={flip} />
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {!loadingRewards && (
        <TouchableOpacity
          onPress={handleOpenAddForm}
          activeOpacity={0.85}
          style={[styles.addGiftBtn, { backgroundColor: theme.primary }]}
          accessibilityRole="button"
          accessibilityLabel={t('settingsPage.addGiftButton')}
        >
          <Text style={styles.addGiftBtnText} maxFontSizeMultiplier={1.2}>{t('settingsPage.addGiftButton')}</Text>
        </TouchableOpacity>
      )}

      <Modal visible={showForm} transparent animationType="slide" statusBarTranslucent onRequestClose={closeForm}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeForm} accessibilityRole="button" accessibilityLabel={t('common.close')} />
          <View
            style={[styles.sheet, { backgroundColor: theme.bgCard, paddingBottom: Math.max(insets.bottom + 16, 28) }]}
            accessibilityViewIsModal
          >
            <View style={[styles.grabber, { backgroundColor: theme.border }]} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.rewardForm}>
              <Text style={[styles.formTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
                {editingRewardId ? t('settingsPage.editGiftTitle') : t('settingsPage.newGiftTitle')}
              </Text>
              <TextInput
                style={[styles.input, styles.inputBlock, { backgroundColor: fill, color: theme.text, textAlign }]}
                value={rewardTitle}
                onChangeText={setRewardTitle}
                placeholder={t('settingsPage.giftName')}
                placeholderTextColor={theme.textMuted}
                maxLength={80}
                maxFontSizeMultiplier={1.3}
                accessibilityLabel={t('settingsPage.giftName')}
              />
              <View style={[styles.inputRow, { flexDirection: row }]}>
                <TextInput
                  style={[styles.input, { backgroundColor: fill, color: theme.text, textAlign }]}
                  value={rewardCost}
                  onChangeText={setRewardCost}
                  keyboardType="numeric"
                  placeholder={t('settingsPage.giftCost')}
                  placeholderTextColor={theme.textMuted}
                  maxLength={4}
                  maxFontSizeMultiplier={1.3}
                  accessibilityLabel={t('settingsPage.giftCost')}
                />
                <Text style={[styles.inputSuffix, isRTL ? styles.inputSuffixRtl : styles.inputSuffixLtr, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                  {stampUnit(parseInt(rewardCost, 10))}
                </Text>
              </View>
              <TextInput
                style={[styles.input, styles.inputBlock, { backgroundColor: fill, color: theme.text, textAlign }]}
                value={rewardDescription}
                onChangeText={setRewardDescription}
                placeholder={t('settingsPage.giftDesc')}
                placeholderTextColor={theme.textMuted}
                maxLength={200}
                maxFontSizeMultiplier={1.3}
                accessibilityLabel={t('settingsPage.giftDesc')}
              />
              <View style={[styles.imagePickerRow, { flexDirection: row }]}>
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
                    <Image source={resolveImageUrl(rewardImageUrl)} style={styles.imagePickerImg} contentFit="cover" />
                  ) : (
                    <Camera size={ms(22)} color={theme.textMuted} strokeWidth={icon.stroke} />
                  )}
                </TouchableOpacity>
                <View style={styles.imagePickerBody}>
                  <Text style={[styles.imagePickerLabel, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
                    {t('settingsPage.rewardImageLabel')}
                  </Text>
                  <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
                    {t('settingsPage.rewardImageInfo')}
                  </Text>
                  {rewardImageUrl && (
                    <TouchableOpacity
                      onPress={() => setRewardImageUrl(null)}
                      style={[styles.imagePickerRemove, { flexDirection: row }]}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.delete')}
                    >
                      <X size={12} color={theme.danger} strokeWidth={icon.strokeSmall} />
                      <Text style={[styles.imagePickerRemoveText, { color: theme.danger }]} maxFontSizeMultiplier={1.3}>
                        {t('common.delete')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={[styles.formActions, { flexDirection: row }]}>
                <TouchableOpacity
                  style={[styles.sheetBtn, styles.sheetBtnCancel, { backgroundColor: fill }]}
                  onPress={closeForm}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={[styles.addGiftBtnText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetBtn, styles.sheetBtnMain, { backgroundColor: theme.primary }]}
                  onPress={handleSubmit}
                  disabled={savingReward}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={editingRewardId ? t('settingsPage.saveGift') : t('settingsPage.addGift')}
                  accessibilityState={{ disabled: savingReward, busy: savingReward }}
                >
                  {savingReward ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.addGiftBtnText} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                      {editingRewardId ? t('settingsPage.saveGift') : t('settingsPage.addGift')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
              {editingRewardId && (
                <TouchableOpacity
                  style={styles.deleteLink}
                  onPress={() => handleDeleteReward(editingRewardId)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('settingsPage.deleteThisGift')}
                >
                  <Text style={[styles.deleteLinkText, { color: theme.danger }]} maxFontSizeMultiplier={1.3}>
                    {t('settingsPage.deleteThisGift')}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  loading: { paddingVertical: 32, alignItems: 'center' },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: font.regular },

  suggestTitle: { fontSize: 12, fontFamily: font.regular, marginTop: 16, marginBottom: 8 },
  suggestRow: { flexWrap: 'wrap', gap: 8 },
  suggestChip: { alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  suggestChipText: { fontSize: 13, fontFamily: font.medium },

  giftEmpty: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, borderRadius: 18, borderWidth: 1, gap: 6 },
  giftEmptyTitle: { fontSize: 15, fontFamily: font.semibold },
  giftEmptyText: { textAlign: 'center' },

  addGiftBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 12, marginTop: 18 },
  addGiftBtnText: { color: '#fff', fontSize: 15, fontFamily: font.semibold },

  rewardList: { gap: 12, marginTop: 12 },
  rewardRow: { borderRadius: 18, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', gap: 14, minHeight: 76 },
  rewardRowThumb: { width: ms(52), height: ms(52), borderRadius: ms(12), overflow: 'hidden' },
  rewardRowThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  rewardRowInfo: { flex: 1, minWidth: 0, gap: 2 },
  rewardRowTitle: { fontSize: 15, fontFamily: font.semibold },
  rewardRowMeta: { fontSize: 13, fontFamily: font.regular },
  mainTag: { fontSize: 12, fontFamily: font.semibold },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,15,20,0.55)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: '88%' },
  grabber: { width: 40, height: 4, borderRadius: 999, alignSelf: 'center', marginBottom: 14 },
  rewardForm: { gap: 12 },
  formTitle: { fontSize: 18, fontFamily: font.semibold, letterSpacing: -0.3 },
  input: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: font.medium,
  },
  inputBlock: { flex: 0 },
  inputRow: { alignItems: 'center' },
  inputSuffix: { fontSize: 13, fontFamily: font.medium },
  inputSuffixLtr: { marginLeft: 12 },
  inputSuffixRtl: { marginRight: 12 },
  imagePickerRow: { alignItems: 'center', gap: 12 },
  imagePickerThumb: {
    width: ms(64),
    height: ms(64),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imagePickerImg: { width: '100%', height: '100%' },
  imagePickerBody: { flex: 1, gap: 2 },
  imagePickerLabel: { fontSize: 14, fontFamily: font.medium },
  imagePickerRemove: { alignItems: 'center', gap: 4, marginTop: 4 },
  imagePickerRemoveText: { fontSize: 12, fontFamily: font.medium },
  formActions: { gap: 10, marginTop: 4 },
  sheetBtn: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetBtnCancel: { paddingHorizontal: 20 },
  sheetBtnMain: { flex: 1, paddingHorizontal: 12 },
  deleteLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteLinkText: { fontSize: 14, fontFamily: font.semibold },
});
