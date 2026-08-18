# ThryftVerse Flagship Upgrade — Progress & Loading Indicators

**Component deep-dive:** every determinate progress bar, step indicator, circular progress ring, upload progress, and indeterminate spinner in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §15, §27 · production codebase audit · 2026 web research (Numan RN Progress Bar Guide, VP0 Journal RAG Upload Progress, AuditBuffet Pattern Catalog, oblador/react-native-progress).

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram's story progress bars are the benchmark for segmented progress: thin (2px) bars at the top of the viewport, one per story segment, filling left-to-right with a spring animation. Pausing holds the fill; tapping advances to the next segment with a haptic. The bars use a subtle gradient and the unfilled portion is a translucent white — not a grey track. Instagram's lesson: **progress bars can be ambient — they communicate without demanding attention.**

### Snapchat (2026)
Snapchat's capture ring is the benchmark for circular progress: a ring around the capture button that fills as you hold to record, changing color (red → yellow → purple) as the duration increases. The ring is the primary affordance — it tells the user "keep holding" and "you're almost done." Snapchat's lesson: **circular progress can be the control itself, not just a display.**

### eBay (2026)
eBay's order status tracker is the benchmark for step indicators: a horizontal stepper with 5 stages (Placed → Paid → Shipped → In Transit → Delivered), each with an icon, label, and timestamp. Completed steps are filled; the current step pulses; future steps are outlined. A failure state replaces the current step with a warning icon. eBay's lesson: **step indicators must show failure states, not just success states.**

