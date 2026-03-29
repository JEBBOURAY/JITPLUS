/**
 * Create or reset the admin account for JitPlus Admin panel.
 *
 * Usage:
 *   ADMIN_PASSWORD=YourSecurePassword npx ts-node prisma/create-admin.ts
 *
 * Reads DATABASE_URL from .env (or pass it as env var).
 * ADMIN_PASSWORD must be set as an environment variable.
 * Safe to run multiple times — upserts by email.
 */
import { PrismaClient, AdminRole } from '../src/generated/client';
import * as bcrypt from 'bcryptjs';

const ADMIN_EMAIL = 'contact@jitplus.com';
const ADMIN_NAME = 'Admin JitPlus';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error('❌ ADMIN_PASSWORD environment variable is required.');
  console.error('   Usage: ADMIN_PASSWORD=YourSecurePassword npx ts-node prisma/create-admin.ts');
  process.exit(1);
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const admin = await prisma.admin.upsert({
      where: { email: ADMIN_EMAIL },
      update: {
        password: hash,
        nom: ADMIN_NAME,
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      create: {
        email: ADMIN_EMAIL,
        password: hash,
        nom: ADMIN_NAME,
        role: AdminRole.ADMIN,
      },
    });

    console.log(`✅ Admin account ready: ${admin.email} (id: ${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ Failed to create admin:', e);
  process.exit(1);
});
