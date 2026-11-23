# Existing JitPlus codebase: building blocks for "action (Google review / social follow) → chance to win a gift"

Scope: read-only inspection of the working tree on branch `feat/ecommerce-stamp-codes` (2026-11-11), which has uncommitted changes. Sources are repo-relative `path:line` references, not URLs. Repo root: `/mnt/c/Users/ayoub/OneDrive/Desktop/JIT/jit-plus`.

## Existing prize-game engine

### Takeaway
Two server-side prize engines already exist. The **lucky wheel** gives tickets, runs a weighted draw with a win rate and stock, and the merchant confirms the prize was handed over. **Scratch cards** are pushed to an audience, every card wins, and the result is a coupon with a 6-digit code and a QR. Both are Premium-only and use Serializable transactions with atomic stock decrements. Today, though, a wheel ticket can only come from a loyalty `Transaction` (a visit, a stamp redemption or a purchase), and a scratch card can only come from a campaign blast to an audience. Neither has a trigger for "the client did an action".

### Cited Findings
**Lucky wheel: how tickets are earned**
- Tickets are granted inside the transaction DB tx by `awardLuckyWheelTicketsInTx`. It returns 0 unless `plan === 'PREMIUM'` and type ∈ {EARN_STAMPS, REDEEM_REWARD, PURCHASE}. — `apps/backend/src/merchant/utils/lucky-wheel-tickets.ts:21-42`
- Rules: with `ticketCostStamps>0`, a REDEEM_REWARD that spends at least that many stamps earns a ticket. With 0, every EARN_STAMPS earns one, and so does a PURCHASE when `minSpendAmount>0`. `ticketEveryNVisits` counts qualifying transactions since `startsAt`, and `minSpendAmount` filters by amount. — `apps/backend/src/merchant/utils/lucky-wheel-tickets.ts:1-8, 13-20, 59-85`
- `PURCHASE` is a 0-stamp transaction type whose only job is to give a wheel spin. — `apps/backend/src/merchant/dto/create-transaction.dto.ts:3-4`; `apps/backend/prisma/schema.prisma:600-601`
- `LuckyWheelTicket.transactionId` is required, with `onDelete: Restrict` and `@@unique([transactionId, campaignId])`. Every ticket must therefore point to a real Transaction. — `apps/backend/prisma/schema.prisma:974-993`
- After a ticket is awarded, a push goes out with `{ event: 'lucky_wheel_ticket', action: 'open_wheel', merchantId, tickets }`. — `apps/backend/src/merchant/services/merchant-transaction.service.ts:623-632`

**Lucky wheel: draw**
- `triggerDraw(clientId, ticketId)` does the following inside a Serializable tx with retry:
  - checks that the client owns the ticket, the ticket is unused and has no draw, and the campaign is ACTIVE and within its dates;
  - marks the ticket used and rolls `randomInt(0,10000)/10000 < globalWinRate`;
  - picks a prize by weight among those with `remaining>0`, does an atomic `updateMany remaining>0 decrement` and re-picks if it loses a race;
  - sets `claimBefore = now + claimWindowHours`, creates a `LuckyWheelDraw` (`serverSeed` = 32 random bytes) and a `LUCKY_WHEEL_WIN` transaction for the activity feed;
  - auto-ends the campaign once stock runs out.
  — `apps/backend/src/lucky-wheel/lucky-wheel.service.ts:410-571, 579-590`
- Client endpoints are `GET lucky-wheel/client/available-draws`, `POST trigger-draw` (throttled to 3 per TTL) and `GET history`, guarded by JWT + ClientOnlyGuard. — `apps/backend/src/lucky-wheel/lucky-wheel-client.controller.ts:20-42`

