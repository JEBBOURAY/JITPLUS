# Audit Complet Android Production — JitPlus & JitPlus Pro

**Date :** 17 mars 2026  
**Auditeur :** GitHub Copilot  
**Scope :** Préparation Android pour release Google Play Store  
**Stack :** Expo 54 / React Native 0.81.5 / React 19.1 / New Architecture  

---

## Verdict Global (après corrections)

| App | Score | Statut |
|-----|-------|--------|
| **JitPlus** (client) | **85 / 100** | **GO** — actions manuelles restantes ci-dessous |
| **JitPlus Pro** (marchand) | **86 / 100** | **GO** — actions manuelles restantes ci-dessous |

> Tous les bloquants corrigibles par code ont été résolus. Les apps sont prêtes pour soumission Google Play Store une fois les **3 actions manuelles** ci-dessous effectuées.

---

## 1. CORRECTIONS APPLIQUÉES

### ✅ B1. Plugin Sentry Expo — CORRIGÉ
Le plugin `@sentry/react-native/expo` a été activé dans les deux `app.config.js`.
Cela permettra l'upload automatique des source maps et la symbolication des crashs natifs.

### ✅ B3. Network Security Config — CORRIGÉ
Un nouveau plugin `withNetworkSecurity.js` a été créé et activé pour les **deux apps**.
Il génère un `network_security_config.xml` qui :
- Bloque le trafic cleartext (HTTP) en production
- Autorise localhost/emulateur pour le développement
- Référence automatiquement la config dans AndroidManifest

### ✅ ScreenErrorBoundary (JitPlus Pro) — CORRIGÉ
Le composant `ScreenErrorBoundary.tsx` a été créé pour JitPlus Pro avec :
- Capture Sentry des crashs par écran
- UI de retry avec support dark mode
- Messages d'erreur i18n (fr/en/ar)

### ✅ Clés i18n erreurs (JitPlus Pro) — CORRIGÉ
Les clés `errors.somethingWentWrong` et `errors.unexpectedError` ont été ajoutées aux 3 locales (fr/en/ar).

---

## 2. CE QUI RESTE À FAIRE MANUELLEMENT (avant `eas build`)

### M1. Configurer les EAS Secrets Sentry
```bash
# Pour JitPlus (client)
eas secret:create --scope project --name SENTRY_ORG --value "<your-org>"
eas secret:create --scope project --name SENTRY_PROJECT --value "<jitplus-project>"
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value "<token>"
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value "<dsn>"

# Pour JitPlus Pro (marchand)
cd apps/jitpluspro
eas secret:create --scope project --name SENTRY_ORG --value "<your-org>"
eas secret:create --scope project --name SENTRY_PROJECT --value "<jitpluspro-project>"
eas secret:create --scope project --name SENTRY_AUTH_TOKEN --value "<token>"
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN_PRO --value "<dsn>"
```

### M2. Configurer le Google Maps API Key
Dans la console Google Cloud :
- **Restriction d'application** : Android apps → SHA-1 + package name (`com.jitplus.client` et `com.jitplus.pro`)
- **Restriction d'API** : Maps SDK for Android uniquement
```bash
eas secret:create --scope project --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY --value "<restricted-key>"
```

### M3. Lancer le prebuild clean + build
```bash
# JitPlus
cd apps/jitplus
npx expo prebuild --clean
eas build --platform android --profile production

# JitPlus Pro
cd apps/jitpluspro
npx expo prebuild --clean
eas build --platform android --profile production
```

---

## 3. RISQUES HAUTS (à adresser dans le 1er mois)

### H1. Couverture de tests minimale

| Métrique | JitPlus | JitPlus Pro | Shared |
|----------|---------|-------------|--------|
| Fichiers testés | 1 | 1 | 0 |
| Tests | 11/11 ✅ | 14/14 ✅ | 0 |
| Couverture estimée | ~1% | ~1% | 0% |
| E2E tests | ❌ | ❌ | — |

**Impact :** Régressions non détectées, aucun test sur :
- `apiFactory.ts` (retry, refresh token, queue)
- `useRealtimeSocket.ts` (WebSocket reconnection)
- Flows auth (login, register, OTP, Google)
- Navigation / deep links

---

### H2. CI/CD ne teste pas les apps mobiles

Le fichier `cloudbuild.yaml` ne contient que le déploiement backend :
- ❌ Pas d'étape lint pour les apps
- ❌ Pas d'étape test pour les apps
- ❌ Pas de type-check pour les apps
- ❌ Pas de build EAS automatisé

---

### H3. OTA Updates désactivées

```xml
<!-- AndroidManifest.xml (les deux apps) -->
<meta-data android:name="expo.modules.updates.ENABLED" android:value="false"/>
```

**Impact :** Impossible de pousser des hotfixes JS sans passer par une review Play Store (~2-7 jours).

