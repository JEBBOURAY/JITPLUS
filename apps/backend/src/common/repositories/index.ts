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
  NOTIFICATION_REPOSITORY,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY,
  OTP_REPOSITORY,
  ADMIN_USER_REPOSITORY,
  AUDIT_LOG_REPOSITORY,
  UPGRADE_REQUEST_REPOSITORY,
  PROFILE_VIEW_REPOSITORY,
  REWARD_REPOSITORY,
  CLIENT_REFERRAL_REPOSITORY,
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
  INotificationRepository,
  IClientNotificationStatusRepository,
  IOtpRepository,
  IAdminUserRepository,
  IAuditLogRepository,
  IUpgradeRequestRepository,
  IProfileViewRepository,
  IRewardRepository,
  IClientReferralRepository,
} from './repository.types';

// Infrastructure
export type { TransactionClient, ITransactionRunner } from './transaction-runner';
export type { IRawQueryRunner } from './raw-query-runner';

// Module
export { RepositoryModule } from './repository.module';
