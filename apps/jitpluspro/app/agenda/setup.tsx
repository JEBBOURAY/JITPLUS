import { useCallback } from 'react';
import { toast } from '@/components/ui/Toast';
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert, RefreshControl, Share, TouchableOpacity } from 'react-native';
import { Text } from '@/components/AppText';
import { CheckCircle2, ChevronRight, Circle, Plus, Share2, Trash2 } from 'lucide-react-native';
import { getServerBaseUrl } from '@/services/api';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useMoney } from '@/hooks/useCurrency';
import { useAuthStore } from '@/stores/authStore';
import {
  useBookingSetup,
  useDeleteClosure,
  useUpdateBookingSettings,
} from '@/hooks/queries/booking';
import { getErrorMessage } from '@/utils/error';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Button, Chip, ChipRow, FieldLabel, MoreOptions, Notice, ScreenHeader, Section, useMoreOptions } from '@/components/scratch/ScratchUI';
import { OwnerOnlyNotice } from '@/components/stores/StoreUi';
import { ListLine, SwitchRow, useBookingTz, useDayFormatter } from '@/components/booking/BookingUI';
import {
  BOOKING_SLOT_STEPS,
  formatDuration,
  type BookingSettings,
} from '@jitplus/shared/src/booking';

const NOTICE_CHOICES = [0, 30, 60, 120, 240, 1440];
const ADVANCE_CHOICES = [7, 14, 30, 60, 90];
const CANCEL_CHOICES = [0, 1, 2, 12, 24, 48];
/** Seats of the calendar: up to 10 on the server. */
const CAPACITY_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10];

