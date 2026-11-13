import { Prisma } from '@prisma/client';
import type { TransactionClient } from '../common/repositories';

/**
 * Soft-delete a merchant inside an open transaction: anonymise every PII field
 * (so email, phone and social IDs can be reused), deactivate team, stores and
 * cards, revoke sessions and drop data a recreated account must not inherit.
 * Stores, cards and transactions stay for analytics.
 *
 * Shared by the merchant's own account deletion and the admin delete, which
 * must stay identical.
 */
export async function softDeleteMerchantInTx(
  tx: TransactionClient,
  merchantId: string,
  now: Date,
  /** Credential written on team members: a hash of a random secret, never a usable password. */
  teamMemberPassword: string,
): Promise<void> {
  await tx.merchant.update({
    where: { id: merchantId },
    data: {
      deletedAt: now,
      nom: 'Compte supprimé',
      email: `deleted_${merchantId}`,
      password: '',
      googleId: null,
      appleId: null,
      pushToken: null,
      phoneNumber: null,
      description: null,
      ville: null,
      quartier: null,
      adresse: null,
      latitude: null,
      longitude: null,
      logoUrl: null,
      coverUrl: null,
      socialLinks: Prisma.DbNull,
      referralCode: null,
      isActive: false,
    },
  });

  await tx.teamMember.updateMany({
    where: { merchantId },
    data: { isActive: false, password: teamMemberPassword },
  });

  // Gone from search/discovery; clients see their cards as expired.
  await tx.store.updateMany({ where: { merchantId }, data: { isActive: false } });
  await tx.loyaltyCard.updateMany({
    where: { merchantId, deactivatedAt: null },
    data: { deactivatedAt: now },
  });

  // Access + refresh tokens invalidated (callers also evict the session cache).
  await tx.deviceSession.deleteMany({ where: { merchantId } });

  // A recreated account starts with a clean inbox.
  await tx.merchantNotificationRead.deleteMany({ where: { merchantId } });
  await tx.merchantInboxNotification.deleteMany({ where: { merchantId } });
  await tx.notification.deleteMany({ where: { merchantId } });

  // Orphan-prone related data.
  await tx.reward.deleteMany({ where: { merchantId } });
  await tx.profileView.deleteMany({ where: { merchantId } });
  await tx.clientReferral.deleteMany({ where: { merchantId } });
}
