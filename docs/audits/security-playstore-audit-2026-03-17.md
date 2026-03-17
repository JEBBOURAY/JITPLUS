# Audit Sécurité & Conformité Google Play Store — JitPlus & JitPlus Pro

**Date :** 17 mars 2026  
**Auditeur :** GitHub Copilot  
**Scope :** Sécurité mobile (OWASP Mobile Top 10) + Conformité Google Play Store Policies 2025/2026  
**Stack :** Expo 54 / React Native 0.81.5 / React 19.1 / NestJS 11 / Prisma 5 / GCP Cloud Run  

---

## Verdict Global

| Domaine | Score | Statut |
|---------|-------|--------|
| **Sécurité Mobile** | **82 / 100** | ✅ Bon — 2 points MEDIUM à corriger |
| **Conformité Google Play** | **95 / 100** | ✅ Prêt — formulaire Data Safety à remplir |

---

# PARTIE 1 — AUDIT SÉCURITÉ

## S1. Stockage des tokens et données sensibles

### ✅ Tokens : SecureStore (chiffré)
| Donnée | Stockage | Chiffrement | App |
|--------|----------|-------------|-----|
| Access Token | SecureStore | ✅ Android Keystore | les 2 |
| Refresh Token | SecureStore | ✅ Android Keystore | les 2 |
| QR Token permanent | SecureStore | ✅ Android Keystore | JitPlus |
| Session ID | SecureStore | ✅ Android Keystore | JitPlus Pro |
| Device ID | SecureStore | ✅ Android Keystore | JitPlus Pro |
| rememberMe flag | SecureStore | ✅ Android Keystore | les 2 |

### ✅ Cache React Query : données sensibles filtrées
Les deux apps excluent les query keys sensibles de la persistance AsyncStorage :
```typescript
// packages/shared/src/createQueryPersister.ts
const SENSITIVE_KEYS = new Set(['profile', 'auth', 'token', 'otp', 'password', 'wallet', 'payment']);
```
JitPlus ajoute aussi un filtre inline dans `_layout.tsx` qui exclut `merchants-nearby`.

### ⚠️ MEDIUM — S1a. Profile draft en AsyncStorage non chiffré
**Fichier :** `apps/jitplus/app/(tabs)/profile.tsx` ligne 95  
**Risque :** Quand l'utilisateur modifie son profil et met l'app en arrière-plan, les données (nom, email, téléphone, date de naissance) sont sauvegardées en clair dans AsyncStorage.  
**Impact :** Un attaquant avec accès physique au device (ADB) pourrait extraire ces données.  
**Atténuation :** Les données sont supprimées au logout et à la soumission du formulaire.  
**Recommandation :** Utiliser SecureStore pour le draft ou chiffrer avant persistance.

### ✅ Zustand stores : mémoire uniquement
Aucun store Zustand ne persiste sur disque — données uniquement en RAM.

---

## S2. Authentification et gestion de session

### ✅ Protection brute-force côté serveur
| Protection | Valeur | Implémentation |
|------------|--------|----------------|
| Max tentatives OTP | 5 | `MAX_OTP_ATTEMPTS` dans DB, compteur incrémenté |
| Expiration OTP | 5 minutes | `OTP_EXPIRY_MS = 300_000` |
| Cooldown entre OTP | 60 secondes | `OTP_COOLDOWN_MS = 60_000` |
| Max tentatives login | 10 | `MAX_LOGIN_ATTEMPTS` avec lockout DB |
| Lockout login | 15 minutes | `LOGIN_LOCKOUT_MINUTES = 15` |
| Throttle API | 10 req/60s sur auth | `@Throttle({ default: { ttl: 60_000, limit: 10 } })` |
| Hashing OTP | SHA-256 | Jamais stocké en clair |
| Hashing mot de passe | bcryptjs (12 rounds) | Standard industrie |
| Anti-énumération | Dummy hash | Réponse identique user existe/n'existe pas |

### ✅ Token refresh sécurisé
- File d'attente : Multiples 401 → un seul refresh (`isRefreshing` + `refreshQueue`)
- Routes auth exclues du refresh automatique
- Callback d'échec : Clear tokens + redirection login
- Backoff exponentiel : 1s → 2s → 4s, max 30s, max 2 retries

