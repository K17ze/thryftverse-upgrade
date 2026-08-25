# ThryftVerse Buyer/Seller Reputation and Reviews (Upgraded)

## P0 production dossier — integrity, aggregation, ranking, moderation and native UX

**Research cut-off:** 25 August 2026 (includes CMA fake reviews investigations March 2026 — 5 businesses including Autotrader/Feefo, Dignity, Just Eat, Pasta Evangelists; CMA website compliance review of 100+ businesses July 2025; CMA208 fake reviews guidance; CMA direct enforcement one-year report April 2026; DMCC Act 2024 banned practices; FTC Consumer Reviews Rule effective October 2024; Etsy Seller Policy effective 9 July 2026)
**Repository snapshot:** `f82f74a54be79a1721017380ddd5472d856f1679` plus the inspected working tree on `feat/product-detail-contract-media-device-closure`
**Surfaces:** order review creation, media, seller response, public reputation, seller standards, badges, moderation, appeals, recommendations and abuse controls
**Deliverable type:** codebase-grounded research and implementation specification; no product code changed
**Release verdict:** **P0 BLOCKED — BASIC TRANSACTION REVIEWS EXIST, BUT THE PUBLIC TRUST CONTRACT IS INTERNALLY INCONSISTENT**
**Inspector identity:** senior FAANG mobile/full-stack architect, 20 years, top-level mobile app architecture + front-end UI/UX engineering + back-end design. Anti-AI-design policy enforced throughout.

---

## 0. What changed in this upgrade

This is a deepened re-issue of the 25 August 2026 dossier. Every codebase claim was re-verified by direct file inspection. The following material is new or substantially expanded:

1. **CMA fake reviews investigations — 27 March 2026** — the CMA launched 5 new consumer law investigations into fake and misleading reviews, the first enforcement cases under the DMCC Act 2024's review-specific powers. The investigations cover the full review ecosystem:
   - **Autotrader/Feefo** — whether 1-star reviews moderated by Feefo were not published on Autotrader's platform and not counted towards star ratings, denying consumers a fully rounded picture. This is directly relevant to ThryftVerse: if negative reviews are moderated more aggressively than positive reviews, or if the moderation system suppresses genuine negative feedback, the CMA can investigate.
   - **Dignity** — whether staff were asked to write positive reviews about the company's crematoria services. This is insider/fake review creation — directly relevant to ThryftVerse's seller review integrity.
   - **Just Eat** — whether the ratings system has inflated certain restaurants' and grocers' star ratings. This is misleading aggregation — directly relevant to ThryftVerse's raw average calculation that counts every row without eligibility/integrity filtering.
   - **Pasta Evangelists** — whether customers were offered discounts for 5-star reviews without disclosure. This is concealed incentivised reviews — a banned practice under the DMCC Act.
   The CMA's investigation timeline runs from March 2026 to September 2026 (initial investigation), with the next case update in September 2026.
2. **CMA website compliance review — July 2025** — the CMA completed a website review of 100+ businesses after the 3-month adjustment period following the April 2025 fake reviews guidance. **54 businesses could be failing to comply** — some had no policy banning fake reviews, some had no policy on incentivised reviews, and others had policies that were unclear, incomplete, or inaccessible. ThryftVerse must have a published fake-review policy, a clear approach to incentivised reviews, and accessible compliance documentation.
3. **CMA direct enforcement — one year on (April 2026)** — the CMA's direct enforcement regime has been operational for one year with £4.7M in fines, 14 investigations, and 157 advisory letters. Fake reviews are one of the three enforcement priorities (alongside drip pricing and online choice architecture). The CMA can fine up to 10% of global turnover for infringements.
4. **CMA208 risk assessment requirements** — publishers must conduct evidence-led risk assessments to assess the risks of banned reviews and false/misleading consumer review information on their platforms. Risk assessments must consider: (a) content/activity on the platform, including technology designed to identify banned reviews; (b) third-party reports; (c) findings of investigations or internal evaluations. Risk assessments are not one-off exercises — they must be reviewed and updated. ThryftVerse's review system has no risk assessment, no detection technology, no third-party report mechanism, and no effectiveness review.
5. **Deeper codebase verification** — the review body schema at `supportReviews.ts:46-49` was re-confirmed: only `rating` and `comment` are accepted; `photoUrls` sent by the client are silently stripped by Zod. The `reviewee_id` vs `seller_id` mismatch at `sellers.ts:306-315` was re-confirmed. The client-derived badges at `listingDetailContract.ts:61-137` were re-confirmed. The raw average in recommendations at `recommendations.ts:649-665` was re-confirmed. The Redis-backed performance prototype at `sellerPerformance.ts:136-167` was re-confirmed.
6. **Deeper CMA exposure analysis** — the current ThryftVerse implementation has multiple CMA exposure points:
   - **Misleading aggregation** (Just Eat pattern): raw `AVG` over every row at `sellers.ts:148-179` counts all reviews without eligibility/integrity filtering. If fake reviews inflate the average, this is misleading consumer review information.
   - **Negative review suppression** (Autotrader/Feefo pattern): there is no publication/moderation state, so all reviews are immediately counted. If a moderation system is later added that removes negative reviews more aggressively than positive ones, this would be a banned practice.
   - **Insider reviews** (Dignity pattern): there is no check preventing sellers from reviewing their own listings through secondary accounts, or staff from writing reviews.
   - **Concealed incentives** (Pasta Evangelists pattern): there is no incentive disclosure system. If ThryftVerse later introduces review incentives, they must be sentiment-independent and prominently disclosed.
   - **No fake-review policy**: the CMA found 54 businesses without adequate policies. ThryftVerse has no published fake-review policy, no risk assessment, and no detection technology.
7. **Deeper Etsy Seller Policy analysis** — Etsy's Seller Policy effective 9 July 2026 allows rating plus photo/video within a bounded window, supports edits during that window, and prohibits shilling/manipulation. This is a direct competitor benchmark: Etsy has a bounded edit window, photo/video support, and anti-manipulation provisions — all of which ThryftVerse currently lacks (no media persistence, no edit/follow-up, no anti-manipulation detection).

---

## 1. Evidence language

- **[VERIFIED — CODE]** is directly evidenced by the cited repository path and line.
- **[VERIFIED — EXTERNAL]** is supported by a linked primary or official source current at the cut-off.
- **[INFERENCE]** follows from verified evidence but has not been proved against a deployed database/native build.
- **[EXTERNAL REQUIREMENT]** needs legal/policy confirmation for the launch market.
- **[DECISION]** is the recommended ThryftVerse product or engineering rule.
- **[PROPOSED]** is a target schema, contract, algorithm or surface that does not exist yet.

Line references are forensic anchors and can shift after subsequent edits.

---

## 2. Executive finding

