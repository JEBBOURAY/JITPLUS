import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  PanResponder,
} from 'react-native';
import { Text } from '@/components/AppText';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Image } from 'expo-image';
import { JitSettings } from '@/components/icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import {
  useBookingAction,
  useBookingAgenda,
  useBookingSetup,
  usePendingBookings,
  usePrefetchAgenda,
} from '@/hooks/queries/booking';
import { getErrorMessage } from '@/utils/error';
import { font, icon } from '@/constants/design';
import { Button, Notice, ScreenHeader } from '@/components/scratch/ScratchUI';
import { GameEmptyState } from '@/components/games/GameList';
import { DemoVideoButton } from '@/components/demo/DemoVideoButton';
import { fieldFill } from '@/components/settings/surface';
import {
  BookingRow,
  capitalizeFirst,
  useBookingTz,
  useDayFormatter,
  useShortDayFormatter,
  useWeekRangeFormatter,
} from '@/components/booking/BookingUI';
import { DayCell, FillButton, FreeRow, PendingItem } from '@/components/booking/AgendaParts';
import { MS_PER_MIN, isoWeekday, minutesIn, mondayOf, wallTimeToIso, ymdIn, ymdToDate } from '@/utils/bookingTime';
import { freeGaps, type MinuteRange } from '@/components/booking/bookingForm';
import {
  addDaysToYmd,
  isActiveBooking,
  minutesToHhmm,
  type AvailabilityException,
  type MerchantBooking,
} from '@jitplus/shared/src/booking';

// Same artwork as the "Agenda" card of Accueil.
const AGENDA_IMAGE = require('@/assets/images/tools/agenda.png');

/** Closures that cover part of [dayStart, dayEnd). */
function closuresOn(exceptions: AvailabilityException[], dayStart: string, dayEnd: string) {
  return exceptions.filter((e) => e.type === 'CLOSED' && e.startsAt < dayEnd && e.endsAt > dayStart);
}

/** Bookings that still count in the figures: cancelled or missed ones do not. */
const isCounted = (b: MerchantBooking) => isActiveBooking(b.status) || b.status === 'COMPLETED';

/** Requests shown before "see all": the day itself must stay in view. */
const PENDING_PREVIEW = 2;

const validYmd = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

type DayItem =
  | { kind: 'booking'; key: string; startMin: number; booking: MerchantBooking }
  | { kind: 'free'; key: string; startMin: number; endMin: number };

