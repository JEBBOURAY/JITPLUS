import {
  initialPromptState,
  shouldShowPrompt,
  loadPromptState,
  markNotifPromptWin,
  recordPromptDismissed,
  MAX_DISMISSALS,
} from '@/utils/notifPrompt';
import { routeForAction, isSpecialAction } from '@/utils/notificationRoutes';

// Hoisted above the imports by babel-jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 3, 10);
const ask = { status: 'undetermined' as const, canAskAgain: true };

describe('notification pre-prompt schedule', () => {
  it('waits for a first win or one day of use', () => {
    const s = initialPromptState(T0);
    expect(shouldShowPrompt(s, ask, T0 + 60_000)).toBe(false);
    expect(shouldShowPrompt({ ...s, hadWin: true }, ask, T0 + 60_000)).toBe(true);
    expect(shouldShowPrompt(s, ask, T0 + DAY)).toBe(true);
  });

  it('re-asks after 3, 7 then 14 days, then stops', () => {
    const base = { ...initialPromptState(T0), hadWin: true };
    const after = (count: number, days: number) =>
      shouldShowPrompt({ ...base, dismissCount: count, lastDismissedAt: T0 }, ask, T0 + days * DAY);
    expect(after(1, 2.9)).toBe(false);
    expect(after(1, 3)).toBe(true);
    expect(after(2, 6)).toBe(false);
    expect(after(2, 7)).toBe(true);
    expect(after(3, 14)).toBe(true);
    expect(after(MAX_DISMISSALS, 365)).toBe(false);
  });

  it('never shows when granted or when the OS cannot ask anymore', () => {
    const s = { ...initialPromptState(T0), hadWin: true };
    expect(shouldShowPrompt(s, { status: 'granted', canAskAgain: true }, T0)).toBe(false);
    expect(shouldShowPrompt(s, { status: 'denied', canAskAgain: false }, T0)).toBe(false);
    expect(shouldShowPrompt(s, { status: 'denied', canAskAgain: true }, T0)).toBe(true);
  });

  it('persists wins and dismissals', async () => {
    await loadPromptState(T0);
    await markNotifPromptWin();
    await recordPromptDismissed(T0 + 1000);
    const s = await loadPromptState();
    expect(s.hadWin).toBe(true);
    expect(s.dismissCount).toBe(1);
    expect(s.lastDismissedAt).toBe(T0 + 1000);
  });
});

describe('push actions', () => {
  it('routes every tip / reminder action the backend sends', () => {
    for (const a of [
      'open_lucky_wheel', 'open_scratch_campaigns', 'open_stamp_codes', 'open_team', 'open_stores',
      'open_client_qr', 'open_quick_add', 'open_games', 'open_notification_settings', 'open_deals',
    ]) {
      expect(routeForAction(a)).not.toBeNull();
    }
    expect(isSpecialAction('open_support')).toBe(true);
    expect(isSpecialAction('open_verify_email')).toBe(true);
    expect(isSpecialAction('open_plan')).toBe(false);
  });
});