### Cross-cutting 2026 consensus
- **Determinate vs indeterminate:** Use determinate progress (bar or ring) when the percentage is known; use indeterminate (spinner) only when it's not ([AuditBuffet Pattern Catalog](https://auditbuffet.com/patterns/ab-001959), [Numan RN Progress Bar Guide](https://numan.dev/react-native-progress-bar-guide)).
- **Never fake progress:** A bar that animates to 90% and hangs is "the genre's defining lie" — show real progress or show a spinner ([VP0 Journal — RAG Upload Progress](https://vp0.com/blogs/rag-document-upload-progress-ui-react-native)).
- **Multi-stage pipelines:** For multi-step operations (upload → process → index), show stepped progress with per-stage status, not a single bar ([VP0 Journal](https://vp0.com/blogs/rag-document-upload-progress-ui-react-native)).
- **Accessibility:** `accessibilityRole="progressbar"` with `accessibilityValue={{ min, now, max }}` for screen reader announcements.
- **Reduced motion:** Progress fills should still animate (they convey information), but decorative shimmer/pulse should be disabled.
- **Platform conventions:** `ActivityIndicator` for indeterminate, `ProgressBar` for determinate — custom implementations that diverge from platform conventions erode coherence ([AuditBuffet](https://auditbuffet.com/patterns/ab-001959)).

---

## 2. Psychology & Principles

### Progress as trust
Progress indicators are trust signals. A user who sees a progress bar moving knows the app is working. A user who sees a spinner for 10 seconds with no progress bar assumes the app is frozen. The 2026 standard: if you can calculate progress, show it. If you can't, show a spinner with a status label ("Loading your feed..."), not a bare spinner.

### The 90% hang
The most common progress UI defect: a bar that animates to 90% quickly, then hangs at 90% while the actual operation finishes. This is worse than a spinner because it sets an expectation ("almost done!") that the app then fails to meet. The fix: either show real progress (bytes uploaded / bytes total) or don't show a determinate bar at all.

### Perceived duration and progress speed
Progress bars that move at a constant speed feel slower than bars that decelerate (fast at first, slow at the end). This is the "progress bar illusion" — users perceive decelerating bars as faster even when the actual duration is identical. The 2026 standard: use a slight deceleration curve on progress fills.

### Step indicators and completion anxiety
Step indicators reduce completion anxiety by showing the user how many steps remain. "Step 2 of 4" is more reassuring than a spinner because it sets an expectation for the total effort. The key: the step count must be accurate. "Step 2 of 4" that becomes "Step 2 of 6" mid-flow breaks trust.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Dedicated progress components (6 files)

| File | Lines | Type | Animated |
|------|-------|------|----------|
| `components/orders/OrderStatusStepper.tsx` | 193 | Step indicator (5 stages) | ✅ |
| `components/poster/PosterProgressSegments.tsx` | 266 | Story-style segmented bar | ✅ Reanimated spring |
| `creator/camera/RecordingRing.tsx` | 100 | Circular SVG ring | ✅ Reanimated |
| `components/profile/ProfileCompletenessIndicator.tsx` | 164 | Linear progress bar | ❌ Static |
| `components/ui/HoldToSubmitButton.tsx` | 177 | Hold-to-submit ring | ✅ Reanimated |
| `components/auction/AuctionCountdown.tsx` | 202 | Linear progress bar | ❌ Static |

### Inline progress implementations (18 locations)

| Screen/Component | Lines | Type | Animated |
|------------------|-------|------|----------|
| `KYCVerificationScreen.tsx` | 451-502 | Step indicator (4 steps) | ❌ |
| `StyleQuizScreen.tsx` | 205-217 | Linear bar | ❌ Static |
| `CreateAuctionScreen.tsx` | 249-269 | Step indicator (3 steps) | ❌ |
| `WalletConvertScreen.tsx` | 277-324 | Step indicator | ❌ |
| `PushNotificationsScreen.tsx` | 270-282 | Linear bar | ❌ Static |
| `NotificationPreferencesScreen.tsx` | 129-141 | Linear bar | ❌ Static |
| `AIPreferencesScreen.tsx` | 127-139 | Linear bar | ❌ Static |
| `InviteFriendsScreen.tsx` | 222-224 | Linear bar | ❌ Static |
| `ListingMediaStudio.tsx` | 117-188 | Upload progress | ✅ Reanimated |
| `AuctionCard.tsx` | 195-197 | Linear bar | ❌ Static |
| `CoOwnCompactPositionCard.tsx` | 124-126 | Linear bar | ❌ Static |
| `CoOwnMarketHighlightsCarousel.tsx` | 140-142 | Linear bar | ❌ Static |
| `SellerReputationCard.tsx` | 102-110 | Linear bar | ❌ Static |
| `DispatchCountdown.tsx` | 95-105 | Linear bar | ❌ Static |
| `InAppNotificationBanner.tsx` | 262-272 | Linear bar | ✅ Reanimated |
| `CreatorPublishSheet.tsx` | 587-596 | Upload progress | ✅ Reanimated |
| `CommerceMediaStage.tsx` | 544-545 | Video scrub bar | ❌ Static |
| `PosterViewerSkeleton.tsx` | 14-20 | Skeleton mock | ❌ Static |

### ActivityIndicator usage
- **108 files** with ActivityIndicator
- **244 total occurrences** — heavy reliance on raw spinner for loading states

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No generic ProgressBar component** — 18 inline implementations with inconsistent heights (1.5/2/3/4px), radii, and colors | Multiple files | High |
| 2 | **No generic CircularProgress component** — only RecordingRing exists for camera | `RecordingRing.tsx` only | High |
| 3 | **No generic StepIndicator component** — 3 inline step indicators (KYC, Auction, Wallet) with slight variations | 3 screens | High |
| 4 | **11 of 16 progress bars are static** (no animation) — only 31% animated | Multiple files | High |
| 5 | **Inconsistent bar heights** — 1.5px, 2px, 3px, 4px, Space.xs, Space.xs+2, Stroke.standard*2 | Multiple files | Medium |
| 6 | **No progress value labels** — most bars don't show percentage | All except CreatorPublishSheet | Medium |
| 7 | **No accessibility on most progress bars** — missing `accessibilityRole="progressbar"` and `accessibilityValue` | All except PosterProgressSegments, AuctionCountdown | High |
| 8 | **244 raw ActivityIndicator usages** — no styled indeterminate component | 108 files | Medium |
| 9 | **No indeterminate progress bar** — only spinner for unknown progress | Global | Medium |
| 10 | **Hardcoded magic numbers** — CreatorPublishSheet maps progress to 0.15-0.7 range | `CreatorPublishSheet.tsx:587-596` | Low |

---

## 4. Micro Improvements

### M1 — Create generic ProgressBar component
```tsx
// components/ui/ProgressBar.tsx
interface ProgressBarProps {
  progress: number; // 0-1
  height?: number;   // default 2px (thin), 4px (prominent)
  color?: string;    // default colors.brand
  trackColor?: string; // default colors.surfaceAlt
  animated?: boolean;   // default true
  showLabel?: boolean;  // percentage label
  indeterminate?: boolean;
}
```
Standardize on: 2px thin, 4px prominent, Radius.sm, Reanimated withTiming with deceleration curve.

### M2 — Create generic CircularProgress component
Extract from RecordingRing into a reusable component:
```tsx
interface CircularProgressProps {
  progress: number; // 0-1
  size?: number;    // default 48
  stroke?: number;  // default 4
  color?: string;
  trackColor?: string;
  animated?: boolean;
}
```

### M3 — Create generic StepIndicator component
Consolidate KYC, Auction, Wallet step indicators:
```tsx
interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
  failureStep?: number;
  failureLabel?: string;
}
```
With: animated step transitions, icons per step, timestamps, failure state.

### M4 — Add Reanimated to all static progress bars
Replace `width: \`${progress * 100}%\`` with `useAnimatedStyle` + `withTiming` for smooth fills.

### M5 — Add accessibility to all progress bars
Add `accessibilityRole="progressbar"` and `accessibilityValue={{ min: 0, now: progress, max: 1 }}` to every progress bar.

### M6 — Add progress value labels
Show percentage or fraction ("45%" or "9 of 20") on prominent progress bars (profile completeness, loyalty tier, upload progress).

### M7 — Create styled indeterminate component
Replace raw `ActivityIndicator` with a themed `LoadingIndicator` that uses brand colors and matches the design system. Keep `ActivityIndicator` as the underlying primitive but wrap it with consistent sizing and color.

---

## 5. Macro Improvements

### A1 — Progress component system
Create a unified progress component family:
- `ProgressBar` — linear determinate (thin/prominent variants)
- `CircularProgress` — circular determinate
- `StepIndicator` — multi-step with stages
- `LoadingIndicator` — indeterminate (styled ActivityIndicator wrapper)
- `UploadProgress` — multi-stage pipeline (upload → process → complete) with per-stage status

### A2 — Progress as state machine
Every async operation should map to a progress state: idle → indeterminate → determinate → complete (or error). The UI renders the appropriate component for each state. No operation should show a spinner when determinate progress is available.

---

## 6. Flagship Acceptance Criteria

- **Generic ProgressBar, CircularProgress, StepIndicator, LoadingIndicator** components
- **All progress bars animated** with Reanimated (no static width %)
- **Consistent heights** — 2px thin, 4px prominent (no 1.5/3px variants)
- **Accessibility** — `progressbar` role + `accessibilityValue` on all bars
- **Progress labels** on prominent bars (percentage or fraction)
- **No 90% hang** — real progress or indeterminate, never fake
- **Failure states** on step indicators (not just success)
- **Reduced motion** — progress still animates (informational), decorative shimmer disabled
- **Styled LoadingIndicator** replacing raw ActivityIndicator where appropriate

### Thumbnail test
At 25% scale, a progress bar must be visible as a thin colored line within a track — not invisible, not dominant. The fill proportion must be legible.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M1 — Generic ProgressBar | Low | All inline bars |
| P0 | M5 — Accessibility on all bars | Low | WCAG compliance |
| P1 | M3 — Generic StepIndicator | Medium | KYC, Auction, Wallet |
| P1 | M2 — Generic CircularProgress | Medium | Upload, goals |
| P1 | M4 — Animate static bars | Low | Visual consistency |
| P2 | M7 — Styled LoadingIndicator | Low | Spinner consistency |
| P2 | M6 — Progress value labels | Low | UX clarity |
| P3 | A1 — Full progress component system | High | All progress surfaces |
| P3 | A2 — Progress as state machine | High | Architectural |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `progress.bar.thin.height` | 2px | Ambient progress |
| `progress.bar.prominent.height` | 4px | Hero progress |
| `progress.bar.radius` | Radius.sm | Consistent |
| `progress.bar.fill.color` | colors.brand | Default |
| `progress.bar.track.color` | colors.surfaceAlt | Default |
| `progress.bar.animation` | withTiming 300ms, Easing.out(Easing.cubic) | Deceleration |
| `progress.ring.size` | 48pt (default), 24pt (compact) | |
| `progress.ring.stroke` | 4pt | |
| `progress.step.height` | 24pt | Icon + connector |
| `progress.step.connector` | 1pt hairline | Stroke.hairline |
| `progress.indicator.accessibilityRole` | `progressbar` | ARIA |
| `progress.indicator.accessibilityValue` | `{ min: 0, now, max: 1 }` | ARIA |

---

*Generated 2026-08-18. Sources: Numan RN Progress Bar Guide, VP0 Journal RAG Upload Progress, AuditBuffet Pattern Catalog, oblador/react-native-progress, production codebase audit.*
