import { initialCampaignForm, isSlotQuiet, pickSendSlot, validateDates } from '@/components/scratch/campaignForm';

const at = (iso: string) => new Date(iso).getTime();

describe('scratch planned slots and quiet hours (Morocco time)', () => {
  it('blocks the 12:00 slot on Fridays only', () => {
    expect(isSlotQuiet('2026-10-09', '12:00')).toBe(true);
    expect(isSlotQuiet('2026-10-08', '12:00')).toBe(false);
    expect(pickSendSlot('2026-10-09', '12:00', at('2026-10-08T10:00:00Z'))).toBe('10:00');
  });

  it('rejects a planned Friday 12:00 slot', () => {
    const form = { ...initialCampaignForm('2026-10-08'), sendMode: 'later' as const, sendDay: '2026-10-09', sendSlot: '12:00' };
    expect(validateDates(form, '2026-10-08', at('2026-10-08T10:00:00Z'))).toEqual({ key: 'scratch.wizard.slotQuiet' });
  });

  it('never holds back a "send now", even at night', () => {
    const form = { ...initialCampaignForm('2026-10-08'), sendMode: 'now' as const };
    expect(validateDates(form, '2026-10-08', at('2026-10-08T20:45:00Z'))).toBeNull();
  });
});
