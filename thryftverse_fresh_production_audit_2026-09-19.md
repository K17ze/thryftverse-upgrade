# Thryftverse — Fresh Production, Flagship UX, Marketplace, Co‑Own, ML/AI & Deployment Audit

**Audit date:** 19 September 2026  
**Repository:** `K17ze/thryftverse-upgrade`  
**Audited branch:** `feat/product-detail-contract-media-device-closure`  
**Audited branch HEAD:** `fdd63b8ff339d012699e92be8150fc194e3b9daa`  
**Audit type:** adversarial static architecture/product review + current-market benchmark research  
**Primary question:** Is Thryftverse actually ready to behave like a flagship social marketplace/trading product, not merely look feature-rich in source code?

---

## 0. Executive verdict

Thryftverse has crossed an important line: it is no longer a thin React Native marketplace prototype with a few social screens. The repository now contains credible mobile primitives, substantial server-side domain logic, payment and wallet concepts, explicit authority boundaries for high-risk actions, a large Co‑Own implementation, social/creator surfaces, moderation/compliance scaffolding, realtime messaging, seller operations, catalogue import, live-commerce work, recommendation instrumentation, production-oriented deployment files, and a much more serious design contract.

That does **not** mean it is ready for an unrestricted public launch at eBay/Instagram/Pinterest/StockX/Whatnot quality.

### Overall unrestricted-public-launch readiness: **70 / 100**

This is a meaningful improvement over earlier snapshots, but the remaining 30 points are concentrated in the hardest parts of a marketplace:

- release proof rather than source-code intent;
- high-concurrency financial and ownership invariants;
- operationally mature search/recommendations;
- full end-to-end Co‑Own consumers and settlement evidence;
- marketplace trust, authenticity and dispute operations;
- genuine native visual polish and interaction proof;
- production observability and scale exercises;
- ML retrieval/rerank maturity;
- branch protection and release governance;
- legal/regulatory certainty around a tradeable fractional-ownership product.

### Separate readiness scores

| Area | Score | Decision |
|---|---:|---|
| Product coherence / social-commerce concept | **8.2 / 12** | Strong differentiated concept, still too broad in places |
| Visual system / interaction / accessibility | **5.3 / 8** | Better foundations; needs native proof and more restraint |
| Frontend architecture / mobile engineering | **8.0 / 10** | Credible flagship stack; remaining quality is implementation discipline |
| Backend / API / domain architecture | **11.5 / 15** | Broad and increasingly authoritative; runtime proof still uneven |
| Marketplace transactions / payments / ledger | **8.7 / 12** | Much improved, but provider and reconciliation journeys need release evidence |
| Co‑Own / trading robustness | **6.5 / 10** | Sophisticated surface/domain work; still incomplete end-to-end |
| Trust / safety / fraud / moderation | **5.8 / 8** | Correct direction; operations and evidence matter more than routes |
| Search / recommendation / ML | **4.5 / 8** | Instrumented, but retrieval/rerank/search architecture is not yet Pinterest-grade |
| Security / privacy / account integrity | **5.4 / 7** | Stronger than a normal startup prototype; needs independent verification |
| Reliability / observability / SRE | **3.1 / 5** | Primitives exist; scale and failure drills are under-evidenced |
| Testing / release / deployment governance | **2.6 / 5** | Largest confidence discount today |
| **Total** | **69.6 / 100 → 70 / 100** | **Gated beta: plausible. Unrestricted public scale: not approved.** |

### Limited beta vs public scale

I would distinguish three release labels:

| Release state | Current view |
|---|---|
| Internal / founder / design-team builds | **Ready enough** for aggressive device validation |
| Small invite-only beta with capped commerce volume | **Conditionally viable** after closing the P0 list below |
| Open public marketplace with real money, large catalog, live commerce and Co‑Own | **Not yet** |
| “Comparable to eBay + Instagram + Pinterest + StockX + Whatnot in production quality” | **Not yet** |

The central reason is not lack of features. It is that flagship marketplaces win through **operational truth under failure**: duplicate webhooks, chargebacks, two buyers racing for one item, seller fraud, account takeover, stale inventory, search-index lag, low-liquidity markets, out-of-order realtime events, moderation appeals, bad uploads, shipping disputes, legal holds, and partially completed financial workflows.

Thryftverse now has enough architecture that those are the correct problems to solve.

---

# 1. Audit methodology and evidence confidence

This audit deliberately separates five kinds of evidence.

### 1.1 Documentation intent
Files such as `Design.md`, `AGENTS.md`, research reports, implementation plans and domain notes are useful because they show the intended quality bar.

They do **not** prove a capability exists.

### 1.2 Code-path existence
A route, migration, component, worker, queue handler or library in the repository proves implementation work exists.

It does **not** prove production behavior, concurrency safety or provider correctness.

### 1.3 Authoritative runtime design
This is stronger evidence: explicit server ownership of state machines, locking, idempotency, signed-provider webhooks, append-only ledger behavior, reconciliation semantics, deterministic auction ordering, KYC provider authority, etc.

Thryftverse has materially improved here.

### 1.4 Release evidence
This means a particular candidate build passed CI, integration tests, signed builds, device matrices, staging provider flows, visual snapshots and rollback checks.

This is still one of the weakest parts of the current branch.

### 1.5 Market benchmark evidence
The competitor comparison uses current public product/help/policy information from eBay, Depop, StockX, Pinterest, Whatnot, Apple, Google, Stripe, OWASP, the FCA and EU Digital Services Act material.

The purpose is not to clone competitors. It is to identify what users already consider table stakes.

---

# 2. Repository state: what changed materially

The exact branch HEAD inspected is:

`fdd63b8ff339d012699e92be8150fc194e3b9daa`

Its commit message is:

> `feat(flagship): release train gates, vendor sync handler, and trader disclosure migration 319`

Important recent branch history also contains substantial work in:

- messaging privacy and tombstone behavior;
- offer lifecycle and Smart Sell;
- product-detail correctness;
- wallet integrity and P2P locking;
- account recovery and protected-change holds;
- seller inventory concurrency;
- catalogue import pipeline hardening;
- AI agent authorization/approval handling;
- live-shopping contracts;
- moodboard mixed-source media;
- storefront policies, profile grammar, saved collections and notification UX;
- release-gate and dependency work.

This matters: several gaps from the 7–11 September audit documents have genuinely been addressed.

## 2.1 Branch-versus-main clarification

GitHub reports `main` nine commits ahead in ancestry from the feature branch, but the compare result returns no changed files. In other words, the branch's content was merged and the apparent “behind” count is merge topology rather than nine missing code changes.

**Do not spend engineering time rebasing merely to chase the count.**

Do, however, stop releasing from an unprotected long-lived feature branch.

## 2.2 Current release-governance concern

The branch is unprotected and has no required status checks configured. On the exact HEAD:

- combined status shows **Devin Review: failure**;
- no GitHub Actions workflow runs were attached to the commit when inspected;
- the latest commit adds release gates, but source presence is not the same as proving that those gates ran and passed.

### Required upgrade
Create one release branch policy:

1. `main` protected.
2. PR required.
3. required checks:
   - frontend typecheck;
   - backend typecheck;
   - frontend unit tests;
   - backend unit tests;
   - integration suite;
   - migration validation;
   - Expo config/doctor;
   - dependency/security scan;
   - secret scan;
   - visual baseline gate;
   - mobile smoke on real/simulated device;
   - API contract tests;
   - build artifact generation.
4. signed/reviewed release tags.
5. environment approvals for production.
6. migration and rollback gates.
7. immutable artifact promotion rather than rebuilding prod from a different source state.

**Acceptance:** the candidate SHA visible in production is the same SHA that passed every required check.

---

# 3. Architecture verdict

## 3.1 What is now credible

The mobile stack is capable of flagship quality:

- React Native / Expo foundation;
- Reanimated;
- FlashList;
- Skia;
- VisionCamera;
- SQLite;
- MMKV;
- persisted React Query patterns;
- Stripe client integration;
- Sentry;
- PostHog;
- LiveKit;
- native/privacy manifests;
- Maestro/device-test tooling;
- visual-regression tooling.

Nothing about this stack inherently prevents Instagram/Pinterest/Depop-quality interaction.

The backend is also no longer a trivial CRUD service. The repository contains Fastify/Node services, PostgreSQL migrations, Redis/queue primitives, workers, payment-provider paths, KYC/compliance routes, wallet/ledger concepts, realtime behavior, moderation, recommendation services, search adapters and operational surfaces.

## 3.2 What I would **not** do

Do not rewrite the app in fully native Swift/Kotlin simply because competitors have more native history.

Do not remove Expo merely to signal “flagship.”

Do not add another framework because a competitor uses it.

The quality ceiling is currently dominated by:

- experience architecture;
- reliability;
- operational evidence;
- ML retrieval/ranking;
- trust/safety;
- visual restraint;
- release discipline.

A rewrite would delay all of those.

## 3.3 Architecture target

Use a **modular monolith + specialized services** model until scale forces another split.

Recommended authority boundaries:

- **API/domain core:** listing, offer, order, ownership, market/order state;
- **payments adapter:** Stripe/provider orchestration;
- **ledger:** immutable economic journal;
- **reconciliation worker:** provider-vs-internal state;
- **realtime gateway:** fan-out only, never financial authority;
- **media pipeline:** upload, virus scanning, transcoding, moderation, variants;
- **search service:** durable shared search index;
- **ranking/decision service:** non-authoritative personalization;
- **trust service:** signals + review queue;
- **notification worker:** push/email/in-app fan-out;
- **analytics/event ingestion:** product telemetry, not transactional authority.

Avoid premature microservices for every domain noun.

---

# 4. UI/UX north star: “trading culture” rather than “marketplace with social tabs”

The biggest experience opportunity is to stop thinking of Thryftverse as:

> Depop + Instagram + a Co‑Own tab.

The stronger thesis is:

> **A media-first network where every object can carry commercial intent, provenance, market context and conversation.**

That gives a coherent reason for all the surfaces to coexist.

A user should be able to move through:

`Inspiration → Object → Market truth → Seller/community → Transaction → Ownership → Resale/position`

without feeling they entered five different apps.

---

# 5. Anti-AI design policy

“Anti-AI” should not mean avoiding AI. It should mean avoiding the visual signature of generated interfaces.

## 5.1 Ban generic card soup

Generated UI often uses:
- rounded container;
- title;
- subtitle;
- icon;
- badge;
- button;
- another rounded container;
- decorative gradient;
- repeated 16/20/24 padding.

Your own Co‑Own campaign notes already recognize this and have flattened several sections.

Continue that direction.

### Rule
A card must earn its boundary.

Good reasons:
- draggable unit;
- floating modal;
- purchase object;
- media tile;
- distinct instrument/position;
- interactive preview.

