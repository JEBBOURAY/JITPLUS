/**
 * Re-export from @jitplus/shared to avoid duplication.
 * jitpluspro uses different i18n keys — callers pass them via getPasswordStrength's optional params.
 */
export {
  isValidPassword,
  getPasswordStrength,
} from '@jitplus/shared/src/passwordStrength';

