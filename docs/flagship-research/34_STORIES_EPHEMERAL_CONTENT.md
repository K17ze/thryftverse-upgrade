# 34 — Stories & Ephemeral Content: Flagship Research Report

> **Department:** Story viewer, story creation, story stickers, story navigation, 24h ephemeral content, story views tracking
> **Benchmark date:** 2026-08
> **Primary benchmarks:** Instagram Stories · Snapchat · Pinterest Idea Pins (sunset 2023, folded into video Pins)
> **Sources:** production codebase audit · 2026 web research (about.instagram.com, newsroom.snap.com, whizsky.com, hootsuite.com) · AGENTS.md §4 §15

---

## 1. 2026 Competitor Benchmark

### Instagram Stories (2026)
Instagram Stories is the canonical ephemeral content format. Verified 2026 features:
- **Story bar** — horizontal rail of avatar circles at the top of the feed, with gradient ring (unseen) vs grey ring (seen)
- **Full-screen viewer** — tap to open, 9:16 full-screen, auto-advances after 5s (photos) or video duration (max 60s, auto-splits longer videos)
- **Progress segments** — N segments at the top (or bottom — A/B tested May 2026), one per story item, fill from left to right
- **Tap navigation** — tap left = previous, tap right = next, swipe left = next user, swipe right = previous user
- **Press to pause** — long-press pauses the story and hides UI chrome
- **Story stickers** — location, mention, hashtag, poll, question, countdown, music, product, Add Yours, quiz, donation, GIF, collage (AI-powered), layout (up to 6 photos), photo stickers
- **Story comments** — new in 2026, viewers can comment on stories (not just DM reply)
- **Views tracking** — swipe up to see who viewed your story
- **Reply** — reply bar at the bottom, sends a DM
- **Highlights** — stories saved to profile as permanent highlights
- **Stories Archive** — all stories auto-archived privately after 24h
- **Instagram Plus (paid, 2026)** — multiple audience lists (beyond Close Friends), rewatch insights, searchable viewer list, preview before posting, anonymous viewing, **48h extended story lifespan** (vs standard 24h)

### Snapchat (2026)
Snapchat invented stories. Verified 2026 features:
- **Discover page** — publisher stories alongside friend stories
- **Spotlight** — TikTok-style short video feed (overlaps with Reels)
- **Story filters/lenses** — AR filters applied during capture
- **Snap Map** — location-based stories
- **Auto-Save Stories to Public Profiles** — new 2026 feature, stories no longer disappear after 24h for creators (saved to public profile automatically)
- **Rewatch Indicator** — Snapchat+ subscribers see eyes emoji with rewatch count
- **Creator Subscriptions** — Feb 2026, exclusive stories for subscribers, priority replies, ad-free stories
- **Timeline Editor** — new 2026 video editing tool for stories and Spotlight
- **Public Profiles** — creators 16+ can publish stories, lenses, and content publicly

### Pinterest (2026) — no ephemeral stories
Pinterest sunset standalone Story Pins in 2023 and folded their capabilities into standard video and multi-format Pins. As of 2026, Pinterest prioritises evergreen, searchable content over 24-hour disappearing stories. The closest analogue is **Idea Pins** (multi-page video with shoppable product tags), but these are permanent, searchable, and AI-curated — not ephemeral. Pinterest's 2026 focus is on shoppable video Pins, AI-powered creation tools, and creator analytics, not Stories-format content. **ThryftVerse should not look to Pinterest for story patterns.**

### Cross-cutting 2026 consensus
- **Story bar at top of feed** — avatar circles with seen/unseen rings
- **Full-screen viewer** — 9:16, auto-advance, progress segments
- **Tap navigation** — left/right for next/prev, swipe for user navigation
- **Press to pause** — long-press hides chrome and pauses
- **Stickers** — location, mention, product, poll, music
- **Views tracking** — creator can see who viewed
- **Reply via DM** — reply bar at bottom
- **5s default for photos** — configurable per story item

---

## 2. Psychology & Principles

