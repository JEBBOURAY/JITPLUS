import { useCallback } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarClock, CircleCheck, MapPin, Navigation, Phone, QrCode, Store } from 'lucide-react-native';

import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import MerchantLogo from '@/components/MerchantLogo';
import RetryState from '@/components/RetryState';
import Skeleton from '@/components/Skeleton';
import BookingStatusBadge from '@/components/booking/BookingStatusBadge';
import { DEFAULT_BOOKING_TZ, useCancelBooking, useClientBooking } from '@/hooks/useBookingHooks';
import { formatBookingDay, isBookingNotFound } from '@/utils/booking';
import { extractErrorMessage } from '@/utils/errorMessage';
import { useAppFonts } from '@/utils/fonts';
import { haptic, hapticSuccess } from '@/utils/haptics';
import { isEntityId } from '@/utils/ids';
import { hp, ms, wp } from '@/utils/responsive';
import { DIR_FLIP } from '@/utils/rtl';
import { openDirections, openFirst } from '@jitplus/shared/src/openLinks';
import { hasCoords, pluralKey, toTel } from '@jitplus/shared';
import { formatMoney } from '@jitplus/shared/src/currency';
import { formatBookingTime, isActiveBooking, pendingExpiresAt } from '@jitplus/shared/src/booking';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

