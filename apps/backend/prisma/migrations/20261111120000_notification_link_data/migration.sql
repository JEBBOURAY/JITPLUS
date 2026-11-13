-- Deep link of a client notification (event, action, target ids): the same
-- payload as the push, so a tap in the in-app feed opens the same screen.

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "data" JSONB;