### ⚠️ LOW — S2a. rememberMe defaults à `true` en cas d'erreur SecureStore
**Fichier :** `apps/jitplus/services/api.ts` ligne 315-320  
**Risque :** Si SecureStore échoue en lecture, `getRememberMe()` retourne `true` → tokens persistés par défaut.  
**Impact :** Très faible — SecureStore ne devrait pas échouer sur Android avec Keystore.  
**Recommandation :** Changer le fallback à `false`.

### ✅ Logout avec cleanup complet
- Tentative de révocation serveur (2 retries)
- Clear local tokens même si serveur échoue
- Suppression du profile_draft AsyncStorage
- Reset des stores Zustand

---

## S3. Communication réseau

### ✅ HTTPS obligatoire
```typescript
// packages/shared/src/apiFactory.ts
if (!isDev && !url.startsWith('https://')) {
  throw new Error('[SECURITY] API URL must use HTTPS in production!');
}
```
- Plugin `withNetworkSecurity.js` : bloque le cleartext (HTTP) sur Android
- Exception uniquement pour `localhost` et `10.0.2.2` (émulateur) en dev

### ✅ WebSocket sécurisé (WSS)
- Transport WebSocket uniquement côté client (`transports: ['websocket']`)
- JWT dans `auth.token` lors du handshake
- Refresh du token avant chaque reconnexion
- Circuit breaker après 5 échecs d'auth consécutifs
- Vérification JWT + rooms isolées par utilisateur côté serveur

### ⚠️ MEDIUM — S3a. Certificate pinning désactivé
**Raison :** L'API utilise Cloud Run (`*.a.run.app`) dont le certificat wildcard fait rotation automatique.  
**Plugin prêt :** `withCertificatePinning.js` existe et est fonctionnel.  
**Action :** Activer après migration vers domaine custom (`api.jitplus.ma`).

### ⚠️ LOW — S3b. Backend autorise le polling HTTP pour WebSocket
**Fichier :** `apps/backend/src/events/events.gateway.ts`  
**Détail :** `transports: ['websocket', 'polling']` côté serveur.  
**Atténuation :** Le client force `['websocket']` uniquement.  
**Recommandation :** Retirer `'polling'` côté serveur pour durcir.

---

## S4. Validation des entrées et injection

### ✅ Aucune injection SQL
- Prisma ORM utilisé exclusivement — aucun `$queryRaw` / `$executeRaw`
- Toutes les requêtes sont paramétrées et typées

### ✅ Aucun XSS
- Pas de `dangerouslySetInnerHTML` avec données utilisateur
- Pas de WebView embarqué
- Sanitisation des noms : `text.replace(/[^a-zA-Z\u00C0-\u024F\s'-]/g, '')`

### ✅ Validation backend robuste
| Mécanisme | Statut |
|-----------|--------|
| class-validator DTOs | ✅ Actif globalement |
| `whitelist: true` | ✅ Strip propriétés inconnues |
| `forbidNonWhitelisted: true` | ✅ Rejette propriétés inconnues |
| Regex mot de passe | `/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/` — 8+ chars |
| Validation téléphone | `/^\+\d{10,15}$/` + validation par pays (40+ pays) |
| OTP exactement 6 chiffres | `@Length(6,6)` |
| Upload MIME whitelist | `image/jpeg`, `image/png`, `image/webp` |
| Upload taille max | 2 MB |
| Noms de fichiers UUID | `randomUUID()` — aucun path traversal possible |

### ✅ Aucun RCE / Command injection
- Pas de `exec()`, `spawn()`, `eval()` dans le code source
- Pas de ReDoS (regex simples, pas de backtracking catastrophique)

---

## S5. Sécurité du backend (headers, CORS, sanitisation)

### ✅ Headers de sécurité (Helmet)
| Header | Configuration |
|--------|---------------|
| HSTS | `max-age=31536000; includeSubDomains; preload` |
| CSP (prod) | `default-src 'none'; script-src 'self'; frame-ancestors 'none'` |
| X-Frame-Options | ✅ DENY (via Helmet) |
| X-Content-Type-Options | ✅ nosniff |
| X-XSS-Protection | ✅ Activé |

### ✅ CORS strict en production
```typescript
if (isProd && !corsOrigins) throw new Error('[SECURITY] CORS_ORIGINS must be defined');
if (isProd && corsOrigins === '*') throw new Error('[SECURITY] CORS_ORIGINS must not be "*"');
```

