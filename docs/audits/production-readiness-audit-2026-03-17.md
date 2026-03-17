# Audit de Production & Google Play Store — JitPlus & JitPlus Pro

**Date :** 17 mars 2026  
**Scope :** `apps/jitplus` (client) + `apps/jitpluspro` (marchand) + `apps/backend`  
**Objectif :** Valider la mise en production et la publication sur le Google Play Store

---

## Verdict Global

| App | Prêt pour la prod ? | Prêt pour le Play Store ? |
|-----|---------------------|---------------------------|
| **JitPlus** (client) | ✅ OUI — avec 2 corrections mineures | ✅ OUI — prêt à publier |
| **JitPlus Pro** (marchand) | ✅ OUI — avec 2 corrections mineures | ✅ OUI — prêt à publier |
| **Backend** | ✅ OUI — déjà sur Cloud Run | ✅ N/A |

> **Les deux apps sont prêtes pour la production.** Il reste quelques ajustements mineurs listés ci-dessous, mais rien de bloquant pour une première release.

---

## 1. Points Forts (Ce qui est déjà excellent)

### Sécurité
- ✅ **HTTPS enforced** en production (plugin `withNetworkSecurity` + validation dans `resolveApiUrl`)
- ✅ **Tokens dans SecureStore** (stockage chiffré, pas AsyncStorage)
- ✅ **Sentry** configuré et désactivé en dev, activé en prod uniquement
- ✅ **ProGuard/R8 activé** — minification + obfuscation du code
- ✅ **Resource shrinking** activé — réduction de la taille de l'APK
- ✅ **Hermes** activé — moteur JS optimisé
- ✅ **New Architecture** activée (React Native 0.81.5 / Expo 54)
- ✅ **Console.log protégés** — tous gardés par `__DEV__` ou `IS_DEV`
- ✅ **Logs Android supprimés** en release via ProGuard (`-assumenosideeffects`)
- ✅ **Permissions minimales** — pas de SYSTEM_ALERT_WINDOW, READ/WRITE_EXTERNAL_STORAGE
- ✅ **Privacy Policy URL** configurée (`https://jitplus.com/privacy`)
- ✅ **iOS PrivacyInfo.xcprivacy** configuré (Apple App Review compliance)

### Build & CI/CD
- ✅ **EAS Build** configuré avec `autoIncrement: true` pour les builds de production
- ✅ **`appVersionSource: "remote"`** — versions gérées par EAS (pas de conflits locaux)
- ✅ **Cloud Build** configuré pour le backend (Docker multi-stage, migrations auto)
- ✅ **Secrets injectés via EAS Secrets** (pas hardcodés dans le repo)
- ✅ **`play-store-key.json` dans .gitignore** des deux apps
- ✅ **Keystores dans .gitignore** (jitpluspro)