Bad reasons:
- “this is another section.”

Use typography, whitespace, baseline alignment, dividers, imagery and controlled contrast for ordinary hierarchy.

## 5.2 Establish surface archetypes

Thryftverse should have a small number of authored surface archetypes:

1. **Media field** — edge-to-edge image/video.
2. **Editorial stream** — media + sparse text.
3. **Market tape** — dense, aligned, numeric.
4. **Commerce dossier** — structured factual blocks.
5. **Conversation** — human identity + bubbles/events.
6. **Workbench** — creation/editing controls.
7. **Settings list** — flat rows and section labels.
8. **Portfolio/position** — restrained data visualization.

Do not let each screen invent a ninth grammar.

## 5.3 Radius discipline

Use radius as semantic grammar, not decoration.

Recommended:
- full media: 0–8;
- compact thumbnails: 8–12;
- sheets: platform-native top radius;
- pills/chips: capsule;
- critical trade/checkout panels: limited radius;
- settings: flat.

If everything is 16–24 px rounded, nothing feels authored.

## 5.4 Typography

You need three typographic modes:

- **Editorial / identity:** expressive but restrained.
- **Commerce:** highly legible product and seller facts.
- **Market:** tabular numerals and compact alignment.

Use tabular figures for:
- prices;
- percentages;
- quantities;
- bids/asks;
- returns;
- portfolio values;
- countdowns.

## 5.5 Motion

The motion language should communicate state, not decorate it.

Use:
- shared-element feeling between tile → detail where practical;
- spring for direct manipulation;
- short ease for system state;
- skeletons only when layout is genuinely known;
- content-preserving transitions on refresh;
- haptics for bid/offer/position actions;
- reduced-motion mode.

Never animate:
- critical financial numbers in a way that makes them hard to verify;
- buttons before server authority exists;
- fake success before final state.

---

# 6. What the supplied visual references imply

The supplied reference set spans Depop settings/editing, Pinterest discovery, Instagram profiles/collections/inbox, LinkedIn identity structure and eBay/retail product detail.

The useful lesson is not copying each screen. It is the **density and hierarchy discipline**.

## 6.1 Settings

The Depop/Instagram references use:

- flat full-width rows;
- strong section titles;
- thin separators;
- minimal iconography;
- clear destructive placement;
- little decorative chrome.

Thryftverse settings should not become a control-panel dashboard.

### Upgrade
Create:
- Account & identity
- Privacy & safety
- Buying
- Selling
- Payments & wallet
- Notifications
- Appearance & accessibility
- Data & legal
- Help

Use search if the total destination count stays high.

## 6.2 Profile

References show:
- identity first;
- stats second;
- primary CTA;
- media immediately after.

Thryftverse profile should add marketplace-specific evidence without making the header huge:

- seller trust;
- response behavior;
- completed sales;
- verified status;
- location where appropriate;
- store policies;
- social follow state.

Do not put every badge in the hero.

## 6.3 Saved / Closet / collections

Pinterest/Instagram references show collections as **visual objects**, not database folders.

Upgrade:
- large board covers;
- collaborative/secret status;
- live item count;
- price-drop state;
- unavailable-item treatment;
- collection sharing;
- “shop this board” retrieval;
- long-press organization;
- visual similarity from an item inside a board.

## 6.4 Inbox

Instagram's strength is fast identity recognition.

Thryftverse can outperform it for commerce by making the inbox context-aware:

- avatar + seller identity;
- item thumbnail;
- offer/order status;
- unread;
- action-required state;
- trust alert;
- system transaction event;
- conversation type.

Avoid turning every row into a mini order card.

## 6.5 Product detail

The eBay/retail references prioritize:
- product media;
- identity/title;
- price;
- purchase action;
- condition;
- delivery;
- seller;
- description/specs;
- related inventory.

Thryftverse should retain this conventional clarity even when it adds social and market context.

The product page must answer in seconds:

1. What exactly is it?
2. What condition?
3. Is it authentic?
4. What do I pay in total?
5. When/how will I receive it?
6. Can I return it?
7. Why should I trust the seller?
8. Is the price sensible?
9. Can I offer/bid/co-own?
10. What happens if something goes wrong?

---

# 7. Navigation and information architecture

The product breadth is now large enough that navigation entropy is a real risk.

## Recommended primary model

Bottom navigation should stay limited to five stable destinations.

A sensible model:

- **Home**
- **Discover**
- **Create / Sell**
- **Inbox / Activity**
- **Profile**

Co‑Own should either:
- be a first-class segment inside Discover/Markets, or
- become a primary tab only if usage proves it deserves that permanent slot.

Do not use primary navigation as an org chart of backend departments.

## Deep-link contract

Every major entity needs a canonical route:

- listing;
- look;
- seller/profile;
- collection;
- conversation;
- order;
- offer;
- live show;
- Co‑Own asset;
- Co‑Own order;
- ownership position;
- corporate action;
- dispute.

Each entity route needs:
- cold-start handling;
- deleted/unavailable state;
- blocked-user state;
- age/region restriction state;
- auth transition;
- back-stack semantics.

---

# 8. Home / feed

A flagship feed is a ranking product, not a scrolling API.

## 8.1 Required candidate sources

Build explicit candidate-source ownership:

- follow graph;
- recent engagement;
- item-to-item similarity;
- visual similarity;
- semantic text similarity;
- seller affinity;
- category affinity;
- trending;
- local/ship-to-user compatibility;
- saved-collection affinity;
- price-band affinity;
- live now;
- new sellers exploration;
- editorial;
- re-engagement inventory;
- Co‑Own/watchlist movement if appropriate.

The current recommendation implementation explicitly records a single source, `recent_sql_keyset`, and comments that there is **no separate retrieval stage yet**. That is one of the clearest remaining gaps between the current app and Instagram/Pinterest-class recommendation infrastructure.

## 8.2 Two-stage ranking

Target:

`retrieval → eligibility → dedupe → policy → ML rerank → diversity → business constraints → safety → pagination`

Do not ask one model to do everything.

### Retrieval
High recall, cheap:
- ANN vectors;
- inverted index;
- graph candidates;
- co-visitation;
- trending;
- content similarity.

### Rerank
More expensive:
- user-item features;
- sequence/intent features;
- seller quality;
- inventory freshness;
- shipping fit;
- predicted save/detail/offer/purchase;
- negative feedback.

## 8.3 Diversity

A social marketplace feed can become unusable if the ranker maximizes short-term CTR.

Apply explicit controls:
- seller caps;
- near-duplicate image caps;
- category diversity;
- price-band diversity;
- new inventory exploration;
- representation of followed sellers;
- availability filtering.

## 8.4 Negative intent

The current recommendation route has good signs:
- `not_interested`;
- `show_fewer`;
- report signals;
- seller/brand/category directives;
- intent-version/cache invalidation.

Keep this, but add evaluation proving negative intent changes the next sessions.

---

# 9. Discover / Pinterest-grade exploration

Pinterest is the most relevant design benchmark for visual commercial discovery.

Current Pinterest supports object-level visual search and similar/shoppable results based on a selected region of an image. Thryftverse should aim beyond a conventional masonry listing wall.

## Required Discover architecture

### Entry
- visual search;
- text search;
- camera;
- category;
- trends;
- boards/Looks;
- creators/sellers;
- live;
- Co‑Own / market.

### Grid
True variable-height masonry for editorial exploration.

But do not use masonry everywhere.

For price comparison:
- standardized ratio;
- visible price;
- condition;
- seller quality;
- availability.

Use editorial masonry for inspiration and a commerce grid for decision-making.

## Visual-search target

1. user selects/crops object;
2. object segmentation/region embedding;
3. visual embedding retrieval;
4. text/attribute fusion;
5. inventory filters;
6. rerank by size/condition/price/shipping;
7. similar-looking results;
8. “same item” confidence separated from “similar style.”

That is far above color-histogram similarity.

---

# 10. Search: current production risk

The repository's own `backend/api/docs/SEARCH_MIGRATION.md` states:

- default search is an in-process `Map`-based inverted index;
- it is rebuilt at startup;
- it is process-local;
- it is not shared across instances;
- it has no persistence;
- production Meilisearch is optional;
- if Meilisearch cannot be used, operations transparently fall back to memory;
- Elasticsearch is still a stub;
- the benchmark harness is described as follow-up work.

This is acceptable for local development.

It is **not** the desired contract for a scaled marketplace.

## 10.1 Why silent fallback is dangerous

If you have three API replicas and one silently falls back to its local index:

- users can see different results between requests;
- new listings may appear/disappear;
- search availability can look “healthy” while correctness is degraded;
- debugging becomes difficult;
- ranking experiments are polluted;
- deleted/restricted inventory can linger if invalidation is inconsistent.

## Required production behavior

For production:
- a shared durable search service is mandatory;
- health exposes index mode;
- API startup should fail or become explicitly degraded if production search is unavailable;
- no transparent “looks fine” local fallback;
- index version visible;
- event lag visible;
- dead-letter handling;
- full reindex operation;
- alias/swap for schema changes;
- search result filtering against authoritative current inventory.

## Search product features required

- typo tolerance;
- multilingual normalization;
- synonyms;
- brand aliases;
- category-aware facets;
- range filters;
- size normalization;
- condition normalization;
- sold/unavailable policy;
- query suggestions;
- recent searches;
- trending;
- seller search;
- collection/Look search;
- voice query;
- visual query;
- semantic fallback;
- zero-result recovery;
- query understanding;
- safe-search/moderation;
- explainable filters.

---

# 11. Product Detail Page (PDP)

This is where marketplace trust is won.

## 11.1 Above the fold

Required:
- dominant media;
- title;
- brand/model;
- condition;
- price;
- total landed-price preview;
- Buy now / Make offer / Bid depending on listing type;
- seller identity;
- protection/authentication state.

Avoid eight equal buttons.

Primary:
**Buy now**

Secondary:
**Make offer**

Tertiary:
save/share/message.

## 11.2 Media

- pinch zoom;
- double-tap behavior consistent with save/like policy;
- video;
- image count;
- damage-detail images;
- full-screen;
- accessible descriptions;
- progressive variants;
- blurhash/placeholder;
- EXIF-correct dimensions;
- media moderation status;
- no layout jump.

## 11.3 Condition

eBay demonstrates why category-specific condition matters.

Implement:
- canonical condition;
- category-specific condition facets;
- seller notes;
- defects;
- missing accessories;
- repair/alteration;
- authenticity documentation;
- photos required for certain condition claims.

For high-value goods, use structured condition evidence rather than a single “Good” chip.

## 11.4 Item specifics

eBay uses category-dependent item specifics because they improve both buyer certainty and search visibility.

