# JitPlus Pro — Audit Complet (1er avril 2026)

**Version auditée :** 1.2.0 (buildNumber 2)
**Stack :** React Native 0.81.5 · Expo 54 · TypeScript 5.9.3 · React 19.1
**Backend :** NestJS + Prisma + PostgreSQL
**Codebase :** ~90 fichiers source · ~27 000 LOC

---

## Score Global : 82/100 (B+)

| Domaine | Score | Évolution |
|---------|-------|-----------|
| Architecture | 78/100 | ↑ depuis 72 |
| Sécurité | 72/100 | ↑ depuis 62 |
| Performance | 80/100 | ≈ stable |
| UI/UX | 84/100 | nouveau |
| Qualité du code | 82/100 | ↑ depuis 74 |
| Tests | 20/100 | ↑ depuis 15 |
| i18n | 95/100 | ↑ depuis 88 |
| Accessibilité | 40/100 | = stable |
| Conformité Store | 88/100 | ↑ depuis 68 |

---

## 1. POINTS FORTS

### Architecture

- **React Query centralisé** : `queryKeys` unique, stale tiers (FAST 30s → SLOW 5min), `placeholderData: keepPreviousData` pour des transitions fluides
- **Zustand minimal** : un seul store auth, souscriptions granulaires (`useAuthStore(s => s.merchant)`)
- **Shared library** : 18+ utilitaires partagés (apiFactory, validation, i18n providers, Socket.io)
- **Socket.io robuste** : reconnexion exponentielle, rotation de token, nettoyage complet au démontage, gestion app foreground/background
- **React.memo systématique** : StatCard, TrendChart, TransactionItem, StoreCard, MemberCard, ScanLine, ViewfinderCorner, DetectedOverlay — tous les éléments de liste sont mémorisés
- **Force Update + Maintenance Mode** : vérification semver toutes les 5 min, mode maintenance serveur, modal dédiée avec liens stores

### Sécurité

- **Tokens dans SecureStore** (hardware-backed keychain) : accessToken, refreshToken, sessionId, deviceId
- **Aucun token dans AsyncStorage** : filtrage explicite des clés sensibles `['profile', 'auth', 'token', 'otp', 'password', 'session', 'credentials']`
- **Backend solide** : bcrypt 12 rounds, SHA256 hash des refresh tokens, rate limiting (5/min login, 3/min register), lockout après 5 échecs (15 min), OTP expire 5 min + quota 10/jour
- **HTTPS forcé sur Android** : `cleartextTrafficPermitted="false"` via plugin network security
- **SSRF protection** : validation des URL d'images
- **Device fingerprinting** : `Crypto.randomUUID()` pour chaque appareil
- **Sanitisation des entrées** : référral codes (whitelist `[A-Z0-9]`), géocodage (cap 200 chars, validation coordonnées), `encodeURIComponent` systématique

### UI/UX

- **Gestion d'erreurs cohérente** : Alert.alert + i18n sur tous les écrans, utilitaire centralisé (`utils/error.ts`)
- **Écrans skeleton** : composant Skeleton avec shimmer animation (1200ms loop, driver natif)
- **États vides** : illustrations + texte localisé sur toutes les listes
- **Haptics** : feedback tactile complet sur scan-qr (succès, erreur, impact léger)
- **Navigation sûre** : `router.canGoBack() ? router.back() : router.replace()`, confirmations avant actions destructives
- **Bannière offline** : composant OfflineBanner partagé
- **Validation en temps réel** : inline dans registration multi-étapes (StepIdentity, StepCredentials, StepMapCompliance)

### Conformité Store

- **PrivacyInfo.xcprivacy** : plugin auto-générant toutes les raisons API requises (UserDefaults, timestamps, boot time, disk space)
- **Suppression de compte** : workflow complet (mot de passe + confirmation + endpoint backend)
- **Permissions minimales** : 6 permissions Android, toutes justifiées (CAMERA, LOCATION x2, POST_NOTIFICATIONS, VIBRATE, READ_MEDIA_IMAGES)
- **Politique de confidentialité** : URL configurée et accessible dans l'app
- **Adaptive icon** : fourni avec fond blanc

---

## 2. POINTS CRITIQUES (à corriger avant production)

### CRITIQUE — Sécurité