### ✅ Errors sanitisées
- Stack traces jamais envoyées au client
- Erreurs Prisma mappées en messages français génériques
- Codes HTTP corrects (409, 400, 401, etc.)

---

## S6. Gestion des secrets

### ✅ Aucun secret hardcodé
| Élément | Méthode | Statut |
|---------|---------|--------|
| JWT_SECRET | Env var (vérifié ≥ 32 chars au boot) | ✅ |
| Firebase Private Key | Env var | ✅ |
| Twilio SID/Auth Token | Env var | ✅ |
| Sentry DSN | EAS Secrets (EXPO_PUBLIC_*) | ✅ |
| Google Maps API Key | EAS Secrets | ✅ |
| Database URL | GCP Secret Manager | ✅ |
| Keystores | Gérés par EAS Build | ✅ |

### ✅ .gitignore complet
Fichiers exclus : `.env*`, `*.keystore`, `*.jks`, `*.p12`, `*.pem`, `play-store-key.json`, `google-services.json`

### ✅ Dépendances à jour
- Overrides de sécurité proactifs dans `package.json` root (lodash, undici, tar, fast-xml-parser)
- Aucune dépendance avec CVE critique connue

---

## S7. Protection des données utilisateur

### ✅ Export de données personnelles (RGPD)
- Feature implémentée : `api.exportPersonalData()` → fichier JSON partageable
- **Note :** Le fichier exporté est en clair et non supprimé automatiquement après partage.

### ✅ Suppression de compte
| App | Mécanisme |
|-----|-----------|
| JitPlus | Password + mot-clé "SUPPRIMER" + confirmation API |
| JitPlus Pro | Password + confirmation modale + API `/merchant/delete-account` |

### ✅ Sentry configuré pour la vie privée
- `attachScreenshot: false` — pas de captures d'écran
- `attachViewHierarchy: false` — pas de texte UI exposé
- Console.log uniquement en `__DEV__` — aucun log de données sensibles en production

---

## S8. Points manquants (non-bloquants)

| # | Point | Sévérité | Détail |
|---|-------|----------|--------|
| 1 | Pas de protection screenshot | LOW | Aucun `FLAG_SECURE` sur les écrans sensibles (profil, paiement). Non requis par Play Store. |
| 2 | Pas de blur en arrière-plan | LOW | L'UI reste visible dans l'app switcher. Cosmétique. |
| 3 | Pas d'auth biométrique | LOW | Pas de second facteur pour les opérations sensibles. À ajouter post-launch. |
| 4 | Fichier d'export non supprimé | LOW | `jitplus-donnees-personnelles.json` reste dans documentDirectory après partage. |

---

# PARTIE 2 — CONFORMITÉ GOOGLE PLAY STORE

## P1. Niveau d'API cible

| Paramètre | Requis (Google Play 2025) | Valeur actuelle | Statut |
|-----------|---------------------------|-----------------|--------|
| targetSdkVersion | ≥ 35 (août 2025) | **35** | ✅ |
| compileSdkVersion | ≥ 34 | **35** | ✅ |
| minSdkVersion | — | **24** (Android 7.0) | ✅ |

---

## P2. Permissions Android

### JitPlus (client)
| Permission | Justification Play Store | Statut |
|------------|--------------------------|--------|
| `ACCESS_FINE_LOCATION` | Découverte de commerces à proximité | ✅ Justifiée |
| `ACCESS_COARSE_LOCATION` | Fallback location | ✅ Justifiée |
| `POST_NOTIFICATIONS` | Notifications push (Android 13+) | ✅ Justifiée |
| `VIBRATE` | Feedback notifications | ✅ Justifiée |

**Permissions bloquées explicitement :**
- `WRITE_SETTINGS`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `SYSTEM_ALERT_WINDOW`

### JitPlus Pro (marchand)
| Permission | Justification Play Store | Statut |
|------------|--------------------------|--------|
| `CAMERA` | Scanner QR code clients | ✅ Justifiée |
| `READ_MEDIA_IMAGES` | Upload logo/couverture (Android 13+) | ✅ Justifiée |
| `ACCESS_FINE_LOCATION` | Placement boutique sur carte | ✅ Justifiée |
| `POST_NOTIFICATIONS` | Alertes nouvelles visites | ✅ Justifiée |

**Permissions dangereuses absentes (bien) :**
- ❌ Pas de `READ_CONTACTS`, `READ_PHONE_STATE`, `RECORD_AUDIO`, `READ_SMS`
- ❌ Pas de `ACCESS_BACKGROUND_LOCATION`
- ❌ Pas de `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`
- ❌ Pas de foreground service

