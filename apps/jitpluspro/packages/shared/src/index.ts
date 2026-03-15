/**
 * @jitplus/shared — common utilities for JitPlus and JitPlus Pro mobile apps.
 *
 * Import from this package instead of duplicating logic across apps:
 *   import { COUNTRY_CODES, normalizePhone } from '@jitplus/shared';
 */

export * from './countryCodes';
export * from './validation';
export * from './error';
export * from './date';
export * from './types';

// React Native specific — import directly:
//   import { createApiClient } from '@jitplus/shared/src/apiFactory'
//   import { useNetworkStatus } from '@jitplus/shared/src/useNetworkStatus'
// Not re-exported here to avoid breaking non-RN consumers (admin, backend).
