import { getErrorStatus } from '@jitplus/shared';
import { api } from '@/services/api';
import type { Client } from '@/types';

/**
 * Outcome of a profile fetch, as the session code needs it:
 *  - `ok`: the profile, with an id.
 *  - `empty`: the server answered without a profile.
 *  - `unauthorized`: 401, the session is dead.
 *  - `offline`: no HTTP answer (offline, timeout, server down): worth retrying.
 *  - `failed`: any other HTTP error.
 */
export type ProfileLoad =
  | { status: 'ok'; profile: Client }
  | { status: 'empty' }
  | { status: 'unauthorized' | 'offline' | 'failed'; error: unknown };

/** Fetches the signed-in client's profile. Never throws. */
export async function loadProfile(): Promise<ProfileLoad> {
  try {
    const profile = await api.getProfile();
    return profile?.id ? { status: 'ok', profile } : { status: 'empty' };
  } catch (error: unknown) {
    const httpStatus = getErrorStatus(error);
    if (httpStatus === 401) return { status: 'unauthorized', error };
    if (httpStatus === undefined) return { status: 'offline', error };
    return { status: 'failed', error };
  }
}