**Fix :** Activer `expo-updates` avec `expo.modules.updates.ENABLED=true` et configurer la channel.

---

## 4. RISQUES MOYENS

### M1. Certificate Pinning — en attente de domaine personnalisé
L'API utilise actuellement `*.a.run.app` (Google Cloud Run) dont le certificat SSL wildcard est **rotationné automatiquement** par Google. Le certificate pinning ne peut pas être activé sur ce domaine sans risquer des pannes.

**Action :** Configurer un domaine personnalisé (`api.jitplus.ma`) avec certificat géré, puis :
1. Extraire le pin hash : `openssl s_client -connect api.jitplus.ma:443 | openssl x509 -pubkey | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | base64`
2. Mettre à jour `plugins/withCertificatePinning.js` avec les vrais hashes
3. Décommenter le plugin dans les deux `app.config.js`

### M2. Google Maps API Key — restrictions à vérifier
La clé Maps est injectée dynamiquement via `app.config.js` depuis `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`. Vérifier dans Google Cloud Console que la clé a :
- **Restriction d'application** : Android (SHA-1 + package name) pour les deux packages
- **Restriction d'API** : Maps SDK for Android uniquement

### M3. allowBackup="true" dans les deux AndroidManifest
Les données de l'app peuvent être sauvegardées sur Google Cloud. `fullBackupContent` et `dataExtractionRules` sont configurés pour SecureStore, mais envisager `allowBackup="false"` pour une sécurité maximale.

### M4. EX_DEV_CLIENT_NETWORK_INSPECTOR=true (les deux apps)
Flag de développement dans `gradle.properties`. Non critique car seul le dev client l'utilise, mais devrait être désactivé pour les builds de prod.

### M5. Pas de deep linking vérifié (Android App Links)
Les deux apps supportent les custom schemes (`jitplus://`, `jitpluspro://`) mais pas les Android App Links (HTTPS verified). Pas de fichier `.well-known/assetlinks.json` configuré côté serveur.

---

## 4. CE QUI EST BIEN (Points forts)

### Architecture & Stack
- ✅ **Expo 54 + React Native 0.81.5 + React 19.1** — versions récentes, new architecture activée
- ✅ **Hermes Engine** activé — performance JS optimale
- ✅ **R8 minification + resource shrinking** activés → ~30-40% réduction APK
- ✅ **ProGuard rules complètes** — React Native, Firebase, Sentry, OkHttp, Maps, SVG, Socket.IO
- ✅ **Monorepo pnpm** bien structuré avec shared package

### Sécurité
- ✅ **Tokens dans SecureStore** (chiffré on-device) avec fallback mémoire
- ✅ **Token refresh avec queue** — pas de race conditions
- ✅ **HTTPS enforced** dans `apiFactory.ts` en production
- ✅ **Console.log gardés** par `__DEV__` dans la quasi-totalité du code
- ✅ **.gitignore correct** — .env, play-store-key.json, *.keystore exclus
- ✅ **android/ dans .gitignore** → les fichiers prebuild (AndroidManifest, build.gradle) ne sont pas commités
- ✅ **Secrets via EAS** — $ENV_VAR syntax, pas de valeurs en dur dans eas.json
- ✅ **PII protection** — `attachScreenshot: false`, `attachViewHierarchy: false` dans Sentry
- ✅ **Permissions minimales** — pas de WRITE_EXTERNAL_STORAGE, SYSTEM_ALERT_WINDOW bloquées

### UX & Performance
- ✅ **React Query** avec SWR pattern, cache persisté, stales optimisées
- ✅ **WebSocket temps réel** avec reconnexion auto + fallback FCM
- ✅ **Offline detection + banner** visible
- ✅ **Memoization** correcte sur les composants fréquemment re-rendus
- ✅ **RTL support** natif
- ✅ **i18n** avec 3 locales (fr/en/ar)
- ✅ **ErrorBoundary** avec Sentry + UI retry à 2 niveaux (app + screen)

### Build & Release
- ✅ **EAS project IDs valides** (pas de placeholders)
- ✅ **autoIncrement: true** sur les builds de production
- ✅ **appVersionSource: "remote"** — version gérée par EAS
- ✅ **Privacy Policy URL** configuré
- ✅ **Firebase config** correcte pour les deux packages
- ✅ **GIF + WebP** support activé

---

## 5. COMPARAISON JitPlus vs JitPlus Pro

