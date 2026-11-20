# Discovery, acquisition and search architecture

## Public release state (2026-11-20)

The public-deployment assignment supersedes the original global-noindex foundation setting. Exactly nine canonical indexable pages are generated: `/`, `/wheel/`, `/date-night/`, `/chemistry/`, `/secret-menu/`, `/recipes/`, `/about/`, `/privacy/`, `/terms/`. Feature pages contain substantive explanations and explicit planned/not-playable status, not empty placeholders or fabricated working products. `/play/`, APIs, invitations, accounts, private assessments/results and 404s remain noindex; private placeholders return 404/503 and cannot expose user data.

Each public page has a distinct initial-HTML title, description, canonical, robots, Open Graph title/description/type/url/site/image/type/dimensions/alt and X large-image metadata. Canonical origin is `https://cheapseggs.com`; public paths use trailing slashes, aliases and www redirect permanently. `sitemap.xml` contains only those nine canonical URLs and robots declares it. Browser, Facebook, X/Twitter and LinkedIn user agents must receive identical HTML. Automated metadata/PNG checks do not establish that any social platform rendered a live card.

The default plus five feature social cards are original SVG art rendered to PNG at 1200×630 with the retro burgundy/pink/champagne identity. Public assets need no R2 bucket. `scripts/generate-social.ts` and source SVGs support future variants; page/image mapping is in `src/content/public-pages.ts`. No explicit imagery, private result or invite token appears in a card URL. Only factual WebSite JSON-LD is published; no fake reviews/prices, Organization identity or SoftwareApplication rich-result claims for unimplemented games. Google's [software-app guidance](https://developers.google.com/search/docs/appearance/structured-data/software-app) is not a justification to mark a planned feature as functioning software.

### Google Search Console: verified and sitemap submitted

Existing authorized service-account access initially showed no CheapSeggs property. The Domain property **`sc-domain:cheapseggs.com`** was added (204), initially `siteUnverifiedUser`. The initial disabled-API/DNS-permission blockers were resolved through the existing authenticated owner browser: enabled Site Verification API in existing project `cflab-search-console` (`184307746744`), obtained Google's genuine DNS_TXT challenge, and added the apex TXT in the existing zone. No new billing plan or Google tracking script was enabled.

Google Site Verification returned 200 for the domain. Ownership was preserved for the existing service account and delegated to the intended human owner using Google's [documented owner update](https://developers.google.com/site-verification/v1/webResource/update). Search Console readback returned **`siteOwner`**. Do not delete the Google verification TXT while ownership is needed; record ID `069ec9713a304dc77be29fa1fdd0a798`. Verification token/private key values are not repository configuration.

