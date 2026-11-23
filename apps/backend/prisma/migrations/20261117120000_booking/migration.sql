-- Booking: appointments a client takes from the JitPlus app, open to every plan.
-- Durations and prices are always set by the merchant; the service_templates
-- catalogue only suggests names per category, and a merchant can add his own.

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED_CLIENT', 'CANCELLED_MERCHANT', 'DECLINED', 'EXPIRED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('APP', 'MERCHANT');

-- CreateEnum
CREATE TYPE "AvailabilityExceptionType" AS ENUM ('CLOSED', 'OPEN');

-- CreateTable
CREATE TABLE "booking_settings" (
    "merchant_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "auto_confirm" BOOLEAN NOT NULL DEFAULT true,
    "min_notice_minutes" INTEGER NOT NULL DEFAULT 60,
    "max_advance_days" INTEGER NOT NULL DEFAULT 30,
    "cancel_deadline_hours" INTEGER NOT NULL DEFAULT 2,
    "slot_step_minutes" INTEGER NOT NULL DEFAULT 15,
    "no_show_limit" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_settings_pkey" PRIMARY KEY ("merchant_id")
);

-- CreateTable
CREATE TABLE "service_templates" (
    "id" TEXT NOT NULL,
    "category" "MerchantCategory" NOT NULL,
    "nom" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookable_services" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "template_id" TEXT,
    "nom" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "duration_min" INTEGER NOT NULL,
    "buffer_min" INTEGER NOT NULL DEFAULT 0,
    "price_from" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "bookable_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_resources" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "team_member_id" TEXT,
    "store_id" TEXT,
    "nom" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_resources" (
    "service_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,

    CONSTRAINT "service_resources_pkey" PRIMARY KEY ("service_id","resource_id")
);

