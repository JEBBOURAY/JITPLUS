import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { View, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/components/AppText';
import { X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getErrorStatus } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useBookingSetup, useCreateMerchantBooking } from '@/hooks/queries/booking';
import { useClientList } from '@/hooks/queries/clients';
import { getErrorMessage } from '@/utils/error';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Button, Chip, ChipRow, FieldLabel, Input, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { DayPicker } from '@/components/booking/DayPicker';
import { useBookingTz } from '@/components/booking/BookingUI';
import { useDayFreeStarts } from '@/components/booking/useDayFreeStarts';
import { StartTimePicker } from '@/components/booking/StartTimePicker';
import { parseTimeInput, wallTimeToIso, ymdIn } from '@/utils/bookingTime';
import { formatDuration, minutesToHhmm } from '@jitplus/shared/src/booking';
import type { ClientListItem } from '@/types';

type ClientMode = 'new' | 'existing';

/** A booking taken by phone or at the counter: free slots first, any other time allowed. */
export default function NewBookingScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tz = useBookingTz(!shouldWait);
  // `time` comes from a free stretch tapped in the agenda.
  const params = useLocalSearchParams<{ date?: string; time?: string }>();
  const today = ymdIn(new Date(), tz);

  const { data: setup, isLoading } = useBookingSetup(!shouldWait);
  const create = useCreateMerchantBooking();

  const services = useMemo(() => (setup?.services ?? []).filter((s) => s.isActive), [setup?.services]);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState(params.date && params.date >= today ? params.date : today);
  const [time, setTime] = useState(() => (params.time && parseTimeInput(params.time) !== null ? params.time : ''));
  const [mode, setMode] = useState<ClientMode>('new');
  const [search, setSearch] = useState('');
  const [client, setClient] = useState<ClientListItem | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId) ?? (services.length === 1 ? services[0] : undefined);

  // Free slots of the chosen day: the booking hours, minus bookings and closures.
  const { freeStarts, loading: agendaLoading, loadError: agendaError } = useDayFreeStarts({
    date,
    tz,
    needMin: service ? service.durationMin + service.bufferMin : null,
    enabled: !shouldWait,
  });

  // Search the client file once typing pauses.
  const [term, setTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);
  const searching = mode === 'existing' && term.length >= 2;
  const { query: clientQuery } = useClientList(searching ? term : '', 'all');
  const clientResults = useMemo(
    () => (searching ? clientQuery.data?.pages[0]?.clients.slice(0, 6) ?? [] : []),
    [searching, clientQuery.data],
  );

  const startMin = parseTimeInput(time);
  const endLabel = service && startMin !== null ? minutesToHhmm(Math.min(startMin + service.durationMin, 1440)) : null;

  const submit = () => {
    setError(null);
    if (!service) return setError(t('booking.new.errService'));
    if (!time.trim()) return setError(t('booking.new.errPickTime'));
    if (startMin === null || startMin >= 1440) return setError(t('booking.new.errTime'));
    if (mode === 'existing' && !client) return setError(t('booking.new.errClient'));
    if (mode === 'new' && name.trim().length < 2) return setError(t('booking.new.errName'));
    const startsAt = wallTimeToIso(date, startMin, tz);
    create.mutate(
      {
        serviceId: service.id,
        startsAt,
        ...(mode === 'existing' && client
          ? { clientId: client.id }
          : { clientName: name.trim(), ...(phone.trim() && { clientPhone: phone.trim() }) }),
        ...(note.trim() && { note: note.trim() }),
      },
      {
        onSuccess: (booking) => {
          router.replace({ pathname: '/agenda/[id]', params: { id: booking.id } });
        },
        onError: (err) => {
          const msg = getErrorMessage(err, t('booking.new.error'));
          // 409: the slot overlaps another booking (message translated by the server), shown by the form.
          if (getErrorStatus(err) === 409) setError(msg);
          else toast.error(msg);
        },
      },
    );
  };

  if (shouldWait) return null;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('booking.new.title')} onBack={() => router.back()} />
      {isLoading ? (
        <View style={styles.loader}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <Section title={t('booking.new.service')}>
            <ChipRow>
              {services.map((s) => (
                <Chip
                  key={s.id}
                  label={`${s.nom} · ${formatDuration(s.durationMin, t)}`}
                  selected={service?.id === s.id}
                  // The time is kept (e.g. tapped on a "free" row of the agenda): the
                  // picker shows it by hand when the new service has no start there.
                  onPress={() => setServiceId(s.id)}
                />
              ))}
            </ChipRow>
            {services.length === 0 && <Notice tone="warning" text={t('booking.new.noService')} />}
          </Section>

          <Section title={t('booking.new.when')}>
            <DayPicker
              label={t('booking.new.date')}
              value={date}
              today={today}
              onChange={(ymd) => {
                setDate(ymd);
                setTime('');
              }}
            />
            <StartTimePicker
              freeStarts={freeStarts}
              loading={agendaLoading}
              loadError={agendaError}
              ready={!!service}
              hint={service ? undefined : t('booking.new.pickServiceFirst')}
              time={time}
              onChange={setTime}
            />
            {endLabel ? (
              <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
                {t('booking.new.endsAt', { time: endLabel })}
              </Text>
            ) : null}
          </Section>

          <Section title={t('booking.new.client')}>
            <View style={[styles.tabBar, { flexDirection: row, backgroundColor: theme.bgElevated }]} accessibilityRole="tablist">
              {(['new', 'existing'] as const).map((key) => {
                const active = key === mode;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setMode(key)}
                    style={[styles.tab, active && { backgroundColor: theme.bgCard, borderColor: theme.border }]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.tabText, { color: active ? theme.text : theme.textMuted }]} maxFontSizeMultiplier={1.2}>
                      {t(`booking.new.clientMode.${key}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {mode === 'new' ? (
              <>
                <FieldLabel text={t('booking.new.clientName')} />
                <Input value={name} onChangeText={setName} maxLength={120} placeholder={t('booking.new.clientNamePlaceholder')} />
                <FieldLabel text={t('booking.new.clientPhone')} hint={t('booking.optional')} />
                <Input value={phone} onChangeText={setPhone} maxLength={20} keyboardType="phone-pad" placeholder="06 00 00 00 00" />
              </>
            ) : client ? (
              <View style={[styles.picked, { flexDirection: row, backgroundColor: theme.primaryBg }]}>
                <Text style={[styles.pickedText, { color: theme.text, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {[client.prenom, client.nom].filter(Boolean).join(' ')}
                </Text>
                <TouchableOpacity onPress={() => setClient(null)} accessibilityRole="button" accessibilityLabel={t('booking.new.clearClient')} hitSlop={10}>
                  <X size={18} color={theme.text} strokeWidth={icon.stroke} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Input value={search} onChangeText={setSearch} placeholder={t('booking.new.searchClient')} autoCorrect={false} />
                {clientQuery.isFetching && searching ? <ActivityIndicator color={theme.primary} /> : null}
                {clientResults.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setClient(c)}
                    style={[styles.result, { borderTopColor: theme.borderLight }]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.resultName, { color: theme.text, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                      {[c.prenom, c.nom].filter(Boolean).join(' ')}
                    </Text>
                    {c.telephone ? (
                      <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>{c.telephone}</Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
                {searching && !clientQuery.isFetching && clientResults.length === 0 ? (
                  <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>{t('booking.new.noClient')}</Text>
                ) : null}
              </>
            )}
          </Section>

          <Section title={t('booking.new.note')}>
            <Input value={note} onChangeText={setNote} maxLength={200} multiline placeholder={t('booking.new.notePlaceholder')} />
          </Section>

          {error ? <Notice tone="danger" text={error} /> : null}
          <Button label={t('booking.new.submit')} onPress={submit} loading={create.isPending} disabled={services.length === 0} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  hint: { fontSize: ms(12), fontFamily: font.regular },
  tabBar: { borderRadius: 12, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 36, borderRadius: 9, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: ms(13), fontFamily: font.semibold },
  picked: { alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  pickedText: { flex: 1, fontSize: ms(15), fontFamily: font.semibold },
  result: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 2 },
  resultName: { fontSize: ms(15), fontFamily: font.medium },
});