---

## P3. Photo Picker (Politique 2024)

| Aspect | Requis | Statut |
|--------|--------|--------|
| Utilise Photo Picker API moderne | ✅ Oui | `expo-image-picker` → `READ_MEDIA_IMAGES` |
| N'utilise PAS `READ_EXTERNAL_STORAGE` | ✅ Correct | Bloqué dans blockedPermissions |
| Microphone désactivé pour caméra QR | ✅ Correct | Microphone explicitement off |

---

## P4. Politique de confidentialité

| Critère | Statut |
|---------|--------|
| URL configurée dans app.config.js | ✅ `https://jitplus.com/privacy` |
| Écran légal in-app | ✅ 3 langues (FR/EN/AR) |
| Mention du chiffrement des données | ✅ |
| Droit de suppression de compte | ✅ |
| Droit d'export des données | ✅ |

---

## P5. Formulaire Data Safety (ce que vous devez remplir)

### JitPlus (client) — Déclarations requises

| Type de données | Collecté | Partagé | Optionnel | Chiffré en transit | Suppression possible |
|-----------------|----------|---------|-----------|--------------------|--------------------|
| Téléphone | ✅ | ❌ | ❌ Requis | ✅ HTTPS | ✅ Suppression compte |
| Nom & Email | ✅ | ❌ | ✅ Optionnel | ✅ HTTPS | ✅ Suppression compte |
| Date de naissance | ✅ | ❌ | ✅ Optionnel | ✅ HTTPS | ✅ Suppression compte |
| Position approximative | ✅ | ❌ | ✅ | ✅ HTTPS | N/A (pas stockée) |
| Historique transactions | ✅ | ❌ | ❌ | ✅ HTTPS | ✅ Suppression compte |
| Crash logs (Sentry) | ✅ | ✅ Sentry | ❌ Auto | ✅ HTTPS | ✅ Rétention Sentry |
| Push token (Firebase) | ✅ | ✅ Google | ❌ Auto | ✅ HTTPS | ✅ Suppression compte |

**N'est PAS collecté :**
- ❌ Contacts, journal d'appels, SMS
- ❌ IMEI, numéro de série, advertising ID
- ❌ Photos (sauf upload explicite dans Pro)
- ❌ Données financières/paiement
- ❌ Données de santé

### JitPlus Pro (marchand) — Déclarations supplémentaires

| Type de données | Collecté | Partagé | Chiffré |
|-----------------|----------|---------|---------|
| Photos (logo/couverture) | ✅ | ❌ (GCS privé) | ✅ |
| Données d'équipe | ✅ | ❌ | ✅ |
| Position exacte (boutique) | ✅ | ✅ Visible sur carte clients | ✅ |

---

## P6. Suppression de compte (Politique Google Play 2024)

> **Google Play exige** que les apps permettant la création de compte doivent aussi offrir la suppression de compte in-app.

| Critère | JitPlus | JitPlus Pro |
|---------|---------|-------------|
| Bouton de suppression in-app | ✅ Section profil | ✅ Section sécurité |
| Confirmation requise | ✅ Mot de passe + "SUPPRIMER" | ✅ Mot de passe + modale |
| Suppression côté serveur | ✅ `/client-auth/delete-account` | ✅ `/merchant/delete-account` |
| Message de confirmation | ✅ 3 langues | ✅ 3 langues |

---

## P7. Publicité et monétisation

| Critère | Statut |
|---------|--------|
| SDK publicitaire (AdMob, etc.) | ❌ Aucun |
| Achats in-app | ❌ Aucun |
| Abonnements | JitPlus Pro uniquement (prix clair) |
| Dark patterns | ❌ Aucun détecté |
| Contenu trompeur | ❌ Aucun |

---

## P8. Enfants et COPPA

| Critère | Statut |
|---------|--------|
| Cible les moins de 13 ans | ❌ Non |
| Restriction d'âge | ✅ 18+ |
| Contenu pour enfants | ❌ Aucun |
| SDK orientés enfants | ❌ Aucun |
| Content rating attendu | PEGI 3+ |

---

## P9. Comportement de l'application

