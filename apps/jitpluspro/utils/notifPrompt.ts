import AsyncStorage from '@react-native-async-storage/async-storage';
import { logWarn } from '@/utils/devLogger';

/**
 * Schedule of the in-app notification pre-prompt (NotificationPermissionSheet).
 *
 * The system dialog is only shown after the merchant taps "Activer" on our
 * own sheet, so a refusal on iOS (definitive) only happens on purpose.
 * "Plus tard" re-asks after 3, then 7, then 14 days, then never again.
 */

const STORAGE_KEY = 'jitpluspro_notif_prompt';
const DAY_MS = 86_400_000;

/** Delay before asking again, indexed by the number of "Plus tard" taps. */
export const REASK_DELAYS_DAYS = [0, 3, 7, 14] as const;
/** After this many "Plus tard", stop asking (the settings banner remains). */
export const MAX_DISMISSALS = REASK_DELAYS_DAYS.length;
/** Without a first success, a merchant becomes eligible this long after first launch. */
export const ELIGIBLE_AFTER_MS = DAY_MS;

export interface NotifPromptState {
  /** First time the app evaluated the prompt (epoch ms). */
  firstSeenAt: number;
  /** A first scan / transaction succeeded: the best moment to ask. */
  hadWin: boolean;
  dismissCount: number;
  lastDismissedAt: number | null;
}

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export function initialPromptState(now: number): NotifPromptState {
  return { firstSeenAt: now, hadWin: false, dismissCount: 0, lastDismissedAt: null };
}

export function shouldShowPrompt(
  state: NotifPromptState,
  permission: { status: PermissionStatus; canAskAgain: boolean },
  now: number,
): boolean {
  if (permission.status === 'granted') return false;
  // Denied for good (iOS, or Android "don't ask again"): only the settings banner can help.
  if (!permission.canAskAgain) return false;
  if (state.dismissCount >= MAX_DISMISSALS) return false;
  if (!state.hadWin && now - state.firstSeenAt < ELIGIBLE_AFTER_MS) return false;
  if (state.dismissCount === 0 || state.lastDismissedAt === null) return true;
  return now - state.lastDismissedAt >= REASK_DELAYS_DAYS[state.dismissCount] * DAY_MS;
}

export async function loadPromptState(now: number = Date.now()): Promise<NotifPromptState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotifPromptState>;
      return { ...initialPromptState(now), ...parsed };
    }
  } catch (e) {
    logWarn('NotifPrompt', 'Failed to read state', e);
  }
  const fresh = initialPromptState(now);
  await savePromptState(fresh);
  return fresh;
}

export async function savePromptState(state: NotifPromptState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    logWarn('NotifPrompt', 'Failed to save state', e);
  }
}

/** Called after a successful scan: the next home visit may show the sheet. */
export async function markNotifPromptWin(): Promise<void> {
  const state = await loadPromptState();
  if (state.hadWin) return;
  await savePromptState({ ...state, hadWin: true });
}

export async function recordPromptDismissed(now: number = Date.now()): Promise<void> {
  const state = await loadPromptState(now);
  await savePromptState({ ...state, dismissCount: state.dismissCount + 1, lastDismissedAt: now });
}
