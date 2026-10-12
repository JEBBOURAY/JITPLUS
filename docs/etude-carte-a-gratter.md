# Étude d'implémentation : Campagne « Carte à gratter »

> Étude technique basée sur l'état actuel du monorepo (`apps/backend`, `apps/jitpluspro`, `apps/jitplus`, `packages/shared`).
> Aucune ligne de code n'a été modifiée. Ce document décrit **comment** intégrer la fonctionnalité en réutilisant l'existant.

---

## 0. Résumé

| Point | Constat | Conséquence |
|---|---|---|
| **Roue de la chance** déjà en place (backend `lucky-wheel/`, Pro `app/lucky-wheel.tsx`, client `LuckyWheelModal`) | Campagnes avec statut, lots pondérés avec stock, tirage serveur (`crypto.randomInt`), décrément conditionnel, `claimBefore`, validation commerçant | C'est le **gabarit** à suivre (structure, gardes, hooks, wizard). On en extrait le tirage pondéré pour le partager. |
| Pas de modèle `Coupon`, pas de code à 6 chiffres, pas de QR de lot | Les lots de la roue sont validés « à la main » depuis une liste | On crée un modèle **`Coupon` générique** (avec `source`), réutilisable plus tard par la roue. |
| Pas de Redis ni de file de tâches ; les crons tournent sur **toutes** les instances Cloud Run | Déduplication par `updateMany` conditionnel + `count === 1` | Envoi programmé et rappels = **cron + réservation atomique**, comme `StampExpiryService`. |
| Push = `FirebaseService.sendMulticast` (Expo + FCM), textes dans `notification-i18n.ts` | Payload `{ event, action, merchantId }` routé par `navigateByAction` côté client | Nouveaux events `scratch_card_received`, `coupon_expiring`, `coupon_redeemed`. |
| `@jitplus/shared` = TS brut, consommé par les deux apps (pas par le backend) ; composants RN importés par chemin direct | Le Dockerfile backend ne copie pas `packages/` | **Partage apps ↔ apps** : types, constantes, textes i18n, design de la carte. Le **backend reste la source de vérité** (Prisma), et un test anti-dérive vérifie que les enums concordent. |
| Animations : client a `react-native-reanimated` ; ni Skia ni gesture-handler nulle part | Le Pro n'a besoin que d'un aperçu statique | Skia + gesture-handler **uniquement dans `jitplus`**. Le design de la carte (face statique) est partagé, le calque à gratter reste propre au client. |

---

## 1. Architecture cible

```
packages/shared/src/scratch/          ← types, constantes, i18n, thèmes de carte, ScratchCardFace (RN)
        │                │
        ▼                ▼
apps/jitpluspro       apps/jitplus
 games → campagnes     push → /scratch/[id] (Skia)
 scan-qr → coupon      Mes coupons (QR + code)
        │                │
        └──────┬─────────┘
               ▼  REST /api/v1/scratch/{merchant|client}/...
apps/backend/src/scratch-card/       ← nouveau module NestJS
  ├─ scratch-merchant.controller.ts  (JwtAuthGuard + MerchantTypeGuard [+ MerchantOwnerGuard, PremiumGuard])
  ├─ scratch-client.controller.ts    (AuthGuard('jwt') + ClientOnlyGuard)
  ├─ scratch-campaign.service.ts     (CRUD, audience, stats)
  ├─ scratch-draw.service.ts         (tirage + stock, Serializable + withRetry)
  ├─ coupon.service.ts               (code, QR HMAC, vérification conditions, utilisation)
  └─ tasks/ scratch-dispatch.service.ts, coupon-reminder.service.ts (crons)
common/utils/weighted-draw.ts        ← extrait de lucky-wheel.service.ts, réutilisé par les deux
```

**Pourquoi un module séparé de la roue ?** La sémantique est différente : la roue s'obtient par un ticket lié à une transaction et on peut perdre. La carte à gratter est envoyée sans condition, on gagne toujours, et le gain est un coupon avec code et conditions. Mélanger les deux alourdirait `LuckyWheelCampaign`. On mutualise en revanche le tirage pondéré, le modèle `Coupon` et les briques UI.

---

## 2. Backend

### 2.1 Modèle de données (Prisma)

Conventions du projet respectées : IDs `uuid`, champs camelCase et `@map` snake_case, tables au pluriel avec `@@map`, `createdAt`/`updatedAt`, commentaires `///`.

```prisma
enum ScratchCampaignStatus { DRAFT SCHEDULED SENDING SENT ENDED CANCELLED }
enum ScratchCardStatus     { PENDING SCRATCHED EXPIRED CANCELLED }
enum CouponRewardType      { PERCENT_DISCOUNT FIXED_DISCOUNT FREE_PRODUCT BONUS_STAMPS }
enum CouponStatus          { ACTIVE REDEEMED EXPIRED CANCELLED }
enum CouponSource          { SCRATCH_CARD LUCKY_WHEEL MANUAL }
enum ScratchAudienceType   { ALL_CLIENTS ACTIVE_SINCE INACTIVE_SINCE MIN_STAMPS NEW_SINCE }

model ScratchCampaign {
  id               String                @id @default(uuid())
  merchantId       String                @map("merchant_id")
  name             String                @db.VarChar(80)
  message          String?               @db.VarChar(200)   /// texte du push / de la carte (modéré)
  designId         String                @default("violet") @map("design_id") /// clé de thème partagée
  status           ScratchCampaignStatus @default(DRAFT)
  audienceType     ScratchAudienceType   @default(ALL_CLIENTS) @map("audience_type")
  audienceValue    Int?                  @map("audience_value") /// nb de jours ou de tampons selon le type
  sendAt           DateTime?             @map("send_at")
  sendingLockedAt  DateTime?             @map("sending_locked_at") /// reprise si une instance meurt
  sentAt           DateTime?             @map("sent_at")
  cancelledAt      DateTime?             @map("cancelled_at")
  cardExpiresAt    DateTime              @map("card_expires_at")   /// date limite pour gratter, choisie par le commerçant
  couponExpiresAt  DateTime              @map("coupon_expires_at") /// date de fin des coupons, choisie par le commerçant
  recipientCount   Int                   @default(0) @map("recipient_count")
  pushSuccessCount Int                   @default(0) @map("push_success_count")
  createdAt        DateTime              @default(now()) @map("created_at")
  updatedAt        DateTime              @updatedAt @map("updated_at")

  merchant Merchant        @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  rewards  ScratchReward[]
  cards    ScratchCard[]

  @@index([merchantId, status])
  @@index([status, sendAt])
  @@map("scratch_campaigns")
}

model ScratchReward {
  id                String           @id @default(uuid())
  campaignId        String           @map("campaign_id")
  type              CouponRewardType
  label             String           @db.VarChar(80)       /// "Café offert", "-20 %"
  value             Float?                                  /// % / MAD / nb de tampons
  maxDiscount       Float?           @map("max_discount")   /// plafond pour un %
  rewardId          String?          @map("reward_id")      /// lien optionnel vers le catalogue Reward
  weight            Int                                     /// poids relatif (1..1000)
  totalStock        Int?             @map("total_stock")    /// null = illimité
  remaining         Int?
  // Conditions d'utilisation du coupon
  minPurchaseAmount Float?           @map("min_purchase_amount")
  minDelayHours     Int              @default(0) @map("min_delay_hours") /// "prochain passage"
  allowedWeekdays   Int?             @map("allowed_weekdays")   /// bitmask lun=1..dim=64
  allowedFromMin    Int?             @map("allowed_from_min")   /// minutes depuis 00:00, heure du Maroc
  allowedToMin      Int?             @map("allowed_to_min")
  createdAt         DateTime         @default(now()) @map("created_at")

  campaign ScratchCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  reward   Reward?         @relation(fields: [rewardId], references: [id], onDelete: SetNull)
  cards    ScratchCard[]

  @@index([campaignId])
  @@map("scratch_rewards")
}

model ScratchCard {
  id          String            @id @default(uuid())
  campaignId  String            @map("campaign_id")
  clientId    String            @map("client_id")
  merchantId  String            @map("merchant_id")   /// dénormalisé pour le scoping
  rewardId    String?           @map("reward_id")     /// rempli au grattage
  status      ScratchCardStatus @default(PENDING)
  pushSentAt  DateTime?         @map("push_sent_at")  /// idempotence de l'envoi
  openedAt    DateTime?         @map("opened_at")
  scratchedAt DateTime?         @map("scratched_at")
  expiresAt   DateTime          @map("expires_at")
  reminderSentAt DateTime?      @map("reminder_sent_at")
  createdAt   DateTime          @default(now()) @map("created_at")

  campaign ScratchCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  client   Client          @relation(fields: [clientId], references: [id], onDelete: Cascade)
  reward   ScratchReward?  @relation(fields: [rewardId], references: [id])
  coupon   Coupon?

  @@unique([campaignId, clientId])          /// 1 carte par client et par campagne
  @@index([clientId, status])
  @@index([status, expiresAt])
  @@map("scratch_cards")
}

model Coupon {
  id             String           @id @default(uuid())
  source         CouponSource     @default(SCRATCH_CARD)
  scratchCardId  String?          @unique @map("scratch_card_id")
  luckyWheelDrawId String?        @unique @map("lucky_wheel_draw_id") /// phase 4 (section 2.9)
  clientId       String           @map("client_id")
  merchantId     String           @map("merchant_id")
  code           String           @db.Char(6)
  // Snapshot de la récompense : modifier la campagne ne change pas un coupon déjà gagné
  type           CouponRewardType
  label          String           @db.VarChar(80)
  value          Float?
  maxDiscount    Float?           @map("max_discount")
  conditions     Json             /// { minPurchaseAmount, allowedWeekdays, allowedFromMin, allowedToMin }
  status         CouponStatus     @default(ACTIVE)
  validFrom      DateTime         @map("valid_from")
  expiresAt      DateTime         @map("expires_at")
  reminderSentAt DateTime?        @map("reminder_sent_at")
  redeemedAt     DateTime?        @map("redeemed_at")
  redeemedBy     String?          @map("redeemed_by")      /// merchantId ou teamMemberId
  cancelledAt    DateTime?        @map("cancelled_at")     /// annulation de la campagne par le commerçant
  purchaseAmount Float?           @map("purchase_amount")
  discountAmount Float?           @map("discount_amount")
  redeemTransactionId String?     @unique @map("redeem_transaction_id") /// COUPON_REDEEM
  earnTransactionId   String?     @unique @map("earn_transaction_id")   /// EARN_STAMPS de l'achat
  createdAt      DateTime         @default(now()) @map("created_at")

  scratchCard ScratchCard? @relation(fields: [scratchCardId], references: [id])
  client      Client       @relation(fields: [clientId], references: [id], onDelete: Cascade)
  merchant    Merchant     @relation(fields: [merchantId], references: [id], onDelete: Cascade)

  @@index([clientId, status])
  @@index([merchantId, status])
  @@index([status, expiresAt])
  @@map("coupons")
}
```

