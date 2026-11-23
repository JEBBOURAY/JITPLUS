# Review / follow in exchange for a prize game: market, track record, compliant alternatives (as of 11 Nov 2026)

Scope note: research done 11 Nov 2026 with about 24 tool calls. Vendor claims are marked **[vendor]**. Independent or primary sources are marked **[primary]** (Google, the law, BrightLocal) or **[independent]** (trade press or analysts). Most of the French-language evidence comes from blogs written by competing vendors. Several of those vendors sell an alternative to the wheel, so they have an interest in calling it risky.

## 1. Who sells "wheel / scratch card for a Google review or a follow" (Morocco, France, global)

### Takeaway
There are many sellers. Most are small French SaaS tools priced at about €15–50 per month, with the same flow: QR in store, then a Google review or a social follow, then a spin, then a prize collected on the next visit. In Morocco I found only one player that markets itself locally, ScanUpGo, which bills in EUR and MAD and has a Marrakech case study. Cheap NFC/QR "avis Google" plaques are also sold on Jumia.ma. Every published result figure comes from a vendor and none is audited.

### Cited Findings
**Morocco / MENA**
- ScanUpGo: QR "wheel" tool for Google and Tripadvisor reviews, Instagram, Facebook and TikTok followers, and WhatsApp contacts. Support in French and Arabic, with a Casablanca landing page. The page shows a MAD/EUR price selector, but only EUR prices appear. Plans: Starter free (1 game), €49/month (3 games, 2 marketing actions), €499/year (unlimited). It lists a +33 (French) WhatsApp number and says it is "coming to Europe". Case study: Shake Smash, Marrakech, went from 18 to 90 Google reviews in 11 weeks ("Results vary by venue"). The page does not say how actions are verified and says nothing about consent, although it collects names and emails. **[vendor]** — [ScanUpGo](https://www.scanupgo.com/en)
- Jumia Morocco sells generic "plaque NFC QR code avis Google" in French, Arabic and Amazigh versions. This shows the plain non-incentivised review tap/QR is already a commodity in Morocco. — [Jumia.ma FR](https://www.jumia.ma/generic-plaque-nfc-qr-code-avis-google-en-francais-67392691.html), [Jumia.ma Amazigh](https://www.jumia.ma/generic-plaque-nfc-code-qr-avis-google-en-amazigh-67392699.html)
- An Arabic-language search ("عجلة الحظ تقييم جوجل مطعم المغرب") found no Arabic-language Moroccan vendor or press coverage.

**France**
- BoostMyMap: flow is scan QR, Google listing, leave review, spin a personalised wheel, then "to collect a prize, return to the establishment". Price from €14.99/month excl. VAT, no commitment, 14-day trial. Claims "des centaines de commerçants en France" (the customer counter shows a "0+" placeholder), 85% participation vs "5 à 10 %" for asking verbally, and case studies such as Les Bains d'Alia going from 34 to 480 reviews in 2 months. Compliance claim: "100 % légale et conforme aux conditions d'utilisation de Google"; "La récompense n'est jamais conditionnée à une note positive"; the customer "joue qu'il laisse 1, 3 ou 5 étoiles". The page does not say how the review is verified. **[vendor]** — [BoostMyMap](https://boostmymap.fr/)
- Speeneo (restaurants): QR on the table, Google review (about 30 s), first name and email, spin, then the winner gets an email with a unique QR that staff scan at the counter. Anti-cheat: "one play per day", "Email + localStorage + server protection". Win rate is configurable from 50 to 100%. Included from €39.90/month together with a QR menu, CRM and AI review replies. Claims Twins Seyssel went from 51 to 190 reviews in 3 months (Aug–Oct 2026); a testimonial on the same page says 51 to 124 in 3 weeks, which does not match. Says it "fully respect[s] Google's guidelines" and that it's "perfectly legal in most jurisdictions". It does not explain how it confirms a review was posted. **[vendor]** — [Speeneo](https://speeneo.com/en/prize-wheel)
- Kadow Club (Toot Sweet SAS): posters say "scan to win a gift… à une condition : laisser un avis Google". The gift is collected on a later visit "subject to a purchase". Claims that "au moins un client sur cinq" leaves a review. No compliance statement and no pricing on the page. **[vendor]** — [Kadow blog](https://kadow.club/en/blog/jeux-gagner-avis-google)
- Other French vendors found that sell the same mechanic: Twivi, RushUp ("1 000+ commerçants", "+300% d'avis"), Boostigo ("+560 %" average, "x5 avis"), HeyPulse, Horus App gift-wheel, Fydl, Meditrust "roue cadeaux" (reviews plus followers), Digilor, Popscore, Cadeo, The Gifts Club, ScanQRCode.fr. **[vendor]** — [Twivi](https://twivi.fr/), [RushUp](https://rushup.fr/), [Boostigo](https://boostigo.fr/fr/blog/jeu-qr-code-commerce-avis-google), [HeyPulse](https://www.heypulse.fr/blog/roue-de-la-fortune-avis-google), [Horus](https://www.horusapp.fr/gift-wheel), [Fydl](https://www.fydl-app.com/google-reviews), [Meditrust](https://meditrust.io/produit-roue-cadeaux/), [Cadeo](https://cadeo.io/blog/roue-google-integrer-un-jeu-pour-augmenter-vos-avis-google/), [Popscore](https://popscore.fr/jeux-interactifs)
- Unitag case study: a restaurant chain used flyers with a QR leading to an online "wheel of fortune" to win a free meal. Claimed +250% reviews over 6 months and +0.5 star after two quarters. **[vendor]** — [Unitag](https://unitag.io/en/case-studies/restaurants)

**Vendors named in the brief that I could not confirm**: Wheely/Wiink, Lucky Review, Starloop, Fidelatoo, Zerosix, Qards, Guestfully, Avis-Boost. I found no pages for them in this pass. A search for Kadow pricing returned only unrelated results.

### Inferences
- The category is crowded, cheap and has no real differentiation. Being "one more wheel" is not a moat for JitPlus.
- I found no vendor that verifies a Google review was actually posted. Publicly, Google offers no API to confirm that a given customer reviewed a given place. In practice the gate is an honour system or a timer, so the "review required" condition is mostly theatre. The real effect is that the customer is in a "transaction" mindset when they write the review.
- "Prize collected on next visit" is common to all of them. It is the part that creates value for the merchant (it drives a return visit), and it does not depend on the review.

### Gaps
- No independent data on how many merchants actually use these tools, or on churn.
- No Moroccan press coverage or Moroccan-built competitor found apart from ScanUpGo, which looks French-operated.

## 2. Exact flows and how vendors word compliance

### Takeaway
The standard flow is QR (sometimes NFC), then a review or follow, then a spin, then a code or email, then the prize redeemed in store, often on the next visit with a purchase. The standard compliance defence is that the reward does not depend on the star rating ("1 ou 5 étoiles"). This misreads Google's rule, which bans incentives for *any* review whatever the rating, and since April 2026 also bans requiring or pressuring reviews on premises.

### Cited Findings
- Vendor defence wording: "La récompense n'est jamais conditionnée à une note positive" / "100 % légale et conforme" (BoostMyMap); "after any review (5 stars or 1 star)", "fully respect Google's guidelines" (Speeneo). **[vendor]** — [BoostMyMap](https://boostmymap.fr/), [Speeneo](https://speeneo.com/en/prize-wheel)
- Google Maps UGC policy, Fake Engagement section, prohibits: "Offer incentives – such as payment, discounts, free goods and/or services - in exchange for posting any review". **[primary]** — [Google contribution policy](https://support.google.com/contributionpolicy/answer/7400114?hl=en)
- The same policy, Rating Manipulation section, prohibits content "posted due to an incentive offered by a business". It adds: "merchants should not require or pressure users to leave ratings or write reviews while on the premises"; "Merchants requesting that staff solicit a certain number of reviews"; "Discourage or prohibit negative reviews, or selectively solicit positive reviews". **[primary]** — [Google contribution policy](https://support.google.com/contributionpolicy/answer/7400114?hl=en)
- The on-premises wording was added quietly on 17 April 2026 (spotted by Google Product Expert Amy Toman). Guest Suite reads it as covering tablets at reception, QR codes shown at checkout and verbal requests before the customer leaves. That reading is stricter than the text, which says "require or pressure". — [Guest Suite, 23 Apr 2026, updated 9 Jul 2026](https://www.guest-suite.com/blog/sollicitation-avis-magasin-google); also [PPC Land](https://ppc.land/google-maps-is-now-asking-users-if-businesses-paid-for-their-reviews/)
- Google's help page on review links and QR codes (formalised on 31 Dec 2025, per PPC Land) says incentives such as free or discounted goods or services in exchange for reviews are "considered fake engagement and strictly prohibited". **[primary, via secondary]** — [DropAvis citing support.google.com/business/answer/16816815](https://dropavis.com/avis-google-contre-cadeau/), [PPC Land](https://ppc.land/google-maps-is-now-asking-users-if-businesses-paid-for-their-reviews/)
- Trustpilot also bans incentivised reviews, including sweepstakes entries. — [DropAvis](https://dropavis.com/avis-google-contre-cadeau/)
- French law: no text names the prize wheel. Promotional lotteries are lawful if not unfair (DGCCRF). Art. L111-7-2 Code de la consommation and its decree require disclosing whether a review was given in exchange for something. Art. L121-4 (from the Omnibus directive, in force since 28 May 2022) lists fake or manipulated reviews as a misleading practice. Art. L132-2 sets penalties of 2 years and €300k, or 5 years and €750k when committed online. These need a judicial finding. **[secondary legal summary by a non-lawyer vendor]** — [DropAvis, 13 Oct 2026](https://dropavis.com/avis-google-contre-cadeau/); the penalty figures are also given in [Omi Day, 15 Sep 2026](https://omi.day/blog/cadeau-contre-avis-google-legal). Administrative fine figures (€75k / €375k) differ between sources — [Kohen Avocats, Jun 2026](https://kohenavocats.fr/2026/06/22/faux-avis-google-entreprise-controle-dgccrf-sanctions-2026/)
- Morocco: Law 31-08 (2011, about 206 articles) regulates promotional offers, sales with bonuses ("ventes avec primes") and lotteries, distance selling and some types of advertising. It is widely described as outdated, and a reform draft has been discussed. I found no Moroccan provision specifically on online reviews. — [UNCTAD review](https://unctad.org/system/files/official-document/cicplpd13_fr.pdf), [UNESCWA](https://alp.unescwa.org/legislations/law-3108-consumer-protection), [FNH on reform](https://fnh.ma/article/actualite-economique/protection-consommateur-maroc-cadre-juridique)

### Inferences
- In Morocco the binding constraint is Google's policy, not national law. Google's policy is global, so the Moroccan "legal vacuum" offers no protection against Google removing reviews or restricting a profile.
- "Game open to everyone, review optional" (no-purchase-necessary style) is the only wording that could make a wheel defensible. Even then, if the QR poster or screen shows the review as the step that unlocks the spin, Google can treat it as an incentive.

### Gaps
- I could not open the DGCCRF "Avis en ligne" page directly. Statements attributed to the DGCCRF come through vendor blogs.
- Status of the Moroccan consumer-law reform in 2026 is unknown.

## 3. Incidents, enforcement and criticism

### Takeaway
Since late 2025 Google has been enforcing much harder. Maps asks visitors "Does this business offer rewards in exchange for reviews?", and analysts report that a "Yes" answer leads to deletions. There were mass and retroactive removal waves in Nov–Dec 2025, the April 2026 policy change, and a five-level sanction scale that includes a public warning banner. I found no French mainstream press article or DGCCRF action that names prize wheels specifically. The criticism is mostly from industry and analysts.

### Cited Findings
- Since about Sept 2025, Google Maps asks visitors "Does this business offer rewards in exchange for reviews?" (Yes / No / Not sure). Colan Nielsen (Sterling Sky) says a "Yes" leads to reviews being deleted. Reported by Barry Schwartz on 5 Jun 2026. **[independent]** — [PPC Land](https://ppc.land/google-maps-is-now-asking-users-if-businesses-paid-for-their-reviews/)
- One client profile analysed by Claudia Tomina lost 496 reviews in Nov 2025 and 1,045 in Dec 2025, with over 80% of the year's deletions in the last 60 days. Many of the deleted reviews were from Aug–Sep 2024: Google is "auditing historical data". Mike Blumenthal says the deletions are deliberate. Darren Shaw doubts that incentivised reviews are the only target. **[independent, single profile]** — [PPC Land](https://ppc.land/google-maps-is-now-asking-users-if-businesses-paid-for-their-reviews/)
- Google blocked or removed 292M+ policy-violating reviews in 2025 (about 22% of review activity), restricted 782K+ accounts and removed 13M+ fake profiles (Google's April 2026 report). It began using Gemini to detect coordinated campaigns around 16 Apr 2026. — [PPC Land](https://ppc.land/google-maps-is-now-asking-users-if-businesses-paid-for-their-reviews/), [Guest Suite](https://www.guest-suite.com/blog/sollicitation-avis-magasin-google), [Birdeye](https://birdeye.com/blog/google-review-policy/)
- Official Google sanctions page: a profile can be blocked from receiving new reviews "for set period of time", have existing reviews "unpublished for set period of time", and "display a warning to let consumers know that fake reviews were removed". No durations are given. **[primary]** — [Google Business Profile help 14114287](https://support.google.com/business/answer/14114287?hl=en)
- Guest Suite's five-level scale: removal, Consumer Alert Banner, suspension of new reviews, restricted features (edits, replies, photos), and full suspension or ineligibility. **[vendor interpretation]** — [Guest Suite](https://www.guest-suite.com/blog/sollicitation-avis-magasin-google)
- Omi Day (about 750 points of sale) made an internal rule in 2025 after two client profiles each lost about 30 reviews at once. It says moving away from conditional mechanics caused a 2–3-week dip and a recovery in 1–2 months. It admits "corrélation, pas démonstration" and that no public statistic isolates sanctions for gift-for-review. **[vendor, competitor]** — [Omi Day](https://omi.day/blog/cadeau-contre-avis-google-legal)
- DGCCRF enforcement context: a ministerial answer (JO Sénat, 8 May 2025) reports more than 1,200 establishments checked on online reviews since 1 Jul 2023. The DGCCRF has an internal "Polygraphe" detection tool. — [Omi Day](https://omi.day/blog/cadeau-contre-avis-google-legal); also [Legatineau Express 2026](https://www.legatineauexpress.com/conso-shopping/faux-avis-en-ligne-dgccrf-controles-2026/)
- The GBP Help Community hosts a French thread/video titled "Google My Business : 38% des fiches bloquées (mars 2026)" (not verified, user-generated). Several agencies also describe a 2026 bug that made reviews and replies disappear, which makes attribution harder. — [GBP Community](https://support.google.com/business/community-video/429020801/google-my-business-38-des-fiches-bloqu%C3%A9es-mars-2026?hl=fr), [RD Agency](https://rdagency.fr/avis-google-disparaissent-bug-gbp/), [GMB Club](https://gmb-club.com/blog/avis-google-disparaissent/)

### Inferences
- The visitor survey on Maps is the biggest risk for an in-store wheel. Customers who played the wheel are exactly the people physically on site and likely to answer "Yes". Any honest customer can flag the business without any proof being needed.
- Because removals are retroactive, a merchant can lose months of reviews collected through the wheel all at once. For JitPlus this risk falls on the merchant's main local asset, and the merchant will blame the tool.

### Gaps
- No Le Monde, Les Echos, BFM, 60 Millions or UFC-Que Choisir article about prize wheels found in this pass.
- No lawsuit or shutdown of a wheel vendor found.
- No Reddit thread captured. Merchant complaint evidence is vendor-reported.

## 4. What established platforms do instead

### Takeaway
Reputable loyalty and reputation platforms reward social follows (Smile.io, Joy, on an honour basis, with Smile adding verified Instagram actions in 2025). They do not reward Google reviews. They collect Google reviews with timed, non-incentivised asynchronous requests (email/SMS after the visit, QR/NFC without promises). French reputation players such as Guest Suite now advise against soliciting on premises at all.

### Cited Findings
- Smile.io: social follow points are "honor system": points are given when the customer clicks through the Smile panel to the social profile. Social networks don't let third parties verify follows. One merchant complained that points were credited on click before any follow. In July 2025 Smile announced "verified" Instagram engagement rewards (follows, mentions, DMs) via a partnership ("Smile x Gatsby"). — [Smile help](https://help.smile.io/en/articles/4036266-how-social-media-points-work), [Smile news](https://news.smile.io/98810-smile-x-gatsby-reward-verified-instagram-engagement)
- Joy Loyalty: "we're unable to verify whether a customer has completed the action" (social). — [Joy help](https://help.joy.so/joy-loyalty/rewards-program/earning-programs/social-media)
- Zenchef: post-visit email (or SMS, a setting) asking for a review, from the Reserve plan (€129/month). Partoo Review Booster: SMS, app or API requests plus a QR per location. Malou: collection campaigns to Google, Tripadvisor or Foursquare, plus optional physical "Boosters". — [Zenchef help](https://help.zenchef.com/hc/en-gb/articles/360000805549-How-to-collect-customer-reviews), [Hackceleration comparison 2026](https://hackceleration.com/fr/labs/meilleur/logiciel-avis-clients-restaurants), [Malou blog](https://malou.io/en/blog/avis-clients-recolter-plus-restaurant-limiter-negatifs-malou)
- Guest Suite recommends: remove on-site tablets, QR codes and verbal asks; audit staff scripts and quotas; switch to email/SMS sent hours after the visit. — [Guest Suite](https://www.guest-suite.com/blog/sollicitation-avis-magasin-google)
- Omi Day and DropAvis (competitors of the wheels) both say an unconditional review QR or request with no promise of a reward is permitted, and selective solicitation (gating) is not. — [Omi Day](https://omi.day/blog/cadeau-contre-avis-google-legal), [DropAvis](https://dropavis.com/avis-google-contre-cadeau/)

### Inferences
- The accepted pattern is to reward loyalty behaviour (visits, purchases, referrals, follows on an honour basis) and to ask for public reviews separately, without any reward, from everyone, preferably after the visit.
- Rewarding a follow is not covered by Google's review policy. Meta's promotion rules apply instead, and they generally prohibit requiring people to share or tag friends as an entry condition. This was not re-verified here.

### Gaps
- Square Loyalty, Yotpo, Birdeye, Podium, NiceJob and Trustpilot help docs were not fetched in this pass, so they are not cited.

## 5. Compliant designs and measured effectiveness / business value

### Takeaway
Non-incentivised asks work well: 78% of US consumers were asked for a review in the past year and most of those wrote one. Rating, recency and count clearly drive consumer choice, and reviews make up about 20% of local-pack ranking factors (Whitespark 2026, via secondary sources). Followers won through giveaways churn heavily (about 50–60% within 2 weeks in the one widely cited case study).

### Cited Findings
- BrightLocal LCRS 2026 (1,002 US adults, published 11 Feb 2026). 97% read reviews (41% "always"). 78% were asked to leave a review in the past 12 months. Of those, 83% (body text) or 65% (a bullet; BrightLocal's own page is inconsistent) wrote one. 28% "always" review when asked (16% in 2025). 59% were offered a reward before reviewing (64% before). 31% require 4.5+ stars (17% before) and 68% require 4+. 74% only consider reviews from the last 3 months. 47% won't use a business with fewer than 20 reviews. Google use for reviews fell from 83% to 71%, and use of ChatGPT and other AI tools for local recommendations rose from 6% to 45%. 97% think businesses posting fake reviews should be punished, and 57% support bans. **[primary survey, US only]** — [BrightLocal LCRS 2026](https://www.brightlocal.com/research/local-consumer-review-survey/)
- Whitespark Local Search Ranking Factors 2026 (published 6 Nov 2025). Secondary summaries give: GBP 32%, Reviews 20%, On-page 15%, Behavioral 9%, Links 8%, Citations 6%, Personalization 6%, Social 4%. Recency is the strongest review sub-factor. Other summaries give review signals as 16%. **[secondary of expert survey; figures conflict]** — [Whitespark](https://whitespark.ca/local-search-ranking-factors/), [Emulent summary](https://emulent.com/?p=20138), [Locafy](https://locafy.com/blog/local-seo-ranking-factors)
- Channel benchmarks (vendor blogs, weak): SMS open rate about 98% vs 20–30% for email. One 15-business test reports 23% of SMS recipients reviewing within 48 h vs 11% for email. GatherUp, as cited by others: about 15 reviews per 100 email requests and 26 per 100 with SMS + email. **[vendor, unverified]** — [TrueReview](https://www.truereview.co/post/sms-review-requests-the-complete-guide-for-local-businesses), [LittleNudge](https://www.littlenudge.io/blog/sms-vs-email-vs-in-person), [Starworks](https://www.starworks.com.au/blog/sms-vs-email-review-requests-which-converts-better-in-2025)
- Steady-state volume without a wheel: Omi Day says a 40–80-cover restaurant gets 10–20 reviews/month. Wheel vendors claim 85% participation vs 5–10% for verbal asks. **[vendor]** — [Omi Day](https://omi.day/blog/cadeau-contre-avis-google-legal), [BoostMyMap](https://boostmymap.fr/)
- Giveaway follower quality: Social Media Examiner case study (about 2020; small sample; sample description inconsistent across sources). After counting unfollows, cost per follower rose from $0.06–0.09 to about $0.16–0.23. Secondary sources cite "61% unfollowed within two weeks" (not confirmed in the primary excerpt). **[older, single case]** — [Social Media Examiner](https://www.socialmediaexaminer.com/do-sponsored-instagram-contests-really-work-case-study/)

### Inferences — compliant mechanics for JitPlus (ranked)
1. **Reward the visit, ask for the review separately.** The scratch card or wheel is earned by a visit or a stamp (an existing JitPlus loyalty event). Later, a push, WhatsApp or SMS goes to *every* customer, a few hours after the visit, saying "Laissez-nous un avis Google", with no reward, no condition and no gating. This keeps the prize's return-visit effect, which is the actual value of the wheel products, and removes the Google exposure.
2. **First-party rating plus private feedback inside JitPlus** (can be rewarded and disclosed as such, because it is the merchant's own channel), followed by a Google invitation shown to *all* respondents whatever their score. Showing it only to happy ones is gating, which Google prohibits.
3. **Follow rewards**, on an honour basis or verified where possible, kept separate from reviews. Expect heavy churn, and value followers lower than reviews.
4. **Referrals** (reward the referrer and the new customer on a verified first visit). This is a standard loyalty mechanic and does not touch review policy.
5. Avoid any screen or poster that reads "laissez un avis pour jouer", in-store tablets, and staff quotas. Since 17 Apr 2026 these are named in Google's policy.

### Gaps
- No independent study comparing QR vs NFC vs SMS conversion for non-incentivised Google reviews. No Moroccan or MENA review-behaviour survey found (BrightLocal is US-only).
- No reliable 2026 figure for the monetary value of an Instagram follower to a local business.
- Wheel vendors do not publish the review rating or rating changes before and after the wheel, or deletion rates, so the true net effect of the wheel (reviews gained minus reviews later removed) is unknown.