**Lucky wheel: merchant configuration**
- Campaign fields: name, description, status DRAFT/ACTIVE/PAUSED/ENDED, `globalWinRate` (0.01–1), startsAt/endsAt, ticketCostStamps, ticketEveryNVisits, minSpendAmount. Prize fields: label, description, weight, totalStock/remaining, claimWindowHours. — `apps/backend/prisma/schema.prisma:901-972`; validation at `apps/backend/src/lucky-wheel/lucky-wheel.service.ts:67-97, 152-183, 303-334`
- Every merchant endpoint (create, list, status, update, delete, fulfil, pending/fulfilled prizes) has `PremiumGuard`, and create/update/status/delete also need `MerchantOwnerGuard`. — `apps/backend/src/lucky-wheel/lucky-wheel-merchant.controller.ts:32-127`
- In the merchant app, `app/lucky-wheel/index.tsx` gates on `usePlanStatus().isPremium` and owner-only management. The `app/games.tsx` hub links `/lucky-wheel` and `/scratch-campaigns`. — `apps/jitpluspro/app/lucky-wheel/index.tsx:71-116`; `apps/jitpluspro/app/games.tsx:15-16`

**Lucky wheel: redemption in store**
- `fulfilPrize(merchantId, drawId, fulfilledBy)` checks merchant ownership, result WON, not already CLAIMED or EXPIRED, and `claimBefore`. It then sets `fulfilment=CLAIMED`, `fulfilledAt` and `fulfilledBy`. — `apps/backend/src/lucky-wheel/lucky-wheel.service.ts:593-623`
- At the till, the merchant app shows the client's pending prizes and usable coupons in `ClientWinnings`, which calls `fulfil.mutate` / `redeem.mutate`. This sits inside the transaction screen. — `apps/jitpluspro/components/transaction/ClientWinnings.tsx:35-36, 133, 152`; `apps/jitpluspro/app/transaction-amount.tsx:46, 335`

**Lucky wheel: consumer UI**
- `components/LuckyWheelModal.tsx` (173 lines) takes `{visible, onClose, merchantId}`, uses `useLuckyWheel`, and shows the prize list with `globalWinRate` (odds shown before the draw). It is mounted on the home tab and opened through the `?wheel=<merchantId>` param. — `apps/jitplus/components/LuckyWheelModal.tsx:21-46, 137`; `apps/jitplus/app/(tabs)/index.tsx:26, 148-155, 505`
- The merchant page shows the active wheel in its loyalty tab (`merchant.activeLuckyWheel`). — `apps/jitplus/app/merchant/[id].tsx:332, 385`

**Scratch cards → coupons**
- A campaign is pushed to an audience of loyalty cards: ALL_CLIENTS, ACTIVE_SINCE, INACTIVE_SINCE, MIN_STAMPS or NEW_SINCE. Blocked or deleted clients are excluded, and ghost clients are included. — `apps/backend/src/scratch-card/scratch-audience.ts:5-46`; `apps/backend/prisma/schema.prisma:1060-1071`
- Each client gets at most one card per campaign (`@@unique([campaignId, clientId])`). The card has `expiresAt`, and the campaign has `cardExpiresAt` and `couponExpiresAt`. — `apps/backend/prisma/schema.prisma:1092-1190`
- `scratch()` runs in a Serializable tx. It moves the card from PENDING to SCRATCHED atomically, then makes a weighted pick among rewards with `remaining` null (unlimited) or above 0. That pick uses `updateMany` to decrement the stock. Last, it calls `couponService.createFromReward`. — `apps/backend/src/scratch-card/scratch-play.service.ts:112-182`
- Reward types are PERCENT_DISCOUNT, FIXED_DISCOUNT, FREE_PRODUCT (optionally linked to `Reward`) and BONUS_STAMPS. Each reward has a weight, a stock (null = unlimited), `minPurchaseAmount`, `minDelayHours` ("next visit"), an allowed-weekdays bitmask and allowed time windows. — `apps/backend/prisma/schema.prisma:1072-1157`
- Limits: `MAX_REWARDS 8`, `MAX_CARD_DAYS 60`, `MAX_COUPON_DAYS 120`, `MAX_MIN_DELAY_HOURS 168`, at most 4 campaigns per rolling 30 days, scheduling up to 30 days ahead. Reminders go out 24 h (card) and 48 h (coupon) before expiry. — `apps/backend/src/scratch-card/scratch-limits.ts:4-35`; enforced at `apps/backend/src/scratch-card/scratch-campaign.service.ts:307-338`
- Create, update, schedule, dates, duplicate and audience estimate are guarded by `PremiumGuard`. Status, cancel and delete are not. — `apps/backend/src/scratch-card/scratch-merchant.controller.ts:65-146`
- Client endpoints: `scratch/client/cards`, `cards/:id/open`, `cards/:id/scratch` (throttled to 5), `coupons`, `coupons/:id`. — `apps/backend/src/scratch-card/scratch-client.controller.ts:15-58`

