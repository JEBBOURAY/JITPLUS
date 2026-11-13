import { useMutation } from '@tanstack/react-query';
import api from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

/**
 * PATCH /merchant/complete-onboarding. Marks the account as set up: the
 * backend then stops the "finish your setup" reminders and starts the regular
 * merchant campaigns (weekly reports, tips, re-engagement).
 */
export async function completeOnboarding(): Promise<void> {
  await api.patch('/merchant/complete-onboarding');
  useAuthStore.getState().updateMerchant({ onboardingCompleted: true });
}

export function useCompleteOnboarding() {
  return useMutation({ mutationFn: completeOnboarding });
}
