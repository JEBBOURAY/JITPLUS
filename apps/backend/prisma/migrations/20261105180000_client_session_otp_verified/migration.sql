-- Security audit 2026-11-05: POST /client-auth/reset-password-otp must prove a
-- fresh email OTP. The session opened by verify-otp-email records when the OTP
-- was verified; the reset consumes it (single use, short window).

-- AlterTable
ALTER TABLE "client_sessions" ADD COLUMN "otp_verified_at" TIMESTAMP(3);
