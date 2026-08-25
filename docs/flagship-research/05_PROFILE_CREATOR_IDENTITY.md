# 05 — Profile & Creator Identity: Flagship Research Report

**Department:** User profile, My profile, Edit profile, profile components, creator identity, followers/following.
**Date:** August 2026
**Scope:** `UserProfileScreen.tsx`, `MyProfileScreen.tsx`, `EditProfileScreen.tsx`, `FollowersScreen.tsx`, `FollowingScreen.tsx`, `PortfolioScreen.tsx`, `CollectionDetailScreen.tsx`, and the 29-file `components/profile/` module.
**Charter references:** AGENTS.md §3 (case study before implementation), §4 (push to maximum quality), §11 (truthful UI — no fabricated stats, no dead tabs, no "coming soon").

---

## 1. 2026 Competitor Benchmark

The profile surface in 2026 is no longer a "settings page with a photo." Across every benchmark app, the profile has become the **autobiographical surface** — the single place where a creator's identity, curation, and commercial reputation collapse into one scroll. Three apps define the 2026 state of the art, each solving a different facet of the same problem.

### 1.1 Instagram — the grid as autobiography

Instagram's 2026 profile is the canonical reference for **identity hierarchy + grid art direction**. The hierarchy is rigid and unchanged in spirit: cover-less, avatar-first, three-stat seam row (posts / followers / following), name + handle + bio, then the grid. What changed in 2025–2026 is the grid itself.

- **3:4 vertical grid (early 2025).** The profile grid moved from 1:1 square to 3:4 vertical thumbnails. Adam Mosseri explicitly apologised for wrecking user mosaics. The lesson for ThryftVerse: a marketplace whose inventory is overwhelmingly portrait fashion photography should have adopted 3:4 years ago. ThryftVerse's `ProfileShopTile` already uses `CARD_ASPECT = 4/3` (3:4 portrait, `UserProfileScreen.tsx:84`) — this is correct and ahead of where most marketplaces were in 2024. The risk is not the aspect ratio; it is the **art direction** (see §3).
- **Grid Reordering (June 8, 2026, global).** Posts are no longer locked to reverse-chronological. Users long-press and drag to compose their grid as a curated storefront. This is the single most important 2026 profile trend: **the grid is an authored surface, not a feed archive.** Depop sellers have been begging for this for years; Instagram shipped it first. ThryftVerse sellers currently have no control over grid order — listings appear in whatever order the backend returns them. A flagship profile must let a seller pin 3 hero listings and reorder the rest.
- **Highlights tab (heart icon, rolling out through 2025).** Story Highlights moved from a horizontal ring above the grid into a dedicated tab with vertical thumbnails, with an option to surface selected Highlights in the main grid. Instagram's own framing: *"We're trying to figure out a way to improve the profile and get more of the content above the fold, and simplify it."* The ring is being demoted because it competed with the grid for first-viewport attention. ThryftVerse has **no highlights system at all** — this is a greenfield opportunity to ship the 2026 pattern natively rather than retrofit a ring.
- **Stats placement.** Instagram keeps exactly three stats in the seam row, right-aligned, vertically centred against the avatar. Tabular numerals, compact notation (1.2K, 3.4M), hairline dividers between stats — no bordered cards. ThryftVerse's `ProfileHero` already implements this pattern faithfully (`ProfileHero.tsx:194-227`, seam row with `seamStatDivider` hairlines). The public profile is close to benchmark here; the self-profile is not (see §3).

### 1.2 Snapchat — creator identity & parasocial closeness

Snapchat's 2026 creator profile is the reference for **identity-as-performance**. Snapchat profiles lead with a Bitmoji or avatar, a display name, a follower count, and a "Last updated" timestamp that signals liveness. The profile is deliberately sparse — there is no grid in the Instagram sense. Instead, the profile is a **launchpad** to Stories, Spotlight, and Lenses, with the creator's recent activity surfaced as the primary content.

