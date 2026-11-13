import { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { Clock, Copy } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import type { Merchant } from '@/types';
import { HoursEditor } from '@/components/stores/FicheControls';
import { Panel, SaveBar, SectionScreen, useDiscardGuard, useToast, haptic } from '@/components/stores/StoreUi';
import { brandColor } from '@/components/stores/brand';
import { useHoursDraft } from '@/components/stores/useHoursDraft';

/** Opening hours, shared by every location of the brand. */
export default function HoursSection({ merchant }: { merchant: Merchant }) {
  const { t } = useLanguage();
  const dir = useDir();
  const { updateMerchant } = useAuthActions();
  const toast = useToast();
  const update = useUpdateMerchantProfile();
  const accent = brandColor(merchant.themeColor);
  const draft = useHoursDraft(merchant.openingHours);
  useDiscardGuard(draft.dirty, update.isPending);

  const showToast = toast.show;
  const { toPayload, reset } = draft;
  const save = useCallback(async () => {
    const payload = toPayload();
    if ('error' in payload) {
      Alert.alert(t('common.error'), t(payload.error));
      return;
    }
    try {
      updateMerchant(await update.mutateAsync({ openingHours: payload.openingHours }));
      reset(payload.openingHours);
      haptic();
      showToast(t('storePreview.savedToast'));
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [toPayload, reset, update, updateMerchant, showToast, t]);

  return (
    <SectionScreen
      title={t('storesHub.hoursTitle')}
      caption={t('storesHub.hoursCaption')}
      toast={toast.message}
      footer={<SaveBar dirty={draft.dirty} saving={update.isPending} onSave={save} />}
    >
      <Panel
        Icon={Clock}
        title={t('storePreview.hoursTitle')}
        caption={t('storePreview.hoursHint')}
        right={draft.mondaySet ? (
          <TouchableOpacity
            onPress={draft.copyMondayToAll}
            activeOpacity={0.8}
            style={[styles.copyBtn, { flexDirection: dir.row, backgroundColor: `${accent}14` }]}
            hitSlop={6}
            accessibilityRole="button"
          >
            <Copy size={13} color={accent} strokeWidth={icon.strokeSmall} />
            <Text style={[styles.copyText, { color: accent }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
              {t('storesHub.copyMonday')}
            </Text>
          </TouchableOpacity>
        ) : null}
      >
        <HoursEditor
          hours={draft.hours}
          accent={accent}
          onToggleClosed={draft.setDayClosed}
          onAddSlot={draft.addSlot}
          onRemoveSlot={draft.removeSlot}
          onUpdateSlot={draft.updateSlot}
        />
      </Panel>
    </SectionScreen>
  );
}

const styles = StyleSheet.create({
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, maxWidth: 170 },
  copyText: { fontSize: 12, fontFamily: font.semibold, flexShrink: 1 },
});
