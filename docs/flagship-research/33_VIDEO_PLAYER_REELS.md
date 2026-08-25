# 33 — Video Player & Reels: Flagship Research Report

> **Department:** Video playback, full-screen vertical video (reels), video scrubbing, PiP, shoppable video, video compression
> **Benchmark date:** 2026-08
> **Primary benchmarks:** Instagram Reels · TikTok · Whatmore SDK · expo-video
> **Sources:** production codebase audit · 2026 web research (creators.instagram.com, theverge.com, engadget.com, whatmore.ai, docs.expo.dev, socialpilot.co, hootsuite.com, underthehoodit.com) · AGENTS.md §4 §17

---

## 1. 2026 Competitor Benchmark

### Instagram Reels (2026)
Instagram Reels is the gold standard for full-screen vertical video in a social-commerce app. Verified 2026 patterns:
- **Full-screen vertical video** — 9:16 aspect ratio, edge-to-edge, no letterboxing
- **Swipe-to-next** — vertical pager (Gesture.Pan), spring physics, one video at a time
- **Autoplay on viewability** — only the most-visible reel plays; offscreen reels pause immediately
- **Muted autoplay** — plays muted by default; tap to unmute (respecting user context)
- **Overlay UI** — creator row (avatar + name + Follow), caption (truncated with "more"), music track, product tags, like/comment/share/save actions on the right rail
- **Progress bar** — thin white bar at the bottom, scrubbable, shows position
- **Double-tap to like** — heart animation spawns at tap location, haptic
- **Shoppable Reels (March 2026)** — creators can tag up to **30 products** per Reel via "Add product" in Share sheet. Products must be in Meta commerce catalog. Affiliate links supported. Amazon, Temu, eBay integrations coming. Product tags appear as floating bubbles viewers tap to shop. Content with product tags appears in Partnership Ads Hub.
- **Seamless loop** — video loops without visible seam; no "replay" button

### TikTok (2026)
TikTok defined the reels format. Verified 2026 patterns:
- **Hold-for-2x speed** — press and hold to play at 2x; playback speed control also in Share menu (1x, 1.5x, 2x)
- **Progress bar scrubbing** — thin white dot at bottom on eligible videos; drag to seek. Not available on all videos (short videos, ads, live streams may lack scrubbing). Longer videos more likely to show the bar.
- **Interest graph, not social graph** — FYP recommends based on what you watch and engage with, not who you follow. Watch time and completion rate are the highest-weighted signals. New videos first shown to creator's own followers (follower-first initial distribution, changed 2025), then expanded based on cohort response.
- **Sound-on by default** — TikTok defaults to sound on; Instagram defaults to muted. For commerce, muted autoplay is safer.
- **Stitch/Duet** — collaborative video formats (less relevant for commerce but shows video composition)
- **Video compression** — server-side adaptive bitrate (HLS); client receives optimal quality for bandwidth
- **Note:** TikTok does NOT have "escalating seek" (multiple taps = increasing skip duration). This was an incorrect claim in the original draft. TikTok uses hold-for-2x and progress bar scrubbing.

### Whatmore SDK (2026)
Whatmore provides native shoppable video SDK for iOS/Android/React Native. Verified from whatmore.ai/in-app-video:
- **Reel, Feed, Carousel templates** — three drop-in templates sharing the same store feed, player, and event model
- **Reel** — full-screen vertical feed, Instagram Reels-grade UX, autoplay muted, swipe-to-next, native scroll physics on iOS/Android/RN. Sits in app's tab bar as its own destination.
- **Feed** — scrolling post feed for a single creator/influencer page, their videos + products + engagement
- **Carousel** — horizontal muted-autoplay rail of video cards, drops into home/category/PDP. Tap opens full-screen Reel.
- **Product tags surface automatically** — viewers never leave the video to shop
- **Direct integration** — Swift, Kotlin, or React Native; drops into existing codebase, no app marketplace
- **Enterprise plan** — React Native app integration, managed A/B testing, from $499/mo
- **AI product tagging** — auto-detects products in videos and attaches SKUs