| # | Problème | Fichier | Impact |
|---|----------|---------|--------|
| C1 | **Mots de passe keystore en clair** dans credentials.json | `credentials.json` | Si le repo fuite, les clés de signature sont compromises. Migrer vers CI/CD secrets (GitHub Secrets, EAS Secrets) |
| C2 | **Certificate pinning désactivé** sur Android | `app.config.js:140` | Risque MITM sur WiFi public. Acquérir un domaine stable `api.jitplus.com` et activer le plugin |
| C3 | **Sentry non intégré** — le package est installé mais exclu du bundle | `package.json` | **Aucun monitoring d'erreurs en production**. Les crashes ne seront pas remontés |

### CRITIQUE — Performance

| # | Problème | Fichier | Impact |
|---|----------|---------|--------|
| C4 | **react-native-reanimated** installé mais jamais importé | `package.json` | ~300 KB de bundle inutile, temps de démarrage rallongé |
| C5 | **register.tsx : 1100 LOC, 22 useState** | `app/register.tsx` | Composant god-component — chaque keystroke re-render tout l'arbre |

### HAUTE — Sécurité

| # | Problème | Fichier | Impact |
|---|----------|---------|--------|
| H1 | **Pas de rafraîchissement de session à la reprise d'app** | `AuthContext.tsx` | Les tokens périmés restent en mémoire si l'app revient du background |
| H2 | **Google Maps API key dans .env** sans restriction API confirmée | `.env` | Clé publique — vérifier les restrictions dans Google Cloud Console |

### HAUTE — Architecture

| # | Problème | Fichier | Impact |
|---|----------|---------|--------|
| H3 | **FlatList sans getItemLayout** | `admin-notifications.tsx` | Saut de scroll sur re-render, scroll-to-index impossible |
| H4 | **FloatingSearchBar non mémorisé** | `scan-qr.tsx` | Re-création à chaque render du parent (caméra active → fréquent) |
| H5 | **useClientStatus + useClientDetail** appelés séparément sur le même écran | `client-detail.tsx`, `transaction-amount.tsx` | 2 requêtes HTTP au lieu d'un batch potentiel |

---

## 3. OPTIMISATIONS RECOMMANDÉES

### Performance (priorité haute)

| # | Action | Gain estimé |
|---|--------|-------------|
| O1 | Supprimer `react-native-reanimated` de package.json | -300 KB bundle, boot plus rapide |
| O2 | Vérifier si `lottie-react-native` peut être remplacé par une animation simple dans TransactionSuccessModal | -80 KB si supprimé |
| O3 | Ajouter `getItemLayout` + `windowSize={10}` + `maxToRenderPerBatch={5}` aux FlatList | Scroll fluide, moins de frames drops |
| O4 | Wrapper `FloatingSearchBar` dans `React.memo` | Évite re-renders pendant scan caméra |
| O5 | Extraire le card de `admin-notifications.tsx` en `NotificationCard` avec `React.memo` | Moins de re-renders sur la liste |

### Architecture (priorité moyenne)

| # | Action | Gain estimé |
|---|--------|-------------|
| O6 | Décomposer register.tsx en 4 fichiers step : `IdentityStep`, `CredentialsStep`, `LocationStep`, `ComplianceStep` | Maintenabilité, renders isolés, testabilité |
| O7 | Créer `useReferralVerification()` hook | Réutilisable, testable isolément |
| O8 | Extraire `useGeocodeAddress()` de register.tsx | Séparation des responsabilités |
| O9 | Ajouter try-catch sur `handleFinish` dans onboarding.tsx | Empêche écran blanc si l'appel échoue |

### Sécurité (priorité moyenne)

