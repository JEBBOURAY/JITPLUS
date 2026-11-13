import { BadRequestException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { MAX_OTP_ATTEMPTS } from '../constants';

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
  /** Delete the OTP row; must not throw when it is already gone. */
  deleteOtp(id: string): Promise<unknown>;
  /**
   * Atomically increment `attempts` only while it is below MAX_OTP_ATTEMPTS
   * (conditional UPDATE). Returns the number of rows updated: 1 = attempt
   * reserved, 0 = limit reached (or row already consumed).
   */
  claimAttempt(id: string): Promise<number>;
}

/** Build OtpDbOps from an OTP repository (Prisma `otp` delegate). */
export function otpDbOps(repo: {
  deleteMany(args: { where: { id: string } }): Promise<{ count: number }>;
  updateMany(args: {
    where: { id: string; attempts: { lt: number } };
    data: { attempts: { increment: number } };
  }): Promise<{ count: number }>;
}): OtpDbOps {
  return {
    deleteOtp: (id) => repo.deleteMany({ where: { id } }),
    claimAttempt: async (id) =>
      (await repo.updateMany({
        where: { id, attempts: { lt: MAX_OTP_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      })).count,
  };
}

const OTP_TOO_MANY_ATTEMPTS_MESSAGE = 'Trop de tentatives. Veuillez redemander un code';

/** Outcome of a code check whose attempt was successfully reserved. */
export type OtpCheckResult = { ok: true } | { ok: false; remaining: number };

/**
 * Validate an OTP code against its stored record.
 *
 * The attempt is reserved atomically BEFORE the code is compared, so N
 * parallel guesses consume N attempts: MAX_OTP_ATTEMPTS cannot be bypassed
 * by firing requests concurrently.
 *
 * Throws BadRequestException when there is no record, the code expired or
 * the attempt limit is reached (the record is deleted in the last two cases).
 * On a wrong code returns `{ ok: false, remaining }` so each caller can word
 * its own error; when no attempt is left the record is deleted and it throws.
 */
export async function checkOtpCode(
  otpRecord: OtpRecord | null,
  code: string,
  notFoundMessage: string,
  ops: OtpDbOps,
): Promise<OtpCheckResult> {
  if (!otpRecord) {
    throw new BadRequestException(notFoundMessage);
  }

  if (new Date() > otpRecord.expiresAt) {
    await ops.deleteOtp(otpRecord.id);
    throw new BadRequestException('Code expiré. Veuillez redemander un code');
  }

  if ((await ops.claimAttempt(otpRecord.id)) !== 1) {
    await ops.deleteOtp(otpRecord.id);
    throw new BadRequestException(OTP_TOO_MANY_ATTEMPTS_MESSAGE);
  }

  // Hash the user-supplied code and compare with stored hash (timing-safe)
  const inputBuffer = Buffer.from(hashOtp(code), 'hex');
  const storedBuffer = Buffer.from(otpRecord.code, 'hex');
  if (inputBuffer.length === storedBuffer.length && timingSafeEqual(inputBuffer, storedBuffer)) {
    return { ok: true };
  }

  const remaining = MAX_OTP_ATTEMPTS - (otpRecord.attempts + 1);
  if (remaining <= 0) {
    await ops.deleteOtp(otpRecord.id);
    throw new BadRequestException(OTP_TOO_MANY_ATTEMPTS_MESSAGE);
  }
  return { ok: false, remaining };
}
