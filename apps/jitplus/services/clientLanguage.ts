import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';

/**
 * Saves the app language on the client's profile. The auth store (and so the
 * offline profile cache, kept in sync by AuthProvider) is patched at once and
 * rolled back if the server refuses, so a failed sync is retried next launch.
 * Rejects with the API error.
 */
export async function saveClientLanguage(language: string): Promise<void> {
  const before = useAuthStore.getState().client;
  const patched = before && before.language !== language ? before : null;
  if (patched) useAuthStore.getState().setClient({ ...patched, language });
  try {
    await api.updateProfile({ language });
  } catch (error) {
    const { client, setClient } = useAuthStore.getState();
    // Only undo our own patch: the client may have changed (logout, refetch) meanwhile.
    if (patched && client?.id === patched.id && client.language === language) {
      setClient({ ...client, language: patched.language });
    }
    throw error;
  }
}
