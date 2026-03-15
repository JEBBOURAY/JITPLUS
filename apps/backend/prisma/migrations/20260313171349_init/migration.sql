-- CreateEnum
CREATE TYPE "MerchantCategory" AS ENUM ('CAFE', 'RESTAURANT', 'EPICERIE', 'BOULANGERIE', 'PHARMACIE', 'LIBRAIRIE', 'VETEMENTS', 'ELECTRONIQUE', 'COIFFURE', 'BEAUTE', 'SPORT', 'SUPERMARCHE', 'AUTRE');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('ADMIN_LOGIN', 'ACTIVATE_PREMIUM', 'REVOKE_PREMIUM', 'BAN_MERCHANT', 'UNBAN_MERCHANT', 'DELETE_MERCHANT', 'RESET_PASSWORD', 'UPDATE_PLAN_DURATION', 'APPROVE_UPGRADE_REQUEST', 'REJECT_UPGRADE_REQUEST');

-- CreateEnum
CREATE TYPE "MerchantPlan" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "LoyaltyType" AS ENUM ('POINTS', 'STAMPS');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EARN_POINTS', 'REDEEM_REWARD', 'ADJUST_POINTS', 'LOYALTY_PROGRAM_CHANGE');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('TEAM_MEMBER');

-- CreateEnum
CREATE TYPE "UpgradeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "google_id" TEXT,
    "push_token" TEXT,
    "terms_accepted" BOOLEAN NOT NULL DEFAULT false,
    "categorie" "MerchantCategory" NOT NULL,
    "description" TEXT,
    "ville" TEXT,
    "quartier" TEXT,
    "adresse" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "country_code" TEXT NOT NULL DEFAULT 'MA',
    "phone_number" TEXT,
    "logo_url" TEXT,
    "cover_url" TEXT,
    "social_links" JSONB,
    "profile_views" INTEGER NOT NULL DEFAULT 0,
    "points_rules" JSONB,
    "points_rate" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "loyalty_type" "LoyaltyType" NOT NULL DEFAULT 'POINTS',
    "conversion_rate" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "stamps_for_reward" INTEGER NOT NULL DEFAULT 10,
    "accumulation_limit" INTEGER,
    "active_reward_id" TEXT,
    "plan" "MerchantPlan" NOT NULL DEFAULT 'FREE',
    "plan_expires_at" TIMESTAMP(3),
    "plan_activated_by_admin" BOOLEAN NOT NULL DEFAULT false,
    "trial_started_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "referral_code" TEXT,
    "referred_by_id" TEXT,
    "referral_months_earned" INTEGER NOT NULL DEFAULT 0,
    "whatsappQuotaUsed" INTEGER NOT NULL DEFAULT 0,
    "whatsappQuotaMax" INTEGER NOT NULL DEFAULT 100,
    "whatsappQuotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailQuotaUsed" INTEGER NOT NULL DEFAULT 0,
    "emailQuotaMax" INTEGER NOT NULL DEFAULT 200,
    "emailQuotaResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" "MerchantCategory",
    "ville" TEXT,
    "quartier" TEXT,
    "adresse" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "telephone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "admin_email" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "target_label" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "prenom" TEXT,
    "nom" TEXT,
    "email" TEXT,
    "password" TEXT,
    "telephone" TEXT,
    "google_id" TEXT,
    "country_code" TEXT NOT NULL DEFAULT 'MA',
    "push_token" TEXT,
    "refresh_token_hash" TEXT,
    "terms_accepted" BOOLEAN NOT NULL DEFAULT false,
    "share_info_merchants" BOOLEAN NOT NULL DEFAULT true,
    "notif_push" BOOLEAN NOT NULL DEFAULT true,
    "notif_email" BOOLEAN NOT NULL DEFAULT true,
    "notif_whatsapp" BOOLEAN NOT NULL DEFAULT true,
    "date_naissance" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otps" (
    "id" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_cards" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "reward_id" TEXT,
    "team_member_id" TEXT,
    "performed_by_name" TEXT,
    "type" "TransactionType" NOT NULL,
    "loyalty_type" TEXT,
    "note" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'TEAM_MEMBER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "cout" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "is_broadcast" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_notification_statuses" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "is_dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_notification_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upgrade_requests" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "status" "UpgradeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "admin_note" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upgrade_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "token_id" TEXT,
    "device_id" TEXT,
    "device_name" TEXT NOT NULL,
    "device_os" TEXT,
    "user_type" TEXT,
    "user_email" TEXT,
    "user_name" TEXT,
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "is_current_device" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refresh_token_hash" TEXT,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_views_log" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "view_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_views_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_google_id_key" ON "merchants"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_referral_code_key" ON "merchants"("referral_code");

-- CreateIndex
CREATE INDEX "merchants_is_active_idx" ON "merchants"("is_active");

-- CreateIndex
CREATE INDEX "merchants_deleted_at_idx" ON "merchants"("deleted_at");