Thryftverse needs schema-driven attributes:
- fashion: size, fit, measurements, material, color, season;
- sneakers: model, style code, size system, box/accessories;
- bags: dimensions, material, hardware, serial/provenance;
- electronics: model, storage, battery health, carrier, included accessories;
- collectibles: edition, grading, serial, provenance.

## 11.5 Market context

This is a place to outperform Depop:

- recent sold range;
- same-model active asks;
- scarcity;
- price history;
- seller's price vs comparable range;
- offer activity;
- watch/save activity only where privacy permits.

Label estimates clearly.

## 11.6 Trust

Put facts before marketing:
- seller rating;
- account age;
- sales;
- fulfillment;
- verified identity;
- authentication eligibility;
- return policy;
- buyer protection;
- shipping estimate.

---

# 12. Listing creation and seller tools

Flagship seller UX must optimize **time to accurate listing**, not merely form completion.

## 12.1 Creation path

Target flow:

`media → identify item → condition → specifics → price → fulfillment → review → publish`

Auto-suggest:
- category;
- brand;
- model;
- color;
- condition cues;
- price range.

Human confirms all material claims.

## 12.2 Media quality

- photo quality warning;
- blur detection;
- duplicate image detection;
- background assistance;
- crop suggestions;
- sensitive data detection;
- counterfeit-risk cues;
- serial-number privacy policy;
- damage coverage prompts.

## 12.3 Pricing assistance

Price assistant should show:
- sold comps;
- active comps;
- confidence;
- sample size;
- condition adjustment;
- fees;
- expected net proceeds.

Never state one magic AI price with fake precision.

## 12.4 Inventory management

Seller Hub needs:
- drafts;
- active;
- offers;
- low-performing;
- sold;
- shipping due;
- returns/disputes;
- promoted;
- out of stock;
- hidden/restricted;
- import batches.

Bulk:
- price update;
- discount;
- shipping;
- deactivate;
- relist;
- offer to likers;
- export.

Depop already exposes bulk discounting and seller-driven offers; those are table stakes.

---

# 13. Offers

Recent branch work substantially improves offers, but the complete contract should be tested as a state machine.

## Canonical offer states

- draft;
- submitted;
- viewed;
- countered;
- accepted;
- declined;
- withdrawn;
- expired;
- checkout_reserved;
- converted;
- reservation_expired;
- listing_sold_elsewhere;
- seller_restricted;
- buyer_restricted;
- invalidated_by_listing_change.

## Required invariants

- one acceptance cannot create multiple orders;
- accepting after item sold fails;
- counter invalidates correct prior executable action;
- idempotent replay returns same result;
- expiry is server-owned;
- client clock never decides validity;
- listing material changes invalidate/refresh offer;
- buyer and seller receive consistent realtime updates;
- notification failure does not roll back offer truth;
- checkout reservation has explicit expiry;
- Smart Sell uses same authoritative acceptance path.

## UX

Depop makes offers discoverable in Inbox. Keep that, but Thryftverse can improve it with:
- timeline;
- shipping-total preview;
- expires timestamp;
- seller net;
- counter action;
- direct checkout.

---

# 14. Checkout

## 14.1 Quote model

Create a signed/versioned server quote containing:
- item subtotal;
- shipping;
- platform fee;
- tax/VAT;
- duties estimate where appropriate;
- discounts;
- wallet credit;
- authentication fee;
- total;
- currency;
- expiration.

Client displays the quote. Client does not calculate authoritative totals.

## 14.2 Payment correctness

Must survive:
- tap twice;
- app killed after payment submit;
- network loss after provider authorization;
- webhook before API response;
- webhook duplicate;
- webhook out of order;
- provider timeout;
- SCA challenge;
- card decline;
- partial refund;
- full refund;
- dispute;
- chargeback;
- seller paid before refund.

Stripe explicitly recommends idempotency for safely retrying write operations, but provider idempotency does not make your entire order saga idempotent. Your internal order, ledger and reservation transitions must also be replay-safe.

## 14.3 Unique-item race

This is a P0 marketplace test.

Two users:
1. both load active item;
2. both begin checkout;
3. both authorize payment close together.

Exactly one owns the item.

Loser:
- no order;
- payment void/refund path;
- clear message;
- no temporary phantom purchase.

Use row locking/reservation state and provider reconciliation.

---

# 15. Orders / shipping / fulfillment

Required timeline:
- paid;
- seller preparing;
- shipped;
- carrier accepted;
- in transit;
- delivered;
- buyer-protection window;
- completed;
- return/dispute branch.

Seller:
- shipping deadline;
- label;
- package guidance;
- authentication routing;
- tracking;
- failed pickup;
- late warning.

Buyer:
- tracking;
- delivery exception;
- report issue;
- wrong item;
- not as described;
- counterfeit;
- missing item.

Do not model everything as one `status` string. Use events + projections.

---

# 16. Returns, refunds, disputes and protection

This is where eBay, Depop and Whatnot have years of operational maturity.

## Required case model

A case should contain:
- reason code;
- evidence;
- buyer narrative;
- seller response;
- timestamps/SLA;
- current owner;
- order snapshot;
- item/listing snapshot;
- shipping evidence;
- moderation/authentication evidence;
- proposed resolution;
- final resolution;
- appeal;
- ledger/refund references.

## Reason taxonomy

- item not received;
- item damaged;
- significantly not as described;
- counterfeit;
- wrong item;
- missing accessory;
- unauthorized transaction;
- return abuse;
- seller shipping failure.

## Operations

You need an ops console that lets authorized staff:
- inspect evidence;
- freeze payouts where policy allows;
- issue/refuse refund;
- request additional evidence;
- contact party;
- escalate authentication;
- record reasoned decision;
- audit every action.

---

# 17. Authenticity and high-value goods

eBay and StockX make authentication a visible product feature, not merely an internal fraud score.

Thryftverse should define tiers:

### Tier 0 — ordinary listing
Seller attestation + buyer protection.

### Tier 1 — identity-verified seller
Seller verification badge, risk checks.

### Tier 2 — document-backed authenticity
Receipt/certificate/provenance evidence.

### Tier 3 — expert/partner authentication
Physical or recognized third-party verification.

### Tier 4 — managed custody
For Co‑Own/high-value assets where the platform or custodian controls the physical asset.

Every badge must have:
- owner;
- meaning;
- evidence;
- expiration;
- revocation behavior.

Never use a generic “verified” badge for five different concepts.

---

# 18. Messaging and Inbox

Recent commits add meaningful privacy, moderation and realtime improvements.

The correct next bar is operational consistency.

## 18.1 Message model

Support message types explicitly:
- text;
- image;
- video;
- voice;
- document;
- listing share;
- offer;
- order event;
- system trust event;
- poll if retained.

Do not overload arbitrary JSON metadata without schema/version ownership.

## 18.2 Delivery semantics

Track:
- local pending;
- server accepted;
- delivered;
- read.

For failed sends:
- retry;
- cancel;
- terminal failure.

No silent disappearance.

## 18.3 Safety

- scam-link detection;
- off-platform payment warning;
- phone/email leak warning if policy requires;
- block;
- report;
- mute;
- message-level report;
- attachment malware checks;
- image moderation;
- seller/buyer transaction context.

Whatnot explicitly warns about off-platform-payment scams. Commerce messaging requires different safety controls from ordinary social chat.

## 18.4 Encryption language

Do not market server-side encrypted storage as end-to-end encryption.

Real E2EE requires:
- client-held key material;
- per-device identity;
- membership key rotation;
- recovery;
- attachment encryption;
- backup model;
- moderation implications.

If you do not intend to build that, say:
“encrypted in transit and at rest.”

---

# 19. Live commerce

Whatnot is a more relevant benchmark than Instagram for live transaction mechanics.

## Required live-show contract

- scheduled;
- live;
- ended;
- cancelled.

Lot:
- queued;
- preview;
- open;
- extended;
- closed;
- won;
- no-sale;
- settled;
- failed settlement.

## Critical properties

- server clock;
- deterministic bid ordering;
- anti-snipe policy;
- reconnect snapshot;
- viewer count approximate and non-authoritative;
- chat backpressure;
- moderation;
- pinned lot;
- actual item identity;
- winner checkout;
- seller settlement;
- replay-safe close.

## Product quality

Whatnot's differentiation is human trust:
- seller shows item;
- buyer asks live;
- public reputation.

Thryftverse should not make live shopping look like a finance terminal.

Keep:
- large video;
- seller;
- current lot;
- price/bid action;
- chat/activity.

Everything else can collapse.

---

# 20. Co‑Own: product-level truth

This is the most differentiated and highest-risk department.

The current repository is substantially more sophisticated than earlier versions, including ownership, orders, corporate actions, distributions, market-state concepts and explicit authority boundaries.

But the branch itself documents two backend gaps as **not implemented**:

1. Co‑Own price-alert settlement-event evaluator and delivery consumer.
2. DRIP distribution-to-reinvestment execution consumer.

The UI currently mitigates this honestly, which is better than faking behavior.

That still means the department is not “100% built.”

---

# 21. Co‑Own economic model: define what the user legally owns

Before scaling, every Co‑Own asset must answer:

- What legal interest does a unit represent?
- Who owns the physical object?
- Who holds title?
- Is there an SPV?
- Is the user a beneficial owner, contractual claimant, member, token holder or something else?
- Who has custody?
- What if Thryftverse fails?
- What if the custodian fails?
- Can a user transfer ownership outside the platform?
- What happens on theft/destruction?
- What happens on insurance payout?
- Who decides sale of the underlying asset?
- Are distributions expected?
- Are users being invited to expect profit from someone else's management?

These answers affect whether the product is treated as ordinary shared ownership, a security, collective investment arrangement, payment/e-money activity or another regulated structure.

The FCA warns that pooled investments can become collective-investment arrangements in circumstances that users may not intuitively recognize. Fractional-share guidance also emphasizes transferability, execution and fee transparency.

**This report is not legal advice. Obtain UK financial-services counsel before public launch.**

---

# 22. Co‑Own ledger and ownership model

Use a **double-entry economic ledger** plus a separate ownership sub-ledger.

Do not infer ownership from:
- successful payments;
- order history;
- sum of trades on client;
- mutable position row alone.

## 22.1 Required ownership events

- issuance;
- allocation;
- purchase settlement;
- sale settlement;
- cancellation;
- transfer;
- corporate action;
- split/consolidation if supported;
- buyout;
- redemption;
- write-off;
- correction.

Every event needs:
- immutable ID;
- asset;
- account;
- units;
- price where applicable;
- event source;
- actor;
- timestamp;
- idempotency key;
- related order/execution;
- prior/new version where useful.

## 22.2 Invariants

For each asset:

`issued units = treasury/custodian units + sum(all holder units)`

At all times.

For each matched trade:

`buyer unit delta + seller unit delta = 0`