export default function BookingSetupScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign, flip } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const merchant = useAuthStore((s) => s.merchant);
  const tz = useBookingTz(!shouldWait && !isTeamMember);
  const formatDay = useDayFormatter(tz, true);
  const { money } = useMoney();
  const moreRules = useMoreOptions(false);

  const { data, isLoading, isError, refetch, isRefetching } = useBookingSetup(!shouldWait && !isTeamMember);
  const updateSettings = useUpdateBookingSettings();
  const deleteClosure = useDeleteClosure();

  const save = useCallback(
    (patch: Partial<BookingSettings>) => {
      updateSettings.mutate(patch, {
        onError: (err) => Alert.alert(t('booking.setup.saveErrorTitle'), getErrorMessage(err, t('booking.setup.saveError'))),
      });
    },
    [updateSettings, t],
  );

  const removeClosure = useCallback(
    (id: string) => {
      Alert.alert(t('booking.closure.deleteTitle'), t('booking.closure.deleteMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteClosure.mutate(id, {
            onError: (err) => toast.error(getErrorMessage(err, t('booking.setup.saveError'))),
          }),
        },
      ]);
    },
    [deleteClosure, t],
  );

  // The shop page of the JitPlus app, where clients book: /m/:id opens the app (or the store).
  const shareBooking = useCallback(async () => {
    if (!merchant) return;
    const url = `${getServerBaseUrl()}/m/${merchant.id}`;
    try {
      await Share.share({ message: t('booking.setup.shareMessage', { name: merchant.nom, url }), url });
    } catch {
      toast.error(t('booking.setup.shareError'));
    }
  }, [merchant, t]);

  if (shouldWait) return null;
  if (isTeamMember) return <OwnerOnlyNotice />;

  const header = <ScreenHeader title={t('booking.setup.title')} onBack={() => router.back()} />;

  if (!data) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {header}
        <View style={styles.padded}>
          {isLoading ? <ActivityIndicator color={theme.primary} /> : null}
          {isError ? (
            <>
              <Notice tone="danger" text={t('booking.loadError')} />
              <Button variant="secondary" label={t('common.retry')} onPress={() => refetch()} />
            </>
          ) : null}
        </View>
      </View>
    );
  }

  const { settings, services, hours, templates, exceptions, openingHours } = data;
  // Optimistic display while the PUT is in flight.
  const shown: BookingSettings = updateSettings.isPending && updateSettings.variables
    ? { ...settings, ...updateSettings.variables }
    : settings;

  const customHours = hours.length > 0;
  const hoursReady = customHours || openingHours.length > 0;
  const hasService = services.some((s) => s.isActive);
  const ready = hasService && hoursReady;
  const hoursStatus = !hoursReady
    ? 'statusMissing'
    : !customHours
      ? 'statusSame'
      : openingHours.length > 0 ? 'statusCustom' : 'statusSet';
  const offHint = ready ? 'booking.setup.enabledReady' : 'booking.setup.enabledOff';

  const usedTemplates = new Set(services.map((s) => s.templateId).filter(Boolean));
  const freeTemplates = templates.filter((tpl) => !usedTemplates.has(tpl.id));

  const checklist = [
    {
      done: hasService,
      label: t('booking.setup.checkService'),
      route: freeTemplates.length > 0 ? '/agenda/catalogue' as const : '/agenda/service' as const,
    },
    { done: hoursReady, label: t('booking.setup.checkHours'), route: '/agenda/hours' as const },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[theme.primary]} tintColor={theme.primary} />}
      >
        {/* 1. On / off: can only be turned on once both steps are done. */}
        <Section>
          <SwitchRow
            title={t('booking.setup.enabled')}
            hint={t(shown.enabled ? 'booking.setup.enabledOn' : offHint)}
            value={shown.enabled}
            onChange={(enabled) => save({ enabled })}
            disabled={updateSettings.isPending || (!shown.enabled && !ready)}
          />
          {!settings.enabled && !ready && (
            <View style={styles.checklist}>
              {checklist.map((c) => (
                <TouchableOpacity
                  key={c.label}
                  onPress={() => router.push(c.route)}
                  disabled={c.done}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: c.done, checked: c.done }}
                  style={[styles.checkRow, { flexDirection: row }]}
                >
                  {c.done
                    ? <CheckCircle2 size={18} color={theme.success} strokeWidth={icon.stroke} />
                    : <Circle size={18} color={theme.textMuted} strokeWidth={icon.stroke} />}
                  <Text style={[styles.checkText, { color: c.done ? theme.textSecondary : theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
                    {c.label}
                  </Text>
                  {!c.done && <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={flip} />}
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* On is not enough: clients must know they can book. */}
          {settings.enabled && (
            <>
              <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>{t('booking.setup.shareHint')}</Text>
              <Button variant="secondary" icon={Share2} label={t('booking.setup.share')} onPress={shareBooking} />
            </>
          )}
        </Section>

        {/* 2. Services */}
        <Section title={t('booking.setup.servicesTitle')}>
          <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>{t('booking.setup.servicesHint')}</Text>
          {services.map((s) => {
            const parts = [
              formatDuration(s.durationMin, t),
              s.priceFrom !== null ? money(s.priceFrom) : null,
              s.isActive ? null : t('booking.setup.inactive'),
            ].filter(Boolean);
            return (
              <ListLine
                key={s.id}
                title={s.nom}
                subtitle={parts.join(' · ')}
                dimmed={!s.isActive}
                onPress={() => router.push({ pathname: '/agenda/service', params: { id: s.id } })}
              />
            );
          })}
          <View style={styles.buttons}>
            {freeTemplates.length > 0 && (
              <Button variant="secondary" icon={Plus} label={t('booking.setup.fromCatalogue')} onPress={() => router.push('/agenda/catalogue')} />
            )}
            <Button variant="secondary" icon={Plus} label={t('booking.setup.addCustom')} onPress={() => router.push('/agenda/service')} />
          </View>
        </Section>

        {/* 3. Hours: the opening hours, unless the merchant sets others. */}
        <Section title={t('booking.setup.hoursTitle')}>
          <ListLine
            title={t(`booking.hours.${hoursStatus}`)}
            subtitle={t('booking.setup.hoursHint')}
            onPress={() => router.push('/agenda/hours')}
          />
        </Section>

        {/* 4. Booking rules: the defaults suit most merchants. */}
        <Section title={t('booking.setup.rulesTitle')}>
          <SwitchRow
            title={t('booking.setup.autoConfirm')}
            hint={t(shown.autoConfirm ? 'booking.setup.autoConfirmOn' : 'booking.setup.autoConfirmOff')}
            value={shown.autoConfirm}
            onChange={(autoConfirm) => save({ autoConfirm })}
            disabled={updateSettings.isPending}
          />
          {/* Shown, not under "more rules": it changes how many slots clients see. */}
          <FieldLabel text={t('booking.setup.capacity')} hint={t('booking.setup.capacityHint')} />
          <ChipRow>
            {CAPACITY_CHOICES.map((v) => (
              <Chip key={v} label={String(v)} selected={(shown.capacity ?? 1) === v} onPress={() => save({ capacity: v })} />
            ))}
          </ChipRow>
          <MoreOptions open={moreRules.open} onToggle={moreRules.toggle} label={t('booking.setup.rulesMore')}>
            <FieldLabel text={t('booking.setup.slotStep')} hint={t('booking.setup.slotStepHint')} />
            <ChipRow>
              {BOOKING_SLOT_STEPS.map((v) => (
                <Chip key={v} label={formatDuration(v, t)} selected={shown.slotStepMinutes === v} onPress={() => save({ slotStepMinutes: v })} />
              ))}
            </ChipRow>
            <FieldLabel text={t('booking.setup.minNotice')} hint={t('booking.setup.minNoticeHint')} />
            <ChipRow>
              {NOTICE_CHOICES.map((v) => (
                <Chip
                  key={v}
                  label={v === 0 ? t('booking.setup.none') : formatDuration(v, t)}
                  selected={shown.minNoticeMinutes === v}
                  onPress={() => save({ minNoticeMinutes: v })}
                />
              ))}
            </ChipRow>
            <FieldLabel text={t('booking.setup.maxAdvance')} hint={t('booking.setup.maxAdvanceHint')} />
            <ChipRow>
              {ADVANCE_CHOICES.map((v) => (
                <Chip key={v} label={t('booking.setup.days', { count: v })} selected={shown.maxAdvanceDays === v} onPress={() => save({ maxAdvanceDays: v })} />
              ))}
            </ChipRow>
            <FieldLabel text={t('booking.setup.cancelDeadline')} hint={t('booking.setup.cancelDeadlineHint')} />
            <ChipRow>
              {CANCEL_CHOICES.map((v) => (
                <Chip
                  key={v}
                  label={v === 0 ? t('booking.setup.anytime') : t('booking.setup.hoursBefore', { count: v })}
                  selected={shown.cancelDeadlineHours === v}
                  onPress={() => save({ cancelDeadlineHours: v })}
                />
              ))}
            </ChipRow>
          </MoreOptions>
        </Section>

        {/* 5. Closures */}
        <Section title={t('booking.closure.title')}>
          <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>{t('booking.closure.hint')}</Text>
          {exceptions.filter((e) => e.type === 'CLOSED').map((e) => {
            const start = formatDay(new Date(e.startsAt));
            // endsAt is exclusive: a closure ending at midnight ends the day before.
            const end = formatDay(new Date(new Date(e.endsAt).getTime() - 60_000));
            const range = start === end ? start : t('booking.closure.range', { start, end });
            return (
              <ListLine
                key={e.id}
                title={range}
                subtitle={e.reason ?? undefined}
                trailing={(
                  <TouchableOpacity
                    onPress={() => removeClosure(e.id)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                  >
                    <Trash2 size={18} color={theme.danger} strokeWidth={icon.stroke} />
                  </TouchableOpacity>
                )}
              />
            );
          })}
          <Button variant="secondary" icon={Plus} label={t('booking.closure.add')} onPress={() => router.push('/agenda/closure')} />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  padded: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  hint: { fontSize: ms(12), lineHeight: ms(17), fontFamily: font.regular },
  buttons: { gap: 8 },
  checklist: { gap: 4 },
  checkRow: { alignItems: 'center', gap: 8, minHeight: 32 },
  checkText: { flex: 1, fontSize: ms(13), fontFamily: font.regular },
});
