/** Email regex — matches standard email format */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate an email address */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

/** UUID v4 format */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validate that a string is a valid UUID v4 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}