For cash legs:

`debits = credits`

Settlement must update cash and ownership atomically or through a saga that cannot expose final ownership before cash finality.

## 22.3 Reservation

Sell orders reserve units.

A user with 10 units cannot:
- place two concurrent sell orders for 10;
- transfer reserved units;
- vote twice through stale snapshots.

Use server locks / serializable logic or equivalent invariant enforcement.

---

# 23. Co‑Own order book

If the product presents itself as a market, market-state honesty is essential.

## Required order fields

- order ID;
- asset ID;
- account ID;
- side;
- order type;
- quantity;
- remaining quantity;
- limit price;
- protection price for protected market order;
- time in force;
- created;
- accepted;
- canceled/expired;
- sequence number.

## Matching

Define:
- price priority;
- time priority;
- self-trade policy;
- partial fill;
- minimum lot;
- tick size;
- stale quote behavior;
- halt state;
- insufficient balance;
- insufficient free units.

## Market order caution

For illiquid fractional assets, a literal market order can be dangerous.

Prefer:
- marketable limit;
- protected market;
- explicit slippage cap.

The repository already contains protected-market concepts; keep this direction.

## UX

Before confirm show:
- side;
- units;
- expected average price;
- worst allowed price;
- fee;
- total;
- quote timestamp;
- liquidity warning;
- settlement model.

---

# 24. Co‑Own market data

Broker-like presentation creates broker-like user expectations.

Separate:

- **last trade**
- **best bid**
- **best ask**
- **mid**
- **indicative valuation**
- **underlying appraisal**
- **NAV-like estimate if applicable**

Never display one of those as “price” without qualification.

## Staleness

Every quote:
- `asOf`;
- source;
- market state.

UI states:
- live;
- delayed;
- stale;
- unavailable;
- halted;
- no liquidity.

---

# 25. Co‑Own corporate actions

The repository has governance/voting work. Complete the full lifecycle.

Action:
- announced;
- record date;
- voting opens;
- voting closes;
- passed/failed;
- executed;
- distribution/settlement;
- archived.

Examples:
- underlying sale;
- maintenance spend;
- insurance event;
- custody change;
- fee change;
- buyout offer;
- voting-rule change where legally permitted.

Eligibility must be a record-date snapshot, not current position at voting time.

---

# 26. Distributions and DRIP

Distribution flow:

1. corporate/distribution event declared;
2. record-date entitlement frozen;
3. gross amount known;
4. fees/withholding calculated;
5. payable date;
6. cash ledger credit;
7. receipt;
8. reconciliation.

DRIP adds:
9. enrollment snapshot;
10. purchase eligibility;
11. execution;
12. ownership settlement;
13. residual cash;
14. receipt.

The current branch lacks the DRIP execution consumer. Do not market DRIP as working until a replay-safe distribution event can produce exactly one purchase-or-cash outcome.

---

# 27. Co‑Own price alerts

The current branch stores alerts but does not have a Co‑Own settlement-event evaluator/delivery consumer.

Required:

`settled execution → last-trade update → alert crossing evaluation → dedupe → notification outbox → delivery → outcome`

Use crossing semantics, not `price >= threshold` every poll, otherwise users receive repeated notifications.

Persist:
- triggering execution;
- before/after price;
- threshold;
- direction;
- notification outcome.

---

# 28. Co‑Own surveillance / market integrity

If users can trade units, add market surveillance even at low volume.

Signals:
- self-trade;
- wash-trade patterns;
- coordinated accounts;
- spoofing-like place/cancel patterns;
- price manipulation near valuation events;
- suspicious account graph;
- repeated failed settlement;
- account takeover;
- insider/related-party activity if relevant.

Do not let an ML model autonomously confiscate ownership or final-settle fraud decisions.

Your existing “ML advisory, deterministic/human authority” philosophy is correct.

---

# 29. Wallet / 1ZE

The branch's authority-boundary document currently describes a deterministic at-par 1ZE model tied to USD, with bounded fees. That is materially different from earlier project ideas that treated 1ZE as an internal reference around ₹1000; product, legal and accounting documentation must use exactly one current model.

## Required principles

- wallet balance is projection of ledger;
- ledger immutable;
- no `UPDATE balance = balance + ...` without journal;
- idempotency on every money mutation;
- provider references;
- reconciliation;
- pending vs available;
- reserve/hold;
- refunds and reversals;
- negative balance policy;
- currency precision.

If users can load money and withdraw money, conduct payments/e-money regulatory analysis in each target jurisdiction.

---

# 30. Payments and Stripe

The repository now has good signs:
- provider webhooks;
- idempotency;
- deterministic authority;
- payout controls;
- KYC-provider authority;
- reconciliation concepts.

But production proof must include Stripe-specific economics.

Stripe Connect documentation makes clear that responsibility for refunds, chargebacks and negative balances depends on the charge/account model.

Document:
- direct vs destination vs separate charges/transfers;
- merchant of record;
- fee liability;
- chargeback liability;
- negative balance liability;
- refund-after-transfer behavior;
- transfer reversal;
- payout timing;
- reserves.

Never treat “Stripe integrated” as “marketplace settlement solved.”

---

# 31. Marketplace accounting

Create three ledgers/projections conceptually:

1. **provider money** — what Stripe/bank says;
2. **platform economic ledger** — obligations between buyer/platform/seller;
3. **business accounting** — revenue, fees, tax, receivables.

Reconciliation checks:
- charge exists internally and externally;
- amount/currency match;
- payment state;
- transfer state;
- payout state;
- refund state;
- dispute state;
- ledger balanced.

Run:
- continuous event reconciliation;
- daily aggregate;
- period close.

---

# 32. Fraud and risk

A flagship marketplace needs layered risk.

## Account
- device;
- IP/network;
- velocity;
- breached credentials;
- MFA/passkeys;
- recovery anomalies.

## Seller
- KYC;
- linked identities;
- listing spikes;
- counterfeit categories;
- fulfillment defects;
- chargebacks;
- policy history.

## Buyer
- stolen card;
- refund abuse;
- account farming;
- promotion abuse;
- delivery manipulation.

## Transaction
- amount anomaly;
- new account high value;
- device mismatch;
- shipping mismatch;
- rapid resell;
- suspicious graph.

ML can score. Deterministic/human policy should own severe outcomes.

---

# 33. Trust & Safety / UGC

Apple requires UGC apps to provide:
- objectionable-content filtering;
- reporting;
- blocking;
- reachable contact information.

Google likewise requires robust ongoing UGC moderation, reporting and blocking.

This is not optional polish.

## Content classes to moderate

- listing title/description;
- profile;
- comments;
- Looks/posts;
- messages;
- live chat;
- images;
- video;
- audio;
- documents;
- links;
- usernames.

## Moderation state

Use explicit states:
- allowed;
- limited;
- quarantined;
- pending review;
- removed;
- appealed;
- reinstated.

## Operations

Metrics:
- report volume;
- first response;
- resolution time;
- false positive;
- appeal overturn;
- repeat offender;
- child-safety escalation;
- counterfeit rate.

---

# 34. Counterfeit strategy

Competitors prove that luxury resale requires visible authenticity operations.

Required:
- category risk;
- seller verification;
- evidence request;
- brand/model anomaly;
- image duplicate/fake detection;
- serial/provenance handling;
- partner/manual verification;
- return re-authentication for high-value items;
- appeal.

Avoid a black-box “AI authenticity score” shown to users.

---

# 35. Recommendation / ML audit

The ML department has improved instrumentation, but it is not yet at Instagram/Pinterest retrieval maturity.

## 35.1 Current code evidence

The current `recommendations.ts` uses:
- `recommendation-heuristic-v2.0`;
- a decision service;
- explicit capability metadata (`heuristic_baseline` vs `trained_model`);
- impression logging;
- negative-intent controls;
- exploration metadata;
- cold-start flag;
- reason codes;
- policy versioning.

These are good foundations.

However, the code comments say the current baseline retrieves candidates from a single recent-listing SQL keyset and has **no separate retrieval stage yet**.

That is the most important gap.

## 35.2 Next architecture

Candidate generation:
- collaborative co-visitation;
- user embedding;
- item embedding;
- seller affinity;
- visual embedding;
- semantic text embedding;
- follow graph;
- trending;
- recent.

Reranker:
- LightGBM/XGBoost as strong practical baseline;
- deep ranker only if data volume supports it;
- session intent;
- sequence features;
- availability;
- shipping;
- seller quality;
- price affinity;
- diversity.

## 35.3 Model registry

Every deployed model:
- model ID;
- feature schema;
- training window;
- data snapshot;
- metrics;
- owner;
- approval;
- artifact hash;
- rollout percentage;
- rollback model;
- known limitations.

## 35.4 Offline evaluation

Ranking:
- NDCG;
- recall@K;
- MAP where useful;
- calibration;
- diversity;
- seller concentration;
- unavailable inventory;
- cold-start.

Business:
- qualified detail;
- save;
- offer;
- purchase;
- return;
- complaint;
- long-term retention.

Safety:
- harmful-content exposure;
- counterfeit exposure;
- restricted-seller exposure.

## 35.5 Online experiments

Experiment unit:
- user/session.

Log:
- assignment;
- candidate set;
- score;
- rank;
- policy;
- exposure;
- downstream event.

Use guardrails:
- crash;
- latency;
- return rate;
- complaint;
- seller concentration;
- conversion;
- revenue.

---

# 36. Visual search ML

Pinterest's current object/region visual-search experience raises the bar.

Build:

1. image moderation;
2. image embedding;
3. object/region detection;
4. selected-region embedding;
5. ANN index;
6. text/attribute fusion;
7. inventory filter;
8. rerank;
9. explainable refinements.

Potential models/services:
- CLIP/SigLIP-like embeddings;
- fashion-specific embedding fine-tuning;
- segmentation;
- attribute classifiers.

Use merchant/catalog truth to correct model output.

---

# 37. Price intelligence

Useful ML:
- sold-comparable retrieval;
- condition-normalized price;
- demand;
- liquidity;
- time-to-sell.

Output:
- range;
- confidence;
- sample count;
- explanation.

Do not:
- manipulate the market price;
- silently nudge Co‑Own prices;
- present valuation as guaranteed return.

---

# 38. AI agents

The branch contains AI-agent hardening work around:
- quotas;
- real conversations;
- provider credentials;
- approvals;
- stale runs;
- encryption key;
- SSRF guards.

Treat AI agents as a separate security domain.

Required:
- strict tool allowlists;
- object-level authorization on every tool call;
- approval for money/account changes;
- prompt-injection-resistant data handling;
- redaction;
- audit;
- cost quotas;
- model/version logging;
- no secrets in model context;
- no direct SQL;
- kill switch.

---

# 39. Search/recommendation privacy

