---
name: native-feel
description: Make jitplus and jitpluspro feel like real iOS and Android apps — navigation and back behavior, sheets vs modals vs alerts, feedback (toast, inline, haptics), keyboard, safe areas and edge-to-edge, pull-to-refresh, pickers, permissions, share, dark mode, text scaling. Use when building or reviewing any screen, interaction or flow, when something "feels like a website" or clunky on one platform, or when choosing how to confirm, warn or report a result to the user.
---

# Native feel on iOS and Android

Users judge an app in their hands, by how it behaves more than by how it looks. Each platform has habits. Respect them and the app feels "simple" without explanation.

## Navigation

- **Back:** iOS swipes from the left edge, Android uses the system back gesture or button. Both must work on every screen. A screen with unsaved input asks before leaving, on both platforms (`usePreventRemove` handles the iOS swipe and `BackHandler` the Android back; see `apps/jitpluspro/app/transaction-amount.tsx`). Never trap the user.
- **Tabs** are for top-level places only (4–5 max). A task (scan, create a reward) opens as a pushed screen or a sheet, never as a new tab.
- **Push vs modal:** drilling into content is a push (back arrow). A self-contained task with Cancel/Done (create, edit, filter) is a modal or sheet. On iOS, modals use `presentation: 'modal'` or `'formSheet'` and close by swiping down.
- **Deep links and notifications** land on the right screen with a back path to home (`navReset` helpers).
- `predictiveBackGestureEnabled` is currently `false` in both `app.config.js`. Leave it off until every screen with a custom back handler has been tested with it.

## Choose the right feedback

| Situation | Use | Not |
|---|---|---|
| Action succeeded, the user stays on the screen | inline change + haptic (`hapticSuccess`), or a short toast/banner that disappears by itself | `Alert.alert('Succès')` |
| Form field invalid | message under the field, red border, focus the field | Alert |
| Network/server error on a screen | inline error state with a Retry button (`NoticeBanner`, error card) | Alert that blocks everything |
| Destructive or irreversible action (delete, sign out, cancel booking) | confirmation: iOS action sheet or Alert with a red destructive button; Android dialog | silent action |
| A choice between 2–6 options | action sheet / bottom sheet (`ActionSheet`, `BottomSheet`) | Alert with 4 buttons |
| Explaining a feature | inline hint or empty state | modal tutorial on first launch |

`Alert.alert` is for **confirmations and blocking errors only**. Pro used it 180 times and jitplus 40 times (measured 2026-11-21).

**Pro toast:** `import { toast } from '@/components/ui/Toast'`, then `toast.success(msg)` or `toast.error(msg)`. It is mounted once in `app/_layout.tsx` (`ToastHost`), shows at the top under the status bar, plays the haptic itself (don't call `hapticSuccess` too), survives `router.back()`, and is tap-to-dismiss. On 2026-11-21 all success and result alerts in Pro became toasts. Kept as Alert on purpose: the coupon validation summary (`ClientWinnings`, the cashier must read the discount) and limit explanations.

**Caveat:** a toast renders **under** an open RN `Modal` or sheet. Only convert an error alert to `toast.error` when no modal or sheet can be open at that moment (close it first, or show the error inline inside the sheet). Error alerts in Pro (about 110) are still to be converted screen by screen with an emulator check. Keep alerts for the till flows (scan, stamps, coupon validation).

## Touch and gestures

- Targets ≥ 44×44 pt (iOS) / 48×48 dp (Android). Use `hitSlop` on small icons.
- Pressed state on everything tappable (opacity 0.7–0.85, or a background tint). Android rows can use `android_ripple`.
- Haptics (`utils/haptics`): selection on toggles and pickers, light on key presses that matter, success or error on outcomes. Never on scroll or on every tap.
- Swipe actions only where users expect them (list rows: delete or archive), always with a visible alternative.
- Long lists support pull-to-refresh (`RefreshControl`) with the brand tint.

## Keyboard and forms

- The right `keyboardType`, `textContentType` (iOS) and `autoComplete` (Android) on every field: `email`, `tel` (+212 prefilled), `one-time-code` for OTP (iOS autofills SMS codes), `password` / `new-password`.
- `returnKeyType="next"` moves to the next field; the last one submits.
- The submit button stays visible above the keyboard. Tapping outside or dragging dismisses the keyboard (`keyboardDismissMode="on-drag"`, `keyboardShouldPersistTaps="handled"`).
- `KeyboardAvoidingView`: `padding` on iOS, `height` (or nothing with edge-to-edge) on Android. Test both platforms; it is the most common breakage.

## Layout, system UI and appearance

- Safe areas via `react-native-safe-area-context` on every screen: notch, Dynamic Island, home indicator, Android gesture bar. Bottom buttons add the bottom inset.
- Android is edge-to-edge on recent SDKs: content draws under the status and navigation bars, so pad with insets and set the status bar style per screen background.
- `userInterfaceStyle: 'automatic'`: dark mode follows the system unless the user forced it. Every screen must be checked in both.
- Respect text scaling: allow `maxFontSizeMultiplier` around 1.3 on dense UI, never disable scaling on body text.
- Platform pickers: native date/time pickers, the native share sheet (`expo-sharing` / `Share`), and the native camera permission prompt.

## Permissions

Ask in context, at the moment the feature needs it, after an in-app explanation screen (see `NotificationPermissionSheet` in Pro). If refused, show what still works and a button to the settings (`Linking.openSettings()`). Never ask for everything at first launch.

## Platform differences worth handling

- iOS: large titles on top-level screens, swipe-down to close sheets, `one-time-code` autofill, ATT before tracking (Pro), no plan upsell in Pro.
- Android: hardware back closes sheets and modals first, ripple feedback, `elevation` instead of shadows, notification channels, Google Maps key from EAS (see `mobile-release-check`).

## Check

On the emulator (`run-mobile`) or by reading the code: back works everywhere, no success alert, keyboard never hides the submit button, safe areas are respected, dark mode and Arabic are OK. Pair with `ux-review` for the flow itself and `fluid-performance` for smoothness.