**Migration** `prisma/migrations/2026XXXXXXXXXX_scratch_cards/migration.sql`, avec deux ajouts en SQL brut, comme pour la clé d'idempotence des transactions :

```sql
-- Code à 6 chiffres unique parmi les coupons ACTIFS d'un commerçant (le code est recyclable ensuite)
CREATE UNIQUE INDEX coupons_merchant_code_active
  ON coupons (merchant_id, code) WHERE status = 'ACTIVE';

-- Nouveaux types pour l'historique et l'audit
ALTER TYPE "TransactionType" ADD VALUE 'COUPON_REDEEM';
ALTER TYPE "AuditAction" ADD VALUE 'CREATE_SCRATCH_CAMPAIGN';
ALTER TYPE "AuditAction" ADD VALUE 'REDEEM_COUPON';
ALTER TYPE "AuditAction" ADD VALUE 'CANCEL_SCRATCH_CAMPAIGN';
```

> Un `switch` sur `TransactionType` existe côté apps : `constants/transactions.ts` dans le Pro, et l'historique dans le client. Il faut y ajouter `COUPON_REDEEM`. Sinon les anciennes versions afficheront un libellé par défaut.

### 2.2 Tirage de la récompense et stock en concurrence

**Moment du tirage : au grattage, pas à l'envoi.** Si l'on tirait à l'envoi, les clients qui ne grattent jamais immobiliseraient le stock. Le tirage se fait au premier toucher : l'app appelle `POST /scratch/client/cards/:id/scratch` et reçoit le résultat avant l'animation. L'animation ne fait que révéler un résultat déjà enregistré en base.

Pseudo-code (`scratch-draw.service.ts`), sur le modèle de `LuckyWheelService.triggerDraw` :

```ts
return withRetry(() => this.prisma.$transaction(async (tx) => {
  // 1. Réservation atomique de la carte (idempotence + anti double-tirage)
  const claimed = await tx.scratchCard.updateMany({
    where: { id: cardId, clientId, status: 'PENDING', expiresAt: { gt: now } },
    data:  { status: 'SCRATCHED', scratchedAt: now, openedAt: now },
  });
  if (claimed.count !== 1) {
    // Déjà grattée → renvoyer le coupon existant (double tap / retry réseau)
    const existing = await tx.coupon.findUnique({ where: { scratchCardId: cardId } });
    if (existing && existing.clientId === clientId) return existing;
    throw new NotFoundException();          // 404 : ne pas révéler l'existence
  }

  // 2. Tirage pondéré parmi les lots encore en stock, avec repli
  let candidates = await tx.scratchReward.findMany({ where: { campaignId } });
  for (;;) {
    const pick = weightedDraw(candidates.filter(r => r.remaining === null || r.remaining > 0));
    if (pick.remaining === null) break;                      // illimité
    const dec = await tx.scratchReward.updateMany({
      where: { id: pick.id, remaining: { gt: 0 } },
      data:  { remaining: { decrement: 1 } },
    });
    if (dec.count === 1) break;                              // stock réservé
    candidates = candidates.filter(r => r.id !== pick.id);   // épuisé entre-temps
  }

  // 3. Création du coupon (snapshot + code unique, retry sur P2002)
  return this.couponService.createFromReward(tx, card, pick, now);
}, { isolationLevel: 'Serializable' }));
```

**Règle « on gagne toujours ».** À l'activation, le serveur refuse une campagne qui n'a pas au moins **un lot à stock illimité**, par exemple « 5 tampons bonus » ou « -10 % ». Sans ce lot de repli, le stock pourrait s'épuiser et la promesse ne tiendrait plus. L'UI Pro l'impose d'office : le premier lot, le « lot assuré », est toujours illimité.

**Probabilités.** Une probabilité vaut `poids / Σ poids`. Quand un lot limité s'épuise, son poids se répartit sur les autres lots. L'aperçu Pro affiche le **nombre attendu** de chaque lot (`destinataires × p`) et avertit si `stock < attendu` (« ⚠ Le stock de Café offert sera épuisé vers la 40ᵉ carte »).

**Aléa.** On utilise `crypto.randomInt` et non `Math.random`, comme dans la roue. On extrait `weightedDraw(items)` dans `common/utils/weighted-draw.ts` et on le teste unitairement, avec une vérification statistique de la distribution.

### 2.3 Envoi des cartes et notifications push

Il n'y a ni file de tâches ni Redis, et les crons tournent sur toutes les instances. On garde donc un **chemin unique : le cron de dispatch**.

- « Envoyer maintenant » passe la campagne en `sendAt = now()` et `status = SENDING`, puis lance le dispatch immédiatement (voir section 9).
- `ScratchDispatchService`, `@Cron('* * * * *')`, `isCronAllowed()` :
  1. **Réservation multi-instance** : `updateMany({ where: { id, status: 'SCHEDULED', sendAt: { lte: now } }, data: { status: 'SENDING', sendingLockedAt: now } })` puis vérification de `count === 1`. Les campagnes restées `SENDING` avec un verrou de plus de 10 minutes sont reprises. **Entre chaque lot de 500**, la boucle relit le statut et s'arrête si la campagne a été annulée entre-temps (section 2.6, « Annulation »).
  2. **Vérification du plan** : `planService.isPremium(merchantId)` est recontrôlé au moment de l'envoi. Si l'abonnement a expiré entre la programmation et l'envoi, la campagne repasse en `DRAFT`, et le commerçant reçoit un push « Campagne non envoyée : abonnement Premium expiré ».
  3. **Calcul de l'audience** : cartes de fidélité actives (`deactivatedAt: null`) du commerçant, client non supprimé (`deletedAt: null`), **non bloqué** (`ClientMerchantBlock`), filtrés par `audienceType`. **Les clients fantômes (`isAnonymous`) sont inclus** (section 2.8).
  4. `scratchCard.createMany({ skipDuplicates: true })` par lots de 500, grâce à la contrainte d'unicité `(campaignId, clientId)`.
  5. **Push par lots** : réservation `updateMany({ where: { id: { in: ids }, pushSentAt: null } })`, puis `sendMulticast(tokens, title, body, logoUrl, data, 'jit-marketing')`. Seuls les clients avec `pushToken` et `notifPush = true` reçoivent un push. Les autres voient quand même la carte dans l'app. On ajoute aussi une entrée `Notification` et `ClientNotificationStatus` pour le fil in-app, comme le fait `sendToClient`.
  6. Passage en `SENT`, avec mise à jour de `recipientCount` et `pushSuccessCount`.
- Payload : `{ event: 'scratch_card_received', action: 'open_scratch', cardId, merchantId }`.
- Textes dans `common/utils/notification-i18n.ts` (fr, en, ar), selon `client.language` : `scratchReceivedTitle(merchantName)`, `scratchReceivedBody()`, `couponExpiringTitle()`, et ainsi de suite.
- Le message libre du commerçant passe par `detectProhibitedContent`, comme pour `sendToAll`.