| Catégorie | JitPlus (client) | JitPlus Pro (marchand) |
|-----------|-------------------|------------------------|
| **Version** | 1.1.0 | 1.0.0 |
| **Package** | com.jitplus.client | com.jitplus.pro |
| **Sentry init** | ✅ | ✅ |
| **Sentry plugin** | ✅ Activé | ✅ Activé |
| **Certificate pinning** | ⏳ Domaine custom requis | ⏳ Domaine custom requis |
| **Network security XML** | ✅ Plugin ajouté | ✅ Plugin ajouté |
| **API URL validation** | ✅ | ✅ |
| **ScreenErrorBoundary** | ✅ | ✅ Ajouté |
| **SafeMapView fallback** | Texte simple | ✅ OSM + "Ouvrir dans Maps" |
| **Camera permission** | Non utilisée | ✅ QR scanner |
| **Image picker** | Non utilisée | ✅ Logo/couverture |
| **ProGuard rules** | ✅ Basiques | ✅ Étendues (Lottie, ML Kit, Fabric) |
| **Blocked permissions** | ✅ Explicite | Via .gitignore patterns |
| **Privacy manifest (iOS)** | ✅ Client data | ✅ Merchant data |
| **Tests** | 11 ✅ | 14 ✅ |

---

## 6. PLAN D'ACTION RESTANT

### Avant `eas build` (actions manuelles)
| # | Action | Effort |
|---|--------|--------|
| 1 | Configurer EAS Secrets Sentry (DSN, ORG, PROJECT, AUTH_TOKEN) | 15min |
| 2 | Configurer EAS Secret Google Maps API Key (avec restrictions) | 15min |
| 3 | `npx expo prebuild --clean` + `eas build --platform android` | 30min |

### Dans le 1er mois en production
| # | Action | Effort |
|---|--------|--------|
| 4 | Tests unitaires `apiFactory`, `useRealtimeSocket` (shared) | 1j |
| 5 | Étapes lint+test+typecheck dans CI/CD | 2h |
| 6 | Activer OTA updates (expo-updates) | 2h |
| 7 | Restreindre la clé Google Maps (Cloud Console) | 15min |
| 8 | Configurer domaine custom + certificate pinning | 2h |

### Post-launch
| # | Action | Effort |
|---|--------|--------|
| 9 | Tests E2E avec Maestro | 3-5j |
| 10 | Android App Links (.well-known/assetlinks.json) | 1h |
| 11 | Audit accessibilité (labels, contraste, font scaling) | 2j |
| 12 | Couverture tests > 40% | 1 sem |

---

## 7. DÉTAILS TECHNIQUES

### Versions des dépendances clés
| Package | Version | Statut |
|---------|---------|--------|
| expo | ~54.0.33 | ✅ Stable |
| react-native | 0.81.5 | ✅ New Arch |
| react | 19.1.0 | ✅ Concurrent |
| @sentry/react-native | ^8.2.0 | ✅ Récent |
| @tanstack/react-query | ^5.90.21 | ✅ |
| socket.io-client | ^4.8.3 | ✅ |
| expo-secure-store | ~15.0.8 | ✅ |
| typescript | ~5.9.2 | ✅ Strict mode |

### Configuration Android
| Paramètre | Valeur |
|-----------|--------|
| compileSdk | Défini par Expo (35) |
| targetSdkVersion | Défini par Expo (35) |
| minSdkVersion | Défini par Expo (24) |
| newArchEnabled | true |
| hermesEnabled | true |
| R8 minify | true |
| shrinkResources | true |
| Architectures | armeabi-v7a, arm64-v8a, x86, x86_64 |
| Edge-to-Edge | true |

### Signing
| Aspect | Statut |
|--------|--------|
| debug.keystore | ✅ Présent localement |
| release.keystore | Géré par EAS Build (upload via `eas credentials`) |
| play-store-key.json | Doit être dans EAS Secrets |
| .gitignore | ✅ Exclut .env, *.keystore, play-store-key.json |

---

## 8. CONCLUSION

Les deux applications sont **bien architecturées** avec une stack moderne (Expo 54, RN 0.81, React 19, New Architecture). La sécurité des tokens, le error handling avec Sentry, et la gestion offline sont solides.

**Tous les bloquants code ont été corrigés automatiquement** :
- ✅ Plugin Sentry Expo activé (source maps)
- ✅ Network security config ajouté (plugin withNetworkSecurity)
- ✅ ScreenErrorBoundary ajouté à JitPlus Pro
- ✅ Clés i18n d'erreur ajoutées à JitPlus Pro

**Il reste 3 actions manuelles avant `eas build`** :
1. Configurer les EAS Secrets Sentry (DSN, ORG, PROJECT, AUTH_TOKEN)
2. Configurer l'EAS Secret Google Maps API Key (avec restrictions)
3. Exécuter `npx expo prebuild --clean` puis `eas build --platform android`

**Certificate pinning** est reporté : l'API utilise un certificat wildcard Cloud Run (`*.a.run.app`) qui fait rotation automatique. Un domaine custom (ex: `api.jitplus.ma`) est requis avant d'activer le pinning.

**Score final : 85/100 (JitPlus) — 86/100 (JitPlus Pro) — STATUT : GO ✅**
