import { useLanguage } from '@/contexts/LanguageContext';
import { Chip, ChipRow } from '@/components/scratch/ScratchUI';
import { DateField } from '@/components/scratch/DateField';
import { addDaysToYmd } from '@jitplus/shared/src/booking';

/** Today and tomorrow in one tap (most phone bookings), any other day in the calendar. */
export function DayPicker({ label, value, today, onChange }: {
  label: string;
  value: string;
  /** Shop-time today, also the first day allowed */
  today: string;
  onChange: (ymd: string) => void;
}) {
  const { t } = useLanguage();
  const tomorrow = addDaysToYmd(today, 1);
  return (
    <>
      <ChipRow>
        <Chip label={t('booking.today')} selected={value === today} onPress={() => onChange(today)} />
        <Chip label={t('booking.tomorrow')} selected={value === tomorrow} onPress={() => onChange(tomorrow)} />
      </ChipRow>
      <DateField label={label} value={value} minYmd={today} onChange={onChange} />
    </>
  );
}
