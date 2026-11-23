# Technical feasibility: verifying Google reviews and social follows from a third-party app (as of Nov 2026)

Scope: JitPlus Pro feature idea "leave a Google review or follow our social account, get a lucky-wheel spin". Research date 2026-11-11. About 23 tool calls. Primary docs were used where they could be fetched. Gleam pages returned HTTP 403, so Gleam claims come from search snippets.

## Q1. Google reviews: what the official APIs expose and whether a review can be matched to an app user

### Takeaway
No official Google API identifies who wrote a review in a way that can be tied to an app user. The Business Profile API (which needs the merchant's OAuth plus an access request) returns only displayName, profilePhotoUrl and isAnonymous for the reviewer, with no ID or email. Places API returns at most 5 reviews. Matching can only be a weak heuristic on name and timestamp, and it can be gamed. Worse, Google's content policy plainly prohibits rewarding reviews, so the "review → spin" mechanic itself breaks Google policy whatever the verification method.

### Cited Findings
**Business Profile API (v4 `accounts.locations.reviews`)**
- Review fields: `name`, `reviewId` (encrypted), `reviewer`, `starRating` (ONE..FIVE), `comment`, `createTime`, `updateTime`, `reviewReply`, `reviewMediaItems[]`. The Reviewer object has only `profilePhotoUrl`, `displayName` (both filled "only if isAnonymous is false") and `isAnonymous`. There is no reviewer ID, email or Google account ID. — [Google, Review resource](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews)
- Methods: `reviews.list` (paginated), `reviews.get`, `reviews.updateReply`, `reviews.deleteReply`. No deprecation notice is shown on the page. — [same](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews)
- Access prerequisites: a Google Cloud project, an Organization account, and an access request. Eligibility: you must manage a Business Profile "verified and active for 60+ days" (your own or a client's) and have a website listed on it. You apply through the GBP API contact form ("Application for Basic API Access") using an email that is an owner or manager on the profile. No review timeframe is given. A quota of 0 QPM means not approved and 300 QPM means approved. — [Google, Prerequisites](https://developers.google.com/my-business/content/prereqs)
- Notifications: Pub/Sub topic → grant `mybusiness-api-pubsub@system.gserviceaccount.com` publish rights → `PATCH https://mybusinessnotifications.googleapis.com/v1/accounts/{accountId}/notificationSetting?updateMask=pubsubTopic`. "New or updated reviews" are a supported notification category, but the exact enum names (NEW_REVIEW / UPDATED_REVIEW) and the payload were not on the fetched page. — [Google, Notification setup](https://developers.google.com/my-business/content/notification-setup)
- API content policy: content from the Business Profile APIs may be stored "temporarily for no more than 30 calendar days" and "cannot be manipulated or aggregated in any way". Replying to reviews for an end client needs their authorization. The API policies say nothing explicit about incentives or tracking reviewers. — [Google, Business Profile API policies](https://developers.google.com/my-business/content/policies)

**Places API (New)**
- The `reviews` field returns "up to five" reviews and is billed under the Place Details Enterprise + Atmosphere SKU. Review fields: `name`, `relativePublishTimeDescription`, `rating`, `text`, `authorAttribution.displayName`. The page lists no sort option. — [Google, Place Details (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)
- Pricing: Place Details Enterprise + Atmosphere costs about $25 per 1,000 calls after a 1,000-call free cap, with volume tiers of $20 / $15 / $7.50 / $2.28 (figures from a search summary of the pricing page; tier boundaries were inferred). — [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing)

**Google policy on incentivised reviews**
- Maps contribution policy: "Rating Manipulation includes Incentivized or Biased Reviews, which are not allowed and will be removed from Maps." Merchants may not "Offer incentives – such as payment, discounts, free goods and/or services - in exchange for posting any review." Merchants also may not "selectively solicit positive reviews" (review gating) or pressure customers on the premises. — [Google Maps user-contributed content policy](https://support.google.com/contributionpolicy/answer/7400114)
- Business Profile help: offering free or discounted goods or services in exchange for posting, changing or removing reviews is "strictly prohibited" and may lead to Business Profile restrictions. Customers can be sent a review link or QR code and must be signed into a Google Account. — [Google Business Profile Help, Get reviews](https://support.google.com/business/answer/3474122)

**Visibility delay and filtering**
- Reviews are checked for policy compliance, which "might take a few days, which can delay a review's appearance". Reviews removed for policy violations "won't be restored". Google may temporarily disable user content for some profiles or categories. — [Google, Missing or delayed reviews](https://support.google.com/business/answer/10313341)

**App-store review APIs (not relevant)**
- The Play In-App Review API lets users "submit Play Store ratings and reviews" for the app itself. It is quota-limited, must not be triggered from a CTA button, and the app must not ask questions before showing it. It does not cover Google Maps or Business reviews. — [Android Developers, In-App Review](https://developer.android.com/guide/playcore/in-app-review)

### Inferences
- Matching a review to an app user: the only available signals are displayName, photo URL and createTime. Names are not unique and can be changed or set anonymous, and reviews appear with a delay of minutes to days. A matcher could therefore pair "user X tapped 'review' at T" with "a new review by a similar name after T". That gives a low-confidence, spoofable match, and it breaks completely for anonymous reviewers.
- No callback after the writereview deep link: `search.google.com/local/writereview?placeid=…` and `g.page/r/…/review` are plain web/Maps URLs, and no documented return URL, intent result or SDK callback exists. I found no Google doc describing one. The app can only observe that the link opened and that the app returned to the foreground (AppState `active`).
- The Business Profile API path needs each merchant to grant OAuth (`https://www.googleapis.com/auth/business.manage`, the standard scope for this API, though the fetched page did not list scopes) plus a one-time API access approval for JitPlus's Cloud project. This is possible for a small SaaS that manages client profiles, but approval timing is undocumented. Developer reports of weeks or rejections were not verified here.
- Policy: because Google forbids incentives "in exchange for posting any review", the risk lies with the merchant's Business Profile (review removal, profile restrictions) whatever the verification method. Building API-backed matching would make JitPlus a documented tool for policy-violating incentives, which also risks the API approval. The 30-day storage limit and the "not manipulated or aggregated" rule add more friction to building a reviewer→user mapping.
- A safer product framing is to give the spin for *visiting / scanning / asking for feedback*, and to offer the Google review link afterwards with no reward attached ("review invitation" rather than "review reward").

### Gaps
- The exact OAuth scope string and the Pub/Sub NotificationType values/payload are not quoted from the fetched pages (business.manage and NEW_REVIEW/UPDATED_REVIEW are well known but unverified here).
- Real-world approval delay for GBP API access: no official figure.
- Whether Places API (New) can sort reviews by newest: not documented on the fetched page. The legacy Places API had `reviews_sort=newest`, but this was not verified for 2026.
- The SerpApi Google Maps Reviews per-search price was not confirmed from SerpApi's own page.

## Q2. Scraping providers for Google reviews

### Takeaway
Third-party scrapers return more reviews than Places API and do it cheaply. Their reviewer data is still only public profile info (name, sometimes a Maps contributor ID or link), so they do not solve identity matching, and they rely on scraping Google, which Google's ToS do not permit.

### Cited Findings
- DataForSEO Google Reviews API: $0.00075 per 10 reviews on the standard queue (up to about 45 min turnaround) and $0.0015 per 10 on the priority queue (about 1 min). Extended reviews are billed per 20 with place_id/keyword surcharges. A free sandbox is available. — [DataForSEO pricing](https://dataforseo.com/pricing/business-data/google-reviews-api)
- Outscraper: about $3 per 1,000 reviews (501–100k), about $1 per 1,000 above 100k, pay as you go (third-party listing; not verified on Outscraper's own page). — [Fitgap](https://us.fitgap.com/products/017023/outscraper); [freetier.co](https://freetier.co/directory/products/outscraper)
- Apify community actors for Google Maps reviews list prices of about $0.25–$5 per 1,000 reviews. — [Apify solidcode actor](https://apify.com/solidcode/google-maps-reviews-scraper); [Apify compass actor](https://apify.com/compass/google-maps-reviews-scraper/pricing)
- SerpApi: plan pricing appears in third-party listings at about $50–75/month for about 5,000 searches. The sources disagree. — [G2](https://www.g2.com/products/serpapi-serpapi); [Subscribed.fyi](https://subscribed.fyi/serpapi/reviews/)

### Inferences
- Cost is negligible: polling a merchant's newest reviews every few minutes costs cents per month. The real problems are (a) no reliable reviewer identity, (b) ToS risk carried by the vendor and by JitPlus as a consumer of scraped data, and (c) the incentive itself remaining a Google policy violation.

### Gaps
- Whether these scrapers expose a stable reviewer/contributor ID in 2026 was not checked.
- Google's ToS clause on automated access was not fetched here.

## Q3. Social follows: what official APIs can verify (Instagram, Facebook, TikTok, YouTube, Snapchat, X)

### Takeaway
Of these platforms, only YouTube can technically verify that a specific user follows a channel, through `subscriptions.list?mine=true&forChannelId=…` with the user's OAuth consent. But YouTube's developer policy explicitly forbids rewarding users for engaging. Instagram, Facebook and TikTok offer no official endpoint to list a business's followers or to check "does user X follow Y". Not possible via official API.

### Cited Findings
**Instagram**
- Instagram Basic Display API (the consumer/personal-account API) was shut down on December 4, 2024. Meta said there would "no longer be a set of Instagram APIs for consumer developer apps". — [Meta blog, Sept 4 2024](https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api); [Basic Display docs](https://developers.secure.facebook.com/docs/instagram-basic-display-api)
- Instagram API with Instagram Login scopes: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_messages`, `instagram_business_manage_comments` (the old `business_*` values were deprecated January 27, 2025). It serves Instagram professional accounts only. No scope covers followers or follow relationships. — [Meta, Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)
- The account's own `followers_count` is exposed. Business Discovery (Facebook Login variant) returns basic metrics such as follower counts of *other* professional accounts, but no follower lists. — [Meta, IG User reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/); [Meta, Business Discovery](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/business-discovery)
- SweepWidget: "Meta's APIs don't provide endpoints to check if one user follows another account". Instagram follow entries are manual, with users entering their username. — [SweepWidget docs](https://sweepwidget.com/docs/entry-method-verification-api-vs-manual)

**Facebook Pages**
- SweepWidget: Facebook's API "doesn't allow verification of page likes or follows by other users". Facebook entries are manual. — [SweepWidget docs](https://sweepwidget.com/docs/entry-method-verification-api-vs-manual)
- Meta banned like-gating and incentivising Page likes on November 5, 2014. The policy text is quoted as "Only incentivize a person to log into your app or enter a promotion… Don't incentivize other actions." (secondary sources). — [Search Engine Journal](https://www.searchenginejournal.com/facebook-bans-like-gating-incentivizing-users-like-pages/113670); [Loeb & Loeb](https://www.loeb.com/rticles-clientalertsreports-20140821-facebookplatformpolicyprohibitlikegating)
- Meta's Policies Deep Dive lists incentivising users to like a Page as a violation. Meta's spam Community Standard treats requiring likes, shares or follows to access content as like/share-gating. — [Meta Policies Deep Dive](https://developers.facebook.com/docs/apps/policies/policies-deep-dive/); [Meta Transparency, Spam](https://transparency.meta.com/en-gb/policies/community-standards/spam/)

**TikTok**
- Login Kit / Display API scopes: `user.info.basic`, `user.info.profile`, `user.info.stats` (likes count, follower count, following *count*), `video.list`, `video.publish`/`upload`/`manage`, portability, research and local-service scopes. No scope or endpoint returns following lists or checks a follow relationship. — [TikTok for Developers, Scopes](https://developers.tiktok.com/doc/tiktok-api-scopes)
- Gleam: TikTok has no follow-verification API. Users must visit the profile before they can complete the action, and organisers verify manually. — [Gleam, TikTok actions](https://gleam.io/docs/actions/tiktok); SweepWidget agrees: "there's no endpoint to verify follows" — [SweepWidget docs](https://sweepwidget.com/docs/entry-method-verification-api-vs-manual)

**YouTube**
- `subscriptions.list` supports `mine=true` (authorized request) with `forChannelId` (results "will only contain subscriptions matching those channels") at 1 quota unit per call. With the user's OAuth this checks whether they subscribe to the merchant's channel. — [YouTube Data API, subscriptions.list](https://developers.google.com/youtube/v3/docs/subscriptions/list)
- YouTube API Services Developer Policies III.F.3.c: you "must not offer or provide incentives, rewards, or other compensation to users for engaging with" YouTube. III.F.3.b: "must not require a user to subscribe to a channel or like a video to continue watching". — [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- SweepWidget treats YouTube subscribe as manual (no API verification). — [SweepWidget docs](https://sweepwidget.com/docs/entry-method-verification-api-vs-manual)

**X / Snapchat**
- X: SweepWidget says "X/Twitter entries are not API-verified" (username taken on trust). — [SweepWidget docs](https://sweepwidget.com/docs/entry-method-verification-api-vs-manual)
- Snapchat: no source found for a follow-verification API. SweepWidget offers Snapchat entries, but its verification doc does not cover them. — [SweepWidget Snapchat](https://sweepwidget.com/examples/snapchat)

**App stores**
- Apple guideline 3.2.2 (as quoted in 2019) bars apps from requiring rating, reviewing, watching videos or similar actions to unlock functionality or receive compensation. Rewarding social posts was tolerated after 2014. Apple's current text was not fetched. — [Gummicube](https://www.gummicube.com/blog/dont-watch-to-win-apple-enforces-unacceptable-behavior-guidelines); [TechCrunch 2014](https://techcrunch.com/2014/06/24/app-store-policy-of-rejecting-apps-with-rewarded-video-social-sharing-gets-rolled-back-with-a-few-caveats)

### Inferences
- YouTube is technically verifiable but forbidden. Asking for `youtube.readonly` just to verify a subscription would also trigger Google OAuth sensitive-scope verification (an inference from Google's OAuth scope classification, not fetched here) and would breach III.F.3.c. So it is not a viable path.
- For Instagram, TikTok, Facebook, X and Snapchat, "verification" in the market (Gleam, SweepWidget) means *click-through tracking + self-declared username + optional manual audit*, not true verification.
- Meta's policy history (like-gating ban, "don't incentivize other actions") together with the YouTube policy suggests that "follow → reward" carries policy risk mainly if it is done *through* the platform APIs or apps. A merchant running an honor-based in-store promo without platform APIs is a lower-profile but still grey area (Meta's spam standard on engagement-gating).

### Gaps
- `user_likes` permission details (App Review requirement, allowed use): the reference page was truncated. Historically it needs App Review and only returns the logged-in user's own likes. Not verified for 2026.
- Meta's current Developer Policies text on incentives was not fetched directly (only secondary quotes).
- Instagram follower/"follow" webhooks: no such webhook field was found in the fetched docs. Absence was not explicitly confirmed by Meta.
- Snapchat Login Kit capabilities were not researched.
- The Woobox help center was not researched.

## Q4. What a React Native / Expo app can observe, and workarounds

### Takeaway
After opening a deep link (`instagram://user?username=…`, `fb://page/…`, TikTok/YouTube universal links, the Google writereview URL), the app can only know that it launched the link (`Linking.openURL` resolved) and when it came back to the foreground (AppState). The verifiable signal is "clicked + spent N seconds away", which is how Gleam-style "visit profile" actions work. Everything else is honor-based or needs a human or AI review.

### Cited Findings
- Gleam: users "cannot complete the action until they visit the TikTok profile". Gleam can confirm the entrant opened the page but not that the follow happened, so organisers check manually. — [Gleam, TikTok actions](https://gleam.io/docs/actions/tiktok) (Gleam FAQ pages returned 403 and were not read directly)
- SweepWidget: Instagram, Facebook and X entries collect a username or name after the action, with manual verification. — [SweepWidget docs](https://sweepwidget.com/docs/entry-method-verification-api-vs-manual)

### Inferences
Workaround options and their weaknesses (analysis, not sourced):
- **Click + return timer (honor system):** zero cost and frictionless, but trivially gamed (open, come back, never follow or unfollow later). Fits a low-value reward like one spin.
- **Username entry:** lets the merchant spot-check manually on the Instagram/TikTok follower list (the follower list is visible in-app to the account owner). Burden falls on the merchant, and spoofing with someone else's username is possible.
- **Screenshot upload + merchant validation:** stronger, but screenshots are easy to fake or reuse and the merchant's workload grows with volume. Storing screenshots raises GDPR/Moroccan Law 09-08 personal-data concerns.
- **OCR / AI vision of the screenshot:** automates the check for "Following" button state plus the account handle. Still fakeable, costs a little per image, and has false negatives across UI languages and themes.
- **Staff confirmation at the counter (QR/PIN):** the customer shows their phone with "Following" or the posted review, and staff enter a PIN or scan a QR to unlock the spin. This is the most reliable cheap option and fits JitPlus's in-store model. But for Google reviews it is precisely the "on-premises solicitation + incentive" Google prohibits.
- **Follower-count delta:** Instagram `followers_count` for the merchant's own professional account (merchant OAuth) or TikTok `user.info.stats`. It can only show aggregate growth, not who followed, and cannot attribute a follow to a user.
- Recommendation direction for the report writer: treat social follow as a low-stakes honor/click-based action (optionally staff-confirmed). Do NOT tie rewards to Google reviews (clear Google policy violation, with risk to the merchant's profile). Offer the review link as a no-reward follow-up instead.

### Gaps
- Exact behaviour of Expo `Linking.canOpenURL` on iOS for `instagram://` and `tiktok://` schemes (they require `LSApplicationQueriesSchemes`) was not researched here.
- No benchmark data found on fraud rates for honor-based follow rewards.
