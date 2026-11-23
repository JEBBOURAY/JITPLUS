-- Merchant reminded once that a booking request is about to expire unanswered.
ALTER TABLE "bookings" ADD COLUMN "pending_reminder_sent_at" TIMESTAMP(3);