**Heures calmes.** `isCronAllowed` bloque les envois de 21 h à 9 h et le vendredi de 11 h 30 à 14 h. L'UI Pro ne propose donc que des créneaux autorisés et prévient que l'envoi sera décalé à 9 h si nécessaire.

**Fuseau horaire, point à vérifier.** `cron-utils.ts` code le fuseau en dur à `UTC+1`. Or le Maroc repasse à UTC+0 pendant le Ramadan. Pour les conditions horaires des coupons, il faut utiliser `Intl` avec `timeZone: 'Africa/Casablanca'`, comme le fait déjà `stamp-expiry.service.ts`, et non un décalage fixe.

**Garde-fous anti-spam.** Un plafond par plan limite l'envoi à 4 campagnes par période de 30 jours (`SCRATCH_MAX_CAMPAIGNS_PER_30_DAYS`). Le plafond par client initialement prévu (une carte par commerçant tous les 7 jours, les clients déjà servis étant exclus de l'audience) a été retiré : il bloquait les relances et rendait l'erreur « aucun client ne correspond à ce ciblage » incompréhensible. Si les plaintes des clients apparaissent, on pourra le réintroduire, par exemple en le rendant configurable.

### 2.4 Coupons : code, QR et vérification des conditions

**Code à 6 chiffres.**
- Il est tiré avec `randomInt(0, 1_000_000)` et complété par des zéros à gauche.
- Il est unique par commerçant parmi les coupons actifs, grâce à l'index partiel. En cas de `P2002`, on retire un nouveau code.
- Il n'a de sens que **chez ce commerçant** : un code n'est jamais cherché globalement.

**QR.** Le QR encode `jitplus://coupon/c1.<base64url(couponId)>.<HMAC-SHA256(secret, "c1:"+couponId)>`. C'est le même schéma que le QR client v1, avec une **séparation de domaine** (préfixe `c1:`) et idéalement un secret dédié `COUPON_HMAC_SECRET`, à ajouter à la validation Joi de l'environnement. La comparaison se fait avec `timingSafeEqual`.

**Vérification en deux temps.** Ce découpage permet d'afficher les conditions avant de demander le montant :

1. `POST /scratch/merchant/coupons/check { token } | { code }`
   - Recherche limitée à `merchantId = user.userId`. Si rien n'est trouvé, on renvoie un **404** générique.
   - Réponse : `{ coupon, client: { prenom, nom }, checks: [...] }`. Exemple : `checks = [{ key: 'dates', ok: true }, { key: 'weekday', ok: false, detail: { allowed: [2,3] } }, { key: 'hours', ok: true }, { key: 'minPurchase', ok: null, detail: { min: 100 } }]`, où `null` signifie que le montant est requis.
   - Afficher le **nom du client** permet au caissier de déjouer un code partagé ou deviné.
2. `POST /scratch/merchant/coupons/:id/redeem { purchaseAmount }`, avec l'en-tête `Idempotency-Key` comme pour les transactions. **Une seule opération atomique** valide le coupon et crédite les tampons de l'achat (décision validée : un achat avec coupon rapporte des tampons) :
   - transaction `Serializable` et `withRetry` ;
   - **réévaluation complète** des conditions côté serveur (on ne fait jamais confiance au résultat de `check`) ;
   - défense en profondeur : le client ne doit pas être fantôme (`isAnonymous = false`) ;
   - réservation atomique : `updateMany({ where: { id, merchantId, status: 'ACTIVE', validFrom: { lte: now }, expiresAt: { gt: now } }, data: { status: 'REDEEMED', ... } })` puis vérification de `count === 1`, ce qui garantit l'**usage unique** même si deux caisses valident en même temps ;
   - calcul de la remise : `discountAmount` (avec le plafond `maxDiscount`), puis `paidAmount = purchaseAmount − discountAmount` ;
   - **tampons de l'achat** : si `purchaseAmount > 0`, création d'une transaction `EARN_STAMPS` avec **exactement les mêmes règles** que `createTransaction` : `PER_VISIT` donne 1 tampon, `PER_AMOUNT` applique `computeEarnedStamps` au **montant réellement payé (après remise)**, avec le plafond `MAX_STAMPS_PER_TX`, l'`accumulationLimit`, la mise à jour de `lastVisitAt` et la remise à zéro d'`expiryReminderSentAt`, ainsi que la génération des tickets de la roue si une campagne est active ;
   - **tampons bonus** (coupon `BONUS_STAMPS`) : transaction séparée `COUPON_REDEEM` avec `stamps = value`, pour que l'historique distingue le bonus des tampons gagnés par l'achat. Les autres types de coupon donnent une `COUPON_REDEEM` avec `stamps = 0` et `note = libellé` ;
   - les deux transactions partagent `teamMemberId` et `performedByName`, et sont reliées au coupon (`redeemTransactionId`, `earnTransactionId`). Une entrée `AuditLog` est créée ;
   - après le commit : **une seule notification push** combinée (« Coupon -20 % utilisé · +2 tampons chez Café Atlas ») au lieu de deux, ainsi que `emitCouponRedeemed` et `emitStampsUpdated` sur la room `client:<id>`. L'écran du client passe alors en « Utilisé ✓ » en direct.

   **Refactorisation nécessaire.** La logique de gain de tampons est aujourd'hui dans `MerchantTransactionService.createTransaction` (lignes 45 à 376), dans sa propre transaction. Il faut en extraire une méthode interne `earnStampsInTx(tx, { merchant, clientId, amount, actor })`, appelée à la fois par `createTransaction` et par `redeem`. Cela évite de dupliquer des règles sensibles. Comme aucun test ne couvre aujourd'hui `merchant-transaction.service`, il faut **écrire des tests de non-régression avant** cette extraction.

   **Montant saisi.** Le caissier saisit le **total du ticket avant remise**. Le serveur calcule la remise et le montant payé. `purchaseAmount` est obligatoire en mode `PER_AMOUNT` ou si le coupon a un minimum d'achat. En mode `PER_VISIT`, il peut valoir 0 si le client vient seulement chercher son produit offert, et dans ce cas aucun tampon n'est crédité.

**Dates d'expiration, programmées par le commerçant (décision validée).**
- Le commerçant choisit **deux dates** dans l'assistant :
  - `cardExpiresAt` : date limite pour gratter la carte ;
  - `couponExpiresAt` : date de fin d'utilisation des coupons gagnés.
- Ces dates sont les **mêmes pour tous les destinataires**, clients fantômes compris (décision validée : pas de délai rallongé).
- Interprétation : fin de journée, 23 h 59 min 59 s en heure du Maroc (`Africa/Casablanca`), stockée en UTC. Le commerçant choisit un jour, pas une heure.
- Contrainte : `couponExpiresAt ≥ cardExpiresAt + 1 jour`. Un client qui gratte le dernier jour doit encore pouvoir passer en boutique. Valeurs par défaut proposées dans l'assistant : carte = envoi + 7 jours, coupon = carte + 7 jours. Si l'écart est inférieur à 3 jours, l'interface affiche un avertissement.
- Au grattage, le coupon copie `expiresAt = campaign.couponExpiresAt` et `validFrom = scratchedAt + minDelayHours`. Si `validFrom` dépasse `expiresAt`, on ramène `validFrom` à `scratchedAt`.
- **Après l'envoi, les dates peuvent seulement être prolongées**, jamais raccourcies, car ce serait retirer une promesse faite au client. La route `PATCH /campaigns/:id/dates` :
  - fait un `updateMany` sur les cartes `PENDING` et les coupons `ACTIVE` de la campagne ;
  - remet `reminderSentAt` à `null`, pour que le rappel reparte sur la nouvelle date ;
  - envoie éventuellement le push « Bonne nouvelle : votre coupon chez Café Atlas est prolongé jusqu'au JJ/MM ».

**Évaluation des conditions.** On crée une fonction pure `evaluateCouponConditions(coupon, now, purchaseAmount?)` dans le backend. Les jours et les heures sont calculés en heure du Maroc. Un intervalle qui passe minuit (par exemple de 22 h à 2 h) doit être géré.

**Réduction.** JitPlus n'encaisse pas : le caissier applique la remise lui-même. On enregistre tout de même `purchaseAmount` et `discountAmount`, ce dernier calculé avec le plafond `maxDiscount`. Ces montants alimentent les statistiques, notamment le chiffre d'affaires généré.

### 2.5 Rappels avant expiration

`CouponReminderService` tourne à `0 10 * * *` avec `isCronAllowed`, en copiant le modèle de `StampExpiryService` :
- **Coupons** `ACTIVE` qui expirent dans 48 h ou moins, avec `reminderSentAt = null` : réservation par `updateMany`, puis push `coupon_expiring` (`action: 'open_coupon'`, `couponId`).
- **Cartes non grattées** `PENDING` qui expirent dans 24 h ou moins : push « Votre carte à gratter expire demain ».
- **Expiration** : passage des statuts à `EXPIRED` (`coupons` et `scratch_cards`) par `updateMany`. Les lectures restent tolérantes et considèrent `expiresAt < now` comme expiré même avant le passage du cron, comme `getPendingPrizes` le fait aujourd'hui.

