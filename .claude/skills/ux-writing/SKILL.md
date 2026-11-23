---
name: ux-writing
description: Write and review the interface text of jitplus and jitpluspro in French, Arabic and English — buttons, titles, errors, empty states, confirmations, notifications, onboarding — so the apps read simple, clear and human for customers and merchants in Morocco. Use when adding or changing any user-facing string, error message or push notification, or when a screen is confusing because of its words.
---

# UX writing for JIT+

Clear words do more for simplicity than any redesign. French is the reference language; Arabic and English are full translations, not word-for-word copies.

## Principles

1. **Say what happens, in the user's words.** "Tampon ajouté" rather than "Transaction enregistrée avec succès". "Votre café offert vous attend" rather than "Récompense disponible".
2. **Short.** Buttons are 1–3 words, titles 2–5, body text one sentence when possible. Cut "veuillez", "afin de", "avec succès", "s'il vous plaît" unless politeness is needed (errors).
3. **Buttons start with a verb and name the result:** "Ajouter 2 tampons", "Offrir la récompense", "Créer la carte". Never "OK", "Valider" or "Soumettre" alone when a precise verb exists. Confirmation dialogs repeat the verb ("Supprimer" / "Annuler"), not "Oui" / "Non".
4. **Numbers are concrete:** "Encore 2 tampons avant votre récompense", "3 clients aujourd'hui".
5. **Errors:** what happened + what to do, without blame or technical words. "Pas de connexion. Vérifiez votre réseau et réessayez." Never show codes, "erreur 500", "token" or "null". Backend errors come from `apps/backend/src/common/i18n/error-messages.ts` (fr/en/ar); add every new key there.
6. **Empty states** explain the value and offer the first action: "Aucune carte pour l'instant. Scannez le QR d'un commerce pour commencer."
7. **No hype, no AI tone:** no "Découvrez", "Boostez", "incroyable", "✨", exclamation marks everywhere, or "Nous sommes ravis". Calm and confident.
8. **Address the user consistently:** "vous" in French for both apps (no "tu" anywhere). The `ar` locale is **Moroccan Darija written in Arabic script**, not Modern Standard Arabic: "ماقدرناش نبدلو المودپاس", "بغيت الزبناء ديالي يدوزو كثر". Keep that register. Keep brand and feature names stable everywhere (JitPlus, JitPlus Pro, tampon, récompense, carte de fidélité, roue de la chance, carte à gratter).
9. **Merchant copy** (Pro) is operational: fast to read at the counter. Customer copy (jitplus) is warm but just as short.
10. **Pro on iOS:** no plan, upgrade or price wording (`i18n/iosStoreCopy.ts`). Videos and marketing never mention the Pro plan either.

## Push notifications

Title = the news (≤ 40 chars), body = the detail and the benefit (≤ 90 chars), and the tap opens the exact screen. One notification = one message. Example: "Plus qu'un tampon chez Café Atlas" / "Votre prochain passage vous offre un café."

## Arabic (Darija)

- Write the way a Moroccan merchant or customer speaks, in Arabic script: "ديال", "بغيت", "دابا", negation "ما…ش". Common French loanwords are fine when that is what people say (المودپاس, الپروفيل). Use the letters already used in the files (پ for p) and keep each word's spelling consistent across both apps.
- Translate the meaning and adapt the sentence order; never keep the French word order.
- Numbers, prices (`packages/shared/src/currency.ts`) and phone numbers stay readable left to right inside RTL text.
- Check the length: Arabic must fit the same buttons, so keep it as short as the French.
- In Pro, text renders in Cairo through `components/AppText` (see `jitplus-design-system`).

## Placeholders and keys

i18n-js placeholders are `%{var}`, with the same set in every locale. Plurals use the `_one` / `_other` keys already used in the apps. No emoji in locale strings (Pro test `locales.test.ts`). Run `i18n-rtl-check` after editing.

## Review output

For each string: current text → proposed fr / ar / en → why (shorter, clearer, actionable). Apply directly in `i18n/locales/*.ts` and keep the keys unchanged unless the meaning changes.