### expo-video (2026)
expo-video is the React Native standard for video playback. Verified from docs.expo.dev:
- **PiP support** — `supportsPictureInPicture: true` in config plugin; `allowsPictureInPicture` prop on VideoView; `onPictureInPictureStart`/`onPictureInPictureStop` callbacks
- **Background playback** — `supportsBackgroundPlayback: true` config plugin
- **Fullscreen** — `fullscreenOptions` prop, `enterFullscreen`/`exitFullscreen` methods
- **Native controls** — `nativeControls` prop (always enabled in fullscreen)
- **Content fit** — `'contain'`, `'cover'`, `'fill'` options
- **`keepFullscreenOnPiPStop`** — iOS 2026 addition: `'always'`, `'autoEnter'` (default), `'never'`
- **`useVideoPlayer`** hook — declarative player creation with callback for configuration

### Cross-cutting 2026 consensus
- **expo-video** is the React Native standard (replaces deprecated expo-av)
- **Vertical pager** via react-native-gesture-handler Gesture.Pan or Reanimated 3
- **Viewability-driven autoplay** — one active player, settlement delay on scroll
- **Muted autoplay + tap-to-unmute** — respects user context
- **Thin progress bar** — scrubbable, 2-3pt height, white at 60% opacity
- **Double-tap to like** — with heart particle animation
- **Product overlay tags** — tappable, positioned on video, tap opens sheet
- **HLS adaptive streaming** — server-side, client receives optimal quality
- **PiP (picture-in-picture)** — video continues when user navigates away (iOS 15+, Android 8+)

---

## 2. Psychology & Principles