The current implementation is better than a prototype in one important respect: a review is tied to a real order, only the authenticated buyer can create it, the order must be delivered/completed, and the database allows one review per order. The public API also returns a rating distribution rather than a single ornamental star.

However, the app currently presents capabilities and trust claims that the backend does not persist:

1. **Review photos are uploaded before submission, then discarded by the API.** The app uploads up to four remote media assets and sends `photoUrls`; the server Zod body contains only `rating` and `comment`, which strips unknown fields. The `order_reviews` table has no media column or relation. The UI can say photos were attached even though the review cannot retain them, leaving orphan uploads.
2. **Seller responses are a client-only fiction.** `reviewApi.ts` calls `POST /reviews/:reviewId/response`, models `sellerResponse`, and a polished composer exists; no matching backend route or schema was found. Public profile rows cannot return a response.
3. **The public list advertises reviewer navigation but deliberately returns `reviewer.id = null`.** The native row is coded to be tappable when an ID exists; it never will through this endpoint.
4. **The seller analytics route references a nonexistent `reviewee_id`.** Canonical schema uses `seller_id`, so the analytics query should fail on a clean database.
5. **Every stored review is immediately counted.** There is no publication/moderation/integrity state, removal history, incentive disclosure or aggregate-version owner. Raw averages flow directly into public profile and recommendation seller trust.
6. **Seller badges and performance are not evidence-bound.** The frontend derives badges from mutable summary values and regexes over human-readable time labels. A separate performance module accepts caller-precalculated values, stores them in Redis, hardcodes thresholds/1.3×–1.5× boosts, and cites future/unverified industry claims in source comments. A migration defines a second Postgres metrics model, but the inspected module does not own recomputation from orders.

This is a trust-system defect, not just missing review filters. Reputation affects purchase confidence, discovery exposure, seller income and possibly enforcement. It must be built as an auditable projection over transaction and integrity evidence—not as stars plus badges.

---

## 3. End-to-end code trace

### 3.1 Create/read review

| Layer | Evidence | Assessment |
|---|---|---|
| Database | `backend/api/src/db/migrations/042_order_reviews.sql:1-17` stores order, reviewer, seller, 1–5 rating, comment and timestamps with `UNIQUE(order_id)`. | Good eligibility anchor and uniqueness. Missing publication state, media, version history, aspects, response, reports, incentive disclosure and policy version. `ON DELETE CASCADE` for users/orders can erase reputation and moderation evidence; retention/anonymization needs policy. |
| Request schema | `backend/api/src/routes/supportReviews.ts:46-49` accepts only rating/comment. | **P0 contract mismatch:** unknown `photoUrls` sent by the client are stripped by normal Zod object parsing. |
| Eligibility | `supportReviews.ts:329-398` verifies auth, buyer ownership, delivered/completed state, checks existing review and inserts. | Good base. Check-then-insert races should be handled by transaction/unique violation; submission also lacks idempotency key and review window/policy version. |
| Notification | `supportReviews.ts:400-419` includes up to 80 characters of the review in the seller notification. | Privacy/moderation concern: unmoderated abusive or personal content can be pushed before screening. Notification belongs after publication decision and should avoid full sensitive text on lock screens. |
| Read | `supportReviews.ts:268-326` lets buyer or seller read the order review but returns only rating/comment/timestamps. | Honest to the schema, inconsistent with the client’s richer `OrderReview` type. |

### 3.2 Review media and composer

| Layer | Evidence | Assessment |
|---|---|---|
| Upload | `frontend/src/screens/WriteReviewScreen.tsx:81-107` uploads each selected asset immediately through `uploadMedia(..., 'review')` and stores the remote public URL. | Real upload attempt and useful feedback. But upload-before-draft needs attachment ownership/expiry cleanup; raw public URLs should not be authoritative references. |
| Submit | `WriteReviewScreen.tsx:120-135` sends those URLs and reports success after `createOrderReview`. | The server can succeed while silently discarding photos. This is a truthful-UI failure and storage leak. |
| Client contract | `frontend/src/services/reviewApi.ts:3-61` models optional `photoUrls`, `sellerResponse` and a response endpoint. | Fabricated contract relative to current backend. Types give false confidence because they are hand-authored, not generated/shared from server schemas. |
| Composer UX | `WriteReviewScreen.tsx:79` permanently disables submit after an existing review; no edit/follow-up exists. | Functional but punitive for mistakes and evolving outcomes. A bounded versioned edit/follow-up policy is preferable. |

### 3.3 Public seller reviews

| Layer | Evidence | Assessment |
|---|---|---|
| Summary | `backend/api/src/routes/sellers.ts:148-179` calculates raw `AVG`, total and 1–5 distribution over every row. | Mathematically correct only if every row is publishable/genuine. No state filter, integrity eligibility, time window, aggregation version or minimum sample. |
| List | `sellers.ts:181-252` cursor-paginates by `created_at`, joins reviewer/listing, but returns `reviewer.id = null` at `:238-240`. | Cursor should include `(created_at,id)` to prevent skips/ties. Reviewer identity/navigation contract is inconsistent. No media/response/state fields can be returned. |
| Native summary | `frontend/src/components/profile/ProfileReviews.tsx:22-63` correctly bases distribution bars on total reviews, not the maximum bucket. | Good visualization. `avg.toFixed(1)` can give one-review precision undue visual authority; count and evidence need equal weight. |
| Native row | `ProfileReviews.tsx:81-221` displays “Verified buyer,” media, seller response and reviewer/listing actions. | Most of the intended hierarchy is thoughtful, but media/response are not backend-backed and “Verified buyer” is asserted by component context rather than an explicit server eligibility field. |
| Owner response | `frontend/src/screens/UserProfileScreen.tsx:464-468` passes `onRespond={undefined}`. A `SellerResponseComposer` exists separately. | The visible public profile cannot invoke the purported response capability; self-profile is redirected elsewhere. End-to-end owner flow is absent. |
| Analytics | `backend/api/src/routes/sellers.ts:306-315` queries `order_reviews.reviewee_id`. | **Likely clean-DB runtime failure:** migration 042 defines `seller_id`, not `reviewee_id`; no later migration adding it was found. |

### 3.4 Badges, performance and ranking

