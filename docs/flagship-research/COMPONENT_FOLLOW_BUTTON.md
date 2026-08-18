# ThryftVerse Flagship Upgrade — Follow Button Component

**Component deep-dive:** follow/unfollow toggle, button states (primary/compact/inline), optimistic update, mutual follows badge, suggested users rail.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
- "Follow" (blue filled) → "Following" (grey outline) toggle
- One-tap, no confirmation, instant state change
- Haptic on state change
- Compact variant on feed cards and story bar
- "Suggested for you" rail with Follow buttons

### Cross-cutting 2026 consensus
- One-tap follow/unfollow, no confirmation
- Clear visual distinction: "Follow" (primary) vs "Following" (secondary)
- Multiple variants: full button, compact, inline text
- Optimistic update with rollback on error
- Haptic on state change
- "N mutual friends" social proof

---

## 2. Psychology & Principles

### The follow as commitment
Following someone is a lightweight commitment — "I want to see more from this person." This creates obligation in the followed person to post content. For commerce: "I want to see when this seller lists new items."

### One-tap reduces friction
A confirmation dialog adds friction. The 2026 standard: one-tap to follow, one-tap to unfollow, no confirmation. If the user accidentally unfollows, they can re-follow instantly. Friction-free is the goal.

### Mutual follows as trust
"3 mutual friends" is a powerful trust signal — "people you trust trust this person." This is especially important for marketplace trust. Showing mutual follows on profiles directly increases buyer confidence.

---

## 3. Current ThryftVerse Audit — Concrete Defects

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `screens/UserProfileScreen.tsx` | 882+ | Profile with follow button | ✅ Substantial |
| `screens/FollowersScreen.tsx` | 366+ | Followers list with follow | ✅ Exists |
| `screens/FollowingScreen.tsx` | 366+ | Following list with follow | ✅ Exists |
| `components/profile/ProfileHero.tsx` | — | Profile header with follow | ✅ Exists |
| `components/commerce/CommercePartyStrip.tsx` | 263+ | Party strip with follow | ✅ Exists |
| `components/commerce/detail/CommerceDetailSellerRow.tsx` | — | Seller row with follow | ✅ Exists |
| `services/profileApi.ts` | 205+ | Profile API with follow | ✅ Comprehensive |

### Defects

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No shared FollowButton component** — built inline per screen | High |
| 2 | **No mutual follows display** — no "N mutual friends" | High |
| 3 | **No compact variant for feed cards** — no quick follow on feed | Medium |
| 4 | **No suggested users rail** — no "Suggested for you" | High |
| 5 | **No follow from story bar** — no follow in story viewer | Medium |
| 6 | **No optimistic update** — may wait for API before UI update | Medium |

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
- `primary` — "Follow" (brand fill) → "Following" (outline)
- `compact` — small button for feed cards
- `inline` — text-only "Follow" link

### M2 — Add mutual follows badge
"Followed by X, Y and N others" or "N mutual friends" below follow button. Fetch from API. Social proof.

### M3 — Add suggested users rail
"People you might like" rail on home, "Similar to this seller" on profile. Based on mutual friends + interests.

### M4 — Add optimistic update
On follow/unfollow, update UI instantly. If API fails, rollback with toast: "Couldn't follow, try again."

---

## 5. Macro Improvements

### A1 — Follow component system
- `FollowButton` — shared component (primary, compact, inline)
- `MutualFollowsBadge` — "N mutual friends"
- `SuggestedUsersRail` — recommendation rail
- `useFollow` — hook with optimistic update + rollback

---

## 6. Flagship Acceptance Criteria

- **Shared FollowButton** — primary, compact, inline variants
- **One-tap toggle** — no confirmation
- **Optimistic update** — instant UI, rollback on error
- **Haptic on state change**
- **Mutual follows badge** — "N mutual friends"
- **Suggested users rail** — on home and profile
- **Follow from feed and stories** — compact variant
- **Clear visual distinction** — Follow (filled) vs Following (outline)

### Thumbnail test
At 25% scale, follow button is distinguishable: "Follow" (filled) vs "Following" (outline). On profile, follower/following counts are readable.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared FollowButton | Low | All follow surfaces |
| P1 | M2 — Mutual follows badge | Medium | Social proof |
| P1 | M3 — Suggested users rail | Medium | Graph growth |
| P1 | M4 — Optimistic update | Low | UX standard |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `followButton.primary.height` | 36pt | |
| `followButton.primary.radius` | Radius.full | Pill |
| `followButton.primary.followBg` | colors.brand | Filled |
| `followButton.primary.followingBg` | transparent | Outline |
| `followButton.primary.followingBorder` | 1pt colors.border | |
| `followButton.compact.height` | 32pt | Feed cards |
| `followButton.compact.padding` | Space.sm + Space.xs | |
| `followButton.inline.font` | Type.caption | 12pt |
| `followButton.inline.color` | colors.brand | |
| `followButton.haptic` | selection | On state change |
| `followButton.animation` | withTiming 150ms | |
| `mutualFollows.font` | Type.caption | 12pt |
| `mutualFollows.color` | colors.textMuted | |
| `suggestedUsers.avatar.size` | 48pt | |
| `suggestedUsers.rail.height` | 80pt | |

---

*Generated 2026-08-18. Verified sources: transparency.meta.com/features/explaining-ranking/ig-suggested-accounts (AI-ranked suggestions, signals: mutual friends count, follows, geo, engagement, time since follow), hooleft.me/blog/instagram-suggested-accounts-why (mutual connections strongest signal, phone contacts, linked Facebook, shared interests), hooleft.me/blog/can-you-see-mutual-followers-on-instagram ("Followed by X and N others" partial mutual view, no complete mutuals list), getlurk.app/blog/instagram-mutual-followers (mutual followers vs mutual following, tap to see full list on mobile). Production codebase audit: UserProfileScreen, FollowersScreen, FollowingScreen, profileApi, CommercePartyStrip.*
