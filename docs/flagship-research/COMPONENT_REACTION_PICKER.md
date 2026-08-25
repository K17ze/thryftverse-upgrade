# ThryftVerse Flagship Upgrade — Reaction Picker Component

**Component deep-dive:** emoji reaction bars, reaction picker popover, reaction counts, reacted-by-me state, expanded reaction set.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026) — DM reactions only
Instagram has emoji reactions in **DMs only**, not on posts or comments. Verified:
- 6 quick reactions in DM: ❤️  😮 😢 � �🔥 (default set, customizable via "+" → Customize)
- Long-press message → quick reaction bar appears
- "+" icon opens full emoji library
- Tap emoji badge to unreact
- **Super reactions** (May 2026): animated burst effects — floating hearts, rising flames, confetti burst
- Double-tap defaults to heart (hardcoded, not customizable)
- **Instagram does NOT have emoji reactions on posts or comments** — only heart (like) on comments

### Facebook (2026) — post reactions
Facebook has the canonical post reaction system. Verified from Graph API v26.0:
- 7 standard reactions: Like 👍, Love ❤️, Care 🥰, Haha 😂, Wow 😮, Sad 😢, Angry 😡 (plus situational: Thankful, Pride, Fire, Hundred)
- Long-press Like button (mobile) or hover (desktop) to open reaction picker
- Animated emoji pop-in on selection
- Shows total count; tap count for per-reaction breakdown
- `viewer_reaction` field shows viewer's current reaction
- Algorithm weighting (since 2024): Love and Care weighted higher than Haha/Wow for feed placement. High Angry volume triggers low-quality content flags.
- **Facebook reactions are post-only, not on comments**

### WhatsApp (2026) — message reactions
- 6 quick reactions on long-press: ❤️ 😂 😮 😢 👍 🔥
- "+" for full emoji picker
- Tap to unreact

