# Audit Qualité du Code — JitPlus Pro (v2 — Revue approfondie)

**Date :** 20 mars 2026  
**Périmètre :** `apps/jitpluspro/` — Application mobile marchands (Expo / React Native)  
**Fichiers analysés :** ~85 fichiers (22 screens, 10 hooks, 14 composants, 9 utils, 3 contextes, 5 constants, 4 plugins, 4 tests, configs)  
**Erreurs TypeScript :** 0 | **ESLint configuré :** Oui (expo + prettier) | **React :** 19.1.0 | **React Native :** 0.81.5  

---

## Note Globale : 6.8 / 10

| Domaine | Note | Verdict |
|---------|------|---------|
| Architecture & Structure | 7/10 | Bonne séparation, mais 7 god components > 700 lignes |
| Typage TypeScript | 7/10 | `strict: true`, mais `any` casts et `Record<string, any>` récurrents |
| Gestion d'état | 7.5/10 | Zustand + React Query solides, closures stale dans AuthContext |
| Sécurité | 7.5/10 | Anti-SSRF, SecureStore, mais Google Client ID exposé dans eas.json |
| Réutilisation de code | 6/10 | Shared package bien exploité, DRY massivement violé dans les screens |
| Tests | 4/10 | 4 fichiers de tests (utils uniquement), 0% composants/hooks/stores |
| Performance | 7/10 | Bonne memoization partielle, Skeleton shimmer loop infinie |
| i18n & Accessibilité | 6.5/10 | i18n fr/en/ar en place, mais ~40 strings hardcodés + 0 pluralisation arabe |
| Qualité des composants | 7/10 | Composants atomiques excellents, screens monolithiques |
| Configuration & Build | 7.5/10 | EAS bien configuré, plugins conflictuels, cert pinning placeholder |

---

## 1. Architecture & Structure du Projet

### Points forts
- **Séparation claire des responsabilités** : `hooks/`, `services/`, `stores/`, `utils/`, `contexts/`, `components/`, `constants/`
- **Shared package** (`@jitplus/shared`) : validation, erreurs, dates, providers réutilisés entre jitplus et jitpluspro — aucune duplication inter-apps
- **Query keys centralisés** dans `useQueryHooks.ts` — cohérence cache React Query
- **Expo Router** correctement structuré avec `(tabs)/` layout group
- **Invalidation helpers** exposés (`useInvalidateQueries`)

### Problèmes identifiés

#### CRITIQUE — God Components (fichiers > 700 lignes)

| Fichier | Lignes | useState | Description |
|---------|--------|----------|------------|
| `app/(tabs)/account.tsx` | ~1 401 | 7 | 7 sections collapsibles, plan, social links |
| `app/stores.tsx` | ~1 043 | 10 | CRUD magasins + MapView + géocodage + modals |
| `app/(tabs)/messages.tsx` | ~1 087 | 6 | 3 canaux (push, WhatsApp, email) dupliqués |
| `app/onboarding.tsx` | ~1 011 | 7 | Wizard multi-étapes + upload logo + rewards |
| `app/scan-qr.tsx` | ~897 | 12 | Scanner + recherche manuelle + sélection pays |
| `app/transaction-amount.tsx` | ~912 | 8 | Mode points + stamps + rédemption reward |
| `app/settings.tsx` | ~823 | 8 | Config fidélité points/stamps + rewards CRUD |
| `app/client-detail.tsx` | ~789 | 6 | Fiche client + historique + ajustement points |
| `app/register.tsx` | ~712 | 8 | Wizard 4 étapes + Google OAuth |
| `app/team-management.tsx` | ~687 | 6 | CRUD membres + permissions |

> **Impact** : Complexité cognitive élevée, tests unitaires impossibles,
> revue de code difficile. Un refactoring en composants extraits réduirait
> chaque fichier sous 400 lignes.

---

## 2. Typage TypeScript

### Points forts
- `strict: true` dans tsconfig
- Types centralisés dans `types/index.ts` avec re-exports depuis `@jitplus/shared`
- Interfaces claires pour `Merchant`, `Store`, `TeamMember`, `AuthResponse`
- `queryKeys` typé avec `as const` — autocomplétion et sécurité des clés

