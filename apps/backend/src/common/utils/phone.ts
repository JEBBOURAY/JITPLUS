import { BadRequestException } from '@nestjs/common';

/**
 * Normalize a phone number to E.164 (+<country><number>).
 * Accepts '0612345678', '+212612345678', '00212612345678', '212 612 345 678'...
 * Numbers without a '+' / '00' prefix are read as local numbers of `countryCode`
 * (only Morocco has a local rule; other countries are taken as already international).
 * Throws BadRequest when no plausible E.164 number can be produced.
 */
export function toE164Phone(raw: string, countryCode = 'MA'): string {
  const digits = (raw ?? '').replace(/[^\d+]/g, '');
  if (!digits) throw new BadRequestException('Numéro de téléphone requis');

  let e164: string;
  if (digits.startsWith('+')) {
    e164 = digits;
  } else if (digits.startsWith('00')) {
    e164 = '+' + digits.slice(2);
  } else if (countryCode === 'MA') {
    // Local Moroccan format: 06xxxxxxxx / 07xxxxxxxx -> +2126xxxxxxxx
    const local = digits.startsWith('0') ? digits.slice(1) : digits;
    e164 = local.startsWith('212') && local.length === 12 ? '+' + local : '+212' + local;
  } else {
    e164 = '+' + digits;
  }

  // Basic E.164 sanity check: 8-15 digits after the +
  if (!/^\+\d{8,15}$/.test(e164)) {
    throw new BadRequestException('Numéro de téléphone invalide');
  }
  return e164;
}

/** Same as {@link toE164Phone} but returns null instead of throwing. */
export function tryToE164Phone(raw: string, countryCode = 'MA'): string | null {
  try {
    return toE164Phone(raw, countryCode);
  } catch {
    return null;
  }
}
