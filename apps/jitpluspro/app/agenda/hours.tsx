import { useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { JitStore } from '@/components/icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuthStore } from '@/stores/authStore';
import { useBookingSetup, useSetBookingHours } from '@/hooks/queries/booking';
import { getErrorMessage } from '@/utils/error';
import { Button, Notice, OptionCard, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { OwnerOnlyNotice } from '@/components/stores/StoreUi';
import { HoursEditor, HoursPreview, rangesOfDraft, weekDraftOf, type WeekDraft } from '@/components/booking/HoursEditor';
import type { HourRange } from '@jitplus/shared/src/booking';

/** Starting point when the shop has no opening hours: Monday to Friday, 09:00–18:00. */
const DEFAULT_WEEK: HourRange[] = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMin: 540, endMin: 1080 }));

/** Bookings follow the opening hours, unless the merchant sets different ones here. */
export default function BookingHoursScreen() {
  const shouldWait = useRequireAuth();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { data, isLoading } = useBookingSetup(!shouldWait && !isTeamMember);

  if (shouldWait) return null;
  if (isTeamMember) return <OwnerOnlyNotice />;

  if (isLoading || !data) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={t('booking.hours.title')} onBack={() => router.back()} />
        {isLoading ? <ActivityIndicator color={theme.primary} /> : null}
      </View>
    );
  }
  return <HoursForm hours={data.hours} shopHours={data.openingHours} />;
}

function HoursForm({ hours, shopHours }: { hours: HourRange[]; shopHours: HourRange[] }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setHours = useSetBookingHours();
  const hasShopHours = shopHours.length > 0;
  const [custom, setCustom] = useState(hours.length > 0 || !hasShopHours);
  const [week, setWeek] = useState<WeekDraft>(() => {
    if (hours.length) return weekDraftOf(hours);
    return weekDraftOf(hasShopHours ? shopHours : DEFAULT_WEEK);
  });
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    let ranges: HourRange[] = [];
    if (custom) {
      const parsed = rangesOfDraft(week);
      if ('error' in parsed) {
        return setError(t('booking.hours.errOnDay', { day: t(`booking.weekday.${parsed.weekday}`), error: t(parsed.error) }));
      }
      // No range at all would mean "follow the opening hours".
      if (!parsed.ranges.length) return setError(t('booking.hours.errEmpty'));
      ranges = parsed.ranges;
    }
    setHours.mutate(ranges, {
      onSuccess: () => router.back(),
      onError: (err) => setError(getErrorMessage(err, t('booking.setup.saveError'))),
    });
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('booking.hours.title')} onBack={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {hasShopHours ? (
          <>
            <OptionCard
              title={t('booking.hours.sameTitle')}
              description={t('booking.hours.sameDesc')}
              selected={!custom}
              onPress={() => setCustom(false)}
            />
            <OptionCard
              title={t('booking.hours.customTitle')}
              description={t('booking.hours.customDesc')}
              selected={custom}
              onPress={() => setCustom(true)}
            />
          </>
        ) : (
          <>
            <Notice text={t('booking.hours.noShop')} />
            <Button variant="ghost" icon={JitStore} label={t('booking.hours.editShop')} onPress={() => router.push('/stores')} />
          </>
        )}

        <Section title={t(custom ? 'booking.hours.weekTitle' : 'booking.hours.sameTitle')}>
          {custom ? <HoursEditor value={week} onChange={setWeek} /> : <HoursPreview hours={shopHours} />}
        </Section>

        {error ? <Notice tone="danger" text={error} /> : null}
        <Button label={t('common.save')} onPress={save} loading={setHours.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
});
