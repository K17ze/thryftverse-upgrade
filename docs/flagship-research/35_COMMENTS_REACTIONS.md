# 35 — Comments & Reactions: Flagship Research Report

> **Department:** Comment threads, nested replies, emoji reactions, comment sorting, comment moderation, reaction picker
> **Benchmark date:** 2026-08
> **Primary benchmarks:** Instagram (comments + DM reactions) · Reddit (threading) · Facebook (post reactions) · WhatsApp (voice message reactions)
> **Sources:** production codebase audit · 2026 web research (transparency.meta.com, developers.facebook.com, aigrow.me, expertbeacon.com, hootsuite.com, sendible.com, howtogeek.com) · AGENTS.md §4

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram comments are the benchmark for social-commerce apps. Verified 2026:
- **Threaded replies** — `parent_id` field on IG Comment API; replies nested under parent. "View replies" to expand. API returns top-level comments only; replies require `/replies` edge.
- **Heart (like) on comments** — `like_count` field on IG Comment; tap heart to like a comment, shows count
- **Reply** — `POST /<IG_COMMENT_ID>/replies` to reply to a specific comment, mentions the original commenter
- **AI-ranked sorting** — Instagram uses AI to rank comments by predicted relevance, not just "Newest" or "Top". Signals: likelihood to reply, likelihood to scroll past, likelihood to like. Pinned comments and your own/friends' comments surface first. No manual sort toggle for viewers — the system decides order.
- **Report/Delete** — long-press for context menu (Report, Delete if own). Hide/unhide via API.
- **Comment input** — sticky at bottom, with emoji toggle, mentions (@), hashtags (#)
- **Pinned comments** — creator can pin a comment to the top
- **DM emoji reactions (NOT post/comment reactions)** — Instagram has 6 quick emoji reactions (❤️ 😂 😮 😢 👍 🔥) in DMs via long-press, plus "+" for full emoji picker. Customizable default 6. "Super reactions" with animated burst effects (floating hearts, rising flames, confetti). **Instagram does NOT have emoji reactions on posts or comments — only heart (like) on comments and emoji reactions in DMs.**

### Reddit (2026)
Reddit is the gold standard for threaded discussion:
- **Deep nesting** — unlimited reply depth, with visual indentation
- **Upvote/downvote** — community-driven ranking
- **Sort** — Best, Top, New, Controversial, Old, Q&A
- **Collapsible threads** — tap to collapse/expand a thread
- **Award system** — community awards on comments

### Facebook (2026) — post reactions (not comments)
Facebook has the canonical emoji reaction system, but it applies to **posts**, not comments. Verified from Graph API v26.0:
- **7 standard reactions** — Like, Love, Care, Haha, Wow, Sad, Angry (plus occasional situational: Thankful, Pride, Fire, Hundred)
- **Long-press Like** — on mobile, long-press the Like button to open reaction picker
- **Reaction breakdown** — tap total count to see breakdown per reaction type
- **Algorithm weighting** — since 2024, "Love" and "Care" weighted higher than "Haha" or "Wow" for feed placement. High "Angry" volume triggers low-quality content flags.
- **`viewer_reaction` field** — API shows which reaction the viewer has applied

### WhatsApp (2026) — voice message reactions
WhatsApp supports emoji reactions on messages (including voice messages). Verified:
- **6 quick reactions** — long-press message → quick reaction bar
- **"+" for full picker** — access full emoji library
- **Tap to unreact** — tap the emoji badge to remove

### Cross-cutting 2026 consensus
- **Threaded/nested replies** — at least 2 levels of nesting (Instagram `parent_id`, Reddit unlimited)
- **Like/heart on comments** — lightweight engagement (Instagram `like_count`)
- **Emoji reactions on messages** — 6 quick reactions + full picker (Instagram DMs, WhatsApp). **Note: emoji reactions on posts/comments are NOT standard — Facebook has post reactions, but most platforms use like/heart on comments only.**
- **AI-ranked comment sorting** — Instagram uses AI ranking, not manual sort toggle. Reddit offers manual sort (Best/Top/New/etc.).
- **Report/Delete** — context menu on long-press
- **Mentions in comments** — @username tappable
- **Sticky comment input** — bottom of screen, keyboard-aware
- **Pinned comments** — creator can pin (Instagram)

---

## 2. Psychology & Principles

### Comments as social proof
Comments are the second-strongest social proof signal (after reviews). A listing with 50 comments feels alive and popular; a listing with 0 comments feels dead. For a marketplace, comments on looks, posts, and listings create a sense of community activity that drives engagement.

### The threading problem
Flat comment lists become unreadable when they exceed 20 comments — the user can't tell who is replying to whom. Threaded replies solve this by visually nesting replies under their parent. The 2026 standard: at least 2 levels of nesting (comment → reply → reply-to-reply), with "View N replies" to expand.

### Reactions as lightweight engagement
Not every user wants to write a comment. Reactions (❤️ 👍 😂 😮 😢 🔥) let users engage with a single tap. This lowers the barrier to engagement and increases the total interaction rate. The 2026 standard: 6 standard reactions, tap to react, tap again to unreact, show count.

### Sort as signal
"Top" (most liked) comments surface the best content. "Newest" comments show what's happening now. The sort toggle lets the user choose their reading mode. For commerce, "Top" is the default — it surfaces the most helpful comments.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Comment/reaction files

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `components/look/LookCommentsSheet.tsx` | 318+ | Look comments bottom sheet | ✅ Exists |
| `components/poster/PosterReactionReplyBar.tsx` | 600+ | Poster reactions/replies | ✅ Substantial |
| `components/chat/EmojiReactionsBar.tsx` | 135+ | Emoji reactions bar | ✅ Exists |
| `components/look/LookSocialActions.tsx` | 158+ | Like/comment/share on looks | ✅ Exists |
| `services/looksApi.ts` | 171+ | Look comments API | ✅ Exists |
| `services/postersApi.ts` | 688+ | Poster comments API | ✅ Comprehensive |
| `screens/PosterViewerScreen.tsx` | 1307+ | Poster viewer with comments | ✅ Substantial |
| `screens/PosterStoryActivityScreen.tsx` | 779+ | Story activity with comments | ✅ Substantial |
| `screens/LookDetailScreen.tsx` | — | Look detail with comments | ✅ Exists |
| `components/profile/ProfileReviews.tsx` | — | Profile reviews | ✅ Exists |

### What exists
1. **LookCommentsSheet** — a bottom sheet for look comments with FlatList, comment input, delete. Has `fetchLookCommentsFromApi`, `createLookCommentOnApi`, `deleteLookCommentOnApi`.
2. **PosterReactionReplyBar** — 600-line reaction and reply bar for poster stories. Substantial.
3. **EmojiReactionsBar** — 6 default emojis (❤️ 👍 😂 😮 😢 🔥) + 18 extended emojis. Expandable. Has `reactedByMe` state.
4. **LookSocialActions** — like, comment, share actions for looks.
5. **looksApi** — comment CRUD API for looks.
6. **postersApi** — comprehensive poster comment API (20+ matches).

### What's missing

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No threaded/nested replies** — LookCommentsSheet is a flat list, no reply-to-reply | High |
| 2 | **No comment sorting** — no Newest/Top/Oldest toggle | Medium |
| 3 | **No comment likes/hearts** — can't like a comment | Medium |
| 4 | **No comment pinning** — creators can't pin comments | Low |
| 5 | **No comment reporting** — no report flow for comments | Medium |
| 6 | **No mentions in comments** — @username not tappable | Medium |
| 7 | **No hashtags in comments** — #tag not tappable | Low |
| 8 | **No "View N replies" expansion** — no collapsible threads | High |
| 9 | **No comment on listings** — comments only on looks/posters, not on product listings | High |
| 10 | **No shared CommentThread component** — LookCommentsSheet and PosterReactionReplyBar are separate | Medium |
| 11 | **No reaction picker popover** — EmojiReactionsBar is inline, not a popover | Low |
| 12 | **No comment moderation queue** — no seller-side comment moderation | Low |

---

## 4. Micro Improvements

### M1 — Add threaded replies to comments
Add `parentId` and `replyCount` to comment model. Render nested replies with "View N replies" expansion. Visual indentation for replies (16pt left padding per level, max 2 levels). FlatList with section-style grouping for parent + children.

### M2 — Add comment sorting
Sort toggle at the top of comment sheet: "Newest" | "Top" | "Oldest". Default: "Top" (most liked). Persists per-user preference.

### M3 — Add comment likes/hearts
Heart icon on each comment. Tap to like, tap again to unlike. Shows count. Haptic on like. Animated heart fill.

### M4 — Add comment reporting
Long-press comment → context menu → "Report". Opens report flow (integrates with Report #29 content moderation). Report categories: spam, harassment, inappropriate content.

### M5 — Add mentions and hashtags in comments
Parse @username and #hashtag in comment text. Render as tappable links (brand color). Tap on mention → profile. Tap on hashtag → hashtag feed.

### M6 — Create shared CommentThread component
Extract from LookCommentsSheet into a reusable `CommentThread` component:
```tsx
interface CommentThreadProps {
  targetId: string;
  targetType: 'look' | 'poster' | 'listing';
  comments: Comment[];
  onAddComment: (text: string, parentId?: string) => void;
  onLikeComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
  onReportComment: (commentId: string) => void;
  sort: 'newest' | 'top' | 'oldest';
}
```

### M7 — Add comments to product listings
Currently comments are only on looks and posters. Add comments to product listings — buyers can ask questions, sellers can answer. This is a key commerce engagement surface (eBay has Q&A on every listing).

### M8 — Add comment pinning (creator)
Creators/sellers can pin one comment to the top. Pinned comment shows a "Pinned" label. Only one pinned comment per target.

---

## 5. Macro Improvements

### A1 — Unified comment system
Create a single comment platform:
- `CommentThread` — reusable component for any target (look, poster, listing, review)
- `CommentInput` — sticky bottom input with mentions, hashtags, emoji toggle
- `CommentRow` — single comment with avatar, text, actions (like, reply, report)
- `ReactionPicker` — popover with 6 standard reactions
- `commentApi` — unified API for comment CRUD on any target type

### A2 — Comments as Q&A for commerce
For product listings, comments function as Q&A:
- Buyer asks a question → seller gets notification → seller answers
- Q&A pair is visible on the listing
- "Ask a question" button on PDP opens comment input
- Sort: "Seller answered" vs "All"

---

## 6. Flagship Acceptance Criteria

- **Threaded replies** — at least 2 levels, "View N replies" expansion
- **Comment sorting** — Newest, Top, Oldest
- **Comment likes** — heart on each comment
- **Comment reporting** — long-press → Report
- **Mentions and hashtags** — tappable in comment text
- **Shared CommentThread component** — used on looks, posters, listings
- **Comments on listings** — Q&A surface for commerce
- **Comment pinning** — creators can pin
- **Sticky comment input** — keyboard-aware, bottom of screen
- **Accessibility** — VoiceOver labels for all actions

### Thumbnail test
At 25% scale, a comment thread must show: avatar circles, text blocks, and action icons (heart, reply). Threaded replies must be visually distinguishable by indentation.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Threaded replies | Medium | Readability |
| P0 | M6 — Shared CommentThread | Medium | Reusability |
| P0 | M7 — Comments on listings | Medium | Commerce Q&A |
| P1 | M2 — Comment sorting | Low | UX standard |
| P1 | M3 — Comment likes | Low | Engagement |
| P1 | M5 — Mentions/hashtags | Medium | Richness |
| P2 | M4 — Comment reporting | Medium | Moderation |
| P2 | M8 — Comment pinning | Low | Creator tools |
| P3 | A1 — Unified comment system | High | All comment surfaces |
| P3 | A2 — Comments as Q&A | High | Commerce engagement |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `comment.avatar.size` | 32pt | Smaller than profile avatar |
| `comment.row.padding` | Space.md | Vertical |
| `comment.indent.perLevel` | Space.md (16pt) | Left padding per nesting level |
| `comment.maxNestingDepth` | 2 | Comment → reply → reply-to-reply |
| `comment.input.height` | 44pt | Control.touchable |
| `comment.input.background` | colors.surfaceAlt | |
| `comment.input.radius` | Radius.full | Pill |
| `comment.likeIcon.size` | 20pt | Icon grammar |
| `comment.likeIcon.activeColor` | colors.danger | Heart fill |
| `comment.replyLabel.font` | Type.caption | 12pt |
| `comment.replyLabel.color` | colors.textMuted | |
| `comment.sortToggle.height` | 36pt | |
| `comment.sortToggle.font` | Type.label | 11pt |
| `comment.pinnedLabel` | "Pinned" | Type.caption, colors.brand |
| `reaction.emoji.size` | 28pt | In reaction bar |
| `reaction.count.font` | Type.caption | 12pt |
| `reaction.picker.width` | 320pt | Popover |
| `reaction.picker.height` | 56pt | 6 emojis in a row |

---

*Generated 2026-08-18. Verified sources: transparency.meta.com/features/explaining-ranking/ig-comments (AI-ranked comments, signals), developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment (parent_id, like_count, replies edge), developers.facebook.com/docs/instagram-platform/comment-moderation (hide/unhide, disable/enable comments, reply endpoint), developers.facebook.com/docs/content-library-and-api (sort: newest_to_oldest, fetch_all for nested), aigrow.me/how-to-react-to-messages-on-instagram (6 quick reactions DM, +full picker, super reactions), expertbeacon.com (customize default 6, long-press), hootsuite.com/instagram-emoji (6 default: crying, wow, heart eyes, laugh, clap, fire), developers.facebook.com/docs/graph-api/reference/post/reactions (Facebook 7 reactions: Like Love Care Haha Wow Sad Angry + situational, viewer_reaction field), sendible.com/insights/facebook-reactions (Love/Care weighted higher since 2024, Angry penalty), howtogeek.com (Facebook long-press Like for reaction picker), blog.whatsapp.com (WhatsApp voice message transcripts, 1.5x/2x speed). Production codebase audit: LookCommentsSheet, PosterReactionReplyBar, EmojiReactionsBar, LookSocialActions, looksApi, postersApi.*