Personalization should support:
- “why this?”;
- not interested;
- show fewer;
- reset personalization;
- clear history;
- non-personalized mode where required;
- ad separation;
- sensitive-attribute policy.

EU DSA obligations can include recommender transparency for covered services and marketplace trader traceability requirements.

Plan this into data structures now.

---

# 40. Data architecture

## Primary stores

### PostgreSQL
Authoritative transactional state.

### Redis
Cache, ephemeral coordination, rate limit, queues where appropriate.

### Object storage
Media originals/variants.

### Search
Durable shared index.

### Analytics
Columnar/event warehouse at scale.

### Vector
Use a dedicated vector index only when measured need justifies it; pgvector can be a practical initial step.

## Event outbox

For any transaction that must produce async effects:
- commit domain mutation + outbox row in same DB transaction;
- worker publishes/executes;
- mark delivered;
- replay safely.

Use for:
- notifications;
- search indexing;
- analytics;
- recommendation signals;
- settlement side-effects;
- price alerts.

---

# 41. Database migration discipline

There are hundreds of migrations. That is normal at this stage but requires discipline.

Required:
- monotonic naming;
- checksum;
- one-way production migration policy;
- backfill separate from schema when heavy;
- online index creation;
- no long table locks;
- expansion/contraction pattern;
- migration CI against snapshot;
- rollback strategy;
- production migration observability.

Test:
- empty DB;
- recent production-like snapshot;
- previous release → new release.

---

# 42. API design

Standardize response envelope only where it adds value.

Every endpoint should have:
- request ID;
- typed error code;
- human-safe message;
- retryability;
- version/ETag for mutable objects where useful.

Mutations:
- idempotency key for consequential operations;
- optimistic concurrency/version;
- explicit conflict code.

Pagination:
- cursor, not offset for large mutable feeds;
- stable sort key;
- no duplicated/skipped rows under concurrent inserts.

---

# 43. Realtime

Realtime should be a projection, not authority.

Use websocket/SSE for:
- message;
- offer;
- order;
- live lot;
- market quote;
- notification.

Every event:
- event ID;
- entity version;
- timestamp;
- type;
- payload schema version.

Client:
- dedupe;
- detect gap;
- resync snapshot.

Do not assume realtime messages arrive once, in order, or at all.

---

# 44. Offline

Offline quality is a flagship differentiator only when honest.

Allow offline:
- browse cached;
- draft listing;
- draft Look;
- saved organization;
- compose message queue if semantics clear.

Do not allow client to “complete”:
- purchase;
- offer acceptance;
- bid;
- Co‑Own trade;
- withdrawal.

For uncertain network outcomes:
- “Checking status…”
- reconcile by idempotency key.

---

# 45. Media pipeline

A marketplace/media app needs a proper asset state machine:

`presigned → uploaded → verified → scanning → processing → moderation → ready → attached → published`

Failure:
- upload failed;
- processing failed;
- rejected;
- expired;
- quarantined.

Metadata:
- SHA-256;
- owner;
- MIME;
- bytes;
- width/height;
- duration;
- EXIF policy;
- blurhash;
- focal point;
- variants;
- moderation.

Use signed/CDN URLs.

---

# 46. Video

Instagram/Snapchat-grade video requires more than playback.

Server:
- resumable upload;
- transcode;
- H.264 baseline compatibility at minimum;
- adaptive delivery/HLS where appropriate;
- poster;
- orientation;
- audio loudness policy;
- moderation.

Client:
- preload next;
- pause offscreen;
- memory control;
- muted default depending surface;
- captions;
- playback error;
- data saver.

---

# 47. Creator / Looks

The Looks surface should be a commercial media primitive.

Each Look can contain:
- creator;
- caption;
- media;
- tagged listings;
- shoppable objects;
- saved state;
- comments;
- remix/inspiration linkage;
- disclosure;
- view/product-click metrics.

Avoid Instagram clone behavior that has no marketplace value.

Differentiation:
- tap garment → live inventory;
- similar item;
- price alternatives;
- seller trust;
- size availability;
- build/save outfit;
- buy bundle.

---

# 48. Poster / collage / moodboards

Recent moodboard work is directionally strong.

To become Pinterest-quality:
- free transform;
- snapping;
- layers;
- text;
- product cutouts;
- background removal;
- safe-area guides;
- video items;
- mixed sources;
- undo/redo;
- autosave;
- conflict handling;
- export;
- collaboration eventually.

Maintain the recent “honest sync” approach:
offline queue must expose failed/terminal operations, not silently appear saved.

---

# 49. Notifications

Use a unified notification event system.

Categories:
- social;
- commerce;
- transaction;
- seller task;
- live;
- Co‑Own;
- security;
- system.

Priority:
- security/order/payment cannot be buried under likes.

Features:
- dedupe;
- collapse;
- quiet hours;
- per-category control;
- transactional override policy;
- deep link;
- read state;
- push delivery outcome.

---

# 50. Profile / storefront

Profile has two jobs:
1. identity/social graph;
2. marketplace trust.

Keep public profile compact.

Storefront adds:
- announcement;
- policies;
- collections;
- active inventory;
- sold evidence;
- reviews;
- trust.

Do not duplicate profile and seller shop into parallel inconsistent entities.

---

# 51. Seller Hub

Seller Hub is a workbench, not a dashboard showcase.

Default prioritization:
- ship today;
- respond to offer;
- resolve case;
- listing issue;
- payout issue;
- restock/relist;
- opportunity.

Metrics should answer:
- what happened?
- why?
- what should I do?

Avoid 12 decorative KPI tiles.

---

# 52. Analytics

Define canonical business metrics.

Examples:
- GMV;
- net GMV;
- orders;
- AOV;
- conversion;
- sell-through;
- offer conversion;
- return rate;
- dispute rate;
- fulfillment SLA;
- seller response;
- repeat buyers.

Every metric:
- definition;
- source tables;
- timezone;
- refund semantics;
- currency;
- freshness.

Avoid client-computed “analytics.”

---

# 53. Accessibility

Flagship means usable at:
- larger text;
- VoiceOver;
- TalkBack;
- reduced motion;
- high contrast;
- one-handed use.

Requirements:
- 44pt-ish practical hit targets on iOS;
- correct roles/state;
- semantic headings;
- focus order;
- alt descriptions for commerce imagery where feasible;
- chart textual equivalent;
- tabular data accessible;
- no color-only state.

Co‑Own numeric/trading screens require particularly careful accessibility.

---

# 54. Performance budgets

Set budgets per surface.

## App
- cold start;
- warm start;
- JS bundle;
- memory;
- crash-free sessions.

## Feed
- first meaningful content;
- scroll dropped frames;
- image decode;
- blank cells.

## PDP
- hero media time;
- API latency;
- action responsiveness.

## Search
- typeahead latency;
- search p95;
- zero-result rate.

## Chat
- send-to-server;
- receive-to-render;
- reconnect.

Measure on mid-range Android, not only flagship iPhone.

---

# 55. Mobile security

Use OWASP MASVS as an explicit release checklist.

Cover:
- storage;
- cryptography;
- auth;
- network;
- platform interaction;
- code quality;
- resilience;
- privacy.

Particularly:
- token storage;
- screenshot policy for highly sensitive screens if needed;
- deep-link validation;
- clipboard;
- logs;
- WebView;
- cert pinning strategy;
- jailbreak/root signals only as risk input, not absolute truth.

---

# 56. Account security

Required:
- passkeys;
- MFA;
- session/device management;
- session revoke;
- login alert;
- protected-change hold;
- step-up auth for payout/security changes;
- recovery proof;
- OAuth reauth where needed.

The branch has recent hardening in this area. Maintain a single risk model across all entry points.

---

# 57. Privacy and data rights

Apple requires in-app account deletion for account-creating apps. Google Play requires both an in-app path and an external web deletion path, with associated-data deletion subject to legitimate retention.

Required:
- export;
- delete;
- retention schedule;
- legal hold;
- consent records;
- analytics consent;
- ad/personalization settings;
- data inventory;
- processor register;
- DPA process;
- deletion propagation.

Deletion must include:
- content;
- profile;
- messages where policy permits;
- media;
- social graph;
- device/session;
- ML features;
- search index;
- backups according to retention policy.

---

# 58. DSA / marketplace obligations

If operating in the EU, plan for Digital Services Act marketplace obligations such as:
- trader traceability;
- illegal-product reporting;
- transparency;
- recommender disclosure where applicable;
- buyer notification/redress when illegal goods are discovered.

Do not bolt this on later. Seller/trader identity and listing provenance should be first-class.

---

# 59. App Store / Play Store readiness

Apple UGC requirements and Google UGC requirements make these launch gates:

- report;
- block;
- content moderation;
- support contact;
- terms;
- privacy policy.

Also verify:
- account deletion;
- Sign in with Apple requirements if applicable;
- permission strings;
- photo/camera/mic purpose;
- privacy manifest;
- data safety;
- age rating;
- subscription/IAP policy if future digital content is monetized.

---

# 60. Ops console

A production marketplace needs excellent internal tools.

Areas:
- user;
- seller;
- listing;
- moderation;
- order;
- payment;
- payout;
- dispute;
- shipment;
- fraud;
- Co‑Own;
- wallet;
- live;
- audit.

Every operator action:
- reason;
- actor;
- before/after;
- timestamp;
- ticket/reference;
- permissions.

Use least privilege.

---

# 61. Support

Build support into the object being disputed.

From order:
“Get help with this purchase.”

From payment:
“Payment issue.”

From account:
“Security issue.”

Context should prefill:
- order;
- listing;
- user;
- transaction;
- tracking.

This is more effective than a generic chatbot.

---

# 62. Observability

## Metrics
- request rate/error/latency;
- DB pool;
- Redis;
- queues;
- media jobs;
- payment webhooks;
- reconciliation mismatch;
- search lag;
- realtime connections;
- push failures;
- moderation queue;
- Co‑Own settlement.

## Logs
Structured with:
- trace ID;
- user ID pseudonymized;
- entity IDs;
- event ID.

Never log secrets/payment data/message plaintext unnecessarily.

## Tracing
Trace:
`mobile → API → DB → provider → worker`

for critical flows.

---

# 63. SLOs

Define actual service objectives.

Example starting targets:

| Journey | Target |
|---|---|
| API availability | 99.9% beta, improve with scale |
| checkout create | ≥99.9% excluding provider declines |
| payment reconciliation | 100% eventually |
| message accepted | ≥99.95% |
| search | ≥99.9% |
| feed | ≥99.9% |
| ownership ledger balance invariant | **100%** |
| double sale of unique listing | **0 tolerated** |
| double-spend Co‑Own units | **0 tolerated** |

Financial invariants are not SLO percentages; they are absolute correctness conditions.

---

# 64. Disaster recovery

