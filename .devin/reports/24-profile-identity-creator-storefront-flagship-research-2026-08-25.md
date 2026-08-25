# 24 — Profile Identity and Creator Storefront

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Identity Platform + Commerce Platform + Trust & Safety + Mobile Platform + Legal
**Status:** **P0 contract and privacy correctness — backend capability blocker**

## Executive decision

ThryftVerse’s profile is visually ambitious but contractually fragmented. The native public profile expects a viewer-aware aggregate containing identity, stats and relationship permissions. The backend currently returns only the public user object. As a result, the UI can render a polished shell while silently defaulting important facts and permissions.

This department is not one missing “storefront customization” feature. It is four coupled systems that need an explicit owner:

1. **Public identity projection** — safe, viewer-aware fields and relationship state.
2. **Trust and reputation projection** — evidence-backed seller claims, reviews and operational performance.
3. **Storefront merchandising** — curated inventory, collections, navigation, announcement and media.
4. **Owner management** — verified media, preview, draft/publish, moderation and rollback.

The immediate P0 is contract and privacy correctness. The flagship opportunity comes after that: turn the profile from a generic tabbed social page into a seller-authored shop whose media and inventory carry the composition, while trust remains restrained and provable.

## Flagship product principle

A profile has two jobs depending on intent:

- for a social visitor: establish person, taste and recent creative work;
- for a buyer: establish inventory, reputation, operating expectations and a safe path to purchase or message.

The page should infer intent from entry context without changing truth. A visit from a listing can lead with shop and seller confidence; a visit from a Look can lead with identity and creations. It must not become two unrelated screens.

## Evidence map

| Layer | Repository evidence | Verdict |
|---|---|---|
| Mobile public profile contract | `profileApi.ts` requires `{ user, stats, viewer }` | Correct shape, unsupported by backend |
| Public profile endpoint | `GET /users/:userId/profile` returns `{ ok, user }` only | P0 contract failure |
| Public rendering | `UserProfileScreen.tsx` separately fetches listings, Looks, reviews and seller trust | Fragmented orchestration |
| Own profile | `MyProfileScreen.tsx`, local media fallbacks and backend query | Useful local resilience, stale fallback risk |
| Profile media update | `PATCH /users/me` accepts URL strings | Missing authoritative receipt binding |
| Privacy preference | `private_profile` can be updated | Not enforced by public profile aggregate |
| Seller projection | `/sellers/:sellerId` returns basic counts and rating | Too weak for UI trust contract |
| Trust UI | `SellerTrustSummary`, client-derived badges | Risks un-evidenced claims |
| Featured inventory | frontend sorts `listing.featured` | No authoritative backend feature control found |
| Store structure | no canonical storefront config/collections/navigation aggregate found | Missing department owner |
| Follow | explicit `/users` follow/unfollow plus toggle `/sellers` route | Duplicate semantics and race risk |
| Reviews | seller review query joins reviewer but response ID is hardcoded null | Broken identity/navigation |

## P0 codebase findings

### 1. Public profile client/server contract is broken

The frontend declares (`profileApi.ts:63–66`):

```ts
export interface PublicProfileAggregate {
  user: PublicProfileUser;
  stats: PublicProfileStats;
  viewer: PublicProfileViewer;
}
```

With viewer state (`profileApi.ts:55–61`):

```ts
export interface PublicProfileViewer {
  isSelf: boolean;
  isFollowing: boolean;
  isBlocked: boolean;
  isBlockedByTarget: boolean;
  canMessage: boolean;
}
```

But `GET /users/:userId/profile` returns only `{ ok, user }`. The client at `profileApi.ts:113–118` destructures `response.user`, `response.stats`, `response.viewer` — but `stats` and `viewer` are `undefined` from the server.

**Verified:** `profileApi.ts:117`:
```ts
  return { user: response.user, stats: response.stats, viewer: response.viewer };
```
`response.stats` and `response.viewer` are `undefined` because the server doesn't return them. Any UI fallback to zero or false is not harmless: it changes represented reputation and action availability.

### 2. Private-profile preference is not an access policy

`PATCH /users/me/preferences` persists `private_profile`. The public profile handler does not query or enforce it. Separate content endpoints can therefore continue returning profile content regardless of the preference.

Privacy must be a policy evaluated across all profile projections:

- identity fields visible to everyone;
- approved followers versus non-followers;
- listings that remain legally/publicly required versus social creations;
- blocked in either direction;
- self and moderator views;
- search/discovery indexing;
- cached responses and image URLs.

Do not implement this only by hiding tabs on the client.

### 3. Profile media mutation trusts arbitrary URLs

