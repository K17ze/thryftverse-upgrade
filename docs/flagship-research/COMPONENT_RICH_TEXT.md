# ThryftVerse Flagship Upgrade — Rich Text & Content Rendering

**Component deep-dive:** every rich text renderer, markdown parser, mention parser, hashtag parser, and inline link detector in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §6 (truthful UI) · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram renders captions and comments with: **@mentions** in brand color (tappable → profile), **#hashtags** in brand color (tappable → search), and **URLs** as tappable links (open in in-app browser). No markdown — plain text with parsed entities. Instagram's lesson: **mentions and hashtags are the minimum rich text requirement for a social app.**

### Snapchat (2026)
Snapchat renders chat messages with @mentions tappable and links auto-detected. No markdown, no hashtags (Snapchat doesn't use hashtags). Snapchat's lesson: **link detection in chat is non-negotiable — users share links constantly.**

### eBay (2026)
eBay's listing descriptions support basic markdown: **bold**, *italic*, lists, links, and line breaks. The rendering is clean and readable — not a full markdown renderer, but enough for sellers to format their descriptions. eBay's lesson: **listing descriptions benefit from basic formatting — a wall of plain text is hard to read.**

### Cross-cutting 2026 consensus
- **Mention parsing** (@username) — tappable, brand-colored, navigates to profile.
- **Hashtag parsing** (#tag) — tappable, brand-colored, navigates to search.
- **Link detection** (URLs) — tappable, opens in-app browser.
- **Basic markdown** for descriptions (bold, italic, lists, links).
- **`react-native-parsed-text`** for entity parsing.
- **`react-native-markdown-display`** for markdown rendering.
- **No HTML rendering** — markdown only (safer, simpler).

---

## 2. Psychology & Principles

### Tappable entities create navigation
A plain text comment ("Check out @vintagequeen's #leatherjacket collection at https://thryftverse.app/user/vintagequeen") is a wall of text. The same comment with tappable @mention (→ profile), #hashtag (→ search), and URL (→ browser) becomes a navigation surface. The user can explore the comment, not just read it.

### The readability problem
A listing description as plain text is a wall of text. The same description with bold section headers ("**Condition:** Excellent", "**Measurements:** 38\" chest", "**Shipping:** Royal Mail tracked") is scannable — the user can find the information they need without reading the entire description.

### Link preview vs inline link
A link preview card (ThryftVerse's current approach in chat) shows the link's metadata below the message. An inline link makes the URL text itself tappable within the message. Both are useful — the preview for rich content, the inline link for quick navigation. The 2026 standard: both.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Rich text components: NONE
The codebase has **zero rich text rendering capabilities**. All descriptions, bios, chat messages, and comments are rendered as plain `Text` components.

### Current text rendering

| Surface | File | Lines | Rendering | Defect |
|---------|------|-------|-----------|--------|
| Listing description | `ItemDetailScreen.tsx` | 1024-1047 | Plain Text with expand/collapse | No markdown, no mentions, no links |
| Auction description | `AuctionDetailScreen.tsx` | 1124-1128 | Plain Text | Same |
| Look caption | `LookDetailScreen.tsx` | 568-573 | Plain Text with expand/collapse | Same |
| Profile bio | `ProfileHero.tsx` | 249-251 | Plain Text, 3 lines | No mentions, no links |
| Chat message | `MessageBubble.tsx` | 231 | Plain Text | No mentions, no hashtags, no inline links |
| Comment | `LookCommentsSheet.tsx` | 144 | Plain Text | Same |
| Poster caption | `PosterViewerScreen.tsx` | 1285-1294 | Plain Text with author prefix | No markdown |

### Link handling (partial)
- `LinkPreviewCard.tsx` (128 lines) — extracts first URL via regex, shows preview card below message. Does NOT make URL text clickable inline.

### Creator tool mentions/hashtags (not reusable)
- `CreatorCanvas.tsx:1560-1567` — MentionLayerContent (renders @username as a pill layer)
- `CreatorCanvas.tsx:2023-2041` — HashtagLayerContent (renders #tag as a pill layer)
- These are **layer objects** in poster composition, not inline text parsing. Not reusable for chat/comments.

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No markdown rendering** | All descriptions/bios | High |
| 2 | **No mention parsing** (@username not tappable) | Chat, comments, bios, descriptions | High |
| 3 | **No hashtag parsing** (#tag not tappable) | Chat, comments, bios, descriptions | High |
| 4 | **No inline link detection** (URLs are plain text) | Chat, comments, descriptions | High |
| 5 | **No rich text library installed** | package.json | High |
| 6 | **LinkPreviewCard only shows first URL** | `LinkPreviewCard.tsx:26-30` | Medium |
| 7 | **Creator mention/hashtag layers not reusable** | CreatorCanvas only | Medium |
| 8 | **No text parsing utilities** | utils/ | Medium |
| 9 | **No inline formatting** (bold, italic) | All text | Medium |

---

## 4. Micro Improvements

### M1 — Install rich text libraries
Add `react-native-parsed-text` for mention/hashtag/link parsing. Add `react-native-markdown-display` for markdown rendering in descriptions.

### M2 — Create RichText component
```tsx
interface RichTextProps {
  text: string;
  onMentionPress?: (username: string) => void;
  onHashtagPress?: (tag: string) => void;
  onLinkPress?: (url: string) => void;
  markdown?: boolean;
  style?: TextStyle;
}
```
Parses @mentions, #hashtags, URLs, and optionally markdown. Renders with tappable spans.

### M3 — Add mention parsing to chat messages
In `MessageBubble.tsx:231`, replace plain Text with RichText. @mentions become tappable (→ profile), URLs become tappable (→ in-app browser).

### M4 — Add markdown to listing descriptions
In `ItemDetailScreen.tsx:1024-1047`, replace plain Text with RichText with `markdown={true}`. Sellers can use **bold**, *italic*, lists, and links in descriptions.

### M5 — Add mention/hashtag parsing to comments
In `LookCommentsSheet.tsx:144`, replace plain Text with RichText.

### M6 — Add mention parsing to bios
In `ProfileHero.tsx:249-251`, replace plain Text with RichText. @mentions in bios are tappable.

### M7 — Fix inline links in chat
Make URLs tappable inline in MessageBubble (not just in LinkPreviewCard). Keep LinkPreviewCard for rich previews of the first URL.

---

## 5. Macro Improvements

### A1 — RichText as the unified text rendering component
Replace all plain `Text` rendering of user-generated content with `RichText`. The component handles:
- @mention parsing → tappable, brand color, navigates to profile
- #hashtag parsing → tappable, brand color, navigates to search
- URL detection → tappable, opens in-app browser
- Markdown (optional) → bold, italic, lists, links, line breaks
- Expand/collapse for long text (existing pattern)

### A2 — Text parsing utilities
Create `utils/textParsing.ts`:
- `parseMentions(text)` → array of {start, end, username}
- `parseHashtags(text)` → array of {start, end, tag}
- `parseUrls(text)` → array of {start, end, url}
- `parseAll(text)` → combined sorted array of all entities

Used by RichText component and potentially by the Creator tool (to unify layer parsing with inline parsing).

---

## 6. Flagship Acceptance Criteria

- **RichText component** with mention, hashtag, link, and markdown support
- **@mentions tappable** → navigates to profile, brand color
- **#hashtags tappable** → navigates to search, brand color
- **URLs tappable** → opens in-app browser
- **Markdown in listing descriptions** (bold, italic, lists, links)
- **Expand/collapse** for long text preserved
- **`react-native-parsed-text`** for entity parsing
- **Accessibility** — mentions/hashtags/links with proper accessibility labels

### Thumbnail test
At 25% scale, a comment with @mentions and #hashtags must show the mentions and hashtags in a distinct color (brand) — visually distinguishable from plain text.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Install rich text libraries | Low | All rich text |
| P0 | M2 — RichText component | Medium | All surfaces |
| P1 | M3 — Mentions in chat | Low | Chat UX |
| P1 | M7 — Inline links in chat | Low | Chat UX |
| P1 | M4 — Markdown in descriptions | Medium | Listing UX |
| P2 | M5 — Mentions in comments | Low | Comment UX |
| P2 | M6 — Mentions in bios | Low | Profile UX |
| P3 | A1 — Unified RichText | High | All text surfaces |
| P3 | A2 — Text parsing utilities | Medium | Reusable parsing |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `richText.mention.color` | colors.brand | Brand |
| `richText.mention.weight` | Type.weight.semibold | Bold |
| `richText.hashtag.color` | colors.brand | Brand |
| `richText.hashtag.weight` | Type.weight.semibold | Bold |
| `richText.link.color` | colors.brand | Brand |
| `richText.link.underline` | true | Underlined |
| `richText.markdown.bold.weight` | Type.weight.bold | |
| `richText.markdown.italic.style` | 'italic' | |
| `richText.markdown.list.indent` | Space.md | |
| `richText.expand.threshold` | 3 lines | Before collapse |
| `richText.expand.gradient` | colors.surface → transparent | Fade edge |
| `richText.parsedText.library` | react-native-parsed-text | Entity parsing |
| `richText.markdown.library` | react-native-markdown-display | Markdown |

---

*Generated 2026-08-18. Sources: production codebase audit, Instagram mention/hashtag patterns, eBay markdown descriptions, react-native-parsed-text docs.*
