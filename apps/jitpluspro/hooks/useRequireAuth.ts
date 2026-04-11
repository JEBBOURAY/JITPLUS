import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Auth guard hook for protected screens.
 * Redirects to /welcome if the user is not authenticated.
 * Call at the top of any screen that requires a logged-in merchant.
 *
 * @returns `true` while auth is loading or merchant is missing (screen should render null).
 */
export function useRequireAuth(): boolean {
  const { merchant, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !merchant) {
      router.replace('/welcome');
    }
  }, [loading, merchant, router]);

  return loading || !merchant;
}
