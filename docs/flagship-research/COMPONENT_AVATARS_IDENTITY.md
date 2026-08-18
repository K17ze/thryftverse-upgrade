# ThryftVerse Flagship Upgrade — Avatars, Identity & Social Proof

> Flagship upgrade research for ThryftVerse avatar, identity, and social-proof primitives.
> Benchmark date: August 2026. Canonical references: `AGENTS.md` §4 (Icon grammar, Surface budget, Radius budget, Media storytelling, "Visible containment must have meaning"), `Design.md` (profile header micro spec, avatar specs, story ring specs, verified badge specs, trust/commerce card micro spec, premium badge micro spec, iconography & optical alignment).
> Runtime source of truth: `frontend/src/theme/designTokens.ts` (`ProfileLayout` avatar tokens, `Radius`, `Space`, `Control`), `frontend/src/platform/product/listingDetailContract.ts` (`VERIFICATION_TIERS`).

---

## 1. 2026 Competitor Benchmark — Instagram, Pinterest, eBay, Snapchat

Identity is the first trust signal a user processes. Before reading a title, checking a price, or evaluating a listing, the viewer's eye locks on the face — the avatar — and the status markers around it. In 2026, the strongest mobile apps treat avatars, verified badges, story rings, and social-proof counts as a single coherent "identity stack" rather than a loose collection of decorative elements. The convergence across platforms is striking: one avatar component with a disciplined size scale, one verified-badge grammar, one story-ring system with clear seen/unseen states, and social proof placed inline near the decision moment — not buried in a separate section.

### Instagram — identity as the anchor of every surface

