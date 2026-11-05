/**
 * Normalize phone number to international format and extract country code
 * Supports formats like: 0XXXXXXXX, 212XXXXXXX, +212XXXXXXXX, 06123456789, etc.
 */
export function normalizePhone(telephone: string): string {
  let phone = telephone.replace(/[\s\-()]/g, '');

  // If starts with 0 (local Moroccan format), convert to +212
  if (phone.startsWith('0')) {
    phone = '+212' + phone.substring(1);
  }
  // If starts with 212 without +, add +
  if (phone.startsWith('212') && !phone.startsWith('+')) {
    phone = '+' + phone;
  }

  // Ensure it starts with +
  if (!phone.startsWith('+')) {
    phone = '+' + phone;
  }

  return phone;
}

/**
 * Extract country code from a normalized phone number
 * E.g., +212612345678 → MA, +33612345678 → FR, +441234567890 → GB
 */
export function extractCountryCode(normalizedPhone: string): string {
  // Map of phone prefixes to country codes
  const countryMap: Record<string, string> = {
    '1': 'US', // USA/Canada (1)
    '212': 'MA', // Morocco
    '33': 'FR', // France
    '34': 'ES', // Spain
    '39': 'IT', // Italy
    '41': 'CH', // Switzerland
    '43': 'AT', // Austria
    '44': 'GB', // UK
    '45': 'DK', // Denmark
    '46': 'SE', // Sweden
    '47': 'NO', // Norway
    '49': 'DE', // Germany
    '32': 'BE', // Belgium
    '352': 'LU', // Luxembourg
    '31': 'NL', // Netherlands
    '213': 'DZ', // Algeria
    '216': 'TN', // Tunisia
    '221': 'SN', // Senegal
    '223': 'ML', // Mali
    '225': 'CI', // Ivory Coast
  };

  // Remove leading +
  const phoneWithoutPlus = normalizedPhone.slice(1);

  // Try to match longest prefix first (for multi-digit codes like 212, 213, 216, etc.)
  for (let len = 3; len >= 1; len--) {
    const prefix = phoneWithoutPlus.substring(0, len);
    if (countryMap[prefix]) {
      return countryMap[prefix];
    }
  }

  // Return UNKNOWN for unrecognized country prefixes
  return 'UNKNOWN';
}

/**
 * Validate international phone number
 */
export function isValidPhone(normalizedPhone: string): boolean {
  // Must start with + and have at least 10 digits (some countries have 7-8, but we'll be generous)
  return /^\+\d{10,15}$/.test(normalizedPhone);
}
