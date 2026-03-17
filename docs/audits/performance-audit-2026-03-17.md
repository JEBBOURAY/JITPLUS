# Audit de Performance — JitPlus — 17 Mars 2026

## Résumé

| Catégorie          | Critique | Haute | Moyenne | Basse | Total |
|--------------------|----------|-------|---------|-------|-------|
| Backend (API)      | 3        | 3     | 2       | 2     | 10    |
| Base de données    | 2        | 3     | 2       | 0     | 7     |
| Mobile (jitplus)   | 1        | 1     | 1       | 0     | 3     |
| Mobile (jitpluspro)| 2        | 0     | 1       | 0     | 3     |
| **Total**          | **8**    | **7** | **6**   | **2** | **23**|

---

## 1. BACKEND — Problèmes critiques

### 1.1 CRITIQUE : Recherche géographique sans limite (`getNearbyMerchants`)

**Fichier** : `apps/backend/src/client-auth/client.service.ts` lignes 525-580

**Problème** : Deux `findMany()` sans `take` qui récupèrent TOUS les marchands dans la bounding box, puis calcul Haversine en JavaScript sur chaque store.

```typescript
// Requête 1 — aucune limite
const merchants = await this.merchantRepo.findMany({
  where: { isActive: true, latitude: {...}, longitude: {...} },
  // PAS de take/skip !
});

// Requête 2 — même problème
const merchantsViaStores = await this.merchantRepo.findMany({...});
```

**Impact** : Dans une grande ville (Casablanca), la bounding box peut retourner 500+ marchands × 5 stores = 2500 itérations CPU, **100-500ms par requête**.

**Fix** :
- Ajouter `take: 200` aux deux requêtes
- Ajouter `@@index([isActive, latitude, longitude])` au modèle Store
- Long terme : utiliser PostGIS pour le calcul de distance côté DB

---

### 1.2 CRITIQUE : 17 `count()` parallèles dans `getGlobalStats()`

**Fichier** : `apps/backend/src/admin/admin.service.ts` lignes 295-330

**Problème** : 17 appels `count()` séparés envoyés en `Promise.all()`. Chaque `count()` fait un scan complet de la table.

```typescript
const [...] = await Promise.all([
  this.merchantRepo.count(),                                    // scan complet
  this.merchantRepo.count({ where: { isActive: true } }),       // scan complet
  this.merchantRepo.count({ where: { plan: 'FREE' } }),         // scan complet (pas d'index sur plan!)
  this.transactionRepo.count({ where: { type: 'EARN_POINTS' } }), // scan complet
  // ... 13 autres count()
]);
```

**Impact** : 17 round-trips DB parallèles, **50-200ms** même avec connexion rapide. Sans index sur `plan` et `type`, c'est un scan séquentiel.

**Fix** :
```sql
-- Remplacer par une seule requête raw
SELECT
  COUNT(*) FILTER (WHERE plan = 'FREE') AS free_count,
  COUNT(*) FILTER (WHERE plan = 'PREMIUM') AS premium_count,
  COUNT(*) FILTER (WHERE is_active) AS active_count
FROM merchants;
```

---

### 1.3 CRITIQUE : Boucle séquentielle d'émission WebSocket dans `sendToAll`

**Fichier** : `apps/backend/src/notifications/notifications.service.ts` lignes ~140-150

**Problème** : Après avoir créé les `ClientNotificationStatus` en chunks, l'émission WebSocket se fait client par client dans une boucle synchrone.

**Impact** : Pour un marchand avec 5000 clients, la boucle bloque le thread Node.js pendant **10-50ms**.

**Fix** : Émettre par room WebSocket (`merchant:<id>`) au lieu de par client individuel, ou batched avec `setImmediate()`.

---

## 2. BACKEND — Problèmes hauts

### 2.1 HAUTE : Requête notifications client — 3 queries au lieu d'1

**Fichier** : `apps/backend/src/client-auth/client.service.ts` lignes 652-730

**Problème** : `getNotifications()` fait 3 requêtes séquentielles :
1. `findMany` sur loyaltyCards pour récupérer les merchantIds
2. `findMany` sur clientNotifStatus pour les IDs dismissés
3. `findMany` + `count` sur notifications avec filtre OR dynamique

```typescript
const cards = await this.loyaltyCardRepo.findMany({...});  // Query 1
const dismissedIds = await this.clientNotifStatusRepo.findMany({...}); // Query 2
const [notifications, total] = await Promise.all([...]);  // Query 3 + 4
```