| Critère | Statut |
|---------|--------|
| Exécution de code à runtime | ❌ Pas de eval/exec (OTA via Expo seulement) |
| Fonctionnalités cachées | ❌ Aucune |
| Permissions utilisées comme déclarées | ✅ |
| Pas de téléchargement APK externe | ✅ |

---

## P10. Store Listing (à préparer)

| Élément | Statut | Action requise |
|---------|--------|----------------|
| Nom d'app (≤ 30 chars) | ✅ "JitPlus" / "JitPlus Pro" | — |
| Icône 512×512 | ✅ Configurée | — |
| Screenshots (2-5) | ⚠️ À créer | Capturer les écrans principaux |
| Feature Graphic (1024×500) | ⚠️ À créer | Design requis |
| Description courte (≤ 80 chars) | ⚠️ À rédiger | — |
| Description longue (≤ 4000 chars) | ⚠️ À rédiger | — |
| Catégorie | Shopping / Business | — |
| Content rating (questionnaire) | ⚠️ À remplir | Automatique via Play Console |

---

## P11. Android App Links (optionnel, post-launch)

| Aspect | Statut |
|--------|--------|
| Custom URL schemes | ✅ `jitplus://` et `jitpluspro://` fonctionnels |
| HTTPS verified links | ⏳ Nécessite `.well-known/assetlinks.json` |
| Digital Asset Links | ⏳ Non configuré |

**Non requis pour le launch.** Les custom schemes fonctionnent déjà.

---

# RÉSUMÉ DES ACTIONS

## Actions sécurité à prendre

| # | Action | Sévérité | Effort |
|---|--------|----------|--------|
| 1 | Migrer le profile_draft vers SecureStore ou chiffrer | MEDIUM | 30min |
| 2 | Activer certificate pinning après domaine custom | MEDIUM | 2h |
| 3 | Changer `getRememberMe()` → fallback `false` | LOW | 5min |
| 4 | Retirer `'polling'` des transports WebSocket backend | LOW | 5min |
| 5 | Auto-supprimer le fichier d'export après partage | LOW | 10min |
| 6 | Ajouter `FLAG_SECURE` sur écrans sensibles | LOW | 1h |

## Actions Google Play Store

| # | Action | Priorité | Effort |
|---|--------|----------|--------|
| 1 | Remplir le formulaire Data Safety (voir section P5) | ✅ Requis | 30min |
| 2 | Créer screenshots pour les deux apps | ✅ Requis | 2h |
| 3 | Créer Feature Graphic (1024×500) | ✅ Requis | 1h |
| 4 | Rédiger descriptions courte/longue | ✅ Requis | 1h |
| 5 | Remplir le questionnaire Content Rating | ✅ Requis | 15min |
| 6 | Configurer les EAS Secrets (Sentry + Google Maps) | ✅ Requis | 15min |
| 7 | Build production : `eas build --platform android` | ✅ Requis | 30min |

---

## Score détaillé

### Sécurité (82/100)

| Catégorie | Score | Détail |
|-----------|-------|--------|
| Stockage tokens | 10/10 | SecureStore partout |
| Cache données | 8/10 | -2 profile_draft en clair |
| Auth & session | 10/10 | Serveur rate limit + lockout + hash |
| Réseau HTTPS | 8/10 | -2 cert pinning désactivé |
| Validation input | 10/10 | Prisma + class-validator + sanitize |
| Headers backend | 10/10 | Helmet + CSP + CORS strict |
| Gestion secrets | 10/10 | Aucun hardcode, GCP Secret Manager |
| Dépendances | 10/10 | À jour, overrides proactifs |
| Protection écran | 3/5 | Pas de FLAG_SECURE ni blur |
| Export données | 3/5 | Fichier non supprimé après partage |

### Play Store (95/100)

| Catégorie | Score | Détail |
|-----------|-------|--------|
| Target SDK | 10/10 | SDK 35, conforme 2025 |
| Permissions | 10/10 | Justifiées, excès bloqués |
| Privacy Policy | 10/10 | URL + écran in-app trilingue |
| Suppression compte | 10/10 | Les deux apps |
| Data Safety déclarations | 10/10 | Prêt à déclarer |
| Photo Picker | 10/10 | API moderne, pas de READ_EXTERNAL |
| Publicité/monétisation | 10/10 | Propre |
| Enfants/COPPA | 10/10 | 18+, pas de contenu enfant |
| Comportement app | 10/10 | Pas de code dynamique |
| Store Listing | 5/10 | Screenshots + descriptions à créer |
