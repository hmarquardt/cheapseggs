# Operating cost and unit economics

USD estimates per month; pricing checked **2026-11-19**. The original foundation enabled no resources; the production update below records actual provisioning. Scenarios are workload models, not Cloudflare quotes or measured production bills. All account-level allowances below assume CheapSeggs alone consumes them; shared Cloudflare accounts can change the result.

## Public release inventory update (2026-11-20)

One Worker and a small production D1 now exist on the user's **already configured Workers Standard account**. No new subscription, email/AI provider, R2 bucket, Turnstile service, paid backup job or third-party purchase was enabled. The account's existing $5 minimum/allowances are shared with other projects; they cannot be attributed entirely to CheapSeggs or assumed unused. Actual incremental cost depends on the account-wide bill. D1 readback after seeding was about 389 KB, three public examples and zero users. CFLab remains existing shared infrastructure; Google Site Verification/Search Console required no new billing plan.

Worker-first routing intentionally invokes the Worker for public pages and asset responses so security/revision headers are consistent. Ordinary static handling's free request rule must **not** be applied to those invocations: count them in billed Worker request/CPU totals. The scenarios below retain their original hypothetical 40 requests/MAU; use that as a total request budget including asset invocations, or add measured asset traffic before relying on it. There is no measured MAU/unit cost yet. The public preview sends no email and uses no paid authentication or payment service. See [Deployment](DEPLOYMENT.md) for resource IDs and [launch evidence](LAUNCH_REPORT.md).

## Published rates used

| Service          | Current documented baseline                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers Standard | $5/month minimum, 10m requests and 30m CPU-ms included; $0.30/m extra requests, $0.02/m extra CPU-ms; static asset requests free under ordinary static handling |
| D1 paid          | 25bn rows read/month, 50m writes/month, 5 GB included; $0.001/m extra reads, $1/m extra writes, $0.75/GB-month extra storage                                    |
| R2 Standard      | 10 GB, 1m Class A, 10m Class B included; $0.015/GB-month, $4.50/m A, $0.36/m B above allowance, no egress fee; billable units rounded up                        |
| Email benchmark  | Resend Free 3k/month and 100/day; Pro $20/50k or $35/100k, overage $0.90/1k                                                                                     |
| Auth             | Self-hosted Better Auth: no managed per-user service charge assumed; Worker/D1/email costs included; maintenance labor remains                                  |
| Turnstile        | Free tier available; no other optional Cloudflare products enabled                                                                                              |

Primary pricing sources: [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/), [Resend transactional prices](https://resend.com/pricing.md), [Turnstile plans](https://developers.cloudflare.com/turnstile/plans/). Resend is a pricing benchmark, **not a selected/approved delivery provider**; verify its [AUP](https://resend.com/legal/acceptable-use) and actual adult-business transactional-use suitability. Even a neutral auth email requires accurate business disclosure. No email account or delivery is integrated.

## Workload assumptions

Per MAU: 4 sessions, 10 dynamic Worker requests/session = 40 requests, average 8 CPU-ms/request; 1,000 D1 rows read and 40 written/month **including index-write allowance**, 30 KB retained database footprint under 90-day private TTL; 1.5 transactional emails/month (passkeys reduce this, abuse increases it). Static asset delivery is separate, public media 20 object reads/MAU/month. No video, user uploads or intimate photos. R2 storage 2/5/20 GB at 1k/10k/100k MAU with at most 20k writes/month; reads within free quota. MAU counts individuals, not couples; payer counts owners, with one order/payer/month in the commercial scenario.

CPU is active execution, not waiting for D1/email. Crypto/auth workloads can exceed this average; measure after integration. D1 billing counts scanned rows, so missing indexes or matching loops issuing one query per activity can destroy assumptions. Free daily quotas/burst limits can fail even when monthly averages look small; recommend paid Workers for a public pilot **only after approval**.

## Monthly service estimates

| Item                            | Development / low traffic |            1,000 MAU |  10,000 MAU |                100,000 MAU |
| ------------------------------- | ------------------------: | -------------------: | ----------: | -------------------------: |
| Dynamic requests                |          Local / up to 4k |                  40k |        400k |                         4m |
| CPU-ms                          |         Local / up to 32k |                0.32m |        3.2m |                        32m |
| D1 reads / writes               |                     Local |             1m / 40k |  10m / 400k |                  100m / 4m |
| D1 storage                      |                     Local |              0.03 GB |      0.3 GB |                       3 GB |
| Workers                         |  $0 local/free hypothesis |                   $5 |          $5 |                      $5.04 |
| D1 incremental                  |                        $0 |                   $0 |          $0 |                         $0 |
| R2 incremental                  |           $0, not enabled |                   $0 |          $0 |                      $0.15 |
| Emails                          |                      ≤150 |                1,500 |      15,000 |                    150,000 |
| Email benchmark                 |                        $0 | $0 if daily cap fits |         $20 |         $80 (35 + 50×0.90) |
| Auth managed fee                |                        $0 |                   $0 |          $0 |                         $0 |
| AI / extra infrastructure       |                        $0 |                   $0 |          $0 |                         $0 |
| Aggregate analytics incremental |                        $0 |                   $0 |          $0 | $0 within modeled D1 usage |
| **Service total**               |                    **$0** |               **$5** |     **$25** |                 **$85.19** |
| **Service cost / MAU**          |                       n/a |           **$0.005** | **$0.0025** |              **$0.000852** |

The 100k CPU overage is `(32m−30m)×$0.02/m=$0.04`; R2 `(20−10)×$0.015=$0.15`. R2 operation overages are zero here; future overages must respect rounding. Auth, analytics and AI rows do not imply implemented integrations. Age-assurance vendor charges, domain renewal, taxes, legal/security review, payment costs, support, content and founder labor are excluded from the service total and addressed below.

Growth limits: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) cap a paid database at 10 GB, free at 500 MB. 30 KB/MAU is a retention assumption, not a size guarantee. At 10× footprint, 100k MAU means 30 GB and exceeds one paid database: reduce retention/representation or redesign, not just pay $/GB. Single-database query contention/latency can become the scaling issue before request fees. Alert only on useful budget/error thresholds after launch; no noisy scheduled foundation jobs.

