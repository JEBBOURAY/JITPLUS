-- Bookings a merchant takes at the same time. Extra seats are booking_resources
-- that copy the main calendar's hours and services (handled by the API).
-- A constant default is a metadata-only change: no table rewrite.
ALTER TABLE "booking_settings" ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "booking_settings" ADD CONSTRAINT "booking_settings_capacity_check" CHECK ("capacity" BETWEEN 1 AND 10);
