# ThryftVerse Flagship Upgrade — Empty State Illustrations

**Component deep-dive:** empty states for feed, search, cart, closet, messages, notifications, orders, collections, errors-with-recovery.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 §17 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
- Minimal illustration or icon (not elaborate)
- Short headline: "No posts yet"
- Optional subtext: "When you follow people, their posts will show up here."
- Single CTA button: "Find people to follow"
- Lots of whitespace — empty state breathes

### Pinterest (2026)
- Visual-first: a few sample pins as illustration
- "Get ideas for your [topic]"
- CTA: "Explore [topic]"
- No heavy illustration — the product IS the illustration

### eBay (2026)
- Icon + headline: "Your watchlist is empty"
- Subtext: "Items you watch will appear here."
- CTA: "Browse items"

### Cross-cutting 2026 consensus
- Minimal illustration (icon or simple graphic, not elaborate scene)
- Short headline (3-5 words)
- Optional subtext (1 sentence)
- Single CTA button
- Lots of whitespace
- No generic "No data" — always contextual
- No emoji-heavy or cartoonish illustrations (AI tell)
- Tone: helpful, not apologetic

---

## 2. Psychology & Principles

### The empty state as onboarding
An empty state is a moment of onboarding — the user has navigated to a surface that has no content yet. This is an opportunity to explain what the surface is for and how to fill it. A good empty state teaches the user what to do next.

### Restraint over decoration
The 2026 standard is restraint — a simple icon, a short headline, a CTA. Not an elaborate illustration, not a cartoon scene, not emoji-heavy decoration. The AGENTS.md §4 anti-AI-made design principle applies: an over-illustrated empty state reads as AI-generated. A restrained, contextual empty state reads as authored.

### Contextual, not generic
"No data available" is a defect. Every empty state must be contextual: "Your cart is empty" (cart), "No messages yet" (inbox), "When you follow people, their posts will show up here" (feed). The empty state explains why it's empty and what to do about it.

### The CTA as recovery
Every empty state should have a CTA that helps the user fill the void: "Browse items" (cart), "Find people to follow" (feed), "Start a conversation" (inbox). The CTA is the path out of the empty state.

---

## 3. Current ThryftVerse Audit — Concrete Defects

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `components/EmptyState.tsx` | — | Generic empty state | ✅ Exists |
| `screens/BundleBagScreen.tsx` | — | Uses EmptyState | ✅ Exists |

### What exists
1. **EmptyState component** — a generic empty state component exists and is used in BundleBagScreen.

### Defects

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No audit of all empty states** — unknown how many screens have proper empty states | High |
| 2 | **Generic EmptyState may lack contextual variants** — may not have per-surface customization | Medium |
| 3 | **No illustration system** — no consistent illustration/icon style for empty states | Medium |
| 4 | **No CTA on all empty states** — may not always have a recovery action | Medium |
| 5 | **No empty state for feed** — "no posts" state for new users | High |
| 6 | **No empty state for search** — "no results" state | High |
| 7 | **No empty state for cart** — "cart is empty" state | High |
| 8 | **No empty state for closet** — "no saved items" state | Medium |
| 9 | **No empty state for messages** — "no messages" state | Medium |
| 10 | **No empty state for notifications** — "no notifications" state | Medium |

---

## 4. Micro Improvements

### M1 — Audit all screens for empty states
Check every screen that shows a list/grid for proper empty state handling. Document which screens have empty states and which don't.

