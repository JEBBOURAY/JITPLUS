// ── Global Repository Module ────────────────────────────────────────────────
// Provides model delegates + transaction/raw-query runners via DI tokens.
// Import once in AppModule — all services can inject any repository token.

import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MERCHANT_REPOSITORY,
  CLIENT_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
  TRANSACTION_REPOSITORY,
  STORE_REPOSITORY,
  TEAM_MEMBER_REPOSITORY,
  DEVICE_SESSION_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY,
  OTP_REPOSITORY,
  ADMIN_USER_REPOSITORY,
  AUDIT_LOG_REPOSITORY,
  PROFILE_VIEW_REPOSITORY,
  REWARD_REPOSITORY,
  CLIENT_REFERRAL_REPOSITORY,
  MERCHANT_NOTIFICATION_READ_REPOSITORY,
  PAYOUT_REQUEST_REPOSITORY,
  LUCKY_WHEEL_CAMPAIGN_REPOSITORY,
  LUCKY_WHEEL_PRIZE_REPOSITORY,
  LUCKY_WHEEL_TICKET_REPOSITORY,
  LUCKY_WHEEL_DRAW_REPOSITORY,
  CAMPAIGN_SENT_TRACKER_REPOSITORY,
  TRANSACTION_RUNNER,
  RAW_QUERY_RUNNER,
} from './repository.tokens';
import { PrismaTransactionRunner } from './transaction-runner';
import { PrismaRawQueryRunner } from './raw-query-runner';

const modelProviders = [
  { provide: MERCHANT_REPOSITORY, useFactory: (p: PrismaService) => p.merchant, inject: [PrismaService] },
  { provide: CLIENT_REPOSITORY, useFactory: (p: PrismaService) => p.client, inject: [PrismaService] },
  { provide: LOYALTY_CARD_REPOSITORY, useFactory: (p: PrismaService) => p.loyaltyCard, inject: [PrismaService] },
  { provide: TRANSACTION_REPOSITORY, useFactory: (p: PrismaService) => p.transaction, inject: [PrismaService] },
  { provide: STORE_REPOSITORY, useFactory: (p: PrismaService) => p.store, inject: [PrismaService] },
  { provide: TEAM_MEMBER_REPOSITORY, useFactory: (p: PrismaService) => p.teamMember, inject: [PrismaService] },
  { provide: DEVICE_SESSION_REPOSITORY, useFactory: (p: PrismaService) => p.deviceSession, inject: [PrismaService] },
  { provide: NOTIFICATION_REPOSITORY, useFactory: (p: PrismaService) => p.notification, inject: [PrismaService] },
  { provide: CLIENT_NOTIFICATION_STATUS_REPOSITORY, useFactory: (p: PrismaService) => p.clientNotificationStatus, inject: [PrismaService] },
  { provide: OTP_REPOSITORY, useFactory: (p: PrismaService) => p.otp, inject: [PrismaService] },
  { provide: ADMIN_USER_REPOSITORY, useFactory: (p: PrismaService) => p.admin, inject: [PrismaService] },
  { provide: AUDIT_LOG_REPOSITORY, useFactory: (p: PrismaService) => p.auditLog, inject: [PrismaService] },
  { provide: PROFILE_VIEW_REPOSITORY, useFactory: (p: PrismaService) => p.profileView, inject: [PrismaService] },
  { provide: REWARD_REPOSITORY, useFactory: (p: PrismaService) => p.reward, inject: [PrismaService] },
  { provide: CLIENT_REFERRAL_REPOSITORY, useFactory: (p: PrismaService) => p.clientReferral, inject: [PrismaService] },
  { provide: MERCHANT_NOTIFICATION_READ_REPOSITORY, useFactory: (p: PrismaService) => p.merchantNotificationRead, inject: [PrismaService] },
  { provide: PAYOUT_REQUEST_REPOSITORY, useFactory: (p: PrismaService) => p.payoutRequest, inject: [PrismaService] },
  { provide: LUCKY_WHEEL_CAMPAIGN_REPOSITORY, useFactory: (p: PrismaService) => p.luckyWheelCampaign, inject: [PrismaService] },
  { provide: LUCKY_WHEEL_PRIZE_REPOSITORY, useFactory: (p: PrismaService) => p.luckyWheelPrize, inject: [PrismaService] },
  { provide: LUCKY_WHEEL_TICKET_REPOSITORY, useFactory: (p: PrismaService) => p.luckyWheelTicket, inject: [PrismaService] },
  { provide: LUCKY_WHEEL_DRAW_REPOSITORY, useFactory: (p: PrismaService) => p.luckyWheelDraw, inject: [PrismaService] },
  { provide: CAMPAIGN_SENT_TRACKER_REPOSITORY, useFactory: (p: PrismaService) => p.campaignSentTracker, inject: [PrismaService] },
];

const infraProviders = [
  PrismaTransactionRunner,
  { provide: TRANSACTION_RUNNER, useExisting: PrismaTransactionRunner },
  PrismaRawQueryRunner,
  { provide: RAW_QUERY_RUNNER, useExisting: PrismaRawQueryRunner },
];

const allTokens = [
  MERCHANT_REPOSITORY, CLIENT_REPOSITORY, LOYALTY_CARD_REPOSITORY,
  TRANSACTION_REPOSITORY, STORE_REPOSITORY, TEAM_MEMBER_REPOSITORY,
  DEVICE_SESSION_REPOSITORY, NOTIFICATION_REPOSITORY, CLIENT_NOTIFICATION_STATUS_REPOSITORY,
  OTP_REPOSITORY, ADMIN_USER_REPOSITORY, AUDIT_LOG_REPOSITORY,
  PROFILE_VIEW_REPOSITORY, REWARD_REPOSITORY,
  CLIENT_REFERRAL_REPOSITORY,
  MERCHANT_NOTIFICATION_READ_REPOSITORY,
  PAYOUT_REQUEST_REPOSITORY,
  LUCKY_WHEEL_CAMPAIGN_REPOSITORY, LUCKY_WHEEL_PRIZE_REPOSITORY,
  LUCKY_WHEEL_TICKET_REPOSITORY, LUCKY_WHEEL_DRAW_REPOSITORY,
  CAMPAIGN_SENT_TRACKER_REPOSITORY,
  TRANSACTION_RUNNER, RAW_QUERY_RUNNER,
];

@Global()
@Module({
  providers: [...modelProviders, ...infraProviders],
  exports: allTokens,
})
export class RepositoryModule {}