### Backend
- ✅ **Helmet** (HSTS, CSP, X-Frame-Options)
- ✅ **Rate limiting** (60 req/60s global + throttle endpoint par endpoint)
- ✅ **CORS validé en production** (erreur si wildcard `*`)
- ✅ **Graceful shutdown** + keep-alive 620s (> Cloud Run 600s)
- ✅ **Validation pipes** + exception filter (pas de fuite d'info interne)

### Assets & Store
- ✅ **Icons adaptatifs** présents (toutes densités : mdpi → xxxhdpi)
- ✅ **Splash screens** configurés
- ✅ **Deep linking** configuré (`jitplus://`, `jitpluspro://`)
- ✅ **Orientation portrait** verrouillée
- ✅ **`usesNonExemptEncryption: false`** (pas de questionnaire export compliance)

---

## 2. Corrections Recommandées (Non-bloquantes)

### 🟡 P1 — Mismatch de version (JitPlus uniquement)

| Fichier | Version |
|---------|---------|
| `app.config.js` | `1.1.0` |
| `package.json` | `1.1.0` |
| `android/app/build.gradle` | `1.0.0` (versionName) / `1` (versionCode) |

**Impact :** EAS gère le versionCode avec `autoIncrement`, donc le build.gradle est écrasé au build. Mais pour la cohérence, aligner `versionName` dans `build.gradle` à `1.1.0`.

**Fix :** Lancer `npx expo prebuild --clean` pour régénérer le dossier `android/` avec les bonnes valeurs, ou simplement éditez `build.gradle` manuellement.

---

### 🟡 P2 — Google Maps API Key dans AndroidManifest.xml

Les deux apps ont la clé Google Maps hardcodée dans le Manifest après le prebuild :
```xml
<meta-data android:name="com.google.android.geo.API_KEY" 
           android:value="AIzaSyC4sajwcplMAj-FJyGYYf2OhUrjtmxpZoo"/>
```

**Impact :** C'est le comportement **normal** d'Expo — la clé est injectée à partir de `app.config.js → android.config.googleMaps.apiKey`. Elle sera extractible de l'APK, ce qui est standard pour les Maps SDK.

**Mitigation requise :**
1. ✅ Vérifier que la clé est **restreinte dans Google Cloud Console** :
   - Application restriction → Android apps (SHA-1 fingerprint + package name)
   - API restriction → Maps SDK for Android uniquement
2. ✅ Mettre un **quota** sur la clé (ex: 10 000 requêtes/jour)
3. ✅ Activer **l'alerte billing** dans Google Cloud

> **Note :** Il est impossible d'éviter complètement l'exposition de la clé Maps dans un APK — c'est par design. Les restrictions ci-dessus suffisent.

---

### 🟡 P3 — Certificate Pinning désactivé

Le plugin `withCertificatePinning` est désactivé dans les deux apps, avec le commentaire :
```javascript
// DISABLED: Enable after setting up custom domain (api.jitplus.ma) 
// Cloud Run's *.a.run.app wildcard cert rotates too frequently for pinning.
```

**Impact :** Pas de protection MITM supplémentaire au-delà de HTTPS standard.

**Recommandation :** Activer après migration vers un domaine personnalisé (`api.jitplus.ma`). Pas bloquant pour le Play Store.

---

### 🟡 P4 — Sentry DSN configuré via variable d'environnement

Vérifier que ces secrets EAS sont bien configurés :

| App | Secret EAS requis |
|-----|-------------------|
| JitPlus | `EXPO_PUBLIC_SENTRY_DSN` |
| JitPlus Pro | `EXPO_PUBLIC_SENTRY_DSN_PRO` |
| Les deux | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` |
| Les deux | `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` |

**Vérification :** `eas secret:list` pour confirmer que tous sont définis.

---

## 3. Checklist Google Play Store

### Pré-requis techniques

| Critère | JitPlus | JitPlus Pro |
|---------|---------|-------------|
| Package ID unique | `com.jitplus.client` ✅ | `com.jitplus.pro` ✅ |
| versionCode incrémenté | Auto (EAS) ✅ | Auto (EAS) ✅ |
| Signing key (upload key) | EAS gère ✅ | EAS gère ✅ |
| Target SDK ≥ 34 | Via Expo SDK 54 ✅ | Via Expo SDK 54 ✅ |
| 64-bit support | `arm64-v8a` inclus ✅ | `arm64-v8a` inclus ✅ |
| AAB format | EAS production = AAB ✅ | EAS production = AAB ✅ |
| ProGuard/R8 | Activé ✅ | Activé ✅ |
| Permissions justifiées | Oui ✅ | Oui ✅ |

### Pré-requis Play Console

| Critère | Statut | Notes |
|---------|--------|-------|
| Privacy Policy URL | ✅ | `https://jitplus.com/privacy` |
| Data Safety form | ⚠️ À remplir | Déclarer : nom, email, téléphone, position, photos |
| Content rating questionnaire | ⚠️ À remplir | Catégorie : Business/Finance |
| Screenshots (min 2) | ⚠️ À fournir | Phone + 7" tablet + 10" tablet |
| Feature graphic (1024x500) | ⚠️ À fournir | Image promo pour le Store |
| App icon (512x512) | ✅ Présent | Dans `assets/images/` |
| Short description (80 chars) | ⚠️ À rédiger | |
| Full description (4000 chars) | ⚠️ À rédiger | |
| App category | ⚠️ À choisir | Shopping / Business |
| Target audience | ⚠️ À remplir | 18+ (transactions financières) |
| Ads declaration | ⚠️ À remplir | "Non" si pas de pubs |
| `play-store-key.json` | ⚠️ À vérifier | Service account key pour `eas submit` |

---

## 4. Commandes de Publication

### Build de production
```bash
# JitPlus (client)
cd apps/jitplus
eas build --platform android --profile production

# JitPlus Pro (marchand)
cd apps/jitpluspro
eas build --platform android --profile production
```

### Soumission au Play Store
```bash
# JitPlus
cd apps/jitplus
eas submit --platform android --profile production

# JitPlus Pro
cd apps/jitpluspro
eas submit --platform android --profile production
```

### Vérification des secrets EAS
```bash
eas secret:list
# Doit contenir : EXPO_PUBLIC_SENTRY_DSN, EXPO_PUBLIC_GOOGLE_MAPS_API_KEY, etc.
```

---

## 5. Résumé des Actions

### Avant la première soumission (obligatoire)

| # | Action | Priorité | Temps estimé |
|---|--------|----------|-------------|
| 1 | Remplir le formulaire **Data Safety** dans la Play Console | Obligatoire | ~15 min |
| 2 | Remplir le **Content Rating** questionnaire | Obligatoire | ~5 min |
| 3 | Fournir **screenshots** (phone + tablet) | Obligatoire | ~30 min |
| 4 | Fournir **feature graphic** 1024x500 | Obligatoire | ~10 min |
| 5 | Rédiger **description courte + longue** | Obligatoire | ~15 min |
| 6 | Vérifier **`play-store-key.json`** existe + fonctionne | Obligatoire | ~5 min |
| 7 | Vérifier **secrets EAS** (`eas secret:list`) | Obligatoire | ~2 min |
| 8 | Restreindre **Google Maps API Key** dans Cloud Console | Fortement recommandé | ~10 min |

### Après la première release (recommandé)

| # | Action | Priorité |
|---|--------|----------|
| 1 | Activer **Certificate Pinning** après migration vers `api.jitplus.ma` | Moyen |
| 2 | Ajouter des **tests d'intégration** (auth flow, QR, socket) | Moyen |
| 3 | Aligner `versionName` dans `build.gradle` de JitPlus | Bas |

---

## Conclusion

**Les deux applications sont techniquement prêtes pour la production et le Google Play Store.** L'architecture est solide, la sécurité est correctement implémentée, et le pipeline CI/CD est fonctionnel.

Les seules actions restantes sont **administratives** (remplir les formulaires Play Console) et non techniques. Aucun bug bloquant ou vulnérabilité critique n'a été identifié.