### Ephemerality and authenticity
24h ephemeral content creates a "see it now or miss it" urgency. This drives daily app opens (Snapchat's core insight). But more importantly, ephemerality lowers the bar for content quality — users post casual, authentic content because it disappears. For a marketplace, this means: stories are where sellers show behind-the-scenes, new drops, and flash sales — content that feels personal and urgent.

### The story bar as a daily habit
The story bar at the top of the feed is the first thing users see. Tapping a friend's story circle is a reflexive action — it's the lightest-weight content consumption in the app. This makes the story bar the highest-engagement surface for repeat visits. For commerce: seller stories in the story bar create a daily touchpoint between sellers and buyers.

### Progress segments as time pressure
The progress segments at the top of a story create a subtle time pressure — the user can see the story is advancing and they'll miss content if they don't pay attention. This keeps attention locked on the story. The 5s auto-advance for photos is fast enough to feel urgent but slow enough to comprehend.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Story/ephemeral content files

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `screens/PosterViewerScreen.tsx` | 907+ | Poster/story viewer | ✅ Substantial |
| `screens/PosterStoryActivityScreen.tsx` | 779+ | Story activity (creation) | ✅ Substantial |
| `screens/PosterHighlightViewerScreen.tsx` | — | Highlight viewer | ✅ Exists |
| `screens/CreatePosterHighlightScreen.tsx` | 418+ | Create highlight | ✅ Exists |
| `screens/PosterArchiveScreen.tsx` | — | Poster archive | ✅ Exists |
| `components/poster/PosterProgressSegments.tsx` | 73+ | Progress bar segments | ✅ Exists |
| `components/poster/PosterHighlightsRail.tsx` | 294+ | Highlights rail | ✅ Exists |
| `components/poster/PosterReactionReplyBar.tsx` | 600+ | Reaction/reply bar | ✅ Substantial |
| `services/postersApi.ts` | 688+ | Posters API | ✅ Comprehensive |
| `creator/CreatorPublishSheet.tsx` | — | Publishing | ✅ Exists |

### What exists (genuinely substantial)
ThryftVerse has a **"Posters" system** that functions as its story/ephemeral content layer:
1. **PosterViewerScreen** — 907-line story viewer with progress segments, tap navigation, swipe between users
2. **PosterStoryActivityScreen** — 779-line story creation screen
3. **PosterProgressSegments** — progress bar segments (the story progress indicator)
4. **PosterReactionReplyBar** — 600-line reaction and reply bar for stories
5. **PosterHighlightsRail** — highlights rail (permanent stories)
6. **PostersApi** — 688-line API service for poster CRUD
7. **Poster archive** — saved/highlighted posters

### What's missing

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No story bar at top of feed** — no avatar circle rail with seen/unseen rings | High |
| 2 | **No story ring on avatars** — no gradient ring for unseen, grey for seen | High |
| 3 | **No 24h ephemerality** — posters appear to be permanent, not 24h ephemeral | High |
| 4 | **No story stickers** — no location, mention, product, poll stickers on stories | Medium |
| 5 | **No product tags in stories** — no shoppable story stickers | High |
| 6 | **No views tracking UI** — no "who viewed" list for creators | Medium |
| 7 | **No story reply via DM** — PosterReactionReplyBar exists but may not integrate with DM | Medium |
| 8 | **No press-to-pause** — long-press may not pause story and hide chrome | Low |
| 9 | **No story camera with filters** — story creation doesn't have AR filters or quick editing | Medium |
| 10 | **No story bar in navigation** — stories are not surfaced as a daily habit | High |

---

## 4. Micro Improvements

### M1 — Add StoryBar to top of feed
Horizontal rail of avatar circles at the top of HomeScreen. First item: "Your Story" (add button). Following items: sellers/creators the user follows, with unseen stories. Gradient ring for unseen, grey ring for seen. Tap to open PosterViewerScreen.

### M2 — Add story rings to avatars
Gradient ring (brand colors) around avatar when story is unseen. Grey ring when seen. Animate ring fill on first view. Use Reanimated 3 for smooth ring animation.

### M3 — Implement 24h ephemerality
Add `expiresAt: Date` to poster model. Posters expire after 24h. Expired posters move to archive/highlights. Backend filters expired posters from story bar. Show "expired" state gracefully.

### M4 — Add product sticker to stories
When creating a story, seller can tag a product. Product appears as a tappable sticker on the story. Tap opens product sheet. Sticker shows product image + price.

### M5 — Add views tracking
Creator can swipe up on their own story to see a viewer list. Shows avatar + name + timestamp for each view. Sorted by most recent.

### M6 — Add press-to-pause
Long-press on story pauses auto-advance and hides UI chrome (progress segments, action buttons, reply bar). Release resumes. Haptic on pause.

### M7 — Add story reply via DM
Reply bar at the bottom of story viewer. Typing a reply sends a DM to the story creator with the story attached as context. Integrate with existing chat system.

### M8 — Add story stickers (location, mention, hashtag)
- **Location sticker** — tappable, opens location feed
- **Mention sticker** — @username, tappable, opens profile
- **Hashtag sticker** — #tag, tappable, opens hashtag feed

---

## 5. Macro Improvements

### A1 — Story system architecture
Unify the poster system with story patterns:
- `StoryBar` — top-of-feed avatar rail
- `StoryViewer` — full-screen viewer (evolve PosterViewerScreen)
- `StoryCamera` — capture-first story creation (evolve PosterStoryActivityScreen)
- `StoryStickers` — product, location, mention, hashtag, poll stickers
- `StoryRing` — avatar ring component (seen/unseen states)
- `StoryViewsList` — viewer list for creators
- `StoryReplyBar` — reply via DM

### A2 — Stories as commerce touchpoints
Every seller should be able to:
1. Post a story showing a new drop (24h urgency)
2. Tag products in the story (shoppable)
3. See who viewed (lead generation)
4. Receive replies via DM (customer engagement)
5. Save best stories as highlights (permanent storefront)

### A3 — Story analytics
Track per-story: views, completion rate, product tag tap rate, reply rate, screenshot rate (where available). Feed into seller analytics dashboard.

---

## 6. Flagship Acceptance Criteria

- **StoryBar** at top of feed with avatar circles and seen/unseen rings
- **24h ephemerality** — stories expire, highlights persist
- **Product stickers** — tappable, shoppable
- **Views tracking** — creator can see who viewed
- **Reply via DM** — reply bar sends DM
- **Press-to-pause** — long-press pauses and hides chrome
- **Progress segments** — already exist, maintain
- **Tap navigation** — left/right for next/prev
- **Story camera** — capture-first with quick editing
- **Reduced motion** — no auto-advance animation, manual tap only

### Thumbnail test
At 25% scale, the story bar must show: a row of circles with gradient rings. The story viewer must show: full-screen media, progress segments at top, action buttons at bottom. Media dominates.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — StoryBar at top of feed | Medium | Daily habit |
| P0 | M3 — 24h ephemerality | Medium | Urgency |
| P0 | M2 — Story rings on avatars | Low | Visual signal |
| P1 | M4 — Product stickers | Medium | Shoppable stories |
| P1 | M7 — Story reply via DM | Medium | Engagement |
| P1 | M6 — Press-to-pause | Low | UX standard |
| P2 | M5 — Views tracking | Medium | Creator tools |
| P2 | M8 — Story stickers (location/mention) | Medium | Richness |
| P3 | A1 — Full story system | High | All story surfaces |
| P3 | A2 — Stories as commerce touchpoints | High | Seller engagement |
| P3 | A3 — Story analytics | Medium | Seller insights |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `storyBar.height` | 96pt | Avatar circles + label |
| `storyBar.avatar.size` | 64pt | StoryRing size |
| `storyBar.avatar.gap` | Space.md | Between circles |
| `storyRing.unseen.gradient` | [colors.brand, colors.brandAlt] | Gradient |
| `storyRing.seen.color` | colors.border | Grey |
| `storyRing.thickness` | 2pt | Ring stroke |
| `storyViewer.aspectRatio` | 9:16 | Full-screen |
| `storyViewer.autoAdvance` | 5000ms (photo) | Video = duration |
| `storyProgress.height` | 2pt | Per segment |
| `storyProgress.color` | rgba(255,255,255,0.3) | Inactive |
| `storyProgress.activeColor` | #FFFFFF | Active |
| `storyProgress.gap` | 2pt | Between segments |
| `storySticker.product.height` | 44pt | Tappable |
| `storySticker.product.radius` | Radius.md | |
| `storySticker.product.background` | rgba(0,0,0,0.6) | Dark overlay |
| `storyReply.height` | 44pt | Bottom bar |
| `storyReply.background` | rgba(0,0,0,0.3) | |
| `storyPause.haptic` | selection | On long-press |

---

*Generated 2026-08-18. Verified sources: about.instagram.com/features/stories, about.instagram.com/blog/tips-and-tricks/how-to-use-instagram-stories, blog.hootsuite.com/instagram-stories (2026 updates: Story comments, Instagram Plus, 48h lifespan, AI collage), metricool.com/stories-instagram (60s auto-split, Add Yours, layout, photo stickers), piunikaweb.com (May 2026 progress bar bottom A/B test), newsroom.snap.com (Auto-Save Stories to Public Profiles, Timeline Editor, Creator Subscriptions Feb 2026), help.snapchat.com (Rewatch Indicator), whizsky.com (Pinterest sunset Story Pins/Idea Pins 2023, folded into video Pins 2026). Production codebase audit: PosterViewerScreen, PosterStoryActivityScreen, PosterProgressSegments, PosterReactionReplyBar, postersApi.*
