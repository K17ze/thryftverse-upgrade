# ThryftVerse Flagship Upgrade — Comments Thread Component

**Component deep-dive:** comment list, threaded replies, comment input, comment likes, comment sorting, comment reporting, mentions/hashtags.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
- Threaded replies: "View replies" to expand nested replies
- Heart on comments: tap heart to like, shows count
- Reply: tap "Reply" to reply to specific comment, mentions original
- Sort: "Newest" / "Top" toggle
- Pinned comments: creator can pin one comment to top
- Comment input: sticky at bottom, emoji toggle, mentions, hashtags

### Reddit (2026)
- Deep nesting: unlimited reply depth with visual indentation
- Upvote/downvote: community-driven ranking
- Sort: Best, Top, New, Controversial, Old
- Collapsible threads: tap to collapse/expand

### Cross-cutting 2026 consensus
- Threaded/nested replies (at least 2 levels)
- Like/heart on comments
- Sort options (Newest, Top, Oldest)
- Report/Delete via context menu
- Mentions (@username) and hashtags (#tag) tappable
- Sticky comment input at bottom
- "View N replies" expansion for threads

---

## 2. Psychology & Principles

### Threading for readability
Flat lists become unreadable past 20 comments. Threaded replies with indentation show who is replying to whom. "View N replies" keeps the list compact while allowing deep dives.

### Reactions as lightweight engagement
Not every user wants to write a comment. A heart on a comment is a one-tap engagement that says "I agree" or "this is helpful." This lowers the barrier and increases total interaction.

### Sort as reading mode
"Top" surfaces the best content (most liked). "Newest" shows what's happening now. The sort toggle lets the user choose their reading mode. Default: "Top" for commerce (surfaces most helpful).

---

## 3. Current ThryftVerse Audit — Concrete Defects

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `components/look/LookCommentsSheet.tsx` | 318+ | Look comments bottom sheet | ✅ Exists |
| `components/poster/PosterReactionReplyBar.tsx` | 600+ | Poster reactions/replies | ✅ Substantial |
| `components/look/LookSocialActions.tsx` | 158+ | Like/comment/share on looks | ✅ Exists |
| `services/looksApi.ts` | 171+ | Look comments API | ✅ Exists |
| `services/postersApi.ts` | 688+ | Poster comments API | ✅ Comprehensive |

### Defects

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No threaded/nested replies** — flat list only | High |
| 2 | **No comment sorting** — no Newest/Top toggle | Medium |
| 3 | **No comment likes/hearts** — can't like a comment | Medium |
| 4 | **No "View N replies" expansion** | High |
| 5 | **No comment reporting** — no report flow | Medium |
| 6 | **No mentions/hashtags** — @username not tappable | Medium |
| 7 | **No shared CommentThread component** — separate per surface | Medium |
| 8 | **No comments on listings** — only looks/posters | High |
| 9 | **No comment pinning** | Low |

---

## 4. Micro Improvements

### M1 — Create shared CommentThread component
```tsx
interface CommentThreadProps {
  targetId: string;
  targetType: 'look' | 'poster' | 'listing';
  comments: Comment[];
  onAdd: (text: string, parentId?: string) => void;
  onLike: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onReport: (commentId: string) => void;
  sort: 'newest' | 'top' | 'oldest';
}
```

### M2 — Add threaded replies
`parentId` + `replyCount` on comment model. "View N replies" expansion. 16pt left indent per level, max 2 levels.

### M3 — Add comment sorting
Sort toggle: "Newest" | "Top" | "Oldest". Default: "Top". Persists per-user.

### M4 — Add comment likes
Heart icon on each comment. Tap to like/unlike. Shows count. Haptic. Animated fill.

### M5 — Add mentions/hashtags
Parse @username and #hashtag. Render as tappable links (brand color). Tap → profile / hashtag feed.

### M6 — Add comments on listings
Use CommentThread on ItemDetailScreen. Functions as Q&A: buyer asks, seller answers.

---

## 5. Macro Improvements

### A1 — Comment component system
- `CommentThread` — reusable for any target (look, poster, listing)
- `CommentRow` — single comment with avatar, text, actions
- `CommentInput` — sticky bottom, keyboard-aware, mentions, emoji
- `commentApi` — unified CRUD for any target type

---

## 6. Flagship Acceptance Criteria

- **Shared CommentThread** — used on looks, posters, listings
- **Threaded replies** — 2 levels, "View N replies"
- **Comment sorting** — Newest, Top, Oldest
- **Comment likes** — heart on each comment
- **Mentions/hashtags** — tappable
- **Comment reporting** — long-press → Report
- **Comments on listings** — Q&A surface
- **Sticky comment input** — keyboard-aware

### Thumbnail test
At 25% scale, comment thread shows: avatar circles, text blocks, action icons. Threaded replies distinguishable by indentation.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared CommentThread | Medium | Reusability |
| P0 | M2 — Threaded replies | Medium | Readability |
| P0 | M6 — Comments on listings | Medium | Commerce Q&A |
| P1 | M3 — Comment sorting | Low | UX standard |
| P1 | M4 — Comment likes | Low | Engagement |
| P1 | M5 — Mentions/hashtags | Medium | Richness |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `comment.avatar.size` | 32pt | |
| `comment.row.padding` | Space.md | |
| `comment.indent.perLevel` | Space.md (16pt) | |
| `comment.maxNesting` | 2 | |
| `comment.input.height` | 44pt | |
| `comment.input.background` | colors.surfaceAlt | |
| `comment.input.radius` | Radius.full | |
| `comment.likeIcon.size` | 20pt | |
| `comment.likeIcon.activeColor` | colors.danger | |
| `comment.sortToggle.height` | 36pt | |
| `comment.sortToggle.font` | Type.label | 11pt |
| `comment.pinnedLabel.font` | Type.caption | "Pinned" |
| `comment.pinnedLabel.color` | colors.brand | |

---

*Generated 2026-08-18. Verified sources: transparency.meta.com/features/explaining-ranking/ig-comments (AI-ranked comments, signals: reply likelihood, scroll-past likelihood, like likelihood), developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment (parent_id, like_count, replies edge, hidden field), developers.facebook.com/docs/instagram-platform/comment-moderation (reply endpoint, hide/unhide, disable/enable comments), developers.facebook.com/docs/content-library-and-api (sort: newest_to_oldest/oldest_to_newest, fetch_all for nested flattened). Production codebase audit: LookCommentsSheet, PosterReactionReplyBar, looksApi, postersApi.*
