# ThryftVerse Flagship Upgrade — Tooltips & Coach Marks

**Component deep-dive:** every tooltip, coach mark, spotlight, feature discovery overlay, and onboarding walkthrough in the ThryftVerse React Native app, audited and upgraded to 2026 flagship quality.

**Benchmark date:** 2026-08
**Sources:** AGENTS.md §4, §15 (reduced motion) · production codebase audit · 2026 web research.

---

## 1. 2026 Competitor Benchmark

### Instagram (2026)
Instagram uses feature discovery sparingly: when a new feature launches (e.g., Reels, Close Friends), a one-time coach mark appears highlighting the new feature with a short explanation and "Got it" button. The coach mark uses a spotlight (dimmed background with a cutout around the highlighted element). Instagram's lesson: **coach marks are for new features only — don't coach users on obvious functionality.**

### Snapchat (2026)
Snapchat uses tooltips on first-use of creator tools: a small popover appears near the tool with a one-line explanation ("Tap to add a filter"). The tooltip dismisses on tap or after 5 seconds. Snapchat's lesson: **tooltips are for non-obvious interactions — if the affordance is clear, don't add a tooltip.**

### eBay (2026)
eBay uses a one-time onboarding walkthrough for new sellers: a 3-step tour highlighting "List an item", "Set your price", "Choose shipping". Each step has a spotlight + explanation + "Next" button. The tour can be skipped and is shown only once (tracked in user preferences). eBay's lesson: **onboarding walkthroughs are for complex first-time flows — keep them short (3-5 steps) and skippable.**

### Cross-cutting 2026 consensus
- **Tooltips** — small popover near an element, one-line explanation, dismiss on tap or timeout.
- **Coach marks** — spotlight with cutout around highlighted element, for new feature discovery.
- **Walkthroughs** — multi-step tour for first-time onboarding, 3-5 steps, skippable.
- **Show once** — track in user preferences, never show twice.
- **Reduced motion** — no spotlight animation, instant appearance.
- **Accessibility** — tooltips with `accessibilityLabel`, coach marks with focus management.

---

## 2. Psychology & Principles

### Feature discovery and the curse of knowledge
The product team knows where every feature is. The user doesn't. A new feature (e.g., "Smart Sell") might be invisible to a user who has never looked in that corner of the screen. A coach mark bridges this gap — it says "hey, this exists." But the curse of knowledge works both ways: the product team might add a coach mark for something that's actually obvious. The 2026 standard: coach marks only for genuinely non-obvious features.

### The tooltip fatigue problem
If every element has a tooltip, the user stops reading them. Tooltips are effective when they're rare — the user notices "oh, this is explaining something I don't know." If tooltips are everywhere, they become noise. The 2026 standard: tooltips only on non-obvious interactions (e.g., "Long-press to select multiple").

### Show once, respect the user
A coach mark that appears every time the user opens the screen is annoying. A coach mark that appears once and then never again respects the user's time. The 2026 standard: track "has seen coach mark X" in user preferences, show only once, and provide a way to re-enable in settings ("Show feature tours").

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Tooltip/coach mark usage

| Metric | Count | Notes |
|--------|-------|-------|
| Files with `Tooltip`, `CoachMark`, `Spotlight`, `FeatureDiscovery`, `Walkthrough` | ~35 matches | Mostly in comments/docs, not actual components |
| Shared Tooltip component | **None** | No `components/ui/Tooltip.tsx` |
| Shared CoachMark component | **None** | No `components/ui/CoachMark.tsx` |
| Onboarding walkthrough | **None** | No multi-step tour |
| Feature discovery system | **None** | No "show once" tracking |

### Defects

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| 1 | **No Tooltip component** — no small info popovers on tap/long-press | Global | Medium |
| 2 | **No CoachMark component** — no spotlight overlays for new features | Global | Medium |
| 3 | **No onboarding walkthrough** — no multi-step tour for first-time users | Global | Medium |
| 4 | **No feature discovery system** — no "show once" tracking | Global | Medium |
| 5 | **No first-time user education** — new users have no guidance | Global | Medium |
| 6 | **35 matches are mostly in comments/docs** — not actual components | Multiple files | Low |
| 7 | **Creator tools have no tooltips** — complex tools with no explanation | Creator surfaces | Medium |
| 8 | **No "What's New" overlay** for feature launches | Global | Low |

---

## 4. Micro Improvements

### M1 — Create shared Tooltip component
```tsx
interface TooltipProps {
  text: string;
  anchorRef: React.RefObject<View>;
  visible: boolean;
  onDismiss: () => void;
  placement?: 'top' | 'bottom' | 'auto';
  dismissAfterMs?: number;  // auto-dismiss timeout
}
```
Small popover near the anchor, one-line text, dismiss on tap or timeout. Dark surface, white text, arrow pointing to anchor.