### Problèmes
- **Types inline dans `useQueryHooks.ts`** : `ClientDetail`, `DashboardStats`, `Transaction` sont définis localement au lieu de `types/index.ts` (~120 lignes de types dispersés)
- **`Record<string, any>`** utilisé dans `useStoresCRUD.saveStore()` et `useRecordTransaction()` — perd le typage des payloads
- **Type assertions** dans `onboarding.tsx` (FormData API) et `scan-qr.tsx` : `(error as any)?.response?.data`

### Recommandation
```
Sévérité : MOYENNE
→ Centraliser tous les types API dans types/index.ts
→ Remplacer Record<string, any> par des interfaces dédiées (CreateStorePayload, RecordTransactionPayload)
```

---

## 3. Gestion d'État

### Points forts
- **Zustand** pour l'état auth (`authStore.ts`) — léger, sélecteurs granulaires, pas de re-renders inutiles
- **React Query** pour toute la couche serveur — staleTime configurés, `keepPreviousData`, infinite scroll
- **Cache persisté** via `asyncStoragePersister` (React Query Persist)
- **Contextes bien isolés** : AuthContext (actions), ThemeContext (UI), LanguageContext (i18n) — tous délegués à des factories du shared package

### Problèmes
- **Trop de `useState` dans les screens** : `scan-qr.tsx` en a 12, `stores.tsx` en a 10. Un `useReducer` serait plus adapté pour les machines à états complexes (wizard, modals, formulaires)
- **État de formulaire local** non extrait : chaque screen gère ses propres TextInput values via useState au lieu d'un hook `useForm`

### Recommandation
```
Sévérité : MOYENNE
→ Introduire useReducer pour les screens à 8+ useState (scan-qr, stores, settings)
→ Optionnel : créer un hook useFormState<T> partagé pour les formulaires CRUD
```

---

## 4. Sécurité

### Points forts
- **Anti-SSRF** dans `imageUrl.ts` : filtrage des IPs privées/internes en production, refus HTTP non-HTTPS
- **Tokens en SecureStore** (pas AsyncStorage) — chiffrement natif
- **Refresh token rotation** avec `sessionId` — invalidation côté serveur
- **401 interceptor** global → déconnexion auto + nettoyage complet
- **Push token** : lazy-loading expo-notifications (évite crash Expo Go SDK 53+)
- **Permissions Android** déclarées explicitement (caméra, localisation, notifications)
- **Config Google Maps** avec commentaire rappelant la restriction des clés dans la console GCP
- **Certificate pinning plugin** et **Network Security config plugin** présents
- **Crypto.randomUUID** pour le deviceId (pas de pseudo-random)
- **Privacy Manifest** plugin iOS configuré

### Problèmes
- **Console.log en production** : les logs `[AuthContext]`, `[Push]`, `[API]` sont protégés par `__DEV__` — OK, mais vérifier qu'aucun log ne fuit en prod (✅ confirmé : tous les console.* sont wrappés dans `if (__DEV__)`)
- **`completeOnboarding`** avale silencieusement l'erreur API (`try { ... } catch {}`) — l'état local est mis à jour même si le serveur rejette

### Recommandation
```
Sévérité : BASSE
→ Ajouter un fallback retry ou un log Sentry dans completeOnboarding catch
→ La posture sécurité est bonne dans l'ensemble
```

---

## 5. Tests

### État actuel
- **1 seul fichier de test** : `__tests__/validation.test.ts` (70 lignes)
- Teste `isValidEmail`, `isValidUUID`, `normalizePhone`
- Jest + jest-expo configurés correctement
- Aucun test de composant, hook, ou screen

### Couverture estimée

| Couche | Fichiers testables | Testés | Couverture |
|--------|-------------------|--------|------------|
| Utils | 9 | 2 (validation, normalizePhone) | ~22% |
| Hooks | 10 | 0 | 0% |
| Components | 13 | 0 | 0% |
| Screens | 22 | 0 | 0% |
| Contexts | 3 | 0 | 0% |
| **Total** | **57** | **2** | **~3.5%** |

