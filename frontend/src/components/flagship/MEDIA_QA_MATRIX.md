# Media QA Matrix

Required edge-case coverage for the flagship media system (`FlagshipImage` +
`theme/mediaAssets.ts`). Every scenario must be verified on at least one
iOS device, one Android device, and web before a media-touching release.

## Required test scenarios

| # | Scenario | Expected behavior | Status |
|---|----------|-------------------|--------|
| 1 | Normal product image | Loads with correct 4:5 aspect ratio, BlurHash placeholder crossfades to full image | |
| 2 | Low-memory Android | Decodes progressively, no OOM; Expo Image `memory-disk` cache evicts under pressure | |
| 3 | Slow network (3G) | BlurHash placeholder shows instantly, image loads progressively, no grey box | |
| 4 | Image rotation metadata | Image displays in correct EXIF orientation (Expo Image honours metadata) | |
| 5 | Panoramic image (evidence category) | `contain` fit, no distortion, letterboxed within 4:3 frame | |
| 6 | Transparent PNG | Displays with correct alpha over surface token | |
| 7 | Short video thumbnail (`isVideo`) | Shows centered play glyph + duration chip; no native video chrome | |
| 8 | Failed thumbnail (404) | Shows corrupt-media state with Retry button, not a broken icon | |
| 9 | Removed remote image | Shows fallback placeholder (BlurHash if supplied, else skeleton) then error state | |
| 10 | Corrupt image data | Shows error state with broken-image glyph + Retry; Retry re-fetches (recyclingKey changes) | |
| 11 | Large image (>10MB) | Downscales via Expo Image early resize, no memory spike | |
| 12 | Content-warning image (`contentWarning`) | Blurred scrim + warning copy + "Tap to reveal"; tap reveals with light haptic | |
| 13 | RTL layout | Image position mirrors; attribution chip mirrors to top-right | |
| 14 | Dark mode | Placeholder matches dark surface token; no grey-on-grey | |
| 15 | Dynamic type (large) | Image area does not shrink; aspect ratio preserved | |
| 16 | Focal point override (product) | `contentPosition` honours focal point; subject preserved in cover crop | |
| 17 | Focal point on story (disallowed) | Override ignored; full-bleed cover retained | |
| 18 | Sponsored attribution chip | Chip renders top-left scrim, legible in both themes | |
| 19 | Reduced motion | Shimmer + crossfade collapse to instant; no animation | |
| 20 | Pressable frame (`onPress`) | Frame exposes `button` role + label; press fires callback | |
| 21 | Screen reader | `accessibilityLabel` announced; video frames announce "video"; sensitive frames announce hint | |
| 22 | Cache invalidation (cacheBuster) | New URI re-fetches; stale entry not served from cache | |

## Performance budgets

| Metric | Budget | Measurement |
|--------|--------|-------------|
| First-frame placeholder | < 16ms (BlurHash decode) | Perf monitor |
| Full image crossfade | 250ms (mediaLoad token) | Reanimated |
| Memory per visible tile | < 4MB (downscaled derivative) | Xcode Instruments / Android Profiler |
| Cache hit rate (scroll) | > 90% | Expo Image cache stats |
| Retry re-fetch latency | one network round-trip | Network profiler |

## Notes

- Expo Image is the 2026 modern standard (BlurHash/ThumbHash, `contentFit`,
  `contentPosition`, caching, transitions). `FlagshipImage` wraps it; the
  legacy `CachedImage` remains for surfaces not yet migrated.
- Category-aware geometry lives in `theme/mediaAssets.ts` — never invent
  per-screen ratios.
- Sensitive-media blur is a scrim + tap-to-reveal, never a permanent censor
  bar (AGENTS §4: full state coverage, no dead-end states).