## Commercial model (conservative assumptions)

Example order price **$7.99** blended one-time bundle, 3% of MAU purchasing one order each month. This is not a forecast. Assume processing **15% + $0.30**, refunds **3% of gross**, disputes **0.5% of orders** with lost gross and **$25** fee/dispute. Processor percent/fixed fees are not recovered on refunds. Disputes and refunds treated as separate losses for conservative planning. Annual registration budget **$1,950 / 12 = $162.50/month**, based on CCBill’s published applicable high-risk fee example; exact MCC quote could differ. Model **10% six-month reserve**, a cash hold rather than expense.

Support assumption: 1% of MAU contact support/month, 8 minutes/ticket, $30/hour replacement cost = **$0.04/MAU**. Content production budget **$500/month**, excluding founder engineering, legal/age-assurance and customer acquisition. No free founder support labor hidden in gross margin.

Per order contribution before hosting/support/fixed editorial fees:

`7.99 × (1 − .15 − .03 − .005) − .30 − 25×.005 = $6.08685`, or **76.2% of gross**. Reserve temporarily withholds another $0.799/order; not deducted from accounting margin, but needed for cash planning.

| Monthly metric                                                     |    1,000 MAU |  10,000 MAU |    100,000 MAU |
| ------------------------------------------------------------------ | -----------: | ----------: | -------------: |
| Paying owners / orders                                             |           30 |         300 |          3,000 |
| Gross revenue                                                      |      $239.70 |      $2,397 |        $23,970 |
| Processing                                                         |       $44.96 |     $449.55 |      $4,495.50 |
| Refund gross allowance                                             |        $7.19 |      $71.91 |        $719.10 |
| Dispute gross + fees                                               |        $4.95 |      $49.49 |        $494.85 |
| Contribution after payment losses                                  |      $182.61 |   $1,826.06 |     $18,260.55 |
| Services                                                           |           $5 |         $25 |         $85.19 |
| Support                                                            |          $40 |        $400 |         $4,000 |
| Registration + editorial                                           |      $662.50 |     $662.50 |        $662.50 |
| **Surplus before engineering/legal/tax/acquisition/age assurance** | **−$524.89** | **$738.56** | **$13,512.86** |
| Service cost / paying owner                                        |        $0.17 |       $0.08 |          $0.03 |
| Services+support+fixed/editorial per paying owner                  |       $23.58 |       $3.63 |          $1.58 |
| 10% cash reserve withheld that month                               |       $23.97 |     $239.70 |         $2,397 |

At constant gross for 6 months, a 10% rolling reserve ties up up to roughly **60% of one month’s gross** ($14,382 at 100k scenario), in addition to payout delays and dispute liquidity. Do not fund operations from receivables assumed instantly available. Provider contracts govern the actual reserve, payout and termination holdbacks.

## Price/model comparison and break-even

Same loss assumptions give contribution `price×.815−.425`:

