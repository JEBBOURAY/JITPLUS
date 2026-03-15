
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.MerchantScalarFieldEnum = {
  id: 'id',
  nom: 'nom',
  email: 'email',
  password: 'password',
  googleId: 'googleId',
  pushToken: 'pushToken',
  termsAccepted: 'termsAccepted',
  categorie: 'categorie',
  description: 'description',
  ville: 'ville',
  quartier: 'quartier',
  adresse: 'adresse',
  latitude: 'latitude',
  longitude: 'longitude',
  countryCode: 'countryCode',
  phoneNumber: 'phoneNumber',
  logoUrl: 'logoUrl',
  coverUrl: 'coverUrl',
  socialLinks: 'socialLinks',
  profileViews: 'profileViews',
  pointsRules: 'pointsRules',
  pointsRate: 'pointsRate',
  loyaltyType: 'loyaltyType',
  conversionRate: 'conversionRate',
  stampsForReward: 'stampsForReward',
  accumulationLimit: 'accumulationLimit',
  activeRewardId: 'activeRewardId',
  plan: 'plan',
  planExpiresAt: 'planExpiresAt',
  planActivatedByAdmin: 'planActivatedByAdmin',
  trialStartedAt: 'trialStartedAt',
  isActive: 'isActive',
  onboardingCompleted: 'onboardingCompleted',
  failedLoginAttempts: 'failedLoginAttempts',
  lockedUntil: 'lockedUntil',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  referralCode: 'referralCode',
  referredById: 'referredById',
  referralMonthsEarned: 'referralMonthsEarned',
  whatsappQuotaUsed: 'whatsappQuotaUsed',
  whatsappQuotaMax: 'whatsappQuotaMax',
  whatsappQuotaResetAt: 'whatsappQuotaResetAt',
  emailQuotaUsed: 'emailQuotaUsed',
  emailQuotaMax: 'emailQuotaMax',
  emailQuotaResetAt: 'emailQuotaResetAt'
};

