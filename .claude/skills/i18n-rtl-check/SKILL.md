---
name: i18n-rtl-check
description: Check translations (fr, en, ar) and Arabic right-to-left layout in jitplus and jitpluspro. Use after adding or changing user-facing strings or screen layouts, when reviewing a screen in Arabic, or when a key shows raw, a placeholder renders literally, or a row/icon is not mirrored.
---

# i18n and RTL check

## The two apps handle RTL differently

| | jitplus (client) | jitpluspro (Pro) |
|---|---|---|
| Mechanism | native `I18nManager.forceRTL`, RN flips layout automatically | root view forced to `direction: 'ltr'` (`app/_layout.tsx`); mirroring is **manual** via `hooks/useDir.ts` (`dir.row`, `dir.textAlign`, `dir.flip`) |
| What is a bug | hand-made flips that double-flip, directional icons (chevrons, arrows) not mirrored | any hard-coded `flexDirection: 'row'`, `left`/`right`, `marginLeft`/`paddingRight`, `textAlign: 'left'` in a screen that shows Arabic |
| Animation | Reanimated 4 (translateX must be negated in RTL) | core `Animated` only |

Always check which app a file belongs to before judging an RTL issue.

## Steps

1. **Keys and placeholders**
   - jitplus: `cmd.exe /c "cd /d C:\Users\ayoub\OneDrive\Desktop\JIT\jit-plus\apps\jitplus && node scripts\check-i18n.js"`. It catches missing keys, locale divergence, `{var}` single-brace placeholders (i18n-js renders them literally) and duplicate section keys.
   - jitpluspro has no checker. Compare the keys of `i18n/locales/{fr,en,ar}.ts` and the feature files (`bookingPro`, `dealsPro`, `luckyWheelPro`, `scratchPro`, `stampCodesPro`). Also check the `t('…')` keys used in the changed files and that placeholders use `%{var}` with the same set in every locale. On iOS, `i18n/iosStoreCopy.ts` overrides apply (no plan upsell copy; see `mobile-release-check`).
   - jitpluspro `__tests__/locales.test.ts` forbids emojis in locale strings.
2. **Arabic quality**: `ar.ts` is Moroccan Darija in Arabic script (not MSA); keep that register (see `ux-writing`). No French or English sentences left in `ar.ts` for the new keys. Numbers, currency and dates go through `packages/shared/src/currency.ts` and `date.ts`, not hand-formatted.
3. **Layout**: for each changed screen, grep the styles for the patterns in the table above and fix them with the app's mechanism.
4. **Long strings**: Arabic and French run longer than English. Make sure buttons and chips wrap or shrink (`numberOfLines` with `adjustsFontSizeToFit`, or flex wrap). The `break-ui` skill can stress a screen with worst-case text.

## Editing rule

Several files in both apps are CRLF (e.g. `apps/jitplus/app/login.tsx`, `constants/index.ts`, `apps/jitpluspro/components/TipsCarousel.tsx`). Edit with the Edit tool. If you script edits, open files with `newline=''`. Check `git diff --numstat` afterwards: a whole-file diff means you converted the line endings.
