# ThryftVerse Flagship Upgrade — Video Player Component

**Component deep-dive:** video playback controls, scrub bar, PiP, fullscreen, autoplay, muted/unmuted toggle, double-tap to like, product tag overlays.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4 §17 · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram Reels (2026)
- Full-screen 9:16, edge-to-edge, muted autoplay, tap to unmute
- Thin 2pt progress bar at bottom, scrubbable, white at 60% opacity
- Double-tap to like with heart particle at tap location
- Right rail: like, comment, share, save (28pt icons, 48pt touch targets)
- Creator row at top: avatar + name + Follow button
- Caption truncated with "more", music track label

### TikTok (2026)
- Escalating seek: 1-3 taps = 5s, 4-12 = 10s, 13+ = 30s, with haptic + visual badge
- Sound on by default (TikTok-specific; Instagram defaults muted)
- Stitch/Duet buttons (collaborative formats)
- Progress bar: thin white line, scrubbable

### Cross-cutting 2026 consensus
- expo-video is the React Native standard
- Muted autoplay + tap-to-unmute (commerce-safe default)
- 2pt scrubbable progress bar, white at 60% opacity
- Double-tap to like with particle animation
- One active player at a time (viewability-driven)
- PiP on iOS 15+ / Android 8+
- Product tag overlays: tappable, timestamp-specific

---

## 2. Psychology & Principles

### Muted autoplay respects context
Most users browse with sound off. A video that requires sound is broken. Muted autoplay + tap-to-unmute is the commerce-safe default — the product is visible without sound, and the user opts into audio.

### The progress bar as time pressure
A visible progress bar creates subtle urgency — the user can see the video is advancing. For a 15-60s reel, this keeps attention locked. The bar must be scrubbable so the user can re-watch or skip.

### Double-tap as reflexive engagement
Double-tap to like is a reflexive action — the user doesn't think about it, they just do it. The heart particle at the tap location provides immediate visual feedback. This is the lightest-weight engagement signal.

---

## 3. Current ThryftVerse Audit — Concrete Defects

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `components/compat/Video.tsx` | 212 | expo-av → expo-video compat shim | ✅ Senior |
| `hooks/useViewabilityPlayback.ts` | 109 | Viewability-driven autoplay | ✅ Senior |
| `components/commerce/CommerceMediaStage.tsx` | 840+ | PDP gallery with video | ✅ Substantial |
| `components/ui/MediaStage.tsx` | 572+ | Generic media stage | ✅ Exists |
| `components/MediaPreview.tsx` | — | Feed media preview | ✅ Exists |

### Defects

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No scrubbable progress bar** — no seek bar on any video surface | High |
| 2 | **No muted autoplay + tap-to-unmute** — no unmute toggle | High |
| 3 | **No PiP support** — video stops on navigation | Medium |
| 4 | **No double-tap to like on feed video** — only on CommerceMediaStage | Medium |
| 5 | **No product tag overlays** — no tappable tags on video | High |
| 6 | **No fullscreen video** — no landscape fullscreen mode | Medium |
| 7 | **No video controls (play/pause/seek)** — no visible controls | High |
| 8 | **No shared VideoPlayer component** — each surface builds its own | Medium |

---

## 4. Micro Improvements

### M1 — Create shared VideoPlayer component
```tsx
interface VideoPlayerProps {
  source: string;
  shouldPlay: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  onDoubleTap: () => void;
  showControls: boolean;
  showProgress: boolean;
  productTags?: ProductTag[];
  piPEnabled?: boolean;
}
```
Wraps expo-video's `useVideoPlayer` + `VideoView`. Adds: scrubbable progress bar, mute toggle, double-tap to like, product tag overlays, PiP support.

### M2 — Add scrubbable progress bar
2pt bar at bottom, white at 60% opacity. Drag to seek. Shows current position. Haptic on seek release. Animated fill from left to right.