exports.Prisma.StoreScalarFieldEnum = {
  id: 'id',
  merchantId: 'merchantId',
  nom: 'nom',
  categorie: 'categorie',
  ville: 'ville',
  quartier: 'quartier',
  adresse: 'adresse',
  latitude: 'latitude',
  longitude: 'longitude',
  telephone: 'telephone',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AdminScalarFieldEnum = {
  id: 'id',
  email: 'email',
  password: 'password',
  nom: 'nom',
  role: 'role',
  isActive: 'isActive',
  failedLoginAttempts: 'failedLoginAttempts',
  lockedUntil: 'lockedUntil',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  adminId: 'adminId',
  adminEmail: 'adminEmail',
  action: 'action',
  targetType: 'targetType',
  targetId: 'targetId',
  targetLabel: 'targetLabel',
  metadata: 'metadata',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  createdAt: 'createdAt'
};

exports.Prisma.ClientScalarFieldEnum = {
  id: 'id',
  prenom: 'prenom',
  nom: 'nom',
  email: 'email',
  password: 'password',
  telephone: 'telephone',
  googleId: 'googleId',
  countryCode: 'countryCode',
  pushToken: 'pushToken',
  refreshTokenHash: 'refreshTokenHash',
  termsAccepted: 'termsAccepted',
  shareInfoMerchants: 'shareInfoMerchants',
  notifPush: 'notifPush',
  notifEmail: 'notifEmail',
  notifWhatsapp: 'notifWhatsapp',
  dateNaissance: 'dateNaissance',
  failedLoginAttempts: 'failedLoginAttempts',
  lockedUntil: 'lockedUntil',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.OtpScalarFieldEnum = {
  id: 'id',
  telephone: 'telephone',
  email: 'email',
  code: 'code',
  expiresAt: 'expiresAt',
  attempts: 'attempts',
  createdAt: 'createdAt'
};

exports.Prisma.LoyaltyCardScalarFieldEnum = {
  id: 'id',
  clientId: 'clientId',
  merchantId: 'merchantId',
  points: 'points',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TransactionScalarFieldEnum = {
  id: 'id',
  clientId: 'clientId',
  merchantId: 'merchantId',
  rewardId: 'rewardId',
  teamMemberId: 'teamMemberId',
  performedByName: 'performedByName',
  type: 'type',
  loyaltyType: 'loyaltyType',
  note: 'note',
  amount: 'amount',
  points: 'points',
  status: 'status',
  createdAt: 'createdAt'
};

exports.Prisma.TeamMemberScalarFieldEnum = {
  id: 'id',
  merchantId: 'merchantId',
  nom: 'nom',
  email: 'email',
  password: 'password',
  role: 'role',
  isActive: 'isActive',
  failedLoginAttempts: 'failedLoginAttempts',
  lockedUntil: 'lockedUntil',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RewardScalarFieldEnum = {
  id: 'id',
  merchantId: 'merchantId',
  titre: 'titre',
  cout: 'cout',
  description: 'description',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  merchantId: 'merchantId',
  title: 'title',
  body: 'body',
  recipientCount: 'recipientCount',
  successCount: 'successCount',
  failureCount: 'failureCount',
  isBroadcast: 'isBroadcast',
  channel: 'channel',
  createdAt: 'createdAt'
};

exports.Prisma.ClientNotificationStatusScalarFieldEnum = {
  id: 'id',
  clientId: 'clientId',
  notificationId: 'notificationId',
  isRead: 'isRead',
  readAt: 'readAt',
  isDismissed: 'isDismissed',
  dismissedAt: 'dismissedAt',
  createdAt: 'createdAt'
};

exports.Prisma.UpgradeRequestScalarFieldEnum = {
  id: 'id',
  merchantId: 'merchantId',
  status: 'status',
  message: 'message',
  adminNote: 'adminNote',
  reviewedById: 'reviewedById',
  reviewedAt: 'reviewedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DeviceSessionScalarFieldEnum = {
  id: 'id',
  merchantId: 'merchantId',
  tokenId: 'tokenId',
  deviceId: 'deviceId',
  deviceName: 'deviceName',
  deviceOS: 'deviceOS',
  userType: 'userType',
  userEmail: 'userEmail',
  userName: 'userName',
  lastActiveAt: 'lastActiveAt',
  ipAddress: 'ipAddress',
  isCurrentDevice: 'isCurrentDevice',
  createdAt: 'createdAt',
  refreshTokenHash: 'refreshTokenHash'
};

exports.Prisma.ProfileViewScalarFieldEnum = {
  id: 'id',
  merchantId: 'merchantId',
  clientId: 'clientId',
  viewDate: 'viewDate',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};
exports.MerchantCategory = exports.$Enums.MerchantCategory = {
  CAFE: 'CAFE',
  RESTAURANT: 'RESTAURANT',
  EPICERIE: 'EPICERIE',
  BOULANGERIE: 'BOULANGERIE',
  PHARMACIE: 'PHARMACIE',
  LIBRAIRIE: 'LIBRAIRIE',
  VETEMENTS: 'VETEMENTS',
  ELECTRONIQUE: 'ELECTRONIQUE',
  COIFFURE: 'COIFFURE',
  BEAUTE: 'BEAUTE',
  SPORT: 'SPORT',
  SUPERMARCHE: 'SUPERMARCHE',
  AUTRE: 'AUTRE'
};

exports.LoyaltyType = exports.$Enums.LoyaltyType = {
  POINTS: 'POINTS',
  STAMPS: 'STAMPS'
};

exports.MerchantPlan = exports.$Enums.MerchantPlan = {
  FREE: 'FREE',
  PREMIUM: 'PREMIUM'
};

exports.AdminRole = exports.$Enums.AdminRole = {
  ADMIN: 'ADMIN'
};

exports.AuditAction = exports.$Enums.AuditAction = {
  ADMIN_LOGIN: 'ADMIN_LOGIN',
  ACTIVATE_PREMIUM: 'ACTIVATE_PREMIUM',
  REVOKE_PREMIUM: 'REVOKE_PREMIUM',
  BAN_MERCHANT: 'BAN_MERCHANT',
  UNBAN_MERCHANT: 'UNBAN_MERCHANT',
  DELETE_MERCHANT: 'DELETE_MERCHANT',
  RESET_PASSWORD: 'RESET_PASSWORD',
  UPDATE_PLAN_DURATION: 'UPDATE_PLAN_DURATION',
  APPROVE_UPGRADE_REQUEST: 'APPROVE_UPGRADE_REQUEST',
  REJECT_UPGRADE_REQUEST: 'REJECT_UPGRADE_REQUEST'
};

exports.TransactionType = exports.$Enums.TransactionType = {
  EARN_POINTS: 'EARN_POINTS',
  REDEEM_REWARD: 'REDEEM_REWARD',
  ADJUST_POINTS: 'ADJUST_POINTS',
  LOYALTY_PROGRAM_CHANGE: 'LOYALTY_PROGRAM_CHANGE'
};

exports.TransactionStatus = exports.$Enums.TransactionStatus = {
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED'
};

exports.TeamRole = exports.$Enums.TeamRole = {
  TEAM_MEMBER: 'TEAM_MEMBER'
};

exports.UpgradeRequestStatus = exports.$Enums.UpgradeRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

exports.Prisma.ModelName = {
  Merchant: 'Merchant',
  Store: 'Store',
  Admin: 'Admin',
  AuditLog: 'AuditLog',
  Client: 'Client',
  Otp: 'Otp',
  LoyaltyCard: 'LoyaltyCard',
  Transaction: 'Transaction',
  TeamMember: 'TeamMember',
  Reward: 'Reward',
  Notification: 'Notification',
  ClientNotificationStatus: 'ClientNotificationStatus',
  UpgradeRequest: 'UpgradeRequest',
  DeviceSession: 'DeviceSession',
  ProfileView: 'ProfileView'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
