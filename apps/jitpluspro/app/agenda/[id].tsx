import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking, TouchableOpacity, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { Text } from '@/components/AppText';
import { CalendarClock, Check, CircleCheck, MessageCircle, ScanLine, UserRound, X, type LucideIcon } from 'lucide-react-native';
import { COUNTRY_CODES, normalizePhone } from '@jitplus/shared';
import { JitPhone, JitStamp } from '@/components/icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { useMoney } from '@/hooks/useCurrency';
import { useBooking, useBookingAction } from '@/hooks/queries/booking';
import { getErrorMessage } from '@/utils/error';
import { hapticError, hapticSuccess } from '@/utils/haptics';
import { MS_PER_MIN } from '@/utils/bookingTime';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Button, FieldLabel, Input, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { BookingStatusPill, capitalizeFirst, useBookingTz, useDayFormatter } from '@/components/booking/BookingUI';
import {
  bookingAwaitsStamps,
  bookingClientLabel,
  formatBookingTime,
  formatDuration,
  type MerchantBookingAction,
} from '@jitplus/shared/src/booking';

/** Cancel and decline share one panel: a reason, sent to the client. */
const REASON_COPY = {
  cancel: { title: 'booking.detail.cancelTitle', placeholder: 'booking.detail.cancelReasonPlaceholder', submit: 'booking.actions.cancel' },
  decline: { title: 'booking.detail.declineTitle', placeholder: 'booking.detail.declineReasonPlaceholder', submit: 'booking.actions.decline' },
} as const;