The relevant 2026 signals from Snapchat's creator team (publicly documented by designers Atara Weinreb and the Snapchat Creator Growth team):

- **Liveness over archive.** "Last updated 30/05/2026" is a first-class identity signal. A dormant creator profile feels dead even if the grid is full. ThryftVerse's `memberSince` is the only temporal signal — there is no "last active" or "last listed" indicator. For a marketplace where buyer trust depends on seller responsiveness, this is a gap.
- **Subscriber/follower count as the single dominant stat.** Snapchat does not split posts/followers/following into three equal stats. The follower count is the hero number; everything else is secondary. This is the parasocial-closeness principle: the one number that says "how many people care about this person" gets the most weight.
- **Creator posting flow as profile input.** Snapchat's 2024–2025 work focused on making the posting workflow feel like profile authoring — the act of posting *is* the act of updating your identity. ThryftVerse's Sell flow and Look creation flow are currently disconnected from the profile; a flagship profile should make "add to my profile" a first-class action in both.

### 1.3 Pinterest — boards as curated identity

Pinterest's 2026 profile is the reference for **collection-as-curation**. A Pinterest profile is dominated by a board grid: each board is a 2×2 or single-image cover tile with a title and pin count. The profile header is minimal — avatar, name, handle, follower count, a one-line bio — and then the boards take over.

The 2026 Pinterest design system (publicly documented in the Pinterest DESIGN.md spec) commits to one rule that ThryftVerse should internalise: **type and chrome serve the imagery, never compete with it.** Pinterest uses a warm-cream neutral palette, a single saturated accent reserved exclusively for the active-tab indicator and primary CTA, and a masonry grid where each tile renders at its natural aspect ratio with 16px radius and 8px gutters. The profile is a **gallery wall**, not a dashboard.

ThryftVerse's `CollectionDetailScreen` already implements a 2×2 mosaic cover (`CollectionDetailScreen.tsx:238-252`) and a `ClosetMediaMosaic` grid — this is the right instinct. But collections are buried in the Closet, not surfaced on the profile. Pinterest's lesson: **boards ARE the profile.** A ThryftVerse creator's collections should be visible on the profile as a first-class tab, not hidden behind a utility rail icon.

### 1.4 Depop / Vinted — the marketplace profile as storefront

Depop's 2026 profile is the closest functional analogue to ThryftVerse. Depop explicitly frames the profile as *"a cross between Instagram and eBay — where your shop is your profile, your listings are your feed."* The 2026 Depop seller guides all repeat one instruction: *"Design your grid. Think of your shop layout like an Instagram feed. Pick a clear visual theme. Shops with a cohesive grid build trust."*

The Depop benchmark tells us three things:

1. **The grid is the storefront.** A seller's grid coherence is a trust signal. ThryftVerse currently renders the grid in backend-defined order with no curation tools — this is below the Depop baseline.
2. **Bio + location + response time are the trust trinity.** Depop profiles surface a transparent bio, a location, and response-time signals. ThryftVerse has all three (`ProfileHero` trust line, `ProfileTrustSignals` chips) but scatters them across hero + `SellerReputationCard` + `ProfileTrustSignals` — three separate trust surfaces on one profile.
3. **Followers are social proof, not just a count.** Depop's algorithm weighs seller reputation, and buyers "follow sellers whose style they like." The followers list is a social signal. ThryftVerse's `FollowersScreen` and `FollowingScreen` are functional but visually flat — a list of avatar + name + follow button with no mutual-follower, no "also follows you," no taste affinity signal.

---

## 2. Psychology & Principles

A profile is not an information page. It is a **negotiation between two audiences**: the owner (who uses it to project an identity) and the visitor (who uses it to decide whether to trust, follow, or buy). Every design decision on the profile surface should be traceable to one of five psychological principles.

### 2.1 Identity projection

