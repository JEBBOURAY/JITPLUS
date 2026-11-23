import { createQueryPersister } from '@jitplus/shared/src/createQueryPersister';

/** AsyncStorage key of the persisted React Query cache (dropped on sign-out). */
export const QUERY_CACHE_KEY = 'jitpluspro-query-cache';

export const asyncStoragePersister = createQueryPersister(QUERY_CACHE_KEY);