### Cross-cutting 2026 consensus
- **6 quick reactions** is the standard set (Instagram DMs, WhatsApp)
- **7 reactions** for Facebook posts (adds Care, Angry; different emoji set)
- Tap to react/unreact
- Long-press to open picker, "+" for full emoji library
- Count display (Facebook shows breakdown; Instagram/WhatsApp don't)
- "Reacted by me" visual state (emoji badge on message)
- **Important distinction**: emoji reactions are on **messages** (Instagram DMs, WhatsApp) or **posts** (Facebook). They are NOT standard on comments. For comments, the standard is like/heart only.

---

## 2. Psychology & Principles

### Reactions as nuance
A like is binary — you either like it or you don't. Reactions add nuance — you can love it (❤️), find it funny (😂), be surprised (😮), be sad (😢), or say it's fire (🔥). This richer signal improves content ranking and user expression.

### The one-tap reaction
The most common reaction is the heart (❤️). It should be one tap — no picker needed. The picker is for the less common reactions. The 2026 standard: show 6 reactions inline, tap any to react, long-press for 18+ expanded set.

### Count as social proof
Reaction counts are social proof — "47 people loved this" makes the content feel valued. Showing the count next to each emoji provides immediate social context.

---

## 3. Current ThryftVerse Audit — Concrete Defects

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `components/chat/EmojiReactionsBar.tsx` | 135+ | Emoji reactions bar | ✅ Exists |
| `components/poster/PosterReactionReplyBar.tsx` | 600+ | Poster reactions | ✅ Substantial |

### What exists
1. **EmojiReactionsBar** — 135-line component with 6 default emojis (❤️ 👍 😂 😮 😢 🔥) + 18 extended emojis. Expandable. Has `reactedByMe` state. `onReact` callback.
2. **PosterReactionReplyBar** — 600-line reaction and reply bar for posters. Substantial.

### Defects

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No shared ReactionPicker component** — EmojiReactionsBar is chat-specific | Medium |
| 2 | **No reaction picker popover** — inline bar only, no popover | Low |
| 3 | **No reaction on comments** — reactions only on chat/posters | Medium |
| 4 | **No reaction on listings** — no reactions on product listings | Low |
| 5 | **No animated emoji pop-in** — no animation on selection | Low |
| 6 | **No reaction breakdown** — no "47 loved, 12 laughed" breakdown | Low |

---

## 4. Micro Improvements

### M1 — Create shared ReactionPicker component
```tsx
interface ReactionPickerProps {
  reactions: Reaction[];
  onReact: (emoji: string) => void;
  variant?: 'inline' | 'popover';
  expanded?: boolean;
}
interface Reaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}
```
- `inline` — horizontal bar of emojis with counts
- `popover` — anchored popover with emojis

### M2 — Add animated emoji pop-in
On reaction selection, emoji scales from 0.8 → 1.2 → 1.0 with spring animation. Haptic on selection.

### M3 — Add reactions to comments and listings
Use ReactionPicker on comments (per Report C34) and on product listings. Standard 6 reactions.

### M4 — Add reaction breakdown
On tap of reaction count, show breakdown: "47 ❤️, 12 😂, 3 🔥" with avatars of who reacted.

---

## 5. Macro Improvements

### A1 — Reaction system
- `ReactionPicker` — shared component (inline + popover variants)
- `ReactionBar` — inline bar with counts
- `ReactionBreakdown` — popover showing who reacted
- `useReaction` — hook for react/unreact with optimistic update

---

## 6. Flagship Acceptance Criteria

- **Shared ReactionPicker** — inline + popover variants
- **6 standard reactions** — ❤️ 👍 😂 😮 😢 🔥
- **Tap to react/unreact** — one-tap toggle
- **Count display** — per reaction
- **Reacted-by-me state** — visual highlight
- **Animated pop-in** — spring on selection
- **Reactions on comments and listings** — not just chat/posters
- **Expanded set** — long-press for 18+ emojis

### Thumbnail test
At 25% scale, reaction bar shows: row of emojis with counts. Reacted-by-me emoji is visually highlighted.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P1 | M1 — Shared ReactionPicker | Low | All reaction surfaces |
| P2 | M3 — Reactions on comments/listings | Low | Engagement |
| P2 | M2 — Animated pop-in | Low | Polish |
| P3 | M4 — Reaction breakdown | Medium | Social proof |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `reaction.emoji.size` | 28pt | In bar |
| `reaction.emoji.size.expanded` | 36pt | In popover |
| `reaction.count.font` | Type.caption | 12pt |
| `reaction.count.color` | colors.textMuted | |
| `reaction.reactedByMe.scale` | 1.15 | Slightly larger |
| `reaction.reactedByMe.opacity` | 1.0 | Full opacity |
| `reaction.unreacted.opacity` | 0.6 | Dimmed |
| `reaction.popIn.spring` | Motion.spring.entrance | |
| `reaction.haptic` | selection | On react |
| `reactionBar.height` | 36pt | Inline |
| `reactionBar.gap` | Space.sm | Between emojis |
| `reactionPopover.width` | 320pt | |
| `reactionPopover.height` | 56pt | 6 emojis in row |

---

*Generated 2026-08-18. Verified sources: aigrow.me/how-to-react-to-messages-on-instagram (6 quick reactions in DMs: heart, laugh, wow, sad, angry, thumbs up + plus icon for full picker, super reactions with burst effects), expertbeacon.com (customize default 6, long-press, drag-and-drop to replace), hootsuite.com/instagram-emoji (6 default: crying, wow, heart eyes, laugh, clap, fire), aurascience.blog/how-to-super-react-on-instagram (May 2026: super reactions, animated burst: floating hearts, rising flames, confetti burst), developers.facebook.com/docs/graph-api/reference/post/reactions (Facebook 7 reactions: Like Love Care Haha Wow Sad Angry + situational Thankful/Pride/Fire/Hundred, viewer_reaction field, total_count), sendible.com/insights/facebook-reactions (Love/Care weighted higher since 2024, Angry penalty for low-quality content), howtogeek.com (Facebook long-press Like for reaction picker on mobile, hover on desktop). Note: Instagram emoji reactions are DM-only, NOT on posts/comments. Facebook reactions are post-only. Production codebase audit: EmojiReactionsBar, PosterReactionReplyBar.*
