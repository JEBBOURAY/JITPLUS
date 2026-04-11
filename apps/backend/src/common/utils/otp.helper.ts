import { BadRequestException, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { MAX_OTP_ATTEMPTS, MAX_OTP_SENDS_PER_DAY } from '../constants';

/**
 * In-memory daily OTP send counter shared across services.
 * Key = identifier (email or phone), value = { count, resetAt }.
 */
const otpDailyCounter = new Map<string, { count: number; resetAt: number }>();

/** Evict expired entries every 30 minutes to prevent unbounded Map growth. */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpDailyCounter) {
    if (now >= entry.resetAt) otpDailyCounter.delete(key);
  }
}, 30 * 60_000).unref();

/**
 * Enforce daily OTP limit per identifier (email or phone).
 * Throws 429 (TOO_MANY_REQUESTS) when the limit is exceeded.
 */
export function checkDailyOtpLimit(identifier: string): void {
  const now = Date.now();
  const entry = otpDailyCounter.get(identifier);
  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_OTP_SENDS_PER_DAY) {
      throw new HttpException(
        `Limite quotidienne atteinte (${MAX_OTP_SENDS_PER_DAY} codes/jour). Réessayez demain.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    entry.count++;
  } else {
    otpDailyCounter.set(identifier, { count: 1, resetAt: now + 86_400_000 });
  }
}

/** SHA-256 hash of an OTP code (for storage / comparison) */
export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Shape of an OTP record from Prisma */
export interface OtpRecord {
  id: string;
  code: string; // SHA-256 hex hash of the actual code
  expiresAt: Date;
  attempts: number;
}

/** Callbacks for DB operations so this helper stays framework-agnostic */
export interface OtpDbOps {
  deleteOtp(id: string): Promise<unknown>;
  incrementAttempts(id: string): Promise<{ attempts: number }>;
}

/**
 * Validate an OTP record against a user-supplied code.
 * The stored `otpRecord.code` is expected to be a SHA-256 hex hash.
 * Throws BadRequestException / UnauthorizedException on failure.
 * On success, returns void (caller should delete OTP + proceed).
 */
export function validateOtp(
  otpRecord: OtpRecord | null,
  code: string,
  notFoundMessage: string,
): void {
  if (!otpRecord) {
    throw new BadRequestException(notFoundMessage);
  }

  if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
    throw new BadRequestException('Trop de tentatives. Veuillez redemander un code');
  }

  if (new Date() > otpRecord.expiresAt) {
    throw new BadRequestException('Code expiré. Veuillez redemander un code');
  }

  // Hash the user-supplied code and compare with stored hash (timing-safe)
  const inputHash = hashOtp(code);
  const inputBuffer = Buffer.from(inputHash, 'hex');
  const storedBuffer = Buffer.from(otpRecord.code, 'hex');
  if (inputBuffer.length !== storedBuffer.length || !timingSafeEqual(inputBuffer, storedBuffer)) {
    // will be caught by caller for increment + throw
    throw new UnauthorizedException('__OTP_MISMATCH__');
  }
}

/**
 * Handle OTP mismatch: increment attempts and throw user-facing error.
 * Call this when validateOtp throws UnauthorizedException('__OTP_MISMATCH__').
 */
export async function handleOtpMismatch(
  otpRecord: OtpRecord,
  dbOps: OtpDbOps,
): Promise<never> {
  const updated = await dbOps.incrementAttempts(otpRecord.id);
  const remaining = MAX_OTP_ATTEMPTS - updated.attempts;
  if (remaining <= 0) {
    await dbOps.deleteOtp(otpRecord.id);
    throw new BadRequestException('Trop de tentatives. Veuillez redemander un code');
  }
  throw new UnauthorizedException(
    `Code invalide (${remaining} essai${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''})`,
  );
}
