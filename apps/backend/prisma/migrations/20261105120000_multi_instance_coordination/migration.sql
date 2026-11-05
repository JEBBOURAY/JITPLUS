-- Multi-instance coordination (audit 2026-11-05).
--
-- cron_runs: one row per (cron name, scheduled minute). Every Cloud Run
-- instance fires the same @Cron; only the one whose INSERT succeeds runs it.
--
-- otp_send_counters: daily OTP send cap per email / phone, shared across
-- instances (it used to be an in-memory Map: x3 with 3 instances, reset on
-- every deploy).

-- socket_io_attachments: Socket.IO payloads > 8 kB relayed between instances
-- by @socket.io/postgres-adapter (LISTEN/NOTIFY carries the small ones).

-- CreateTable
CREATE TABLE "socket_io_attachments" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "payload" BYTEA
);

-- CreateTable
CREATE TABLE "cron_runs" (
    "name" VARCHAR(100) NOT NULL,
    "slot" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cron_runs_pkey" PRIMARY KEY ("name","slot")
);

-- CreateTable
CREATE TABLE "otp_send_counters" (
    "identifier" VARCHAR(320) NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "otp_send_counters_pkey" PRIMARY KEY ("identifier","day")
);

-- CreateIndex
CREATE UNIQUE INDEX "socket_io_attachments_id_key" ON "socket_io_attachments"("id");

-- CreateIndex
CREATE INDEX "cron_runs_slot_idx" ON "cron_runs"("slot");

-- CreateIndex
CREATE INDEX "otp_send_counters_day_idx" ON "otp_send_counters"("day");
