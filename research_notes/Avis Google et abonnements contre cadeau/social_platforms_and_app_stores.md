# Social platforms and app stores: rules on "follow to get a chance to win" and in-app prize draws (as of Nov 2026)

Research date: 2026-11-11. Scope: platform/store policies only (not Moroccan law). Many official pages (Instagram Help Center, Gleam FAQ, X Help, Snap promotion rules, Plexus) blocked automated fetching (403/404/empty); where text could not be retrieved live, this is flagged. Quotes below come from live fetches unless marked "[not re-verified live]".

## 1. Meta (Instagram + Facebook): promotions guidelines, like-gating, developer policies

### Takeaway
A business may run its own giveaway on Instagram/Facebook and (per Meta's promotion guidelines as currently worded) asking entrants to follow/like is not listed as forbidden; the forbidden items are personal-timeline sharing/tag-friends-to-enter on Facebook and inaccurate tagging on Instagram, plus a required release and "not sponsored by Meta" disclaimer. The stricter layer is the developer/platform policy for third-party apps: historically "Only incentivize a person to log into your app or enter a promotion. Don't incentivize other actions" (2014 like-gating ban). Gleam reports Meta loosened this in 2025 so tools can reward follows, but I could not retrieve Meta's own text confirming it, and Meta's API does not let a third-party app verify that a follow happened.

### Cited Findings
**Facebook Pages/Groups/Events Policy, section "Promotions" (served version, French, "Date de la dernière révision : 8 mars 2018")**
- "Si vous utilisez Facebook pour communiquer ou gérer une promotion (par exemple, un concours ou un tirage au sort), vous êtes responsable de la légalité de son déroulement, notamment : des règles officielles ; [...] de la conformité aux règlements régissant la promotion et tous les prix offerts dans le cadre de la promotion" — [Facebook Pages, Groups and Events Policies](https://www.facebook.com/policies/pages_groups_events/)
- "Les promotions sur Facebook doivent inclure les éléments suivants : une décharge protégeant Facebook dûment remplie par chaque participant, et une mention que la promotion n'est pas gérée ou parrainée par Facebook." — [same](https://www.facebook.com/policies/pages_groups_events/)
- "Les promotions peuvent être gérées sur des Pages ou dans des applications sur Facebook." / "Vous ne devez pas utiliser les journaux personnels ni les connexions des amis pour gérer des promotions" / examples like "« identifiez vos amis dans cette publication pour participer » ne sont pas autorisées" / "Nous ne vous fournirons aucune assistance dans la gestion de votre promotion." / using the service to run a promotion is "à vos propres risques" — [same](https://www.facebook.com/policies/pages_groups_events/)
- The live page contains no clause about incentivising likes or follows of the Page (fetch result) — [same](https://www.facebook.com/policies/pages_groups_events/)
- English wording widely reproduced by vendors: "Promotions on Facebook must include the following: A complete release of Facebook by each entrant or participant; and Acknowledgement that the promotion is in no way sponsored, endorsed, administered by or associated with Facebook." — [Woobox / Rafflepress / ShortStack summaries via search](https://www.shortstack.com/help/facebook-promotion-guidelines/)
- The transparency.meta.com URL for Pages/Groups/Events returned 404 on 2026-11-11 — [transparency.meta.com](https://transparency.meta.com/policies/other-policies/pages-groups-events/)

**Instagram Promotion Guidelines** (help.instagram.com/179379842258600 — page rendered empty to the fetcher; text below confirmed via search snippets of the official page and multiple 2026 vendor articles)
- Promotions "must not inaccurately tag content or encourage others to do so", example: asking people to tag themselves in photos they are not in — [help.instagram.com (search snippet)](https://help.instagram.com/179379842258600); [KickoffLabs, 7 May 2026](https://kickofflabs.com/blog/instagram-giveaway-rules-2026/)
- Required: "A complete release of Instagram by each entrant or participant" and "Acknowledgement that the promotion is in no way sponsored, endorsed or administered by, or associated with, Instagram." — [help.instagram.com (search snippet)](https://help.instagram.com/179379842258600)
- [not re-verified live, from prior knowledge of the page] Full structure: "If you use Instagram to communicate or administer a promotion (ex: contest or sweepstakes), you are responsible for the lawful operation of that promotion, including: The official rules; Offer terms and eligibility requirements (ex: age and residency restrictions); and Compliance with rules and regulations governing the promotion and all prizes offered in connection with the promotion (ex: registration and obtaining necessary regulatory approvals)." and "We will not assist you in the administration of your promotion."
- Woobox (updated 29 Apr 2026) reads the guidelines as allowing "tagging a friend in a comment, sharing to stories, following, and commenting"; "Tag yourself in this photo to enter" is the explicitly disallowed example — [Woobox](https://cdn.woobox.com/articles/instagram-giveaway-rules-and-compliance)
- KickoffLabs (May 2026) treats follow-to-enter as common and compliant, best "when follower growth is the goal" — [KickoffLabs](https://kickofflabs.com/blog/instagram-giveaway-rules-2026/)
- Conflict: Plexus (Australian compliance vendor) states "under Meta's 2025 updated guidelines, you cannot require following as a mandatory condition of entry, though you can encourage it" (seen only as a search snippet; page 403) — [Plexus](https://www.plexus.co/learn/trade-promotions/social-media/terms-and-conditions/instagram); another source reports the Promotion Guidelines page did not contain such wording when checked — [search results summary, e.g. revup.pages.dev](https://revup.pages.dev/blog/instagram-giveaway-rules-2026/)

**Like-gating / incentive rules for apps (developer layer)**
- Historical Instagram Platform Policy (2019-era copy in a US court record): "Only incentivize a person to log into your app or enter a promotion. Don't incentivize other actions." — [court exhibit PDF](https://www.lb7.uscourts.gov/documents/19-1861URL3platformpolicy.pdf)
- Facebook Platform Policy as archived in 2021: "Only incentivize a person to log into your App, enter a promotion on your App's Page or on Instagram, check-in at a place, or to use Messenger to communicate with your business." — [archived devpolicy 2021](https://proxy-ga.blitzz.co/proxy/123456/web.archive.org/web/20210623144400/https:/developers.facebook.com/devpolicy/) (this is the descendant of the Nov 2014 like-gating ban)
- Current Meta Developer Policies (last updated 3 Feb 2026, French version served): bans programs that facilitate trading engagement — "Ne participez à aucun programme promouvant ou facilitant l'achat, la vente ou l'échange de « J'aime »"; spam/automation — "à faciliter ou à encourager un comportement non authentique"; social plugins — "Ne vendez pas et n'achetez pas de placement de plugins sociaux"; promotions — "Si vous organisez une promotion sur les Produits Meta, conformez-vous aux règles promotionnelles applicables". The fetch found no clause explicitly about incentivising likes/follows/check-ins in the current text — [Meta Developer Policies](https://developers.facebook.com/devpolicy/)
- Meta Platform Terms (last updated 3 Feb 2026): no clause on incentivising likes/follows or contests — [Meta Platform Terms](https://developers.facebook.com/terms/dfc_platform_terms/)
- Gleam: "Meta updated its incentivized-actions policy to allow platforms like Gleam to reward people for following an Instagram account, so we've added Follow on Instagram and Like a Facebook Page back as competition actions" (reinstated May 2025; removed in 2016 under the older rules). Gleam also says "Instagram's API doesn't allow third-party apps like Gleam to verify a follow automatically" — it only confirms a profile visit and captures the username typed by the entrant (search snippets; page 403) — [Gleam FAQ](https://gleam.io/faq/competitions/actions/can-i-add-a-follow-on-instagram-action); [Gleam updates 2025-05-05](https://gleam.io/updates/2025-05-05)

### Inferences
- Business-run promotion: "follow us on Instagram + you're entered" is mainstream and not prohibited by the Instagram Promotion Guidelines text as known; the obligations are official rules, legal compliance, release of Instagram/Facebook, non-sponsorship acknowledgement, no inaccurate tagging. On Facebook, entry via personal-timeline share or tagging friends is forbidden.
- Third-party app (JitPlus) rewarding the follow: the old platform rule ("only incentivize log in or enter a promotion") only bound apps using Meta's platform/APIs. JitPlus would not use Meta APIs to verify a follow (it cannot — no API exposes it), so it would be a deep link out + honour-system/username capture, like Gleam's "Visit/Follow on Instagram" actions. The safest framing is that the follow is an entry action of a merchant-run promotion (which the old rule itself allowed: "enter a promotion"), with rules, releases and disclaimers naming Meta/Instagram.
- The current Developer Policies' ban on "exchanging likes" programmes targets engagement exchanges/marketplaces (follow-for-follow, buying likes); a merchant giveaway is different in kind, but a platform where many merchants systematically trade gifts for follows could be argued to resemble an "échange" programme. Moderate risk, not explicit.
- Disclaimer to include in-app: "This promotion is in no way sponsored, endorsed, administered by or associated with Instagram, Facebook or Meta. By participating, entrants release Meta/Instagram/Facebook from any liability."

### Gaps
- Could not retrieve the live English text of the Instagram Promotion Guidelines or Meta's own announcement of the 2025 incentivized-actions change; Gleam's claim is unconfirmed by a Meta primary source.
- Could not confirm or refute the Plexus "2025 update: cannot require follow" claim.
- No Meta source found on whether Meta enforces against accounts that gain followers via reward apps (inauthentic-behaviour enforcement against merchants).

## 2. TikTok

### Takeaway
TikTok's Community Guidelines (effective 24 Sep 2026) prohibit trading services that artificially boost engagement and make content that manipulates people into "inflating likes or follows" ineligible for the For You feed; they remove inauthentic metrics. No official general (non-Shop) rule banning follow-to-enter was found; TikTok's dedicated Giveaways and Promotions Policy appears to cover TikTok Shop only.

### Cited Findings
- Guidelines released 25 Aug 2026, effective 24 Sep 2026. TikTok doesn't allow "the trade of services that artificially boost engagement or trick the recommendation system"; "Content that tries to manipulate people into giving gifts or inflating likes or follows isn't eligible for the FYF."; "If we detect accounts or content with inauthentic metrics, we'll remove fake likes, followers, or other inflated signals." — [TikTok Community Guidelines, Integrity & Authenticity](https://www.tiktok.com/community-guidelines/en/integrity-authenticity)
- Vendor reports: TikTok's Giveaways and Promotions Policy (US, updated 28 Sep 2026; another source says revised 25 Feb 2026) applies to promotions in Shop listings, LIVEs and short videos; LIVE giveaway tool prizes under $500, no cash/gift cards; Gleam says there is no blanket rule banning follow-to-enter for every account — [Gleam TikTok giveaway rules](https://gleam.io/blog/tiktok-giveaway-rules/) (dates unverified against tiktok.com)
- Branded Content Policy: if a creator is compensated to promote a giveaway, commercial content disclosure must be switched on — [Gleam](https://gleam.io/blog/tiktok-giveaway-rules/)
- Headline "TikTok Reaffirms Ban on Gambling, Sweepstakes Promotions" (6 Nov 2026; content not read; likely concerns sweepstakes-casino ads) — [Covers.com](https://www.covers.com/industry/tiktok-reaffirms-ban-on-gambling-sweepstakes-promotions-nov-6-2026)

### Inferences
- A merchant's own "follow us + spin the wheel in JitPlus" is not explicitly banned, but a TikTok video saying "follow to win" risks FYF ineligibility (reduced reach), and follows from incentive could be treated as inflated signals. Mention TikTok in the disclaimer too.

### Gaps
- Official TikTok Giveaways and Promotions Policy page not retrieved; Covers article not read.

## 3. YouTube, Snapchat, X, WhatsApp Channels

### Takeaway
YouTube: contests allowed if free, with official rules, release of YouTube and "YouTube is not a sponsor"; metrics manipulation (subscribers/likes) prohibited. Snapchat: promotions subject to Snap Promotion Rules (release + non-sponsorship; no spammy mechanics). X: contest guidelines exist (not retrievable). WhatsApp Channels: no giveaway rules found.

### Cited Findings
- YouTube Contest policies: "Your contest must be free of charge to enter"; "must comply with all relevant federal, state, and local laws"; "You must include a legally compliant privacy notice in your Official Rules"; "Your rules must clearly state that YouTube is not a sponsor of your contest" and "require viewers to release YouTube from any liability related to your contest"; Official Rules must "include links to the YouTube Community Guidelines"; "You and any third-party may not manipulate metrics on the YouTube service to misrepresent genuine viewer engagement"; "You cannot associate or affiliate YouTube with your contest without YouTube's prior written consent." No explicit mention of subscribe-to-enter — [YouTube Help: Contest policies](https://support.google.com/youtube/answer/1620498)
- Snap Commercial Content Policy (effective 2 Jul 2026): promotions on Snapchat are subject to Snap's Promotion Rules — [Snap Commercial Content Policy](https://www.snap.com/terms/commercial-content); Lens Studio terms: organiser "solely responsible", Snap not a sponsor/administrator — [Lens Studio Terms](https://www.snap.com/terms/lens-studio-terms?lang=gu-IN); law-firm summary: rules must release Snapchat and acknowledge non-sponsorship, avoid "spammy behavior" like sending Snaps to friends — [JD Supra](https://jdsupra.com/legalnews/launching-a-sweepstakes-or-contest-on-4624679)
- X: Guidelines for running contests page returned 403 — [help.x.com](https://help.x.com/en/rules-and-policies/twitter-contest-rules)
- WhatsApp Channels Guidelines (last updated 16 Feb 2024): cover illegal content, regulated goods, respectful update frequency; no provision on giveaways or incentivised follows found — [WhatsApp Channels Guidelines](https://www.whatsapp.com/legal/channels-guidelines?lang=ar)

### Inferences
- Across platforms the common denominator is: free entry, official rules, release of the platform, explicit non-sponsorship statement, no metric manipulation. A single generic disclaimer listing all platforms covers this.
- [not re-verified, prior knowledge] X's contest guidelines discourage requiring multiple accounts / duplicate posts and suggest encouraging entrants to mention/follow; verify before relying.

### Gaps
- Snap Promotion Rules and X contest guidelines not retrieved verbatim.

## 4. Apple App Store Review Guidelines (last updated 16 Oct 2026)

### Takeaway
A merchant-sponsored free prize draw inside JitPlus is permissible under 5.3 if official rules are shown in-app and state Apple is not a sponsor — but 5.3.1 says sweepstakes "must be sponsored by the developer of the app", which is a friction point when the merchant (not JitPlus) is the sponsor. Social-posting gates and review incentives are restricted (3.1.2(a), 3.2.2(x), Section 3 intro, 5.6).

### Cited Findings
- "5.3.1 Sweepstakes and contests must be sponsored by the developer of the app." — [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- "5.3.2 Official rules for sweepstakes, contests, and raffles must be presented in the app and make clear that Apple is not a sponsor or involved in the activity in any manner." — [same](https://developer.apple.com/app-store/review/guidelines/)
- "5.3.3 Apps may not use in-app purchase to purchase credit or currency for use in conjunction with real money gaming of any kind." — [same]
- "5.3.4 Apps that offer real money gaming [...] or lotteries must have necessary licensing [...] Lottery apps must have consideration, chance, and a prize." — [same]
- 5.3 intro: "Only include this functionality if you've fully vetted your legal obligations everywhere you make your app available and are prepared for extra time during the review process." — [same]
- 3.2.2(x) as fetched: "Apps must not force users to rate the app, review the app, download other apps, or other store-related actions in order to access functionality, content, or use of the app. Apps may otherwise incentivize users to take specific actions within apps (such as by completing a level or watching an ad)." — [same]. Note: older versions (pre-2025) read "...rate the app, review the app, watch videos, download other apps, tap on advertisements, enable tracking, or take other similar actions..."; the fetcher's rendering could be lossy — re-check.
- 3.1.2(a) (subscriptions): users should get what they paid for "without performing additional tasks, such as posting on social media, uploading contacts, checking in to the app a certain number of times, etc." — [same]
- Section 3 intro: "If we find that you have attempted to manipulate reviews, inflate your chart rankings with paid, incentivized, filtered, or fake feedback, or engage with third-party services to do so on your behalf, we will take steps [...] which may include expelling you from the Apple Developer Program." — [same]
- 5.6.1: "Use the provided API to prompt users to review your app [...] we will disallow custom review prompts." 5.6.3: "Manipulating any element of the App Store customer experience such as charts, search, reviews, or referrals to your app [...] is not permitted." — [same]
- 5.1.2(i): app "may not require users to enable system functionalities (such as push notifications, location services, tracking) in order to access functionality, content, use the app, or receive monetary or other compensation, including but not limited to gift cards and codes." — [same]
- 4.5.4: promotional push only with explicit opt-in and in-app opt-out — [same]
- 3.1.1 loot boxes: odds disclosure required for randomized items "for purchase" — [same]

### Inferences
- Allowed shape: free spin/scratch (no IAP, no payment), merchant prizes, in-app official rules screen per campaign, line "Apple is not a sponsor of, nor involved in any way with, this promotion". Expect extra review time; mention in review notes.
- 5.3.1 risk: in a marketplace model the merchant is the real sponsor. Mitigations: make JitPlus (the developer) the formal organiser/administrator of the draw "on behalf of" participating merchants in the official rules, or frame rewards as loyalty perks rather than sweepstakes. Apps like loyalty/marketplace platforms commonly do this; no Apple text found addressing third-party-merchant sponsored draws.
- Follow-to-spin: 3.2.2(x) as currently worded targets store-related actions (rating/review/downloads), so incentivising an external social follow is not explicitly banned; "Apps may otherwise incentivize users to take specific actions". But it must never be tied to App Store ratings/reviews, and the core app functionality must not be gated behind social posting.
- Rewarding Google reviews is not an App Store issue but is a Google Maps policy issue (out of scope here).

### Gaps
- No Apple guidance on merchant-sponsored (non-developer) draws; whether reviewers accept "developer as administrator" framing is unverified.

## 5. Google Play Developer Policy: Real-Money Gambling, Games and Contests; gamified loyalty

### Takeaway
Google Play prohibits real-money gambling/contests where users pay for a chance at a prize, but explicitly permits "gamified loyalty programs" in non-game apps with chance-based rewards provided official rules are published in the app, odds/selection method disclosed, and drawings have fixed winners, entry deadline and award date. A free-to-enter lucky wheel with merchant rewards fits, if no payment/fee is a condition.

### Cited Findings
- Scope: "Google Play generally prohibits apps from facilitating real-money gambling and gaming"; violation example: "Games that accept money in exchange for an opportunity to win a physical or monetary prize"; "we don't allow content or services that enable or facilitate users' ability to wager, stake" [...] "to obtain a prize of real world monetary value." — [Play Console Help: Real-Money Gambling, Games, and Contests](https://support.google.com/googleplay/android-developer/answer/9877032)
- Gamified loyalty programs, all apps: rewards must be supplementary to a genuine separate monetary transaction; "No portion of the qualifying monetary transaction may represent a fee or wager to participate in the loyalty program"; "the qualifying monetary transaction must not result in the purchase of goods or services above its usual price." — [same]
- Game apps: rewards "may not be wagered, awarded or exponentiated by game performance or chance-based outcomes." — [same]
- Non-game apps: must "disclose within the official terms for the program 1) the odds for any reward programs which use fixed odds" (or selection method); drawings/sweepstakes must "Specify a fixed number of winners, fixed entry deadline, and prize award date, per promotion"; official rules published in the app; fixed ratios documented — [same] (verbatim fragments; the fetcher declined to reproduce the full section)
- No dedicated "free to play / no purchase necessary" section; page has no revision date (©2026) — [same]

### Inferences
- JitPlus consumer app is a non-game app → chance-based merchant rewards allowed with: in-app official rules, odds disclosure for the wheel (e.g. per-segment probability), for draws a fixed number of winners, entry deadline and award date. Keep entry free (a follow is not a monetary transaction). If spins are tied to purchases (stamps), ensure no price uplift and no fee.
- Deceptive-behaviour / ratings manipulation policies (not fetched) would bar rewarding Play Store ratings.

### Gaps
- Full verbatim gamified-loyalty text not obtained; Play "User Ratings, Reviews and Installs" policy not fetched this session.

## 6. Giveaway tools phrasing ("visit" vs "follow") and platform restrictions

### Takeaway
After Meta's 2016 tightening, tools like Gleam replaced "Follow on Instagram" with "Visit on Instagram"; Gleam says Meta's policy change let it restore "Follow on Instagram" and "Like a Facebook Page" in May 2025, but follows still cannot be verified via API (honour system + username capture).

### Cited Findings
- Gleam: follow/like actions pulled in 2016 under Meta's incentivized-action rules; restored in 2025; "Instagram's API doesn't allow third-party apps like Gleam to verify a follow automatically" — entrants visit the profile and type their username — [Gleam FAQ](https://gleam.io/faq/competitions/actions/can-i-add-a-follow-on-instagram-action); [Gleam "Upcoming Changes to Instagram Actions" 2016](https://gleam.io/updates/2016-05-15); [Gleam updates 2025-05-05](https://gleam.io/updates/2025-05-05)
- Gleam Instagram docs: "due to Instagram's new API limitations, we are no longer able to support this action" (appears to refer to the Instagram sign-in Entry action) — [Gleam Instagram actions docs](https://gleam.io/docs/actions/instagram)
- Other tools (Rivo, KickoffLabs) offer "Follow on Instagram" actions — [Rivo help](https://help.rivo.io/en/articles/8409346-follow-on-instagram); [KickoffLabs Instagram actions](https://support.kickofflabs.com/documentation/scoring-rewards/kickofflabs-actions-master-guide/customizing-instagram-actions)
- ShortStack quotes the old platform rule "Only incentivize a person to log into your app or enter a promotion. Don't incentivize other actions." — [ShortStack](https://www.shortstack.com/help/facebook-promotion-guidelines/)

### Inferences
- For JitPlus: label the action "Suivre / Visiter notre Instagram" and grant the spin on tap-through (unverified), as Gleam does. Do not scrape or automate follow verification (would breach Meta automation/scraping rules and TikTok inauthentic-engagement rules). Conservative wording "Visit" removes most risk; "Follow" is now industry-standard again per Gleam.
- Rafflecopter and SweepWidget phrasing not checked.

### Gaps
- Meta primary source for the 2025 change; Rafflecopter/SweepWidget/Woobox current action labels not retrieved.
