# JitPlus Pro — Screen Code Quality Audit

**Date:** 2026-03-20  
**Scope:** All 22 screen files in `apps/jitpluspro/app/` + 6 tab files in `(tabs)/`  
**Auditor:** Automated deep-read analysis

---

## Executive Summary

The jitpluspro Expo/React Native app comprises ~28 screen-level files totalling approximately **12,000+ lines** of code. The codebase uses a modern stack (Expo Router, TanStack Query, i18n, theming) and follows reasonable architectural patterns. However, the audit reveals **systemic i18n bypasses**, **significant DRY violations**, **missing accessibility attributes**, and several **god components** that need decomposition.

| Severity | Count |
|----------|-------|
| CRITICAL | 3     |
| HIGH     | 8     |
| MEDIUM   | 11    |
| LOW      | 6     |

---

## CRITICAL Issues

### C1. Hardcoded French strings bypassing i18n system

Despite having a full `useLanguage()` / `t()` i18n system, **dozens of user-facing strings are hardcoded in French** across multiple files, making the app untranslatable for those flows.

**referral.tsx:**
```tsx
// Line 65
setError('Impossible de charger vos informations de parrainage.');
// Line 80
Alert.alert('Erreur', 'Impossible de copier le code');
// Line 87-88
message: `Rejoignez JitPlus avec mon code de parrainage : ${stats.referralCode}\nhttps://jitplus.com`,
// Line 91
Alert.alert('Erreur', 'Impossible de partager le code');
// Line 131
<Text ...>Réessayer</Text>
```

**my-qr.tsx:**
```tsx
// Lines 82-95 — All alert strings hardcoded in French
Alert.alert('Indisponible', 'Le partage du QR code nécessite un dev build (pas Expo Go).');
Alert.alert('Erreur', 'Impossible de capturer le QR code.');
Alert.alert('Partage indisponible', "Le partage n'est pas disponible sur cet appareil.");
// Lines 100+
Alert.alert('🔒 Fonctionnalité Premium', 'Le téléchargement du QR Code personnalisé est réservé au plan Pro...');
```

**account.tsx:**
```tsx
// Line ~663
<Text ...>{'Contacter le support'}</Text>
// Lines ~724-750 (Logo modal)
'Photo de profil', 'Modifiez ou supprimez votre photo de profil',
'Changer la photo', 'Ajouter une photo', 'Supprimer la photo', 'Annuler'
// Line ~772
'Redémarrez l\'application pour appliquer le changement de direction.'
```

**(tabs)/_layout.tsx:**
```tsx
// Lines 60-66 — Tab titles
<Tabs.Screen name="activity" options={{ title: 'Activité' }} />
<Tabs.Screen name="index" options={{ title: 'Clients' }} />
<Tabs.Screen name="scan" options={{ title: 'Scan' }} />
<Tabs.Screen name="messages" options={{ title: 'Messages' }} />
<Tabs.Screen name="account" options={{ title: 'Compte' }} />
```

**legal.tsx:**
```tsx
// Line 201
© {new Date().getFullYear()} JitPlus. {'\n'}Tous droits réservés.
```

**Impact:** Users selecting English or Arabic will see French strings throughout the app.  
**Fix:** Replace every hardcoded string with `t('key')` calls.

---

### C2. Hardcoded support phone number in client code

**(tabs)/account.tsx ~line 660:**
```tsx
Linking.openURL('https://wa.me/33767471397?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20avec%20JitPlus%20Pro')
```

A real phone number is embedded directly in the source code. This is a **data exposure** issue — the number is visible to anyone who decompiles the APK/IPA.

**Fix:** Move to environment variable `EXPO_PUBLIC_SUPPORT_WHATSAPP` (already used correctly in plan.tsx).

---

### C3. Inconsistent data fetching — bypassing React Query cache

**profile.tsx (lines 34-40):**
```tsx
const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
const loadPlanInfo = useCallback(async () => {
  const res = await api.get('/merchant/plan');
  setPlanInfo(res.data);
}, []);
```

**my-qr.tsx (lines 55-63):**
```tsx
const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
useEffect(() => {
  (async () => {
    const res = await api.get('/merchant/plan');
    setPlanInfo(res.data);
  })();
}, []);
```

Meanwhile, **plan.tsx** correctly uses the React Query hook:
```tsx
const { data: planInfo, isLoading: loading } = usePlan();
```

**Impact:** The same `/merchant/plan` endpoint is called 3 times independently — once per screen visit — with no cache sharing. This wastes bandwidth, creates stale data inconsistencies, and bypasses the global query invalidation logic.

**Fix:** Use `usePlan()` hook consistently in all screens.

---

## HIGH Issues

### H1. God components exceeding 500+ lines

| File | Lines | useState | useEffect | useCallback |
|------|-------|----------|-----------|-------------|
| scan-qr.tsx | ~700 | 11 | 3 | 8 |
| transaction-amount.tsx | ~800 | 10+ | 4 | 6 |
| stores.tsx | ~800 | 8+ | 3 | 5 |
| onboarding.tsx | ~800 | 10+ | 5+ | 4+ |
| account.tsx | ~800 | 7 | 2 | 2 |
| messages.tsx | ~500 | 10 | 0 | 4 |
| register.tsx | ~500+ | 12+ | 4+ | 4+ |

**Recommendation:** Extract sub-components, custom hooks, and form logic. For example:
- `scan-qr.tsx`: Extract `PhoneSearchPanel`, `QRViewfinder`, `ClientResultList`
- `account.tsx`: Extract `PlanCard`, `LogoEditModal`, `LanguageModal`
- `messages.tsx`: Extract `ComposeNotification`, `ComposeWhatsApp`, `ComposeEmail`

---

### H2. Missing accessibility attributes (systemic)

**Nearly all interactive elements** across 22+ screens lack `accessibilityLabel` and `accessibilityRole`. The **only exception** is `legal.tsx` which correctly uses:
```tsx
accessibilityRole="button"
accessibilityLabel={label}
```

Example violations (representative, not exhaustive):

**profile.tsx** — all action buttons:
```tsx
<TouchableOpacity
  style={[styles.actionButton, { backgroundColor: '#7C3AED' }]}
  onPress={() => router.push('/plan')}