### M2 — Create shared CoachMark component
```tsx
interface CoachMarkProps {
  visible: boolean;
  anchorRef: React.RefObject<View>;
  title: string;
  description: string;
  onDismiss: () => void;
  onAction?: () => void;
  actionLabel?: string;
}
```
Spotlight overlay: dimmed background with a cutout around the anchor element. Title + description + "Got it" (or action) button.

### M3 — Create onboarding walkthrough
```tsx
interface WalkthroughStep {
  anchorRef: React.RefObject<View>;
  title: string;
  description: string;
}
interface WalkthroughProps {
  steps: WalkthroughStep[];
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}
```
Multi-step tour: shows CoachMark for each step, "Next" to advance, "Skip" to dismiss all. Tracks completion in user preferences.

### M4 — Add "show once" tracking
Store `hasSeenCoachMark: Record<string, boolean>` in user preferences (Zustand store + AsyncStorage). Show each coach mark only once. Add "Show feature tours" toggle in settings.

### M5 — Add tooltips to creator tools
Add tooltips on first use of complex creator tools (drawing, filters, timeline, captions). "Long-press to access brush settings", "Pinch to resize", etc. Show once, dismiss on tap.

### M6 — Add "What's New" overlay for feature launches
When a new feature is launched, show a one-time coach mark highlighting the feature. Track in user preferences with a feature version key (`hasSeenSmartSellCoachMark_v1`).

---

## 5. Macro Improvements

### A1 — Feature discovery system
Create a unified system:
- `Tooltip` — small info popover, dismiss on tap/timeout
- `CoachMark` — spotlight overlay for new features
- `Walkthrough` — multi-step onboarding tour
- `useFeatureDiscovery` — hook for "show once" tracking
- `WhatsNewOverlay` — one-time overlay for feature launches

### A2 — Education as a product surface
First-time user education is not an afterthought — it's a product surface. The architecture:
- **First launch:** 3-step walkthrough (Discover → Buy → Sell)
- **New features:** Coach mark on first visit to the feature
- **Complex tools:** Tooltips on first use (creator tools, trading)
- **Re-enable:** "Show feature tours" in settings
- **Analytics:** Track coach mark impressions, dismissals, and action rates

---

## 6. Flagship Acceptance Criteria

- **Tooltip component** — small popover, dismiss on tap/timeout
- **CoachMark component** — spotlight with cutout, for new features
- **Walkthrough** — 3-5 step onboarding tour, skippable
- **Show once tracking** — never show the same coach mark twice
- **"Show feature tours" toggle** in settings
- **Tooltips on creator tools** — first-use guidance for complex tools
- **"What's New" overlay** for feature launches
- **Reduced motion** — no spotlight animation, instant appearance
- **Accessibility** — focus management, `accessibilityLabel` on coach marks

### Thumbnail test
At 25% scale, a coach mark must show: the dimmed background, the spotlight cutout (brighter area around the anchor), and the title text. The spotlight must clearly identify the highlighted element.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P1 | M1 — Tooltip component | Medium | All tooltips |
| P1 | M2 — CoachMark component | Medium | Feature discovery |
| P1 | M4 — Show once tracking | Low | All education |
| P2 | M3 — Onboarding walkthrough | Medium | First-time UX |
| P2 | M5 — Creator tool tooltips | Medium | Creator UX |
| P2 | M6 — "What's New" overlay | Low | Feature launches |
| P3 | A1 — Full feature discovery system | High | All education surfaces |
| P3 | A2 — Education as product surface | High | Onboarding |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `tooltip.background` | colors.surfaceInverse | Dark |
| `tooltip.text` | colors.textInverse | White |
| `tooltip.radius` | Radius.sm | |
| `tooltip.padding` | Space.sm + Space.xs | Horizontal + vertical |
| `tooltip.font` | Type.caption | 12pt |
| `tooltip.arrow.size` | 6pt | |
| `tooltip.dismissTimeout` | 5000ms | Auto-dismiss |
| `coachMark.dimColor` | rgba(0,0,0,0.6) | Spotlight dim |
| `coachMark.cutoutPadding` | Space.sm | Around anchor |
| `coachMark.card.background` | colors.surface | |
| `coachMark.card.radius` | Radius.lg | |
| `coachMark.title.font` | Type.headline | |
| `coachMark.description.font` | Type.body | |
| `coachMark.button` | "Got it" / action label | Primary |
| `walkthrough.maxSteps` | 5 | Keep short |
| `walkthrough.skipLabel` | "Skip" | Always available |
| `featureDiscovery.storage` | AsyncStorage via Zustand | Show once |
| `featureDiscovery.reducedMotion` | Instant (no spotlight animation) | |

---

*Generated 2026-08-18. Sources: production codebase audit, Instagram feature discovery patterns, Snapchat creator tool tooltips, eBay seller onboarding walkthrough.*
