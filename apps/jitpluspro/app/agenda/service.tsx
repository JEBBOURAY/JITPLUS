import { useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useMoney } from '@/hooks/useCurrency';
import { useAuthStore } from '@/stores/authStore';
import {
  useBookingSetup,
  useCreateBookingService,
  useDeleteBookingService,
  useUpdateBookingService,
} from '@/hooks/queries/booking';
import { getErrorMessage } from '@/utils/error';
import { Button, Chip, ChipRow, FieldLabel, Input, MoreOptions, Notice, ScreenHeader, Section, useMoreOptions } from '@/components/scratch/ScratchUI';
import { OwnerOnlyNotice } from '@/components/stores/StoreUi';
import { SwitchRow } from '@/components/booking/BookingUI';
import { DURATION_PRESETS, parseDuration, parsePrice } from '@/components/booking/bookingForm';
import { formatDuration, type BookableService } from '@jitplus/shared/src/booking';

export default function BookingServiceScreen() {
  const shouldWait = useRequireAuth();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, isLoading } = useBookingSetup(!shouldWait && !isTeamMember);

  if (shouldWait) return null;
  if (isTeamMember) return <OwnerOnlyNotice />;

  const existing = id ? data?.services.find((s) => s.id === id) : undefined;
  if (isLoading || !data || (id && !existing)) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title="" onBack={() => router.back()} />
        {isLoading ? <ActivityIndicator color={theme.primary} /> : null}
      </View>
    );
  }
  // Keyed so the form restarts from the stored values when another service opens.
  return <ServiceForm key={existing?.id ?? 'new'} existing={existing} />;
}

function ServiceForm({ existing }: { existing?: BookableService }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { symbol } = useMoney();
  const create = useCreateBookingService();
  const update = useUpdateBookingService();
  const remove = useDeleteBookingService();

  const [nom, setNom] = useState(existing?.nom ?? '');
  // No default: the merchant always sets the duration.
  const [duration, setDuration] = useState(existing ? String(existing.durationMin) : '');
  const [price, setPrice] = useState(existing?.priceFrom != null ? String(existing.priceFrom) : '');
  const [buffer, setBuffer] = useState(existing ? String(existing.bufferMin) : '0');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [active, setActive] = useState(existing?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const more = useMoreOptions(!!existing && (existing.bufferMin > 0 || !!existing.description));

  const busy = create.isPending || update.isPending || remove.isPending;

  const submit = () => {
    setError(null);
    const name = nom.trim();
    const durationMin = parseDuration(duration);
    const priceFrom = parsePrice(price);
    const bufferMin = Number(buffer.trim() || '0');
    if (name.length < 2) return setError(t('booking.service.errName'));
    if (durationMin === null) return setError(t('booking.service.errDuration'));
    if (Number.isNaN(priceFrom)) return setError(t('booking.service.errPrice'));
    if (!Number.isInteger(bufferMin) || bufferMin < 0 || bufferMin > 240) return setError(t('booking.service.errBuffer'));
    const onError = (err: unknown) => setError(getErrorMessage(err, t('booking.setup.saveError')));
    const payload = {
      nom: name,
      durationMin,
      priceFrom,
      bufferMin,
      description: description.trim() || null,
    };
    if (existing) {
      update.mutate({ id: existing.id, patch: { ...payload, isActive: active } }, { onSuccess: () => router.back(), onError });
    } else {
      create.mutate({ ...payload, description: payload.description ?? undefined }, { onSuccess: () => router.back(), onError });
    }
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(t('booking.service.deleteTitle'), t('booking.service.deleteMessage', { name: existing.nom }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => remove.mutate(existing.id, {
          onSuccess: () => router.back(),
          onError: (err) => toast.error(getErrorMessage(err, t('booking.setup.saveError'))),
        }),
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader
        title={existing ? existing.nom : t('booking.service.newTitle')}
        wrap={!!existing}
        onBack={() => router.back()}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Section>
          <FieldLabel text={t('booking.service.name')} hint={existing ? undefined : t('booking.service.nameHint')} />
          <Input value={nom} onChangeText={setNom} maxLength={120} placeholder={t('booking.service.namePlaceholder')} />

          <FieldLabel text={t('booking.service.duration')} hint={t('booking.service.durationHint')} />
          <ChipRow>
            {DURATION_PRESETS.map((v) => (
              <Chip key={v} label={formatDuration(v, t)} selected={duration === String(v)} onPress={() => setDuration(String(v))} />
            ))}
          </ChipRow>
          <Input value={duration} onChangeText={setDuration} keyboardType="number-pad" maxLength={3} accessibilityLabel={t('booking.service.duration')} />

          <FieldLabel text={t('booking.service.price', { symbol })} hint={t('booking.service.priceHint')} />
          <Input value={price} onChangeText={setPrice} keyboardType="decimal-pad" maxLength={10} placeholder={t('booking.optional')} />

          <MoreOptions open={more.open} onToggle={more.toggle} label={t('booking.service.more')}>
            <FieldLabel text={t('booking.service.buffer')} hint={t('booking.service.bufferHint')} />
            <Input value={buffer} onChangeText={setBuffer} keyboardType="number-pad" maxLength={3} />
            <FieldLabel text={t('booking.service.description')} hint={t('booking.optional')} />
            <Input value={description} onChangeText={setDescription} maxLength={500} multiline />
          </MoreOptions>
        </Section>

        {existing && (
          <Section>
            <SwitchRow title={t('booking.service.active')} hint={t('booking.service.activeHint')} value={active} onChange={setActive} />
          </Section>
        )}

        {error ? <Notice tone="danger" text={error} /> : null}
        <Button label={t('common.save')} onPress={submit} loading={create.isPending || update.isPending} disabled={busy} />
        {existing && (
          <Button variant="ghost" icon={Trash2} label={t('booking.service.delete')} onPress={confirmDelete} disabled={busy} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
});