Have:
- encrypted backups;
- PITR;
- restore test;
- RPO;
- RTO;
- Redis rebuild plan;
- search reindex;
- object-storage versioning;
- secrets backup/rotation.

Practice:
- DB loss;
- search loss;
- Redis loss;
- payment webhook outage;
- queue backlog;
- CDN failure.

---

# 65. Scaling model

Do not plan for “millions” abstractly.

Load-test scenarios:
- 1k concurrent feed users;
- 10k websocket connections;
- viral seller profile;
- 100 bids/sec on one lot;
- large notification fan-out;
- image-upload burst;
- search traffic spike;
- payout batch.

The hot row problem matters:
- one live lot;
- one unique listing;
- one Co‑Own order book.

Use targeted locking/partitioning rather than general horizontal scaling slogans.

---

# 66. Competitor cross-comparison

## 66.1 eBay

### Strengths
- deep listing taxonomy;
- category-specific condition;
- item specifics;
- massive seller operations;
- returns/disputes;
- authentication for high-value categories;
- buyer/seller protections.

### Thryftverse advantage opportunity
- better mobile visual discovery;
- social identity;
- Looks;
- modern chat;
- cleaner seller experience;
- integrated market context.

### Gap
Operational trust and catalog depth remain far behind eBay.

---

## 66.2 Depop

### Strengths
- simple social resale;
- offers integrated with Inbox;
- seller offers;
- buyer protection;
- culturally legible UX.

### Thryftverse opportunity
You already have a much more ambitious commerce/trading architecture.

Win by:
- keeping Depop's simplicity;
- adding better discovery;
- better seller tools;
- better trust;
- proper market intelligence.

### Risk
Becoming “Depop with 4x more controls.”

---

## 66.3 StockX

### Strengths
- bid/ask mental model;
- transparent market;
- historical trades;
- authentication;
- standardized catalog.

### Thryftverse opportunity
Apply market intelligence to unique resale objects without forcing every item into commodity-market UX.

### Co‑Own relevance
StockX demonstrates that users understand:
- bid;
- ask;
- lowest ask;
- highest bid;
- last sale.

But Co‑Own is economically and legally more complex because the user may hold an ongoing ownership interest.

---

## 66.4 Pinterest

### Strengths
- inspiration-first discovery;
- visual search;
- boards;
- object-level search;
- commercial intent without feeling like a catalog.

### Thryftverse opportunity
Make every inspiration object transactable.

Biggest gap today:
retrieval, visual embeddings, object-level visual search and recommendation maturity.

---

## 66.5 Instagram

### Strengths
- creator identity;
- visual rhythm;
- messaging;
- interaction muscle memory;
- media composition.

### Thryftverse opportunity
Every media object can have commerce semantics.

Do not imitate:
- engagement clutter;
- controls irrelevant to trade.

---

## 66.6 Snapchat

### Strengths
- camera immediacy;
- gestures;
- playful low-latency creation;
- direct communication.

### Thryftverse opportunity
Make listing/Look creation feel camera-native.

Do not copy ephemeral behavior where transaction records need durability.

---

## 66.7 Whatnot

### Strengths
- live-human trust;
- seller verification;
- buyer protection;
- realtime commerce;
- category community.

### Thryftverse opportunity
Combine live human selling with persistent catalog, visual discovery and Co‑Own.

Gap:
Trust operations and live-market scale need more runtime proof.

---

# 67. Feature benchmark matrix

Legend:
- **Strong** = credible implementation direction
- **Partial** = exists but lacks depth/proof
- **Gap** = major work needed

| Capability | Thryftverse | Best benchmark | Required next move |
|---|---|---|---|
| Media-first feed | Strong/Partial | Instagram | native polish + ranking |
| Visual discovery | Partial | Pinterest | region/object embeddings |
| Text search | Partial | eBay/Pinterest | mandatory durable search backend |
| Item taxonomy | Partial | eBay | deeper category schemas |
| Condition | Partial | eBay | structured condition evidence |
| Offers | Strong | Depop/eBay | adversarial lifecycle tests |
| Authentication | Partial | eBay/StockX | operational tiers + partners |
| Buyer protection | Partial | eBay/Depop/Whatnot | case operations + evidence |
| Seller tools | Strong/Partial | eBay | bulk + task-first workflow |
| Messaging | Strong/Partial | Instagram/Depop | safety + delivery proof |
| Live commerce | Partial/Strong | Whatnot | scale/reconnect/moderation proof |
| Boards/collections | Strong/Partial | Pinterest | shoppable board intelligence |
| Creator Looks | Partial/Strong | Instagram | media polish + product tagging |
| Recommendation | Partial | Instagram/Pinterest | multi-source retrieval/rerank |
| Visual search ML | Gap/Partial | Pinterest | vector/object retrieval |
| Market data | Strong concept | StockX | freshness + surveillance |
| Co‑Own | Differentiated | no direct social-market analogue | legal + full execution closure |
| Wallet | Strong concept | fintech apps | regulation + reconciliation |
| Trust/safety | Partial/Strong | Whatnot/eBay | ops staffing + metrics |
| Release evidence | Partial | mature tech orgs | required green pipeline |
| Accessibility | Partial | platform leaders | device matrix |

---

# 68. P0 blockers before open public launch

These are not “nice to have.”

## P0-01 — Release candidate must be objectively green
Current exact HEAD has failed combined review status and no attached workflow runs.

**Acceptance**
- required GitHub checks pass on exact SHA;
- signed artifacts produced;
- release tag immutable.

## P0-02 — Protect main/release branch
**Acceptance**
- no direct production push;
- required review/checks.

## P0-03 — Mandatory production search service
**Acceptance**
- no silent in-memory fallback in production;
- shared index;
- health/index version;
- fail/degraded mode explicit.

## P0-04 — Co‑Own DRIP consumer
**Acceptance**
- one distribution → exactly one reinvest/cash outcome;
- replay safe;
- receipt.

## P0-05 — Co‑Own price alert consumer
**Acceptance**
- settled-trade events;
- crossing dedupe;
- push/in-app outcome.

## P0-06 — Co‑Own legal/regulatory architecture signoff
**Acceptance**
- documented ownership;
- custody;
- insolvency;
- transfer;
- investor/user rights;
- jurisdictional legal opinion.

## P0-07 — Unique-item double-sale proof
**Acceptance**
- concurrency test demonstrates one winner under race.

## P0-08 — Payment saga proof
**Acceptance**
- duplicate/out-of-order webhook suite;
- unknown outcome recovery;
- refund/dispute/transfer reversal.

## P0-09 — Ledger invariant suite
**Acceptance**
- double-entry balance always zero;
- ownership conservation.

## P0-10 — KYC/payout staging proof
**Acceptance**
- approved/rejected/expired;
- payout blocked until eligible;
- provider webhook signature.

## P0-11 — UGC store-policy compliance
**Acceptance**
- report/block/filter/contact;
- moderation SLA.

## P0-12 — Account deletion
**Acceptance**
- iOS in-app;
- Android in-app + external URL;
- deletion propagation.

## P0-13 — Signed device matrix
**Acceptance**
- iOS/Android real builds;
- camera;
- upload;
- checkout;
- chat;
- Co‑Own;
- deletion.

## P0-14 — Backup restore drill
**Acceptance**
- restore production-like DB;
- measured RPO/RTO.

## P0-15 — Security review
**Acceptance**
- OWASP MASVS mapping;
- API authz tests;
- dependency/secret scan;
- remediation.

---

# 69. P1 flagship-quality backlog

## Discovery / feed
- multi-source retrieval;
- vector index;
- semantic candidate source;
- visual candidate source;
- co-visitation;
- seller affinity;
- diversity;
- long-term quality guardrails;
- user explanation/control;
- experiment service.

## Search
- mandatory Meilisearch/OpenSearch/Elastic production service;
- typo tolerance;
- synonyms;
- multilingual;
- faceting;
- autocomplete;
- zero-result recovery;
- query analytics;
- search quality evaluation.

## PDP
- total landed price;
- structured condition;
- category item specifics;
- trust tier;
- authentication;
- sold comps;
- delivery certainty;
- return clarity;
- offer/bid context.

## Seller
- bulk management;
- offer-to-likers;
- net proceeds;
- shipping performance;
- case management;
- catalog import UI;
- listing health.

## Chat
- scam warnings;
- attachment security;
- delivery/read consistency;
- transaction event grammar;
- support escalation.

## Creator
- native export proof;
- captions;
- draft recovery;
- tagged object interaction;
- upload resilience.

## Profile / Closet
- store vs identity clarity;
- board covers;
- unavailable/sold state;
- collaborative/secret metadata if supported;
- shoppable collection retrieval.

## Co‑Own
- liquidity warnings;
- order-book correctness tests;
- market halt;
- surveillance;
- entitlement snapshots;
- disclosure versioning;
- fee transparency;
- distribution receipts;
- tax documents where required.

---

# 70. P2 depth backlog

These can follow a gated beta but are necessary for a true flagship trajectory.

- multi-region readiness;
- chaos tests;
- CDN failover;
- experimentation governance;
- personalization reset;
- seller cohort analytics;
- authenticity partner routing;
- advanced fraud graph;
- live show clipping;
- creator collaboration;
- moodboard collaboration;
- localized currencies;
- localized policy/returns;
- accessibility automation;
- performance regression CI;
- offline seller workflow;
- product schema service;
- feature store;
- model lineage UI;
- cost observability;
- trust transparency reports.

---

# 71. Screen-by-screen “minute detail” checklist

## Home
- no spinner blocking entire feed;
- skeleton dimensions match content;
- image aspect ratio stable;
- visible refresh state;
- dedupe repeated seller/item;
- stale indicator only when necessary;
- no empty hole on failed module;
- deep link works;
- scroll restoration;
- accessibility focus;
- reduced motion.

## Discover
- real masonry only for inspiration;
- price visible where purchase intent dominates;
- search persistent;
- camera/visual search;
- refine chips;
- no duplicate inventory;
- sold treatment;
- long press;
- save;
- hide/not interested.

## Search
- keyboard autofocus;
- recent searches;
- typo;
- clear;
- filter count;
- filter state persists;
- no-results suggestions;
- loading does not reset query;
- cancel stale request;
- query highlighted where useful.

## PDP
- hero ratio stable;
- safe-area;
- media counter;
- zoom;
- price;
- condition;
- seller;
- shipping;
- protection;
- total;
- CTA does not move;
- disabled CTA has reason;
- stale listing invalidates CTA;
- sold state;
- blocked seller state;
- report/share.

## Offer sheet
- current price;
- shipping/fee;
- min/max rules;
- expiry;
- inline errors;
- submit pending;
- idempotent retry;
- accepted status;
- counter chain.