The edit flow uploads media before calling `PATCH /users/me`, but the backend accepts arbitrary strings for avatar, cover photo and cover video. It does not bind the URL to an owner-verified upload finalization, published asset, MIME family or moderation result.

An attacker can bypass the intended client and submit an external or another user’s URL. The fix belongs in the mutation contract: accept asset/finalization IDs, verify ownership and status, then persist a canonical media binding transactionally.

### 4. Verification fields exist in TypeScript but not the projection

The frontend types include `identityVerified` and `sellerVerified`; `toProfilePayload` and `toPublicProfilePayload` do not emit either. The seller route likewise returns no verification tier, response rate, response time, dispatch performance, holiday state or evidence timestamp.

Fail-closed rendering limits the lie, but it also means the intended trust experience never becomes authoritative. Do not “fix” this by defaulting booleans or deriving a blue check from email verification.

### 5. Trust badges are inferred on the device

`deriveSellerBadges` applies threshold logic to a partial `SellerTrustSummary`. A badge is a public claim. It needs a backend-issued evidence row with qualification policy/version, measured window, computed-at time and expiry/revocation state.

Client code may choose presentation, not eligibility.

### 6. Featured/pinned listings are illustrative

`UserProfileScreen` and `MyProfileScreen` sort `featured === true` first and `ProfileShopTile` renders a pin. Repository inspection found the client field but no canonical backend management or listing projection that establishes it. The visual control/data path is therefore incomplete.

A storefront needs server-owned ranks and constraints, not an optional field that is normally null.

### 7. Two follow contracts disagree

- `/users/:id/follow` exposes explicit POST follow and DELETE unfollow.
- `/sellers/:id/follow` toggles state on POST.

Toggle mutations are unsafe under retry and stale UI. A lost response followed by retry can reverse the user’s intent. Retain explicit idempotent state transitions and retire the toggle route after caller migration.

### 8. Review identity is partially discarded

The seller reviews query joins `users` through `r.reviewer_id`, but the selected fields omit the reviewer ID and the response hardcodes `reviewer.id = null`. Reviewer profile navigation and identity consistency cannot work. The analytics path also queries `reviewee_id` while public review paths use `seller_id`; schema semantics must be reconciled before trusting counts.

## Correct source-of-truth boundaries

```text
users / profile_media_bindings
          |
          v
viewer-aware profile projection <--- blocks / follows / privacy policy
          |
          +--> trust projection <--- reviews / orders / evidence rows
          |
          +--> storefront projection <--- config / sections / listing ranks
          |
          +--> creator projection <--- published Looks / Posters / Moodboards
```

The mobile screen should consume this as a coherent initial projection, then paginate content modules independently. It should not fabricate aggregate truth by combining incompatible caches and defaulting missing domains.

## Target contracts

### Public profile aggregate

```ts
type PublicProfileAggregate = {
  profile: {
    id: string;
    username: string;
    displayName: string | null;
    bio: string | null;
    locationLabel: string | null;
    website: string | null;
    avatar: MediaRef | null;
    cover: MediaRef | null;
    memberSince: string;
    accountType: 'person' | 'business' | 'creator';
  };
  viewer: {
    relationship: 'self' | 'none' | 'following' | 'requested' | 'mutual';
    blockedByViewer: boolean;
    blockedByProfile: boolean;
    canViewSocialContent: boolean;
    canViewShop: boolean;
    canMessage: boolean;
    canReport: boolean;
  };
  counts: {
    followers: number;
    following: number;
    activeListings: number;
    soldListings: number;
    creations: number;
    reviews: number;
  };
  trust: PublicSellerTrust | null;
  storefront: StorefrontSummary | null;
  contentPolicyVersion: string;
  projectionVersion: string;
};
```

Return `404` for unavailable/blocked profiles when existence disclosure is not allowed. Use field omission for policy-hidden data, not invented zeroes.

### Trust evidence

```ts
type PublicTrustEvidence = {
  code: 'identity_checked' | 'trader_verified' | 'top_rated' |
    'fast_dispatch' | 'responsive_seller';
  tier?: string;
  measuredFrom?: string;
  measuredTo?: string;
  computedAt: string;
  expiresAt?: string;
  policyVersion: string;
};
```

No evidence row means no badge. Expired evidence means no badge. Sensitive KYC details never enter this projection.

### Storefront model