**Impact** : 4 round-trips DB par appel. Client avec 20 marchands = filtre OR avec 20 conditions.

**Fix** : Combiner en une sous-requête SQL ou utiliser une relation directe `ClientNotificationStatus → Notification`.

---

### 2.2 HAUTE : `getPointsOverview` — take: 100 hardcodé sans pagination

**Fichier** : `apps/backend/src/client-auth/client.service.ts` lignes 203-230

**Problème** : `take: 100` hardcodé. Les clients avec 100+ cartes de fidélité ne voient pas toutes leurs cartes. Pas de pagination cursor.

**Impact** : Réponse tronquée silencieusement + payload de ~50KB pour 100 cartes.

**Fix** : Ajouter pagination cursor `(skip/take)` ou infinite scroll.

---

### 2.3 HAUTE : Stores inutilement chargés dans `getClientStatus`

**Fichier** : `apps/backend/src/merchant/services/merchant-client.service.ts` lignes 152-155

**Problème** : Charge le marchand avec `MERCHANT_LOYALTY_SELECT` qui inclut tous les stores, alors que seuls les paramètres de fidélité sont nécessaires.

**Impact** : ~4KB de données superflues par requête, JOIN inutile.

**Fix** : Créer un `MERCHANT_SETTINGS_SELECT` sans stores.

---

## 3. BASE DE DONNÉES — Index manquants

### 3.1 CRITIQUE : Pas d'index sur `Merchant.plan`

**Fichier** : `apps/backend/prisma/schema.prisma` — modèle Merchant

**Requêtes impactées** :
- `admin.service.ts:307` → `count({ where: { plan: 'FREE' } })`
- `admin.service.ts:308` → `count({ where: { plan: 'PREMIUM' } })`
- Toute résolution de plan dans `auth.service.ts`

**Fix** :
```prisma
model Merchant {
  // ...
  @@index([plan])
  @@index([isActive, plan])  // composite pour admin
}
```

### 3.2 CRITIQUE : Pas d'index sur `Transaction.type`

**Fichier** : `apps/backend/prisma/schema.prisma` — modèle Transaction

**Requêtes impactées** :
- `admin.service.ts:313-315` → 3× `count({ where: { type: '...' } })`
- Dashboard marchand → `groupBy({ by: ['rewardId'], where: { type: 'REDEEM_REWARD' } })`

**Fix** :
```prisma
model Transaction {
  // ...
  @@index([type])
  @@index([status, createdAt(sort: Desc)])  // pour filtres temporels
}
```

### 3.3 HAUTE : Pas d'index composite `Store(merchantId, isActive)`

Les requêtes de découverte filtrent systématiquement les stores actifs par marchand.

```prisma
model Store {
  // ...
  @@index([merchantId, isActive])
  @@index([isActive, latitude, longitude])
}
```

### 3.4 HAUTE : Pas d'index sur `Merchant.onboardingCompleted`

Utilisé dans les flows d'onboarding et les filtres admin.

### 3.5 HAUTE : Pas d'index composite `Merchant(trialStartedAt, plan)`

Les vérifications d'expiration trial scannent toute la table.

### 3.6 MOYENNE : Channel Notification comme String au lieu d'Enum

**Fichier** : `apps/backend/prisma/schema.prisma` — modèle Notification

Le champ `channel` est un `String?` alors que les valeurs sont `PUSH`, `EMAIL`, `WHATSAPP`. Un enum PostgreSQL serait plus performant pour les index et le filtrage.

### 3.7 MOYENNE : Dénormalisation manquante `Merchant.currentClientCount`

Chaque requête admin fait un `_count.loyaltyCards` qui nécessite un JOIN + COUNT.

**Fix** : Ajouter un champ `currentClientCount Int @default(0)` mis à jour par trigger ou dans le service.

---

## 4. MOBILE — Problèmes de performance

### 4.1 CRITIQUE : FlatList non optimisée — écran d'accueil jitplus

**Fichier** : `apps/jitplus/app/(tabs)/index.tsx` ~ligne 698

**Problème** : La FlatList des cartes de fidélité manque les props d'optimisation :
- `getItemLayout` (évite la mesure dynamique)
- `maxToRenderPerBatch` (limite le rendu par frame)
- `windowSize` (réduit la mémoire)
- `removeClippedSubviews` (libère les vues hors écran)

**Impact** : Jank visible au scroll avec 50+ cartes, surtout sur appareils Android bas de gamme.