**Coupon (generic won-gift object)**
- `Coupon` stores a snapshot of the reward with `code Char(6)` (unique among a merchant's ACTIVE coupons), status ACTIVE/REDEEMED/EXPIRED/CANCELLED, validFrom/expiresAt, redeemedBy, purchaseAmount/discountAmount, and redeem/earn transaction links. `source` is an enum `CouponSource { SCRATCH_CARD, LUCKY_WHEEL, MANUAL }`. — `apps/backend/prisma/schema.prisma:1079-1090, 1192-1237`
- In practice only `source: 'SCRATCH_CARD'` is ever written (`createFromReward` hardcodes it, and `scratchCardId` is assumed). A grep found no writer for `LUCKY_WHEEL` or `MANUAL`. — `apps/backend/src/scratch-card/coupon.service.ts:144-199` (line 177)
- Redemption: the merchant scans the coupon QR (`jitplus://coupon/...` or a `c1.` HMAC token) or types the 6-digit code, then calls `POST scratch/merchant/coupons/check` (throttled to 10) and `POST coupons/:id/redeem` (throttled to 30, idempotency key). `evaluateCouponConditions` checks the minimum purchase, weekday and hours. Ghost or deleted clients are refused. — `apps/backend/src/scratch-card/coupon.service.ts:230-345`; `apps/backend/src/scratch-card/scratch-merchant.controller.ts:153-192`; `apps/jitpluspro/utils/parseScanPayload.ts:45-48`; `apps/jitpluspro/app/coupon-validate.tsx`
- The consumer coupon screen shows a QR (`react-native-qrcode-svg`, `COUPON_QR_PREFIX`) and boosts screen brightness. — `apps/jitplus/app/coupons/[id].tsx:7, 21, 39-48`
- A shared weighted-draw helper exists. — `apps/backend/src/common/utils/weighted-draw.ts` (with spec)

### Inferences
- The most reusable win path is the coupon engine: `createFromReward` plus the `CouponSource` enum, which already reserves `MANUAL`/`LUCKY_WHEEL`. A new source value (for example `ACTION_REWARD`) would get the redemption UI, QR and expiry reminders for free.
- The wheel cannot take an action-based ticket as is: tickets must reference a Transaction, and only three transaction types can grant them. Options are a new 0-stamp transaction type (the way `PURCHASE` was added), or making `transactionId` nullable and adding a `source` column.

### Gaps
- Per-client/day draw caps: none are visible beyond the HTTP throttles and one ticket per transaction per campaign. There is no daily cap per client or per merchant.
- I did not read the consumer scratch/coupon UI in full, or `useLuckyWheel.ts`.

## Data model

### Takeaway
The models for loyalty, the wheel, scratch cards, coupons, stamp codes, notifications and dedup trackers already exist. Nothing models an "engagement action" (type, target URL, proof, verification status), and nothing stores a Google Place ID.

### Cited Findings
- `Merchant` fields of interest:
  - `socialLinks Json?` (comment: `{instagram, facebook, tiktok, website, snapchat, youtube}`);
  - `latitude/longitude`, `adresse`;
  - `plan MerchantPlan (FREE|PREMIUM)`, `planExpiresAt`, `trialStartedAt`;
  - `notifPrefs`.
  There is no `googlePlaceId`, Google Maps URL or review URL field. — `apps/backend/prisma/schema.prisma:17-171` (socialLinks line 46; plan 61-64)
- `Store` has its own `socialLinks Json?`, `latitude/longitude` and `telephone`, and also no place ID. — `apps/backend/prisma/schema.prisma:173-200`
- `Transaction` has `type TransactionType` (EARN_STAMPS, REDEEM_REWARD, ADJUST_STAMPS, LOYALTY_PROGRAM_CHANGE, LUCKY_WHEEL_WIN, PURCHASE, COUPON_REDEEM), `teamMemberId`, `performedByName`, `giftStatus PENDING|FULFILLED`, `idempotencyKey` and `stampCodeId @unique`. — `apps/backend/prisma/schema.prisma:548-616`
- `Reward` is the merchant catalogue (titre, cout, imageUrl) and can be linked from a ScratchReward. — `apps/backend/prisma/schema.prisma:642-661`
- `Notification` has an optional `data Json` deep link. `ClientNotificationStatus` tracks per-client state. — `apps/backend/prisma/schema.prisma:663-693, 734`
- `CampaignSentTracker` (clientId/merchantId, campaignId, channel, `@@unique([clientId, campaignId, channel])`) dedupes marketing sends, which would fit "send the review invite only once". — `apps/backend/prisma/schema.prisma:758-775`
- `QrNonce` and `ClientClaim` (hashed token, expiresAt, consumedAt) are existing single-use token patterns. — `apps/backend/prisma/schema.prisma:485-517`
- `StampCode` and `StampCodeStatus` are described under the proof section below. — `apps/backend/prisma/schema.prisma:1347-1383`
- `ClientReferral` and `PayoutRequest` models remain in the schema even though the consumer `referral.tsx` screen is deleted in the working tree. — `apps/backend/prisma/schema.prisma:840-899`

### Inferences
- A new feature would probably need new models: an engagement campaign per merchant (action type, target, prize pool or link to a wheel or scratch campaign, per-client limit) and an engagement claim per client (status PENDING/VERIFIED/REJECTED, verifiedBy, verifiedAt). Both could follow the shape of `ScratchCard` and `Coupon`.

### Gaps
- I did not inspect the migrations folder to confirm that the uncommitted schema edits are migrated.

## Merchant profile & social/Google fields

### Takeaway
Merchants can already enter Instagram, Facebook, TikTok, Snapchat, YouTube, website and WhatsApp, and the consumer merchant page shows them as tappable buttons. Google Places is used only for address autocomplete and the `place_id` is thrown away. There is no Google review link and no in-app prompt for a merchant review. The only "review" prompt is "rate the JitPlus app".

### Cited Findings
- `SocialLinksDto` validates instagram, facebook, tiktok, snapchat and youtube as handles (`/^@?[A-Za-z0-9._-]{1,100}$/`), website as an http(s) URL and whatsapp as digits. — `apps/backend/src/merchant/dto/social-links.dto.ts:1-52`
- The profile update writes `socialLinks` and runs moderation on each handle. — `apps/backend/src/merchant/services/merchant-profile.service.ts:104-117`. Signup collects only instagram, tiktok and website. — `apps/backend/src/auth/merchant-signup.service.ts:27-39, 179-236`
- The client merchant-detail API returns `socialLinks`. — `apps/backend/src/client-auth/client.service.ts:500, 615`; `apps/backend/src/common/prisma-selects.ts:30`
- `getSocialProfiles` builds the URLs: instagram (`instagram://user?username=` then web), tiktok, facebook, snapchat, youtube. — `packages/shared/src/merchantFiche.ts:188-220`
- The consumer `MerchantSocialLinks` renders icon buttons that call `openFirst(urls)`. It is used in `MerchantAbout`. Nothing records that a link was tapped. — `apps/jitplus/components/merchant/MerchantSocialLinks.tsx:13-54`; `apps/jitplus/components/merchant/MerchantAbout.tsx:16, 98`
- Directions link: `geo:` / `https://www.google.com/maps/search/?api=1&query=lat,lng`, built from coordinates rather than a place ID. — `packages/shared/src/openLinks.ts:23-25`
- Google Places: the backend proxies `place/details` (fields geometry, formatted_address, address_components). — `apps/backend/src/geocode/geocode.service.ts:102-109`; `apps/backend/src/geocode/geocode.controller.ts:38-44`. The merchant `AddressAutocomplete` keeps `place_id` internally, but its `AddressResult` has no place ID, so it is never saved. — `apps/jitpluspro/components/AddressAutocomplete.tsx:29, 37-44, 196-233`
- The only review prompt: "Rate JitPlus" in the consumer profile (`profile.rateAppDesc`: "Enjoying JitPlus? Leave a review"), which opens the store URL. — `apps/jitplus/components/profile/SupportSection.tsx:28-53`; `apps/jitplus/i18n/locales/en.ts:449`
- Email templates already render the merchant's Instagram and TikTok links. — `apps/backend/src/mail/email-templates.ts:564-603`
- The merchant app has a `social-post.tsx` screen (share images to Instagram, Facebook and others), a `posters.tsx` screen (printable or shareable posters with the client-app QR) and an onboarding `SocialStep`. — `apps/jitpluspro/app/social-post.tsx:17-28`; `apps/jitpluspro/app/posters.tsx:20-50`; `apps/jitpluspro/components/setup/steps/SocialStep.tsx`

### Inferences
- A Google review link could be built from a stored place ID (`https://search.google.com/local/writereview?placeid=...`). The autocomplete already gets the ID, so persisting it is a small change to `AddressResult` plus a new Merchant/Store column.
- Social follows can only be self-declared or staff-confirmed. The app opens external apps and gets no callback.

### Gaps
- Whether Google's or the platforms' policies allow review or follow incentives is out of scope here (web research). The codebase has no compliance logic for it.

## Validation flows reusable as proof

### Takeaway
There are three reusable proof patterns:
- **Merchant-issued single-use HMAC codes.** These are the stamp codes on this branch. The client scans the code and the server credits it atomically.
- **Staff-side scan of the client QR** leading to the transaction screen, where the client's winnings are also handed over.
- **Owner-only manual stamp adjustment.**

None of them records why the reward was given (for example "left a review").

### Cited Findings
- `StampCode`: single-use QR "slipped into a parcel" with a stamps snapshot, amount, batchId, label, status ACTIVE/REDEEMED/REVOKED and redeemedByClientId. Codes never expire. The token is an HMAC of the id, so no secret is stored and a batch can be reprinted. — `apps/backend/prisma/schema.prisma:1347-1383`; `apps/backend/src/stamp-codes/stamp-code-token.service.ts:14-15, 29-63` (key = HMAC(secret, 'jitplus-stamp-code-v1'))
- Client redeem: `POST stamp-codes/client/redeem` (throttled to 10) calls `tokens.verify` and then `MerchantTransactionService.redeemStampCode`. — `apps/backend/src/stamp-codes/stamp-codes-client.controller.ts:15-31`
- `redeemStampCode` does an atomic `updateMany status ACTIVE→REDEEMED`, then `applyTransactionInTx(type 'EARN_STAMPS', allowEnroll, accumulationLimit, stampCodeId, plan)` in the same RepeatableRead tx. Any refusal rolls the claim back, and a re-scan by the same client is replayed as idempotent. Because it is EARN_STAMPS, it also passes through `awardLuckyWheelTicketsInTx`. — `apps/backend/src/merchant/services/merchant-transaction.service.ts:286-380`
- Plan: FREE allows `FREE_MAX_STAMP_CODES_PER_MONTH = 10` per calendar month (quota enforced in tx with error `STAMP_CODE_QUOTA`). PREMIUM is unlimited. — `apps/backend/src/common/constants.ts:64`; `apps/backend/src/stamp-codes/stamp-codes.service.ts:41-66, 99-110`
- Merchant endpoints: quota, batch create (throttled to 10), list and revoke batch or code. — `apps/backend/src/stamp-codes/stamp-codes-merchant.controller.ts:15-61`; merchant UI at `apps/jitpluspro/app/stamp-codes/`
- Consumer: deep links `jitplus://stamp-code?token=` and `https://<host>/q/<token>` route to `/stamp-code`. The screen uses a shared `RedeemFlow` (confirm, then result, then a link to the merchant page). — `apps/jitplus/utils/deepLinks.ts:8, 28-32`; `apps/jitplus/app/stamp-code.tsx:10, 56-130`
- Staff QR scan: `parseScanPayload` handles signed client QR `jitplus://scan/{JWT}`, legacy client IDs (host allowlist) and coupon QRs. Phone search is also available. Both lead to `/transaction-amount` with `clientId` and an optional `scanTicket`. — `apps/jitpluspro/utils/parseScanPayload.ts:1-58`; `apps/jitpluspro/app/scan-qr.tsx:204-213, 489-498`
- `/transaction-amount` posts EARN_STAMPS/PURCHASE or REDEEM_REWARD and embeds `ClientWinnings` (pending wheel prizes and usable coupons). Team members' transactions record `teamMemberId` and `performedByName`. — `apps/jitpluspro/app/transaction-amount.tsx:237-247, 335`; `apps/backend/prisma/schema.prisma:552-553`
- Manual grant: `POST merchant/transactions/adjust` (MerchantOwnerGuard, throttled to 20) creates `ADJUST_STAMPS`. — `apps/backend/src/merchant/controllers/merchant-transaction.controller.ts:73-78`
- `ClientClaim` / quick-add uses claim links with a hashed token, expiry and consumedAt. — `apps/backend/prisma/schema.prisma:500-517`; `apps/jitplus/utils/deepLinks.ts:4, 19-25`

### Inferences
- "Staff confirms the action" fits the existing scan → transaction-amount screen best. A new button there ("Avis vérifié") could create a ticket or coupon tied to the merchant or team member.
- A printed in-store "review → code" QR could reuse the StampCode HMAC and single-use machinery. But stamp codes are bearer tokens with no expiry, so they prove possession of the code, not that the action happened.

### Gaps
- No proof-of-action verification exists anywhere (no screenshot upload or review lookup). The storage module exists (`apps/backend/src/storage`), but I did not check whether it accepts client uploads.

## Notifications/deep links

### Takeaway
The building blocks for a post-visit "leave a review" invitation are in place:
- per-client transactional push;
- a deep-link router keyed on `action`;
- quiet-hours handling;
- a per-client dedup tracker;
- a cron framework.

What is missing is a new `action` value and a scheduled job.

### Cited Findings
- `NotificationsService.sendToClient(merchantId, clientId, title, body, data)` respects `notifPush` and writes an in-app Notification plus ClientNotificationStatus. — `apps/backend/src/notifications/notifications.service.ts:341-360`. The stored deep-link keys are limited to `['event','action','merchantId','couponId','cardId','campaignId','dealId']`. — `apps/backend/src/notifications/notification-link.ts:1-8`
- After each transaction, `dispatchTransactionSideEffects` emits a websocket event and sends the stamps_updated, reward_available and reward_redeemed pushes. This is the natural hook for a "thanks for your visit, leave a review" trigger. — `apps/backend/src/merchant/services/merchant-transaction.service.ts:569-590, 700-750`
- Consumer router `resolveNotificationRoute` handles `open_explore`, `open_scan`, `open_cards`, `open_card`, `open_notifications`, `open_wheel` (→ `/(tabs)?wheel=merchantId`), `open_scratch`, `open_coupon(s)`, `open_deal(s)`, plus fallbacks on couponId, cardId and dealId. Unknown actions only warn in dev and fall back to the merchant page or the feed. — `apps/jitplus/utils/notificationRouting.ts:15-65`
- Incoming URL routing (claim, stamp-code, merchant or deal share) goes through `+native-intent.tsx` → `resolveIncomingUrl`. — `apps/jitplus/app/+native-intent.tsx:1-14`; `apps/jitplus/utils/deepLinks.ts:15-32`. The backend serves the universal-link side from `apps/backend/src/deeplink/deeplink.controller.ts`.
- Quiet hours (Morocco night and Jumu'ah): `isQuietHours`, a shift to the end of the quiet window, and cron guards combining ENABLE_CRONS with quiet hours. — `apps/backend/src/common/tasks/cron-utils.ts:134-232`
- Daily client crons such as `ClientReengagementService` (`@Cron('0 14 * * *')`) show the pattern for a delayed post-visit job. — `apps/backend/src/common/tasks/client-reengagement.service.ts:101-115`. Dedup uses `CampaignSentTracker`. — `apps/backend/prisma/schema.prisma:758-775`
- Scratch dispatch has its own batch push with a lock (`SCRATCH_SENDING_LOCK_MS`). — `apps/backend/src/scratch-card/scratch-dispatch.service.ts:37-274`

### Inferences
- An old app build receiving an `open_review` action would fall back to the merchant page, so the change is backward-safe (`notificationRouting.ts:50-64`). A new link key would need to be added to `LINK_KEYS`.

### Gaps
- I did not verify how the Android notification channels are configured for a new category. `apps/jitplus/utils/notifications.ts:61` mentions a transactional channel.

## Plan gating

### Takeaway
Gating is a mature, two-layer pattern. On the backend, `PremiumGuard` and `MerchantPlanService.resolveEffectivePlan` check the plan, and the engines also check it inside transactions. In the merchant app, `usePlanStatus().isPremium` drives the UI with `PremiumLockCard`. FREE features get quotas (stamp codes 10 per month, 20 clients, 1 store).

### Cited Findings
- `PremiumGuard` calls `planService.isPremium(userId)` and throws 403 "Cette fonctionnalité est réservée au plan Pro." — `apps/backend/src/auth/guards/premium.guard.ts:1-31`; `apps/backend/src/merchant/services/merchant-plan.service.ts:129-140, 411`
- The plan is enforced inside transactions too: wheel tickets stop when the plan is no longer PREMIUM (security audit 2026-11-05). — `apps/backend/src/merchant/utils/lucky-wheel-tickets.ts:31-36, 42`. Coupon redemption resolves the plan. — `apps/backend/src/scratch-card/coupon.service.ts:302-304`
- FREE quotas: `FREE_MAX_STORES 1` / `PREMIUM_MAX_STORES 10`, `FREE_MAX_CLIENTS 20`, `FREE_MAX_STAMP_CODES_PER_MONTH 10`. — `apps/backend/src/common/constants.ts:56-64`
- New merchants get a PREMIUM trial (`TRIAL_DURATION_DAYS`). — `apps/backend/prisma/schema.prisma:60`; `apps/backend/src/merchant/services/merchant-plan.service.ts:21, 274`
- Merchant-app gating: `hooks/usePlanStatus.ts`, `components/PremiumLockCard.tsx` and `hooks/useStatsGate.tsx`. Example: the lucky-wheel list shows a "discover Premium" button that leads to `/plan`. — `apps/jitpluspro/app/lucky-wheel/index.tsx:71-116`; `apps/jitpluspro/app/scratch-campaigns/index.tsx:64`

### Inferences
- An action-for-gift feature fits as a Premium game, with an optional FREE monthly quota modelled on stamp codes.

### Gaps
- None found.

## Legal pages

### Takeaway
The consumer terms (CGU) contain only a lucky-wheel rules section. It says tickets come only from loyalty activity and that the wheel is not a lottery. A review- or follow-based entry would contradict this text as written. There is no scratch-card or contest rules section. The referral screens and terms are deleted in the working tree.

### Cited Findings
- `apps/jitplus/app/legal/terms.tsx:26-33` renders the `legal.wheelRules*` keys (Earn, Odds, Claim, Prizes, Fraud, Disclaimer).
- French text (`apps/jitplus/i18n/locales/fr.ts:661-669`):
  - "Les tickets de tirage sont obtenus uniquement par l'activité fidélité (visites, tampons accumulés)";
  - "Aucun ticket ne peut être acheté";
  - "La Roue n'est ni un jeu de hasard au sens de la réglementation, ni une loterie";
  - the merchant is the organiser and JitPlus is only the technical provider;
  - Apple and Google are not sponsors;
  - the server-seed fairness claim;
  - a claim deadline;
  - prizes have no cash value;
  - anti-fraud.
  A `wheelRulesMinors` key exists (line 668), but `terms.tsx` does not render it.
- No scratch-card or coupon rules key was found in the legal namespace (grep on `fr.ts`).
- Legal files present: `apps/jitplus/app/legal/{_layout,index,licenses,privacy,terms}.tsx`. The merchant app has `apps/jitpluspro/app/legal.tsx` (205 lines), and a grep found no game wording there.
- Working tree vs HEAD: `apps/jitplus/app/referral.tsx` (190 lines) and `apps/jitplus/app/legal/referral-terms.tsx` (105 lines) are deleted. `terms.tsx` and `privacy.tsx` have large uncommitted reductions (−127 and −132 lines changed). — `git diff --stat HEAD`. The backend `ClientReferral` and `PayoutRequest` models still exist (`schema.prisma:840-899`).

### Inferences
- Shipping action-based entries would need new rules text: how tickets are earned, the no-purchase and no-review-content conditions, and the Apple/Google disclaimer.

### Gaps
- I did not read the full uncommitted diff of `terms.tsx` and `privacy.tsx`, so I cannot say what was removed. The reason for the referral deletion is not documented in the code, and I am not speculating on it.

## Gaps

### Takeaway
The prize machinery (draws, stock, coupons, redemption, push, gating) is reusable. The new work is the action layer: storing review and social targets, a trigger that is not a transaction, proof and verification, per-client limits, and updated legal text.

### Cited Findings
- No `googlePlaceId` or review URL on Merchant or Store, and the autocomplete drops `place_id`. — `schema.prisma:17-200`; `AddressAutocomplete.tsx:37-44`
- Social link taps are not tracked, and there is no model for engagement actions or claims. — `MerchantSocialLinks.tsx:31-36`; schema model list `schema.prisma` (no such model)
- Wheel tickets require a Transaction and are granted only for EARN_STAMPS, REDEEM_REWARD and PURCHASE. — `schema.prisma:977-990`; `lucky-wheel-tickets.ts:43`
- `createFromReward` hardcodes `SCRATCH_CARD` and expects a scratch card, even though `CouponSource.MANUAL` and `LUCKY_WHEEL` exist. — `coupon.service.ts:144-180`; `schema.prisma:1086-1090`
- Wheel prizes are not coupons: they use `LuckyWheelDraw.fulfilment` instead. There are two separate in-store redemption paths, both shown in `ClientWinnings`. — `schema.prisma:996-1023`; `ClientWinnings.tsx:35-36`
- No per-client or per-day caps on rewards beyond HTTP throttles and the per-campaign uniqueness constraints. — `lucky-wheel-client.controller.ts:30-31`; `schema.prisma:990, 1182`
- No `open_review` (or similar) action in push routing. — `notificationRouting.ts:26-52`
- The legal text says wheel tickets come only from loyalty activity. — `fr.ts:662`

### Inferences
- The lowest-friction design that reuses the most code: the merchant enables "review/follow → scratch-style instant win" with prizes defined like `ScratchReward`. The win is issued as a `Coupon` with a new `source`. Staff confirm through the existing scan → transaction screen, or the client scans an in-store HMAC code modelled on `StampCode`.

### Gaps
- No runtime verification was done (no builds or tests run, per instructions). The findings come from reading the uncommitted working tree.