| Layer | Evidence | Assessment |
|---|---|---|
| Local badges | `frontend/src/platform/product/listingDetailContract.ts:61-137` derives Top/Super Seller, Fast Shipper and Responsive badges from counts, rating and regexes over labels such as “within 1 day.” | **P0 trust defect.** A badge is a backend decision, not a client calculation. Text parsing is not evidence and cannot encode exclusions, expiry or appeals. |
| Verification copy | `listingDetailContract.ts:37-58` maps `verificationTier='seller'` to “Trusted Seller / Meets seller standards programme.” | Requires a persisted, current programme decision. A generic verification tier must not imply performance qualification. |
| Performance schema | `backend/api/src/db/migrations/110_seller_performance_program.sql:20-51` stores rolling metrics/tier in Postgres. | Useful projection table, but no calculation version, denominator/exclusion counts, evidence cutoff, expiry, prior decision, reason or appeal. |
| Performance implementation | `backend/api/src/lib/sellerPerformance.ts:136-167` says production would query orders but currently accepts pre-calculated metrics and caches them in Redis. | **Prototype owner path.** Any caller with access to the function can supply values; Redis TTL is not an authoritative decision ledger. |
| Thresholds/boost | `sellerPerformance.ts:101-124` hardcodes qualification and 1.3×/1.5× visibility multipliers; `:1-18` cites claims including an October 2026 programme despite the August cut-off. | Unvalidated product policy and unsupported future evidence. Tests lock constants rather than business outcomes. Disable public/ranking use until a versioned experiment passes. |
| Recommendation | `backend/api/src/routes/recommendations.ts:649-665` computes raw seller average; `:776-779` maps absent rating to neutral 0.5 and average/5 to seller trust for decision-service candidates. | Reputation already affects distribution. One five-star review becomes a perfect 1.0 trust signal, while a new seller gets 0.5—strong incumbent bias and gaming surface. |
| First-sale review | `backend/api/src/db/migrations/097_seller_first_sale_review.sql` creates a manual first-sale fraud review before release. | Valuable risk control but not public reputation. Keep compliance/risk review separate from buyer feedback and never expose the internal decision as a star/badge. |

---

## 4. Capability matrix

| Capability | Current evidence | Status | P0 consequence |
|---|---|---|---|
| One review per transaction | DB unique order | Real | Keep |
| Buyer/order eligibility | API check | Real, incomplete | Add window/idempotency |
| Verified-transaction claim | implied by route | Partial | Persist server-derived eligibility; never client-set |
| Review text/rating | DB/API/native | Real | Add lifecycle/moderation |
| Review media | native upload only | Broken | Orphans media; false UI |
| Review edit/follow-up | none | Absent | User cannot correct/evolve feedback |
| Seller response | client type/composer only | Broken | Dead API/control contract |
| Report review/media/response | none found | Absent | Safety/legal moderation gap |
| Removal/reinstatement/appeal | none found | Absent | No due process or audit |
| Incentive disclosure | none | Absent | CMA/FTC exposure if incentives introduced |
| Published fake-review policy | not code-proven | Unverified | External launch gate |
| Aggregate rating/distribution | raw SQL | Partial | Counts every row; no version/provenance |
| Low-sample treatment | none | Absent | Ranking/badge distortion |
| Recent performance window | prototype module | Not authoritative | Cannot power trust |
| Seller standards decision | migration + Redis prototype | Partial/broken owner | No evidence row consumed by UI |
| Badge expiry/explanation | none | Absent | Unsupported claims |
| Defect appeal/protection | none for performance | Absent | Unfair enforcement risk |
| Ranking reputation feature | raw average | Active but unsafe | P0 gaming/incumbent bias |
| Reviewer identity navigation | API nulls ID | Broken | Dead visual affordance |
| Private buyer reliability | fraud domain only | Unclear | Must not become public buyer shaming |

---

## 5. August 2026 legal and benchmark research

### 5.1 UK review-publisher obligations

