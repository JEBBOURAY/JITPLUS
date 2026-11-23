---
name: jitplus-design-system
description: The JIT+ visual language for jitplus (client) and jitpluspro (Pro) — tokens, type, color, radius, shadow, icons, motion, and the anti-"AI look" rules that keep the apps premium, calm and clear. Use before designing, building, restyling or reviewing any screen or component in either app, and whenever a screen looks generic, busy, flashy or AI-made.
---

# JIT+ design system

**Target feel:** premium, calm, trustworthy. A merchant at the counter and a customer in a café must understand each screen in two seconds. Think Revolut or Apple Wallet, not a crypto landing page. Decoration has to earn its place. Clarity always wins over effect.

## Tokens: use them, never raw values

| What | jitplus | jitpluspro |
|---|---|---|
| Colors | `useTheme()` from `contexts/ThemeContext.tsx` (`bg`, `bgCard`, `bgElevated`, `text`, `textSecondary`, `textMuted`, `primary`, `primaryBg`, `accent`, `border`, `borderLight`, `success`, `warning`, `danger`) | same API, own palette in `contexts/ThemeContext.tsx` |
| Type sizes | `fontSize` from `utils/responsive.ts` (xs 11, sm 13, md 15, lg 17, xl 20, 2xl…) | `fontSize` from `utils/responsive.ts` |
| Font family | Lexend, **Cairo for Arabic** (Lexend has no Arabic glyphs). Both apps resolve it in `packages/shared/src/fontResolution.ts` through `components/AppText` (`Text`, `TextInput`): always import those, never RN's (Pro ESLint enforces it) | set `fontFamily: font.<weight>` from `constants/design.ts`; AppText swaps it for Cairo in Arabic |
| Radius | `radius` sm 8, md 12, lg 16, xl 20, full | same scale |
| Shadow / icons | — | `shadow.sm`, `icon` (stroke 1.75, sizes 16/20/24) in `constants/design.ts` |
| Motion | `utils/motion.ts` (`EASE_OUT`, `SPRING_SMOOTH`, `SPRING_MOMENTUM`, `spring()`), Reanimated 4 | core `Animated` only |

**Brand:** violet `#7C3AED` (dark mode `#A78BFA`) on near-white `#FAFAFA` and white cards. Neutrals carry the screen. Violet marks **one** primary action or the active state per screen. Gold or amber (`accent`) is for rewards only.

## Rules

1. **One primary action per screen.** It is a filled violet button. Everything else is secondary (outline or tinted `primaryBg`) or a text link.
2. **Hierarchy through type and space, not color.** Use at most 3 text sizes per screen and 2 weights (regular and semibold, bold only for titles). Use `textSecondary`/`textMuted` for supporting text rather than more colors.
3. **Spacing on a 4-pt grid:** 4, 8, 12, 16, 20, 24, 32. Screen gutter 16 (20 on large phones). The gap between unrelated groups is clearly bigger than inside a group.
4. **Surfaces:** white card on `#FAFAFA`, either a 1px `border` **or** `shadow.sm`, never both, never a coloured glow. Nest at most 2 levels of cards.
5. **Radius from the scale only:** sm for chips and inputs, md for buttons and small cards, lg for cards and sheets, full for pills and avatars. Pro alone currently has 8 different radius values; converge on the scale.
6. **Fonts:** never set `fontWeight` together with a `fontFamily` (Android fakes the bold or falls back to the system font). Pick the weight's family instead. Text must come from `@/components/AppText` so Arabic gets Cairo (fixed in Pro 2026-11-21). Only the Arabic social post keeps RN's `Text` on purpose.
7. **Icons:** one family, one stroke (1.75), sizes 16/20/24. No emoji as UI. No icon on every list row "for decoration".
8. **Touch targets:** 44×44 minimum (48 on Android lists). Primary buttons are 52 tall and full width at the bottom when the screen is a form or a flow.
9. **Numbers that matter** (stamps, points, amounts) are big, tabular, `text` color. Units are smaller and `textSecondary`.
10. **Dark mode** must work for every new component. Check `isDark` screens, never hard-code `#fff` or `#000`.

## What makes it look "AI-made" (remove these)

- Gradients on buttons, cards or text, especially violet-to-pink or violet-to-blue. Keep `LinearGradient` only for photo scrims and the reward or game moments where it is the content.
- Glows, neon, coloured shadows, glassmorphism or blur used as decoration.
- Emoji in labels or titles, sparkle badges ("✨ New"), "🎉" success screens.
- Uppercase letter-spaced micro-labels everywhere.
- Every element animating on mount, staggered fade-ins on whole screens, bouncing springs without a gesture, pulsing dots.
- Three accent colors on one screen. Rainbow category chips.
- Vague marketing copy ("Unlock amazing rewards!"). Write plain, specific text instead ("2 tampons avant votre café offert").
- Center-aligned long text. Cards inside cards inside cards.

## Motion budget

Animate only to explain: what appeared, where it went, or that something succeeded. Durations 150–250 ms, `EASE_OUT` for entering. Springs only for gesture-driven elements (sheets, swipes). Respect reduced motion (`AccessibilityInfo.isReduceMotionEnabled`). Celebrations (reward unlocked, wheel won) may be richer, but only there.

## Measure before and after a pass

```bash
cd apps/<app>
grep -rhoE "'#[0-9A-Fa-f]{3,8}'" app components --include=*.tsx | wc -l           # raw hex colors (baseline 2026-11-21: jitplus 230, Pro 296)
grep -rlE "LinearGradient" app components --include=*.tsx | wc -l                 # gradient files (jitplus 12, Pro 16)
grep -rhoE "borderRadius: [0-9]+" app components --include=*.tsx | sort | uniq -c | sort -rn   # radius drift
grep -rnE "fontWeight" app components --include=*.tsx | grep -n fontFamily       # weight+family clashes (jitplus 92 fontWeight uses)
```

Each pass should make these numbers go down, never up.

## How to work

1. Read the screen and its components. Screenshot it on the emulator if possible (skill `run-mobile`), in light, dark and Arabic.
2. List the problems against the rules above, ordered as: hierarchy, spacing, color, type, details, motion.
3. Fix with tokens. Extract a shared component when the same pattern appears 3 or more times (Pro has `components/ui/`: `ActionButton`, `Card`, `BottomSheet`, `NoticeBanner`, `SummaryCard`).
4. Re-screenshot and compare. Run `verify-changes` (tsc + jest).

Companion skills: `unslop` (method for de-AI-ing a screen), `emil-design-eng` (polish details), `apple-design` (gestures and motion), `ux-review` (usability), `break-ui` (worst-case data), `i18n-rtl-check`.
