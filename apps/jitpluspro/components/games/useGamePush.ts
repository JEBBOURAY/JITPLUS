import { useCallback } from 'react';
import { toast } from '@/components/ui/Toast';
import { Alert } from 'react-native';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSendPushNotification } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';

export interface GamePushMessage {
  title: string;
  body: string;
}

/**
 * Announcing a game to the merchant's clients, always with the merchant's
 * agreement: the notification is shown as clients will get it and only sent
 * on confirmation. The generic texts live in the lucky-wheel namespace, where
 * this flow was first written.
 */
export function useGamePush() {
  const { t } = useLanguage();
  const push = useSendPushNotification();
  const { mutateAsync } = push;

  /** Preview, then send on confirmation. `onDone` runs whatever the merchant chooses. */
  const prompt = useCallback(({ title, body }: GamePushMessage, onDone?: () => void) => {
    Alert.alert(t('luckyWheel.push.previewTitle'), `${title}\n\n${body}`, [
      { text: t('common.cancel'), style: 'cancel', onPress: onDone },
      {
        text: t('luckyWheel.push.send'),
        onPress: async () => {
          try {
            const result = await mutateAsync({ title, body });
            toast.success(
              t(result.successCount === 1 ? 'luckyWheel.push.success_one' : 'luckyWheel.push.success_other', { count: result.successCount }),
            );
          } catch (e) {
            Alert.alert(t('common.error'), getErrorMessage(e, t('luckyWheel.push.error')));
          } finally {
            onDone?.();
          }
        },
      },
    ], { cancelable: true, onDismiss: onDone });
  }, [mutateAsync, t]);

  /** Right after a launch: "notify your customers?" — nothing is sent unless the merchant says so. */
  const offer = useCallback((launchedTitle: string, message: GamePushMessage, onDone?: () => void) => {
    Alert.alert(launchedTitle, t('luckyWheel.wizard.launchedBody'), [
      { text: t('luckyWheel.wizard.later'), style: 'cancel', onPress: onDone },
      { text: t('luckyWheel.wizard.notifyNow'), onPress: () => prompt(message, onDone) },
    ], { cancelable: false });
  }, [prompt, t]);

  return { prompt, offer, isPending: push.isPending };
}