export default function BookingDetailScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tz = useBookingTz(!shouldWait);
  const { money } = useMoney();
  const formatDay = useDayFormatter(tz, true);
  const { id } = useLocalSearchParams<{ id: string }>();
  const countryCode = useAuthStore((s) => s.merchant?.countryCode);
  const { data: booking, isLoading, isError, refetch } = useBooking(shouldWait ? undefined : id);
  const action = useBookingAction();
  // Whether the booking has started (or is about to) decides the actions
  // offered. Refreshed while the screen stays open: read once, "client absent"
  // never appeared on a screen opened two minutes before the start.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setOpenedAt(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const [reasonFor, setReasonFor] = useState<keyof typeof REASON_COPY | null>(null);
  const [reason, setReason] = useState('');
  // The reason form is the last block: keep it and its buttons above the keyboard.
  // Android draws edge-to-edge, so the window does not shrink: room is added under the content.
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardRoom, setKeyboardRoom] = useState(0);
  useEffect(() => {
    if (!reasonFor) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      if (Platform.OS === 'android') setKeyboardRoom(e.endCoordinates.height);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardRoom(0));
    return () => {
      show.remove();
      hide.remove();
      setKeyboardRoom(0);
    };
  }, [reasonFor]);

  const run = useCallback(
    (kind: MerchantBookingAction, withReason?: string) => {
      if (!booking) return;
      action.mutate(
        { id: booking.id, action: kind, reason: withReason?.trim() || undefined },
        {
          onSuccess: () => {
            hapticSuccess();
            setReasonFor(null);
            setReason('');
          },
          onError: (err) => {
            hapticError();
            toast.error(getErrorMessage(err, t('booking.detail.actionError')));
          },
        },
      );
    },
    [action, booking, t],
  );

  const confirmThen = useCallback(
    (title: string, message: string, label: string, kind: MerchantBookingAction) => {
      Alert.alert(title, message, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: label, style: 'destructive', onPress: () => run(kind) },
      ]);
    },
    [run, t],
  );

  if (shouldWait) return null;

  const header = <ScreenHeader title={t('booking.detail.title')} onBack={() => router.back()} />;

  if (!booking) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {header}
        <View style={styles.padded}>
          {isLoading ? <ActivityIndicator color={theme.primary} /> : null}
          {isError ? (
            <>
              <Notice tone="danger" text={t('booking.detail.loadError')} />
              <Button variant="secondary" label={t('common.retry')} onPress={() => refetch()} />
            </>
          ) : null}
        </View>
      </View>
    );
  }

  const busy = action.isPending;
  const busyFor = (kind: MerchantBookingAction) => busy && action.variables?.action === kind;
  const start = new Date(booking.startsAt);
  const started = start.getTime() <= openedAt;
  const durationMin = Math.round((new Date(booking.endsAt).getTime() - start.getTime()) / MS_PER_MIN);
  const { client } = booking;
  // A member's visit without stamps yet: the till opens on this client, no scan
  // needed, with the price of the service as the amount.
  const awaitsStamps = bookingAwaitsStamps(booking, openedAt);
  // A JitPlus client without a card here joins by their QR code, which also gives the stamps.
  const needsScan = !!client && !client.member;
  const giveStamps = (thenComplete = false) => {
    if (!client) return;
    router.push({
      pathname: '/transaction-amount',
      params: {
        clientId: client.id,
        bookingId: booking.id,
        ...(booking.price !== null && { amount: String(booking.price) }),
        ...(thenComplete && { completeBooking: '1' }),
      },
    });
  };
  const complete = () => {
    // Closing a visit is where stamps get forgotten: offer them first.
    if (awaitsStamps) {
      Alert.alert(t('booking.detail.stampsFirstTitle'), t('booking.detail.stampsFirstMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('booking.detail.completeWithoutStamps'), onPress: () => run('complete') },
        { text: t('booking.actions.giveStamps'), onPress: () => giveStamps(true) },
      ]);
    } else if (started) {
      run('complete');
    } else {
      // "Terminer" cannot be undone and frees the slot: one stray tap on a visit
      // that has not started yet must not do it.
      Alert.alert(t('booking.detail.completeEarlyTitle'), t('booking.detail.completeEarlyMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('booking.actions.complete'), onPress: () => run('complete') },
      ]);
    }
  };
  const stampsButton = (
    <Button icon={JitStamp} label={t('booking.actions.giveStamps')} onPress={() => giveStamps()} disabled={busy} />
  );
  const phone = client?.telephone ?? booking.clientPhone;
  // WhatsApp needs the international number: a local "06…" typed at the counter gets the shop's dial code.
  const dial = COUNTRY_CODES.find((c) => c.code === countryCode)?.dial ?? '+212';
  const waDigits = phone ? normalizePhone(phone, dial).replace(/\D/g, '') : '';
  const openWhatsApp = () => {
    Linking.openURL(`https://wa.me/${waDigits}`).catch(() => toast.error(t('booking.detail.whatsappError')));
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 + keyboardRoom }]}
      >
        <Section>
          <View style={{ flexDirection: row }}>
            <BookingStatusPill status={booking.status} />
          </View>
          {/* When, first: it is what the merchant looks for. */}
          <Text style={[styles.when, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
            {capitalizeFirst(formatDay(start))}
          </Text>
          <Text style={[styles.time, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
            {`${formatBookingTime(booking.startsAt, tz)} – ${formatBookingTime(booking.endsAt, tz)}`}
            <Text style={{ color: theme.textMuted }}>{`  ·  ${formatDuration(durationMin, t)}`}</Text>
          </Text>
          <Text style={[styles.service, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.3}>
            {booking.serviceName}{booking.price !== null ? ` · ${money(booking.price)}` : ''}
          </Text>
        </Section>

        <Section>
          <Text style={[styles.client, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
            {bookingClientLabel(booking)}
          </Text>
          {phone ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {})}
              style={[styles.phoneRow, { flexDirection: row }]}
              accessibilityRole="link"
              accessibilityLabel={t('booking.detail.call', { phone })}
            >
              <JitPhone size={icon.sm} color={theme.primary} strokeWidth={icon.stroke} />
              <Text style={[styles.phone, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{phone}</Text>
            </TouchableOpacity>
          ) : null}
          {(waDigits.length >= 8 || client) && (
            <View style={[styles.contactRow, { flexDirection: row }]}>
              {waDigits.length >= 8 && (
                <ContactButton icon={MessageCircle} label={t('booking.detail.whatsapp')} onPress={openWhatsApp} />
              )}
              {client && (
                <ContactButton
                  icon={UserRound}
                  label={t('booking.detail.clientFile')}
                  onPress={() => router.push({ pathname: '/client-detail', params: { id: client.id } })}
                />
              )}
            </View>
          )}
          <Text style={[styles.source, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
            {t(booking.source === 'APP' ? 'booking.detail.sourceApp' : 'booking.detail.sourceMerchant')}
          </Text>
          {booking.stampsGiven && (
            <View style={[styles.phoneRow, { flexDirection: row }]}>
              <CircleCheck size={icon.sm} color={theme.success} strokeWidth={icon.stroke} />
              <Text style={[styles.stampsGiven, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{t('booking.detail.stampsGiven')}</Text>
            </View>
          )}
          {booking.note ? <InfoLine label={t('booking.detail.note')} value={booking.note} /> : null}
          {booking.cancelReason ? <InfoLine label={t('booking.detail.cancelReason')} value={booking.cancelReason} /> : null}
        </Section>

        {/* Actions allowed in the current status (mirrors TRANSITIONS in booking-merchant.service.ts). */}
        {booking.status === 'PENDING' && reasonFor !== 'decline' && (
          <View style={[styles.actionsRow, { flexDirection: row }]}>
            <Button
              variant="secondary"
              icon={X}
              label={t('booking.actions.decline')}
              onPress={() => setReasonFor('decline')}
              disabled={busy}
              style={styles.flex}
            />
            <Button
              icon={Check}
              label={t('booking.actions.confirm')}
              onPress={() => run('confirm')}
              loading={busyFor('confirm')}
              disabled={busy || started}
              style={styles.flex}
            />
          </View>
        )}
        {booking.status === 'PENDING' && started && <Notice tone="warning" text={t('booking.detail.pendingPast')} />}

        {booking.status === 'CONFIRMED' && (
          <View style={styles.actions}>
            {/* On arrival, stamps and check-in in one step: from here for a member, by their QR code for a client without a card yet. */}
            {awaitsStamps ? (
              <>
                {stampsButton}
                <Hint text={t('booking.detail.giveStampsHint')} />
              </>
            ) : needsScan ? (
              <>
                <Button icon={ScanLine} label={t('booking.actions.scan')} onPress={() => router.push('/scan-qr')} disabled={busy} />
                <Hint text={t('booking.detail.scanHint')} />
              </>
            ) : null}
            <Button
              variant={awaitsStamps || needsScan ? 'secondary' : 'primary'}
              label={t('booking.actions.checkIn')}
              onPress={() => run('check-in')}
              loading={busyFor('check-in')}
              disabled={busy}
            />
            <Button variant="secondary" label={t('booking.actions.complete')} onPress={complete} loading={busyFor('complete')} disabled={busy} />
            {started && (
              <Button
                variant="secondary"
                label={t('booking.actions.noShow')}
                onPress={() => confirmThen(t('booking.detail.noShowTitle'), t('booking.detail.noShowMessage'), t('booking.actions.noShow'), 'no-show')}
                loading={busyFor('no-show')}
                disabled={busy}
              />
            )}
          </View>
        )}

        {booking.status === 'CHECKED_IN' && (
          <View style={styles.actions}>
            {awaitsStamps && stampsButton}
            <Button variant={awaitsStamps ? 'secondary' : 'primary'} label={t('booking.actions.complete')} onPress={complete} loading={busyFor('complete')} disabled={busy} />
          </View>
        )}

        {/* Closed without stamps (by hand or at the end of the day): they can still be given. */}
        {booking.status === 'COMPLETED' && awaitsStamps && (
          <View style={styles.actions}>
            {stampsButton}
            <Hint text={t('booking.detail.noStampsYet')} />
          </View>
        )}

        {/* Moving keeps the client: no cancel-and-retype, one "moved" notice for them. */}
        {(booking.status === 'PENDING' || booking.status === 'CONFIRMED') && !started && reasonFor === null && (
          <Button
            variant="secondary"
            icon={CalendarClock}
            label={t('booking.actions.move')}
            onPress={() => router.push({ pathname: '/agenda/move', params: { id: booking.id } })}
            disabled={busy}
          />
        )}

        {reasonFor && (booking.status === 'PENDING' || booking.status === 'CONFIRMED') ? (
          <Section title={t(REASON_COPY[reasonFor].title)}>
            <FieldLabel text={t('booking.detail.cancelReasonLabel')} hint={t('booking.detail.cancelReasonHint')} />
            <Input value={reason} onChangeText={setReason} maxLength={200} placeholder={t(REASON_COPY[reasonFor].placeholder)} />
            <View style={[styles.actionsRow, { flexDirection: row }]}>
              <Button variant="secondary" label={t('common.back')} onPress={() => setReasonFor(null)} disabled={busy} style={styles.flex} />
              <Button
                variant="danger"
                label={t(REASON_COPY[reasonFor].submit)}
                onPress={() => run(reasonFor, reason)}
                loading={busyFor(reasonFor)}
                disabled={busy}
                style={styles.flex}
              />
            </View>
          </Section>
        ) : booking.status === 'CONFIRMED' && (
          // A pending request is answered by "Refuser" above.
          <Button variant="ghost" label={t('booking.actions.cancel')} onPress={() => setReasonFor('cancel')} disabled={busy} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A small pill action under the client's name (WhatsApp, client file). */
function ContactButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const theme = useTheme();
  const { row } = useDir();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.contactBtn, { flexDirection: row, backgroundColor: theme.bgElevated }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={icon.sm} color={theme.text} strokeWidth={icon.stroke} />
      <Text style={[styles.contactText, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>
    </TouchableOpacity>
  );
}

function Hint({ text }: { text: string }) {
  const theme = useTheme();
  const { textAlign } = useDir();
  return <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>{text}</Text>;
}

function InfoLine({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const { textAlign } = useDir();
  return (
    <View style={styles.info}>
      <Text style={[styles.infoLabel, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  padded: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  when: { fontSize: ms(20), fontFamily: font.semibold, letterSpacing: -0.3 },
  time: { fontSize: ms(17), fontFamily: font.semibold },
  service: { fontSize: ms(14), fontFamily: font.regular },
  hint: { fontSize: ms(12), lineHeight: ms(17), fontFamily: font.regular },
  client: { fontSize: ms(17), fontFamily: font.semibold, letterSpacing: -0.2 },
  phoneRow: { alignItems: 'center', gap: 6 },
  phone: { fontSize: ms(15), fontFamily: font.medium },
  stampsGiven: { fontSize: ms(14), fontFamily: font.medium },
  contactRow: { gap: 8, flexWrap: 'wrap' },
  contactBtn: { alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 12 },
  contactText: { fontSize: ms(14), fontFamily: font.semibold },
  source: { fontSize: ms(12), fontFamily: font.regular },
  info: { gap: 2 },
  infoLabel: { fontSize: ms(12), fontFamily: font.regular },
  infoValue: { fontSize: ms(15), fontFamily: font.medium, textTransform: 'none' },
  actions: { gap: 10 },
  actionsRow: { gap: 10 },
});