### Recommandation
```
Sévérité : HAUTE
→ Priorité 1 : Tester les hooks critiques (useForceUpdate, useQueryHooks, authStore)
→ Priorité 2 : Tester les utils purs (geocodeCache, avatarColor, responsive, imageUrl)
→ Priorité 3 : Tests de rendu pour ErrorBoundary, ForceUpdateModal, CustomTabBar
→ Objectif raisonnable : 40% de couverture pour la première milestone
```

---

## 6. Performance

### Points forts
- **React.memo** appliqué aux composants clés : `CustomTabBar`, `StampGrid`, `BrandName`, `MerchantLogo`
- **`keepPreviousData`** sur les queries paginées — pas de flash blanc
- **Skeleton loaders** avec shimmer partagé (un seul `Animated.loop` pour toutes les instances)
- **Stale times** configurés par endpoint (30s → 5min selon la volatilité des données)
- **Expo Image** avec `cachePolicy: "disk"` et `recyclingKey` pour MerchantLogo
- **Debounce** sur la recherche clients (`SEARCH_DEBOUNCE_MS = 350`)
- **`useFocusFade`** utilise `useNativeDriver: true`

### Problèmes
- **`stores.tsx`** : `fitToCoordinates` callback non mémoïsé — recréé à chaque render
- **`responsive.ts`** : dimensions listener mute des objets exportés (`SCREEN.width = ...`) au lieu de retourner un nouveau ref — peut causer des stale values dans des closures
- **Pas de `React.memo`** sur les rows de listes dans `activity.tsx` et `client-detail.tsx` (TransactionRow)
- **`(tabs)/messages.tsx`** : 3 hooks useQuery montés en permanence (push history, WhatsApp quota, email quota) même quand l'onglet correspondant n'est pas visible

### Recommandation
```
Sévérité : MOYENNE
→ Extraire et mémoïser les composants de liste (TransactionRow, ClientRow)
→ Conditionner les queries WhatsApp/email à l'onglet actif dans messages.tsx
→ Utiliser `enabled: activeTab === 'whatsapp'` sur useWhatsappQuota, etc.
```

---

## 7. Violations DRY (Don't Repeat Yourself)

### Patterns dupliqués identifiés

| Pattern | Fichiers concernés | Estimation lignes dupliquées |
|---------|-------------------|------------------------------|
| Compose card (push/whatsapp/email) | `messages.tsx` | ~200 lignes |
| Couleurs par type de transaction | `activity.tsx`, `client-detail.tsx` | ~40 lignes |
| Vérification premium feature | `messages.tsx`, `dashboard.tsx`, `settings.tsx` | ~30 lignes |
| Modal formulaire CRUD | `stores.tsx`, `settings.tsx`, `team-management.tsx` | ~150 lignes |
| Device row rendering | `security.tsx` | ~50 lignes (intra-fichier) |

### Recommandation
```
Sévérité : MOYENNE
→ Extraire ComposeCard dans components/
→ Créer un mapping TRANSACTION_TYPE_CONFIG dans constants/ (couleur, icône, label)
→ Créer un composant CrudFormModal réutilisable
→ Créer usePremiumGuard() hook pour les feature gates
```

---

## 8. i18n & Localisation

### Points forts
- **3 langues** : français, anglais, arabe
- **RTL supporté** (arabe) avec `I18nManager` et alerte de redémarrage
- **i18n-js** correctement configuré avec fallback
- **Clés de traduction** utilisées dans la grande majorité du code
- **Provider factory** partagée entre les deux apps

### Problèmes
- **Strings hardcodés restants** :
  - `useStoresCRUD.ts` : `"Limite atteinte"`, `"Le nom du magasin est obligatoire."`
  - `StampGrid.tsx` : `"tampon"`, `"Cadeau disponible !"`
  - `SafeMapView.tsx` : `"Position non définie"`, `"Ouvrir dans Maps"`
  - `ForceUpdateModal.tsx` : `"JitPlus Pro"` (marque — acceptable)
  - `categories.ts` : Labels français uniquement — pas traduit