The [documented sitemap submit API](https://developers.google.com/webmaster-tools/v1/sitemaps/submit) returned **204** for `https://cheapseggs.com/sitemap.xml` on 2026-11-20 at 15:06 UTC. Initial readback was pending with zero warnings/errors. The intended human owner then completed the auto-verified property entry; its live Search Console sitemap screen reported **Success, 9 discovered pages**. The overview still reports processing. Sitemap success is not a claim that all pages are indexed, ranked or receiving impressions.

CFLab's GSC collector has a reviewed property allowlist; registering the first-party site does **not** widen it. No other repository/collector/scheduler was changed. Add a reviewed CheapSeggs mapping only in a separately scoped CFLab change now that property permission exists, following its own CI/release rules. First-party pageviews and Google Search Console data remain distinct. The [launch report](LAUNCH_REPORT.md) records actual live sitemap and submission checks.

## Practical acquisition strategy

Lead with useful, original date-night entertainment and an immediately understandable wheel. A distinctive “Wheel of Misfortune” clip without intimate result content can be shareable; brand recognition is the wedge, not thousands of thin keyword pages. Organic/editorial and permission-based creator collaborations are initial tests, not assumed free scalable acquisition. Never collect intimate selections for targeting or retargeting.

| Search intent                                   | Useful page / product connection                                                         | Constraint                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Couples games / partner compatibility games     | Original guide to choosing a playful two-person game; explain private matching and modes | No compatibility score or claims to diagnose relationships                |
| Date-night ideas / romantic activity generators | Real low-prep ideas with time/supplies/accessibility alternatives; safe generator sample | Content must be original, not mass AI listicles                           |
| Couples questions / romantic challenges         | A few thoughtful public prompts, optional seven-day concept later                        | No guilt/streak pressure or signup required for every example             |
| Sex dice alternatives / fantasy exploration     | Honest feature explanation for adult discovery; boundary-first mode guide                | Adult intent may trigger SafeSearch or ad restrictions                    |
| Adult party games                               | Editorial distinction between partner intimacy games and party entertainment             | Lower initial fit; no stranger-matching or group activity feature implied |
| Seasonal romantic nights / hotel editions       | Specific themed editorial page and reviewed pack preview                                 | Avoid thin duplicates or collecting travel/room details                   |

No search-volume, ranking or CAC figures are claimed; none were purchased or measured. Validate via a handful of strong public pages and later consented aggregate Search Console data. Search visibility is uncertain for an adult brand.

## Policy evidence

[Google Ads sexual-content policy](https://support.google.com/adspolicy/answer/6023699?hl=en-9) includes adult sexual entertainment/games among restricted examples; [explicit-content rules](https://support.google.com/adspolicy/answer/16490050) can prohibit graphic arousal-focused material. Ad eligibility depends on destinations and location, not simply tasteful ad creative. Do not base the financial plan on search/display/social ad approval. Other platforms and affiliate networks need current review before any spend; no blanket claim that they accept adult-adjacent games.

[Google’s explicit-content guidance](https://developers.google.com/search/docs/specialty/explicit/guidelines) describes adult metadata and classification; [its troubleshooting guidance](https://developers.google.com/search/docs/specialty/explicit/troubleshooting) notes subtly suggestive content can be filtered and recommends separating substantial explicit material from non-explicit pages. Honest separation by content/audience is sensible; cloaking or showing sanitized pages only to reviewers/bots is not. Public tasteful branding still does not guarantee search or payment eligibility.

## Information architecture

Possible later editorial expansion (the current nine routes are listed above):

```text
/
/couples-games/
/wheel-of-misfortune/
/date-night-machine/
/secret-menu/              feature explanation only, no matches
/cookbook/                 curated public safe previews
/ideas/date-night-at-home/
/ideas/low-energy-date-night/
/ideas/anniversary-games/
/privacy/  /terms/  /consent/  /adult-access/  /help/
```

Each public feature page answers a different question with original examples, mode/age/consent explanation and a shareable game entry point. Internal navigation connects related content and includes an obvious guest CTA. Build-time HTML works without JavaScript, with canonical URLs, unique titles/descriptions, sitemap and correct status codes. Structured data only for accurately supported content; do not invent ratings, prices or FAQ rich-result promises. Explicit pages, if any, get appropriate adult metadata and applicable access restrictions. Counsel and search review decide whether mature content warrants a separate subdomain; this also changes session/RP/CORS design and must be an ADR, not a casual host split.

Private routes under `/play/`, future `/account/`, invite callbacks and all private APIs: noindex, no-store where sensitive, authentication/authorization on records. Private URLs never enter sitemaps, Open Graph, analytics query strings or canonical tags. Robots is not a security control. Authentication prevents crawlable data disclosure; noindex merely communicates indexing preference.

The original local scaffold was globally non-indexable. The public release replaces that setting only for the nine reviewed explanation/policy pages; games are still not represented as implemented.

## Sharing and distribution experiments

Public social metadata uses brand/feature title and a tasteful neon-sign/wheel illustration. Original 1200×630 PNG social artwork and editable SVG sources are included in this release. Never place a private result, heat/category preference, partner identity, invite token or recipe contents in a public preview URL. User-triggered sharing should default to the generic entry page; sharing a specific result requires a separate explicit disclosure flow and is deferred.

Test creator partnerships with adult audiences and a transparent product brief, newsletter/editorial outreach only with instruction and permission, a few seasonal original recipe articles, and guest-to-partner invitations. Do not send any outreach during this assignment. Public campaign codes may be a small allowlisted enum, not sexual-interest tags. Disable referrer leakage on invite/private pages.

Affiliate links, when justified, open only after the user chooses a supply/resource page. Disclose compensation before the link, recommend based on editorial suitability, pass no private user/session IDs, avoid affiliate pixels, review merchant network policies and actual margin. Hotels/retreats, printables and embedded wheels are later distribution tests; no unsolicited partnership promises or white-label sales effort now.

Tradeoff: explicit branding improves recognition among interested adults and can reduce mainstream sharing/search/payment acceptance. Keep the cheeky identity and truthful erotic purpose, make public previews broadly tasteful, and accept narrower channels. A serious privacy product cannot fund itself by quietly selling the interests it asks users to trust it with.

## Planned standalone Chemistry Check funnel (2026-11-20)

[Chemistry Check](CHEMISTRY_CHECK.md) has a public `/chemistry/` explanation and could support and original editorial pages about expectations before a first date, accepting differences and discussing relationship goals. This is a distinct intent from established-couple games and could introduce the brand earlier. No search-volume, viral-growth or ad-eligibility claim is established. Non-sensitive example questions and 25/50/100 depth explanations may be tested alongside the Wheel's research; launch the actual assessment after the first playable Wheel and its independent auth/privacy gate.

Default sharing sends only a generic public entry link. Assessment invitations use expiring noindex/no-store private URLs with no score, question choices or counterpart identity in preview metadata. Results never become public “compatibility badges” or indexed pair pages. A later invitation to explore the Wheel or form a couple is a separate voluntary action, never selected from sexual scores, mismatches or hidden dealbreakers. The product does not search for strangers or arrange meetings; communicate its actual scope in public copy and underwriting rather than claiming a new policy exemption. The initial planning change added no executable assessment; this release adds only its public explanation page.