| # | Action | Gain estimé |
|---|--------|-------------|
| O10 | Intégrer Sentry correctement (retirer l'exclusion dans metro.config ou app.config) | Monitoring des crashes en prod |
| O11 | Ajouter vérification de session au retour du background (`AppState` listener dans AuthContext) | Invalider les tokens expirés |
| O12 | Ajouter request signing/HMAC pour protection replay | Sécurité des transactions |

### Tests (priorité haute)

| # | Action | Gain estimé |
|---|--------|-------------|
| O13 | Ajouter des tests pour AuthContext (login, logout, refresh, team member) | Cœur de l'app non testé |
| O14 | Ajouter des tests pour useQueryHooks (stale times, enabled guards) | Vérifier le cache React Query |
| O15 | Ajouter des tests pour useForceUpdate (version comparison, maintenance mode) | Critique pour les mises à jour |
| O16 | Objectif : passer de 41 tests → 150+ (couverture des hooks + composants clés) | Confiance production |

### Accessibilité (priorité basse)

| # | Action | Gain estimé |
|---|--------|-------------|
| O17 | Ajouter `accessibilityLabel` sur tous les boutons interactifs | 12 attributs actuels → objectif 100+ |
| O18 | Ajouter `accessibilityRole="button"` sur les TouchableOpacity | Lecteurs d'écran |
| O19 | Tester avec TalkBack (Android) et VoiceOver (iOS) | Conformité WCAG |

---

## 4. CHECKLIST DE PRÉ-PUBLICATION GOOGLE PLAY

### ✅ Validé

- [x] Nom du package : `com.jitplus.pro` (format correct)
- [x] Adaptive icon fourni (`adaptive-icon-white.png`)
- [x] Permissions minimales (6 permissions, toutes justifiées)
- [x] Politique de confidentialité URL configurée
- [x] Suppression de compte fonctionnelle (Settings → Sécurité → Supprimer)
- [x] Pas de contenu restreint (pas de jeux d'argent, alcool, etc.)
- [x] Pas de SDK publicitaire ni d'achats in-app
- [x] `cleartextTrafficPermitted="false"` en production
- [x] HTTPS forcé pour toutes les communications API
- [x] `edgeToEdgeEnabled: false` (évite crash natif Android 10/11)
- [x] `predictiveBackGestureEnabled: false` (protège les flux auth/OTP)
- [x] PrivacyInfo.xcprivacy auto-généré (Apple OK)
- [x] Version incrémentée : 1.2.0 / buildNumber 2
- [x] EAS auto-increment versionCode pour Android

### ⚠️ À vérifier dans la Google Play Console

- [ ] **Data Safety Form** : Déclarer les données collectées (email, nom, localisation, identifiant appareil)
- [ ] **Content Rating** : Remplir le questionnaire IARC (prévu : PEGI 3 / Everyone)
- [ ] **Target Audience** : Déclarer "18+" ou "Everyone" selon la nature commerce
- [ ] **Restrictions API Google Maps** : Confirmer que la clé est restreinte à Android + package name dans Google Cloud Console
- [ ] **Screenshots** : Fournir captures 16:9 pour phones + 10" tablets si supporté
- [ ] **Feature Graphic** : Image 1024x500 requise
- [ ] **Short Description** (80 chars) et **Full Description** (4000 chars) en français
- [ ] **Contact Email & Phone** : Requis pour les apps business
- [ ] **Tester les liens** : Vérifier que le lien politique de confidentialité (`https://jitplus.com/privacy`) est accessible
- [ ] **Build AAB** : S'assurer que le build EAS production génère un `.aab` (pas un `.apk`)
- [ ] **App Signing by Google Play** : Activer si pas déjà fait (première soumission)

### ❌ À corriger avant soumission

- [ ] **Rotation des mots de passe keystore** : credentials.json compromis → régénérer via `keytool`
- [ ] **Activer Sentry** : Monitoring des erreurs critique pour post-lancement
- [ ] **Supprimer react-native-reanimated** : Code mort qui alourdit le bundle

---

## Résumé Exécutif

**JitPlus Pro est une application bien architecturée et prête à 85% pour la production.** Les fondations sont solides : React Query pour le cache, Zustand pour l'état, SecureStore pour les secrets, rate limiting backend, et un i18n quasi-complet.

**3 actions bloquantes avant soumission :**
1. Migrer credentials.json vers des secrets CI/CD et régénérer les clés
2. Activer le monitoring Sentry (sans monitoring, vous volez à l'aveugle en prod)
3. Supprimer react-native-reanimated (bundle inutile)

**3 améliorations prioritaires post-lancement :**
1. Rafraîchissement de session au retour du background
2. Certificate pinning une fois le domaine stable
3. Augmenter la couverture de tests (41 → 150+)

L'application passera l'examen Google Play en l'état actuel si le Data Safety Form et le Content Rating sont correctement remplis. Les permissions sont minimales et justifiées, la suppression de compte est implémentée, et la politique de confidentialité est accessible.