-- CreateTable
CREATE TABLE "working_hours" (
    "id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_min" INTEGER NOT NULL,
    "end_min" INTEGER NOT NULL,

    CONSTRAINT "working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "resource_id" TEXT,
    "type" "AvailabilityExceptionType" NOT NULL DEFAULT 'CLOSED',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "reason" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "client_id" TEXT,
    "client_name" VARCHAR(120),
    "client_phone" VARCHAR(20),
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "blocked_until" TIMESTAMP(3) NOT NULL,
    "status" "BookingStatus" NOT NULL,
    "source" "BookingSource" NOT NULL DEFAULT 'APP',
    "note" VARCHAR(200),
    "service_name_snapshot" VARCHAR(120) NOT NULL,
    "price_snapshot" DECIMAL(10,2),
    "idempotency_key" VARCHAR(64),
    "confirmed_at" TIMESTAMP(3),
    "checked_in_at" TIMESTAMP(3),
    "check_in_transaction_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" VARCHAR(200),
    "reminder_day_sent_at" TIMESTAMP(3),
    "reminder_hour_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_templates_category_is_active_order_idx" ON "service_templates"("category", "is_active", "order");

-- CreateIndex
CREATE UNIQUE INDEX "service_templates_category_nom_key" ON "service_templates"("category", "nom");

-- CreateIndex
CREATE INDEX "bookable_services_merchant_id_deleted_at_is_active_idx" ON "bookable_services"("merchant_id", "deleted_at", "is_active");

-- CreateIndex
CREATE INDEX "bookable_services_template_id_idx" ON "bookable_services"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_resources_team_member_id_key" ON "booking_resources"("team_member_id");

-- CreateIndex
CREATE INDEX "booking_resources_merchant_id_is_active_idx" ON "booking_resources"("merchant_id", "is_active");

-- CreateIndex
CREATE INDEX "service_resources_resource_id_idx" ON "service_resources"("resource_id");

-- CreateIndex
CREATE INDEX "working_hours_resource_id_weekday_idx" ON "working_hours"("resource_id", "weekday");

-- CreateIndex
CREATE INDEX "availability_exceptions_merchant_id_starts_at_idx" ON "availability_exceptions"("merchant_id", "starts_at");

-- CreateIndex
CREATE INDEX "availability_exceptions_resource_id_starts_at_idx" ON "availability_exceptions"("resource_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_check_in_transaction_id_key" ON "bookings"("check_in_transaction_id");

-- CreateIndex
CREATE INDEX "bookings_merchant_id_starts_at_idx" ON "bookings"("merchant_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_resource_id_starts_at_idx" ON "bookings"("resource_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_client_id_starts_at_idx" ON "bookings"("client_id", "starts_at");

-- CreateIndex
CREATE INDEX "bookings_status_starts_at_idx" ON "bookings"("status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_client_id_idempotency_key_key" ON "bookings"("client_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "booking_settings" ADD CONSTRAINT "booking_settings_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookable_services" ADD CONSTRAINT "bookable_services_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookable_services" ADD CONSTRAINT "bookable_services_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "service_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_resources" ADD CONSTRAINT "booking_resources_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_resources" ADD CONSTRAINT "booking_resources_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_resources" ADD CONSTRAINT "booking_resources_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_resources" ADD CONSTRAINT "service_resources_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "bookable_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_resources" ADD CONSTRAINT "service_resources_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "booking_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "booking_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "booking_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "bookable_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "booking_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- No double booking: two active bookings of one resource cannot overlap
-- (service time + buffer). The final guarantee behind the Serializable check.
CREATE EXTENSION IF NOT EXISTS "btree_gist";
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist ("resource_id" WITH =, tsrange("starts_at", "blocked_until") WITH &&)
  WHERE ("status" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN'));

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_range_check" CHECK ("starts_at" < "ends_at" AND "ends_at" <= "blocked_until");
ALTER TABLE "working_hours" ADD CONSTRAINT "working_hours_range_check" CHECK ("weekday" BETWEEN 1 AND 7 AND "start_min" >= 0 AND "start_min" < "end_min" AND "end_min" <= 1440);
ALTER TABLE "bookable_services" ADD CONSTRAINT "bookable_services_duration_check" CHECK ("duration_min" BETWEEN 5 AND 720 AND "buffer_min" BETWEEN 0 AND 240);

-- Catalogue: service names only, the merchant sets duration and price himself.
INSERT INTO "service_templates" ("id", "category", "nom", "order") VALUES
  (gen_random_uuid()::text, 'COIFFURE', 'Coupe homme', 1),
  (gen_random_uuid()::text, 'COIFFURE', 'Coupe femme', 2),
  (gen_random_uuid()::text, 'COIFFURE', 'Brushing', 3),
  (gen_random_uuid()::text, 'COIFFURE', 'Coloration', 4),
  (gen_random_uuid()::text, 'COIFFURE', 'Mèches', 5),
  (gen_random_uuid()::text, 'COIFFURE', 'Taille de barbe', 6),
  (gen_random_uuid()::text, 'COIFFURE', 'Coupe enfant', 7),
  (gen_random_uuid()::text, 'COIFFURE', 'Soin cheveux', 8),
  (gen_random_uuid()::text, 'BEAUTE', 'Manucure', 1),
  (gen_random_uuid()::text, 'BEAUTE', 'Pédicure', 2),
  (gen_random_uuid()::text, 'BEAUTE', 'Pose de vernis semi-permanent', 3),
  (gen_random_uuid()::text, 'BEAUTE', 'Soin du visage', 4),
  (gen_random_uuid()::text, 'BEAUTE', 'Épilation', 5),
  (gen_random_uuid()::text, 'BEAUTE', 'Maquillage', 6),
  (gen_random_uuid()::text, 'BEAUTE', 'Extension de cils', 7),
  (gen_random_uuid()::text, 'BEAUTE', 'Massage', 8),
  (gen_random_uuid()::text, 'HAMMAM', 'Hammam traditionnel', 1),
  (gen_random_uuid()::text, 'HAMMAM', 'Hammam + gommage', 2),
  (gen_random_uuid()::text, 'HAMMAM', 'Hammam + massage', 3),
  (gen_random_uuid()::text, 'HAMMAM', 'Enveloppement', 4),
  (gen_random_uuid()::text, 'SPORT', 'Séance de coaching', 1),
  (gen_random_uuid()::text, 'SPORT', 'Cours collectif', 2),
  (gen_random_uuid()::text, 'SPORT', 'Séance d''essai', 3),
  (gen_random_uuid()::text, 'OPTIQUE', 'Examen de vue', 1),
  (gen_random_uuid()::text, 'OPTIQUE', 'Essayage de montures', 2),
  (gen_random_uuid()::text, 'OPTIQUE', 'Adaptation lentilles', 3),
  (gen_random_uuid()::text, 'AUTO', 'Vidange', 1),
  (gen_random_uuid()::text, 'AUTO', 'Lavage', 2),
  (gen_random_uuid()::text, 'AUTO', 'Diagnostic', 3),
  (gen_random_uuid()::text, 'AUTO', 'Changement de pneus', 4),
  (gen_random_uuid()::text, 'ANIMALERIE', 'Toilettage', 1),
  (gen_random_uuid()::text, 'ANIMALERIE', 'Bain', 2),
  (gen_random_uuid()::text, 'SALLE_JEU', 'Réservation d''une session', 1),
  (gen_random_uuid()::text, 'TELEPHONE', 'Réparation écran', 1),
  (gen_random_uuid()::text, 'TELEPHONE', 'Diagnostic', 2);