Instagram remains the gold standard for avatar-led identity. In 2026, Instagram's profile avatar is a 320×320px upload displayed as a circle, but the real readability test is the 110×110px feed-adjacent view where small lettering and thin marks collapse ([trustypost.ai](https://trustypost.ai/blog/instagram-profile-picture-size-2026-pixels-ratio-safe-crop/)). The platform masks the square source into a circle, so the central 60–65% zone is the safe working area. Instagram's story ring is the canonical pattern: a gradient border (Instagram's signature orange-pink-purple) for unseen stories, a muted grey 2px ring for seen stories, with the avatar sitting inside a white background seam that separates it from the ring ([Medium — Ramadan Sayed, Apr 2026](https://medium.com/@ramadan123sayed/building-an-instagram-style-home-screen-in-jetpack-compose-stories-row-with-gradient-ring-feed-85f114bf81d9)). The story ring is 62–64pt on mobile, with a 54pt inner avatar and a label below in 10–11pt caption text. The verified badge is a blue checkmark anchored bottom-right of the avatar or inline next to the display name, scaled proportionally to the avatar size.

The lesson for ThryftVerse: Instagram's identity system works because it is **one system, not many**. The same avatar component, the same ring grammar, the same badge placement, the same size scale appears on the feed, the profile, the story rail, and the comment thread. The size changes; the grammar does not.

### Pinterest — branded identity in a discovery context

Pinterest renders profile pictures at 165×165px minimum (600×600 recommended for retina), masked into a circle ([myphotoai.io](https://myphotoai.io/pinterest-profile-picture/)). Pinterest's identity challenge is unique: the avatar appears alongside dense pin grids where vivid media competes for attention. A small face in a busy thumbnail row gets visually outranked by every pin around it. Pinterest's solution is to recommend tight head-and-shoulders crops with the face filling 70% of the circle, or a simple high-contrast branded logo. The avatar is the single point of brand consistency across every pin impression. Pinterest does not use story rings; instead, creator identity is reinforced through board covers and pin aesthetic consistency.

The lesson: on discovery surfaces where media dominates, **the avatar must be high-contrast and instantly recognisable at small sizes**. A 16pt avatar (ThryftVerse's current `ProductCardV2` seller avatar) is too small for a face — it becomes a coloured dot. Pinterest's minimum viable avatar for discovery contexts is 32–40pt.

### eBay Evo — marketplace trust through seller identity

eBay's Evo design system (2024–2026) treats seller identity as a compact inline confidence row, not a large card. The seller avatar (40pt circle), seller name, rating, and review count appear in a single horizontal row with a quiet follow/watch action on the right. Verified seller status is a small checkmark icon inline with the name — not a large badge container. The identity row is always placed near the price and the primary action, because trust must be evaluated *before* the purchase decision, not after scrolling past a reviews section.

The lesson: **seller identity is a trust signal, not a decoration**. It belongs inline, compact, and near the decision moment. eBay's 40pt avatar is the minimum for a face to be legible in a list context; anything smaller becomes abstract.

### Snapchat — story rings as variable-reward engine

Snapchat pioneered the story ring as a variable-reward mechanism. The gradient ring signals "new content you haven't seen" — a visual slot machine that drives compulsive tapping. In 2026, the pattern has been refined: the ring is thicker (3–3.5pt) for unseen stories, thinner and muted (2pt, 40–64% opacity) for seen stories. The "new" badge count ("3 new") appears on the first unwatched story to create urgency. The story ring is the single most effective mobile pattern for driving repeat engagement — story bubbles on product pages see 2–3x higher engagement on mobile than desktop ([eevy.ai](https://eevy.ai/blog/story-bubbles-conversion)).

### Cross-platform convergence

Across all four benchmarks, the 2026 consensus on identity is:

1. **One avatar component, one size scale** — xs (24px) for dense tables, sm (32px) for inline mentions, md (40px) for default cards, lg (48–56px) for list rows, xl (64–96px) for profile headers, 2xl (120px+) for onboarding/edit-profile heroes ([justfigma.com](https://justfigma.com/designing-avatars-and-user-profile-ui-in-figma/)). Ship one component with `type` variants (image | initials | icon), not separate "UserPhoto" and "UserCircle" components that drift apart.
2. **Status dots scale with avatar** — roughly 25% of diameter, minimum 8px, anchored bottom-right with a 2px border matching the surface background ([justfigma.com](https://justfigma.com/designing-avatars-and-user-profile-ui-in-figma/)).
3. **Verified badges are icon-inline, not containerised** — a checkmark glyph next to the name, scaled to the avatar, never a large bordered box ([eleken.co](https://www.eleken.co/blog-posts/badge-ui-design)).
4. **Story rings distinguish seen/unseen with gradient vs muted** — 3px gradient for unseen, 2px muted for seen, with a label below in caption text ([expo-story-rings](https://github.com/onurdevs/expo-story-rings), [Design.md §Component A](../Design.md)).
5. **Social proof is inline and compact** — a star line + count near the decision moment, not a sprawling block buried below the fold ([idukki.io](https://idukki.io/blog/mobile-vs-desktop-social-proof-patterns), [mida.so](https://www.mida.so/blog/social-proof-placement-product-page)).
6. **Follow buttons are stateful and within thumb reach** — on mobile, position within the lower third of the profile card or near the identity block; show pressed state, loading state, and following/followed state clearly ([uxpin.com](https://www.uxpin.com/studio/blog/profile-page-ui-design/), [uxpatternsguide.com](https://uxpatternsguide.com/patterns/follow-subscribe/)).

---

## 2. Psychology & Principles

### Identity as trust

The human face is the fastest trust signal we process. Neuroscience research shows that faces are processed in the fusiform face area within 100–170ms — faster than any text-based trust signal. When a buyer sees a seller's avatar, they are subconsciously evaluating: *Is this a real person? Can I trust them? Do they look like someone I'd buy from?* An anonymous, faceless marketplace listing feels riskier than one with a clear face and a name. This is why every major marketplace — eBay, Depop, Vinted, Vestiaire — surfaces seller identity near the product, not buried in a separate "About the seller" tab.

### The face as anchor

The avatar is the **visual anchor** of identity. It is the one element that remains constant across surfaces — the same face appears on the feed tile, the product detail seller row, the profile header, the chat message, and the notification. This consistency creates a cumulative trust effect: the buyer who sees the same face three times feels they "know" the seller, even if they've never interacted. Breaking this consistency — showing a face on the profile but a generic icon on the product detail — fragments trust.

### Social proof (Cialdini)

Robert Cialdini's principle of social proof states that people determine what is correct by finding out what others believe is correct. In a marketplace context, this manifests as:

- **Follower count** — "1,243 followers" signals that 1,243 other people have already vetted and chosen to follow this seller. The larger the number, the stronger the signal.
- **Sales count** — "47 sold" signals transactional trust: this seller has successfully completed 47 exchanges.
- **Rating + review count** — "4.9 ★ (143 reviews)" is the most powerful social proof combination. The star rating provides the quality signal; the review count provides the sample-size signal. A 5.0 rating with 2 reviews is weaker than a 4.8 rating with 500 reviews.
- **"Person behind the product"** — showing the seller's face, name, and stats alongside the listing humanises the transaction. It shifts the mental model from "buying from a website" to "buying from a person."

The key insight from 2026 research: **social proof must be placed near the decision moment, not in a separate section**. Above-the-fold rating widgets convert better than below-the-fold review sections because they reduce exit intent at the moment of decision ([mida.so](https://www.mida.so/blog/social-proof-placement-product-page), [reviewsonmetaobjects.com](https://reviewsonmetaobjects.com/blog/social-proof-shopify-product-pages)). On mobile, a single compact line ("4.9 ★ · 47 sold · 1.2K followers") is more effective than a multi-line block that pushes the price and CTA below the fold.

### Verified status as credibility

Verified badges work because they reduce uncertainty. The user's internal question is: *Is this person who they claim to be?* A verified badge answers that question instantly. But the badge only works if it is **truthful** — if verification is real and the criteria are clear. Fabricated verification (badges shown without backend confirmation) destroys trust faster than no badge at all. This is why `AGENTS.md` §11 (Truthful UI) is absolute: "Never fabricate success states, IDs, data, persistence, presence, activity."

In 2026, the verified badge landscape has been complicated by deepfake controversies and platform trust crises. Platforms like Bluesky expanded verification features in late 2025/early 2026, and the industry responded to authenticity concerns by making badge criteria more transparent ([font.news](https://font.news/quick-tutorial-designing-microbadge-type-for-live-streams-an)). The consensus: badges must be **unmistakable at 12–24px**, with at least 4.5:1 contrast ratio, and paired with accessible labels for screen readers.

### Story rings as variable reward

Story rings exploit the variable-reward schedule identified by B.F. Skinner and popularised by Nir Eyal in *Hooked*. The gradient ring signals "there is something new here you haven't seen" — but you don't know exactly what until you tap. This uncertainty drives compulsive checking. The seen/unseen distinction is critical: once a user has seen all stories, the rings mute to grey, removing the trigger. When new content appears, the ring re-activates with the gradient, re-triggering the loop.

For ThryftVerse, story rings (called "Posters") serve a dual purpose: they drive repeat engagement *and* they surface creator content in a format users already understand from Instagram/Snapchat. The key is maintaining the seen/unseen distinction clearly — a broken or inconsistent ring state destroys the variable-reward mechanism.

### Follower count as social proof

Follower count is the most visible social proof signal on a profile. It is processed in under 1 second: "1.2K followers" reads as "this person is popular and trusted by many." But follower count alone is insufficient — a seller with 50K followers and 0 sales is less trustworthy than one with 500 followers and 200 sales. This is why the strongest profiles show **multiple social proof signals in a single compact row**: followers, following, sales, rating. The `ProfileHero` component already does this correctly with its seam-row pattern (For sale · Followers · Following), but the `MyProfileIdentityHero` scatters stats across two separate rows (Listings/Looks/Sold + followers/following inline), creating cognitive load.

---

## 3. Current ThryftVerse Audit — Concrete Defects

The ThryftVerse codebase has **at least seven distinct avatar implementations** with no shared component, inconsistent sizes, and missing identity features. This is the single most fragmented component family in the app.

### Defect 1 — Multiple avatar implementations with no shared component

There is no `Avatar.tsx` in `frontend/src/components/ui/`. The closest is `AvatarRing.tsx` (`frontend/src/components/chat/AvatarRing.tsx`), but it is chat-specific (unread ring logic) and not used outside messaging. The following independent avatar implementations exist:

1. **`AvatarRing`** (`components/chat/AvatarRing.tsx:17`) — 52pt default, unread ring, initials fallback. Used in Inbox/Chat only.
2. **`GroupAvatarMosaic`** (`components/chat/GroupAvatarMosaic.tsx:31`) — 88pt default, 2×2 grid for group chats. Chat-only.
3. **`FlagshipProfileMedia` avatar** (`components/flagship/FlagshipProfileMedia.tsx:152-201`) — 104pt (`AVATAR_SIZE = 104`, line 208), 4px border, camera edit button. Profile-only.
4. **`ProfileVisualHeader` avatar** (`components/profile/ProfileVisualHeader.tsx:94-113`) — 96pt (`AVATAR_SIZE = 96`, line 184), 4px border, verified badge overlay. Used on legacy profile surfaces.
5. **`ProfileHero` avatar** (`components/profile/ProfileHero.tsx:162-174`) — 88pt (`AVATAR_SIZE` from `ProfileLayout.avatarStandard`, `designTokens.ts:609`), absolute positioned in seam row. Public profile.
6. **`MyProfileIdentityHero` avatar** (`components/profile/MyProfileIdentityHero.tsx:81-103`) — 84pt (`AVATAR_SIZE = 84`, line 13), edit camera button. Own profile.
7. **`CommerceDetailSellerRow` avatar** (`components/commerce/detail/CommerceDetailSellerRow.tsx:99-114`) — 40pt (line 194-196), circle for individuals, rounded-square for institutional. Product detail.
8. **`ProductCardV2` seller avatar** (`components/ProductCardV2.tsx:317-331`) — **16pt** (line 596-599), `borderRadius: Radius.md`. Discovery card.
9. **`HomeScreen` story avatar** (`screens/HomeScreen.tsx:1597-1606`) — 54pt inside 62pt ring. Story rail.
10. **`UserProfileScreen` collapsed header avatar** (`screens/UserProfileScreen.tsx:873`) — 28pt (`Space.lg + Space.xs = 24+4`). Sticky collapsed header.

**That is ten independent avatar render paths** with sizes ranging from 16pt to 104pt, four different border widths (0, 2, 4, and `StyleSheet.hairlineWidth`), three different fallback strategies (initials, person icon, gradient), and no shared size scale. This violates `AGENTS.md` §4: "If three or more screens exhibit the same visual defect, inspect and correct the shared primitive first." There is no shared primitive.

### Defect 2 — Avatar size inversion on discovery cards

`ProductCardV2` renders the seller avatar at **16pt** (`components/ProductCardV2.tsx:596-599`):
```typescript
sellerAvatar: {
  width: 16,
  height: 16,
  borderRadius: Radius.md,  // 8px — not even circular!
},
```

A 16pt avatar with an 8px border radius is not a circle — it is a tiny rounded square. At 16pt, a human face is illegible; it reads as a coloured dot. This is smaller than Pinterest's minimum viable avatar (32–40pt for discovery contexts) and smaller than eBay's seller row avatar (40pt). The `AGENTS.md` §4 "Media storytelling" rule states: "On discovery, profile and creator surfaces, real media must be the primary colour and visual anchor." A 16pt avatar is not media — it is noise.

Furthermore, `borderRadius: Radius.md` (8px) on a 16pt element produces a rounded square, not a circle. This breaks the avatar grammar — every other avatar in the app is circular (`Radius.full`). The inconsistency is visible at thumbnail scale.

### Defect 3 — Missing story ring component

The story ring styles exist in `HomeScreen.tsx` (lines 1577–1606) but are **never referenced in the render path**. The `renderPosters` function (line 840) renders poster cards as rectangular tiles (`posterCard`, `posterTile` styles), not as circular story rings with gradient borders. The `storyRingGradient`, `storyRingInner`, `storyAvatarWrap`, and `storyAvatar` styles are dead code — defined but unused. The `StoryBubble` type (line 192) is defined but never instantiated.

This means ThryftVerse's "Posters" rail uses a **card-based layout** (rectangular tiles with creator name overlay) rather than the Instagram/Snapchat story-ring pattern that `Design.md` §Component A explicitly specifies: "Story rail (optional): horizontal scroll of story avatars, 64pt rings, 8px spacing, seen/unseen ring states" and "Story ring: 3px gradient border (`accent-social` → `colors.brand`), seen state = `colors.border` 2px ring. Story label below in `Type.caption`."

The `Design.md` §Poster/Story Composer section (lines 1304–1309) further specifies: "The story tray has a 'Your Poster' create card as the first item, with a gradient ring and camera icon... Story cards have a 3.5px gradient ring (unseen) and 2px muted ring (seen), with subtle shadow." None of this is rendered. The dead styles suggest an incomplete migration from a ring layout to a card layout.

### Defect 4 — Inconsistent verified badge grammar

The verified badge appears in at least four different forms across the codebase:

1. **`ProfileVisualHeader`** (`components/profile/ProfileVisualHeader.tsx:108-112`) — `checkmark-circle` icon, 18pt, `Colors.brand`, positioned `top: -2, right: -2` on the avatar with a `Colors.surface` background container.
2. **`ProfileHero`** (`components/profile/ProfileHero.tsx:234-242`) — Uses `VERIFICATION_TIERS[verificationTier].icon` (which can be `checkmark-circle`, `card-outline`, or `shield-checkmark`), 18pt, color from tier config (`brand` or `success`), positioned inline next to display name (not on avatar).
3. **`MyProfileIdentityHero`** (`components/profile/MyProfileIdentityHero.tsx:117-131`) — Same `VERIFICATION_TIERS` system, 17pt, inline next to display name.
4. **`CommerceDetailSellerRow`** (`components/commerce/detail/CommerceDetailSellerRow.tsx:123-127`) — Two variants: `checkmark-circle-outline` 15pt `colors.brand` for institutional, `checkmark-circle` 14pt `colors.success` for individual. Inline with name.
5. **`ProductCardV2`** (`components/ProductCardV2.tsx:333-341`) — `checkmark-circle-outline`, **11pt**, `colors.success`. Inline with seller name.

The `VERIFICATION_TIERS` system (`platform/product/listingDetailContract.ts:37-59`) is well-designed — three tiers (email, id, seller) with distinct icons and labels. But it is applied inconsistently: `ProfileVisualHeader` ignores it entirely (hardcoded `checkmark-circle` + `Colors.brand`), while `ProfileHero` and `MyProfileIdentityHero` use it correctly. The badge size ranges from 11pt to 18pt with no scaling rule. The position alternates between avatar-overlay and name-inline. The color alternates between `brand` and `success` for the same tier.

This violates `AGENTS.md` §4 "Icon grammar": "A region uses one icon family, one optical size band and a stable outline/filled-state rule." The verified badge uses both `checkmark-circle` (filled) and `checkmark-circle-outline` (outline) in the same product detail screen depending on whether the seller is institutional or individual.

### Defect 5 — Missing online indicator / presence dot

There is **no online indicator or presence dot component** anywhere in the codebase. A grep for `online` and `presence` across `frontend/src/components` returns no avatar-attached presence indicator. The `AvatarRing` component (`components/chat/AvatarRing.tsx`) has an `isUnread` ring state but no "is online" dot. The chat inbox (`InboxScreen.tsx`) shows unread state via ring color but does not show whether the user is currently online.

In 2026, presence indicators are standard on messaging surfaces. The consensus from UX research: "Green dot for online, gray for away, hollow ring for offline. Keep the sizes small – they're supporting information, not a headline" ([ethora.com](https://ethora.com/blog/chat-app-ui-ux-design/)). GetStream's React Native chat SDK ships an `OnlineIndicator` with sizes `'sm'` (8px) through `'xl'` (16px), green for online and grey for offline, sourced from semantic tokens ([getstream.io](https://getstream.io/chat/docs/sdk/react-native/ui-components/base-ui/online-indicator/)). Canonical's usability testing found that 4 out of 5 users preferred the green dot over text for online status due to scannability, and placement next to the avatar had the edge ([canonical.com](https://canonical.com/blog/what-is-the-best-way-to-display-online-status-we-tested-it)).

### Defect 6 — Weak social proof on product detail

The `CommerceDetailSellerRow` (`components/commerce/detail/CommerceDetailSellerRow.tsx`) shows seller name, optional verified icon, and a subtitle line that concatenates "Verified issuer · 4.8 · 122 reviews · London, UK" with `·` separators (line 72-76). This is a compact inline row — good. But it lacks:

- **Follower count** — not shown on the seller row. The user must navigate to the full profile to see how many people follow this seller.
- **Sales count** — only shown if `ratingLine` or `locationLine` includes it; no dedicated `soldCount` display.
- **Response rate / dispatch speed** — mentioned in `Design.md` §Profile/storefront header micro spec ("Real seller stats only: sales, rating, response/dispatch signal") but not surfaced on the product detail seller row.

The `SellerReputationCard` (rendered on `UserProfileScreen.tsx:529`) shows the full metric breakdown, but it only appears on the profile page — not on the product detail where the purchase decision happens. This violates the 2026 social-proof placement principle: "A star rating displayed below the fold or buried in a reviews section cannot do its persuasive work at the moment a visitor is deciding whether to add to cart" ([mida.so](https://www.mida.so/blog/social-proof-placement-product-page)).

### Defect 7 — Follow button state inconsistency

The follow button appears in three different forms:

1. **`ProfileHero`** (`components/profile/ProfileHero.tsx:307-324`) — Full-pill, `followBtn` / `followingBtn` / `followBtnActive` states, loading spinner, haptic light, accessibility label. Well-designed.
2. **`ProfileVisualHeader`** (`components/profile/ProfileVisualHeader.tsx:152-179`) — Does not render a Follow button at all. For other-user state, it shows "Message" as primary and "Share" + "More" as secondary. The follow action is missing entirely.
3. **`UserProfileScreen` collapsed header** (`screens/UserProfileScreen.tsx:878`) — `collapsedFollowBtn` / `collapsedFollowingBtn` / `collapsedFollowActiveBtn` with text-only states. Compact, in the sticky collapsed header.

The `ProfileVisualHeader` missing follow button is a P1 defect — a seller profile without a follow action fails the Depop gate: "seller actions (Follow, Message, Shop, Edit) disappear or are inconsistent" (`Design.md` §Depop gate). The `ProfileVisualHeader` appears to be a legacy component that has been partially superseded by `ProfileHero`, but its continued existence creates inconsistency.

### Defect 8 — Avatar fallback inconsistency

Each avatar implementation has a different fallback strategy:

- `AvatarRing` (`chat/AvatarRing.tsx:53-67`): initials in a `colors.surface` circle.
- `GroupAvatarMosaic` (`chat/GroupAvatarMosaic.tsx:59-83`): initials in `colors.surfaceAlt` circle, derived from display name.
- `FlagshipProfileMedia` (`flagship/FlagshipProfileMedia.tsx:165-179`): `person` icon over a linear gradient (`#F0EBE6 → #E2DDD6` light, `#1F1F1F → #161616` dark).
- `ProfileVisualHeader` (`profile/ProfileVisualHeader.tsx:95-102`): `CachedImage` with `emptyLabel="Avatar"` and `emptyIcon="person-outline"` — delegates to `CachedImage`'s internal fallback.
- `ProfileHero` (`profile/ProfileHero.tsx:170-174`): monogram initials (`getInitials()`) in `avatarMonogram` style.
- `MyProfileIdentityHero` (`profile/MyProfileIdentityHero.tsx:90-92`): `person-outline` icon in `colors.textMuted`.
- `CommerceDetailSellerRow` (`commerce/detail/CommerceDetailSellerRow.tsx:108-113`): first initial of name in `colors.textSecondary`.

Seven different fallbacks. Some use initials, some use a person icon, some use a gradient, some use a monogram. The 2026 Figma consensus is clear: "Ship one Avatar component with `type` variants — not separate 'UserPhoto' and 'UserCircle' components that drift apart" ([justfigma.com](https://justfigma.com/designing-avatars-and-user-profile-ui-in-figma/)). The fallback should be: image → initials (with name-hash background colour) → icon. One algorithm, one component.

---

## 4. Micro Improvements

### 4.1 — Fix the 16pt seller avatar on ProductCardV2

**File:** `components/ProductCardV2.tsx:596-599`
**Change:** Increase from 16pt to 24pt, change `borderRadius: Radius.md` to `borderRadius: Radius.full` (circular), increase placeholder icon from 10pt to 14pt. This is the minimum size for a face to be legible in a discovery context. The 8px increase is within the existing card layout — the seller identity row has `minHeight: 32` and `gap: 5`, so a 24pt avatar fits without reflow.

### 4.2 — Unify the verified badge to VERIFICATION_TIERS everywhere

**Files:** `components/profile/ProfileVisualHeader.tsx:108-112`, `components/commerce/detail/CommerceDetailSellerRow.tsx:123-127`, `components/ProductCardV2.tsx:333-341`
**Change:** Replace all hardcoded `checkmark-circle` / `checkmark-circle-outline` icons with `VERIFICATION_TIERS[verificationTier].icon`. Use `colors.success` for email/seller tiers and `colors.brand` for id tier, matching the tier config. Scale the badge to 40% of avatar diameter (min 12pt, max 20pt).

### 4.3 — Add a presence dot to AvatarRing

**File:** `components/chat/AvatarRing.tsx`
**Change:** Add an optional `online?: boolean` prop. When true, render a green dot at bottom-right, sized at 25% of avatar diameter (min 8pt), with a 2px border matching `colors.background`. This brings the chat avatar in line with the 2026 presence-dot consensus.

### 4.4 — Fix the dead story ring styles

**File:** `screens/HomeScreen.tsx:1577-1606`
**Change:** Either implement the story ring layout (circular avatars with gradient rings) as specified in `Design.md` §Component A, or delete the dead styles. The current state — defined but unused — is confusing for future maintainers and suggests an incomplete migration.

### 4.5 — Add follower count to CommerceDetailSellerRow

**File:** `components/commerce/detail/CommerceDetailSellerRow.tsx`
**Change:** Add an optional `followerCount?: number` prop. When present, append "· {formatCompactCount(followerCount)} followers" to the subtitle line. This surfaces social proof at the decision moment without adding a new visual element.

---

## 5. Macro Improvements

### 5.1 — Avatar system: one component, size scale, states

Create a single `Avatar` component at `frontend/src/components/ui/Avatar.tsx` that replaces all ten independent implementations. The component should accept:

```typescript
interface AvatarProps {
  uri?: string | null;
  initials?: string;
  size?: AvatarSize;        // 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  shape?: 'circle' | 'squircle' | 'rounded';  // default 'circle'
  online?: boolean;          // presence dot
  verified?: VerificationTier;  // badge overlay
  storyRing?: 'unseen' | 'seen' | 'none';
  editable?: boolean;        // camera button overlay
  onPress?: () => void;
  cacheBuster?: string;
}
```

**Size scale** (aligned to `ProfileLayout` tokens in `designTokens.ts:608-619` and the 2026 Figma consensus):

| Token | Diameter | Use case | Current implementation |
|-------|----------|----------|------------------------|
| `xs` | 24pt | Dense tables, comment threads, collapsed headers | `UserProfileScreen` collapsed (28pt — close) |
| `sm` | 32pt | Inline mentions, compact lists, notification rows | `InboxScreen` group avatar text |
| `md` | 40pt | Default nav, cards, seller rows, chat inbox | `AvatarRing` (52pt — too large), `CommerceDetailSellerRow` (40pt ✓) |
| `lg` | 56pt | Profile list rows, search results, story rail inner | `HomeScreen` story avatar (54pt — close) |
| `xl` | 88pt | Profile header, account settings | `ProfileHero` (88pt ✓), `MyProfileIdentityHero` (84pt — close) |
| `2xl` | 104pt | Onboarding, edit-profile hero | `FlagshipProfileMedia` (104pt ✓) |

**Fallback strategy** (one algorithm): image → initials (derived from display name, background colour from name hash using a fixed palette of 8–12 distinguishable hues) → `person-outline` icon in `colors.textMuted`. No gradients, no per-component custom fallbacks.

**States:**
- **Online dot:** bottom-right, 25% of diameter (min 8pt, max 16pt), `colors.success` fill, 2px border matching surface. Scales with avatar size.
- **Verified badge:** bottom-right (or inline next to name when avatar is < 32pt), icon from `VERIFICATION_TIERS`, 40% of avatar diameter (min 12pt, max 20pt), tier colour. For `xs`/`sm` avatars, render the badge inline next to the name, not on the avatar.
- **Story ring:** outer ring, 3.5pt gradient (`accent-social` → `colors.brand`) for unseen, 2pt `colors.border` at 64% opacity for seen. Ring sits outside the avatar with a 2pt `colors.background` seam.
- **Editable:** camera button overlay, bottom-right, 28pt circle, `colors.brand` background, 2px `colors.background` border, camera icon 14pt white. Only when `editable` is true.

### 5.2 — Identity stack: avatar + name + verified + bio + stats

Define a composable `IdentityStack` component that combines the avatar, display name, verified badge, handle, bio, and stats in a single coherent unit. This replaces the ad-hoc composition in `ProfileVisualHeader`, `ProfileHero`, and `MyProfileIdentityHero`.

**Composition (profile header context):**
```
[Avatar 88pt]  [Display Name — Type.title]  [Verified badge — 18pt]
                [@handle — Type.captionElevated]
                [Bio — Type.body, max 3 lines]
                [Stats row: For sale · Followers · Following]
                [Actions: Follow / Edit · Message · More]
```

**Composition (inline seller row context):**
```
[Avatar 40pt]  [Name — Type.bodyEmphasis]  [Verified — 14pt]
               [4.8 ★ · 122 reviews · 1.2K followers]
                                               [Follow]
```

The identity stack adapts its density to context: full profile header (xl avatar, full bio, all stats), product detail seller row (md avatar, one-line subtitle, follow action), discovery card (sm avatar, name only, no stats).

### 5.3 — Social proof system

Create a `SocialProofLine` component that renders a compact, inline social-proof string from structured data:

```typescript
interface SocialProofLineProps {
  rating?: number | null;
  reviewCount?: number;
  soldCount?: number;
  followerCount?: number;
  responseRate?: number;
  memberSince?: string;
  maxSignals?: number;  // default 3
}
```

Renders: `"4.9 ★ · 47 sold · 1.2K followers"` in `Type.captionElevated`, `colors.textSecondary`, with `·` separators. Each signal is a tappable `Pressable` when an `onPress` handler is provided (e.g. tapping "4.9 ★" opens reviews, tapping "1.2K followers" opens followers list). The `maxSignals` parameter controls density — on product detail, show 3 signals; on discovery cards, show 1 (rating only or sold count only).

This replaces the ad-hoc subtitle concatenation in `CommerceDetailSellerRow` (line 72-76) and the scattered trust signals in `ProfileHero` (lines 271-297) with one component, one formatting rule, one tap-target system.

### 5.4 — Story ring system

Implement a `StoryRing` component at `frontend/src/components/ui/StoryRing.tsx` that renders the Instagram/Snapchat-style circular story ring:

```typescript
interface StoryRingProps {
  avatarUri?: string | null;
  initials?: string;
  label?: string;
  state: 'unseen' | 'seen' | 'creating';
  size?: number;          // default 64pt (Design.md §Component A)
  onPress?: () => void;
  badgeCount?: number;    // "3 new" badge
}
```

**Visual spec (from `Design.md` §Component A and §Poster/Story Composer):**
- Outer ring: 62pt diameter, 3.5pt gradient border (`accent-social` → `colors.brand`) for unseen, 2pt `colors.border` at 64% opacity for seen.
- Inner avatar: 54pt, circular, `colors.background` 2pt seam between ring and avatar.
- Label: below ring, `Type.caption` (12pt), `colors.textSecondary`, max 1 line, 66pt width, centered.
- "Creating" state: gradient ring with camera icon overlay (Design.md §Poster entry point).
- Badge: "N new" pill, top-right of ring, `colors.brand` background, white text, `Type.label` (11pt).
- Ring shadow: `Elevation.subtle` for unseen (draws the eye), none for seen.

Replace the rectangular poster card layout in `HomeScreen.tsx:863-926` with this ring layout. The rectangular tiles can remain as an alternative for a "featured posters" module, but the primary story rail should use rings — the pattern users already know from Instagram/Snapchat.

### 5.5 — Follow button system

Create a `FollowButton` component at `frontend/src/components/ui/FollowButton.tsx`:

```typescript
interface FollowButtonProps {
  isFollowing: boolean;
  isPending?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  variant?: 'primary' | 'compact' | 'icon';
  size?: 'sm' | 'md' | 'lg';
}
```

**States (from `ProfileHero` pattern, generalised):**
- **Not following:** `colors.brand` background, `colors.textInverse` text, "Follow" label, full-pill `Radius.full`, 44–52pt height.
- **Following:** transparent background, 1px `colors.border` border, `colors.textPrimary` text, "Following" label.
- **Pending:** same as current state, `ActivityIndicator` replaces text, 0.4 opacity.
- **Disabled:** 0.4 opacity on entire button.
- **Pressed:** 0.97 scale, haptic light.
- **Compact variant:** text-only, no background, `colors.textPrimary`, for inline seller rows and collapsed headers.
- **Icon variant:** `person-add-outline` → `checkmark` icon transition, for dense contexts.

This replaces the three independent follow-button implementations in `ProfileHero`, `ProfileVisualHeader` (missing), and `UserProfileScreen` collapsed header.

---

## 6. Flagship Acceptance Criteria

### Avatar size scale
- [ ] One `Avatar` component used across all surfaces (feed, profile, chat, product detail, story rail, notifications).
- [ ] Six size tokens: xs (24pt), sm (32pt), md (40pt), lg (56pt), xl (88pt), 2xl (104pt).
- [ ] No avatar smaller than 24pt anywhere in the app. No 16pt avatars.
- [ ] All avatars circular (`Radius.full`) unless `shape` prop explicitly overrides (institutional squircle).
- [ ] Fallback: image → initials (name-hash colour) → person icon. One algorithm, no gradients.

### Verified badge grammar
- [ ] All verified badges use `VERIFICATION_TIERS` from `listingDetailContract.ts`.
- [ ] Badge size scales with avatar: 40% of diameter, min 12pt, max 20pt.
- [ ] For avatars < 32pt, badge renders inline next to name, not on avatar.
- [ ] One icon family: `checkmark-circle` (email), `card-outline` (id), `shield-checkmark` (seller). No mixing filled/outline for the same tier.
- [ ] Badge always has `accessibilityLabel` with the tier label (e.g. "Verified", "ID Verified", "Trusted Seller").
- [ ] Never fabricated — only rendered when backend confirms the tier.

### Story ring animation
- [ ] Unseen ring: 3.5pt gradient (`accent-social` → `colors.brand`), `Elevation.subtle` shadow.
- [ ] Seen ring: 2pt `colors.border` at 64% opacity, no shadow.
- [ ] Ring transitions from unseen → seen with a `Duration.normal` (250ms) crossfade, not a pop.
- [ ] "Creating" state: gradient ring with camera icon, distinct from unseen.
- [ ] Label below ring: `Type.caption`, 1 line, centered, 66pt width.
- [ ] Reduced motion: instant transition, no animation.
- [ ] "N new" badge on first unwatched story when count > 1.

### Social proof placement
- [ ] Product detail seller row shows: rating + review count + sold count (or follower count) in one inline `SocialProofLine`.
- [ ] Profile header shows: For sale · Followers · Following in one seam row (not scattered across two rows).
- [ ] Discovery card shows: at most 1 social proof signal (sold count or rating), not all signals.
- [ ] Social proof is never placed after the payment/CTA step.
- [ ] Star rating uses `colors.warning` (gold/amber) or `colors.brand`, never low-contrast colours.
- [ ] Counts use `formatCompactCount` for display and `formatFullCount` for accessibility labels.

### Identity stack composition
- [ ] Profile header: avatar (xl) + display name (Type.title) + verified badge + handle + bio (max 3 lines) + stats row + actions.
- [ ] Product detail seller row: avatar (md) + name (Type.bodyEmphasis) + verified badge + social proof line + follow action.
- [ ] Discovery card: avatar (sm) + @handle (Type.caption) + verified badge (inline, 12pt).
- [ ] Chat inbox: avatar (md) + name + last message + timestamp + unread ring + online dot.
- [ ] Story rail: story ring (64pt) + label (Type.caption).
- [ ] Collapsed header: avatar (xs) + name (Type.bodyEmphasis) + follow button (compact).

---

## 7. Priority & Sequencing

### Phase 1 — Foundation (P0, ship-blocker)
1. **Create `Avatar` component** (`components/ui/Avatar.tsx`) with size scale, fallback algorithm, and optional online/verified/storyRing/editable states. This is the shared primitive that unblocks all other work.
2. **Fix `ProductCardV2` seller avatar** — increase from 16pt to 24pt, make circular. One-line fix once `Avatar` exists.
3. **Unify verified badge** — replace all hardcoded badge icons with `VERIFICATION_TIERS` lookups.

### Phase 2 — Identity surfaces (P1, flagship-blocker)
4. **Create `IdentityStack` component** — composable avatar + name + verified + bio + stats for profile and seller contexts.
5. **Create `SocialProofLine` component** — compact inline social proof with tappable signals.
6. **Migrate `ProfileHero` and `MyProfileIdentityHero`** to use `Avatar` and `SocialProofLine`.
7. **Add follower count to `CommerceDetailSellerRow`** via `SocialProofLine`.

### Phase 3 — Engagement systems (P1, flagship-blocker)
8. **Create `StoryRing` component** — implement the ring layout from `Design.md` §Component A.
9. **Migrate `HomeScreen` poster rail** from rectangular tiles to story rings.
10. **Create `FollowButton` component** — unify the three follow-button implementations.
11. **Add presence dot to chat avatars** — `AvatarRing` delegates to `Avatar` with `online` prop.

### Phase 4 — Polish (P2)
12. **Delete `ProfileVisualHeader`** or migrate it to use `Avatar` + `IdentityStack` — it is a legacy component superseded by `ProfileHero`.
13. **Delete dead story ring styles** in `HomeScreen.tsx` once `StoryRing` is implemented.
14. **Add reduced-motion fallbacks** for all story ring transitions and badge state changes.
15. **Audit all avatar surfaces** for light/dark parity — verify fallback colours, border colours, and badge colours in both themes.

---

## 8. Token-Level Spec Table

| Component | Token | Value | Source |
|-----------|-------|-------|--------|
| **Avatar XS** | diameter | 24pt | New token `AvatarSize.xs` |
| Avatar XS | border radius | `Radius.full` (999px) | `designTokens.ts:115` |
| Avatar XS | fallback icon size | 14pt | `person-outline` |
| Avatar XS | verified badge | inline (not on avatar) | — |
| Avatar XS | presence dot | 8pt (min) | `colors.success`, 2px border |
| **Avatar SM** | diameter | 32pt | New token `AvatarSize.sm` |
| Avatar SM | border radius | `Radius.full` | `designTokens.ts:115` |
| Avatar SM | fallback | initials, name-hash colour | 8–12 hue palette |
| Avatar SM | verified badge | inline (not on avatar) | — |
| Avatar SM | presence dot | 8pt | `colors.success`, 2px border |
| **Avatar MD** | diameter | 40pt | Aligns to `CommerceDetailSellerRow` |
| Avatar MD | border radius | `Radius.full` | `designTokens.ts:115` |
| Avatar MD | fallback | initials, name-hash colour | — |
| Avatar MD | verified badge | 14pt, bottom-right overlay | `VERIFICATION_TIERS[tier].icon` |
| Avatar MD | presence dot | 10pt | `colors.success`, 2px border |
| Avatar MD | hit target | 44pt (parent `Pressable`) | `AGENTS.md` §13 |
| **Avatar LG** | diameter | 56pt | New token `AvatarSize.lg` |
| Avatar LG | border radius | `Radius.full` | `designTokens.ts:115` |
| Avatar LG | fallback | initials, name-hash colour | — |
| Avatar LG | verified badge | 16pt, bottom-right overlay | `VERIFICATION_TIERS[tier].icon` |
| Avatar LG | presence dot | 12pt | `colors.success`, 2px border |
| **Avatar XL** | diameter | 88pt | `ProfileLayout.avatarStandard` (`designTokens.ts:609`) |
| Avatar XL | border | 3px `colors.background` | `Design.md` §Profile header micro spec |
| Avatar XL | border radius | `Radius.full` | `designTokens.ts:115` |
| Avatar XL | fallback | initials, name-hash colour | — |
| Avatar XL | verified badge | 18pt, inline next to name | `VERIFICATION_TIERS[tier].icon` |
| Avatar XL | editable button | 28pt circle, `colors.brand`, camera 14pt white | `FlagshipProfileMedia` pattern |
| **Avatar 2XL** | diameter | 104pt | `FlagshipProfileMedia` `AVATAR_SIZE` |
| Avatar 2XL | border | 4px `colors.background` | `FlagshipProfileMedia` pattern |
| Avatar 2XL | border radius | `Radius.full` | `designTokens.ts:115` |
| Avatar 2XL | fallback | initials, name-hash colour | — |
| Avatar 2XL | editable button | 28pt circle, `colors.brand`, camera 14pt white | `FlagshipProfileMedia` pattern |
| **Story Ring** | outer diameter | 62pt | `HomeScreen.tsx:1578` (existing style) |
| Story Ring | inner avatar | 54pt | `HomeScreen.tsx:1598` (existing style) |
| Story Ring | unseen border | 3.5pt gradient (`accent-social` → `colors.brand`) | `Design.md` §Component A |
| Story Ring | seen border | 2pt `colors.border` at 64% opacity | `Design.md` §Component A |
| Story Ring | seam | 2pt `colors.background` between ring and avatar | `Design.md` §Profile header micro spec |
| Story Ring | label | `Type.caption` (12/16/400), `colors.textSecondary`, 1 line, 66pt width | `Design.md` §Component A |
| Story Ring | shadow (unseen) | `Elevation.subtle` | `designTokens.ts:127` |
| Story Ring | shadow (seen) | `Elevation.none` | `designTokens.ts:126` |
| Story Ring | transition | `Duration.normal` (250ms) crossfade | `designTokens.ts:135` |
| Story Ring | "N new" badge | `colors.brand` bg, `colors.textInverse` text, `Type.label` (11/14/600), `Radius.full` | New |
| **Verified Badge** | icon (email) | `checkmark-circle`, `colors.success` | `listingDetailContract.ts:41-43` |
| Verified Badge | icon (id) | `card-outline`, `colors.brand` | `listingDetailContract.ts:45-49` |
| Verified Badge | icon (seller) | `shield-checkmark`, `colors.success` | `listingDetailContract.ts:52-57` |
| Verified Badge | size rule | 40% of avatar diameter, min 12pt, max 20pt | New rule |
| Verified Badge | position (avatar ≥ 32pt) | bottom-right overlay, 2px `colors.surface` border | `ProfileVisualHeader` pattern |
| Verified Badge | position (avatar < 32pt) | inline next to name, 8px gap | `ProductCardV2` pattern |
| Verified Badge | accessibility | `accessibilityLabel` = tier label, `accessibilityRole="image"` | `AGENTS.md` §13 |
| **Online Indicator** | size rule | 25% of avatar diameter, min 8pt, max 16pt | [justfigma.com](https://justfigma.com/designing-avatars-and-user-profile-ui-in-figma/) |
| Online Indicator | online colour | `colors.success` | `designTokens.ts:36` |
| Online Indicator | offline colour | `colors.textMuted` | `designTokens.ts:31` |
| Online Indicator | border | 2px `colors.background` (or `colors.surface` on media) | [getstream.io](https://getstream.io/chat/docs/sdk/react-native/ui-components/base-ui/online-indicator/) |
| Online Indicator | position | bottom-right of avatar | [canonical.com](https://canonical.com/blog/what-is-the-best-way-to-display-online-status-we-tested-it) |
| Online Indicator | accessibility | `accessibilityLabel="Online"` / `"Offline"`, `accessibilityRole="image"` | `AGENTS.md` §13 |
| **Creator Card** | avatar | `Avatar` md (40pt) | — |
| Creator Card | name | `Type.bodyEmphasis` (15/21/600), `colors.textPrimary` | `Design.md` §Profile header micro spec |
| Creator Card | handle | `Type.captionElevated` (13/18/400), `colors.textSecondary`, `@` prefix | `Design.md` §Profile header micro spec |
| Creator Card | verified badge | 14pt, inline next to name | `VERIFICATION_TIERS` |
| Creator Card | social proof | `SocialProofLine`, `Type.captionElevated`, max 3 signals | New component |
| Creator Card | follow action | `FollowButton` compact variant, right-aligned | New component |
| Creator Card | background | transparent (flat canvas), no card container | `AGENTS.md` §4 Surface budget |
| Creator Card | min height | 44pt (hit target for identity press) | `AGENTS.md` §13 |
| **Follow Button** | primary height | 44–52pt | `Design.md` §Profile header micro spec |
| Follow Button | primary radius | `Radius.full` (999px) | `Design.md` §Button primary |
| Follow Button | not-following bg | `colors.brand` | `designTokens.ts:28` |
| Follow Button | not-following text | `colors.textInverse`, `Type.bodyEmphasis` | `designTokens.ts:32` |
| Follow Button | following bg | transparent | — |
| Follow Button | following border | 1px `colors.border` | `designTokens.ts:33` |
| Follow Button | following text | `colors.textPrimary`, `Type.bodyEmphasis` | `designTokens.ts:29` |
| Follow Button | pending | `ActivityIndicator` small, current-state colours, 0.4 opacity | `ProfileHero` pattern |
| Follow Button | pressed | 0.97 scale, haptic light | `AGENTS.md` §13, `designTokens.ts:524` |
| Follow Button | compact variant | text-only, no bg, `colors.textPrimary`, `Type.bodyEmphasis` | `CommerceDetailSellerRow` pattern |
| Follow Button | a11y | `accessibilityLabel="Follow user"` / `"Unfollow user"`, `accessibilityRole="button"` | `ProfileHero` pattern |
| **Follower Count** | display format | `formatCompactCount` (1.2K, 3.4M) | `utils/numberFormat.ts` |
| Follower Count | a11y format | `formatFullCount` (1,243) in `accessibilityLabel` | `ProfileHero` pattern |
| Follower Count | typography | `Type.bodyEmphasis` (value) + `Type.captionElevated` (label) | `ProfileHero` seam stat pattern |
| Follower Count | colour (value) | `colors.textPrimary` | `designTokens.ts:29` |
| Follower Count | colour (label) | `colors.textSecondary` | `designTokens.ts:30` |
| Follower Count | tap target | 44pt min (parent `Pressable`) | `AGENTS.md` §13 |
| Follower Count | separator | `·` in `colors.textMuted`, 8px gap | `MyProfileIdentityHero` pattern |
| **Reputation Badge** | height | 24–28pt | `Design.md` §Premium badge micro spec |
| Reputation Badge | radius | `Radius.full` | `Design.md` §Premium badge micro spec |
| Reputation Badge | bg (runtime) | `colors.surface` + 1px `colors.border` | `Design.md` §Premium badge micro spec |
| Reputation Badge | bg (premium, post-migration) | `softGoldSurfaceLight` / `softGoldSurfaceDark` | `Design.md` YAML front matter |
| Reputation Badge | icon | `VERIFICATION_TIERS[tier].icon`, 14–18pt | `listingDetailContract.ts` |
| Reputation Badge | text | `Type.label` (11/14/600), `colors.textPrimary` | `designTokens.ts:104` |
| Reputation Badge | max per row | 1 premium badge cluster | `Design.md` §Premium badge micro spec |
| Reputation Badge | truthfulness | only render when backend confirms tier | `AGENTS.md` §11 |

---

## 9. Web Sources

1. [Avatars for Foldables: Adaptive Identity UX](https://loging.xyz/designing-avatars-for-foldables-adapting-identity-ux-to-ultra) — foldable-aware avatar and presence indicator guidelines, 2026.
2. [Avatars & User Profile UI in Figma (2026)](https://justfigma.com/designing-avatars-and-user-profile-ui-in-figma/) — avatar size scale (xs–2xl), type variants, status dot scaling rules, single-component principle.
3. [Foldable Screens: Avatar & Profile UI Guide](https://preferences.live/designing-avatar-profile-uis-for-foldable-screens-what-marke) — responsive avatar composition, focal-point preservation, modular identity components.
4. [Responsive Avatars and Favicons for Foldables](https://favicon.live/designing-avatars-and-favicons-for-foldable-devices-lessons-) — multi-resolution avatar packs, safe-area rules, identity asset fragmentation.
5. [Badge UI: Design Principles, Types and Real Examples (2026)](https://www.eleken.co/blog-posts/badge-ui-design) — badge types, truncation thresholds, accessibility, "a badge is a promise."
6. [Quick Tutorial: Microbadge Type for Live Streams](https://font.news/quick-tutorial-designing-microbadge-type-for-live-streams-an) — 2026 microbadge best practices, contrast ratios, ARIA labels, reduced-motion, Bluesky LIVE badges.
7. [Live Badge Design Sprint for Creator Platforms](https://mypic.cloud/live-badge-design-sprint-rapid-prototyping-for-real-time-cre) — badge states (live, verified, monetizable), placement, fraud/privacy/accessibility risk checklist.
8. [Avatar with Verification Check (shadcn/ui)](https://www.shadcn.io/examples/avatar-with-verification-check-standard) — verified checkmark badge pattern, bottom-right avatar overlay, scaling rules.
9. [Story Bubbles on Product Pages: The Instagram UX Your Customers Already Know](https://eevy.ai/blog/story-bubbles-conversion) — story bubbles as social proof, 2–3x mobile engagement, full-screen vertical format.
10. [Building an Instagram-Style Home Screen in Jetpack Compose (Apr 2026)](https://medium.com/@ramadan123sayed/building-an-instagram-style-home-screen-in-jetpack-compose-stories-row-with-gradient-ring-feed-85f114bf81d9) — gradient story ring implementation, double-tap heart, action bar grammar.
11. [expo-story-rings (GitHub)](https://github.com/onurdevs/expo-story-rings) — React Native/Expo story ring component, seen/unseen states, ring colour props, analytics callbacks.
12. [Stories Ring layout (Idukki)](https://idukki.io/help/layout-stories-ring) — circular avatar bubbles, fullscreen viewer, above-the-fold social proof placement.
13. [Mobile App Design Trends 2026 (Muzli)](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/) — 2026 UI pattern shifts, structural over visual changes, navigation and authentication evolution.
14. [Mobile vs Desktop Social Proof Patterns (Idukki)](https://idukki.io/blog/mobile-vs-desktop-social-proof-patterns) — mobile-first social proof, compact scannable swipeable proof, inline placement near decision.
15. [Social Proof on Shopify Product Pages (Reviews on Metaobjects)](https://reviewsonmetaobjects.com/blog/social-proof-shopify-product-pages) — two-step persuasion pattern, above-fold rating + below-fold reviews, 44px tap targets.
16. [Social Proof for Apps (Airbridge)](https://www.airbridge.io/en/blog/social-proof-for-apps) — three trust moments in user journey, loading-screen trust layer, specific user counts.
17. [Above-the-fold Social Proof (Idukki)](https://idukki.io/blog/above-the-fold-social-proof) — first-screen trust formation, lightweight proof signals, LCP competition.
18. [How Social Proof Placement Affects Conversions (Mida)](https://www.mida.so/blog/social-proof-placement-product-page) — five A/B tests, star rating position, verified buyer badge, UGC photo/video surfacing.
19. [Profile Page UI Design (UXPin, 2026)](https://www.uxpin.com/studio/blog/profile-page-ui-design/) — profile card anatomy, follow button placement within thumb reach, progressive profiling.
20. [Follow / Subscribe UX Pattern (UX Patterns Guide)](https://uxpatternsguide.com/patterns/follow-subscribe/) — per-object follow control, stateful rendering, target scope, delivery destination, unfollow availability.
21. [Designing User-Friendly Follow and Subscribe Screens (Cole Magazines)](https://colemagazines.com/designing-user-friendly-follow-and-subscribe-screens-in-mobile-apps/) — clear CTAs, personalisation, accessibility, cognitive load minimisation.
22. [Pattern 3: Core Interaction Loops (Nostr UX)](https://nostr-ux.com/docs/patterns/03-core-interactions/) — reliable follow/unfollow, read-modify-write pattern, optimistic UI with rollback.
23. [Presence & Live Badge Patterns — React Native](https://reactnative.live/design-system-patterns-for-live-badges-and-presence-indicato) — token-driven presence dots, PresenceDot/LiveBadge/StatusPill components, accessibility-first, performance at scale.
24. [OnlineIndicator — React Native Chat (GetStream)](https://getstream.io/chat/docs/sdk/react-native/ui-components/base-ui/online-indicator/) — presence dot size mapping (sm 8px – xl 16px), green/grey semantic tokens.
25. [What is the best way to display online status? (Canonical)](https://canonical.com/blog/what-is-the-best-way-to-display-online-status-we-tested-it) — usability testing: green dot preferred over text (4/5 users), placement next to avatar preferred.
26. [Chat App UI/UX Design (Ethora)](https://ethora.com/blog/chat-app-ui-ux-design/) — presence indicators (green/gray/hollow), 44pt tap targets, WebSocket-based presence, opt-out privacy.
27. [Instagram Profile Design in 2026 (SEOquick)](https://seoquick.com.ua/en/oformlenie-instagram/) — 320×320 avatar spec, 4:5 feed tiles, findability, AI signals, consistency.
28. [Pinterest Profile Picture Spec (MyPhotoAI)](https://myphotoai.io/pinterest-profile-picture/) — 165×165 min / 600×600 recommended, face fills 70% of circle, branded logo consistency.
29. [Instagram Profile Picture Size 2026 (Trustypost)](https://trustypost.ai/blog/instagram-profile-picture-size-2026-pixels-ratio-safe-crop/) — 320×320 upload, 110×110 display test, central 60–65% safe zone, circle mask.
30. [Social Media Image Sizes (PixelMeasures)](https://www.pixelmeasures.com/platform-sizes/) — cross-platform dimension reference for profile images, covers, thumbnails.

---

## 10. Summary

The ThryftVerse avatar and identity system is the most fragmented component family in the app. Ten independent avatar implementations, sizes from 16pt to 104pt, four different fallback strategies, inconsistent verified badge grammar, dead story ring styles, missing online indicators, and scattered social proof — these are not isolated defects but symptoms of a missing shared primitive.

The fix is not to patch each implementation individually. It is to build **one `Avatar` component** with a disciplined size scale (xs–2xl), one fallback algorithm (image → initials → icon), one verified-badge grammar (`VERIFICATION_TIERS`), one presence-dot system, and one story-ring system — then migrate every surface to use it. The `IdentityStack`, `SocialProofLine`, `StoryRing`, and `FollowButton` components compose on top of `Avatar` to form a coherent identity system that matches or exceeds the 2026 benchmarks set by Instagram, Pinterest, eBay, and Snapchat.

The priority is clear: build the `Avatar` primitive first (Phase 1), then the identity surfaces (Phase 2), then the engagement systems (Phase 3), then polish and cleanup (Phase 4). Each phase delivers visible product improvement — not documentation, not audit, but rendered, native, flagship-quality identity.