```ts
type Storefront = {
  sellerId: string;
  status: 'draft' | 'published' | 'paused';
  revision: number;
  announcement: string | null;
  coverAssetId: string | null;
  logoAssetId: string | null;
  sections: StorefrontSection[];
  navigation: StorefrontNavItem[];
  publishedAt: string | null;
};

type StorefrontSection =
  | { kind: 'featured_listings'; title: string; listingIds: string[] }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'new_arrivals'; title: string; limit: number }
  | { kind: 'editorial_media'; assetId: string; link?: SafeTarget }
  | { kind: 'creator_work'; title: string; contentIds: string[] };
```

Sections are typed, rankable and constrained. Avoid a free-form page builder that creates inaccessible, slow or deceptive shops.

## Storefront publishing workflow

Owner changes must use draft/publish semantics:

1. edit a private storefront revision;
2. validate listing ownership/status, media receipts, link targets and section limits;
3. preview using the same renderer as public view;
4. publish with optimistic locking and idempotency;
5. atomically swap the active revision;
6. invalidate viewer projections and append an outbox event;
7. allow rollback to a recent valid revision.

Pinned listings need a dedicated mutation such as:

```http
PUT /storefront/me/featured-listings
If-Match: "storefront-17"

{ "listingIds": ["listing_a", "listing_b"] }
```

The server proves ownership, active/eligible status, deduplicates IDs and enforces a small maximum. Sold or moderated listings should disappear automatically without corrupting the saved authoring order.

## Media architecture

Profile media should follow:

```text
pick/capture -> local preview -> upload -> finalize -> moderate/transcode
-> verified binding mutation -> canonical rendition -> cache invalidation
```

Required rules:

- avatar accepts image only and produces small square renditions;
- cover supports image first; enable video only when picker, upload, transcode, autoplay policy, data-saving, reduced motion and fallback poster are all complete;
- reject user-supplied public URLs at the authoritative mutation;
- detach old bindings transactionally, but delay physical deletion until reference checks complete;
- use content-hash/versioned URLs so cache invalidation is deterministic;
- record crop/focal point separately from the asset;
- validate decoded media, not only extension/MIME headers.

The current native picker’s image-only cover behavior is honest. Keep cover video unavailable until it is end-to-end.

## Identity, verification and marketplace regulation

Identity verification, seller standards and email verification are different facts:

- **email verified**: communication channel ownership;
- **identity checked**: a private KYC process reached an eligible state;
- **trader/business status**: marketplace classification and required disclosures;
- **seller performance tier**: behavioral evidence over a defined period.

Do not collapse these into one checkmark.

The EU Digital Services Act requires online marketplaces to collect/verify trader information and design for traceability, while current EU consumer rules require buyers to understand whether a seller is a trader and what protections apply. This does not authorize exposing private KYC documents. The public projection should disclose the classification and required business/contact/legal information only where law and policy require it, backed by compliance records.

## Privacy and authorization

Build a single profile visibility policy used by profile, search, followers, content feeds, media delivery and messaging.

Policy inputs:

- target account state and private-profile preference;
- viewer authentication and relationship;
- block edges in either direction;
- content type and commerce obligations;
- age/region restrictions;
- moderation/legal holds.

Policy outputs:

- existence disclosure;
- visible identity fields;
- permitted modules;
- permitted actions;
- cache scope and TTL.

Viewer-aware responses must use `Vary`/private caching correctly or remain behind an authenticated edge. Never cache one follower’s expanded private profile as a public response.

## Reputation correctness

Compute seller performance from authoritative order and messaging events:

- rating uses eligible, non-removed reviews and exposes sample count;
- completed sales use one documented terminal order state;
- dispatch performance uses carrier acceptance or documented fallback, not self-reported labels;
- response time excludes spam, self-messages and periods when holiday mode is active;
- response rate needs a clear eligible-inquiry denominator;
- returns/cancellations must distinguish seller-fault from buyer-fault/system outcomes;
- all windows, minimum sample thresholds and freshness limits are backend policy.

Public metrics should be sparse. A profile does not need a dashboard row of every number. Show the few signals that reduce buyer uncertainty and let the detailed standards sheet explain methodology.

## Flagship information architecture

### First viewport

The dominant object is identity plus real media—not a giant rounded profile card.

- edge-to-edge cover media with controlled crop;
- avatar overlapping the media/canvas boundary where platform-safe;
- display name, username and one evidence-backed trust mark at most;
- compact bio/location line;
- one primary relationship action and one restrained secondary action;
- a useful beginning of shop or creator media above the fold.

### Adaptive content order

- Listing entry: `Shop` first, then `Looks`, `About/Reviews`.
- Social/Look entry: `Creations` first, then `Shop`, `About/Reviews`.
- Own view: same public composition with owner controls revealed, not an unrelated dashboard silhouette.