### The reels dopamine loop
Reels are the most engaging video format because they combine: variable reward (you don't know what the next video is), effortless consumption (swipe up), and short duration (15-60s). This is the Hook Model in its purest form: Trigger (boredom) → Action (swipe) → Variable Reward (next video) → Investment (like/comment/share). For commerce, this means: reels are the highest-engagement discovery surface.

### Sound-off by default
Most users browse with sound off (public transit, office, bed). A reel that requires sound to be understood is a broken reel. The 2026 standard: muted autoplay with captions/overlay text, tap to unmute. For commerce, the product must be visible without sound — overlay tags, price, and product name on the video.

### The single-player rule
Only one video should play at a time. Multiple simultaneous players drain battery, consume bandwidth, and create audio chaos. The viewability-driven approach (only the most-visible item plays) is non-negotiable for performance.

### Shoppable video as discovery
A reel with product tags is a discovery surface — the user watches the video, sees a product they like, taps the tag, and lands on the PDP. This is the shortest path from entertainment to purchase. The 2026 standard: every commerce video should have tappable product tags.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Video infrastructure

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `components/compat/Video.tsx` | 212 | expo-av compat shim over expo-video | ✅ Well-built |
| `hooks/useViewabilityPlayback.ts` | 109 | Viewability-driven autoplay | ✅ Senior quality |
| `components/commerce/CommerceMediaStage.tsx` | 840+ | PDP gallery with video support | ✅ Uses expo-video directly |
| `components/ui/MediaStage.tsx` | 572+ | Generic media stage | ✅ Exists |
| `components/MediaPreview.tsx` | — | Feed media preview | ✅ Exists |
| `screens/PosterViewerScreen.tsx` | 907+ | Poster/story viewer | ✅ Substantial |
| `screens/LiveStreamViewerScreen.tsx` | — | Live stream viewer | ⚠️ Fabricated viewer counts |

### What exists (genuinely senior)
1. **expo-video integration** — `components/compat/Video.tsx` is a well-built compat shim migrating from expo-av to expo-video (SDK 54). It properly translates declarative props to imperative `useVideoPlayer`.
2. **Viewability playback hook** — `useViewabilityPlayback.ts` implements the 2026 best practice: one active player, settlement delay (350ms), 60% visibility threshold, immediate pause on offscreen. This is genuinely senior code.
3. **CommerceMediaStage** — PDP gallery supports video with pan/zoom, double-tap to like, shared element transitions. Uses expo-video directly.
4. **PosterViewerScreen** — 907-line poster/story viewer with progress segments, tap-to-advance, swipe navigation.

### What's missing

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No reels/short-form video feed** — no full-screen vertical pager, no swipe-to-next, no reels tab | High |
| 2 | **No video scrubbing/seek bar** — no scrubbable progress bar on any video surface | High |
| 3 | **No PiP (picture-in-picture)** — video stops when user navigates away | Medium |
| 4 | **No HLS/adaptive streaming** — no server-side bitrate adaptation | Medium |
| 5 | **No shoppable video tags** — no tappable product overlays on video | High |
| 6 | **No double-tap to like on video** — CommerceMediaStage has it but not on feed video | Medium |
| 7 | **No video compression pipeline** — no client-side or server-side compression for uploads | Medium |
| 8 | **No muted autoplay + tap-to-unmute** — videos are either shouldPlay or not, no unmute toggle | Medium |
| 9 | **No video captions/overlay text** — no auto-captions for accessibility | Medium |
| 10 | **No reels tab in navigation** — no dedicated video destination in the tab bar | High |
| 11 | **Live stream viewer fabricates data** — `LiveStreamViewerScreen` uses Math.random() for viewer counts (per Report #17) | High |
| 12 | **No video analytics** — no watch time, completion rate, skip rate tracking | Medium |

---

## 4. Micro Improvements

### M1 — Create ReelsFeed component
```tsx
interface ReelsFeedProps {
  videos: ReelVideo[];
  onProductTagTap: (productId: string) => void;
  onCreatorTap: (creatorId: string) => void;
}
interface ReelVideo {
  id: string;
  uri: string;
  posterUri: string;
  creator: { id: string; name: string; avatar: string; isFollowing: boolean };
  caption: string;
  musicTrack?: string;
  productTags: ProductTag[];
  likes: number;
  comments: number;
  hasLiked: boolean;
}
```
Full-screen vertical pager, one video at a time, viewability-driven autoplay, muted by default, tap to unmute, double-tap to like, right rail actions, progress bar, product tags.

### M2 — Add scrubbable progress bar
Thin 2pt bar at the bottom of video, white at 60% opacity. Drag to seek. Shows current position. Haptic on seek release.

### M3 — Add product tag overlays
Tappable pills positioned on the video at timestamp-specific locations. Tap opens a product sheet (bottom sheet with product image, price, "View details"). Tags appear/disappear at their timestamp.

### M4 — Add double-tap to like on all video surfaces
Double-tap spawns heart particle animation at tap location. Haptic (selection). Toggles like state. Already exists in CommerceMediaStage — extract to shared hook.

### M5 — Add muted autoplay + tap-to-unmute
Videos play muted by default. Tap on video toggles mute. Show a small mute/unmute icon in the corner. Respect `useReducedMotion` — no particle animation when reduced.

### M6 — Add PiP support
On iOS 15+ and Android 8+, video continues in PiP when user navigates away. Use expo-video's PiP API or native module.

### M7 — Add video compression for uploads
Client-side: use `expo-video-thumbnails` for poster generation, compress video before upload (reduce resolution to 1080p, bitrate to 4Mbps). Server-side: HLS transcoding pipeline.

### M8 — Add reels tab to navigation
Add a "Watch" or "Reels" tab to the tab bar — a dedicated video destination. Populate with creator videos, shoppable content, and live shopping replays.

---

## 5. Macro Improvements

### A1 — Video platform architecture
Create a unified video platform:
- `VideoPlayer` — core player component (expo-video wrapper with controls, PiP, captions)
- `ReelsFeed` — full-screen vertical pager for reels
- `ShoppableVideo` — video with product tag overlays
- `VideoUploader` — compression + upload pipeline
- `useViewabilityPlayback` — already exists, extend with PiP awareness

### A2 — Shoppable video as a discovery surface
Every video in ThryftVerse should be shoppable:
- **Creator videos** — product tags overlaid, tap to shop
- **Live shopping replays** — product timeline synced with video
- **Seller listing videos** — the listing IS the video, with buy button overlay
- **User-generated content** — tag products in your own videos

### A3 — Video analytics pipeline
Track per-video: watch time, completion rate, skip rate, replay rate, product tag tap rate, product tag → purchase rate. Feed back into recommendation engine.

---

## 6. Flagship Acceptance Criteria

- **ReelsFeed** — full-screen vertical pager, swipe-to-next, one player at a time
- **Scrubbable progress bar** on all video surfaces
- **Muted autoplay + tap-to-unmute**
- **Double-tap to like** with heart particle
- **Product tag overlays** — tappable, timestamp-specific
- **PiP support** — video continues when navigating away
- **Video compression** — 1080p, 4Mbps for uploads
- **Reels tab** in navigation
- **Viewability-driven autoplay** — already exists, maintain
- **Reduced motion** — no particle animations
- **Accessibility** — video captions, VoiceOver labels for controls

### Thumbnail test
At 25% scale, a reel must show: full-screen video, creator row at top, right rail of action icons, progress bar at bottom. The video must dominate — chrome recedes.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — ReelsFeed component | High | Reels surface |
| P0 | M3 — Product tag overlays | Medium | Shoppable video |
| P0 | M8 — Reels tab in navigation | Low | Video destination |
| P1 | M2 — Scrubbable progress bar | Low | All video surfaces |
| P1 | M4 — Double-tap to like (extract) | Low | Engagement |
| P1 | M5 — Muted autoplay + unmute | Low | UX standard |
| P2 | M6 — PiP support | Medium | Background video |
| P2 | M7 — Video compression | Medium | Upload quality |
| P3 | A1 — Full video platform | High | All video surfaces |
| P3 | A2 — Shoppable video everywhere | High | Commerce discovery |
| P3 | A3 — Video analytics | Medium | Recommendation feed |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `reels.video.aspectRatio` | 9:16 | Full-screen vertical |
| `reels.pager.gesture` | Gesture.Pan (vertical) | Reanimated 3 spring |
| `reels.pager.spring` | Motion.spring.entrance | |
| `reels.viewability.threshold` | 60% | Already in useViewabilityPlayback |
| `reels.viewability.settlement` | 350ms | Already implemented |
| `reels.progress.height` | 2pt | Thin bar |
| `reels.progress.color` | rgba(255,255,255,0.6) | |
| `reels.progress.activeColor` | #FFFFFF | |
| `reels.mutedDefault` | true | Respect context |
| `reels.unmuteIcon.size` | 24pt | Bottom-right corner |
| `reels.actionRail.width` | 48pt | Right edge |
| `reels.actionRail.iconSize` | 28pt | Like, comment, share, save |
| `reels.actionRail.gap` | Space.md | Between actions |
| `reels.creatorRow.height` | 44pt | Avatar + name + Follow |
| `reels.productTag.height` | 32pt | Pill |
| `reels.productTag.background` | rgba(0,0,0,0.6) | Dark overlay |
| `reels.productTag.text` | #FFFFFF | |
| `reels.productTag.radius` | Radius.full | |
| `reels.doubleTap.heart.size` | 80pt | Particle animation |
| `reels.doubleTap.haptic` | selection | |
| `video.compression.maxResolution` | 1080p | Upload |
| `video.compression.maxBitrate` | 4Mbps | |
| `video.hls.variants` | 240p, 480p, 720p, 1080p | Adaptive |

---

*Generated 2026-08-18. Verified sources: creators.instagram.com/blog/new-ways-to-earn-making-reels-shoppable (March 2026, 30 product tags, affiliate links), theverge.com/news/899717 (Meta affiliate shopping links), engadget.com (30 products per Reel), developers.facebook.com/docs/instagram-platform (30 tags for Reels, 20 for feed), whatmore.ai/in-app-video (Reel/Feed/Carousel templates, RN SDK), whatmore.ai/shoppable-videos/enterprise (React Native $499/mo), docs.expo.dev/versions/unversioned/sdk-video (PiP, background playback, fullscreen, keepFullscreenOnPiPStop), github.com/expo/expo PR #44811 (keepFullscreenOnPiPStop iOS 2026), socialpilot.co/blog/tiktok-algorithm (FYP signals, follower-first initial distribution), hootsuite.com/tiktok-algorithm (watch time strongest signal, hold-for-2x), underthehoodit.com (TikTok ranking architecture), technobezz.com (TikTok hold-for-2x speed), buzzmixdaily.com (TikTok progress bar scrubbing). Production codebase audit: Video.tsx, useViewabilityPlayback.ts, CommerceMediaStage.tsx.*