### Recommandation
```
Sévérité : MOYENNE
→ Migrer les 15-20 strings hardcodés restants vers i18n
→ categories.ts : utiliser t(`categories.${category}`) au lieu de labels statiques
```

---

## 9. Composants Réutilisables

### Points forts — Excellente qualité

| Composant | Qualité | Notes |
|-----------|---------|-------|
| `ErrorBoundary` | ★★★★★ | Délègue au shared, Sentry intégré |
| `ScreenErrorBoundary` | ★★★★★ | Error boundary par route Expo Router |
| `CustomTabBar` | ★★★★☆ | Blur, gradient, memo, accessible |
| `Skeleton` | ★★★★☆ | Shimmer partagé, variants préconfigurés |
| `SafeMapView` | ★★★★☆ | Fallback Expo Go, multi-markers, ref forwarding |
| `ForceUpdateModal` | ★★★★☆ | Maintenance + version check, store redirect |
| `MerchantLogo` | ★★★★☆ | Fallback image, expo-image cache, memo |
| `BrandName` | ★★★★☆ | SVG gradient, unique ID per instance |
| `StampGrid` | ★★★★☆ | Mémoïsé, cap visuel, accessibilité |
| `OfflineBanner` | ★★★☆☆ | Délègue au shared — très mince |
| `FadeInView` | ★★★☆☆ | Animation enter, 4 directions |
| `MerchantCategoryIcon` | ★★★☆☆ | Mapping complet, helper hook |

