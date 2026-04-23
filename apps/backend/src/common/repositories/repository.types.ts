// ── Type aliases for model repository delegates ─────────────────────────────
// Each type extracts the delegate shape from PrismaService so that services
// depend on the TYPE, not on PrismaService directly.
//
// The actual value is provided in RepositoryModule via useFactory.

import { PrismaService } from '../../prisma/prisma.service';

export type IMerchantRepository = PrismaService['merchant'];
export type IClientRepository = PrismaService['client'];
export type ILoyaltyCardRepository = PrismaService['loyaltyCard'];
export type ITransactionRepository = PrismaService['transaction'];
export type IStoreRepository = PrismaService['store'];
export type ITeamMemberRepository = PrismaService['teamMember'];
export type IDeviceSessionRepository = PrismaService['deviceSession'];
export type INotificationRepository = PrismaService['notification'];
export type IClientNotificationStatusRepository = PrismaService['clientNotificationStatus'];
export type IOtpRepository = PrismaService['otp'];
export type IAdminUserRepository = PrismaService['admin'];
export type IAuditLogRepository = PrismaService['auditLog'];
export type IProfileViewRepository = PrismaService['profileView'];
export type IRewardRepository = PrismaService['reward'];
export type IClientReferralRepository = PrismaService['clientReferral'];
export type IMerchantNotificationReadRepository = PrismaService['merchantNotificationRead'];
export type IPayoutRequestRepository = PrismaService['payoutRequest'];
export type ILuckyWheelCampaignRepository = PrismaService['luckyWheelCampaign'];
export type ILuckyWheelPrizeRepository = PrismaService['luckyWheelPrize'];
export type ILuckyWheelTicketRepository = PrismaService['luckyWheelTicket'];
export type ILuckyWheelDrawRepository = PrismaService['luckyWheelDraw'];
export type ICampaignSentTrackerRepository = PrismaService['campaignSentTracker'];