The profile owner's primary need is **self-expression through curation**. This is why Instagram's Grid Reordering was the most-requested feature for three years and why its June 2026 launch was celebrated: it gave creators authorship over their own silhouette. A profile that only shows items in backend-defined chronological order denies the creator the core act of identity construction — *choosing what represents me*. ThryftVerse sellers who list 50 items have no way to say "these three are my signature." The flagship profile must restore that agency.

### 2.2 Social proof via stats

Stats (followers, sold count, rating) are processed by visitors in **0.5–1.5 seconds**. They are not read; they are scanned as a reputation gestalt. This is why Instagram groups three stats in one seam row with tabular numerals — the eye aligns digits across stats and reads the row as a single trust signal. Scattering stats across multiple sections (hero stat row + trust line + reputation card + trust chips) forces the visitor to re-assemble the gestalt, which increases cognitive load and weakens the signal. The principle: **one stat row, one place, scanned once.**

### 2.3 Highlights as self-curation

Highlights (Instagram) and boards (Pinterest) serve the same psychological function: **a curated subset of work that says "this is what I want you to see first."** This is different from the grid, which is the full archive. Highlights are the creator's editorial voice — a way to say "among everything I've made, these are the threads." A profile without highlights forces the visitor to infer the creator's self-narrative from a chronological dump. ThryftVerse has no highlights system; the `Collections` tab on `UserProfileScreen` is a dead tab backed by an `idleQuery` that returns `[]` for every profile (`UserProfileScreen.tsx:176-184, 236-238`). This is the single largest identity-projection gap.

### 2.4 The grid as autobiography

The grid is not a list of products. It is a **visual autobiography** — a scrollable statement of taste. Depop's 2026 guides repeat: *"Buyers follow shops with a defined identity — not random closets."* A grid of inconsistent photography (different backgrounds, different lighting, different aspect treatments) reads as a flea market. A grid of consistent art direction reads as a boutique. ThryftVerse's `ProfileShopTile` renders images with `contentFit="cover"` and `downscaleWidth={cardWidth}` (`ProfileShopTile.tsx:58-64`) — technically competent, but art direction is the seller's responsibility and the app provides no grid-level preview, no grid coherence guidance, and no reordering. The flagship profile should make grid coherence a first-class, visible property.

### 2.5 Parasocial closeness

The visitor's secondary need is to feel a **one-sided intimacy** with the creator. This is the parasocial principle that drives the entire creator economy. On a marketplace, it manifests as: "Do I feel like I know this person?" Signals that build parasocial closeness include liveness (last active), responsiveness (reply time), personality (bio, location, cover photo), and consistency (grid coherence). Signals that destroy it include dormancy (no temporal signal), opacity (no response time), generic photography, and dead tabs that promise content and deliver nothing. ThryftVerse's dead `Collections` and `Drops` tabs are parasocial destroyers — they promise the visitor a curated view and deliver an empty state.

---

## 3. Current ThryftVerse Audit

The profile module is architecturally mature — there are 29 files in `components/profile/`, two dedicated screen variants (public + self), a shared `TabRail`/`SegmentedControl` system, a `ProfileSkeleton`, `ProfileStates` (loading/error/unavailable/blocked), and a `SellerReputationCard`. The data layer is real: `usePublicProfileQuery`, `useUserListingsInfinite`, `useUserLooksInfinite`, `useSellerReviewsInfinite`, `useFollowMutation`, `useBlockMutation`, `useReportUserMutation` are all wired. This is not a prototype. But the surface has concrete defects against the 2026 benchmark and the AGENTS.md §4 quality bar.

### 3.1 Dead tabs — the §11 violation

`UserProfileScreen.tsx:90` defines `type Tab = 'Shop' | 'Looks' | 'Collections' | 'Drops' | 'Reviews'`. The `Collections` and `Drops` tabs are in the type union but **never rendered in the TabRail**. The TabRail at `UserProfileScreen.tsx:534-543` only renders `Shop`, `Looks`, `Reviews`. However, the `listData` memo (`UserProfileScreen.tsx:236-238`) and `numColumns` (`UserProfileScreen.tsx:480`) still branch on `Collections` and `Drops`, returning `[]` and rendering nothing. The `idleQuery` (`UserProfileScreen.tsx:176-184`) is a fake React-Query-shaped object with `hasNextPage: false`, `fetchNextPage: () => {}`, and a comment that says *"Idle query placeholder for tabs that have no backend data source yet (Collections, Drops)."*