### M2 — Create contextual empty state variants
```tsx
interface EmptyStateProps {
  icon: string;           // icon name
  title: string;          // 3-5 words
  subtitle?: string;      // 1 sentence
  ctaLabel?: string;      // CTA button text
  onCtaPress?: () => void;
}
```
Create per-surface variants:
- **Feed**: "No posts yet" / "When you follow people, their posts will show up here." / "Find people to follow"
- **Search**: "No results" / "Try different keywords or filters." / "Clear filters"
- **Cart**: "Your cart is empty" / "Items you add will appear here." / "Browse items"
- **Closet**: "No saved items" / "Tap the bookmark on any item to save it here." / "Discover items"
- **Messages**: "No messages" / "Start a conversation with a seller." / "Browse items"
- **Notifications**: "No notifications" / "You're all caught up."
- **Orders**: "No orders yet" / "Your purchases will appear here." / "Browse items"
- **Collections**: "No collections" / "Create a collection to organize your saved items." / "Create collection"

### M3 — Create consistent illustration style
Simple line icons (24-32pt) from the existing icon registry. No elaborate illustrations, no cartoon scenes, no emoji-heavy graphics. One icon family, one optical size. Consistent with AGENTS.md §4 icon grammar.

### M4 — Add CTA to all empty states
Every empty state has a CTA button (AppButton, outline variant) that helps the user fill the void. CTA is the path out of the empty state.

### M5 — Add whitespace and breathing room
Empty states should have generous whitespace — at least 40% of the viewport should be empty. The icon, headline, subtext, and CTA should be centered with ample spacing.

---

## 5. Macro Improvements

### A1 — Empty state system
- `EmptyState` — shared component with contextual variants
- `EmptyStateIllustration` — consistent icon style (line icons from registry)
- Per-surface presets: feed, search, cart, closet, messages, notifications, orders, collections
- All states: loading, empty, error, partial, offline (per AGENTS.md §4)

---

## 6. Flagship Acceptance Criteria

- **Contextual empty states** on all list/grid screens
- **Short headline** (3-5 words)
- **Optional subtext** (1 sentence)
- **Single CTA button** for recovery
- **Consistent illustration style** — line icons, one family
- **Generous whitespace** — 40%+ of viewport
- **No generic "No data"** — always contextual
- **No AI-tell illustrations** — no cartoons, no emoji-heavy
- **Tone: helpful, not apologetic**

### Thumbnail test
At 25% scale, an empty state shows: a simple icon, a headline, and a CTA button. Lots of whitespace. The icon and headline are the dominant elements.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Audit all screens | Low | Visibility |
| P0 | M2 — Contextual variants | Low | All surfaces |
| P1 | M4 — CTA on all empty states | Low | Recovery |
| P1 | M3 — Consistent illustration | Low | Visual consistency |
| P2 | M5 — Whitespace | Low | Breathing room |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `emptyState.icon.size` | 48pt | Line icon |
| `emptyState.icon.color` | colors.textMuted | |
| `emptyState.title.font` | Type.subtitle | 16pt |
| `emptyState.title.color` | colors.textPrimary | |
| `emptyState.subtitle.font` | Type.body | 14pt |
| `emptyState.subtitle.color` | colors.textMuted | |
| `emptyState.cta.height` | 44pt | Control.touchable |
| `emptyState.cta.variant` | 'outline' | Secondary |
| `emptyState.padding` | Space.xxl | Generous |
| `emptyState.gap` | Space.lg | Between elements |
| `emptyState.minWhitespace` | 40% | Of viewport |

---

*Generated 2026-08-18. Verified sources: designsystems.one/design-systems/patterns/empty-states (first-run vs filtered-empty vs lapsed-user, system-consistent illustration, Mailchimp/Shopify/Pinterest empty state catalogs), vp0.com/blogs/designing-ios-empty-states-that-feel-intentional (NNG framework: status + teach + next action, first-run/cleared/no-results differentiated, Day 1 retention ~25%), gummble.com/blog/empty-state-design-patterns (no-results: acknowledge search term, suggest alternatives, fallback action; error: calm + retry; one CTA not three; match emotional context), mobbin.com/glossary/empty-state (Aug 2026: 4 types — first-time, no-results, post-completion, feature education; 4000+ examples; avoid "no data" placeholders). Production codebase audit: EmptyState component, BundleBagScreen. AGENTS.md §4 anti-AI-made design.*
