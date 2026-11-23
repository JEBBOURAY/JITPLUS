import { BadRequestException } from '@nestjs/common';
import { checkOtpCode, hashOtp, OtpDbOps, OtpRecord, otpSentRecently } from './otp.helper';
import { CLIENT_OTP_EXPIRY_MS, MAX_OTP_ATTEMPTS, OTP_COOLDOWN_MS, OTP_EXPIRY_MS } from '../constants';

function record(overrides: Partial<OtpRecord> = {}): OtpRecord {
  return {
    id: 'otp-1',
    code: hashOtp('123456'),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    ...overrides,
  };
}

/** In-memory OTP row with the same conditional-update semantics as the DB. */
function fakeDb(attempts = 0) {
  const row = { attempts, deleted: false };
  const ops: OtpDbOps = {
    deleteOtp: jest.fn(async () => { row.deleted = true; }),
    claimAttempt: jest.fn(async () => {
      if (row.deleted || row.attempts >= MAX_OTP_ATTEMPTS) return 0;
      row.attempts += 1;
      return 1;
    }),
  };
  return { row, ops };
}

describe('checkOtpCode', () => {
  it('accepts the right code and reserves one attempt', async () => {
    const { row, ops } = fakeDb();
    await expect(checkOtpCode(record(), '123456', 'none', ops)).resolves.toEqual({ ok: true });
    expect(row.attempts).toBe(1);
  });

  it('returns the remaining attempts on a wrong code', async () => {
    const { ops } = fakeDb();
    await expect(checkOtpCode(record(), '000000', 'none', ops)).resolves.toEqual({
      ok: false,
      remaining: MAX_OTP_ATTEMPTS - 1,
    });
  });

  it('throws the not-found message when there is no record', async () => {
    const { ops } = fakeDb();
    await expect(checkOtpCode(null, '123456', 'Aucun code', ops)).rejects.toThrow('Aucun code');
  });

  it('deletes and rejects an expired code without consuming an attempt', async () => {
    const { row, ops } = fakeDb();
    await expect(
      checkOtpCode(record({ expiresAt: new Date(Date.now() - 1) }), '123456', 'none', ops),
    ).rejects.toThrow('Code expiré');
    expect(row.deleted).toBe(true);
    expect(ops.claimAttempt).not.toHaveBeenCalled();
  });

  it('deletes the record when the last attempt is wrong', async () => {
    const { row, ops } = fakeDb(MAX_OTP_ATTEMPTS - 1);
    await expect(
      checkOtpCode(record({ attempts: MAX_OTP_ATTEMPTS - 1 }), '000000', 'none', ops),
    ).rejects.toThrow(BadRequestException);
    expect(row.deleted).toBe(true);
  });

  it('cannot be bypassed by parallel guesses that all read attempts=0', async () => {
    const { ops } = fakeDb();
    const stale = record(); // every request read the row before any increment
    const guesses = Array.from({ length: 10 }, (_, i) =>
      checkOtpCode(stale, String(100000 + i), 'none', ops).then(
        () => 'compared',
        () => 'rejected',
      ),
    );
    const outcomes = await Promise.all(guesses);
    expect(outcomes.filter((o) => o === 'compared')).toHaveLength(MAX_OTP_ATTEMPTS);
  });
});

/**
 * Code review 2026-11-21: the `otps` row is shared by email between JitPlus
 * (10 min codes) and Pro (5 min codes). The send time used to be derived from
 * `expiresAt - <own expiry>`, so a row written by the other app blocked Pro for
 * about 6 minutes, or skipped the client cooldown. It now comes from createdAt.
 */
describe('otpSentRecently — resend cooldown shared by both apps', () => {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  // A row as each app writes it, `ago` ms before now.
  const clientRow = (ago: number) => ({ createdAt: new Date(now - ago), expiresAt: new Date(now - ago + CLIENT_OTP_EXPIRY_MS) });
  const merchantRow = (ago: number) => ({ createdAt: new Date(now - ago), expiresAt: new Date(now - ago + OTP_EXPIRY_MS) });

  it('blocks a resend during the cooldown, whichever app wrote the row', () => {
    expect(otpSentRecently(clientRow(10_000), now)).toBe(true);
    expect(otpSentRecently(merchantRow(10_000), now)).toBe(true);
  });

  it('lets Pro send 2 minutes after a JitPlus code (was blocked about 6 more minutes)', () => {
    const row = clientRow(2 * 60_000);
    // Old Pro rule, kept here to show the bug it fixes:
    expect(row.expiresAt.getTime() - OTP_EXPIRY_MS + OTP_COOLDOWN_MS > now).toBe(true);
    expect(otpSentRecently(row, now)).toBe(false);
  });

  it('keeps the JitPlus cooldown 10 s after a Pro code (was skipped)', () => {
    const row = merchantRow(10_000);
    // Old client rule, kept here to show the bug it fixes:
    expect(row.expiresAt.getTime() - CLIENT_OTP_EXPIRY_MS + OTP_COOLDOWN_MS > now).toBe(false);
    expect(otpSentRecently(row, now)).toBe(true);
  });

  it('frees the cooldown exactly after OTP_COOLDOWN_MS', () => {
    expect(otpSentRecently(clientRow(OTP_COOLDOWN_MS), now)).toBe(false);
    expect(otpSentRecently(clientRow(OTP_COOLDOWN_MS - 1), now)).toBe(true);
  });
});