On reste sur des rappels **côté serveur uniquement**, sans notifications locales. C'est cohérent avec l'existant : un seul point de vérité, et ni doublon ni rappel pour un coupon déjà utilisé.

### 2.6 API

Préfixe global `api/v1`. **Toutes** les requêtes filtrent par `merchantId: user.userId` ou `clientId: user.userId`. Une ressource d'un autre utilisateur renvoie **404**, pas 403, pour éviter l'énumération. Les jetons d'équipe portent `sub` = l'identifiant du commerçant propriétaire, donc `user.userId` reste correct.

**Commerçant** : `@Controller('scratch/merchant')`, avec `@UseGuards(JwtAuthGuard, MerchantTypeGuard)`.

| Méthode | Route | Gardes en plus | Rôle |
|---|---|---|---|
| GET | `/campaigns` | | Liste et compteurs (lecture seule autorisée même après expiration de l'abonnement) |
| GET | `/campaigns/:id` | | Détail et récompenses |
| POST | `/campaigns` | `MerchantOwnerGuard`, `PremiumGuard` | Création en `DRAFT` |
| PATCH | `/campaigns/:id` | Owner, Premium | Modifiable seulement en `DRAFT` ou `SCHEDULED` |
| POST | `/campaigns/:id/schedule` | Owner, Premium | `{ sendAt }` ou maintenant ; validations (lot illimité, dates, quotas) |
| PATCH | `/campaigns/:id/status` | Owner (sans Premium) | `{ status: 'CANCELLED' }` : annulation à tout moment (voir ci-dessous) |
| GET | `/campaigns/:id/cancel-preview` | Owner | `{ pendingCards, activeCoupons, redeemedCoupons }` pour la confirmation |
| PATCH | `/campaigns/:id/dates` | Owner, Premium | `{ cardExpiresAt?, couponExpiresAt? }` : prolongation uniquement après l'envoi |
| DELETE | `/campaigns/:id` | Owner | `DRAFT` uniquement |
| POST | `/audience/estimate` | Owner, Premium | `{ audienceType, audienceValue }` → `{ total, reachableByPush, withoutApp }` |
| GET | `/campaigns/:id/stats` | | Entonnoir et répartition des lots |
| GET | `/campaigns/:id/clients-without-app` | Owner | Clients fantômes ciblés et état de leur carte (section 2.8) |
| POST | `/coupons/check` | `@Throttle` 10/min, **sans** Premium | `{ token }` ou `{ code }` |
| POST | `/coupons/:id/redeem` | `@Throttle` 30/min, **sans** Premium | `{ purchaseAmount }` avec `Idempotency-Key` → coupon et tampons crédités |
| GET | `/coupons?status=` | | Historique des coupons utilisés |

Les membres d'équipe peuvent **valider** des coupons, mais pas créer de campagnes.

**Annulation d'une campagne (décision validée).** Le commerçant propriétaire peut annuler une campagne **à tout moment**, y compris après l'envoi. L'annulation n'est pas soumise à `PremiumGuard` : un commerçant dont l'abonnement a expiré doit pouvoir arrêter une campagne programmée.

| Statut au moment de l'annulation | Effet |
|---|---|
| `DRAFT` | Supprimer suffit (`DELETE`) ; l'annulation est aussi acceptée |
| `SCHEDULED` | Passage en `CANCELLED` ; aucune carte n'avait été créée |
| `SENDING` | Passage en `CANCELLED` ; la boucle d'envoi s'arrête au lot suivant, et les cartes déjà créées sont traitées comme ci-dessous |
| `SENT` | **Rien ne reste valable** : cartes non grattées **et** coupons déjà gagnés mais pas encore utilisés passent en `CANCELLED` (détail ci-dessous). Seuls les coupons **déjà utilisés** restent `REDEEMED`, car la remise a déjà été accordée en caisse et l'historique ne doit pas être réécrit |

**Annulation totale (décision validée : aucune carte ni aucun coupon ne reste valable après l'annulation, même s'il a déjà été gagné).** Tout se fait dans **une seule transaction `Serializable`** avec `withRetry` :
```ts
await tx.scratchCampaign.update({ where: { id, merchantId }, data: { status: 'CANCELLED', cancelledAt: now } });
const cards   = await tx.scratchCard.updateMany({
  where: { campaignId: id, status: 'PENDING' },  data: { status: 'CANCELLED' } });
const coupons = await tx.coupon.updateMany({
  where: { scratchCard: { campaignId: id }, status: 'ACTIVE' },
  data:  { status: 'CANCELLED', cancelledAt: now } });
```
- **Situations de concurrence.** Toutes les opérations sont des `updateMany` conditionnels en `Serializable`, donc il n'y a pas d'état incohérent :
  - le client gratte **pendant** l'annulation : si le grattage est validé en premier, le coupon créé est annulé immédiatement par l'annulation ; si l'annulation est validée en premier, `POST /scratch` répond `410 Gone`. Le tirage vérifie aussi `campaign.status !== 'CANCELLED'` dans sa transaction ;
  - la caisse valide un coupon **pendant** l'annulation : si la validation passe en premier, le coupon reste `REDEEMED` (la remise est déjà accordée) ; sinon, `redeem` est refusé avec « Coupon annulé par le commerçant ».
- **Vérification en caisse.** `check` et `redeem` renvoient un état explicite `CANCELLED` (« Ce coupon a été annulé par le commerçant le JJ/MM »), pour que le caissier puisse l'expliquer au client. Le QR mis en cache sur le téléphone du client n'a plus de valeur, car c'est le serveur qui décide.
- **Information des clients (recommandé).** Comme on retire un gain déjà obtenu, le silence risque de provoquer un conflit en boutique : le client viendra avec un coupon qu'il croit valable.
  - **Clients qui avaient un coupon actif** : push neutre, envoyé une seule fois (réservation par `CampaignSentTracker`) : « Café Atlas a mis fin à son offre carte à gratter. Votre coupon -20 % n'est plus valable. » L'entrée apparaît aussi dans le fil de notifications in-app.
  - **Clients avec une carte non grattée** : pas de push. La carte disparaît simplement de l'accueil, et la notification in-app d'origine est masquée (`isDismissed`).
  - L'événement WebSocket `coupon_cancelled` met à jour « Mes coupons » en direct.
- **Règlement.** Le règlement affiché dans l'app (section 6) doit **annoncer clairement cette règle** : « Le commerçant peut mettre fin à la campagne à tout moment ; les cartes et coupons non utilisés sont alors annulés. » Le client est ainsi informé à l'avance, ce qui limite le risque de contestation (voir la section 6, « Conformité »).
- **Statistiques.** Nombre de cartes annulées et de coupons annulés, ainsi que la date d'annulation.
- L'annulation est **définitive**. Pour relancer, le commerçant duplique la campagne (bouton « Dupliquer » dans le détail, qui crée un brouillon avec les mêmes lots et le même ciblage).
- Une entrée `AuditLog` est créée (nouvelle valeur `CANCEL_SCRATCH_CAMPAIGN`, à ajouter à la migration).

**Boutiques (décision validée) : aucune restriction pour l'instant.** Un coupon est valable dans **toutes les boutiques** du commerçant. Le modèle permettra d'ajouter plus tard un champ `allowedStoreIds String[]` sur `ScratchReward`, ainsi qu'une vérification `store` dans `evaluateCouponConditions`, sans casser l'existant.

**Plan Premium uniquement (décision validée).**
- `PremiumGuard` s'applique à **toutes** les routes de gestion des campagnes : création, modification, programmation, estimation d'audience et liste.
- Les routes `coupons/check` et `coupons/:id/redeem` ne sont **pas** soumises à `PremiumGuard`. Si l'abonnement expire, les coupons déjà gagnés par les clients restent honorés jusqu'à leur date de fin. Ne pas les honorer serait une promesse non tenue envers le client final. La seule façon de les invalider est une **annulation explicite** de la campagne par le commerçant (voir « Annulation » ci-dessus).
- Après expiration, la consultation des statistiques des anciennes campagnes reste possible en lecture seule. C'est un argument de réabonnement.
- L'erreur renvoyée doit être identique à celle de la roue, pour que `handlePremiumError` côté Pro l'affiche sans code supplémentaire.

**Client** : `@Controller('scratch/client')`, avec `@UseGuards(AuthGuard('jwt'), ClientOnlyGuard)`.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/cards?status=PENDING` | Cartes à gratter (badge sur l'accueil) |
| GET | `/cards/:id` | Design et commerçant, **sans** lots, poids ni stock |
| POST | `/cards/:id/open` | Marque l'ouverture (statistiques) |
| POST | `/cards/:id/scratch` | Tirage idempotent → coupon (`@Throttle` 5/min) |
| GET | `/coupons?status=active\|used\|expired&merchantId=` | « Mes coupons » |
| GET | `/coupons/:id` | Détail, `qrToken` et `code` |

Les DTO utilisent `class-validator` avec des messages en français, comme le reste. Bornes conseillées :
- 2 à 8 lots, poids entre 1 et 1000 ;
- `value` entre 1 et 100 pour un pourcentage, et au maximum `MAX_STAMPS_PER_TX` (20) pour des tampons bonus ;
- `cardExpiresAt` entre 1 et 60 jours après l'envoi ;
- `couponExpiresAt` au moins 1 jour après `cardExpiresAt`, et au plus 120 jours après l'envoi (section 2.4, « Dates d'expiration »).

### 2.7 Statistiques par campagne

L'endpoint de statistiques fait des `groupBy` et des `count`. On peut aussi dénormaliser des compteurs plus tard si le volume l'exige.
- **Entonnoir** : envoyées → push délivrés (`pushSuccessCount`) → ouvertes (`openedAt`) → grattées → coupons utilisés.
- **Par lot** : gagnés, utilisés, stock restant, taux d'utilisation.
- **Économie** : CA associé (`Σ purchaseAmount`), remise accordée (`Σ discountAmount`), tampons bonus crédités.
- **Retour en boutique** : nombre de clients ayant utilisé un coupon, et délai moyen entre grattage et utilisation.

### 2.8 Clients fantômes (créés par « Ajout rapide », sans l'application)

**Décision validée :** ils **reçoivent** la carte, mais doivent **installer l'application** pour la gratter et utiliser le coupon.

**Comment fonctionne un client fantôme aujourd'hui** (`merchant/services/client-claim.service.ts`) :
- Le commerçant crée un `Client` avec `isAnonymous = true` et partage un **lien de récupération** par WhatsApp (`/d/claim?token=...`, jeton haché dans `ClientClaim`, sans expiration pratique). Le contrôleur `merchant-quick-add` permet de renvoyer le lien.
- Quand le client installe l'application et ouvre le lien, `consumeClaim` **fusionne** le compte fantôme dans son **compte réel** : les cartes de fidélité sont additionnées ou réattribuées, `transactions` et `luckyWheelTickets` sont réattribués, puis le compte fantôme est **supprimé logiquement** (`deletedAt`). L'identifiant du client change donc.

**Conséquences pour la carte à gratter :**
1. **Envoi.** La `ScratchCard` est créée pour le client fantôme comme pour les autres, mais sans push, puisqu'il n'a pas de jeton. Elle attend en `PENDING` jusqu'à `expiresAt`.
2. **Fusion, modification obligatoire de `consumeClaim`.** À l'étape 2, « réattribuer les clés étrangères », il faut ajouter :
   ```ts
   // Une carte par client et par campagne : si le compte réel a déjà une carte pour la même
   // campagne (il était aussi client du commerçant), on annule la carte du compte fantôme.
   const realCampaignIds = (await tx.scratchCard.findMany({
     where: { clientId: realClientId }, select: { campaignId: true },
   })).map(c => c.campaignId);
   await tx.scratchCard.updateMany({
     where: { clientId: anonymousId, campaignId: { in: realCampaignIds } },
     data:  { status: 'CANCELLED' },
   });
   await tx.scratchCard.updateMany({
     where: { clientId: anonymousId, campaignId: { notIn: realCampaignIds } },
     data:  { clientId: realClientId },
   });
   await tx.coupon.updateMany({ where: { clientId: anonymousId }, data: { clientId: realClientId } });
   ```
   Sans cela, la carte reste attachée au compte fantôme supprimé et le client ne la voit jamais. La suppression logique ne déclenche pas le `onDelete: Cascade`. La carte annulée n'avait pas encore été tirée, donc le stock n'est pas touché. La mise à jour des coupons est défensive, car un fantôme ne peut pas gratter.
3. **Après la fusion.** `consumeClaim` renvoie déjà `merchant`. On y ajoute `pendingScratchCards: number`, et l'écran `app/claim.tsx` du client affiche « 🎁 Une carte à gratter vous attend » avec un bouton vers `/scratch/[id]`.
4. **Utilisation.** Le tirage exige une session client (`ClientOnlyGuard`), ce qui exclut naturellement les fantômes. Il n'existe donc jamais de coupon pour un fantôme. `redeem` vérifie quand même `isAnonymous = false`.
5. **Commerçant.**
   - L'estimation d'audience renvoie `{ total, reachableByPush, withoutApp }`. L'assistant affiche « 312 clients · 241 notifiés · **38 sans l'application** (ils verront la carte s'ils l'installent avant le JJ/MM) ».
   - Après l'envoi, l'écran de la campagne propose une liste « Clients sans l'application ». Chaque ligne a un bouton **« Envoyer sur WhatsApp »** qui réutilise le renvoi du lien existant, avec un message prérempli : « Salam {prénom} 🎁 Café Atlas vous a envoyé une carte à gratter ! Installez JitPlus et récupérez-la ici : {lien} ». Le commerçant utilise son propre WhatsApp, comme pour l'ajout rapide : pas de coût Twilio, pas de quota consommé.
6. **Statistiques.** Nouvel indicateur : « **Clients devenus utilisateurs** grâce à la campagne », c'est-à-dire les cartes fusionnées depuis un compte fantôme pendant la campagne. C'est un argument fort pour la valeur de la fonctionnalité.
7. **Délai (décision validée).** Les clients fantômes ont les **mêmes dates** que les autres : `cardExpiresAt` et `couponExpiresAt`, choisies par le commerçant. L'assistant rappelle simplement : « 38 clients n'ont pas l'application : relancez-les sur WhatsApp avant le JJ/MM ».

### 2.9 Roue de la chance → coupons génériques (phase 4, décision validée)

**Objectif :** les lots gagnés à la roue deviennent des `Coupon` (`source: LUCKY_WHEEL`), avec le même QR, le même code à 6 chiffres, le même écran « Mes coupons » et la même validation en caisse, tampons de l'achat compris. On aura ainsi un **seul portefeuille de coupons** pour le client et un **seul flux de validation** pour le commerçant.

**Backend :**
1. **Type de lot.** `LuckyWheelPrize` n'a qu'un `label` et une `description`. On lui ajoute les mêmes champs optionnels que `ScratchReward` : `type` (par défaut `FREE_PRODUCT`), `value`, `maxDiscount` et les conditions. Les lots existants restent en `FREE_PRODUCT`, ce qui ne change rien pour eux.
2. **Au tirage gagnant** (`LuckyWheelService.triggerDraw`) : dans la même transaction, création d'un `Coupon` avec `luckyWheelDrawId`, `expiresAt = claimBefore` (ou `campaign.endsAt` si `claimWindowHours` est vide), et la création de code partagée avec la carte à gratter (`couponService.createFromReward`).
3. **Validation unifiée.** `coupon.redeem` met aussi à jour `LuckyWheelDraw.fulfilment = 'CLAIMED'`, ainsi que `fulfilledAt` et `fulfilledBy`. L'ancienne route `POST /lucky-wheel/merchant/fulfil { drawId }` est **conservée** pour les anciennes versions du Pro : elle appelle `redeem` sans montant, donc sans tampons, comme aujourd'hui.
4. **Reprise de l'existant.** Un script de données `scripts/backfill-lucky-wheel-coupons.ts`, sur le modèle des scripts de la migration « tampons uniquement » (simulation par défaut, `--apply` pour écrire), crée un coupon pour chaque `LuckyWheelDraw` `WON` + `PENDING` encore valide.
5. **Expiration.** Le cron des coupons (section 2.5) gère aussi les lots de la roue : rappel 48 h avant la fin, puis passage en `EXPIRED` avec synchronisation de `fulfilment = 'EXPIRED'`. Cela remplace l'expiration paresseuse de `getPendingPrizes`, et **les clients reçoivent enfin un rappel** avant de perdre un lot gagné, ce qui n'existe pas aujourd'hui.

**Apps :**
- Client : après un gain, `LuckyWheelModal` affiche « Voir mon coupon » vers `/coupons/[id]`. Les lots de la roue apparaissent dans « Mes coupons », avec un badge « Roue de la chance ».
- Pro : le QR et le code fonctionnent sans changement côté scan. La liste « Lots à remettre » de `lucky-wheel.tsx` reste disponible et son bouton ouvre `coupon-validate`.

**Effort estimé :** 4 à 5 jours, après la phase 3.

---

## 3. Code partagé (`packages/shared`)

### 3.1 Ce que la structure permet aujourd'hui

- `@jitplus/shared` est du **TS brut** (`main: ./src/index.ts`), consommé par `jitplus`, `jitpluspro` et `admin` via `workspace:*`.
- `index.ts` ne réexporte **que du TS pur**. Les composants RN s'importent par chemin direct (`@jitplus/shared/src/...`). Les `peerDependencies` incluent déjà `react-native`.
- Le **backend ne l'importe pas**. Le Dockerfile ne copie que `apps/backend`, et l'étape `deps` est autonome. Le brancher demanderait de revoir le Dockerfile et le `rootDir` de tsc, ce qui casserait `node dist/main`. **Ce n'est pas recommandé pour cette fonctionnalité.**

### 3.2 Arborescence proposée

```
packages/shared/src/scratch/
  types.ts        (pur, réexporté)  ScratchRewardType, CouponStatus, ScratchCardStatus,
                                    ScratchCampaignStatus, ScratchAudienceType,
                                    CouponDto, ScratchCardDto, ScratchCampaignDto, CouponCheck
  constants.ts    (pur, réexporté)  COUPON_CODE_LENGTH = 6, COUPON_QR_PREFIX = 'jitplus://coupon/',
                                    MAX_REWARDS = 8, WEEKDAY_BITS, limites des DTO
  format.ts       (pur, réexporté)  formatRewardValue(), describeConditions() → [{ key, params }],
                                    formatCouponCode('042913') → '042 913', weekdaysFromMask()
  designs.ts      (pur, réexporté)  thèmes de carte : violet, or, ramadan, aid, été… (dégradés, couleurs, motif)
  i18n/fr.ts, en.ts, ar.ts (pur)    bloc de traduction commun « scratch »
  ScratchCardFace.tsx  (RN, import par chemin)  face de la carte : logo, nom du commerçant,
                                    thème, zone « lot » ; dépendances : react-native-svg, expo-linear-gradient
```

**Textes traduits.** Les deux apps utilisent `i18n-js` avec des objets imbriqués, donc la fusion est triviale :

```ts
// apps/jitplus/i18n/locales/fr.ts  (même chose dans apps/jitpluspro)
import { scratchFr } from '@jitplus/shared/src/scratch/i18n/fr';
export default { /* … */, scratch: scratchFr, scratchClient: { /* textes propres au client */ } };
```

Le bloc commun `scratch.*` contient les libellés des types de lot, des conditions (« Valable du mardi au jeudi, de 10 h à 14 h », « Dès 100 MAD d'achat »), des statuts et le titre de la carte. Les textes propres à chaque app vont dans `scratchPro.*` et `scratchClient.*`. L'arabe (darija) et le RTL fonctionnent déjà via `createLanguageProvider`.

**Anti-dérive avec le backend.** Les enums Prisma restent la source de vérité. On ajoute un test côté backend (`scratch-enums.spec.ts`) qui importe `packages/shared/src/scratch/types.ts` par chemin relatif (ts-jest le permet) et vérifie que les valeurs sont identiques à celles de `@prisma/client`. Cela applique la règle déjà écrite pour `MerchantCategory` (« must match Prisma schema exactly »), mais de façon automatisée.

**Points à vérifier.**
- Le `metro.config.js` du Pro prend en charge une copie embarquée de `./packages/shared` pour EAS. Il faut vérifier que le script de copie prend bien le dossier entier, nouveaux fichiers compris.
- `scripts/check-i18n.js` (jitplus) compare les clés. S'il analyse les fichiers comme du texte au lieu d'importer les objets, il faudra l'adapter pour suivre les imports.

---

## 4. Application « JitPlus Pro » (commerçant)

### 4.1 Navigation

- `app/games.tsx` : la carte désactivée « Autres jeux / Coming soon » (`upcomingTitle`) devient « **Carte à gratter** » et ouvre `/scratch-campaigns`. Le test `__tests__/games.test.tsx` est à mettre à jour.
- Nouvelles routes, à déclarer dans `app/_layout.tsx` :
  - `app/scratch-campaigns/index.tsx` : liste avec pastilles de statut (Brouillon, Programmée, Envoyée, Terminée) et carte « Créer ».
  - `app/scratch-campaigns/create.tsx` : assistant de création.
  - `app/scratch-campaigns/[id].tsx` : détail et statistiques.
  - `app/coupon-validate.tsx` : validation d'un coupon.
- **Ne pas ajouter d'onglet**, conformément à `BRIEF-DESIGN.md` (5 onglets avec Scan au centre).
- Découper en `components/scratch/*` pour ne pas reproduire `lucky-wheel.tsx`, qui fait 2 820 lignes.

### 4.2 Assistant de création

L'assistant tient en **3 étapes**. Tout est prérempli : un commerçant peut envoyer une campagne valable en appuyant seulement sur « Suivant », « Vérifier », puis « Envoyer ». Les réglages rarement utiles sont repliés sous « Plus d'options ».

1. **Le cadeau** :
   - choix d'un modèle : « Une remise pour tous » (-10 %, par défaut), « Petits et gros lots » (-10 % / -20 % / produit offert), « Tampons bonus » (+1 / +2 / +5) ;
   - pour chaque lot : type, valeur (ou nom du produit, avec raccourci vers le catalogue `Reward`) et **chances en %**. Le premier lot est le **lot assuré** : il prend automatiquement le reste jusqu'à 100 % et reste illimité, ce qui garantit la règle « on gagne toujours » sans message d'erreur ;
   - le texte affiché est généré à partir de la valeur (« -20 % ») ;
   - sous « Plus d'options » : précision affichée, plafond de remise, stock limité (sauf pour le lot assuré), achat minimum, délai, jours et plage horaire.
2. **Qui et quand** :
   - ciblage en 3 choix (tous mes clients, clients à faire revenir, clients fidèles) avec l'estimation en direct (« 312 clients recevront la carte, dont 241 par notification ») ; les autres ciblages et les valeurs chiffrées sont sous « Autres ciblages » ;
   - envoi maintenant, ou un jour et une heure en dehors des heures calmes ;
   - durée de grattage en 1 semaine, 2 semaines ou 1 mois ; les coupons durent 7 jours de plus. « Choisir les dates moi-même » ouvre les deux dates précises (contraintes de la section 2.4).
3. **Vérifier et envoyer** : choix du thème au-dessus de l'aperçu de la carte (avant et après grattage, conditions du coupon), nom prérempli (« Carte à gratter du 10 oct. ») et message facultatif, aperçu de la notification, récapitulatif avec les chances et le nombre attendu de chaque lot, puis une confirmation explicite avant l'envoi.

**Saisie des dates.** Le Pro n'a pas de sélecteur de date (la roue utilise des champs texte `YYYY-MM-DD` validés par une expression régulière). Comme le commerçant programme maintenant trois dates (envoi, fin du grattage, fin des coupons), on recommande d'ajouter `@react-native-community/datetimepicker` avec `npx expo install`. C'est un module natif, donc il faut un nouveau build EAS du Pro. Cela évite les erreurs de saisie. L'heure d'envoi peut rester limitée à des créneaux prédéfinis (10 h, 12 h, 17 h, 19 h) pour respecter les heures calmes sans validation complexe.

**Dans le détail d'une campagne envoyée**, trois actions sont proposées :
- **« Prolonger »** : ouvre le sélecteur de date, avec pour seul minimum la date actuelle, et appelle `PATCH /campaigns/:id/dates`.
- **« Annuler la campagne »** (propriétaire uniquement, bouton rouge) : affiche une **double confirmation** alimentée par `cancel-preview`, car l'action retire des gains déjà obtenus :
  1. Avertissement : « 23 cartes non grattées **et 41 coupons déjà gagnés** seront annulés. Les 41 clients concernés seront prévenus. Les 12 coupons déjà utilisés ne sont pas touchés. »
  2. Confirmation finale : un bouton « Oui, annuler définitivement », qui ne s'active qu'après 3 secondes.
- **« Dupliquer »** : crée un nouveau brouillon à partir de la campagne.

**Plan Premium.**
- Pour un commerçant FREE, la carte « Carte à gratter » de `games.tsx` reste visible avec un badge Premium. Un appui ouvre `PremiumLockModal`, avec un aperçu animé de la carte en guise d'argument de vente, et non l'assistant.
- Si l'abonnement a expiré, la liste des campagnes reste accessible en lecture seule et le bouton « Créer » affiche `PremiumLockCard`.
- **Le scan et la saisie du code d'un coupon restent toujours disponibles**, même en FREE, car les coupons déjà gagnés doivent être honorés.

### 4.3 Validation d'un coupon

- **Scan.** Dans `app/scan-qr.tsx`, `handleBarCodeScanned` reçoit une nouvelle branche **avant** les formats existants : `jitplus://coupon/` → `router.push({ pathname: '/coupon-validate', params: { token } })`. La gestion actuelle (anti-rebond, phases de l'overlay, retours haptiques, démontage de la caméra) est conservée.
- **Saisie manuelle.** Un sélecteur « Téléphone | Code coupon » s'ajoute à la saisie manuelle existante. Le champ code a 6 chiffres, un clavier numérique, et le format `000 000`.
- **`coupon-validate.tsx`** :
  - appelle `check` puis affiche le client, le lot et une **liste de conditions** (✓ vert, ✗ rouge avec la raison) ;
  - champ **« Total du ticket (avant remise) »**, obligatoire en mode `PER_AMOUNT` ou s'il y a un minimum d'achat, et optionnel en `PER_VISIT` ;
  - récapitulatif en direct, calculé localement à titre indicatif (le serveur recalcule tout) : « Remise : 20 MAD · À encaisser : 80 MAD · **+2 tampons** » (+ « +5 tampons bonus » pour un coupon de ce type) ;
  - **un seul bouton**, « Valider le coupon », qui appelle `redeem` avec une `Idempotency-Key` générée une fois par écran. Le coupon et les tampons sont enregistrés dans la même opération, donc le caissier ne peut pas oublier les tampons ;
  - en cas de succès, affiche `TransactionSuccessModal` (Lottie déjà présent) avec le coupon utilisé et les tampons ajoutés, puis invalide `clientDetail`, `transactions` et les statistiques.
- **Bonus.** Quand le commerçant scanne la **carte de fidélité** d'un client qui a des coupons actifs chez lui, `transaction-amount.tsx` affiche un bandeau « 🎟 Ce client a 1 coupon : Café offert · Utiliser ». Un appui bascule vers `coupon-validate` avec le montant déjà saisi. Les tampons sont alors crédités par `redeem`, et non par une seconde transaction, ce qui évite de les compter deux fois. C'est la principale source d'utilisation en boutique.

### 4.4 Données et statistiques

- Hooks React Query dans un **nouveau fichier** `hooks/useScratchHooks.ts`, pour ne pas alourdir `useQueryHooks.ts` (868 lignes). Les clés vont dans `queryKeys`, sur le modèle `useLuckyWheel*`.
- `useRealtimeEvents` invalide les statistiques quand un coupon est utilisé, ce qui suppose un événement socket côté commerçant.
- Statistiques : réutiliser les composants maison de `dashboard.tsx`, c'est-à-dire `TrendChart` (barres en `View`) et les barres de répartition horizontales pour les lots, ainsi qu'un entonnoir vertical. **Aucune librairie de graphiques n'est nécessaire.**

---

## 5. Application « JitPlus » (client)

### 5.1 Réception

- `app/_layout.tsx`, `navigateByAction` :
  - `action: 'open_scratch'` → `/scratch/[cardId]` ;
  - `action: 'open_coupon'` → `/coupons/[couponId]`.
  - Les identifiants sont validés par la même expression régulière que `merchantId`.
- `hooks/useRealtimeEvents.ts`, `handleFcmDataPayload` : `scratch_card_received` invalide `scratchCards` ; `coupon_redeemed` et `coupon_expiring` invalident `coupons`. Le traitement est identique pour l'événement WebSocket.
- Canal Android : `jit-marketing` pour la réception, `jit-transactions` pour « coupon utilisé ».
- **Accueil** (`app/(tabs)/index.tsx`) : un bandeau ou un bouton flottant « 🎁 2 cartes à gratter », sur le modèle du bouton de la roue qui affiche un badge de tickets.

### 5.2 Écran de grattage : `app/scratch/[id].tsx` en modal

**Choix technique : `@shopify/react-native-skia` + `react-native-gesture-handler`** (installés avec `npx expo install`), avec `react-native-reanimated` 4.5.1, déjà présent.

- Sur Android d'entrée de gamme, très répandu au Maroc, un masque SVG redessiné à chaque `PanResponder` saccade. Skia dessine en GPU.
- Coût : quelques Mo de plus dans l'APK. Il faut aussi `GestureHandlerRootView` à la racine et un nouveau build EAS, puisque ce sont des modules natifs.
- Ces dépendances restent **uniquement dans jitplus**. Il n'y a donc rien à ajouter à `FORCE_PREFIX` dans le Metro du Pro.

**Fonctionnement.**
1. En dessous : `ScratchCardFace` (partagé), avec le lot affiché une fois le résultat connu.
2. Au-dessus : un `Canvas` Skia avec la couche de grattage (thème du commerçant et motif). Les traits du doigt sont dessinés en `BlendMode.Clear`.
3. **Au premier toucher**, l'app appelle `POST /cards/:id/scratch`. Le lot s'affiche dessous en environ 200 ms ; en attendant, le dessous montre un état neutre. L'appel est idempotent, donc la carte reste fiable si l'app est tuée en cours de grattage.
4. Progression : une grille de 16 × 16 cellules est marquée dans le worklet du geste. **Au-delà de 55 %**, la couche se dissout en fondu, avec `haptics.success` et des confettis (particules Skia ; Lottie n'est pas installé dans le client).
5. Révélation finale : « Vous avez gagné : Café offert », les conditions (`describeConditions`, partagé), et les boutons « Voir mon coupon » et « Plus tard ».
6. **Accessibilité** : bouton « Tout révéler » si un lecteur d'écran est actif (`AccessibilityInfo.isScreenReaderEnabled`), ou après 5 secondes. Respect de « réduire les animations ».

### 5.3 « Mes coupons »

- `app/coupons/index.tsx` : onglets segmentés **Actifs / Utilisés / Expirés**, regroupés par commerçant. Le compte à rebours (« expire dans 2 j ») passe en orange à moins de 48 h. Les coupons annulés apparaissent dans l'onglet **Expirés**, avec un badge « Annulé par le commerçant » et la date d'annulation. Un coupon annulé n'affiche **ni QR ni code**.
- Points d'entrée : une section sur l'accueil, la page `merchant/[id]` (coupons chez ce commerçant) et le menu du profil. Pas de nouvel onglet.
- `app/coupons/[id].tsx` :
  - QR (`react-native-qrcode-svg`, déjà utilisé), le **code à 6 chiffres en grand** (`042 913`), le lot et ses conditions, la date de fin ;
  - luminosité au maximum (`expo-brightness`) et écran maintenu allumé (`expo-keep-awake`), comme dans `qr.tsx` ;
  - à l'événement `coupon_redeemed`, l'écran passe en direct à « Utilisé ✓ ».
- Le jeton du QR est **permanent**, tant que le coupon est actif, ce qui permet de l'afficher hors ligne. On le met en cache comme `qr_permanent_token`. Cela ne pose pas de problème de sécurité : l'usage est unique, la recherche est limitée au commerçant et le caissier voit le nom du client.

### 5.4 Rappels

Les rappels sont envoyés par le serveur (section 2.5) : « ⏳ Votre coupon -20 % chez Café Atlas expire demain ». Un appui ouvre `/coupons/[id]`.

---

## 6. Sécurité : récapitulatif

| Risque | Parade |
|---|---|
| Un commerçant accède aux campagnes ou coupons d'un autre | Toutes les requêtes filtrent par `merchantId: user.userId` ; 404 sinon |
| Un client voit les cartes ou coupons d'un autre | Filtre par `clientId: user.userId` ; `ClientOnlyGuard` |
| Le client devine le lot ou manipule le tirage | Tirage exclusivement serveur avec `crypto.randomInt` ; poids et stocks jamais exposés au client |
| Double grattage ou double tirage (double tap, retry réseau) | `updateMany` conditionnel `PENDING → SCRATCHED` ; `scratchCardId @unique` sur `Coupon` |
| Survente du stock en concurrence | Décrément conditionnel `remaining > 0`, `Serializable` + `withRetry` (P2034) |
| Coupon utilisé deux fois (deux caisses) | `updateMany` conditionnel `ACTIVE → REDEEMED` ; `Idempotency-Key` |
| Code à 6 chiffres deviné | Code limité au commerçant, `@Throttle` sur `check`, nom du client affiché, journal d'audit |
| QR falsifié | HMAC-SHA256 avec séparation de domaine et `timingSafeEqual` |
| Conditions contournées | Réévaluation serveur au `redeem`, heure du Maroc calculée côté serveur |
| Spam de clients | Exclusion des clients qui ont bloqué le commerçant (`ClientMerchantBlock`), respect de `notifPush`, plafond de fréquence, heures calmes, modération du message |
| Membre d'équipe qui crée des campagnes | `MerchantOwnerGuard` sur la création ; la validation reste ouverte à l'équipe |
| Commerçant FREE qui contourne l'interface | `PremiumGuard` côté serveur sur les routes de gestion, et nouveau contrôle `isPremium` au moment de l'envoi |
| Tampons comptés deux fois (coupon puis transaction classique) | `redeem` crédite les tampons de l'achat ; le bandeau du flux classique redirige vers `redeem` au lieu d'ajouter une seconde transaction |
| Coupon utilisé après l'annulation de la campagne | Annulation des coupons `ACTIVE` dans la même transaction que la campagne ; `check` et `redeem` refusent `CANCELLED` ; tirage bloqué si la campagne est annulée |
| Carte perdue lors de la fusion d'un client fantôme | Réattribution des `scratch_cards` et des `coupons` dans `consumeClaim`, dans la même transaction `Serializable` |

**Conformité.**
- Les lignes directrices de l'App Store (5.3) encadrent les jeux à lots. Le cas présent est favorable : participation gratuite, sans achat et sans perte. Il faut quand même afficher un **règlement** court dans l'app et préciser qu'Apple et Google ne sont pas organisateurs. Ce règlement doit mentionner que **le commerçant peut annuler la campagne à tout moment, ce qui annule les cartes et les coupons non utilisés**.
- **Point d'attention.** Retirer un gain déjà attribué peut être contesté par un client. Le règlement accepté au préalable et la notification au moment de l'annulation réduisent ce risque. C'est un point à **faire valider en priorité par un juriste**.
- Côté Maroc, faire valider la qualification juridique (jeu promotionnel gratuit) par un juriste.

---

## 7. Plan de réalisation par phases

| Phase | Contenu | Estimation indicative |
|---|---|---|
| **0. Fondations** | Module `scratch` dans shared (types, constantes, i18n fr/en/ar, thèmes, `ScratchCardFace`) ; schéma et migration Prisma ; extraction de `weightedDraw` et de ses tests | 3–4 j |
| **1. MVP** | Backend : tests de non-régression, puis extraction de `earnStampsInTx` ; CRUD avec `PremiumGuard` ; « envoyer maintenant » via cron ; tirage ; coupons ; check/redeem avec tampons ; push ; réattribution dans `consumeClaim`. Pro : assistant simplifié (tous les clients), verrou Premium, scan et saisie du code, validation avec montant et tampons. Client : push et deep link, écran Skia, « Mes coupons » avec QR et code, mention de la carte en attente sur `claim.tsx` | 14–17 j |
| **2. Ciblage et suivi** | Programmation, filtres d'audience et estimation (avec les clients sans l'app), liste « Clients sans l'application » et partage WhatsApp, rappels d'expiration, statistiques (dont « clients devenus utilisateurs »), bandeau « coupon actif » au scan de la carte de fidélité, plafonds anti-spam | 7–9 j |
| **3. Durcissement** | Tests d'intégration en concurrence (Postgres docker-compose), y compris l'annulation pendant un grattage et l'annulation pendant une validation en caisse, contrôle des clés i18n, accessibilité, règlement, hausse des versions minimales | 3–4 j |
| **4. Roue de la chance → coupons** | Type de lot, création du coupon au gain, validation unifiée, route `fulfil` conservée, script de reprise, rappels (section 2.9) | 4–5 j |

**Tests à prévoir.**
- Backend (Jest/ts-jest) :
  - `weightedDraw` (distribution, repli quand le stock est épuisé) ;
  - `evaluateCouponConditions` (jours, plage horaire qui passe minuit, fuseau `Africa/Casablanca`, achat minimum) ;
  - idempotence de `scratch` et de `redeem` ;
  - isolation des données : le commerçant A qui envoie le code d'un coupon du commerçant B reçoit un 404 ;
  - test anti-dérive des enums.
  - Un test réel de concurrence (`Promise.all` sur un stock de 1) demande une base Postgres. Il n'y a **pas de configuration e2e** aujourd'hui : c'est à créer en phase 3.
- Apps (jest-expo) : `games.test.tsx`, fonctions `format.ts` du package partagé, cohérence des clés i18n dans les trois langues.

**Déploiement.**
- Activer la fonctionnalité par plan, avec un interrupteur d'environnement `SCRATCH_CARDS_ENABLED`.
- **Hausse des versions minimales** (`/health/version`, substitutions de `cloudbuild.yaml`, comme pour la migration « tampons uniquement ») :
  - Pro : un membre d'équipe avec une ancienne version ne reconnaîtrait pas le QR `jitplus://coupon/`.
  - Client : une ancienne version recevant `open_scratch` tomberait sur l'onglet notifications. Ce n'est pas bloquant, mais la carte serait inaccessible.

---

## 8. Décisions

### Validées

| # | Décision | Impact dans cette étude |
|---|---|---|
| 1 | **Premium uniquement** | `PremiumGuard` sur la gestion des campagnes, nouveau contrôle au moment de l'envoi, coupons toujours honorés après expiration de l'abonnement (sections 2.3, 2.6 et 4.2) |
| 2 | **Un achat avec coupon rapporte aussi des tampons** | `redeem` crédite les tampons dans la même transaction, calculés sur le montant payé après remise, grâce à l'extraction de `earnStampsInTx` (sections 2.4 et 4.3) |
| 3 | **Clients fantômes : ils reçoivent la carte, mais doivent installer l'app pour l'utiliser** | Carte créée sans push, réattribuée lors de la fusion dans `consumeClaim`, relance WhatsApp par le commerçant (section 2.8) |
| 4 | **Tampons calculés sur le montant payé après remise** | `computeEarnedStamps(paidAmount)` dans `redeem`, avec `paidAmount = purchaseAmount − discountAmount` (section 2.4) |
| 5 | **Même délai pour les clients fantômes** | Aucun traitement de date spécifique (section 2.8, point 7) |
| 6 | **Le commerçant programme les dates d'expiration** | `cardExpiresAt` et `couponExpiresAt` au niveau de la campagne, prolongation seulement après l'envoi, sélecteur de date dans le Pro (sections 2.1, 2.4, 2.6 et 4.2) |

| 7 | **Le commerçant peut annuler une campagne à tout moment : aucune carte ni aucun coupon ne reste valable**, même déjà gagné | Cartes non grattées et coupons actifs annulés dans une même transaction ; coupons déjà utilisés conservés ; push aux détenteurs de coupons ; double confirmation ; règle inscrite au règlement (sections 2.3, 2.6, 4.2, 5.3 et 6) |
| 8 | **Pas de restriction par boutique pour l'instant** | Coupon valable dans toutes les boutiques ; le modèle peut évoluer plus tard (section 2.6) |
| 9 | **Lots de la roue de la chance passés en coupons génériques** | Phase 4 : QR, code, rappels et validation unifiée pour la roue (section 2.9) |

Toutes les décisions nécessaires au développement sont prises.

---

## 9. Notes d'implémentation

Écarts et précisions constatés pendant le développement (phases 0 à 5 livrées) :

- **PUT et non PATCH** : l'étude mentionnait `PATCH` pour la mise à jour des campagnes ; l'API expose `PUT /scratch/merchant/campaigns/:id` (remplacement complet), plus simple à valider côté DTO.
- **Envoi immédiat** : « Envoyer maintenant » passe la campagne directement en `SENDING` (verrou posé) et lance le dispatch dans la foulée, sans attendre le cron ni appliquer les heures calmes : c'est un choix explicite du commerçant. Si l'instance meurt pendant l'envoi, le cron reprend la campagne quand le verrou expire.
- **Heures calmes** : seuls les envois programmés en tiennent compte (21 h → 9 h, vendredi 11 h 30 → 14 h, heure du Maroc). `/schedule` décale un créneau qui y tomberait, l'assistant désactive le créneau 12:00 le vendredi, et le cron ne lance pas pendant ces plages une campagne programmée en retard.
- **Activation du dispatch** : le cron d'envoi tourne si `ENABLE_CRONS` est actif (par défaut en production) ou si `ENABLE_SCRATCH_DISPATCH=true`, sans démarrer les autres crons marketing. `SCRATCH_IGNORE_QUIET_HOURS=true` permet de tester la nuit en local ; il est ignoré en production.
- **Validation des dates à l'enregistrement** : `POST`/`PUT /campaigns` acceptent un champ optionnel `sendAt` (envoi prévu, `null` = maintenant). Il sert uniquement de référence pour vérifier les délais de grattage et de coupon, comme le fait l'assistant ; l'envoi reste programmé par `/schedule`.
- **Assistant Pro en 3 étapes** (section 4.2) : l'aperçu (notification, carte avant/après grattage avec logo, conditions de chaque lot, récapitulatif modifiable) est à la dernière étape. Sur la vraie carte, le logo et le nom du commerce restent visibles pendant le grattage : seule la zone sous l'en-tête est recouverte (`getScratchZone`).
- **Secret des jetons QR coupon** : le secret dédié `COUPON_QR_HMAC_SECRET` retombe sur `QR_HMAC_SECRET` s'il n'est pas défini, pour éviter une variable obligatoire supplémentaire au déploiement.
- **Sélecteur de date Pro** : calendrier en JS pur (pas de `@react-native-community/datetimepicker`), pour éviter un nouveau module natif côté Pro.
- **Skia côté client uniquement** : `@shopify/react-native-skia` 2.6.2 et `react-native-gesture-handler` ~2.32.0 ajoutés à `jitplus` seulement, avec `GestureHandlerRootView` à la racine. Un nouveau build EAS client est nécessaire (modules natifs). Le geste de grattage utilise `GestureDetector` + valeurs partagées Reanimated (Skia 2.x n'a plus `useTouchHandler`) ; la grille 16 × 16 est marquée dans le worklet, dissolution à 55 %.
- **Skia sans étape de build pnpm** : le script de post-install de Skia est ignoré par pnpm ; seuls les binaires précompilés sont nécessaires. Si un build local échoue, ajouter `@shopify/react-native-skia` à `onlyBuiltDependencies`.
- **`scripts/stamps-migration-postcheck.ts`** : à vérifier si l'énumération des types de transaction y est codée en dur, auquel cas ajouter `COUPON_REDEEM`.