>
```

**welcome.tsx** — language picker buttons, next button  
**forgot-password.tsx** — all form inputs and buttons  
**scan-qr.tsx** — camera control buttons  
**(tabs)/index.tsx** — client cards, search bar  

**Impact:** Screen readers cannot navigate the app. This is an **App Store / Play Store risk** for accessibility compliance.

**Fix:** Add `accessibilityLabel`, `accessibilityRole`, and `accessibilityHint` to all interactive elements.

---

### H3. `as any` FormData type casts

**account.tsx (~line 84):**
```tsx
formData.append('file', { uri: asset.uri, name: fileName, type: asset.mimeType ?? `image/${ext}` } as any);
```

This pattern is repeated in **onboarding.tsx** and **edit-profile.tsx**.

**Fix:** Create a typed utility:
```tsx
type FormDataFile = { uri: string; name: string; type: string };
function appendFile(fd: FormData, key: string, file: FormDataFile) {
  fd.append(key, file as unknown as Blob);
}
```

---

### H4. DRY violation — Logo/image upload duplicated 3x

The `pickAndUploadLogo` pattern (ImagePicker → FormData → api.post → updateMerchant) is nearly identically implemented in:
1. **account.tsx** (~lines 67-90)
2. **onboarding.tsx** (logo upload step)
3. **edit-profile.tsx** (logo tab)

Each duplicates: URI parsing, safe filename generation, extension extraction, FormData construction, and error handling.

**Fix:** Extract a `useImageUpload(type: 'logo' | 'cover')` hook.

---

### H5. DRY violation — Plan/premium state derivation duplicated 3x

Plan status computation (`isPremium`, `isTrial`, `daysRemaining`, `planUrgency`) is independently derived in:
1. **account.tsx** (~lines 98-120)
2. **profile.tsx** (~lines 90-110)
3. **my-qr.tsx** (~lines 66-68)

**Fix:** Extract a `usePlanStatus()` hook that wraps `usePlan()` and derives all computed fields.

---

### H6. DRY violation — Geocoding logic duplicated 3x

The geocoding + reverse geocoding + "use my location" pattern is repeated nearly identically in:
1. **stores.tsx**
2. **register.tsx**
3. **edit-profile.tsx**

**Fix:** Extract a `useGeocoding()` hook.

---

### H7. DRY violation — Duplicated QR card rendering in my-qr.tsx

The entire QR card (merchant header, QRCode component, footer) is rendered **twice** — once inside `ViewShot` and once as a fallback:

**my-qr.tsx (~lines 155-260):**
```tsx
{ViewShot ? (
  <ViewShot ref={viewShotRef} ...>
    <View style={[styles.qrCard, ...]}>
      {/* ~50 lines of QR card */}
    </View>
  </ViewShot>
) : (
  <View style={[styles.qrCard, ...]}>
    {/* ~50 lines of IDENTICAL QR card */}
  </View>
)}
```

**Fix:** Extract a `<QRCardContent />` component and render it once, optionally wrapped in `ViewShot`.

---

### H8. Missing error boundaries per screen

Only the root `_layout.tsx` has `<AppErrorBoundary>`. No individual screens have error boundaries. A rendering error in any deeply nested component (e.g., a bad date format in activity list) will crash the entire app.

**Fix:** Add lightweight error boundaries around critical screens, especially those rendering dynamic data (activity, clients, messages, dashboard).

---

## MEDIUM Issues

### M1. Hardcoded color values outside theme system

Many files use raw hex colors instead of theme tokens:

**profile.tsx:** `'#37415130'`, `'#F3F4F6'`, `'#9CA3AF'`, `'#6B7280'`  
**plan.tsx:** `'#4C1D95'`, `'#7C3AED'`, `'#1F2937'`, `'#FCD34D'`  
**account.tsx:** `'#5B21B6'`, `'#A78BFA'`, `'#f87171'`  
**activity.tsx:** `'#334155'` (line in `txRow` border)

These won't adapt to theme changes and create maintenance burden.

---

### M2. Navigation type safety bypassed

Multiple `router.push()` calls use type casts to suppress errors:

```tsx
// profile.tsx line 216
router.push('/my-qr' as never)