> Les composants atomiques sont de bonne qualité. Le problème se situe dans les
> **screens monolithiques** qui ne les exploitent pas assez (les sections de 200+ lignes
> à l'intérieur des screens devraient être des composants séparés).

---

## 10. Configuration & Build

### Points forts
- **app.config.js** : bien structuré, permissions justifiées avec commentaires
- **Plugins custom** : `withCertificatePinning`, `withMoroccoRegion`, `withNetworkSecurity`, `withPrivacyManifest`
- **EAS Build** configuré (`eas.json`)
- **Sentry** intégré (error boundary + captureException)
- **tsconfig** : `strict: true`, paths alias `@/*`
- **ESLint** : expo + prettier, `no-explicit-any: warn` (pas off)
- **metro.config.js** inclut le workspace monorepo resolution

### Problème mineur
- **`.env` non gitignored ?** — `.env` est listé dans la structure (présence confirmée). Vérifier que `.gitignore` l'exclut bien. (✅ `.gitignore` est présent)

---

## 11. Hooks Custom — Revue de Qualité

| Hook | Qualité | Notes |
|------|---------|-------|
| `useExitOnBack` | ★★★★★ | Re-export shared — 0 duplication |
| `useGuardedCallback` | ★★★★★ | Re-export shared |
| `useNetworkStatus` | ★★★★★ | Re-export shared |
| `useForceUpdate` | ★★★★★ | Sémantique semver, cancelled flag, maintenance |
| `useQueryHooks` | ★★★★☆ | Centralisé, bien typé, stale times, -1 pour types inline |
| `useRealtimeEvents` | ★★★★☆ | WebSocket → invalidation cache, cleanup propre |
| `useStoresCRUD` | ★★★★☆ | React Query backed, guards, -1 pour Alert non i18n |
| `useGoogleAuth` | ★★★☆☆ | Processing ref bon, mais détection "no account" fragile (regex) |
| `useGoogleIdToken` | ★★★☆☆ | `processingRef.current = true` puis `= false` sans await entre — possible race |
| `useFocusFade` | ★★★☆☆ | Fonctionne, mais useRef(new Animated.Value) dans deps peut causer warning |

---

## 12. Résumé des Actions Recommandées

### Priorité 1 — Critiques (Impact fort sur la maintenabilité)

| # | Action | Effort | Fichiers |
|---|--------|--------|----------|
| 1 | **Découper les 5 god components** (> 900 lignes) en sous-composants | 3-5j | account, stores, messages, onboarding, scan-qr |
| 2 | **Ajouter des tests** pour hooks et utils critiques | 2-3j | useForceUpdate, useQueryHooks, authStore, imageUrl |
| 3 | **Centraliser les types API** dans types/index.ts | 0.5j | useQueryHooks.ts |

### Priorité 2 — Importants (Qualité & maintenabilité)

| # | Action | Effort | Fichiers |
|---|--------|--------|----------|
| 4 | Extraire `TRANSACTION_TYPE_CONFIG` (couleur, icône, label) | 0.5j | activity, client-detail |
| 5 | Migrer les ~20 strings hardcodés vers i18n | 1j | useStoresCRUD, StampGrid, SafeMapView, categories |
| 6 | Remplacer `Record<string, any>` par des interfaces typées | 0.5j | useStoresCRUD, useRecordTransaction |
| 7 | Mémoïser les rows de FlatList (TransactionRow, ClientRow) | 0.5j | activity, client-detail |
| 8 | Conditionner les queries au tab actif dans messages.tsx | 0.5j | messages |

### Priorité 3 — Améliorations (Nice-to-have)

| # | Action | Effort | Fichiers |
|---|--------|--------|----------|
| 9 | Extraire composant `ComposeCard` pour messages | 1j | messages |
| 10 | `useReducer` pour screens à 8+ useState | 1j | scan-qr, stores, settings |
| 11 | Créer `usePremiumGuard` hook pour feature gates | 0.5j | messages, dashboard, settings |
| 12 | Ajouter `accessibilityLabel` manquants | 0.5j | Tous les screens |

---

## 13. Nouveaux Problèmes Identifiés (Revue v2 — audit approfondi)

### 🔴 CRITIQUES (Nouveaux)

#### C-1. `useGoogleAuth` — Risque de boucle infinie de re-renders
**Fichier :** `hooks/useGoogleAuth.ts`  
Le callback `onCancel` est dans le tableau de dépendances du `useEffect`. Si le composant parent passe une arrow function inline, chaque render crée une nouvelle référence → l'effet se relance → boucle.  
**Fix :** Wrapper `onCancel` dans un `useRef` (pattern `onTokenRef` déjà utilisé dans `useGoogleIdToken`).

#### C-2. `AuthContext` — Closure stale dans `loadStoredAuth`
**Fichier :** `contexts/AuthContext.tsx`  
`loadStoredAuth` est une fonction déclarée dans le corps du composant, appelée dans un `useEffect([], [])` avec un tableau de dépendances vide. Elle capture `signOut` et `loadProfile` dans une closure stale.  
**Fix :** Déplacer la logique à l'intérieur du `useEffect` ou wrapper dans `useCallback` avec les bonnes deps.

#### C-3. `AuthContext` — Flux d'authentification dupliqué 3x
**Fichier :** `contexts/AuthContext.tsx`  
`signIn`, `googleLogin` et `googleRegister` partagent ~30 lignes identiques (sauvegarde tokens SecureStore, set merchant, sync onboarding, push token). Un fix sécurité doit être appliqué à 3 endroits.  
**Fix :** Extraire un helper `handleAuthSuccess(response: AuthResponse)`.

#### C-4. Google Client ID exposé en clair dans `eas.json`
**Fichier :** `eas.json`  
Le client ID Google (`290470991104-...`) est hardcodé dans les blocs preview et production au lieu d'utiliser les EAS Secrets.  
**Fix :** Utiliser `$EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` via les Secrets EAS.

#### C-5. Plugins conflictuels risquent un Denial of Service
**Fichiers :** `plugins/withCertificatePinning.js` + `plugins/withNetworkSecurity.js`  
Les deux plugins écrivent dans le même fichier `res/xml/network_security_config.xml`. Si les deux sont activés, le second écrase le premier silencieusement. De plus, `withCertificatePinning` utilise des hashes placeholder (`AAA...`, `BBB...`).  
**Fix :** Fusionner en un seul plugin ou ajouter une validation build-time contre les hashes placeholder.

---

### 🟠 HAUTS (Nouveaux)

#### H-7. `Skeleton.tsx` — Shimmer loop infinie en mémoire
**Fichier :** `components/Skeleton.tsx`  
`_shimmerProgress` est un `Animated.Value` au niveau module avec un `Animated.loop` qui tourne même quand aucun Skeleton n'est monté. Fuite mémoire en dev (hot reload accumule les listeners).  
**Fix :** Ref-counting : démarrer le loop au premier mount, l'arrêter au dernier unmount.

#### H-8. `BrandName.tsx` — Counter module-level incompatible React 18+
**Fichier :** `components/BrandName.tsx`  
`_idCounter` est un compteur incrémental au niveau module pour les IDs SVG. Non-déterministe en rendering concurrent.  
**Fix :** Utiliser `React.useId()` (disponible en React 19, la version de l'app).

#### H-9. `responsive.ts` — Globals mutables causent des snapshots stale
**Fichier :** `utils/responsive.ts`  
Les objets `SCREEN`, `radius`, `fontSize`, `iconSize` sont mutés dans un callback `Dimensions.addEventListener` mais les composants ne re-rendront jamais car ce ne sont pas des refs React.  
**Fix :** Convertir en hook `useDimensions()` ou documenter que ce sont des snapshots statiques.

#### H-10. `responsive.ts` — Typage faible `Record<string, number>`
Les exports `radius`, `fontSize`, `iconSize` utilisent `Record<string, number>` — toute typo (`fontSize.lgg`) retourne silencieusement `undefined` → `NaN` dans les styles.  
**Fix :** Utiliser des union types littéraux (`type FontSizeKey = 'xs' | 'sm' | 'md' | 'lg' | ...`).

#### H-11. `useRealtimeEvents.ts` — Query keys en string brut
**Fichier :** `hooks/useRealtimeEvents.ts`  
Les invalidations utilisent `['dashboard-stats']` en string brut au lieu du centralisé `queryKeys.dashboardStats(period)`. Fragile si la structure des clés change.  
**Fix :** Utiliser les query keys centralisés.

#### H-12. `geocodeCache.ts` — Cache FIFO au lieu de LRU + non-null assertion
**Fichier :** `utils/geocodeCache.ts`  
L'éviction supprime la première clé (FIFO) au lieu du moins récemment utilisé. Utilise `!` non-null assertion sur l'iterator.  
**Fix :** Implémenter un LRU simple (delete + re-insert au hit) ou utiliser une micro-lib.

#### H-13. Accessibilité systémiquement manquante
Quasiment aucun élément interactif n'a de `accessibilityLabel` ou `accessibilityRole` dans les screens (seul `legal.tsx` est correctement accessible).

---

### 🟡 MOYENS (Nouveaux)

| # | Problème | Fichier(s) |
|---|----------|------------|
| M-9 | ThemeContext : `success` et `warning` identiques à `primary` (violet) — sémantiquement incorrect | `ThemeContext.tsx` |
| M-10 | `currency.ts` : `toFixed()` utilise toujours `.` comme séparateur, devrait être `,` pour locale FR/MA | `config/currency.ts` |
| M-11 | `MerchantCategoryIcon` : descriptions hardcodées en français, pas i18n | `MerchantCategoryIcon.tsx` |
| M-12 | i18n arabe : `deleteConfirmKeyword = 'DELETE'` (anglais), pas de pluralisation arabe configurée | `i18n/ar.ts`, `i18n/index.ts` |
| M-13 | `ScreenErrorBoundary` : utilise `i18n.t()` directement — ne re-render pas au changement de langue | `ScreenErrorBoundary.tsx` |
| M-14 | Numéro de téléphone support hardcodé dans `account.tsx` (`33767471397`) | `app/(tabs)/account.tsx` |
| M-15 | `profile.tsx` et `my-qr.tsx` : plan fetché via `api.get()` + `useState` au lieu de `usePlan()` React Query | `profile.tsx`, `my-qr.tsx` |
| M-16 | QR card JSX dupliqué verbatim dans `my-qr.tsx` (copié-collé intra-fichier) | `my-qr.tsx` |
| M-17 | `useStoresCRUD.ts` : paramètre `silentLoadError` accepté mais jamais utilisé (dead code) | `useStoresCRUD.ts` |
| M-18 | `SafeMapView.tsx` : cast `(rest as any).onMapReady?.()` au lieu typer les props | `SafeMapView.tsx` |
| M-19 | `metro.config.js` : typo `monrepoPnpmStore` (il manque un `o` à monorepo) | `metro.config.js` |
| M-20 | `FadeInView.tsx` : 2x `eslint-disable exhaustive-deps` sans commentaire justificatif | `FadeInView.tsx` |
| M-21 | `useQueryHooks.ts` : construit manuellement le query string au lieu d'utiliser axios `params` | `useQueryHooks.ts` |

---

### 🟢 BAS (Nouveaux)

| # | Problème | Fichier(s) |
|---|----------|------------|
| L-9 | `authStore.ts` : `as` assertions inutiles sur `initialState` — préférer typage direct | `authStore.ts` |
| L-10 | `useGoogleIdToken.ts` : `processingRef.current = false` synchrone après callback — race si callback async | `useGoogleIdToken.ts` |
| L-11 | `useForceUpdate.ts` : `storeUrl` recalculé à chaque render — devrait être `useMemo` ou constant | `useForceUpdate.ts` |
| L-12 | `ForceUpdateModal.tsx` : import `Image` inutilisé | `ForceUpdateModal.tsx` |
| L-13 | `OfflineBanner.tsx` : wrapper trivial sans valeur ajoutée — import direct suffisant | `OfflineBanner.tsx` |
| L-14 | `StampGrid.tsx` : shim `Animated = { View }` trompeur — utiliser `View` directement | `StampGrid.tsx` |
| L-15 | `CustomTabBar.tsx` : tabs non-focused utilisent la même couleur que focused (doivent être `textMuted`) | `CustomTabBar.tsx` |
| L-16 | `villes.ts` : 20 villes marocaines uniquement — non extensible si expansion géographique | `villes.ts` |
| L-17 | `jest.config.js` : pas de `collectCoverage` ni `coverageThreshold` configurés | `jest.config.js` |
| L-18 | `tsconfig.json` : pas de pattern `exclude` (peut ralentir l'IDE sur `node_modules/`) | `tsconfig.json` |

---

## 14. Couverture de Tests (Mise à jour)

### État actuel : 4 fichiers de test

| Fichier | Ce qui est testé | Couverture |
|---------|-----------------|-----------|
| `__tests__/validation.test.ts` | `isValidEmail`, `isValidUUID`, `normalizePhone` | Adéquat |
| `__tests__/avatarColor.test.ts` | Déterminisme couleur, unicode | Adéquat |
| `__tests__/responsive.test.ts` | `wp`, `hp`, `ms` scaling | Adéquat |
| `__tests__/transactions.test.ts` | Config transactions, états annulation | Bon |

### Matrice de couverture

| Couche | Fichiers testables | Testés | Couverture |
|--------|-------------------|--------|------------|
| Utils | 9 | 4 (validation, phone, avatar, responsive) | ~44% |
| Hooks | 10 | 0 | 0% |
| Components | 14 | 0 | 0% |
| Screens | 22 | 0 | 0% |
| Contexts | 3 | 0 | 0% |
| Stores | 1 | 0 | 0% |
| **Total** | **59** | **4** | **~6.8%** |

> ⚠️ `@testing-library/react-native` n'est **pas dans les devDependencies** — ce qui explique l'absence totale de tests de composants.

---

## 15. Résumé des Actions Recommandées (Révisé)

### Priorité 1 — CRITIQUES (Impact sécurité et stabilité)

| # | Action | Effort | Fichiers |
|---|--------|--------|----------|
| 1 | **Ref-ifier `onCancel`** dans useGoogleAuth (risque boucle infinie) | 0.5h | useGoogleAuth.ts |
| 2 | **Stabiliser `loadStoredAuth`** (closure stale) | 1h | AuthContext.tsx |
| 3 | **Extraire `handleAuthSuccess()`** (flux auth dupliqué 3x) | 2h | AuthContext.tsx |
| 4 | **Déplacer Google Client ID** vers EAS Secrets | 0.5h | eas.json |
| 5 | **Résoudre conflit plugins** cert pinning / network security | 2h | plugins/ |

### Priorité 2 — HAUTS (Maintenabilité et fiabilité)

| # | Action | Effort | Fichiers |
|---|--------|--------|----------|
| 6 | **Découper les 7 god components** (> 700 lignes) en sous-composants | 3-5j | account, stores, messages, onboarding, scan-qr, transaction-amount, settings |
| 7 | **Ajouter tests hooks/stores** critiques | 2-3j | useForceUpdate, useQueryHooks, authStore, imageUrl |
| 8 | **Fixer Skeleton shimmer loop** (fuite mémoire) | 1h | Skeleton.tsx |
| 9 | **Remplacer `_idCounter`** par `React.useId()` | 0.5h | BrandName.tsx |
| 10 | **Typer `responsive.ts`** avec unions littéraux | 1h | responsive.ts |
| 11 | **Centraliser les types API** dans types/index.ts | 2h | useQueryHooks.ts |
| 12 | **Ajouter accessibilityLabel** sur tous les éléments interactifs | 1-2j | Tous screens |

### Priorité 3 — MOYENS (Qualité et UX)

| # | Action | Effort | Fichiers |
|---|--------|--------|----------|
| 13 | **Fix couleurs sémantiques** ThemeContext (success ≠ warning ≠ primary) | 0.5h | ThemeContext.tsx |
| 14 | **Migrer ~40 strings** hardcodés vers i18n + configurer pluralisation arabe | 1-2j | multiples |
| 15 | **Fix `currency.ts`** : utiliser `Intl.NumberFormat` pour le formatage locale | 1h | currency.ts |
| 16 | **Extraire `TRANSACTION_TYPE_CONFIG`** (couleur, icône, label) | 2h | activity, client-detail |
| 17 | **Conditionner queries** au tab actif dans messages.tsx | 1h | messages.tsx |
| 18 | **`useReducer`** pour screens à 8+ useState | 1j | scan-qr, stores, settings |
| 19 | **Remplacer `Record<string, any>`** par interfaces typées | 2h | useStoresCRUD, useRecordTransaction |
| 20 | **Installer `@testing-library/react-native`** et écrire tests composants critiques | 2j | package.json, __tests__/ |

### Priorité 4 — BAS (Nice-to-have)

| # | Action | Effort | Fichiers |
|---|--------|--------|----------|
| 21 | Nettoyer dead code (silentLoadError, Image import, OfflineBanner wrapper) | 1h | multiples |
| 22 | Documenter les `eslint-disable` avec justification | 0.5h | FadeInView.tsx |
| 23 | Ajouter `exclude` dans tsconfig.json | 0.5h | tsconfig.json |
| 24 | Configurer `coverageThreshold` dans jest.config.js | 0.5h | jest.config.js |

---

## Conclusion

JitPlus Pro est une application architecturalement solide, utilisant les **bons patterns modernes** (Zustand + React Query + Expo Router + shared monorepo). La couche de composants atomiques est de haute qualité (`ErrorBoundary`, `Skeleton`, `SafeMapView`, `ForceUpdateModal`). La sécurité applicative est correcte (anti-SSRF, SecureStore, refresh token rotation, network security config).

### Les 5 faiblesses majeures identifiées :

1. **Screens monolithiques** — 7 fichiers de 700-1400 lignes avec 6-12 `useState` chacun, rendant le code difficile à maintenir, tester et reviewer
2. **Couverture de tests à ~6.8%** — aucun test de composant, hook ou store, `@testing-library/react-native` manquant
3. **Closures stale + boucle de re-renders** dans AuthContext et useGoogleAuth — bugs latents critiques
4. **i18n incomplet** — ~40 strings hardcodés en français, pas de pluralisation arabe, catégories non traduites
5. **Accessibilité quasi absente** — `accessibilityLabel`/`accessibilityRole` manquants sur la majorité des éléments interactifs

### Investissement recommandé pour atteindre 8.5/10 :
- **Sprint 1 (1 semaine)** : Fixer les 5 critiques + shimmer leak + BrandName useId  
- **Sprint 2 (2 semaines)** : Découper les god components + installer testing library + écrire tests critiques  
- **Sprint 3 (1 semaine)** : Migration i18n complète + accessibilité + couleurs sémantiques
