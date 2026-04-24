# Google Play — Data Safety (JitPlus Pro)

Source of truth for the **Data Safety** form on the Play Console. Update this file
whenever the app starts or stops collecting a new data type, and mirror every
change in the Play Console form and in
[plugins/withPrivacyManifest.js](../apps/jitpluspro/plugins/withPrivacyManifest.js).

## Data collection & sharing — Summary

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all the user data collected by your app encrypted in transit? | **Yes** (HTTPS/TLS 1.2+, cleartext blocked in prod via Network Security Config) |
| Do you provide a way for users to request that their data be deleted? | **Yes** — in-app account deletion (Security → Delete account) + backend purge |

## Data types collected

All data below is collected **for app functionality only**, is **linked to the user's account**, and is **not used for tracking** (no advertising ID, no cross-app tracking, no data brokers).

| Category | Type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|---|
| Personal info | Email | Yes | No | No (required for account) | Account management, auth, communications |
| Personal info | Name (business name, first/last name) | Yes | No | No | Account management, display on merchant dashboard |
| Personal info | Phone number | Yes | No | Yes | Account recovery, merchant verification |
| Location | Precise location | Yes | No | Yes | Store-on-map feature (foreground only) |
| Photos and videos | Photos | Yes | No | Yes | Uploading store logo / cover image |
| App activity | App interactions, crash logs, diagnostics | Yes | With Sentry (data processor) | No | Stability monitoring (anonymous, PII-filtered) |
| Device or other IDs | Device ID (FCM push token) | Yes | With Firebase Cloud Messaging | Yes | Delivery of push notifications |

## Data types **NOT** collected

- ❌ Advertising ID (GAID / IDFA)
- ❌ Behavioral analytics
- ❌ Browsing history
- ❌ Health / fitness data
- ❌ Financial / payment data (no in-app payments)
- ❌ Biometric data
- ❌ Audio / video recordings (microphone explicitly disabled in `expo-camera` plugin)
- ❌ Contacts, SMS, calendar

## Security practices

- All network traffic encrypted in transit (TLS 1.2+).
- Cleartext traffic blocked in production via Network Security Config
  (see [plugins/withNetworkSecurity.js](../apps/jitpluspro/plugins/withNetworkSecurity.js)).
- Auth tokens stored in **expo-secure-store** (iOS Keychain / Android Keystore).
- Client-side cached data cleared after **4 hours** of inactivity
  (see `CACHE_MAX_AGE` in [app/_layout.tsx](../apps/jitpluspro/app/_layout.tsx)).
- Sentry crash reports:
  - `attachScreenshot: false`, `attachViewHierarchy: false` (no PII leakage).
  - `beforeSend` hook filters auth/session error messages.
  - Sample rate capped at 5% for transactions; 50 breadcrumbs max.
- Account deletion is implemented in-app with re-authentication
  (Google / Apple / password) + double confirmation, and triggers a
  server-side purge via `POST /merchant/delete-account`.

## Third-party data processors

| Processor | Purpose | Data sent | Region |
|---|---|---|---|
| Sentry (Functional Software, Inc.) | Crash diagnostics | Anonymous error messages, stack traces (PII filtered) | EU (`ingest.de.sentry.io`) |
| Firebase Cloud Messaging (Google) | Push notification delivery | FCM device token | Global |
| Google Cloud Run (backend) | API hosting | All business data | EU (`europe-west1`) |
| Google Maps SDK | Map rendering | Approximate location, API calls | Global |
| Google Sign-In / Apple Sign-In | Authentication | ID tokens | Global |
| Resend / Twilio (via backend only) | Transactional email / SMS | Email / phone | EU / Global |

## User rights (GDPR)

- **Access / portability** — available on request via the email published in the
  privacy policy.
- **Rectification** — editable from the app (Account → profile).
- **Deletion** — in-app (Security → Delete account) or by request.
- **Data Protection Officer** — contact listed in privacy policy.
- Privacy policy URL: published in `app.config.js → privacyPolicyUrl`.