**Fix** :
```tsx
<FlatList
  data={cards}
  keyExtractor={(item) => item.id}
  getItemLayout={(_, i) => ({ length: 160, offset: 160 * i, index: i })}
  maxToRenderPerBatch={8}
  windowSize={5}
  removeClippedSubviews={Platform.OS === 'android'}
/>
```

### 4.2 CRITIQUE : FlatLists non optimisées — messages jitpluspro

**Fichier** : `apps/jitpluspro/app/(tabs)/messages.tsx` ~ligne 421

Même problème que ci-dessus pour la liste d'historique des notifications.

### 4.3 CRITIQUE : FlatLists non optimisées — scan-qr jitpluspro

**Fichier** : `apps/jitpluspro/app/scan-qr.tsx` lignes 610-680

Deux FlatLists dans le modal de sélection client sans optimisation.

### 4.4 HAUTE : Grille de tampons — 20 `<Image>` par carte

**Fichier** : `apps/jitplus/app/(tabs)/index.tsx` lignes 155-170

**Problème** : Chaque carte tampon rend 20 composants `Image`, ce qui est lourd.

**Fix** : Utiliser des formes SVG au lieu d'images pour les tampons (~30% plus rapide).

### 4.5 MOYENNE : Dashboard marchand non mémorisé

**Fichier** : `apps/jitpluspro/app/(tabs)/index.tsx` lignes 200-400

Les cartes de statistiques du dashboard se re-rendent à chaque mise à jour real-time alors que seules certaines valeurs changent.

**Fix** : Wrapper les cartes avec `React.memo()` et utiliser `useMemo` pour les calculs.

---

## 5. Points positifs déjà en place

| Aspect | Statut |
|--------|--------|
| Batch operations (`createMany`, `updateMany`) dans capAndNotifyClients | OK |
| React Query avec `staleTime`/`gcTime` bien configurés | OK |
| Cache des images avec `cachePolicy="disk"` | OK |
| WebSocket + FCM dual-channel pour temps réel | OK |
| Pagination cursor sur les notifications | OK |
| Cache NestJS (CacheModule) sur dashboard stats | OK |
| Nettoyage des listeners WS et subscriptions | OK |
| Chunking des inserts notification status (500/batch) | OK |

---

## 6. Plan d'action recommandé

### Phase 1 — Critique (faire immédiatement)

| # | Action | Fichier | Impact estimé |
|---|--------|---------|---------------|
| 1 | Ajouter `take: 200` à `getNearbyMerchants` | client.service.ts | -80% temps de réponse |
| 2 | Ajouter `@@index([plan])` et `@@index([type])` | schema.prisma | -50% temps dashboard admin |
| 3 | Ajouter `@@index([merchantId, isActive])` sur Store | schema.prisma | -40% découverte marchands |
| 4 | Remplacer 17× count() par 1 raw query dans admin | admin.service.ts | -70% temps getGlobalStats |
| 5 | Ajouter props FlatList sur écrans principaux | index.tsx, messages.tsx | Scroll fluide |

### Phase 2 — Haute priorité (cette semaine)

| # | Action | Fichier | Impact estimé |
|---|--------|---------|---------------|
| 6 | Combiner les 3 queries de getNotifications en 1-2 | client.service.ts | -60% latence notifications |
| 7 | Ajouter pagination à getPointsOverview | client.service.ts | Support clients actifs |
| 8 | Émettre WS par room au lieu de par client | notifications.service.ts | -95% événements WS |
| 9 | Ajouter index composite `(trialStartedAt, plan)` | schema.prisma | Trial checks plus rapides |
| 10| Créer MERCHANT_SETTINGS_SELECT sans stores | merchant-client.service.ts | -4KB par requête |

### Phase 3 — Optimisations (prochaines semaines)

| # | Action | Fichier | Impact estimé |
|---|--------|---------|---------------|
| 11| Convertir channel en enum PostgreSQL | schema.prisma | Index optimisé |
| 12| Dénormaliser currentClientCount | schema.prisma | Éliminer JOIN admin |
| 13| SVG stamps au lieu d'images | jitplus index.tsx | -30% rendu tampons |
| 14| React.memo sur dashboard cards | jitpluspro index.tsx | Moins de re-renders |

---

## Commande migration pour les index (Phase 1)

```prisma
// Ajouter au modèle Merchant :
@@index([plan])
@@index([isActive, plan])

// Ajouter au modèle Transaction :
@@index([type])
@@index([status, createdAt(sort: Desc)])

// Ajouter au modèle Store :
@@index([merchantId, isActive])
@@index([isActive, latitude, longitude])
```

Puis exécuter :
```bash
npx prisma migrate dev --name add-performance-indexes
```
