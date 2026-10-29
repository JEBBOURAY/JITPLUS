import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { Clock, Copy } from 'lucide-react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { useAuthActions } from '@/contexts/AuthContext';
import { useUpdateMerchantProfile } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import type { Merchant, OpeningHours } from '@/types';
import { HoursEditor, MAX_SLOTS_PER_DAY } from '@/components/stores/FicheControls';
import { Panel, SaveBar, SectionScreen, useDiscardGuard, useToast, haptic } from '@/components/stores/StoreUi';
import { WEEK_DAYS, brandColor, finalizeHours, normalizeHours, validateHours, type WeekDayKey } from '@/components/stores/brand';

const DEFAULT_SLOT = { open: '09:00', close: '18:00' };

/** Opening hours, shared by every location of the brand. */
export default function HoursSection({ merchant }: { merchant: Merchant }) {
  const { t } = useLanguage();
  const dir = useDir();
  const { updateMerchant } = useAuthActions();
  const toast = useToast();
  const update = useUpdateMerchantProfile();
  const accent = brandColor(merchant.themeColor);

  const saved = useMemo(() => normalizeHours(merchant.openingHours), [merchant.openingHours]);
  const [hours, setHours] = useState<OpeningHours>(saved);
  const dirty = useMemo(() => JSON.stringify(hours) !== JSON.stringify(saved), [hours, saved]);
  useDiscardGuard(dirty, update.isPending);

  const setDayClosed = useCallback((day: WeekDayKey, closed: boolean) => {
    haptic();
    setHours((prev) => {
      const slots = prev[day]?.slots ?? [];
      // Opening a day without hours would still read "Fermé" on the page.
      return { ...prev, [day]: { closed, slots: closed ? [] : slots.length ? slots : [{ ...DEFAULT_SLOT }] } };
    });
  }, []);

  const addSlot = useCallback((day: WeekDayKey) => {
    haptic();
    setHours((prev) => {
      const slots = prev[day]?.slots ?? [];
      if (slots.length >= MAX_SLOTS_PER_DAY) return prev;
      return { ...prev, [day]: { closed: false, slots: [...slots, { ...DEFAULT_SLOT }] } };
    });
  }, []);

  const removeSlot = useCallback((day: WeekDayKey, idx: number) => {
    haptic();
    setHours((prev) => ({
      ...prev,
      [day]: { closed: prev[day]?.closed ?? false, slots: (prev[day]?.slots ?? []).filter((_, i) => i !== idx) },
    }));
  }, []);

  const updateSlot = useCallback((day: WeekDayKey, idx: number, field: 'open' | 'close', value: string) => {
    setHours((prev) => ({
      ...prev,
      [day]: {
        closed: prev[day]?.closed ?? false,
        slots: (prev[day]?.slots ?? []).map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
      },
    }));
  }, []);

  const copyMondayToAll = useCallback(() => {
    haptic();
    setHours((prev) => {
      const monday = prev.mon ?? { closed: false, slots: [] };
      const next = { ...prev };
      for (const d of WEEK_DAYS) next[d] = { closed: !!monday.closed, slots: (monday.slots ?? []).map((s) => ({ ...s })) };
      return next;
    });
  }, []);

  const showToast = toast.show;
  const save = useCallback(async () => {
    const error = validateHours(hours);
    if (error) {
      Alert.alert(t('common.error'), t(error));
      return;
    }
    try {
      const next = finalizeHours(hours);
      const anyOpen = WEEK_DAYS.some((d) => (next[d]?.slots?.length ?? 0) > 0);
      const openingHours = anyOpen ? next : null;
      updateMerchant(await update.mutateAsync({ openingHours }));
      setHours(normalizeHours(openingHours));
      haptic();
      showToast(t('storePreview.savedToast'));
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err));
    }
  }, [hours, update, updateMerchant, showToast, t]);

  const mondaySet = !!hours.mon?.closed || (hours.mon?.slots?.length ?? 0) > 0;

  return (
    <SectionScreen
      title={t('storesHub.hoursTitle')}
      caption={t('storesHub.hoursCaption')}
      toast={toast.message}
      footer={<SaveBar dirty={dirty} saving={update.isPending} onSave={save} />}
    >
      <Panel
        Icon={Clock}
        title={t('storePreview.hoursTitle')}
        caption={t('storePreview.hoursHint')}
        right={mondaySet ? (
          <TouchableOpacity
            onPress={copyMondayToAll}
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
          hours={hours}
          accent={accent}
          onToggleClosed={setDayClosed}
          onAddSlot={addSlot}
          onRemoveSlot={removeSlot}
          onUpdateSlot={updateSlot}
        />
      </Panel>
    </SectionScreen>
  );
}

const styles = StyleSheet.create({
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, maxWidth: 170 },
  copyText: { fontSize: 12, fontFamily: font.semibold, flexShrink: 1 },
});
