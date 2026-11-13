import { useCallback, useMemo, useState } from 'react';
import type { OpeningHours } from '@/types';
import { MAX_SLOTS_PER_DAY } from '@/components/stores/FicheControls';
import { haptic } from '@/components/stores/StoreUi';
import { WEEK_DAYS, finalizeHours, normalizeHours, validateHours, type WeekDayKey } from '@/components/stores/brand';

const DEFAULT_SLOT = { open: '09:00', close: '18:00' };

/** Either the i18n key of a validation error, or the hours to send (null = none set). */
type HoursPayload = { error: string } | { openingHours: OpeningHours | null };

/**
 * Editable copy of the opening hours, shared by the "Ma boutique" section and
 * the setup wizard. `toPayload` validates and normalises the draft for
 * `PATCH /merchant/profile`.
 */
export function useHoursDraft(saved: OpeningHours | null | undefined) {
  const normalized = useMemo(() => normalizeHours(saved), [saved]);
  const [hours, setHours] = useState<OpeningHours>(normalized);
  const dirty = useMemo(() => JSON.stringify(hours) !== JSON.stringify(normalized), [hours, normalized]);

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

  const toPayload = useCallback((): HoursPayload => {
    const error = validateHours(hours);
    if (error) return { error };
    const next = finalizeHours(hours);
    const anyOpen = WEEK_DAYS.some((d) => (next[d]?.slots?.length ?? 0) > 0);
    return { openingHours: anyOpen ? next : null };
  }, [hours]);

  /** Aligns the draft on freshly saved hours. */
  const reset = useCallback((next: OpeningHours | null | undefined) => setHours(normalizeHours(next)), []);

  const mondaySet = !!hours.mon?.closed || (hours.mon?.slots?.length ?? 0) > 0;

  return { hours, dirty, mondaySet, setDayClosed, addSlot, removeSlot, updateSlot, copyMondayToAll, toPayload, reset };
}
