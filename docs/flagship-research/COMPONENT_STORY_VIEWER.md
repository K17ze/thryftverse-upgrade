# ThryftVerse Flagship Upgrade — Story Viewer Component

**Component deep-dive:** story viewer, progress segments, tap navigation, press-to-pause, story rings, story bar, story reply bar.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 §15 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram Stories (2026)
- Story bar: horizontal rail of avatar circles at top of feed, gradient ring (unseen) vs grey (seen)
- Full-screen viewer: 9:16, auto-advance 5s (photo) / video duration
- Progress segments: N segments at top, fill left to right, 2pt height
- Tap navigation: tap left = previous, tap right = next, swipe = next/prev user
- Press to pause: long-press pauses and hides chrome
- Reply bar: bottom, sends DM
- Story stickers: location, mention, hashtag, product, poll

### Snapchat (2026)
- Camera-first: opens to camera, swipe up for gallery
- Story filters: AR lenses during capture
- Tap navigation: same as Instagram

### Cross-cutting 2026 consensus
- Story bar at top of feed with seen/unseen rings
- Full-screen 9:16 viewer with progress segments
- Tap left/right for navigation, swipe for user navigation
- Press to pause + hide chrome
- 5s auto-advance for photos
- Reply bar at bottom (DM integration)
- Story stickers (product, location, mention)

---

## 2. Psychology & Principles

### The story bar as daily habit
The story bar is the first thing users see. Tapping a story circle is reflexive — the lightest-weight content consumption. This makes it the highest-engagement surface for repeat visits.

### Progress segments as time pressure
Segments filling left-to-right create subtle urgency. The user knows the story is advancing and will miss content if they don't pay attention. 5s is fast enough to feel urgent but slow enough to comprehend.

### Press-to-pause as control
Long-press to pause gives the user control over the pace. If they want to linger on a photo, they press and hold. Release resumes. This respects the user's attention.

---

## 3. Current ThryftVerse Audit — Concrete Defects

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `screens/PosterViewerScreen.tsx` | 907+ | Story/poster viewer | ✅ Substantial |
| `screens/PosterStoryActivityScreen.tsx` | 779+ | Story creation | ✅ Substantial |
| `components/poster/PosterProgressSegments.tsx` | 73+ | Progress segments | ✅ Exists |
| `components/poster/PosterReactionReplyBar.tsx` | 600+ | Reaction/reply bar | ✅ Substantial |
| `components/poster/PosterHighlightsRail.tsx` | 294+ | Highlights rail | ✅ Exists |

### Defects

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No story bar at top of feed** — no avatar circle rail | High |
| 2 | **No story rings** — no gradient/grey ring on avatars | High |
| 3 | **No 24h ephemerality** — posters appear permanent | High |
| 4 | **No product stickers** — no shoppable story stickers | High |
| 5 | **No press-to-pause** — may not pause on long-press | Low |
| 6 | **No story reply via DM** — reply bar may not integrate with DM | Medium |
| 7 | **No shared StoryViewer component** — PosterViewer is screen-specific | Medium |

---

## 4. Micro Improvements

### M1 — Create shared StoryViewer component
```tsx
interface StoryViewerProps {
  stories: StoryItem[];
  onReply: (text: string) => void;
  onProductTagTap: (productId: string) => void;
  autoAdvanceMs: number;  // default 5000
}
```
Full-screen 9:16 viewer with progress segments, tap navigation, press-to-pause, reply bar, product stickers.

### M2 — Create StoryBar component
Horizontal rail of avatar circles at top of feed. First: "Your Story" (add). Rest: followed users with unseen stories. Gradient ring (unseen) vs grey ring (seen). Tap to open StoryViewer.

### M3 — Create StoryRing component
Avatar with ring: gradient (unseen) or grey (seen). 64pt avatar, 2pt ring, animated ring fill on first view.

### M4 — Add product stickers
Tappable product sticker on story: product image + price. Tap opens product sheet. 44pt height, dark overlay, white text, Radius.md.

### M5 — Add press-to-pause
Long-press pauses auto-advance and hides chrome (progress, actions, reply). Release resumes. Haptic on pause.

---

## 5. Macro Improvements

### A1 — Story component system
- `StoryBar` — top-of-feed avatar rail
- `StoryViewer` — full-screen viewer (evolve PosterViewerScreen)
- `StoryRing` — avatar ring (seen/unseen)
- `StoryProgressSegments` — already exists as PosterProgressSegments
- `StoryReplyBar` — reply via DM (evolve PosterReactionReplyBar)
- `StorySticker` — product, location, mention stickers

---

## 6. Flagship Acceptance Criteria

- **StoryBar** at top of feed with avatar circles and rings
- **StoryViewer** — full-screen, progress segments, tap nav, press-to-pause
- **Story rings** — gradient (unseen) / grey (seen)
- **Product stickers** — tappable, shoppable
- **Reply bar** — sends DM
- **24h ephemerality** — stories expire
- **Reduced motion** — no auto-advance, manual tap only

### Thumbnail test
At 25% scale, story bar shows: row of circles with gradient rings. Story viewer shows: full-screen media, progress segments at top. Media dominates.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M2 — StoryBar | Medium | Daily habit |
| P0 | M3 — StoryRing | Low | Visual signal |
| P0 | M1 — Shared StoryViewer | Medium | Reusability |
| P1 | M4 — Product stickers | Medium | Shoppable stories |
| P1 | M5 — Press-to-pause | Low | UX standard |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `storyBar.height` | 96pt | Avatar + label |
| `storyBar.avatar.size` | 64pt | |
| `storyBar.avatar.gap` | Space.md | |
| `storyRing.unseen.gradient` | [colors.brand, colors.brandAlt] | |
| `storyRing.seen.color` | colors.border | |
| `storyRing.thickness` | 2pt | |
| `storyViewer.aspectRatio` | 9:16 | |
| `storyViewer.autoAdvance` | 5000ms | Photo default |
| `storyProgress.height` | 2pt | |
| `storyProgress.color` | rgba(255,255,255,0.3) | |
| `storyProgress.activeColor` | #FFFFFF | |
| `storyProgress.gap` | 2pt | |
| `storySticker.product.height` | 44pt | |
| `storySticker.product.radius` | Radius.md | |
| `storySticker.product.background` | rgba(0,0,0,0.6) | |
| `storyReply.height` | 44pt | |
| `storyReply.background` | rgba(0,0,0,0.3) | |

---

*Generated 2026-08-18. Verified sources: about.instagram.com/features/stories (24h, highlights, stickers, Close Friends), about.instagram.com/blog/tips-and-tricks/how-to-use-instagram-stories (60s auto-split, Stories Archive, Add Yours, layout, photo stickers), blog.hootsuite.com/instagram-stories (2026: Story comments, Instagram Plus, 48h extended lifespan, AI collage, rewatch insights), piunikaweb.com (May 2026 progress bar bottom A/B test), newsroom.snap.com (Auto-Save Stories to Public Profiles 2026, Timeline Editor, Creator Subscriptions Feb 2026), help.snapchat.com (Rewatch Indicator eyes emoji Snapchat+), whizsky.com (Pinterest sunset Story Pins/Idea Pins 2023, folded into video Pins). Production codebase audit: PosterViewerScreen, PosterProgressSegments, PosterReactionReplyBar.*
