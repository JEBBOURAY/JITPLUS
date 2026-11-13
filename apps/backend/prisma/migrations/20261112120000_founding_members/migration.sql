-- Founding members: the first 500 merchant sign-ups get a permanent, free
-- PREMIUM plan and the Pro app hides every plan / Premium surface for them.
-- New sign-ups claim a slot in MerchantPlanService.claimFoundingSlot().

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN "founding_member" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: the 500 oldest live accounts become founding members.
WITH founders AS (
  SELECT "id" FROM "merchants"
  WHERE "deleted_at" IS NULL
  ORDER BY "created_at" ASC, "id" ASC
  LIMIT 500
)
UPDATE "merchants" m
SET "founding_member" = true,
    "plan" = 'PREMIUM',
    "plan_activated_by_admin" = true,
    "plan_expires_at" = NULL,
    "premium_grant" = 'OFFERED',
    "premium_grant_note" = COALESCE(m."premium_grant_note", 'Membre fondateur (500 premiers inscrits)')
FROM founders f
WHERE m."id" = f."id";