This is a §11 (Truthful UI) latent violation. The tabs are not visible, but the code paths exist to support them, and the `idleQuery` is a fabrication scaffold. If anyone re-enables the tabs, they will render empty states with no backend. **Action:** either wire `Collections` to the real collections backend (the `CollectionDetailScreen` and `ClosetBoardCard` already exist) or remove the `Collections`/`Drops` branches from the `Tab` type, `listData` memo, `numColumns`, and delete `idleQuery`. The flagship path is to wire `Collections` as a real tab — it is the Pinterest-board pattern and the highest-identity-value addition.

### 3.2 Fabricated / placeholder stats on self-profile

`MyProfileScreen.tsx:171-179` fetches follow counts via `fetchFollowCounts(currentUser.id)` in a `useEffect` with a `.catch(() => { /* follow counts are non-critical */ })` that silently swallows errors and leaves `followCounts` at `{ followerCount: 0, followingCount: 0 }`. This means a seller whose follow-count endpoint fails sees "0 followers · 0 following" with no indication of failure. This is not a fabricated success state (the data is honestly absent), but it is a **truthful-UI edge case**: a zero count displayed without a loading/error distinction is indistinguishable from a real zero. The `MyProfileIdentityHero` renders these zeros as fact (`MyProfileIdentityHero.tsx:159-193`). **Action:** distinguish loading/error from zero — show a skeleton or a muted dash while the count is unknown.

### 3.3 Weak header hierarchy on self-profile vs public profile

The public profile (`ProfileHero.tsx`) has an authored seam row: avatar overlapping the cover, three stats right-aligned with hairline dividers, then identity canvas below. This is Instagram-density and close to benchmark.

The self-profile (`MyProfileIdentityHero.tsx`) is weaker:

- **No cover.** `MyProfileScreen.tsx` does render a cover (`FlagshipProfileMedia` at line 523), but `MyProfileIdentityHero` itself starts at `paddingTop: Space.xs` with no visual connection to the cover. The avatar sits in a plain row with stats — there is no seam, no overlap, no authored composition. The self-profile reads as a settings header; the public profile reads as an identity surface.
- **Stats are `Listings / Looks / Sold`** (`MyProfileIdentityHero.tsx:107-109`) — three seller-stats, with followers/following demoted to a flat inline row below the trust signals (line 159). This inverts the 2026 hierarchy: followers (social proof) should be in the seam row; `Listings / Looks / Sold` are seller analytics that belong in the utility rail or a secondary row. The self-profile treats the creator as a seller-dashboard first and a person second.
- **Avatar is 84pt** (`MyProfileIdentityHero.tsx:13`) vs **88pt** on the public profile (`ProfileHero.tsx:27`). The self-profile avatar is smaller than the public-profile avatar. This is a subtle but real hierarchy inversion — your own profile should not feel smaller than a stranger's.

### 3.4 Card-on-card and surface-budget violations

`UserProfileScreen.tsx:529` renders `<SellerReputationCard>` directly below the `ProfileHero` and above the `TabRail`. The `ProfileHero` already contains a trust line (`trustParts` at `ProfileHero.tsx:125-131`: rating, sold, joined) and the `ProfileTrustSignals` chips are available. The `SellerReputationCard` is a **second trust surface** stacked on the first. Then `MyProfileIdentityHero` renders `ProfileTrustSignals` as a **third trust surface**. On a profile with a verified seller who has a rating and response time, the visitor sees: trust line in hero → trust chips in hero → reputation card → trust chips on self-profile. This violates §4's surface budget ("above the fold, use at most one dominant non-media panel") and §4's "no card-on-card composition" rule.