Persist explicit tab choice per profile session. Entry-context ordering is a default, not hidden personalization that fights the user.

### Shop composition

- one editorial/featured module maximum above the fold;
- dense two-column inventory with real imagery as color;
- seller-authored collections where sufficient inventory exists;
- unavailable items removed or clearly sold, never clickable into false availability;
- sorting/filtering appears only when inventory size justifies it;
- no card-on-card wrappers or badges on every tile.

## Anti-AI design policy

Reject these patterns:

- a generic cover gradient plus floating glass profile card;
- four equal KPI pills under the bio;
- a badge cloud assembled from weak heuristics;
- “Welcome to my shop” explanatory copy;
- one rounded container for every tab section;
- AI sparkle/edit icons for ordinary media management;
- placeholder gray storefront cards when genuine listings exist;
- confetti or excessive animation after follow/edit actions.

Use one radius grammar, transparent 44pt utility targets, hairline separators and real product/editorial media. Trust marks are quiet typographic evidence. Owner controls should recede until invoked.

## State matrix

The implementation must explicitly cover:

- loading skeleton matching identity/media geometry;
- populated social profile, seller storefront and hybrid profile;
- true empty creator profile versus filtered-empty shop;
- private account: self, approved follower and outsider;
- blocked by viewer, blocked by target and suspended target;
- offline cached view with freshness treatment;
- partial failure: identity available, shop/reviews unavailable;
- missing/moderated media;
- holiday/away state from authoritative backend data;
- follow/message mutation pending, definite failure and unknown outcome;
- storefront draft, validation failure, publish pending and stale revision conflict.

Do not convert failed stats into zero. Use module-level failure and retry where partial rendering is safe.

## Accessibility and native quality

- avatar/cover alternatives should describe identity, not filename;
- verification labels must state the exact fact (“Identity checked”), not “verified” alone;
- counts use localized accessible text and do not rely on icons;
- tab order, selected state and content relationship are announced;
- media grids support large text without overlay collisions;
- follow state is announced after authoritative confirmation;
- cover video, when implemented, defaults to muted, honors reduced motion/data saving, includes a poster and exposes pause;
- all icon targets are at least 44pt while visible glyphs remain 20–24pt;
- screen-reader order follows cover → identity → actions → selected content.

## Reliability and performance

| Signal | Initial SLO |
|---|---:|
| Public profile aggregate availability | 99.95% monthly |
| Aggregate p95 server latency | < 250 ms at edge-region target |
| Follow state consistency after confirmed mutation | < 2 s |
| Unauthorized private-module disclosure | 0 |
| Unevidenced trust badge render | 0 |
| Storefront publish duplicate active revision | 0 |
| Image LCP-equivalent after cached profile shell | p75 < 2.5 s on target mobile network |

Use one aggregate query or bounded parallel reads, cursor pagination, stable media sizes, CDN renditions and module-level cache keys. Avoid N+1 seller/listing calls. Emit profile-view analytics only after visibility and consent policy; never include private profile text in logs.

## Implementation sequence

### P0 — truth and safety

1. Introduce a shared runtime schema for the public profile aggregate; make backend and frontend contract tests consume it.
2. Return authoritative stats and viewer state, including both block directions and `canMessage`.
3. Enforce private-profile/block policy across profile, creations, follower lists, search and messaging.
4. Replace avatar/cover URL mutation with verified media-binding inputs.
5. Remove client-derived badge eligibility; return evidence-backed trust claims.
6. Repair reviewer ID projection and reconcile `seller_id` versus `reviewee_id` semantics.
7. Migrate seller follow toggle callers to explicit idempotent follow/unfollow.

### P1 — storefront system

8. Add storefront config, revisions, typed sections, collections and featured ranks.
9. Build owner edit/preview/publish/rollback using the same public renderer.
10. Project trader classification and legally required disclosure from compliance records.
11. Add authoritative holiday state/message and operational trust metrics.
12. Converge own/public profile orchestration and remove stale device fallback leakage.

### P2 — quality and scale

13. Add adaptive module order by entry intent, with explicit user-controlled tabs.
14. Add media focal points, responsive renditions and carefully gated cover video.
15. Add experimentation/evaluation for buyer confidence, profile-to-item conversion and creator follow-through—guarded by complaint, block and latency metrics.
16. Add seller storefront search/collection management when inventory scale warrants it.

## Verification matrix

### Contracts

- schema test proves server aggregate exactly matches client runtime contract;
- null/omitted/zero semantics are distinct;
- trust evidence expires and disappears fail-closed;
- profile media cannot bind another owner’s receipt or external URL;
- seller and public profile rating/count semantics agree.

