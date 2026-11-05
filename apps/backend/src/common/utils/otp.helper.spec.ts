import { BadRequestException } from '@nestjs/common';
import { checkOtpCode, hashOtp, OtpDbOps, OtpRecord } from './otp.helper';
import { MAX_OTP_ATTEMPTS } from '../constants';

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
