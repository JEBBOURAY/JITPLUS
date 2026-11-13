import { useCallback, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { safeNotification } from '@/utils/haptics';
import { getErrorMessage } from '@/utils/error';
import { formatDateTime } from '@/utils/date';
import { useLanguage } from '@/contexts/LanguageContext';
import { useMessageDraft, type MessageDraft } from '@/hooks/useMessageDraft';
import { useBroadcastStatus, useCheckNotificationContent, useSendPushNotification } from '@/hooks/useQueryHooks';
import type { BroadcastStatus } from '@/types';

type Translate = (key: string, vars?: Record<string, unknown>) => string;
type ApiError = { response?: { status?: number; data?: { code?: string; message?: unknown } } };
const httpStatus = (err: unknown) => (err as ApiError)?.response?.status;

/** Pause after a send, against an accidental second broadcast. */
export const SEND_COOLDOWN_MS = 30_000;

/** What to tell the merchant when the server refuses a notification. */
function sendErrorMessage(err: unknown, t: Translate): string {
  const status = httpStatus(err);
  // Server-side content filter rejection.
  if (status === 400) return getErrorMessage(err, t('messages.contentBlockedMsg'));
  if (status === 429) {
    // The daily broadcast cap carries its own explanation; the route throttle does not.
    const data = (err as ApiError).response?.data;
    return data?.code === 'PUSH_DAILY_LIMIT' && typeof data.message === 'string' ? data.message : t('messages.rateLimited');
  }
  return getErrorMessage(err, t('common.genericError'));
}

/** Why nothing can be sent right now, or null. Known up front, so it never comes as a refusal after the last tap. */
function blockedReason(status: BroadcastStatus | undefined, t: Translate, locale: string): string | null {
  if (!status) return null;
  if (status.remaining <= 0) {
    const when = status.nextSendAt ? formatDateTime(status.nextSendAt, locale) : '';
    return t('messages.quotaReached', { limit: status.dailyLimit, when });
  }
  return status.recipientCount === 0 ? t('messages.noRecipients') : null;
}

interface RecapState {
  visible: boolean;
  error: string | null;
  /** Set once the send succeeded. Outlives `visible` so the closing animation keeps its content. */
  successMessage: string | null;
}
const CLOSED_RECAP: RecapState = { visible: false, error: null, successMessage: null };

/**
 * A notification from draft to sent: the text being written, the content check
 * that leads to the recap, the send itself and the pause that follows.
 * `enabled` is false for team members, who may not broadcast.
 */
export function useNotificationSend(accountId: string | undefined, enabled: boolean) {
  const { t, locale } = useLanguage();
  const { title, body, update: updateDraft, reset: resetDraft } = useMessageDraft(accountId);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [recap, setRecap] = useState(CLOSED_RECAP);
  // Refusal of the content filter, shown next to the fields it is about.
  const [formError, setFormError] = useState<string | null>(null);

  const { data: status } = useBroadcastStatus(enabled);
  const { mutateAsync: sendPush, isPending: isSending } = useSendPushNotification();
  const { mutateAsync: checkContent, isPending: isChecking } = useCheckNotificationContent();

  const blockedMessage = blockedReason(status, t, locale);
  const audience = status
    ? t(status.recipientCount === 1 ? 'messages.audienceCount_one' : 'messages.audienceCount_other', { count: status.recipientCount })
    : t('messages.audiencePush');

  /** Changes the text; any earlier refusal no longer applies to it. */
  const edit = useCallback((patch: Partial<MessageDraft>) => {
    updateDraft(patch);
    setFormError(null);
  }, [updateDraft]);
  const clear = useCallback(() => {
    resetDraft();
    setFormError(null);
  }, [resetDraft]);

  /** Runs the content filter, then opens the recap: a refusal shows while the text is still on screen. */
  const review = useCallback(async () => {
    try {
      await checkContent({ title: title.trim(), body: body.trim() });
    } catch (err: unknown) {
      if (httpStatus(err) === 400) {
        safeNotification(Haptics.NotificationFeedbackType.Error);
        setFormError(sendErrorMessage(err, t));
        return;
      }
      // Any other failure (offline, older server): the send itself checks again.
    }
    setRecap({ visible: true, error: null, successMessage: null });
  }, [checkContent, title, body, t]);

  // A ref, not `isSending`: a second tap can land before the button re-renders as disabled.
  const sendingRef = useRef(false);
  const confirm = useCallback(async () => {
    if (sendingRef.current || recap.successMessage != null) return;
    sendingRef.current = true;
    try {
      const { recipientCount } = await sendPush({ title: title.trim(), body: body.trim() });
      const successMessage = t(recipientCount === 1 ? 'messages.pushSuccessBody_one' : 'messages.pushSuccessBody_other', { count: recipientCount });
      resetDraft();
      setCooldownUntil(Date.now() + SEND_COOLDOWN_MS);
      safeNotification(Haptics.NotificationFeedbackType.Success);
      setRecap((s) => ({ ...s, error: null, successMessage }));
    } catch (err: unknown) {
      // The recap stays open so the merchant can read why, then go back and edit.
      safeNotification(Haptics.NotificationFeedbackType.Error);
      setRecap((s) => ({ ...s, error: sendErrorMessage(err, t) }));
    } finally {
      sendingRef.current = false;
    }
  }, [recap.successMessage, sendPush, title, body, resetDraft, t]);

  const closeRecap = useCallback(() => setRecap((s) => ({ ...s, visible: false })), []);

  return {
    title,
    body,
    hasContent: title.length > 0 || body.length > 0,
    isComplete: !!title.trim() && !!body.trim(),
    edit,
    clear,
    formError,
    status,
    blockedMessage,
    audience,
    cooldownUntil,
    isChecking,
    isSending,
    recap,
    review,
    confirm,
    closeRecap,
  };
}
