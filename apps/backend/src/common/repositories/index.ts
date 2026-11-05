// ── Barrel exports for repositories ──────────────────────────────────────────

// Tokens
export {
  MERCHANT_REPOSITORY,
  CLIENT_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
  TRANSACTION_REPOSITORY,
  STORE_REPOSITORY,
  TEAM_MEMBER_REPOSITORY,
  DEVICE_SESSION_REPOSITORY,
  CLIENT_SESSION_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY,
  OTP_REPOSITORY,
  ADMIN_USER_REPOSITORY,
  AUDIT_LOG_REPOSITORY,
  PROFILE_VIEW_REPOSITORY,
  CLIENT_MERCHANT_BLOCK_REPOSITORY,
  QR_NONCE_REPOSITORY,
  DEAL_REPOSITORY,
  LUCKY_WHEEL_CAMPAIGN_REPOSITORY,
  REWARD_REPOSITORY,
  CLIENT_REFERRAL_REPOSITORY,
  MERCHANT_NOTIFICATION_READ_REPOSITORY,
  MERCHANT_INBOX_REPOSITORY,
  PAYOUT_REQUEST_REPOSITORY,
  CAMPAIGN_SENT_TRACKER_REPOSITORY,
  STAMP_CODE_REPOSITORY,
  TRANSACTION_RUNNER,
  RAW_QUERY_RUNNER,
} from './repository.tokens';

// Types
export type {
  IMerchantRepository,
  IClientRepository,
  ILoyaltyCardRepository,
  ITransactionRepository,
  IStoreRepository,
  ITeamMemberRepository,
  IDeviceSessionRepository,
  IClientSessionRepository,
  INotificationRepository,
  IClientNotificationStatusRepository,
  IOtpRepository,
  IAdminUserRepository,
  IAuditLogRepository,
  IProfileViewRepository,
  IClientMerchantBlockRepository,
  IQrNonceRepository,
  IDealRepository,
  ILuckyWheelCampaignRepository,
  IRewardRepository,
  IClientReferralRepository,
  IMerchantNotificationReadRepository,
  IMerchantInboxRepository,
  IPayoutRequestRepository,
  ICampaignSentTrackerRepository,
  IStampCodeRepository,
} from './repository.types';

// Infrastructure
export type { TransactionClient, ITransactionRunner, TransactionRunOptions } from './transaction-runner';
export type { IRawQueryRunner } from './raw-query-runner';

// Module
export { RepositoryModule } from './repository.module';