-- CreateIndex
CREATE INDEX "merchants_categorie_ville_is_active_idx" ON "merchants"("categorie", "ville", "is_active");

-- CreateIndex
CREATE INDEX "merchants_latitude_longitude_idx" ON "merchants"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "stores_merchant_id_idx" ON "stores"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "audit_logs_admin_id_idx" ON "audit_logs"("admin_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_admin_id_created_at_idx" ON "audit_logs"("admin_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "clients_email_key" ON "clients"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clients_telephone_key" ON "clients"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "clients_google_id_key" ON "clients"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_refresh_token_hash_key" ON "clients"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "clients_nom_idx" ON "clients"("nom");

-- CreateIndex
CREATE INDEX "clients_email_idx" ON "clients"("email");

-- CreateIndex
CREATE INDEX "clients_telephone_idx" ON "clients"("telephone");

-- CreateIndex
CREATE INDEX "clients_deleted_at_idx" ON "clients"("deleted_at");

-- CreateIndex
CREATE INDEX "clients_notif_push_idx" ON "clients"("notif_push");

-- CreateIndex
CREATE INDEX "clients_google_id_idx" ON "clients"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "otps_telephone_key" ON "otps"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "otps_email_key" ON "otps"("email");

-- CreateIndex
CREATE INDEX "otps_expires_at_idx" ON "otps"("expires_at");

-- CreateIndex
CREATE INDEX "loyalty_cards_merchant_id_idx" ON "loyalty_cards"("merchant_id");

-- CreateIndex
CREATE INDEX "loyalty_cards_client_id_idx" ON "loyalty_cards"("client_id");

-- CreateIndex
CREATE INDEX "loyalty_cards_merchant_id_created_at_idx" ON "loyalty_cards"("merchant_id", "created_at");

-- CreateIndex
CREATE INDEX "loyalty_cards_merchant_id_points_idx" ON "loyalty_cards"("merchant_id", "points");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_cards_client_id_merchant_id_key" ON "loyalty_cards"("client_id", "merchant_id");

-- CreateIndex
CREATE INDEX "transactions_merchant_id_status_created_at_idx" ON "transactions"("merchant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "transactions_client_id_merchant_id_idx" ON "transactions"("client_id", "merchant_id");

-- CreateIndex
CREATE INDEX "transactions_client_id_created_at_idx" ON "transactions"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "transactions_merchant_id_type_status_created_at_idx" ON "transactions"("merchant_id", "type", "status", "created_at");

-- CreateIndex
CREATE INDEX "transactions_reward_id_idx" ON "transactions"("reward_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_email_key" ON "team_members"("email");

-- CreateIndex
CREATE INDEX "team_members_merchant_id_idx" ON "team_members"("merchant_id");

-- CreateIndex
CREATE INDEX "rewards_merchant_id_idx" ON "rewards"("merchant_id");

-- CreateIndex
CREATE INDEX "notifications_channel_idx" ON "notifications"("channel");

-- CreateIndex
CREATE INDEX "notifications_merchant_id_created_at_idx" ON "notifications"("merchant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "client_notification_statuses_client_id_is_dismissed_idx" ON "client_notification_statuses"("client_id", "is_dismissed");

-- CreateIndex
CREATE INDEX "client_notification_statuses_client_id_is_read_idx" ON "client_notification_statuses"("client_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "client_notification_statuses_client_id_notification_id_key" ON "client_notification_statuses"("client_id", "notification_id");

-- CreateIndex
CREATE INDEX "upgrade_requests_merchant_id_status_idx" ON "upgrade_requests"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "upgrade_requests_status_created_at_idx" ON "upgrade_requests"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_sessions_token_id_key" ON "device_sessions"("token_id");

-- CreateIndex
CREATE INDEX "device_sessions_merchant_id_idx" ON "device_sessions"("merchant_id");

-- CreateIndex
CREATE INDEX "device_sessions_merchant_id_device_id_idx" ON "device_sessions"("merchant_id", "device_id");

-- CreateIndex
CREATE INDEX "device_sessions_merchant_id_device_name_idx" ON "device_sessions"("merchant_id", "device_name");

-- CreateIndex
CREATE INDEX "profile_views_log_merchant_id_view_date_idx" ON "profile_views_log"("merchant_id", "view_date");

-- CreateIndex
CREATE INDEX "profile_views_log_client_id_idx" ON "profile_views_log"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_views_log_merchant_id_client_id_view_date_key" ON "profile_views_log"("merchant_id", "client_id", "view_date");

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_referred_by_id_fkey" FOREIGN KEY ("referred_by_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_cards" ADD CONSTRAINT "loyalty_cards_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_team_member_id_fkey" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notification_statuses" ADD CONSTRAINT "client_notification_statuses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notification_statuses" ADD CONSTRAINT "client_notification_statuses_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views_log" ADD CONSTRAINT "profile_views_log_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views_log" ADD CONSTRAINT "profile_views_log_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