| Offer hypothesis         |        Contribution/order before other costs | Implication                                                                                        |
| ------------------------ | -------------------------------------------: | -------------------------------------------------------------------------------------------------- |
| $2.99 wheel pack         |                                $2.01 / 67.3% | Fixed transaction/dispute costs and support make micro-packs fragile                               |
| $4.99 collection         |                                $3.64 / 73.0% | Viable test but needs more orders to cover underwriting                                            |
| $9.99 bundle             |                                $7.72 / 77.2% | Better starting margin and customer value if content warrants it                                   |
| $4.99/month subscription | $3.64/month before recurring content/support | More lifetime revenue only with retention and ongoing value; adds cancellation/compliance workload |

At 10k MAU, $25 services + $400 support + $662.50 fixed/editorial require **179 orders/month** at $7.99, or **1.79% MAU monthly purchase conversion**. At 3% conversion and $0.04 support/MAU, approximate break-even scale is `(662.50+25) / (.03×6.08685−.04) ≈ 4,821 MAU` within the same service/email tier. A $2,000/month founder engineering allowance raises 10k break-even to about 508 orders (5.08%). These figures exclude age-assurance costs and acquisition spend.

One-time purchase rate cannot remain 3% forever without new customers or desired new packs. If each customer buys once and growth stalls, revenue falls even if MAU holds. Model library ownership and returning free users separately. At 10k MAU, monthly conversion 1%/3%/5% yields approximately **−$479 / +$739 / +$1,956** before excluded costs. Use real cohort repurchase data rather than multiplying first-month conversion indefinitely.

Subscription sensitivity at $4.99: with hypothetical 10% monthly churn, simple contribution lifetime `3.64185/.10=$36.42` before support/content/discounting; 25% churn gives **$14.57**. This arithmetic is not evidence of willingness to subscribe. One $7.99 buyer produces $6.09 contribution before servicing; a tentative paid acquisition ceiling under $2 leaves little room for friction. Organic distribution still costs editorial time.

## Stress cases and omitted cost gates

- 10× CPU (80ms/request) at 100k: 320m CPU-ms, $5.80 overage, still modest; scans/writes/storage and privacy complexity are more material.
- 10× email volume: 1.5m emails/month; benchmark published Scale tier $825/month, not $80. Abuse prevention and passkeys directly affect this.
- Support 3% at 15 minutes/$30h is $0.225/MAU: **$22,500/month at 100k**, exceeding modeled contribution before other costs. Good UX, clear billing and minimal account friction matter economically.
- Age checks: **unquoted**; sensitivity 0.2 checks/MAU/month × hypothetical $0.50 = $0.10/MAU, or **$10,000/month at 100k**. Not a vendor price. Higher re-verification or a paid minimum can invalidate the business case. Vendor selection/legal classification is a prerequisite, not a footnote.
- Budget separate upfront legal/privacy/security/content review (planning range $2k–$10k+; no quote obtained), merchant registration/reserves, domain renewal and incident contingency. No external KMS assumed; choosing one needs a new price model. AI is $0 because it is deferred; do not silently enable per-generation cost later.

Recommend an uncharged discovery/interest pilot first, then an approved one-time **$4.99 collection vs $9.99 bundle** experiment. Subscription waits for demonstrated recurring desire and predictable content cadence. Written underwriting and age-assurance economics can veto paid launch even if hosting is almost free.

## Chemistry Check planning extension (2026-11-20)

The estimates above remain the original wheel/recipe workload, not a measured capacity or revenue forecast for [Chemistry Check](CHEMISTRY_CHECK.md). It uses the same Worker/D1 deployment; do not add a new paid service solely for assessments. Bounded 25/50/100-item comparisons are computationally small in design, but actual encryption, auth, draft-save, anti-probing and report-read workloads need measurement. Two independent sign-ins, verification/resends and possible age checks create more friction/cost than one anonymous wheel visitor. Model **accepted assessments**, two participant accounts, released reports and paying sponsors separately from individual MAU.

Illustrative assessment sensitivity, not vendor pricing or a new forecast: at 1,000 accepted assessments/month and 5% paid reports, $4.99/$9.99 produce 50 orders, $249.50/$499.50 gross and about **$182/$386** contribution using the existing hypothetical payment losses, before content, support, services, registration and age assurance. If 5% of accepted assessments each need one 8-minute support interaction at $30/hour, support alone is **$200**. If a release needs two new age checks, the existing illustrative $0.50/check assumption adds **$1 per assessment** requiring those checks; actual assurance requirements, reused valid assertions and quoted rates decide applicability. This can overwhelm inexpensive reports.

Do not assume paid-depth conversion, two-person completion or annual recurring revenue from competitor prices. Validate free invitations→independent submissions→mutual release first, then willingness to sponsor a deeper one-time assessment. Conditional 50/100-depth experiments and unused-credit/refund handling are in [Monetization](MONETIZATION.md#chemistry-check-standalone-acquisition-and-assessment-product). No extra infrastructure, email, age vendor or payment service was enabled for this planning update.
