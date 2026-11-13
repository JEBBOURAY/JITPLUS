export { queryKeys } from './queries/keys';
export { useStores, useCreateStore, useUpdateStore, useDeleteStore } from './queries/stores';
export { useRewards } from './queries/rewards';
export { useCompleteOnboarding } from './queries/onboarding';
export { usePlan, useReferral, useApplyReferralMonths } from './queries/plan';
export {
  useDashboardKpis,
  useDashboardTrends,
  useDashboardDistribution,
  useDashboardGames,
} from './queries/dashboard';
export { useClientDetail, useAdjustStamps } from './queries/clientDetail';
export {
  useClientStatus,
  prefetchClientStatus,
  prefetchTillData,
  isLocalTransactionEcho,
  useRecordTransaction,
} from './queries/clientStatus';
export { useHomeStats, useTransactions } from './queries/transactions';
export { useHasClients, useClientList } from './queries/clients';
export {
  useNotificationHistory,
  useHasSentNotification,
  useSendPushNotification,
  useBroadcastStatus,
  useCheckNotificationContent,
} from './queries/notifications';
export {
  useUploadMerchantLogo,
  useUploadMerchantCover,
  useDeleteMerchantCover,
  useUploadMerchantGalleryImage,
  useDeleteMerchantLogo,
  useUploadRewardImage,
  useUploadMerchantCardBackground,
  useDeleteMerchantCardBackground,
  useUpdateMerchantProfile,
  type MerchantProfilePayload,
} from './queries/merchantMedia';
export { useTeamMembers, useCreateTeamMember, useUpdateTeamMember, useDeleteTeamMember } from './queries/team';
export {
  useAdminNotifications,
  useAdminNotifUnreadCount,
  useMarkAdminNotifsRead,
  useMarkSingleAdminNotifRead,
  useNotificationPrefs,
  useUpdateNotificationPrefs,
  type InboxCategory,
  type AdminNotification,
  type NotificationPrefKey,
} from './queries/inbox';
export {
  useLuckyWheelCampaigns,
  useLuckyWheelPendingPrizes,
  useLuckyWheelClientPrizes,
  useLuckyWheelFulfilledPrizes,
  useCreateLuckyWheelCampaign,
  useUpdateLuckyWheelStatus,
  useUpdateLuckyWheelCampaign,
  useDeleteLuckyWheelCampaign,
  useFulfilLuckyWheelPrize,
  useLuckyWheelActiveInfo,
  type LuckyWheelPendingDraw,
} from './queries/luckyWheel';
