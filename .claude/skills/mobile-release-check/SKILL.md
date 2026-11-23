---
name: mobile-release-check
description: Pre-flight checklist before an EAS build or store submission of jitplus (client) or jitpluspro (Pro) — Expo module version skew (iOS dyld launch crash), App Store compliance for Pro, Android Maps key, version/build bump, then diagnosis of a build that crashes or misbehaves only in production. Use before any `eas build`/`eas submit`, when bumping an app version, or when a store build crashes at launch, shows a grey map, or differs from dev.
---

# Mobile release check (jitplus / jitpluspro)

Run every step for the app being released. Run commands through Windows (see the `verify-changes` skill): `W='C:\Users\ayoub\OneDrive\Desktop\JIT\jit-plus'`.

## 1. Expo dependency alignment (blocking for iOS)

Pro iOS 1.7.3–1.7.5 crashed at launch on every iPhone: prebuilt iOS xcframeworks (expo-print, expo-video, expo-image, expo-camera, expo-font, expo-file-system) expected a newer `expo-modules-core` than the one resolved. dyld aborts before JS starts, so Sentry sees nothing.

```bash
cmd.exe /c "cd /d $W\apps\jitpluspro && npx expo install --check"
cmd.exe /c "cd /d $W\apps\jitplus && npx expo install --check"
```

- Any mismatch → fix with `npx expo install --fix`; keep `expo` and every `expo-*` on the same patch train in **both** apps.
- If `expo` changes version, re-key `patches/expo@<version>.patch` and `pnpm.patchedDependencies` in the root `package.json`.

## 2. Pro iOS App Store rules (jitpluspro only)

- No Pro-plan upsell wording or CTA on iOS ("Passez au forfait Pro", "Contactez notre équipe", "En savoir plus" → `/plan`). New lock/upsell strings need an iOS override in `apps/jitpluspro/i18n/iosStoreCopy.ts` or a `Platform.OS !== 'ios'` guard. Grep the diff since the last release for new `forfait`, `plan`, `premium`, `/plan` strings.
- `plugins/withFacebookIOSConsent.js` must stay listed **before** `react-native-fbsdk-next` in `app.config.js` plugins. Never re-enable FB auto-init on iOS. `services/metaAdsManager.ts` asks ATT before `initializeSDK()`.
- The privacy manifest declares tracking (DeviceID, ProductInteraction). App Store Connect labels must match.

## 3. Android

- Since `.easignore` excludes `apps/*/android`, EAS prebuilds and reads config from **EAS env vars**, not the local `.env`. jitplus Maps needs `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY_ANDROID` in the EAS preview and production environments. The shared `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` is refused by Google.
- Check `eas env:list --environment production` (from the app dir) for every `EXPO_PUBLIC_*` the code reads: `grep -rhoE "EXPO_PUBLIC_[A-Z0-9_]+" apps/<app> --include=*.ts --include=*.tsx --include=*.js | sort -u`.

## 4. Versions and quality gate

- Bump `version` in `apps/<app>/package.json` and the app config. Confirm the build number policy in `apps/<app>/eas.json` (`autoIncrement` or explicit).
- Run tsc + jest + i18n for the app (skill `verify-changes`, and `i18n-rtl-check` if strings changed).
- Building and submitting spends EAS credits and goes public: **ask the user before running `eas build` or `eas submit`.**

## 5. Diagnosing a production-only problem

- **iOS crash at launch, no Mac:** EAS profile `ios-simulator` (Pro `eas.json`, `environment: production`) → run the `.tar.gz` on appetize.io. Or ask the user for the `.ips` from the iPhone (Réglages → Confidentialité → Analyses et améliorations → Données d'analyse) and read `termination.reasons`. Static IPA check: `strings Frameworks/<X>.framework/<X> | grep <symbol>` for each prebuilt framework against ExpoModulesCore.
- **Android works in dev, not prod (grey map, auth failures):** `/mnt/c/Users/ayoub/AppData/Local/Android/Sdk/platform-tools/adb.exe logcat` and look for "Authorization failure" (it prints the key and SHA-1). EAS upload-key SHA-1: `46:B4:91:F4:E1:CF:4E:46:6A:27:DA:3E:4B:6E:C7:88:66:57:8C:DA`.

## Output

A short go / no-go list: each step ✅, ❌ (with the fix) or "not checked" (with the reason).
