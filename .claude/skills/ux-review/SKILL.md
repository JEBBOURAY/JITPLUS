---
name: ux-review
description: Review a JIT+ screen or flow for ease of use — task speed, clarity of copy, states (loading, empty, error, offline), accessibility, and the real usage context of customers and merchants in Morocco. Use when designing or reviewing a flow, when a screen feels confusing or slow to use, before shipping a new feature, or when the user asks to make the app simpler, clearer or easier.
---

# UX review for JIT+

## Know who is using it

- **Customer (jitplus):** in a shop or a café, one hand, often weak 4G. Wants to see their stamps, scan, and know "how many before my reward". Languages: French, Arabic, English. Many users are not tech-savvy.
- **Merchant (jitpluspro):** at the counter, with a queue, sometimes a shared phone or an employee (team member). The scan → stamp action must take **under 3 seconds and 2 taps**. Setup tasks (rewards, deals, games, booking) happen calmly, later.

## Review grid (go through each item, note ✅ or the problem with a fix)

1. **Goal in 2 seconds:** can you tell what the screen is for and what to do next? The title says the task, not the feature name.
2. **Primary action:** exactly one, visible without scrolling, in the thumb zone (bottom half). Destructive actions are separated and need confirmation.
3. **Steps:** count the taps for the main task. Remove any step the app can infer (defaults, last-used values, auto-advance after OTP, prefilled phone country `+212`).
4. **Copy:** short, concrete, in the user's words. Buttons start with a verb ("Ajouter un tampon", not "Valider"). Errors say what happened **and** what to do. No jargon (plan, campaign ID, token). Backend errors come translated via `ERROR_MESSAGES`; never show a raw key.
5. **States:** every data screen has loading (skeleton matching the layout, not a spinner in the middle), empty (explains and offers the first action), error (retry button), offline (`OfflineBanner`, cached data from the react-query persister), and success feedback (haptic + short visual confirmation).
6. **Forms:** right keyboard type, autofill and `textContentType`, inline validation on blur rather than on every keystroke, the submit button stays reachable above the keyboard, errors next to the field, no lost input on back or background (drafts).
7. **Feedback timing:** an action responds in under 100 ms (pressed state, haptic). Anything over 1 s shows progress. Use optimistic updates for stamps and likes when the server confirms right after.
8. **Accessibility:** 44×44 targets, contrast 4.5:1 for body text (check `textMuted` on `bg`), `accessibilityLabel` on icon-only buttons, text scaling up to 1.3× without breaking layout, screen reader order makes sense.
9. **Arabic and RTL:** the flow reads naturally right to left, nothing is truncated, numbers and phone numbers stay LTR (see `i18n-rtl-check`).
10. **Trust:** before asking for a permission (location, camera, notifications), explain why in context. Personal data requests are justified. Pro on iOS shows no plan upsell (App Store rules).
11. **Consistency:** the same action looks and is named the same everywhere, in both apps where they share concepts (stamp, reward, deal, card).

## Output

A table: issue → why it hurts (who, when) → fix → effort (S/M/L). Order by impact on the main task. Then apply the S and M fixes yourself (see memory: act autonomously after an audit). Leave product decisions (removing a feature, changing a business rule) to the user. Confirm on the emulator with `run-mobile` when available.