### 3.5 Missing highlights system

There is no highlights/pinned-listings system on either profile. The `Collections` tab is dead. The `MoodboardCollectionGrid` and `ClosetBoardCard` components exist in `components/profile/` but are not rendered on the profile — they are used in the Closet. A 2026 flagship profile without highlights is below the Instagram, Pinterest, and Depop baseline.

### 3.6 Weak grid art direction

`ProfileShopTile` renders `item.images?.[0] ?? item.imageUrl ?? ''` with `contentFit="cover"` (`ProfileShopTile.tsx:58-64`). The `MyProfileScreen` grid (`MyProfileScreen.tsx:740-773`) renders `item.images?.[0] ?? ''` with `contentFit="cover"` and a `RadiusRoleValue.compactControl` radius. Neither grid provides:

- **Grid preview / reordering.** No way for a seller to see their grid as a composition and reorder it.
- **Pinned hero listings.** No way to pin 3 signature items to the top.
- **Coherence guidance.** No visual signal that a grid is inconsistent (mixed lighting, mixed backgrounds).
- **Cover-image fallback.** `ProfileShopTile` falls back to `item.imageUrl ?? ''` — an empty string renders a broken image tile with no graceful placeholder.

### 3.7 FollowersScreen / FollowingScreen — functional but flat

`FollowersScreen.tsx` and `FollowingScreen.tsx` are near-identical (the only difference is the query hook and the empty-state copy). Both render a `FlatList` of avatar + name + handle + follow button. There is no:

