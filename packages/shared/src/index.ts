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
export * from './zoneTime';
export * from './types';
export * from './imageUrl';
export * from './passwordStrength';
export * from './merchantFiche';
export * from './currency';
export * from './search';

// React Native specific — import directly:
//   import { createApiClient } from '@jitplus/shared/src/apiFactory'
//   import { useNetworkStatus } from '@jitplus/shared/src/useNetworkStatus'
//   import { khatamPath } from '@jitplus/shared/src/khatam'
//   import { MERCHANT_ICON_MAP } from '@jitplus/shared/src/merchantIcons'
//   import LoginBackdrop from '@jitplus/shared/src/login/LoginBackdrop'   (also ArchCrest, PressScale, FadeSlideIn, colors)
// Not re-exported here to avoid breaking non-RN consumers (admin, backend).
