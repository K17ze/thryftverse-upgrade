# ThryftVerse Review Integrity Policy

**Version:** 1.0
**Effective:** 25 August 2026
**Owner:** Trust & Safety
**Review cycle:** Quarterly, or on material product change

---

## 1. Purpose

This policy governs the integrity of reviews on the ThryftVerse marketplace. It exists to protect buyers from misleading information and to ensure sellers are judged on genuine transactions. It complies with:

- **UK Competition and Markets Authority (CMA)** — Online Reviews Guidance (2024)
- **US Federal Trade Commission (FTC)** — 16 CFR Part 465 (Use of Consumer Reviews and Endorsements, 2024)
- **Digital Markets, Competition and Consumers Act 2024 (DMCCA)** — consumer protection provisions

---

## 2. What constitutes a genuine review

A review is genuine when:

1. The reviewer is the verified buyer of the order being reviewed
2. The reviewer was not offered an incentive in exchange for the review, or any incentive was fully and prominently disclosed
3. The review text reflects the reviewer's honest experience
4. The reviewer is not connected to the seller through shared accounts, devices, or IP addresses that would indicate coordination

---

## 3. Prohibited review practices

The following are prohibited and will result in review removal and potential account action:

- **Fake reviews** — reviews written by someone who did not purchase or receive the item
- **Incentivized reviews without disclosure** — reviews written in exchange for a discount, cashback, free item, or loyalty points where the incentive is not disclosed
- **Coordinated review campaigns** — multiple reviews from linked accounts, shared devices, or the same IP cluster
- **Review suppression** — sellers pressuring buyers to remove or change negative reviews through refunds, threats, or harassment
- **Duplicate or templated text** — reviews that copy text from other reviews or use templated language suggesting coordination

---

## 4. Incentivized reviews

Incentivized reviews are NOT prohibited if:

1. The incentive is disclosed prominently on the review (via the incentive disclosure mechanism)
2. The incentive is not contingent on the review being positive (sentiment-independent)
3. The disclosure is persisted and cannot be edited or removed after submission

Incentives that are contingent on positive sentiment are prohibited regardless of disclosure.

---

## 5. Review moderation

### 5.1 Moderation actions

Moderators may take the following actions on reviews:

| Action | Effect | Notification |
|--------|--------|--------------|
| Remove | Review hidden from public view | Reviewer and seller notified |
| Restore | Review returned to public view | Reviewer and seller notified |
| Escalate | Review flagged for senior review | No notification |
| Warn seller | Seller warned about review practice | Seller notified |
| Dismiss report | Report closed, no action | Reporter not notified |

### 5.2 Fairness in moderation

- Negative opinions without policy violation remain published
- Positive and negative versions of identical violations receive the same action
- Moderation decisions are auditable via review_moderation_actions
- Personal data removal can remove text/media without fabricating rating history

---

## 6. Appeals

Sellers and reviewers may appeal moderation decisions within 30 days.

### Appeal grounds

- **Factual error** — the moderation decision was based on incorrect information
- **Policy misapplied** — the policy was applied incorrectly to the review
- **New evidence** — new information is available that was not considered
- **Proportionality** — the action was disproportionate to the violation

### Appeal process

1. Appellant submits appeal via POST /reviews/:reviewId/appeal
2. Appeal is reviewed by a moderator who did not take the original action
3. Decision is recorded with rationale
4. If upheld: the original action is reversed and the review is restored
5. If overturned: the original action stands

---

## 7. Integrity signals

The system computes risk signals for each review using:

- **Duplicate text detection** — similarity to other reviews for the same seller
- **Linked account detection** — shared IP addresses or device fingerprints
- **Velocity anomaly** — unusual review volume for a seller
- **Rating inconsistency** — rating significantly different from reviewer's history
- **Incentive detection** — presence of an incentive disclosure

Risk signals do NOT auto-remove reviews. They inform moderation queue prioritization.

---

## 8. Aggregate integrity

Public review aggregates (average rating, distribution, count):

- Are computed from eligible reviews only (published, not removed)
- Include an `asOf` timestamp indicating the latest review included
- Include a `snapshotVersion` for reproducibility
- Are recomputed incrementally and can be reconstructed from the review set

---

## 9. Seller standards

Seller performance metrics are computed from authoritative order, carrier, and case data — never from caller-supplied values. Sellers can inspect their metrics via GET /sellers/:sellerId/standards and appeal defects via POST /sellers/:sellerId/standards/appeal.

---

## 10. Data retention

- Reviews: retained for the lifetime of the order
- Moderation actions: retained for 7 years (regulatory evidence)
- Appeal records: retained for 7 years
- Integrity signals: retained for 2 years, then aggregated and purged
- Incentive disclosures: retained for the lifetime of the review

---

## 11. Effectiveness measurement

The following metrics are monitored quarterly:

- Submission eligibility denial and duplicate rate
- Upload success, orphan cleanup and media moderation rate
- Time-to-publish by 1-5 star rating and language
- Report/action/appeal/overturn rate by rating and policy reason
- Positive/negative sampling parity and false-positive estimate
- Suspicious-cluster precision/recall on adjudicated sample
- Aggregate recomputation drift count
- Seller standard changes, protections and appeal overturns
- Public badge precision: percent later invalidated due to source error
- New-seller, low-volume and private/trader exposure distributions
- Recommendation outcomes with/without reputation feature
- Support contacts caused by unclear review/complaint distinction

`review count`, `average rating` and reduced support tickets are NOT used as sole success metrics — those can be gamed by coercion and friction.