## Checkout
- item thumbnail;
- address;
- shipping;
- payment;
- fee/tax;
- total;
- protection;
- submit exactly once;
- SCA;
- unknown outcome.

## Order
- timeline;
- tracking;
- seller;
- item;
- receipt;
- support;
- return/dispute;
- refund status.

## Inbox
- avatar;
- context;
- last message;
- time;
- unread;
- action state;
- search;
- filters;
- skeleton;
- offline.

## Chat
- optimistic send;
- pending;
- failed;
- retry;
- reply;
- media;
- listing share;
- offer event;
- block/report;
- keyboard safe area;
- scroll anchoring;
- pagination;
- read receipt.

## Profile
- avatar;
- username;
- trust;
- bio;
- stats;
- primary action;
- tabs;
- media;
- store policy access;
- report/block.

## Settings
- searchable;
- flat rows;
- clear hierarchy;
- security;
- privacy;
- notification;
- payment;
- delete;
- legal version.

## Co‑Own hub
- market state;
- portfolio entry;
- watchlist;
- alerts;
- positions;
- liquidity;
- risk;
- discovery rails.

## Co‑Own asset
- identity;
- underlying;
- ownership unit definition;
- last/bid/ask distinction;
- chart source;
- staleness;
- fees;
- custody;
- risk;
- order entry;
- governance;
- distributions;
- documents.

## Trade confirm
- buy/sell;
- units;
- quote;
- protection/slippage;
- fee;
- total;
- available balance/units;
- quote expiry;
- risk acknowledgment;
- biometric/step-up if policy.

---

# 72. Backend route/domain review checklist

Every consequential mutation should answer:

1. Who is authenticated?
2. Do they own/have permission for this object?
3. What version/state must the object currently be in?
4. What concurrency lock prevents races?
5. What idempotency key prevents replay?
6. What ledger/outbox rows are committed atomically?
7. What happens after timeout?
8. Can it be reconciled?
9. What audit event is written?
10. What user-visible state results?

Apply this to:
- buy;
- offer;
- accept;
- bid;
- refund;
- ship;
- deliver;
- payout;
- wallet load/withdraw;
- Co‑Own order;
- cancel;
- vote;
- distribution;
- DRIP;
- admin restriction.

---

# 73. Test strategy

## Unit
Pure:
- pricing;
- fees;
- condition mapping;
- state machine;
- order matching;
- entitlement;
- risk rules.

## Contract
- frontend schemas vs API;
- webhook payload;
- provider adapter.

## Integration
Real Postgres + Redis:
- offer;
- checkout;
- order;
- ledger;
- Co‑Own;
- chat.

## Concurrency
- double checkout;
- double accept;
- oversell;
- double payout;
- double vote;
- Co‑Own oversell.

## Provider sandbox
- Stripe;
- KYC;
- shipping.

## Device E2E
- signed build;
- real media;
- poor network;
- background/foreground;
- kill/relaunch.

## Visual
Real screenshots:
- light/dark;
- common devices;
- large text;
- error;
- empty;
- loading;
- offline.

---

# 74. Release acceptance matrix

A public release candidate is accepted only if all of these are true:

| Gate | Required |
|---|---|
| TypeScript | clean |
| Unit tests | green |
| Integration | green |
| Migration | green from prior release |
| Security | no unresolved critical/high |
| Secrets | clean |
| Expo config | valid |
| Android build | signed + Play prelaunch |
| iOS build | TestFlight validation |
| Visual | real baseline green |
| Accessibility | matrix sampled |
| Payment staging | pass |
| Refund/dispute staging | pass |
| Search | durable backend active |
| Co‑Own invariants | pass |
| DRIP | either implemented or feature-disabled |
| Price alerts | either implemented or feature-disabled |
| Backup restore | pass |
| Rollback | rehearsed |
| Branch | protected / required checks |
| Observability | dashboards + alerts |
| On-call | owner assigned |

---

# 75. 30-day execution plan

## Week 1 — Release truth
- protect branches;
- fix failed review/status;
- make CI required;
- attach signed artifacts;
- production search mandatory;
- exact release config.

## Week 2 — Money/ownership adversarial tests
- unique-item race;
- offer races;
- ledger;
- Co‑Own reservation;
- webhook duplicate/order;
- refund/payout.

## Week 3 — Co‑Own closure
- DRIP consumer;
- price alerts;
- surveillance baseline;
- legal/economic model documentation;
- disclosure pass.

## Week 4 — Native quality
- real devices;
- visual baselines;
- accessibility;
- performance;
- camera/upload/video;
- checkout/chat/Co‑Own journey recordings.

---

# 76. 60-day execution plan

- multi-source recommendation retrieval;
- vector/visual search;
- search quality evaluation;
- authenticity tier;
- buyer-protection case system depth;
- seller task center;
- live-commerce load test;
- full trust/safety ops metrics;
- production analytics definitions;
- search/index disaster recovery.

---

# 77. 90-day execution plan

- controlled public beta;
- cohort monitoring;
- fraud calibration;
- returns/dispute operations;
- ranking experiments;
- regional policy;
- capacity testing;
- improved onboarding;
- deeper visual search;
- seller growth tools.

---

# 78. What **not** to build next

Do not add more major departments until closure.

Specifically avoid:
- another social feed;
- another profile mode;
- generic AI assistant everywhere;
- crypto/token gimmicks;
- more Co‑Own order types;
- more dashboard widgets;
- another design-system abstraction.

The product already has breadth.

The next competitive advantage comes from depth, truth and polish.

---

# 79. Engineering standards I would enforce immediately

1. No financial state from client.
2. No fake success.
3. No silent production fallback that changes semantics.
4. No unversioned consequential mutation.
5. No money mutation without idempotency.
6. No state transition without invariant test.
7. No “verified” without defined evidence.
8. No ML authority over irreversible high-risk action.
9. No UGC surface without report/block.
10. No production feature claim without device/live evidence.
11. No repeated rounded section container without semantic reason.
12. No new primary navigation destination without product evidence.
13. No release from failed/unverified commit.

---

# 80. Detailed upgrade register

The following register is intentionally redundant with earlier narrative: it is designed to be converted directly into engineering tickets.

| ID | Pri | Domain | Required work | Acceptance |
|---|---|---|---|---|
| R01 | P0 | Release | Protect main | required checks enforced |
| R02 | P0 | Release | Fix failed HEAD review | green exact SHA |
| R03 | P0 | CI | Attach workflows to candidate | run artifacts retained |
| R04 | P0 | Build | Signed iOS artifact | TestFlight validated |
| R05 | P0 | Build | Signed Android artifact | Play prelaunch validated |
| R06 | P0 | Search | Mandatory shared prod search | no local silent fallback |
| R07 | P0 | Co‑Own | DRIP worker | idempotent end-to-end |
| R08 | P0 | Co‑Own | Price-alert worker | crossing/dedupe/delivery |
| R09 | P0 | Co‑Own | Ownership invariant | property/concurrency tests |
| R10 | P0 | Commerce | Unique listing race | exactly one sale |
| R11 | P0 | Payments | webhook replay suite | duplicates/out-of-order safe |
| R12 | P0 | Ledger | double-entry invariant | zero imbalance |
| R13 | P0 | Wallet | withdrawal reconciliation | provider/internal equality |
| R14 | P0 | Trust | UGC reporting/blocking | store policy pass |
| R15 | P0 | Privacy | deletion propagation | app + web paths |
| R16 | P0 | Legal | Co‑Own legal model | counsel signoff |
| R17 | P0 | Ops | backup restore | measured RTO/RPO |
| R18 | P0 | Security | MASVS review | high findings closed |
| R19 | P1 | Recs | Multi-source retrieval | ≥4 source families |
| R20 | P1 | Recs | ANN/vector retrieval | versioned index |
| R21 | P1 | Recs | reranker | offline metrics |
| R22 | P1 | Recs | experiment assignment | sticky + logged |
| R23 | P1 | Recs | diversity policy | seller/item caps |
| R24 | P1 | Visual | object-region search | crop-to-results |
| R25 | P1 | Search | typo/synonyms | quality suite |
| R26 | P1 | Search | multilingual | locale tests |
| R27 | P1 | Search | reindex/swap | zero-downtime |
| R28 | P1 | Search | lag dashboard | alert threshold |
| R29 | P1 | PDP | landed total | server quote |
| R30 | P1 | PDP | structured condition | category schema |
| R31 | P1 | PDP | specifics | category attributes |
| R32 | P1 | PDP | authenticity | defined tiers |
| R33 | P1 | PDP | sold comps | source/freshness |
| R34 | P1 | Offers | transition matrix | behavioral tests |
| R35 | P1 | Offers | material-change invalidation | stale offers safe |
| R36 | P1 | Checkout | unknown outcome UX | reconcile/check |
| R37 | P1 | Orders | event timeline | stable projection |
| R38 | P1 | Returns | case model | evidence + SLA |
| R39 | P1 | Disputes | operator tooling | auditable resolution |
| R40 | P1 | Shipping | exception events | user-visible |
| R41 | P1 | Auth | high-value item workflow | partner/manual path |
| R42 | P1 | Chat | scam detection | warning/report |
| R43 | P1 | Chat | attachment security | scan/moderate |
| R44 | P1 | Chat | delivery truth | pending/sent/read |
| R45 | P1 | Live | reconnect snapshot | gap-safe |
| R46 | P1 | Live | load test | target connections |
| R47 | P1 | Live | anti-snipe proof | deterministic |
| R48 | P1 | Live | moderation | host/operator controls |
| R49 | P1 | Co‑Own | market state | halt/stale/offline |
| R50 | P1 | Co‑Own | slippage protection | confirm + enforcement |
| R51 | P1 | Co‑Own | self-trade policy | prevented/flagged |
| R52 | P1 | Co‑Own | surveillance | baseline rules |
| R53 | P1 | Co‑Own | record-date entitlement | snapshot test |
| R54 | P1 | Co‑Own | payout/distribution receipt | durable |
| R55 | P1 | Co‑Own | custody disclosure | versioned |
| R56 | P1 | Co‑Own | insolvency disclosure | legal reviewed |
| R57 | P1 | Profile | trust hierarchy | compact |
| R58 | P1 | Closet | visual boards | shoppable |
| R59 | P1 | Settings | reduce density | hierarchy test |
| R60 | P1 | Notifications | priority taxonomy | transactional separation |
| R61 | P1 | Creator | export pipeline | native proof |
| R62 | P1 | Creator | interrupted upload | resume |
| R63 | P1 | Looks | product tagging | live inventory |
| R64 | P1 | Moodboard | undo/redo | durable |
| R65 | P1 | Seller | task-first hub | action priority |
| R66 | P1 | Seller | bulk edits | audited |
| R67 | P1 | Seller | offer to likers | controls |
| R68 | P1 | Seller | net proceeds | fee-aware |
| R69 | P1 | Analytics | metric dictionary | canonical |
| R70 | P1 | Analytics | ledger-backed net metrics | reconciled |
| R71 | P1 | Accessibility | VoiceOver/TalkBack | matrix |
| R72 | P1 | Accessibility | large text | no clipping |
| R73 | P1 | Performance | mid-range Android | budgets pass |
| R74 | P1 | Media | adaptive video | failure handling |
| R75 | P1 | Media | moderation pipeline | quarantine |
| R76 | P1 | Offline | unknown-outcome model | no fake success |
| R77 | P1 | Realtime | event versions | gap recovery |
| R78 | P1 | API | consistent idempotency | mutation catalog |
| R79 | P1 | DB | migration snapshot CI | pass |
| R80 | P1 | Ops | least privilege | role audit |
| R81 | P1 | Ops | audit-log viewer | immutable |
| R82 | P1 | Fraud | linked-account graph | risk evidence |
| R83 | P1 | Fraud | promotion abuse | velocity |
| R84 | P1 | Fraud | refund abuse | review flow |
| R85 | P1 | Privacy | ML erasure | feature deletion |
| R86 | P1 | DSA | trader traceability | evidence |
| R87 | P1 | DSA | illegal-item buyer notice | workflow |
| R88 | P1 | SRE | SLO dashboard | owned |
| R89 | P1 | SRE | queue backlog alerts | tested |
| R90 | P1 | SRE | payment mismatch alert | tested |
| R91 | P1 | SRE | search lag alert | tested |
| R92 | P1 | DR | Redis loss drill | recover |
| R93 | P1 | DR | search loss drill | reindex |
| R94 | P1 | DR | provider outage drill | degrade safely |
| R95 | P2 | Recs | sequence model | only after data |
| R96 | P2 | Recs | long-term objective | retention guardrail |
| R97 | P2 | Search | voice | evaluation |
| R98 | P2 | Search | seller/board search fusion | relevance |
| R99 | P2 | Trust | transparency reporting | public |
| R100 | P2 | Trust | auth partner routing | category-based |
| R101 | P2 | Live | clips/replays | moderation |
| R102 | P2 | Creator | collaboration | permission model |
| R103 | P2 | Moodboard | collaboration | conflict-safe |
| R104 | P2 | International | localized taxes | jurisdiction |
| R105 | P2 | International | currencies | ledger-safe |
| R106 | P2 | International | duties | estimate |
| R107 | P2 | Platform | cost telemetry | per-domain |
| R108 | P2 | Platform | feature flags | audited |
| R109 | P2 | Platform | chaos suite | scheduled |
| R110 | P2 | Platform | capacity model | documented |
| R111 | P2 | AI | model registry UI | operator |
| R112 | P2 | AI | red-team suite | prompt/tool |
| R113 | P2 | AI | cost budgets | enforced |
| R114 | P2 | UX | one-handed audit | key flows |
| R115 | P2 | UX | haptic grammar | documented |
| R116 | P2 | UX | motion tokens | reduced motion |
| R117 | P2 | Design | radius audit | semantic |
| R118 | P2 | Design | card-sprawl audit | flattened |
| R119 | P2 | Design | icon audit | remove decorative |
| R120 | P2 | QA | two clean adversarial audits | release evidence |

