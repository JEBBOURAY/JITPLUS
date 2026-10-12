/**
 * Tells the clients of every merchant converted by the
 * `20261007120000_stamps_only` migration that their points became stamps
 * (in-app notification + push, through the regular NotificationsService).
 *
 * Idempotent: each merchant's migration audit entry gets `notifiedAt` once
 * its broadcast is sent, so a re-run only processes the remaining ones.
 * Dry run by default; pass --send to actually notify.
 *
 * Boots a minimal Nest context (no ScheduleModule → no cron runs here).
 * Needs the production env of the backend (DATABASE_URL, JWT_SECRET,
 * FIREBASE_*, BACKEND_URL).
 *
 * Usage:
 *   npx ts-node scripts/notify-stamps-conversion.ts           # dry run
 *   npx ts-node scripts/notify-stamps-conversion.ts --send
 */
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { Prisma } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RepositoryModule } from '../src/common/repositories';
import { EventsModule } from '../src/events';
import { FirebaseModule } from '../src/firebase/firebase.module';
import { MailModule } from '../src/mail/mail.module';
import { NotificationsModule } from '../src/notifications/notifications.module';
import { NotificationsService } from '../src/notifications/notifications.service';

const MIGRATION = '20261007120000_stamps_only';
const TITLE = 'Votre carte passe aux tampons';
const body = (merchantName: string) =>
  `${merchantName} passe aux tampons : vos points ont été convertis automatiquement et votre progression vers le prochain cadeau est conservée.`;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.register({ isGlobal: true }),
    PrismaModule,
    RepositoryModule,
    EventsModule,
    FirebaseModule,
    MailModule,
    NotificationsModule,
  ],
})
class NotifyStampsConversionModule {}

async function main() {
  const send = process.argv.includes('--send');
  const logger = new Logger('NotifyStampsConversion');
  const app = await NestFactory.createApplicationContext(NotifyStampsConversionModule, { logger: ['log', 'warn', 'error'] });

  try {
    const prisma = app.get(PrismaService);
    const notifications = app.get(NotificationsService);

    const entries = await prisma.auditLog.findMany({
      where: {
        adminEmail: 'system:stamps-only-migration',
        metadata: { path: ['migration'], equals: MIGRATION },
      },
      select: { id: true, merchantId: true, targetLabel: true, metadata: true },
      orderBy: { createdAt: 'asc' },
    });
    const pending = entries.filter((e) => !(e.metadata as Prisma.JsonObject | null)?.notifiedAt);
    logger.log(`${entries.length} commerçant(s) convertis, ${pending.length} à notifier${send ? '' : ' (dry run, --send pour envoyer)'}`);

    let failed = 0;
    for (const entry of pending) {
      if (!entry.merchantId) continue;
      const merchant = await prisma.merchant.findUnique({
        where: { id: entry.merchantId },
        select: { nom: true, isActive: true, deletedAt: true },
      });
      if (!merchant || merchant.deletedAt || !merchant.isActive) {
        logger.warn(`${entry.targetLabel} (${entry.merchantId}) inactif ou supprimé : ignoré`);
        continue;
      }
      const activeCards = await prisma.loyaltyCard.count({ where: { merchantId: entry.merchantId, deactivatedAt: null } });
      if (!send) {
        logger.log(`[dry run] ${merchant.nom} (${entry.merchantId}) → ${activeCards} client(s)`);
        continue;
      }
      try {
        const result = await notifications.sendToAll(entry.merchantId, { title: TITLE, body: body(merchant.nom) });
        await prisma.auditLog.update({
          where: { id: entry.id },
          data: {
            metadata: {
              ...(entry.metadata as Prisma.JsonObject),
              notifiedAt: new Date().toISOString(),
              notificationId: result.id,
            },
          },
        });
        logger.log(`${merchant.nom} : ${result.recipientCount} client(s), échecs push ${result.failureCount}`);
      } catch (err) {
        failed++;
        logger.error(`${merchant.nom} (${entry.merchantId}) : ${err instanceof Error ? err.message : err}`);
      }
    }
    if (failed) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
