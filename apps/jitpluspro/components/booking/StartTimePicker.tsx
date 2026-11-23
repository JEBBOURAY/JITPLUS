import { ActivityIndicator } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Chip, ChipRow, FieldLabel, Input, MoreOptions, Notice, useMoreOptions } from '@/components/scratch/ScratchUI';
import { parseTimeInput, TIME_KEYBOARD } from '@/utils/bookingTime';
import { minutesToHhmm } from '@jitplus/shared/src/booking';

/**
 * Start time of a booking taken or moved by the merchant: the free starts of
 * the day first, any other time typed by hand ("HH:MM", opened by itself when
 * the day has no free start).
 */
export function StartTimePicker({ freeStarts, loading, loadError, ready, hint, time, onChange }: {
  freeStarts: number[];
  loading: boolean;
  /** The day could not be loaded: say so instead of "no free slot". */
  loadError?: boolean;
  /** False until the free starts can be computed (e.g. no service chosen yet) */
  ready: boolean;
  hint?: string;
  time: string;
  onChange: (time: string) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const startMin = parseTimeInput(time);
  const noFreeSlot = ready && !loading && !loadError && freeStarts.length === 0;
  // A time that is not one of the chips (kept from another service, or off the
  // grid) must stay visible: open the manual field.
  const offGrid = ready && !loading && startMin != null && !freeStarts.includes(startMin);
  const otherTime = useMoreOptions(noFreeSlot || !!loadError || offGrid);
  return (
    <>
      <FieldLabel text={t('booking.new.freeSlots')} hint={hint} />
      {loading && ready ? <ActivityIndicator color={theme.primary} /> : null}
      {/* Every free start visible at once (a horizontal strip hid most of the day). */}
      {freeStarts.length > 0 && (
        <ChipRow>
          {freeStarts.map((m) => (
            <Chip key={m} label={minutesToHhmm(m)} selected={startMin === m} onPress={() => onChange(minutesToHhmm(m))} />
          ))}
        </ChipRow>
      )}
      {noFreeSlot && <Notice text={t('booking.new.noSlots')} />}
      {!!loadError && ready && !loading && <Notice text={t('booking.new.slotsError')} />}
      <MoreOptions open={otherTime.open} onToggle={otherTime.toggle} label={t('booking.new.otherTime')}>
        <FieldLabel text={t('booking.new.time')} hint={t('booking.new.timeHint')} />
        <Input value={time} onChangeText={onChange} placeholder="09:30" keyboardType={TIME_KEYBOARD} maxLength={5} />
      </MoreOptions>
    </>
  );
}
