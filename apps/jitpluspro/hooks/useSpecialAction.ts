import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import i18n from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { logWarn } from '@/utils/devLogger';
import type { SpecialAction } from '@/utils/notificationRoutes';

const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '212755073325';

/**
 * Push / inbox actions that need context instead of a plain route:
 * - open_support: WhatsApp chat with the JitPlus team
 * - open_verify_email: verify-email screen for the signed-in merchant
 */
export function useSpecialAction() {
  const router = useRouter();
  return useCallback((action: SpecialAction) => {
    if (action === 'open_support') {
      const url = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(i18n.t('account.contactSupportMsg'))}`;
      Linking.openURL(url).catch((e) => {
        logWarn('Notifications', 'WhatsApp open failed', e);
        router.push('/account');
      });
      return;
    }
    if (action === 'open_verify_email') {
      const email = useAuthStore.getState().merchant?.email;
      if (email) router.push({ pathname: '/verify-email', params: { email } });
      else router.push('/account');
    }
  }, [router]);
}
