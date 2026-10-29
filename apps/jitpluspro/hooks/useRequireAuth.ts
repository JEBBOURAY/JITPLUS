import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

/**
 * Auth guard hook for protected screens.
 * Redirects to /login if the user is not authenticated.
 * Call at the top of any screen that requires a logged-in merchant.
 *
 * @returns `true` while auth is loading or merchant is missing (screen should render null).
 */
export function useRequireAuth(): boolean {
  // Store selectors instead of useAuth(): profile edits must not re-render every guarded screen.
  const hasMerchant = useAuthStore((s) => !!s.merchant);
  const loading = useAuthStore((s) => s.loading);
  const router = useRouter();

  useEffect(() => {
    if (!loading && !hasMerchant) {
      router.replace('/login');
    }
  }, [loading, hasMerchant, router]);

  return loading || !hasMerchant;
}
