# 36 — Social Graph & Follow System: Flagship Research Report

> **Department:** Follow/unfollow, followers/following lists, mutual follows, follow recommendations, social graph traversal
> **Benchmark date:** 2026-08
> **Primary benchmarks:** Instagram · Snapchat · Pinterest
> **Sources:** production codebase audit · 2026 web research · AGENTS.md §4

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram's follow system is the benchmark for social apps:
- **Follow button** — "Follow" / "Following" toggle, blue→grey state change, haptic
- **Followers/Following lists** — tabbed screen, searchable, with "Least Interacted With" and "Most Shown in Feed" sorting
- **Mutual follows** — "Followed by X and 3 others" social proof on profile
- **Suggested users** — "Suggested for you" section in profile and feed, based on social graph
- **Follow notifications** — push notification when someone follows you
- **Follow from feed** — follow button on feed cards and story bar
- **Private accounts** — follow request flow for private accounts

### Snapchat (2026)
Snapchat's social graph is more intimate:
- **Add by Snapcode** — QR code scanning to add friends
- **Quick Add** — suggested friends based on mutual friends
- **Snap Map** — location-based friend discovery
- **Streaks** — gamified daily interaction (see Report #30)

### Pinterest (2026)
Pinterest's follow system is interest-based:
- **Follow boards, not people** — users follow topic boards, not entire accounts
- **"More like this"** — follow suggestions based on pinned content
- **No follower count display** — Pinterest de-emphasizes follower count (less social pressure)

### Cross-cutting 2026 consensus
- **One-tap follow/unfollow** — no confirmation dialog, instant toggle
- **Follow button state** — "Follow" (primary) → "Following" (secondary), clear visual distinction
- **Follower/following counts** — on profile, tappable to open lists
- **Suggested users** — based on social graph (mutual friends) and interest graph
- **Follow notifications** — push when followed
- **Social proof** — "Followed by X" or "N mutual friends" on profiles
- **Private account flow** — follow request + accept/decline

---

## 2. Psychology & Principles

### The follow as a commitment
Following someone is a lightweight commitment — the user is saying "I want to see more from this person." This creates a sense of obligation in the followed person to post content. For a marketplace, a follow means "I want to see when this seller lists new items" — it's a demand signal.

### Social proof and mutual follows
"3 mutual friends" is a powerful trust signal. It says "people you already trust trust this person." This is especially important for a marketplace where trust is the barrier to purchase. Showing mutual follows on a seller's profile directly increases buyer confidence.

### The follower count as status
Follower count is a status signal. Sellers with 10,000 followers feel more trustworthy than sellers with 10 followers. But obsessing over follower count creates social pressure (Pinterest's insight). The 2026 balance: show follower count on profile, but don't make it the dominant element.

### Follow recommendations as growth
"Suggested for you" is the primary growth mechanism for social graphs. When a user follows someone, the system suggests similar users. This grows the graph and increases engagement. The recommendation is based on: mutual friends, shared interests, similar browsing behavior.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Social graph/follow files

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `screens/FollowingScreen.tsx` | 366+ | Following list | ✅ Exists |
| `screens/FollowersScreen.tsx` | 366+ | Followers list | ✅ Exists |
| `hooks/useFollowingFeed.ts` | 131+ | Following feed composition | ✅ Senior |
| `services/profileApi.ts` | 205+ | Profile API with follow | ✅ Comprehensive |
| `screens/UserProfileScreen.tsx` | 882+ | Profile with follow button | ✅ Substantial |
| `components/profile/ProfileHero.tsx` | — | Profile header with follow | ✅ Exists |
| `components/profile/ProfileVisualHeader.tsx` | — | Visual header with follow | ✅ Exists |
| `components/profile/PublicProfileConnectionsSheet.tsx` | 182+ | Connections sheet | ✅ Exists |
| `components/commerce/CommercePartyStrip.tsx` | 263+ | Party strip with follow | ✅ Exists |
| `components/commerce/detail/CommerceDetailSellerRow.tsx` | — | Seller row with follow | ✅ Exists |
| `domain/user.ts` | — | User model with follow fields | ✅ Exists |

### What exists (genuinely substantial)
1. **FollowersScreen + FollowingScreen** — 366-line each, searchable lists with avatars, follow/unfollow buttons, pull-to-refresh
2. **useFollowingFeed** — composes a following feed client-side by fetching followed users' listings. Senior approach with parallel fetching and rate limiting.
3. **profileApi** — 24 matches for follow-related operations. `fetchFollowing`, follow/unfollow endpoints.
4. **UserProfileScreen** — 24 follow-related matches. Has follow button, follower/following counts, tappable to open lists.
5. **PublicProfileConnectionsSheet** — 21 matches. Shows connections (followers/following) in a sheet.
6. **CommercePartyStrip** — 20 matches. Shows seller info with follow button on PDP.
7. **CommerceDetailSellerRow** — seller row with follow on PDP.

### What's missing

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No mutual follows display** — no "N mutual friends" on profiles | High |
| 2 | **No suggested users** — no "Suggested for you" follow recommendations | High |
| 3 | **No follow notifications** — no push when someone follows you | Medium |
| 4 | **No private account flow** — no follow request + accept/decline | Low |
| 5 | **No shared FollowButton component** — follow buttons built inline per screen | Medium |
| 6 | **No follow from feed** — no quick follow button on feed cards | Medium |
| 7 | **No follow from story bar** — no follow in story viewer | Medium |
| 8 | **No "Least Interacted With" sorting** — no engagement-based sort on following list | Low |
| 9 | **No follow analytics** — no follower growth, follow/unfollow rate tracking | Low |
| 10 | **Client-side following feed composition** — N+1 API calls (fetches each followed user's listings individually) | Medium |

---

## 4. Micro Improvements

### M1 — Create shared FollowButton component
```tsx
interface FollowButtonProps {
  userId: string;
  isFollowing: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  variant?: 'primary' | 'compact' | 'inline';
  size?: 'sm' | 'md';
}
```
- `primary` — full button, "Follow" (brand fill) → "Following" (outline)
- `compact` — small button for feed cards and story bars
- `inline` — text-only "Follow" link

One-tap toggle, haptic on state change, animated state transition.

### M2 — Add mutual follows display
On UserProfileScreen, show "Followed by X, Y and N others" or "N mutual friends" below the follow button. Fetch mutual follows from API. Shows social proof.

### M3 — Add suggested users
"Suggested for you" section on:
- **HomeScreen** — "People you might like" rail
- **UserProfileScreen** — "Similar to this seller" after profile
- **FollowingScreen** — "Discover more" at the bottom

Based on: mutual friends, shared interests, similar browsing behavior.

### M4 — Add follow notifications
Push notification when someone follows you: "X started following you". Tappable → opens follower's profile. Integrates with Report #27 push notification system.

### M5 — Add follow from feed and story bar
Quick follow button on feed cards (compact variant). Follow button in story viewer creator row. One-tap, no navigation needed.

### M6 — Server-side following feed
Replace client-side composition in `useFollowingFeed` with a dedicated `/feed/following` backend endpoint. Eliminates N+1 API calls. The hook already has a comment noting this: "bridges the gap until a dedicated /feed/following backend endpoint is available."

### M7 — Add private account flow
- User can set account to private in settings
- Following a private account sends a "Follow Request"
- Private account owner sees requests in inbox
- Accept → follower added; Decline → request removed

---

## 5. Macro Improvements

### A1 — Social graph architecture
Create a unified social graph system:
- `FollowButton` — shared component (primary, compact, inline variants)
- `FollowersList` / `FollowingList` — shared list components
- `SuggestedUsers` — recommendation rail
- `MutualFollowsBadge` — "N mutual friends" social proof
- `useFollow` — hook for follow/unfollow with optimistic update
- `followApi` — unified API for all follow operations

### A2 — Interest graph + social graph
Combine the social graph (who you follow) with the interest graph (what you browse, save, buy) to power:
- Follow recommendations (mutual friends + similar interests)
- Following feed (listings from followed sellers)
- "For You" feed (listings from similar-taste users)

---

## 6. Flagship Acceptance Criteria

- **Shared FollowButton** — primary, compact, inline variants
- **Mutual follows display** — "N mutual friends" on profiles
- **Suggested users** — "Suggested for you" on home, profile, following
- **Follow notifications** — push when followed
- **Follow from feed and story bar** — one-tap, no navigation
- **Server-side following feed** — no N+1 API calls
- **Followers/Following lists** — searchable, sortable
- **Private account flow** — follow request + accept/decline
- **Optimistic follow/unfollow** — instant UI update, rollback on error
- **Accessibility** — VoiceOver labels for follow state

### Thumbnail test
At 25% scale, the follow button must be visually distinguishable: "Follow" (filled) vs "Following" (outline). On profile, follower/following counts must be readable.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared FollowButton | Low | All follow surfaces |
| P1 | M2 — Mutual follows display | Medium | Social proof |
| P1 | M3 — Suggested users | Medium | Graph growth |
| P1 | M5 — Follow from feed/stories | Low | Frictionless follow |
| P1 | M6 — Server-side following feed | Medium | Performance |
| P2 | M4 — Follow notifications | Low | Engagement |
| P2 | M7 — Private account flow | Medium | Privacy |
| P3 | A1 — Full social graph system | High | All graph surfaces |
| P3 | A2 — Interest + social graph | High | Recommendations |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `followButton.primary.height` | 36pt | Compact contained control |
| `followButton.primary.radius` | Radius.full | Pill |
| `followButton.primary.followBg` | colors.brand | Filled |
| `followButton.primary.followingBg` | transparent | Outline |
| `followButton.primary.followingBorder` | 1pt colors.border | |
| `followButton.compact.height` | 32pt | For feed cards |
| `followButton.compact.padding` | Space.sm + Space.xs | Horizontal + vertical |
| `followButton.inline.font` | Type.caption | 12pt |
| `followButton.inline.color` | colors.brand | |
| `followButton.haptic` | selection | On state change |
| `followButton.animation` | withTiming 150ms | State transition |
| `mutualFollows.font` | Type.caption | 12pt |
| `mutualFollows.color` | colors.textMuted | |
| `suggestedUsers.avatar.size` | 48pt | |
| `suggestedUsers.rail.height` | 80pt | Avatar + name + button |
| `followerCount.font` | Type.body-strong | |
| `followerCount.label` | Type.caption | "followers" |

---

*Generated 2026-08-18. Verified sources: transparency.meta.com/features/explaining-ranking/ig-suggested-accounts (AI-ranked suggestions, signals: mutual friends, follows, geo, engagement), hooleft.me/blog/instagram-suggested-accounts-why (mutual connections, phone contacts, linked Facebook, shared interests), hooleft.me/blog/can-you-see-mutual-followers-on-instagram (no complete mutuals list natively, "Followed by X and N others" partial view), getlurk.app/blog/instagram-mutual-followers (mutual followers vs mutual following distinction), facebook.com/help/instagram/741619032578266 (Discover People, Search and Explore). Production codebase audit: FollowersScreen, FollowingScreen, useFollowingFeed, profileApi, UserProfileScreen, CommercePartyStrip.*