### Privacy/security

- outsider, follower, blocked-both-directions, self and moderator fixtures;
- private content absent from body, count, cache and CDN access—not just visually hidden;
- IDOR tests for media, storefront revision, featured ranks and rollback;
- follow retry never toggles intent;
- storefront links and uploaded media are sanitized.

### Product

- zero/one/many listings, sold-only inventory and mixed creator/seller identities;
- partial API failure and stale offline cache;
- large text, RTL, screen reader, reduced motion and slow image network;
- thumbnail/squint tests show media and identity dominate, not controls/cards;
- entry from listing, Look, search, message and self navigation returns correctly.

## Current-2026 primary-source research

### EU Digital Services Act — Article 30 trader traceability

| Source | Finding | ThryftVerse application |
|---|---|---|
| [DSA Article 30 — Traceability of traders](https://streamlex.eu/articles/dsa-en-art-30/) | Online platforms must collect: name, address, phone, email, ID document, payment account details, trade register info, self-certification of EU law compliance — **before** allowing traders to offer products | ThryftVerse must implement KYBC (Know Your Business Customer) process before allowing sellers to list |
| [CCPC — DSA trader traceability](https://www.ccpc.ie/enforcement-and-regulation/digital/the-digital-services-act) | "Online platforms must make best efforts to assess whether the information provided by traders is reliable and complete." Data stored 6 months after relationship ends. Public disclosure: contact details, business registration, compliance commitment only | ThryftVerse must verify trader info, store it, and publicly disclose only the required subset |
| [Freshfields — DSA and online marketplaces](https://www.freshfields.com/en/our-thinking/blogs/technology-quotient/dsa-decoded-9-the-dsa-and-online-marketplaces-102lx12) | "KYBC obligation under Article 30 DSA" — "thoroughly document their KYBC processes and their rationale for determining what constitutes 'best efforts'" | ThryftVerse must document its trader verification process and rationale |
| [Pinsent Masons — DSA adds to DAC7 duties](https://www.pinsentmasons.com/out-law/analysis/kyc-the-eu-digital-services-act-adds-platforms-dac7-duties) | DSA came into full effect 17 February 2024. Platforms can "build on existing compliance processes they should already operate to accord with an EU tax law known as DAC7" | ThryftVerse should align DSA Article 30 compliance with existing DAC7 tax reporting processes |

### Key DSA Article 30 finding for ThryftVerse

Under DSA Article 30, ThryftVerse must:
1. **Collect** trader information before allowing sellers to offer products: name, address, phone, email, ID document, payment account details, trade register info, compliance self-certification
2. **Verify** using "best efforts" — assess reliability and completeness via official databases or supporting documents
3. **Store** for 6 months after the business relationship ends
4. **Publicly disclose** only: contact details, business registration, compliance commitment
5. **Document** the KYBC process and rationale for "best efforts" determination

This means the `identityVerified` and `sellerVerified` fields in the frontend types are not just UI features — they represent legal obligations. The public profile projection must disclose trader classification and required business information where EU law applies, backed by compliance records. Private KYC documents must never enter the public projection.

### Additional sources

- [Shopify: customize a Shop Store](https://help.shopify.com/en/manual/online-sales-channels/shop/manage-shop-store/customize/shop-store) — current cover, collections, navigation and merchandising expectations.
- [eBay: managing an eBay Store](https://www.ebay.com/help/selling/ebay-stores/managing-ebay-store?id=4090&ra=true) — current storefront categories, featured inventory and seller management model.
- [eBay Seller Center: Promoted Stores, January 2026](https://www.ebay.com/sellercenter/news/2026-january/promoted-stores) — current storefront traffic and seller-branding direction.
- [EU DSA Regulation 2022/2065](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32022R2065) — full regulation text.
- [European Commission: Digital Services Act](https://digital-strategy.ec.europa.eu/en/policies/digital-services-act) — current 2026 implementation context.
- [European Commission: protecting consumers when buying online](https://commission.europa.eu/digital-life/protecting-you-when-buying-online_en) — current consumer-facing marketplace obligations.

## Definition of done

This department is flagship-complete only when profile identity, privacy, trust, inventory and creator work are projections of authoritative records; every viewer receives the correct permissions; every trust signal has evidence; sellers can author and publish a real storefront; and the native composition remains media-led, sparse and useful in its first viewport.

**Current status: PARTIAL — BACKEND CAPABILITY BLOCKER.** The current screen has substantial UI and query foundations, but its aggregate contract, privacy enforcement, media authority and storefront ownership are incomplete.