### M3 — Add muted autoplay + tap-to-unmute
Videos play muted by default. Tap on video toggles mute. Small mute/unmute icon (24pt) in bottom-right corner. Respect `useReducedMotion`.

### M4 — Add double-tap to like (extract from CommerceMediaStage)
Extract the double-tap heart animation from CommerceMediaStage into a shared `useDoubleTapToLike` hook. Apply to all video surfaces.

### M5 — Add product tag overlays
Tappable pills positioned on video at timestamp-specific locations. Tap opens product sheet. Tags appear/disappear at their timestamp. 32pt height, dark overlay, white text, Radius.full.

### M6 — Add PiP support
Use expo-video PiP API. Video continues in PiP window when user navigates away. PiP window is resizable and repositionable.

---

## 5. Macro Improvements

### A1 — Video player component system
- `VideoPlayer` — core player with controls, progress, PiP
- `ReelsFeed` — full-screen vertical pager using VideoPlayer
- `ShoppableVideo` — VideoPlayer with product tag overlays
- `useDoubleTapToLike` — shared hook for heart particle
- `useViewabilityPlayback` — already exists, extend with PiP awareness

---

## 6. Flagship Acceptance Criteria

- **Shared VideoPlayer** with controls, progress, PiP
- **Scrubbable progress bar** — 2pt, white 60%, drag to seek
- **Muted autoplay + tap-to-unmute**
- **Double-tap to like** with heart particle
- **Product tag overlays** — tappable, timestamp-specific
- **PiP support** — video continues on navigation
- **One active player** — viewability-driven
- **Reduced motion** — no particle animation

### Thumbnail test
At 25% scale, a video player must show: full-screen video, progress bar at bottom, action icons on right. Video dominates; chrome recedes.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Shared VideoPlayer | Medium | All video surfaces |
| P0 | M2 — Scrubbable progress bar | Low | Seek UX |
| P1 | M3 — Muted autoplay + unmute | Low | UX standard |
| P1 | M4 — Double-tap to like | Low | Engagement |
| P1 | M5 — Product tag overlays | Medium | Shoppable video |
| P2 | M6 — PiP support | Medium | Background video |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `videoPlayer.progress.height` | 2pt | Thin bar |
| `videoPlayer.progress.color` | rgba(255,255,255,0.6) | |
| `videoPlayer.progress.activeColor` | #FFFFFF | |
| `videoPlayer.muteIcon.size` | 24pt | Bottom-right |
| `videoPlayer.muteIcon.color` | #FFFFFF | |
| `videoPlayer.doubleTap.heart.size` | 80pt | Particle |
| `videoPlayer.doubleTap.haptic` | selection | |
| `videoPlayer.actionRail.width` | 48pt | Right edge |
| `videoPlayer.actionRail.iconSize` | 28pt | |
| `videoPlayer.actionRail.gap` | Space.md | |
| `videoPlayer.productTag.height` | 32pt | |
| `videoPlayer.productTag.background` | rgba(0,0,0,0.6) | |
| `videoPlayer.productTag.text` | #FFFFFF | |
| `videoPlayer.productTag.radius` | Radius.full | |

---

*Generated 2026-08-18. Verified sources: creators.instagram.com/blog/new-ways-to-earn-making-reels-shoppable (March 2026, 30 product tags per Reel), docs.expo.dev/versions/unversioned/sdk-video (PiP, fullscreen, background playback, useVideoPlayer, keepFullscreenOnPiPStop), github.com/expo/expo PR #44811 (keepFullscreenOnPiPStop iOS 2026), socialpilot.co/blog/tiktok-algorithm (hold-for-2x, follower-first distribution), hootsuite.com/tiktok-algorithm (watch time strongest signal), buzzmixdaily.com (TikTok progress bar scrubbing on eligible videos). Note: "TikTok escalating seek" was an incorrect claim in the original draft — TikTok uses hold-for-2x and progress bar scrubbing, not escalating tap-to-skip. Production codebase audit: Video.tsx, useViewabilityPlayback.ts, CommerceMediaStage.tsx.*
