-- Security audit 2026-11-05: deleting an admin row cascaded to its whole
-- audit trail. Keep the rows (admin_email still names the actor).

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_admin_id_fkey";

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