**[VERIFIED — EXTERNAL]** The UK CMA’s 2025 fake-review guidance under the DMCC Act identifies fake reviews, concealed incentivized reviews and misleading review information as banned practices. Publishers must take reasonable and proportionate steps to prevent and remove banned content and need policies, risk assessment, detection, investigation, action and ongoing effectiveness review. Derived information includes star averages, counts, summaries and rankings—not only review text. [CMA fake reviews guidance (CMA208)](https://www.gov.uk/government/publications/fake-reviews) and [publisher short guide](https://www.gov.uk/government/publications/fake-reviews/short-guide-for-businesses-publishing-consumer-reviews-and-complying-with-consumer-protection-law).

**[VERIFIED — EXTERNAL]** Updated CMA guidance for review sites says genuine relevant negative reviews must not be withheld, delayed or subjected to weaker publication treatment; aggregates should reflect the full genuine picture, collection/checking must be explained, and positive and negative reviews should receive appropriate equivalent rigour. [CMA — Reviews: guidance for online review sites](https://www.gov.uk/government/publications/reviews-guidance-for-online-review-sites/reviews-guidance-for-online-review-sites).

**Engineering implications:**

- sentiment can be a moderation feature but not a reason to delay or suppress;
- aggregate queries need explicit eligible publication state and a reproducible version;
- incentives must be prohibited or conspicuously disclosed and never conditioned on sentiment;
- the platform needs a published review policy plus internal risk assessment and evaluation evidence;
- “AI summary of reviews” is consumer review information and must not distort the underlying distribution.

### 5.2 United States rule

**[VERIFIED — EXTERNAL]** The FTC Consumer Reviews and Testimonials Rule, effective 21 October 2024, prohibits fake/false reviews, sentiment-conditioned incentives, undisclosed insider reviews, review suppression through intimidation and certain fake influence indicators. The FTC explains that ordinary review hosting does not create a general duty to investigate every review, but creating, buying or knowingly disseminating false content and deceptive suppression are prohibited. [FTC rule Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers) and [final-rule announcement](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials).

**[EXTERNAL REQUIREMENT]** Counsel must map where ThryftVerse is only a host versus using reviews as its own promotional claims or ranking features. The safer engineering posture is to preserve disclosure and provenance throughout.

### 5.3 Current marketplace patterns worth adopting—not copying

**[VERIFIED — EXTERNAL]** eBay displays verified purchase, allows transaction-aspect ratings and pictures, supports follow-up/response, and applies evidence-based removal rather than treating negative opinion as removable. [eBay — Leaving feedback for sellers](https://www.ebay.com/help/default/default/default?id=4007) and [Feedback policy](https://www.ebay.com/help/selling/feedback-policies/feedback-policy?id=4208).

**[VERIFIED — EXTERNAL]** eBay seller standards measure outcomes within seller control, vary the evaluation window by volume, require multiple affected buyers for some defects, use carrier-validated tracking, keep most internal performance levels private, and provide defect/late-shipment appeals and automatic protections for carrier/platform events. [eBay seller standards](https://www.ebay.com/help/policies/seller-performance/seller-performance-standards?id=4347) and [appeal process](https://www.ebay.com/help/selling/selling/seller-levels-performance-standards/transaction-defect-rate?id=4871).

**[VERIFIED — EXTERNAL]** Etsy’s seller policy effective 9 July 2026 allows rating plus photo/video within a bounded window, supports edits during that window and prohibits shilling/manipulation; its service standards cover first-message response, on-time shipping/tracking, rating and case rate with stated exclusions. [Etsy Seller Policy](https://www.etsy.com/legal/sellers/) and [Etsy Customer Service Standards](https://help.etsy.com/hc/en-us/articles/360036207794-What-are-Etsy-s-Customer-Service-Standards).

**[VERIFIED — EXTERNAL]** Airbnb delays publication of two-sided reviews until both parties submit or the 14-day window ends, reducing retaliation. [Airbnb review basics](https://www.airbnb.com/help/article/13). This is useful only if ThryftVerse later introduces public two-sided reviews; it is not a reason to make buyers publicly rateable now.

---

## 6. Product policy decisions

### 6.1 What reputation is—and is not

**[DECISION]** Maintain four separate products:

1. **Public transaction feedback:** buyer’s opinion and evidence about a completed purchase.
2. **Public seller standards:** a small set of persisted, evidence-backed operational qualifications.
3. **Private risk/abuse signals:** fraud, account linking, extortion, chargeback or seller/buyer abuse controls.
4. **Ranking features:** calibrated, versioned features used in recommendation, with fairness and gaming guardrails.

They may consume shared facts, but none substitutes for another. A one-star opinion is not a fraud conviction. An internal high-risk tier is not a public badge. A verified identity is not a “trusted seller.”

### 6.2 Who may review

- Only the authenticated buyer of an eligible ThryftVerse transaction.
- Eligibility begins on authoritative delivery or buyer-confirmed receipt and expires after a published window.
- Cancelled/refunded-before-fulfilment orders cannot rate product fulfilment; a distinct support survey may exist privately.
- If a return/dispute is open, the buyer may review, but the UI distinguishes review from complaint and the final outcome can be appended as transaction context—never rewrite the opinion.
- The client never supplies `verifiedTransaction`; server derives and persists it.
- At launch, sellers do **not** publicly star-rate buyers. Buyer abuse/reliability is private and appealable. Public buyer ratings invite retaliation and discrimination without improving listing confidence.

### 6.3 Submission/edit/response policy

**[PROPOSED DECISION FOR COUNSEL/PRODUCT APPROVAL]**

- submit within 60 days of delivery/expected delivery;
- edit rating/text/media for 30 days after publication, preserving revision history;
- after the edit window, allow one follow-up comment rather than silent rewriting;
- seller may publish one response and edit it for 30 days, with revision history;
- if a buyer materially edits after a seller response, notify the seller and label response chronology;
- an author may withdraw public display, but immutable audit and aggregate treatment follow retention policy;
- no reward or coupon for reviews at launch. If introduced later, it applies regardless of sentiment and is prominently disclosed.

These numbers are product decisions—not copied law—and belong in versioned policy configuration.

---

## 7. Authoritative data model

Use Postgres as the source of truth. Redis can cache projections; it cannot own eligibility, tier or badge decisions.

### 7.1 Review aggregate

**[PROPOSED] `reviews`**

```sql
id, order_id, listing_id, reviewer_id, subject_seller_id
eligibility_id, policy_version, verified_transaction boolean
rating smallint, locale, current_revision_id
publication_state draft | media_pending | integrity_review |
                  published | limited | removed | withdrawn
integrity_state eligible | suspected | excluded
submitted_at, published_at, edit_until, follow_up_until
created_at, updated_at, version
UNIQUE(order_id, reviewer_id, subject_seller_id)
```

`verified_transaction` is generated from an immutable eligibility row, not accepted in INSERT input.

**[PROPOSED] `review_revisions`**

```sql
id, review_id, version, rating, title, body
change_reason initial | author_edit | redaction | restoration
created_by, created_at, body_hash
```

Never overwrite review text in place. Public reads use the current eligible revision; moderation/audit can reconstruct history.

**[PROPOSED] `review_aspect_ratings`**

- `description_accuracy`
- `dispatch_experience`
- `packaging`
- `communication`

Ask only aspects the order can support. Do not ask buyers to rate carrier speed as seller performance when carrier acceptance was on time.

**[PROPOSED] media**

- `review_media(review_id, media_asset_id, position, moderation_state, safety_labels, created_at)`
- upload begins as an attachment draft scoped to owner + draft token;
- submit atomically claims finalized remote media;
- abandoned drafts expire and delete after retention window;
- public URL is generated at read time, not accepted as identity;
- text may publish while a photo is pending only if UI explicitly says `Photo under review`; photo failure cannot delete a valid text review.

### 7.2 Responses, reports and moderation

- `review_responses`: seller ID, current revision, publication/integrity state and timestamps.
- `review_response_revisions`: immutable response history.
- `review_reports`: reporter, target type (`review|media|response`), reason taxonomy, evidence, dedupe group and state.
- `review_moderation_cases`: queue priority, policy/jurisdiction, model advisory, human decision, reason, deadline and linked reports.
- `review_moderation_actions`: remove text/media/rating/response independently, aggregate eligibility, notification and statement of reason.
- `review_appeals`: appellant, action, basis, new evidence, status, decision, reviewer and timestamps.
- `review_incentives`: programme, benefit, sentiment-independent flag and disclosure text.
- `review_integrity_signals`: restricted-access features/score/model; never returned publicly.

Removal must distinguish:

- `content_removed_rating_retained` (e.g. personal information in text);
- `media_removed_review_retained`;
- `entire_review_excluded` (fake/no genuine experience);
- `author_withdrawn`;
- `legal_restriction_by_region`.

Negative sentiment alone is never a removal code.

### 7.3 Aggregates and programme decisions

**[PROPOSED] `seller_reputation_daily`**

```sql
seller_id, as_of_date, calculation_version
published_review_count, lifetime_rating_sum, lifetime_average
rating_1_count ... rating_5_count
reviews_12m, average_12m, positive_12m
bayesian_quality_score, lower_confidence_score
source_watermark, computed_at
PRIMARY KEY(seller_id, as_of_date, calculation_version)
```

**[PROPOSED] `seller_standard_evaluations`**

```sql
id, seller_id, programme_version, window_start, window_end
eligible_order_count, minimum_sample_met
on_time_handoff_numerator, on_time_handoff_denominator
seller_cancel_numerator, seller_cancel_denominator
seller_fault_case_numerator, seller_fault_case_denominator
response_numerator, response_denominator
excluded_counts jsonb, input_watermark
decision standard | qualified | restricted
public_badge none | reliable_seller
effective_at, expires_at, previous_evaluation_id
reason_codes, created_at
```

Every badge read returns an evaluation ID, reason summary, effective/expiry and last refresh. Null means no badge. No frontend derivation.

---

## 8. Aggregation and ranking mathematics

### 8.1 Public arithmetic must remain literal

For eligible published reviews:

```text
n = count(review)
R = sum(rating) / n
distribution[k] = count(rating = k)
```

Show `R` to one decimal with `n` and the distribution. Do not display a shrunken Bayesian score as “average rating”; that would misdescribe the consumer reviews. For `n < 5`, reduce visual emphasis and say `1 verified review`/`3 verified reviews`; never award rating-dependent badges from that sample.

Aggregates include only `publication_state='published' AND integrity_state='eligible'`. Removed/excluded reviews trigger deterministic recomputation. Each API response carries `calculationVersion`, `asOf` and `reviewPolicyUrl`.

### 8.2 Internal ranking score

The recommendation model should not map `AVG/5` directly to trust. Use a separate calibrated feature.

**Bayesian mean for quality ordering:**

```text
B = (n / (n + m)) * R + (m / (n + m)) * C
```

- `R`: seller’s eligible rating mean;
- `n`: eligible count;
- `C`: marketplace or category/country cohort mean;
- `m`: versioned prior strength chosen offline and evaluated, not a magic production constant.

**Conservative positive-experience feature:** define positive as 4–5, negative as 1–2, keep 3 neutral, and calculate a lower credible bound from a Beta posterior. This prevents one perfect review from outranking a long reliable history. Do not expose the bound as a consumer star rating.

**Recency:** retain literal lifetime public aggregates. If ranking uses recency, use an explainable decay such as:

```text
w(age_days) = 2 ^ (-age_days / half_life_days)
```

Half-life and cohort are experiment configuration. Never let old reviews disappear from the public history merely because ranking discounts them.

**Cold start:** a new seller gets a neutral prior with no badge, not an invented 0.5 “trust rating” mixed into the model without calibration. Ranking must reserve exploration exposure so incumbents do not permanently capture traffic.

### 8.3 Seller operational metrics

Compute from event owners, not review sentiment:

- on-time handoff: authoritative carrier acceptance before order ship-by deadline;
- seller cancellation: cancellation attribution finalized as seller-controlled;
- seller-fault case: final case decision, excluding carrier/platform/buyer abuse;
- response rate: first human/approved autoreply within window, excluding spam/system messages;
- description accuracy: optional review aspect plus finalized not-as-described cases, kept as separate features.

Denominators, excluded orders and late-arriving corrections are part of the calculation. A `return_case_rate` must not count statutory change-of-mind returns as seller defects. Weather, carrier outage, platform outage, buyer address change and abusive cases need deterministic protection codes and an appeal path.

### 8.4 Ranking constraints

- reputation feature contribution has a capped monotonic range; no raw 1.5× multiplier;
- eligibility decisions are versioned and shadow-tested;
- offline evaluation measures conversion and complaint outcomes plus exposure by seller age, size, category, country and trader/private status;
- online rollout starts at 1%, has automatic rollback and never uses hidden public badges as experiment labels;
- manipulation-model output does not suppress a seller without policy threshold/human path appropriate to impact;
- feature attribution is retained for later seller correction and regulator inquiry.

---

## 9. Review lifecycle and integrity state machine

### 9.1 Lifecycle

```text
eligible_order
  -> draft
  -> submitted
  -> media_pending (optional)
  -> integrity_check
  -> published

published
  -> author_edited -> integrity_check -> published
  -> reported -> published_while_reviewed | limited
  -> removed -> appeal_available
  -> author_withdrawn

removed -> appealed -> upheld | reinstated
```

Default is fast publication. Risk review must be sentiment-blind. High-risk media can be withheld independently while safe text/rating publishes. If a review cannot be published, the author receives a policy reason and appeal route unless law/safety prohibits detail.

### 9.2 Integrity signals

Signals feed investigation; they do not independently prove fakery:

- transaction/payment/shipping relationship;
- reviewer/seller account or device linkage;
- shared payment instrument/address/IP clusters with privacy controls;
- review timing bursts and repeated templates;
- duplicate/near-duplicate text or perceptual media hash;
- reciprocal/ring graph patterns;
- incentive/referral campaign linkage;
- account age/takeover signals;
- extortion language in transaction conversation;
- unusually selective deletion/edit behaviour.

Use rules first and ML in shadow/advisory mode until labelled data and calibration exist. Store feature provenance/model version. Never put an opaque “fake probability” in the operator decision without the transaction graph and policy reason.

### 9.3 Balanced moderation

- sample positive and negative reviews at equivalent base rates;
- track action rate, false-positive/appeal overturn and time-to-publish by rating;
- prevent seller support agents from removing feedback solely to satisfy the seller;
- require evidence and policy reason for removal;
- restrict bulk actions and audit every operator read/action;
- provide legal hold and region restriction without global deletion where appropriate.

---

## 10. API contracts

Shared/generated schemas should replace hand-authored frontend optimism. Mutations require idempotency and stable error codes.

### Review author

- `GET /v2/orders/:orderId/review-eligibility` — basis, opens/expires, existing review and allowed actions.
- `POST /v2/review-drafts` — returns draft ID and media attachment token.
- `POST /v2/review-drafts/:id/media` — claims finalized media asset IDs.
- `POST /v2/orders/:orderId/reviews` — `Idempotency-Key`; accepts draft ID, rating, aspects, text and policy version.
- `PATCH /v2/reviews/:id` — current version/`If-Match`; creates immutable revision.
- `POST /v2/reviews/:id/follow-ups` — after edit window.
- `POST /v2/reviews/:id/withdraw` — changes public visibility according to policy.

### Public reads

- `GET /v2/sellers/:sellerId/reputation` — compact public projection, sample treatment, badges as decision references.
- `GET /v2/sellers/:sellerId/reviews?rating=&media=&sort=&cursor=` — keyset cursor on `(published_at,id)`.
- `GET /v2/reviews/:id` — current public version, chronology and response.

Public response example:

```json
{
  "summary": {
    "average": 4.8,
    "count": 126,
    "distribution": { "1": 2, "2": 1, "3": 4, "4": 18, "5": 101 },
    "calculationVersion": "rep_2026_08_1",
    "asOf": "2026-08-25T12:00:00Z"
  },
  "badges": [{
    "key": "reliable_seller",
    "evaluationId": "sse_...",
    "label": "Reliable seller",
    "reason": "On-time dispatch and resolved orders met the current standard",
    "expiresAt": "2026-09-01T00:00:00Z"
  }]
}
```

### Seller and moderation

- `POST /v2/reviews/:id/responses` and `PATCH /v2/review-responses/:id`.
- `POST /v2/review-targets/:type/:id/reports`.
- `POST /v2/reviews/:id/removal-requests` — evidence-based, not “I dislike this.”
- `POST /v2/review-actions/:id/appeals`.
- `GET /v2/sellers/me/standards` — metric numerator, denominator, exclusions, cutoff, projected next evaluation and appeal actions.
- Operator endpoints use case IDs, reason codes, least-privilege scopes and append-only actions.

Representative stable errors:

```text
REVIEW_NOT_YET_ELIGIBLE
REVIEW_WINDOW_CLOSED
REVIEW_ALREADY_EXISTS
REVIEW_VERSION_CONFLICT
REVIEW_MEDIA_NOT_FINALIZED
REVIEW_POLICY_VERSION_STALE
RESPONSE_NOT_AUTHORIZED
REVIEW_ACTION_NOT_APPEALABLE
```

---

## 11. Failure and abuse catalogue

| Scenario | Required system response | Public/native result |
|---|---|---|
| Submit request times out after commit | replay idempotency key/read by order | `Checking your review`, never duplicate |
| Two concurrent submissions | DB uniqueness + idempotent winner | existing review returned |
| Photo upload succeeds, review abandoned | attachment expiry cleanup | no orphan public asset |
| One photo moderation fails | publish eligible text/rating; isolate photo | `Photo unavailable/under review` only if useful |
| Seller response endpoint retries | one response/version; no duplicates | stable response |
| Buyer edits after response | version history + seller notification | chronology remains intelligible |
| Review contains personal data | redact/remove text/media with reason; rating treatment policy | do not erase all evidence by default |
| Threat/extortion | preserve evidence, safety escalation, bounded visibility | protect parties, do not reward extortion |
| Seller requests removal because negative | reject without policy basis | review remains |
| Incentive offered to all reviewers | prominent disclosure, sentiment-independent proof | disclosed review marker |
| Incentive only for five stars | block programme/review integrity case | exclude affected review if policy supports |
| Coordinated ring | graph/risk case; freeze badge/ranking impact pending calibrated decision | no public accusation |
| Account takeover writes review | security recovery + review quarantine/reinstatement path | author informed |
| Moderator removes positive faster than negative or vice versa | bias alert and audit | equivalent process |
| Late carrier correction changes seller defect | recompute standards, auto-protection and notify | badge/status updates with explanation |
| Low-volume seller has one 5-star review | literal count; Bayesian ranking prior; no badge | `5 stars · 1 review`, restrained |
| Review deleted during pagination | compound cursor, stable snapshot/watermark | no duplicate/skip |
| Aggregate job lags | API exposes `asOf`; bounded stale cache | no fabricated freshness |
| Recommendation model unavailable | neutral non-reputation fallback | no disappearance of new sellers |
| Seller appeals operational defect | evidence bundle, SLA, independent reviewer | metric marked under review if material |

---

## 12. Native UX specification — anti-AI design

### 12.1 Trust line on listing/profile

The current product should show fewer claims, with stronger evidence:

```text
4.8 · 126 reviews
318 completed sales
```

- Both lines are tappable only when their destinations and data exist.
- With one review: `5 stars · 1 verified review`; no `Top Seller` badge.
- No row of four colourful trust pills. One current, backend-decided seller standard may appear beside identity; detail sheet explains inputs and expiry.
- Identity verification, seller performance and Buyer Protection are different claims and never share a generic shield.
- The product image and seller identity remain dominant; trust chrome recedes in the squint test.

### 12.2 Reviews screen

**First viewport:** compact identity/back, literal `4.8 from 126 verified purchases`, distribution, then the first complete review. Do not put the summary inside an oversized rounded card.

**Composition:**

- flat background, distribution bars without decorative container;
- one useful filter row (`Recent`, `Critical`, `With media`) only when it changes results;
- review rows separated by hairlines and variable height;
- small listing thumbnail connects feedback to the transaction;
- `Purchased` is restrained metadata, not a green pill repeated 20 times;
- seller response is indented typography with one subtle rule, not another card;
- media is 3:4 or square based on source, uses full-screen viewer and honest failure state;
- moderation placeholder appears only when needed to preserve response/thread meaning.

Do not label a filter `Negative` in a way that stigmatizes; `Critical` or rating values are clearer. Do not use an AI review summary at launch. If added, it needs coverage, citations back to reviews, sentiment-balanced evaluation, recency and explicit generated status.

### 12.3 Review composer

1. Item/transaction header and one large, accessible rating control.
2. Once rated, optional transaction-specific aspects appear—never five mandatory surveys.
3. Text prompt adapts: `What should another buyer know?`
4. Media is optional and explains privacy (`Remove labels, addresses and faces you do not want public`).
5. Upload tiles show queued/uploading/failed/finalized individually.
6. Submission confirms only server persistence; unknown outcome becomes `Checking your review`.

Avoid a stack of card sections, decorative star burst, bounce animation and celebratory confetti. Selection haptic once, 160–200ms star fill, reduced-motion instant state. The primary action is `Publish review`, not the inaccurate `Submit` if publication may be moderated; if publication is pending, say so.

### 12.4 Seller response

Use an anchored bottom sheet with the review visible above the input. Copy should say responses are public and should address the transaction. Do not instruct the seller to “thank the buyer”—that generic AI copy produces performative replies. Provide report/removal request separately from respond so sellers cannot confuse disagreement with policy violation.

### 12.5 Seller standards

This is not a generic analytics dashboard. The first viewport answers:

```text
Reliable seller status: On track
Next evaluation: 1 Sep

On-time handoff      47 / 49
Seller cancellations 1 / 52
Cases seller had to resolve 0 / 52
```

Each metric expands to its definition, exclusions and affected orders. A projected change is clearly distinct from current status. One contextual action (`Review 2 late handoffs`) is better than four equal cards. Defect appeal lives on the affected order, not behind a generic help form.

### 12.6 Accessibility and states

- Star controls announce `4 of 5, selected`; distribution announces count and percentage.
- Large text preserves reviewer, rating, date and action without overlap.
- Skeletons match summary/rows; no centered spinner replacing the entire screen.
- Empty states distinguish no transactions, no reviews yet and filtered empty.
- Removed, media-pending, offline, partial, stale aggregate, response pending and appeal states all have truthful copy.
- Reviewer navigation is only exposed if server supplies an authorized public ID.
- Bottom sheets clear keyboard, safe area and navigation dock on physical devices.

---

## 13. Stack and ownership decisions

### Keep

- Postgres as review/audit/projection truth.
- Fastify/Zod contracts, but export/generated schemas to the app.
- Existing media service after adding attachment claim/cleanup.
- TanStack Query for public review pages and deterministic invalidation.
- Redis for caches and work coordination only.
- Existing moderation/fraud infrastructure as advisory consumers.

### Add

- Transactional outbox for review publication, aggregate recompute and notifications.
- A review integrity worker queue with reasoned retries/dead-letter ownership.
- Deterministic projection job keyed by source watermark/calculation version.
- Text duplicate detection (normalized hashes + approximate similarity), media perceptual hashes and graph features; add ML only after labelled evaluation.
- OpenTelemetry correlation and privacy-redacted structured events.
- Feature flags for response/edit/media/public badges/ranking separately.

### Do not add yet

- A graph database: Postgres edge tables/materialized features are adequate initially.
- A vector database solely for review text: pgvector or batch embeddings are enough if semantic duplicate detection is validated.
- Generative review summaries: legal/integrity/evaluation burden exceeds launch value.
- Blockchain attestations or publicly exposed trust scores.
- Multiple competing badge programmes.

---

## 14. Rollout and migration plan

### Phase 0 — contract truth repair

1. Stop offering review photos until the server persists media, or add the media relation and claim transaction immediately.
2. Remove/unwire seller-response affordances/types until a real endpoint exists.
3. Fix `reviewee_id` to the canonical `seller_id` and add a clean-database route test.
4. Return reviewer ID when public navigation is authorized, or remove tappable reviewer affordance.
5. Remove local badge derivation and all trust copy without a persisted programme decision.
6. Disable raw seller-rating contribution in recommendation or replace it with neutral shadow-only calibrated feature.
7. Remove unsupported future-industry claims and visibility multipliers from production policy.

### Phase 1 — canonical lifecycle

1. Add review/revision/media/response/report/moderation/appeal migrations.
2. Backfill existing rows as `verified_transaction=true`, `published`, policy `legacy_v1`, retaining existing IDs.
3. Add attachment cleanup for orphaned existing review uploads where identifiable.
4. Dual-read legacy and v2 behind a flag; compare counts/distributions exactly.
5. Launch idempotent composer, edits and responses with generated contracts.

### Phase 2 — integrity and aggregation

1. Publish policy and complete UK fake-review risk assessment.
2. Add sentiment-blind rules, reports, operator cases and appeals.
3. Build reproducible daily/incremental aggregates with source watermarks.
4. Reconcile legacy public averages before switching reads; any delta must have a classified reason.
5. Add seller standards calculation from authoritative order/carrier/case facts in shadow mode.

### Phase 3 — public standard and ranking

1. Define one seller standard with minimum sample, exclusions, protections, expiry and appeal.
2. Shadow decisions for at least two full evaluation windows.
3. Expose seller dashboard before any public consequence so sellers can correct data.
4. Roll out the public badge separately from ranking.
5. A/B rank contribution at capped strength with new-seller exposure guardrails and automatic rollback.

### Migration discipline

- additive tables first; no destructive rewrite of `order_reviews`;
- backfill by stable ID ranges with count/hash reconciliation;
- preserve timestamps and order linkage;
- use dual-write only after idempotency exists;
- validate constraints online before enforcing;
- keep aggregate v1/v2 dashboards until a full evaluation window matches;
- removal/reinstatement must issue compensating events, never manual aggregate edits.

---

## 15. SLOs, metrics and governance

### 15.1 Proposed SLOs

| Objective | Target |
|---|---:|
| Review create API availability | 99.95% monthly |
| Create acknowledgement | p95 < 500ms excluding media upload |
| Idempotent duplicate publications | zero |
| Safe text publication | 99% < 60s for low-risk verified transactions |
| Media moderation | p95 < 5m automated; escalated p95 < 24h |
| Aggregate freshness | 99.9% < 5m after publication/action |
| Aggregate correctness | 100% reproducible from eligible rows |
| Report acknowledgement | p95 < 500ms |
| High-severity moderation | p95 < 15m to human ownership |
| Standard appeal decision | p95 < 72h; urgent income-blocking p95 < 24h |
| Badge expiry enforcement | 100% by expiry timestamp |
| Ranking rollback | < 15m after guardrail breach |

### 15.2 Integrity and fairness metrics

- submission eligibility denial and duplicate rate;
- upload success, orphan cleanup and media moderation rate;
- time-to-publish by 1–5 star rating and language;
- report/action/appeal/overturn rate by rating and policy reason;
- positive/negative sampling parity and false-positive estimate;
- suspicious-cluster precision/recall on adjudicated sample;
- aggregate recomputation drift count;
- seller standard changes, protections and appeal overturns;
- public badge precision: percent later invalidated due to source error;
- new-seller, low-volume and private/trader exposure distributions;
- recommendation outcomes with/without reputation feature;
- support contacts caused by unclear review/complaint distinction.

Do not use `review count`, `average rating` or reduced support tickets as sole success metrics. Those can be gamed by coercion and friction.

### 15.3 Governance artifacts

- published review/incentive/moderation policy;
- UK fake-review risk assessment reviewed on material product change;
- metric dictionary with numerator, denominator, exclusions and owners;
- programme version approvals and experiment decision log;
- model/rule cards, evaluation datasets and subgroup results;
- operator access audit and retention schedule;
- quarterly aggregate reconstruction and bias audit.

---

## 16. Test and device-validation programme

### 16.1 Database/contract

- clean migrations prove exact columns, foreign keys, uniqueness and indexes;
- generated client schema rejects fields the server does not support;
- same idempotency key/body replays; same key/different body conflicts;
- concurrent reviews for one order publish once;
- eligibility boundaries at delivery, refund, open dispute and deadline/DST;
- revision/response optimistic locking;
- media claim is atomic with review or safely recoverable;
- removal/reinstatement updates public projection once;
- aggregate rebuild equals incremental projection bit-for-bit.

### 16.2 Moderation/integrity

- positive and negative versions of identical violation receive the same action;
- negative opinion without violation remains published;
- personal data can remove text/media without fabricating rating history;
- duplicate text/media, linked accounts, ring and incentive cases;
- model unavailable/timeout defaults to policy-safe review path, not silent deletion;
- appeal overturn restores correct version and aggregate;
- operator bulk action scope/reason/access tests;
- notification does not leak unmoderated content on lock screen.

### 16.3 Aggregation/ranking

- public mean/distribution fixtures including removed/restored/edit cases;
- one five-star vs 100-review seller Bayesian treatment;
- new seller neutral prior/exploration exposure;
- late carrier correction recalculates operational standard;
- seller-fault vs carrier/platform/buyer exclusions;
- change-of-mind return does not become seller defect;
- rank feature boundedness, monotonicity, rollback and subgroup exposure tests;
- cache loss rebuilds from Postgres without changing badge.

### 16.4 Native EAS

On physical Android/iOS validate composer, per-photo upload retry, background/resume, unknown submission outcome, edit/follow-up, seller response, report/removal appeal, public pagination, media viewer, small/large samples, empty/filtered/offline/stale states, light/dark, reduced motion, large text and TalkBack/VoiceOver.

Retain local captures and compare first useful content Y, useful review rows above fold, rounded-container count, visible icon chrome, sticky/dock occlusion and skeleton-to-final shift. A TypeScript pass does not override a visually generic or broken release render.

---

## 17. Non-goals

- No fake imported reviews from eBay, Etsy, Depop or another platform presented as ThryftVerse verified transactions.
- No public buyer star score at launch.
- No generic `Trusted Seller` derived from email/identity verification.
- No raw review average used directly as fraud truth or uncapped ranking multiplier.
- No hidden removal of negative reviews and no seller veto.
- No incentives conditioned on rating or sentiment.
- No automatic positive feedback fabricated on behalf of buyers.
- No generative review summary until source-linked factuality and balanced evaluation pass.
- No rainbow of badges, pills, progress cards or dashboard chrome.
- No metrics supplied by client/caller as authoritative seller performance.

---

## 18. Hard acceptance gates

1. Client and server share/generated contract; no accepted UI field is silently stripped.
2. Review media survives submission, is moderated, has cleanup and never relies on a local/public URL as identity.
3. Seller response, report, moderation, removal, reinstatement and appeal work end to end with audit.
4. Clean database analytics uses `seller_id`; no route references nonexistent review columns.
5. Only a server-proven eligible transaction can create one review; retries cannot duplicate it.
6. Every public aggregate is reproducible from published eligible reviews and exposes count/as-of/version.
7. Genuine negative reviews are not delayed, sampled or removed more aggressively than positive reviews.
8. Incentives are absent or sentiment-independent, persisted and prominently disclosed.
9. Low samples cannot earn a rating-based badge or perfect recommendation trust score.
10. Every public badge is a persisted, current, explainable programme decision with expiry; null renders nothing.
11. Seller performance comes from authoritative order, carrier, return and case facts with denominators/exclusions.
12. Sellers can inspect and appeal affected operational defects before material public/ranking consequences.
13. Ranking reputation is calibrated, capped, shadow-tested, fairness-audited, reversible and protected against incumbent lock-in.
14. Review integrity has policy, risk assessment, detection, investigation, action and effectiveness measurement.
15. TypeScript, clean migrations, contract/integrity/aggregation/ranking tests and native EAS matrix pass.
16. Thumbnail/squint tests show seller identity and real review content—not repeated badges/cards—as the dominant visual story.

---

## 19. Primary and official sources

### Law and regulator guidance

- [UK CMA — Fake reviews guidance (CMA208)](https://www.gov.uk/government/publications/fake-reviews)
- [UK CMA — Short guide for publishers of consumer reviews](https://www.gov.uk/government/publications/fake-reviews/short-guide-for-businesses-publishing-consumer-reviews-and-complying-with-consumer-protection-law)
- [UK CMA — Reviews: guidance for online review sites, September 2025](https://www.gov.uk/government/publications/reviews-guidance-for-online-review-sites/reviews-guidance-for-online-review-sites)
- [UK CMA — Unfair commercial practices (CMA207), updated November 2025](https://www.gov.uk/government/publications/unfair-commercial-practices-cma207)
- [UK CMA — Fake and misleading reviews: 5 businesses under CMA investigation, 27 March 2026](https://www.gov.uk/government/news/fake-and-misleading-reviews-5-businesses-under-cma-investigation) | Autotrader/Feefo (negative review suppression), Dignity (insider reviews), Just Eat (inflated star ratings), Pasta Evangelists (undisclosed discounts for 5-star reviews).
- [UK CMA — Online consumer reviews case page, updated 27 March 2026](https://www.gov.uk/cma-cases/online-consumer-reviews) | 5 investigations opened March 2026, website compliance review of 100+ businesses, 54 non-compliant.
- [UK CMA — Feefo consumer protection enforcement case, 27 March 2026](https://www.gov.uk/cma-cases/feefo-consumer-protection-enforcement-case) | Investigation into moderated 1-star reviews not published/counted, timeline March-September 2026.
- [UK CMA — CMA208 Fake reviews guidance PDF](https://assets.publishing.service.gov.uk/media/67eeb64fe9c76fa33048c790/CMA208_-_Fake_reviews_guidance.pdf) | Banned practices, risk assessment requirements, prevention/removal measures, ongoing effectiveness review.
- [UK CMA — Direct consumer enforcement: one year on, April 2026](https://competitionandmarkets.blog.gov.uk/2026/04/17/direct-consumer-enforcement-one-year-on/) | 14 investigations, £4.7M fines, fake reviews as enforcement priority, up to 10% global turnover.
- [US FTC — Consumer Reviews and Testimonials Rule Q&A](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers)
- [US FTC — Final rule announcement](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials)

### Current marketplace policies and mechanics

- [eBay — Leaving feedback for sellers](https://www.ebay.com/help/default/default/default?id=4007)
- [eBay — Feedback policy](https://www.ebay.com/help/selling/feedback-policies/feedback-policy?id=4208)
- [eBay — Seller standards policy](https://www.ebay.com/help/policies/seller-performance/seller-performance-standards?id=4347)
- [eBay — Appeal a defect or late shipment](https://www.ebay.com/help/selling/selling/seller-levels-performance-standards/transaction-defect-rate?id=4871)
- [Etsy — Seller Policy, effective 9 July 2026](https://www.etsy.com/legal/sellers/)
- [Etsy — Customer Service Standards](https://help.etsy.com/hc/en-us/articles/360036207794-What-are-Etsy-s-Customer-Service-Standards)
- [Airbnb — Review publication and two-sided timing](https://www.airbnb.com/help/article/13)

---

## Final status

**PARTIAL — BACKEND CAPABILITY BLOCKER.** The one-order/one-buyer review base is worth preserving, but current media, response, analytics, badge and ranking contracts are not trustworthy enough for flagship production. Phase 0 removes false affordances and active ranking risk; lifecycle/integrity/aggregation closure is required before public seller standards or reputation-based distribution.

### Upgraded status (25 August 2026)

**RESEARCH DEEPENED — IMPLEMENTATION BLOCKERS UNCHANGED.** The CMA has launched 5 fake-review investigations under the DMCC Act 2024 (March 2026), covering negative review suppression (Autotrader/Feefo), insider reviews (Dignity), inflated star ratings (Just Eat), and undisclosed discounts-for-5-star-reviews (Pasta Evangelists). The CMA's website compliance review found 54 of 100+ businesses non-compliant with fake-review guidance. The CMA can fine up to 10% of global turnover. ThryftVerse's current implementation has multiple CMA exposure points: raw averages without eligibility filtering (misleading aggregation), no publication/moderation state (no integrity control), no fake-review policy or risk assessment (non-compliant), no incentive disclosure system, and no anti-manipulation detection. The codebase defects (silently stripped photo URLs, non-existent seller response endpoint, `reviewee_id` schema mismatch, client-derived badges, raw average in recommendations) remain unchanged. No public reputation, badge, or reputation-based ranking may ship until every gate in §18 passes and a CMA-compliant fake-review policy with risk assessment is published.