// account.tsx — multiple occurrences
router.push('/referral' as any)
router.push('/team-management' as any)
router.push('/legal' as any)
```

**Fix:** Properly type the route params in the Expo Router type declarations.

---

### M3. Dimension caching at module level

**welcome.tsx (line 14):**
```tsx
const { width: SCREEN_WIDTH } = Dimensions.get('window');
```

Captured once at import time. Won't update on orientation change, split-screen, or window resize.

**Fix:** Use `useWindowDimensions()` hook (as done correctly in my-qr.tsx).

---

### M4. Array index used as React key

**profile.tsx (~line 170):**
```tsx
{[
  { label: t('profileView.oneProgram'), included: true },
  // ...
].map((f, i) => (
  <View key={i} ...>
```

**plan.tsx** feature comparison table uses same pattern.

**Fix:** Use `label` or a stable string as key.

---

### M5. Potential memory leak in useEffect async pattern

**my-qr.tsx (~lines 55-63):**
```tsx
useEffect(() => {
  (async () => {
    try {
      const res = await api.get('/merchant/plan');
      setPlanInfo(res.data);
    } catch { }
    finally { setLoading(false); }
  })();
}, []);
```

No cleanup or abort controller. If user navigates away before the API call completes, `setPlanInfo` and `setLoading` will attempt to update an unmounted component.

**Fix:** Use React Query (see C3) or add an `isMounted` ref / AbortController.

---

### M6. `Record<string, any>` usage

Found in: stores.tsx (`handleSave`), settings.tsx (`doSave`), edit-profile.tsx.  
**Fix:** Define proper typed interfaces for form data payloads.

---

### M7. Dynamic `require()` with try-catch

**my-qr.tsx (lines 11-15):**
```tsx
let ViewShot: any = null;
try {
  ViewShot = require('react-native-view-shot').default;
} catch { }
```

Metro bundler cannot statically analyze this. The module may or may not be bundled.

**Fix:** Use conditional imports with `Platform.select()` or a proper plugin-based approach.

---

### M8. messages.tsx — 10 independent useState hooks for 3 compose forms

```tsx
const [title, setTitle] = useState('');
const [body, setBody] = useState('');
const [sending, setSending] = useState(false);
const [whatsappMessage, setWhatsappMessage] = useState('');
const [showWhatsApp, setShowWhatsApp] = useState(false);
const [whatsappLoading, setWhatsappLoading] = useState(false);
const [emailSubject, setEmailSubject] = useState('');
const [emailBody, setEmailBody] = useState('');
const [showEmail, setShowEmail] = useState(false);
const [emailSending, setEmailSending] = useState(false);
```

**Fix:** Use `useReducer` or extract each compose form into its own component with local state.

---

### M9. Inline styles mixed with StyleSheet

Multiple files combine StyleSheet.create with inline style objects, e.g.:

**profile.tsx (~line 99):**
```tsx
style={[styles.categoryBadge, {
  backgroundColor: planInfo.plan === 'PREMIUM' ? '#37415130' : '#F3F4F6',
  marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
}]}
```

**account.tsx** — extensive inline styles in the plan card and modal sections.

---

### M10. `useEffect` with missing/incomplete dependency arrays

**(tabs)/_layout.tsx (lines 14-16):**
```tsx
useEffect(() => {
  if (!loading && !merchant) {
    router.replace('/welcome');
  }
}, [merchant, loading]); // missing: router
```

**(tabs)/account.tsx:**
```tsx
useEffect(() => {
  if (isFocused) {
    loadProfile().catch(() => {});
  }
}, [isFocused]); // missing: loadProfile
```

---

### M11. Hardcoded the WhatsApp support URL in account.tsx

This is different from C2 — the entire URL string including pre-filled message text is hardcoded:
```tsx
'https://wa.me/33767471397?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20avec%20JitPlus%20Pro'
```

The pre-filled message is in French and not using i18n.

---

## LOW Issues

### L1. Inconsistent font family usage

Some files specify font families:
```tsx
fontFamily: 'Lexend_700Bold'     // activity.tsx, index.tsx
fontFamily: 'Inter_600SemiBold'  // activity.tsx
```

Others rely on `fontWeight` alone:
```tsx
fontWeight: 'bold'  // profile.tsx
fontWeight: '700'   // most files
```

**Recommendation:** Standardize font family assignments via theme or a typography utility.

---

### L2. Magic numbers

| File | Value | Purpose |
|------|-------|---------|
| forgot-password.tsx | `60` | OTP resend cooldown (seconds) |
| scan-qr.tsx | `5000` | Scan debounce cooldown (ms) |
| _layout.tsx | `100` | Timer delay before scanner navigation |
| messages.tsx | `100`, `500` | maxLength for title/body |

**Fix:** Extract to named constants in `@/constants/app.ts`.

---

### L3. Empty catch blocks

Multiple files silently swallow errors:

```tsx
// profile.tsx line 37
} catch { /* silent */ }

// my-qr.tsx line 61
} catch { /* fallback — assume FREE */ }

// account.tsx line 100
loadProfile().catch(() => {});
```

Where appropriate, add Sentry breadcrumbs or console.warn in __DEV__.

---

### L4. Inconsistent error handling styles

Some files use `getErrorMessage()` utility (forgot-password.tsx, plan.tsx), while others construct custom error messages inline or use hardcoded strings.

---

### L5. Unused style definitions

Several files have styles defined but potentially unused:
- pending-gifts.tsx: `fulfillBtn`, `fulfillBtnText` styles defined but no fulfill button rendered.
- index.tsx: `pendingBanner`, `pendingBannerText` styles defined but not used in JSX.

---

### L6. `formatDate` function redefined locally

**account.tsx (~line 108):**
```tsx
const formatDate = (d: Date) =>
  d.toLocaleDateString(locale === 'ar' ? 'ar-MA' : ...);
```

The `@/utils/date` module already exports `formatDate`. Local redefinition creates inconsistency.

---

## Summary of Files Audited

| # | File | Lines | Issues |
|---|------|-------|--------|
| 1 | _layout.tsx | ~230 | — |
| 2 | (tabs)/_layout.tsx | ~80 | C1, M10 |
| 3 | (tabs)/index.tsx | ~390 | H2 |
| 4 | (tabs)/account.tsx | ~800 | C1, C2, H1, H2, H3, H4, H5, M1, M2, M9, M10, M11, L3, L6 |
| 5 | (tabs)/activity.tsx | ~290 | M1 |
| 6 | (tabs)/messages.tsx | ~500 | H1, M8 |
| 7 | (tabs)/scan.tsx | ~70 | — (minimal fallback) |
| 8 | scan-qr.tsx | ~700 | H1, H2, L2 |
| 9 | transaction-amount.tsx | ~800 | H1 |
| 10 | stores.tsx | ~800 | H1, H6, M6 |
| 11 | onboarding.tsx | ~800 | H1, H3, H4 |
| 12 | settings.tsx | ~500+ | M6 |
| 13 | client-detail.tsx | ~500 | H2 |
| 14 | register.tsx | ~500+ | H6 |
| 15 | team-management.tsx | ~500 | H2 |
| 16 | login.tsx | ~500 | H2 |
| 17 | dashboard.tsx | ~500 | H2, M1 |
| 18 | security.tsx | ~500+ | H2 |
| 19 | edit-profile.tsx | ~500+ | H3, H4, H6, M6 |
| 20 | profile.tsx | ~350 | C3, H2, H5, M1, M4 |
| 21 | referral.tsx | ~400 | C1, H2, L3 |
| 22 | plan.tsx | ~400 | M1 |
| 23 | pending-gifts.tsx | ~140 | L5 |
| 24 | my-qr.tsx | ~350 | C1, C3, H7, M5, M7 |
| 25 | welcome.tsx | ~250 | M3 |
| 26 | forgot-password.tsx | ~350 | L2 |
| 27 | legal.tsx | ~230 | C1 (minor), ✅ a11y |

---

## Priority Remediation Order

1. **Run i18n audit** — grep all `.tsx` files for string literals and hardcoded French text. Replace with `t()` calls. *(C1)*
2. **Move hardcoded secrets to env vars** — support phone number, any other exposed constants. *(C2)*
3. **Standardize data fetching on React Query** — eliminate direct `api.get()` + useState patterns. *(C3)*
4. **Extract shared hooks** — `useImageUpload`, `usePlanStatus`, `useGeocoding`. *(H4, H5, H6)*
5. **Add accessibility attributes** — systematic pass through all interactive elements. *(H2)*
6. **Decompose god components** — start with account.tsx, scan-qr.tsx, messages.tsx. *(H1)*
7. **Fix type safety** — eliminate `as any` / `as never` casts, type FormData. *(H3, M2, M6)*
8. **Clean up theme usage** — replace hardcoded colors with theme tokens. *(M1)*