export default function BookingDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useClientBooking(isAuthenticated ? id : undefined);
  const booking = query.data;
  const cancel = useCancelBooking();

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/bookings');
  }, [router]);

  const askCancel = useCallback(() => {
    if (!booking || cancel.isPending) return;
    haptic();
    Alert.alert(t('booking.cancelTitle'), t('booking.cancelBody'), [
      { text: t('booking.cancelKeep'), style: 'cancel' },
      {
        text: t('booking.cancelConfirm'),
        style: 'destructive',
        onPress: () => {
          cancel.mutate({ id: booking.id }, {
            onSuccess: () => { hapticSuccess(); },
            onError: (err) => Alert.alert(t('common.error'), extractErrorMessage(err)),
          });
        },
      },
    ], { cancelable: true });
  }, [booking, cancel, t]);

  // Signed out (logout in progress): the root layout is already leaving for the login screen.
  if (!isAuthenticated) return null;

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
        <ArrowLeft size={ms(24)} color={theme.text} style={DIR_FLIP} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: theme.text }]} accessibilityRole="header">{t('booking.detailTitle')}</Text>
      <View style={{ width: ms(24) }} />
    </View>
  );

  if (!booking) {
    // A malformed id (bad link) never reaches the API: nothing to retry.
    const notFound = !isEntityId(id) || isBookingNotFound(query.error);
    return (
      <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top + hp(8) }]}>
        {header}
        {query.isLoading || query.isFetching ? (
          <View style={styles.body}>
            <Skeleton width={ms(64)} height={ms(64)} borderRadius={ms(18)} />
            <Skeleton width={wp(180)} height={hp(20)} borderRadius={8} />
            <Skeleton width="100%" height={hp(140)} borderRadius={16} />
          </View>
        ) : (
          <RetryState
            withIcon
            message={notFound ? t('booking.notFound') : t('booking.listError')}
            onRetry={notFound ? undefined : () => { void query.refetch(); }}
            style={[styles.body, styles.center]}
          />
        )}
      </View>
    );
  }

  const tz = booking.timeZone || DEFAULT_BOOKING_TZ;
  const m = booking.merchant;
  const address = [m.adresse, m.ville].filter(Boolean).join(', ');
  const place = hasCoords(m) ? m : null;
  const tel = toTel(m.phoneNumber);
  const active = isActiveBooking(booking.status);
  // A confirmed visit stays CONFIRMED for up to a day after it ends (the server
  // closes it later): it must not read as upcoming, with the arrival hint and
  // "cancellation no longer possible", nor hide the rebook button.
  const over = isOver(booking.endsAt);
  const upcoming = active && !over;
  const when = t('booking.dayAtTime', {
    day: formatBookingDay(booking.startsAt, tz, locale),
    time: formatBookingTime(booking.startsAt, tz),
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top + hp(8) }]}>
      {header}
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + hp(24) }]} showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={styles.merchantRow}
          onPress={() => router.push({ pathname: '/merchant/[id]', params: { id: m.id } })}
          activeOpacity={0.75}
          accessibilityRole="link"
          accessibilityLabel={m.nom}
        >
          <MerchantLogo logoUrl={m.logoUrl} merchantName={m.nom} style={styles.logo} />
          <View style={styles.merchantText}>
            <Text style={[styles.merchantName, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={2}>{m.nom}</Text>
            <BookingStatusBadge status={booking.status} />
          </View>
        </TouchableOpacity>

        {booking.status === 'PENDING' && (
          <View style={[styles.notice, { backgroundColor: `${theme.warning}14` }]}>
            <Text style={[styles.noticeText, { color: theme.textSecondary, fontFamily: fonts.medium }]}>
              {t('booking.pendingNotice')}
              {!over && ` ${t('booking.pendingUntil', {
                day: formatBookingDay(pendingExpiresAt(booking).toISOString(), tz, locale),
                time: formatBookingTime(pendingExpiresAt(booking).toISOString(), tz),
              })}`}
            </Text>
          </View>
        )}
        {booking.status === 'EXPIRED' && (
          <View style={[styles.notice, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.noticeText, { color: theme.textSecondary, fontFamily: fonts.medium }]}>{t('booking.expiredHint')}</Text>
          </View>
        )}
        {/* Declined or cancelled by the shop: the reason they gave. */}
        {!!booking.cancelReason && (booking.status === 'DECLINED' || booking.status === 'CANCELLED_MERCHANT') && (
          <View style={[styles.notice, { backgroundColor: `${theme.danger}12` }]}>
            <Text style={[styles.noticeText, { color: theme.textSecondary, fontFamily: fonts.medium }]}>
              {t('booking.merchantReason', { reason: booking.cancelReason })}
            </Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
          <Line Icon={Store} text={booking.serviceName} strong />
          <Line Icon={CalendarClock} text={when} />
          {booking.price != null && (
            <Text style={[styles.price, { color: theme.textSecondary, fontFamily: fonts.medium }]}>
              {t('booking.priceFrom', { price: formatMoney(booking.price, m.currency, locale) })}
            </Text>
          )}
          {!!booking.note && (
            <Text style={[styles.note, { color: theme.textMuted, fontFamily: fonts.regular }]}>
              {t('booking.yourNote', { note: booking.note })}
            </Text>
          )}
        </View>

        {(!!address || !!place || !!tel) && (
          <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            {!!address && <Line Icon={MapPin} text={address} />}
            <View style={styles.actions}>
              {!!place && (
                <ActionButton
                  Icon={Navigation}
                  label={t('merchant.directions')}
                  onPress={() => { haptic(); void openDirections(place.latitude, place.longitude, place.nom); }}
                />
              )}
              {!!tel && (
                <ActionButton
                  Icon={Phone}
                  label={t('merchant.call')}
                  onPress={() => { haptic(); void openFirst([tel]); }}
                />
              )}
            </View>
          </View>
        )}

        {booking.stampsEarned > 0 && (
          <View style={[styles.qrHint, { backgroundColor: `${theme.success}14` }]}>
            <CircleCheck size={ms(18)} color={theme.success} strokeWidth={2} />
            <Text style={[styles.qrHintText, { color: theme.textSecondary, fontFamily: fonts.medium }]}>
              {t(pluralKey('booking.stampsEarned', booking.stampsEarned, locale), { count: booking.stampsEarned })}
            </Text>
          </View>
        )}

        {upcoming && !booking.stampsEarned && (
          <View style={[styles.qrHint, { backgroundColor: `${palette.violet}10` }]}>
            <QrCode size={ms(18)} color={palette.violet} strokeWidth={2} />
            <Text style={[styles.qrHintText, { color: theme.textSecondary, fontFamily: fonts.medium }]}>{t('booking.qrReminder')}</Text>
          </View>
        )}

        {booking.cancellable ? (
          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: `${theme.danger}50` }]}
            onPress={askCancel}
            disabled={cancel.isPending}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ busy: cancel.isPending }}
          >
            {cancel.isPending
              ? <ActivityIndicator color={theme.danger} />
              : <Text style={[styles.cancelText, { color: theme.danger, fontFamily: fonts.semibold }]}>{t('booking.cancelCta')}</Text>}
          </TouchableOpacity>
        ) : booking.status === 'CONFIRMED' && !over ? (
          // Past the cancel deadline (a checked-in visit is simply not cancellable).
          <Text style={[styles.policy, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('booking.cancelTooLate')}</Text>
        ) : null}

        {/* Over (done, cancelled, declined, expired): the same service again in one tap. */}
        {!upcoming && (
          <TouchableOpacity
            style={[styles.rebookBtn, { backgroundColor: palette.violet }]}
            onPress={() => {
              haptic();
              router.push({ pathname: '/book/[merchantId]', params: { merchantId: booking.merchant.id, serviceId: booking.serviceId } });
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={[styles.rebookText, { fontFamily: fonts.semibold }]}>{t('booking.rebook')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

function Line({ Icon, text, strong }: { Icon: typeof Store; text: string; strong?: boolean }) {
  const theme = useTheme();
  const fonts = useAppFonts();
  return (
    <View style={styles.line}>
      <Icon size={ms(17)} color={theme.textMuted} strokeWidth={2} />
      <Text
        style={[styles.lineText, { color: theme.text, fontFamily: strong ? fonts.semibold : fonts.regular }]}
        numberOfLines={3}
      >
        {text}
      </Text>
    </View>
  );
}

function ActionButton({ Icon, label, onPress }: { Icon: typeof Store; label: string; onPress: () => void }) {
  const theme = useTheme();
  const fonts = useAppFonts();
  return (
    <TouchableOpacity
      style={[styles.actionBtn, { borderColor: theme.border, backgroundColor: theme.bg }]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={ms(16)} color={theme.text} strokeWidth={2} />
      <Text style={[styles.actionText, { color: theme.text, fontFamily: fonts.semibold }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

/** The visit's end time has passed (outside render: reads the clock). */
function isOver(endsAt: string): boolean {
  return new Date(endsAt).getTime() < Date.now();
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: wp(20) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: hp(10) },
  headerTitle: { fontSize: ms(19), fontWeight: '600' },
  body: { gap: hp(12), paddingBottom: hp(30) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: wp(14), marginTop: hp(4) },
  logo: { width: ms(60), height: ms(60), borderRadius: ms(16) },
  merchantText: { flex: 1, gap: hp(6) },
  merchantName: { fontSize: ms(20), textAlign: 'left' },
  notice: { borderRadius: 14, padding: wp(14) },
  noticeText: { fontSize: ms(13), lineHeight: ms(19), textAlign: 'left' },
  card: { borderRadius: 16, borderWidth: 1, padding: wp(16), gap: hp(10) },
  line: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  lineText: { flex: 1, fontSize: ms(15), lineHeight: ms(20), textAlign: 'left' },
  price: { fontSize: ms(13), textAlign: 'left' },
  note: { fontSize: ms(13), lineHeight: ms(19), textAlign: 'left' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(10) },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: wp(8), borderWidth: 1, borderRadius: 999, paddingHorizontal: wp(16), paddingVertical: hp(9) },
  actionText: { fontSize: ms(14) },
  qrHint: { flexDirection: 'row', alignItems: 'center', gap: wp(10), borderRadius: 14, padding: wp(14) },
  qrHintText: { flex: 1, fontSize: ms(13), lineHeight: ms(19), textAlign: 'left' },
  cancelBtn: { borderWidth: 1, borderRadius: ms(14), paddingVertical: hp(13), alignItems: 'center', marginTop: hp(6), minHeight: ms(48), justifyContent: 'center' },
  cancelText: { fontSize: ms(15) },
  rebookBtn: { borderRadius: ms(14), paddingVertical: hp(13), alignItems: 'center', marginTop: hp(6), minHeight: ms(48), justifyContent: 'center' },
  rebookText: { fontSize: ms(15), color: '#fff' },
  policy: { fontSize: ms(13), textAlign: 'center', marginTop: hp(6) },
});