---

# 81. Scoring rationale

## Why frontend is relatively high

The app has the right technical ingredients and has undergone meaningful component/decomposition work. The remaining problem is not “React Native cannot do it.” It is proving smooth native behavior and eliminating local visual inconsistency.

## Why backend is not 90+

There is strong breadth and good authority-boundary thinking, but:
- search defaults are still development-oriented;
- Co‑Own consumers are explicitly missing;
- public-scale failure proof is not complete;
- release candidate evidence is weak.

## Why ML is only ~56%

There is useful instrumentation and a decision service, but the current recommendation route itself acknowledges no separate multi-source retrieval stage. That is a fundamental gap relative to Pinterest/Instagram-scale recommendation architecture.

## Why release/SRE is low

A sophisticated codebase without a demonstrably green, protected release pipeline is still risky. The exact audited HEAD had a failed combined review status and no attached workflow runs.

---

# 82. “Better than Depop” definition

Do not define better as more features.

Define it as:

### Faster
- list in under a minute when item is recognized;
- purchase in few taps;
- offer in seconds.

### More trustworthy
- condition;
- authenticity;
- total price;
- seller evidence;
- protection.

### More discoverable
- visual search;
- semantic search;
- Looks;
- boards;
- live.

### More useful to sellers
- analytics;
- bulk operations;
- automation with control;
- market comps.

### More socially native
- creator media;
- messaging;
- following;
- collections.

### More economically expressive
- offers;
- auctions;
- Co‑Own where legally appropriate.

If all six improve without increasing cognitive load, Thryftverse has a real differentiated product.

---

# 83. Final production decision

### Current decision: **CONDITIONAL / GATED BETA**

The repository is far enough along that “prototype” undersells it.

It is **not** yet appropriate to claim:
- eBay-grade marketplace operations;
- Pinterest-grade visual discovery;
- Instagram-grade ranking/media polish;
- StockX-grade market integrity;
- Whatnot-grade live trust operations;
- broker-grade Co‑Own production readiness.

The right next phase is a **closure and proof campaign**, not feature expansion.

The most important work, in order:

1. make the exact release candidate green and protected;
2. remove production search silent fallback;
3. prove transactional/ledger invariants under concurrency;
4. close Co‑Own DRIP and price-alert consumers;
5. finish legal/custody/ownership model;
6. build multi-source retrieval + vector/visual search;
7. execute native device/visual/accessibility matrix;
8. harden buyer protection/authenticity/trust operations;
9. load/failure test live, chat, search and payments;
10. launch a capped invite beta and measure reality.

If those close cleanly, the score can plausibly move from ~70 into the **mid-80s** without a rewrite.

Moving above **90** requires operational evidence from real users and real incident/failure handling, not another round of source-code expansion.

---

# 84. Current external benchmark evidence

The following sources were consulted for the 19 September 2026 market cross-check.

## eBay
- Authenticity Guarantee:
  https://www.ebay.com/help/buying/default/buying-authenticity-guarantee?id=5470
- Creating a listing / item specifics:
  https://www.ebay.com/help/selling/listings/creating-listing?id=4105
- Item condition by category:
  https://www.ebay.com/help/selling/listings/creating-managing-listings/item-conditions-category?id=4765
- Returns / seller help:
  https://www.ebay.com/help/default/default/default?id=4079

## Depop
- Buyer Protection:
  https://depophelp.zendesk.com/hc/en-gb/articles/360038461713-Depop-Protection-for-buyers
- Make Offer:
  https://depophelp.zendesk.com/hc/en-gb/articles/4412315779345-Make-Offer
- Send Offer:
  https://depophelp.zendesk.com/hc/en-gb/articles/15495796917777-Send-Offer
- Discounts:
  https://depophelp.zendesk.com/hc/en-gb/articles/360033415634-Discounts

## StockX
- How it works:
  https://stockx.com/about/how-it-works/
- Verified Marketplace:
  https://stockx.com/help/articles/what-is-the-stockx-verified-marketplace
- Buying / historical prices:
  https://stockx.com/about/en-gb/buying-en-gb/

## Pinterest
- Visual search:
  https://help.pinterest.com/en-gb/article/use-visual-search-features
- Visual search product updates:
  https://newsroom.pinterest.com/en-gb/news/introducing-new-visual-search-features/
- September 2026 visual search update:
  https://newsroom.pinterest.com/news/new-pinterest-visual-search-performance-ads/

## Whatnot
- UK Trust Centre:
  https://www.trust.uk.whatnot.com/
- Buyer Protection:
  https://www.trust.uk.whatnot.com/buyer-protection
- Product Authenticity:
  https://www.trust.uk.whatnot.com/product-authenticity
- Bad actor prevention:
  https://www.trust.uk.whatnot.com/how-we-stop-bad-actors

## Apple
- App Review Guidelines:
  https://developer.apple.com/app-store/review/guidelines/uk/
- Account deletion:
  https://developer.apple.com/support/offering-account-deletion-in-your-app

## Google Play
- Account deletion:
  https://support.google.com/googleplay/android-developer/answer/13327111
- User data:
  https://support.google.com/googleplay/android-developer/answer/10144311
- UGC:
  https://support.google.com/googleplay/android-developer/answer/9876937

## Stripe
- Idempotent requests:
  https://docs.stripe.com/api/idempotent_requests
- Connect design:
  https://docs.stripe.com/connect/design-an-integration
- Separate charges/transfers:
  https://docs.stripe.com/connect/separate-charges-and-transfers
- Destination charges:
  https://docs.stripe.com/connect/marketplace/tasks/accept-payment/destination-charges

## Security
- OWASP MASVS:
  https://mas.owasp.org/MASVS/

## UK regulatory context
- FCA fractional shares:
  https://www.fca.org.uk/firms/fractional-shares
- FCA unregulated collective investment schemes:
  https://www.fca.org.uk/investsmart/unregulated-collective-investment-schemes

## EU
- DSA impact on platforms:
  https://digital-strategy.ec.europa.eu/en/policies/dsa-impact-platforms

---

# 85. Repository evidence used

Important exact-branch files reviewed include:

- `frontend/package.json`
- `backend/api/src/docs/AUTHORITATIVE_BOUNDARIES.md`
- `backend/api/src/docs/KNOWN_GAPS_COOWN.md`
- `backend/api/docs/SEARCH_MIGRATION.md`
- `backend/api/src/routes/recommendations.ts`
- `.flagship/flagship-readiness-review-2026-09-07.md`
- recent branch commit history through `fdd63b8f...`

Important observations:

- current mobile dependency surface is capable of high-end media UX;
- explicit authoritative boundaries exist for payment, payout, KYC, auction, settlement and account restriction;
- Co‑Own price-alert evaluator is explicitly not implemented;
- Co‑Own DRIP execution consumer is explicitly not implemented;
- production search is not yet structurally mandatory;
- recommendation code explicitly identifies the current retrieval source as a recent SQL keyset and notes the lack of a separate retrieval stage;
- the branch HEAD is unprotected;
- exact HEAD had failed `Devin Review` status and no attached GitHub workflow run at inspection time.

---

# 86. Closing principle

The next version of Thryftverse should feel **less engineered**, even while the engineering becomes much deeper.

Users should see:

- media;
- people;
- objects;
- price;
- trust;
- conversation;
- ownership.

They should not see the architecture.

If a user thinks “this is a complicated finance/social/e-commerce app,” the product has failed to compress its complexity.

If a user simply feels:

> “I can discover something, understand it, trust it, negotiate it, buy it, own it, trade it and talk about it in one place,”

then the architecture is doing its job.