export default function AgendaScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign, isRTL, flip } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const canSetup = !isTeamMember;
  const tz = useBookingTz(!shouldWait);
  const params = useLocalSearchParams<{ date?: string }>();

  const today = ymdIn(new Date(), tz);
  // The day picked here (null = today, read in shop time once the zone is known), kept only
  // under the `date` param it was picked with: back here with another date (e.g. after a
  // closure), that date opens.
  const [pick, setPick] = useState<{ ymd: string | null; under?: string }>();
  const day = pick && pick.under === params.date ? (pick.ymd ?? today) : (validYmd(params.date) ?? today);
  const setDay = useCallback((ymd: string | null) => setPick({ ymd, under: params.date }), [params.date]);

  const monday = mondayOf(day);
  const from = useMemo(() => wallTimeToIso(monday, 0, tz), [monday, tz]);
  const to = useMemo(() => wallTimeToIso(addDaysToYmd(monday, 7), 0, tz), [monday, tz]);

  const setup = useBookingSetup(!shouldWait);
  const agenda = useBookingAgenda(from, to, !shouldWait);
  const pending = usePendingBookings(!shouldWait);
  const action = useBookingAction();

  // The weeks before and after load in the background: paging shows them at once.
  const prefetch = usePrefetchAgenda();
  useEffect(() => {
    if (shouldWait || !agenda.data) return;
    for (const offset of [-7, 7]) {
      const m = addDaysToYmd(monday, offset);
      prefetch(wallTimeToIso(m, 0, tz), wallTimeToIso(addDaysToYmd(m, 7), 0, tz));
    }
  }, [shouldWait, agenda.data, monday, tz, prefetch]);

  const hasServices = (setup.data?.services.length ?? 0) > 0;
  const enabled = setup.data?.settings.enabled ?? false;
  const bookings = useMemo(() => agenda.data?.bookings ?? [], [agenda.data?.bookings]);
  const exceptions = useMemo(() => agenda.data?.exceptions ?? [], [agenda.data?.exceptions]);
  const pendingList = useMemo(() => pending.data ?? [], [pending.data]);

  const formatDay = useDayFormatter(tz);
  const byDay = useMemo(() => {
    const map = new Map<string, MerchantBooking[]>();
    for (const b of bookings) {
      const key = ymdIn(new Date(b.startsAt), tz);
      const list = map.get(key);
      if (list) list.push(b);
      else map.set(key, [b]);
    }
    return map;
  }, [bookings, tz]);

  // Time zone conversions and Intl are slow on Hermes: done once per week of data.
  const shortDay = useShortDayFormatter(tz);
  const week = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const ymd = addDaysToYmd(monday, i);
      const date = ymdToDate(ymd, tz);
      return {
        ymd,
        ...shortDay(date),
        label: capitalizeFirst(formatDay(date)),
        count: (byDay.get(ymd) ?? []).filter(isCounted).length,
        closures: closuresOn(exceptions, wallTimeToIso(ymd, 0, tz), wallTimeToIso(addDaysToYmd(ymd, 1), 0, tz)),
      };
    }),
    [monday, tz, shortDay, formatDay, byDay, exceptions],
  );
  const formatWeek = useWeekRangeFormatter(tz);
  const weekLabel = useMemo(
    () => formatWeek(ymdToDate(monday, tz), ymdToDate(addDaysToYmd(monday, 6), tz)),
    [formatWeek, monday, tz],
  );
  const selectedDay = week.find((d) => d.ymd === day);
  const dayBookings = useMemo(() => byDay.get(day) ?? [], [byDay, day]);
  const dayClosures = useMemo(() => selectedDay?.closures ?? [], [selectedDay]);

  // Booking hours of the day: the agenda's own, else the shop's opening hours.
  const setupData = setup.data;
  const dayOpen = useMemo<MinuteRange[]>(() => {
    const own = setupData?.hours ?? [];
    const ranges = own.length ? own : (setupData?.openingHours ?? []);
    const weekday = isoWeekday(day);
    return ranges.filter((h) => h.weekday === weekday);
  }, [setupData, day]);
  // Shortest active service: a gap shorter than that cannot hold a booking.
  const shortestService = useMemo(() => {
    const durations = (setupData?.services ?? []).filter((s) => s.isActive !== false).map((s) => s.durationMin);
    return durations.length ? Math.min(...durations) : 15;
  }, [setupData]);

  // Bookings taken at the same time: a stretch stays free until every seat is taken.
  const capacity = setupData?.settings.capacity ?? 1;

  // The day as a timeline: bookings in order, with the free stretches between them.
  const { timeline, inactive } = useMemo(() => {
    const origin = new Date(wallTimeToIso(day, 0, tz)).getTime();
    const minOf = (iso: string) => (new Date(iso).getTime() - origin) / MS_PER_MIN;
    const shown = dayBookings.filter(isCounted);
    const items: DayItem[] = shown.map((b) => ({ kind: 'booking', key: b.id, startMin: minOf(b.startsAt), booking: b }));
    if (day >= today && agenda.data) {
      const busy: MinuteRange[] = shown
        .filter((b) => isActiveBooking(b.status))
        .map((b) => ({ startMin: minOf(b.startsAt), endMin: minOf(b.blockedUntil) }));
      const closed: MinuteRange[] = dayClosures.map((c) => ({ startMin: minOf(c.startsAt), endMin: minOf(c.endsAt) }));
      const notBefore = day === today ? minutesIn(new Date(), tz) : 0;
      for (const g of freeGaps({ open: dayOpen, busy, closed, minMin: shortestService, notBefore, capacity })) {
        items.push({ kind: 'free', key: `free-${g.startMin}`, startMin: g.startMin, endMin: g.endMin });
      }
    }
    items.sort((a, b) => a.startMin - b.startMin);
    return { timeline: items, inactive: dayBookings.filter((b) => !isCounted(b)) };
  }, [day, today, tz, dayBookings, dayClosures, dayOpen, shortestService, capacity, agenda.data]);
  const closedDay = dayOpen.length === 0;
  const [showAllPending, setShowAllPending] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const openBooking = useCallback(
    (id: string) => router.push({ pathname: '/agenda/[id]', params: { id } }),
    [router],
  );
  const openSetup = useCallback(() => router.push('/agenda/setup'), [router]);
  const addBooking = useCallback(
    () => router.push({ pathname: '/agenda/new', params: { date: day } }),
    [router, day],
  );
  const addAt = useCallback(
    (startMin: number) => router.push({ pathname: '/agenda/new', params: { date: day, time: minutesToHhmm(startMin) } }),
    [router, day],
  );

  // A horizontal swipe on the week changes week (mirrored in Arabic).
  const weekSwipe = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 60) return;
        const forward = isRTL ? g.dx > 0 : g.dx < 0;
        setDay(addDaysToYmd(day, forward ? 7 : -7));
      },
    }),
    [isRTL, day, setDay],
  );

  const answer = useCallback(
    (b: MerchantBooking, kind: 'confirm' | 'decline') => {
      const run = () =>
        action.mutate(
          { id: b.id, action: kind },
          {
            onSuccess: () => toast.success(t(kind === 'confirm' ? 'booking.detail.accepted' : 'booking.detail.declined')),
            onError: (err) => toast.error(getErrorMessage(err, t('booking.detail.actionError'))),
          },
        );
      if (kind === 'confirm') {
        run();
        return;
      }
      Alert.alert(t('booking.detail.declineTitle'), t('booking.detail.declineMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('booking.actions.decline'), style: 'destructive', onPress: run },
      ]);
    },
    [action, t],
  );

  // Only the pull itself spins: realtime events and actions refetch in the background.
  const [refreshing, setRefreshing] = useState(false);
  const { refetch: refetchAgenda } = agenda;
  const { refetch: refetchPending } = pending;
  const { refetch: refetchSetup } = setup;
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([refetchAgenda(), refetchPending(), refetchSetup()]).finally(() => setRefreshing(false));
  }, [refetchAgenda, refetchPending, refetchSetup]);

  if (shouldWait) return null;

  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  const header = (
    <ScreenHeader
      title={t('booking.title')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
      right={<DemoVideoButton id="agenda" variant="header" />}
    />
  );

  const page = (content: React.ReactNode) => (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {header}
      {content}
    </View>
  );

  if (setup.isLoading) {
    return page(<View style={styles.loader}><ActivityIndicator color={theme.primary} /></View>);
  }

  if (setup.isError && !setup.data) {
    return page(
      <View style={styles.padded}>
        <Notice tone="danger" text={t('booking.loadError')} />
        <Button variant="secondary" label={t('common.retry')} onPress={() => setup.refetch()} />
      </View>,
    );
  }

  if (!hasServices) {
    return page(
      <ScrollView contentContainerStyle={[styles.padded, { paddingBottom: insets.bottom + 24 }]}>
        <GameEmptyState
          visual={(
            <Image source={AGENDA_IMAGE} style={styles.emptyImage} contentFit="contain" accessible={false} />
          )}
          title={t('booking.empty.title')}
          text={t('booking.empty.text')}
          steps={[t('booking.empty.how1'), t('booking.empty.how2'), t('booking.empty.how3')]}
          action={canSetup
            ? <Button icon={JitSettings} label={t('booking.empty.cta')} onPress={openSetup} style={styles.stretch} />
            : <Notice text={t('booking.ownerOnlySetup')} />}
        />
      </ScrollView>,
    );
  }

  const fill = fieldFill(theme);
  const card = { backgroundColor: theme.bgCard, borderColor: theme.border };
  const dayCount = selectedDay?.count ?? 0;

  return page(
    <>
      {/* The day and the week stay on screen, like the actions below: only the content scrolls. */}
      <View style={[styles.padded, styles.top]}>
        {/* Same summary as the loyalty card: the essential in one sentence. */}
        <View style={styles.summary}>
          <Text style={[styles.caption, { color: theme.textMuted, textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
            {selectedDay?.label}
          </Text>
          <Text style={[styles.hero, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.2} accessibilityLiveRegion="polite">
            {agenda.data
              ? dayCount > 0
                ? t(dayCount === 1 ? 'booking.dayCount_one' : 'booking.dayCount_other', { count: dayCount })
                : t('booking.noBookings')
              : ' '}
          </Text>
          {/* A compact banner: the day stays the headline. */}
          {!enabled && canSetup && (
            <TouchableOpacity
              style={[styles.banner, { flexDirection: row, backgroundColor: theme.primaryBg }]}
              onPress={openSetup}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('booking.disabledNotice')}
              accessibilityHint={t('booking.enableCta')}
            >
              <Text style={[styles.bannerText, styles.shrink, { color: theme.primary, textAlign }]} maxFontSizeMultiplier={1.3}>
                {t('booking.disabledNotice')} · {t('booking.enableCta')}
              </Text>
              <ChevronRight size={18} color={theme.primary} strokeWidth={icon.stroke} style={flip} />
            </TouchableOpacity>
          )}
          {!enabled && !canSetup && (
            <Text style={[styles.caption, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>{t('booking.disabledNotice')}</Text>
          )}
        </View>

        {/* The week at a glance: one tap opens a day, a swipe changes week. */}
        <View style={[styles.card, card]} {...weekSwipe.panHandlers}>
          <View style={[styles.cardHeader, { flexDirection: row }]}>
            <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} numberOfLines={1} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
              {weekLabel || t('booking.weekOf', { day: week[0].day })}
            </Text>
            {day !== today && (
              <TouchableOpacity onPress={() => setDay(null)} accessibilityRole="button" hitSlop={8}>
                <Text style={[styles.linkText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{t('booking.today')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setDay(addDaysToYmd(day, -7))}
              style={[styles.iconBtn, { backgroundColor: fill }]}
              accessibilityRole="button"
              accessibilityLabel={t('booking.prevWeek')}
            >
              <PrevIcon size={20} color={theme.textSecondary} strokeWidth={icon.stroke} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDay(addDaysToYmd(day, 7))}
              style={[styles.iconBtn, { backgroundColor: fill }]}
              accessibilityRole="button"
              accessibilityLabel={t('booking.nextWeek')}
            >
              <NextIcon size={20} color={theme.textSecondary} strokeWidth={icon.stroke} />
            </TouchableOpacity>
          </View>

          <View style={[styles.days, { flexDirection: row }]}>
            {week.map((d) => (
              <DayCell
                key={d.ymd}
                ymd={d.ymd}
                weekday={d.weekday}
                day={d.day}
                label={d.label}
                selected={d.ymd === day}
                isToday={d.ymd === today}
                past={d.ymd < today}
                count={d.count}
                closed={d.closures.length > 0}
                onPress={setDay}
              />
            ))}
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.primary]} tintColor={theme.primary} />}
      >
        {/* Requests waiting for an answer, before the agenda itself. */}
        {pendingList.length > 0 && (
          <View style={[styles.card, card]}>
            <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
              {t('booking.pending.title', { count: pendingList.length })}
            </Text>
            {(showAllPending ? pendingList : pendingList.slice(0, PENDING_PREVIEW)).map((b) => (
              <PendingItem
                key={b.id}
                booking={b}
                tz={tz}
                formatDay={formatDay}
                busy={action.isPending && action.variables?.id === b.id}
                locked={action.isPending}
                onOpen={openBooking}
                onAnswer={answer}
              />
            ))}
            {pendingList.length > PENDING_PREVIEW && (
              <TouchableOpacity onPress={() => setShowAllPending((v) => !v)} accessibilityRole="button" hitSlop={8} style={styles.moreLink}>
                <Text style={[styles.linkText, { color: theme.primary, textAlign }]} maxFontSizeMultiplier={1.3}>
                  {showAllPending ? t('booking.pending.showLess') : t('booking.pending.showAll', { count: pendingList.length })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {agenda.isError && <Notice tone="danger" text={t('booking.loadError')} />}
        {agenda.isLoading && <ActivityIndicator color={theme.primary} style={styles.inlineLoader} />}

        {agenda.data && (dayClosures.length + timeline.length + inactive.length > 0 || closedDay) && (
          <View style={[styles.card, card]}>
            <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
              {t('booking.detail.title')}
            </Text>
            {/* Outside the booking hours: said plainly, a booking can still be added by hand. */}
            {closedDay && dayClosures.length === 0 && <Notice text={t('booking.closedDay')} />}
            {dayClosures.map((c) => (
              <Notice key={c.id} tone="warning" text={[t('booking.closedShort'), c.reason].filter(Boolean).join(' · ')} />
            ))}
            {timeline.map((item) => (item.kind === 'booking'
              ? <BookingRow key={item.key} booking={item.booking} tz={tz} onPress={openBooking} />
              : <FreeRow key={item.key} startMin={item.startMin} endMin={item.endMin} onPress={addAt} />))}
            {inactive.length > 0 && (
              <>
                <TouchableOpacity
                  onPress={() => setShowInactive((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showInactive }}
                  hitSlop={8}
                  style={[styles.moreLink, { flexDirection: row }]}
                >
                  <Text style={[styles.inactiveTitle, styles.shrink, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
                    {t('booking.inactiveGroup', { count: inactive.length })}
                  </Text>
                  <ChevronRight size={16} color={theme.textMuted} strokeWidth={icon.stroke} style={showInactive ? styles.rotated : flip} />
                </TouchableOpacity>
                {showInactive && inactive.map((b) => <BookingRow key={b.id} booking={b} tz={tz} onPress={openBooking} />)}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.bar,
          { flexDirection: row, backgroundColor: theme.bg, paddingBottom: Math.max(insets.bottom + 12, 20) },
          theme.mode === 'dark' ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderLight } : styles.barShadow,
        ]}
      >
        {canSetup && <FillButton label={t('booking.settings')} onPress={openSetup} style={styles.barSide} />}
        <FillButton primary label={t('booking.new.title')} onPress={addBooking} style={styles.flex} />
      </View>
    </>,
  );
}

// Same values as app/loyalty-program.tsx, so both screens read as one product.
const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  stretch: { alignSelf: 'stretch' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inlineLoader: { paddingVertical: 12 },
  padded: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  top: { paddingBottom: 12 },
  content: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  emptyImage: { width: 104, height: 104 },

  summary: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 4, gap: 2 },
  caption: { fontSize: 12, lineHeight: 17, fontFamily: font.regular },
  hero: { fontSize: 22, lineHeight: 30, fontFamily: font.semibold, letterSpacing: -0.4 },
  banner: { alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, minHeight: 44 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: font.semibold },
  moreLink: { alignItems: 'center', gap: 6, minHeight: 32, justifyContent: 'center' },
  inactiveTitle: { flex: 1, fontSize: 13, fontFamily: font.medium },
  rotated: { transform: [{ rotate: '90deg' }] },

  card: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  cardHeader: { alignItems: 'center', gap: 10 },
  cardTitle: { flex: 1, fontSize: 15, fontFamily: font.semibold, letterSpacing: -0.2 },
  linkText: { fontSize: 14, fontFamily: font.semibold },
  iconBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  days: { gap: 4 },

  bar: { gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  barShadow: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 8 },
  barSide: { paddingHorizontal: 20 },
});