- **Mutual-follower indicator** ("You both follow @x").
- **Sort/filter** (most recent, mutuals first, sellers you've bought from).
- **Taste affinity** (sellers who list similar categories).
- **Bulk action** (no way to follow/unfollow multiple).

The `FollowButton` component (`FollowersScreen.tsx:256-294`) uses `followMutation.variables ?? false` to derive `isFollowing` — this is a **derived state from mutation variables**, not from the server. If the mutation has not run, `variables` is `undefined` and `isFollowing` defaults to `false`, which may not match the server state. This is a subtle truthfulness bug: the button can show "Follow" for a user you already follow if the list was loaded before a follow action elsewhere. **Action:** derive `isFollowing` from the item's server-provided `isFollowing` field, not from mutation variables.

### 3.8 EditProfileScreen — competent but disconnected from identity

`EditProfileScreen.tsx` is a clean form: identity preview row, Profile fields (Name, Username), About fields (Bio, Location, Website). The fields are correct and the save flow is real (`updateMyProfile` → `updateUserProfile` → `fetchMyProfile` → query invalidation, lines 73-111). But:

- **Avatar and cover are not editable here.** Line 209-211: *"Photo and cover are managed from your profile."* This is a wayfinding failure — the user is in "Edit profile" and is told to leave to edit their photo. The avatar/cover edit affordances are on `MyProfileScreen` (camera button on avatar, image button on cover). A flagship EditProfile should integrate avatar/cover editing or at minimum show a deep-link to the right surface.
- **No bio preview.** The bio is edited blind — no preview of how it will render on the profile (truncated at 3 lines, `ProfileHero.tsx:250`).
- **No grid preview.** A seller cannot see how their profile will look to a visitor. The "identity row" at the top is a minimal preview, not a true profile preview.

### 3.9 CollectionDetailScreen — good foundation, profile-disconnected

`CollectionDetailScreen.tsx` is a well-composed surface: 2×2 mosaic cover, title + privacy badge + description + item count + relative-time, action row (follow/share/edit), `ClosetMediaMosaic` grid, `MoreLikeThisRow`. The `handleToggleFollow` (line 153-160) is **fabricated local state** — `setIsFollowing` toggles a local boolean and shows a toast, with no backend mutation. This is a §11 violation: the follow button implies persistence but only flips local state. **Action:** wire to a real collection-follow endpoint or remove the follow button and keep only share/edit.

---

## 4. Micro Improvements

These are surgical fixes that can ship in a single pass without re-architecture.

| # | Defect | File:Line | Fix |
|---|--------|-----------|-----|
| M1 | Dead `Collections`/`Drops` in `Tab` type | `UserProfileScreen.tsx:90, 236-238, 480` | Remove from type union, `listData`, `numColumns`; delete `idleQuery` (line 176-184). Or wire `Collections` to real backend (see §5). |
| M2 | Silent zero follow-count on self-profile | `MyProfileScreen.tsx:171-179` | Add `followCountsStatus: 'loading' | 'error' | 'loaded'` state; render skeleton/dash while unknown. |
| M3 | `FollowButton` derives `isFollowing` from mutation variables | `FollowersScreen.tsx:266`, `FollowingScreen.tsx:266` | Use `item.isFollowing` from server data; fall back to `false` only if absent. |
| M4 | Fabricated collection-follow on `CollectionDetailScreen` | `CollectionDetailScreen.tsx:77, 153-160` | Wire to real endpoint or remove follow button; keep share + edit. |
| M5 | Self-profile avatar smaller than public-profile avatar | `MyProfileIdentityHero.tsx:13` (84) vs `ProfileHero.tsx:27` (88) | Align to 88pt on both. |
| M6 | Trust surfaces stacked (hero trust line + reputation card + trust chips) | `UserProfileScreen.tsx:529`; `ProfileHero.tsx:271-297`; `ProfileTrustSignals.tsx` | Collapse into one trust surface: keep the hero trust line (rating · sold · joined); remove `SellerReputationCard` from above the tab rail and fold its metrics into an expandable trust section below the grid or in the Reviews tab. |
| M7 | `ProfileShopTile` empty-image fallback | `ProfileShopTile.tsx:59` | Render a restrained `surfaceAlt` placeholder with a category glyph when `uri` is empty. |
| M8 | EditProfile disclaims avatar/cover editing | `EditProfileScreen.tsx:209-211` | Add avatar/cover edit actions (or deep-link buttons) directly in EditProfile. |
| M9 | FollowersScreen / FollowingScreen are duplicated | `FollowersScreen.tsx`, `FollowingScreen.tsx` | Extract a shared `FollowListScreen` component parameterised by query hook + empty-state copy. |
| M10 | No "last active" / liveness signal | `ProfileHero.tsx` (missing) | Surface `sellerTrust.lastActiveAt` as a muted line in the trust row when available. |

---

## 5. Macro Improvements

These are architectural changes that redefine the profile surface. Each should be scoped as a discrete flagship workstream.

### 5.1 Profile architecture: one authored surface, two audiences

The current split is `UserProfileScreen` (public) + `MyProfileScreen` (self) with **divergent header composition** (seam row vs flat row), **divergent stat semantics** (For sale/Followers/Following vs Listings/Looks/Sold), and **divergent tab sets** (Shop/Looks/Reviews vs Listings/Looks/About). This means the same person sees two different profiles depending on whether they are looking at themselves or a stranger.

**Flagship architecture:** a single `ProfileSurface` that composes a shared `ProfileHeader` (cover + seam row + identity canvas + actions) with audience-aware props (`isSelf`, `viewer`), and a shared `ProfileTabBar` with a canonical tab set: **Shop · Looks · Collections · Reviews · About**. The self-profile adds an edit affordance; the public profile adds follow/message. The tab set is identical — only the actions and the edit affordances differ. This eliminates the divergence and makes the self-profile feel like the public profile (identity surface, not dashboard).

### 5.2 Identity layer: seam row with followers as the hero stat

Adopt the 2026 hierarchy on both profiles:

- **Seam row:** avatar (88pt, overlapping cover) + three stats: **Followers · Following · Sold**. Followers is the hero stat (parasocial proof). Following is secondary. Sold is the marketplace proof. `For sale` / `Listings` / `Looks` are seller-analytics and move to the utility rail or a secondary row.
- **Identity canvas:** display name + verified badge, @handle, bio (3-line, with "read more" expand), location, website link.
- **Trust line:** one row — `4.9 ★ · 47 sold · Replies in 1h · Joined June 2026`. No chips, no reputation card, no second trust surface.
- **Actions:** self → Edit profile / Share; public → Follow / Message / More.

This collapses three trust surfaces into one and puts social proof where the eye lands first.

### 5.3 Highlights system: pinned collections + pinned listings

Ship the 2026 highlights pattern natively:

- **Pinned listings (3 max).** A seller can pin 3 listings to the top of their Shop grid. These render at full width (or 2-up) above the standard 3-column grid, with a subtle "Pinned" eyebrow. This is Instagram's pinned-posts pattern applied to a marketplace.
- **Collections tab (real).** Wire the `Collections` tab to the existing collections backend (`useStore(s => s.collections)`, `CollectionDetailScreen`, `ClosetBoardCard`). Render a `MoodboardCollectionGrid` of board cards: 2×2 mosaic cover, title, item count, privacy badge. Tap → `CollectionDetailScreen`. This is the Pinterest-boards-on-profile pattern and the highest-identity-value addition.
- **Highlights row (optional, phase 2).** A horizontal ring of highlight covers above the tab rail, each linking to a collection or a curated listing set. This is the Instagram ring, but backed by real ThryftVerse collections, not Stories.

### 5.4 Grid art direction: coherence, reordering, preview

- **Grid reordering (seller tool).** In `MyProfileScreen`, add a "Reorder grid" mode: long-press to drag listings into a new order, persisted via a `reorderListings` mutation. This is the June 2026 Instagram pattern and the Depop seller's most-wanted feature.
- **Grid coherence indicator.** In the Sell flow and on `MyProfileScreen`, surface a subtle "grid coherence" signal: if the last 6 listings use inconsistent backgrounds or aspect ratios, show a gentle nudge in the seller hub. This is not a hard guardrail; it is a craft signal.
- **Grid preview on EditProfile.** Add a "Preview public profile" action in `EditProfileScreen` that renders the profile as a visitor would see it. This closes the wayfinding gap and lets a seller author their silhouette before publishing.

### 5.5 Followers / Following: from list to graph

- **Mutuals first.** Sort the followers/following list so mutual follows appear first, with a "Follows you" badge.
- **Taste affinity.** Annotate rows with a subtle category affinity ("Lists similar items") when the user's listings overlap in category with the viewer's saved/wishlist items.
- **Sellers you've bought from.** Annotate rows with a "Bought from" badge for sellers the viewer has transacted with.
- **Shared component.** Extract `FollowListScreen` to eliminate the duplication and make these enhancements one-time work.

---

## 6. Flagship Acceptance Criteria

A flagship profile pass is complete when **all** of the following are true on the rendered surface (AGENTS.md §4 — judged by the rendered silhouette, not by the presence of tokens):

1. **One trust surface.** Above the tab rail, there is exactly one trust signal cluster: the hero trust line. `SellerReputationCard` is either removed from the header or folded into the Reviews tab. No card-on-card trust stacking.
2. **No dead tabs.** The `Tab` type contains only tabs that render real data. `idleQuery` is deleted. `Collections` is either wired to the real collections backend or absent from the type.
3. **No fabricated state.** `CollectionDetailScreen` follow button is wired to a real endpoint or removed. `FollowersScreen`/`FollowingScreen` `FollowButton` derives `isFollowing` from server data, not mutation variables. Follow counts on `MyProfileScreen` distinguish loading/error from zero.
4. **Seam row on both profiles.** Both `UserProfileScreen` and `MyProfileScreen` render the same seam-row composition: 88pt avatar overlapping the cover, three stats right-aligned with hairline dividers, tabular numerals. The self-profile no longer reads as a settings header.
5. **Followers is the hero stat.** The seam row leads with Followers on both profiles. `Listings / Looks / Sold` are demoted to the utility rail or a secondary row on the self-profile.
6. **Highlights exist.** The profile has either pinned listings (3 max, rendered above the grid) or a real Collections tab with board cards. A visitor can see a curated subset of the creator's work without scrolling the full grid.
7. **Grid art direction.** `ProfileShopTile` renders a restrained placeholder for empty images. The self-profile offers a "Reorder grid" mode and a "Preview public profile" action.
8. **Thumbnail test passes.** At 25% scale, the primary object on the profile is the avatar + cover media, not a stack of grey cards. Repeated rounded containers do not dominate the silhouette.
9. **Squint test passes.** Media (cover, avatar, grid images) dominates; navigation chrome, trust chips, and tab rails recede.
10. **State coverage.** Loading (skeleton resembling final layout), empty (per-tab empty states with real CTAs), error (retry), blocked, unavailable, and partial-data (missing follow counts) states are all designed and distinguishable.
11. **FollowersScreen / FollowingScreen.** Mutuals sort first with a "Follows you" badge; `FollowButton` uses server state; the two screens share one component.
12. **EditProfile.** Avatar and cover are editable in-place (or via clear deep-link); a "Preview public profile" action exists; bio shows a rendered preview.

---

## 7. Priority & Sequencing

The workstreams are ordered by identity-value-per-effort. Each is a discrete pass that can ship independently.

| Phase | Workstream | Effort | Identity Value | Dependencies |
|-------|-----------|--------|----------------|--------------|
| **1** | **Truthfulness pass (M1, M3, M4, M6).** Remove dead tabs, fix `FollowButton` state, remove fabricated collection-follow, collapse trust surfaces. | Small | High | None — these are §11 compliance fixes. |
| **2** | **Self-profile header parity (M5, M2, §5.2).** Align avatar to 88pt, adopt seam row on `MyProfileIdentityHero`, move Followers to the hero stat, distinguish loading/error follow counts. | Medium | High | Phase 1 (trust surface collapse). |
| **3** | **Collections tab (§5.3).** Wire `Collections` to the real collections backend; render `MoodboardCollectionGrid` of `ClosetBoardCard` tiles on the profile. | Medium | High | Phase 1 (dead-tab removal). |
| **4** | **Pinned listings (§5.3).** Add pin-3-listings affordance in `MyProfileScreen`; render pinned listings above the Shop grid on both profiles. | Medium | High | Phase 3 (collections infrastructure). |
| **5** | **Grid reordering + preview (§5.4).** "Reorder grid" mode in `MyProfileScreen`; "Preview public profile" in `EditProfileScreen`; empty-image placeholder in `ProfileShopTile` (M7). | Large | Medium | Phase 4 (pinned listings UI). |
| **6** | **Followers graph (§5.5).** Mutuals-first sort, "Follows you" / "Bought from" badges, shared `FollowListScreen` (M9). | Medium | Medium | None (independent of profile header). |
| **7** | **EditProfile integration (M8).** Avatar/cover editing in EditProfile; bio preview; profile preview action. | Small | Medium | Phase 5 (preview infrastructure). |
| **8** | **Liveness signals (M10).** "Last active" in trust row; "Last listed" on the grid header. | Small | Low | Backend `lastActiveAt` field. |

**Critical path:** Phase 1 → Phase 2 → Phase 3. Phases 4–8 can run in parallel after Phase 3.

**Definition of done for the flagship profile:** a visitor lands on a profile and, within the first viewport, sees a cover, an 88pt avatar, a seam row with Followers as the hero stat, a one-line trust summary, and the beginning of a media grid — with no dead tabs, no fabricated state, and no card-on-card trust stacking. The profile reads as an authored identity surface, not a seller dashboard. That is the 2026 benchmark. ThryftVerse's current architecture is 60% of the way there; the remaining 40% is composition discipline and the highlights system, not new infrastructure.
