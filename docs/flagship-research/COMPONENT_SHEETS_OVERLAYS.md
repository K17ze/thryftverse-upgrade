# ThryftVerse Flagship Upgrade — Sheets, Modals, Overlays & Docks

> **Scope:** Bottom sheets, modals, overlays, docks and every sheet/overlay/dock variant in the ThryftVerse React Native app. This document defines how to upgrade each one to 2026 flagship quality.
>
> **Source of truth:** `AGENTS.md` §4 (surface/radius budget), §7 (canonical implementation), §13 (control quality), §17 (motion), §27 (2026 flagship UX psychology); `Design.md` elevation scale, "Elevation & Depth", "Avoid" list for glass/blur, sticky action dock micro spec, `glass-bg` / `glass-border` tokens.
>
> **Benchmark date:** August 2026. Web sources cited inline.

---

## 1. 2026 Competitor Benchmark — Sheet & Overlay Design

The bottom sheet has become the dominant overlay pattern in mobile apps. According to Mobbin's 2026 mobile pattern report, bottom sheets are now used by **71% of the top 100 mobile apps** for primary navigation and contextual actions, up from 28% in 2022 ([Pravin Kumar, 2026](https://www.pravinkumar.co/blog/webflow-mobile-menu-bottom-sheet-design-2026)). The reasons are ergonomic (6.3-inch average screens make the top unreachable one-handed) and cognitive (bottom sheets preserve context — the user stays oriented to where they were before the sheet opened) ([NN/G — Bottom Sheets: Definition and UX Guidelines](https://www.nngroup.com/articles/bottom-sheet/)).

### Instagram (2026)

Instagram uses bottom sheets as its primary contextual layer — comment overlays, share menus, option menus, and the Reels action tray all rise from the bottom edge. The sheet hierarchy is consistent: a peek detent shows identity + primary action, a half detent reveals the action list, and a full detent enables scrolling. Gesture-dismiss is universal — swipe down anywhere on the sheet collapses it. The backdrop is a plain dim, not glass; glass is reserved for the floating story control bar. Instagram's lesson for ThryftVerse: **one sheet grammar across the whole app**, not bespoke sheets per feature.

### Pinterest (2026)

Pinterest's closeup sheet (the pin detail that rises over the masonry board) is the canonical "context preserved" sheet. The board behind stays partially visible at the half detent so the user never loses their discovery position. The sheet uses a lighter backdrop at partial detents and a full dim only at the large detent. Dragging the handle changes detents; dragging the inner list scrolls only after the sheet is fully expanded ([UX Patterns Guide — Bottom sheet](https://uxpatternsguide.com/patterns/bottom-sheet/)). This detent-coupled scroll handoff is a 2026 flagship expectation.

### eBay / Vinted / Depop (2026)

Marketplace apps use transaction sheets heavily — offer, buy-now, add-to-cart, filter. Vinted and Depop pin the confirmation CTA to the sheet footer with a hairline separator, keep the item context header (image + title + seller) pinned at the top, and use a single dominant action with a quiet secondary "Cancel" link. The sheet material is opaque `surfaceElevated`, not glass — glass would compete with the product photography behind. eBay's filter sheet uses a peek/half/full detent trio with a sticky "Apply" footer that stays pinned across all detents.

### Snapchat (2026)

Snapchat uses full-screen immersive overlays for the camera and Stories composer, with floating glass controls over media. This is the one place glass is appropriate — over full-bleed media where opaque chrome would destroy the media story. Snapchat's sheets (settings, profile, friend menus) are opaque; only the media control layer uses translucency.

### iOS 26 Liquid Glass sheets

iOS 26 introduced a new sheet behaviour: at the lowest detent the sheet floats with a visible gap and fully rounded corners; as it drags up the gap tightens and the corner radius adjusts; at full height it snaps flush to the top edge ([Expo — Apple Maps style Liquid Glass sheets](https://expo.dev/blog/how-to-create-apple-maps-style-liquid-glass-sheets); [Swift Crafted — presentationDetents iOS 26](https://swiftcrafted.dev/article/swiftui-presentationdetents-ios-26-bottom-sheets)). The system applies glass automatically to sheet containers compiled with Xcode 26 ([DeepWiki — Sheet Presentations](https://deepwiki.com/conorluddy/LiquidGlassReference/5.3-sheet-presentations)). Critically, Apple scopes glass to **controls, navigation bars, and compact panels** — never wrapping the entire app ([AGENTS.md §27.5](../../AGENTS.md)). iOS 27 refines this with a transparency slider and darkened edges for readability ([MacRumors — Liquid Glass in iOS 27](https://www.macrumors.com/2026/06/10/how-liquid-glass-is-changing-in-ios-27/)).

### Android 16 Material 3 Expressive

Android's `BottomSheetScaffold` and `ModalBottomSheet` support `STATE_COLLAPSED`, `STATE_HALF_EXPANDED`, `STATE_EXPANDED`, and `STATE_HIDDEN` with springy physics and variable corner radius ([Android Developers — BottomSheetScaffold](https://developer.android.com/reference/kotlin/androidx/compose/material3/BottomSheetScaffold.composable); [Android Developers — SheetState](https://developer.android.com/reference/kotlin/androidx/compose/material3/SheetState)). M3 Expressive adds emotion-first, physics-driven motion and bold shape choices grounded in 46 research studies ([Android Developers — Material Design 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)).

### Benchmark synthesis for ThryftVerse

| Dimension | 2026 flagship standard | ThryftVerse target |
|-----------|------------------------|--------------------|
| Detents | Peek / half / full with snap physics | Add detent language to the sheet engine |
| Gesture dismiss | Swipe-down everywhere, velocity threshold | Present but single-snap only — needs multi-detent |
| Backdrop | Plain dim by default; glass only for media/immersive | Correct in engine, but callers bypass via `blurIntensity` |
| Glass scope | Controls, sticky bars, media overlays — never whole app | `glass-bg` token exists but underused in sheets |
| Sheet hierarchy | One grammar app-wide | 8 screens call `BottomSheet` directly; barrel unused |
| Footer CTA | Pinned, hairline separator, single dominant action | `TransactionSheet` has it; domain sheets reinvent it |

---

## 2. Psychology & Principles

### The "temporary layer" mental model

A sheet/overlay is a **temporary layer** — it exists to let the user do one focused thing without losing their place. The user's mental model is: "I'm still on the product/auction/profile, I'm just reaching for a tool." If the sheet feels like a new page (full takeover, no context visible, no gesture escape), the mental model breaks and the user feels disoriented. NN/G's research confirms: "the advantage of a bottom sheet is that, unlike a separate page, it preserves some of the user's current context" ([NN/G](https://www.nngroup.com/articles/bottom-sheet/)).

**Design implication:** every sheet must leave at least a sliver of the parent surface visible at its resting detent. The `inspector` variant already does this (`backdropMaxOpacity: 0.72`, `BottomSheet.tsx:78`); the `transaction` and `form` variants fully dim — which is correct for irreversible actions but should be a deliberate choice, not the default.

### Progressive disclosure via sheets

Sheets are the primary progressive-disclosure mechanism on mobile. Instead of navigating to a new screen (which forces spatial reorientation and working-memory load), a sheet reveals "just enough" — a peek detent for identity, a half detent for the action set, a full detent for the complete form ([Mobile App Wiki — Bottom Sheets and Modals](https://mobileapp.wiki/en/uiux/bottom-sheet-modal-guide)). This maps directly to ThryftVerse's bid/buy-now flows: the entry stage is a peek, the review stage is a half, and error recovery is a full detent.

### "Context preserved" feeling

The user must feel that closing the sheet returns them to exactly where they were. This requires three things:
1. **Geometric stability** — the parent surface does not re-layout while the sheet is open.
2. **Gesture-dismiss symmetry** — the same gesture that opened the sheet (swipe up / tap) closes it (swipe down / tap backdrop).
3. **No data loss on dismiss** — form input is preserved if the user re-opens the sheet (currently `BidSheet` resets on open, `BidSheet.tsx:137-152`, which is correct for a fresh bid session but would be wrong for an edit form).

### Gesture-dismiss as cognitive ease

Swipe-to-dismiss is not just ergonomic — it is cognitive ease. The user does not have to hunt for an X button or a Cancel link; the same downward motion that dismisses every sheet in every app works here. This is "muscle memory transfer" — Instagram, YouTube, Spotify and Threads all use bottom sheets, so users have trained their thumbs ([Pravin Kumar, 2026](https://www.pravinkumar.co/blog/webflow-mobile-menu-bottom-sheet-design-2026)). A sheet that lacks gesture-dismiss feels broken even if an X button exists.

**Design implication:** the `BottomSheet` engine already has pan-to-dismiss (`BottomSheet.tsx:194-215`) with a 35% threshold and velocity > 600. This is good. But it only has two states — open and closed. Flagship 2026 requires at least three detents so the user can peek, half, and full without accidental dismissal.

### Hierarchy of modal elevation

Not all overlays are equal. The elevation hierarchy from `Design.md` is:

- `Elevation.subtle` — cards, small elements.
- `Elevation.card` — elevated cards, buttons.
- `Elevation.floating` — FABs, overlays, **sticky docks**.
- `Elevation.modal` — **bottom sheets, dialogs** (16px offset, 0.18 opacity, 24px radius).

The current `BottomSheet` engine uses `Elevation.floating` for every variant except `immersive` (`BottomSheet.tsx:63-94`). This is a defect — sheets should cast `Elevation.modal` to separate them from floating docks and FABs. A sheet and a sticky dock at the same elevation read as the same layer, which collapses the depth hierarchy.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 The sheets barrel is dead code — 0 screens use it

`frontend/src/components/sheets/index.ts` exports `ActionSheet`, `FormSheet`, `InspectorSheet`, `TransactionSheet`, and re-exports `BottomSheet`. A grep for any import from `components/sheets` across `frontend/src` returns **zero matches**. No screen imports the barrel. The four semantic wrappers exist but are never consumed.

### 3.2 8 screens call `BottomSheet` directly

Eight production screens import `BottomSheet` from `../components/BottomSheet` and call it raw, bypassing the variant system:

1. `screens/AuctionDetailScreen.tsx:47`
2. `screens/AssetDetailScreen.tsx:59`
3. `screens/ItemDetailScreen.tsx:51`
4. `screens/BulkListingScreen.tsx:30`
5. `screens/NotificationsScreen.tsx:23`
6. `screens/AuctionsScreen.tsx:21`
7. `screens/CheckoutScreen.tsx:48`
8. `screens/AuctionHomeScreen.tsx:49`

None of these pass a `variant` prop, so they all default to `'system'` (`BottomSheet.tsx:127`). This means every screen-level sheet — filters, sort menus, notifications preferences, checkout payment selectors — uses the same material grammar regardless of whether it is an action menu, a form, or a transaction confirmation. The variant system was built to solve exactly this and is bypassed.

### 3.3 Domain sheets live in the `ui` folder, not the `sheets` folder

`BidSheet.tsx` and `BuyNowSheet.tsx` are in `components/ui/`, not `components/sheets/`. They are the two most complex sheets in the app (multi-stage transaction flows with entry/review/submitting/success/error/recoverable-conflict stages) yet they do not use the `TransactionSheet` wrapper or any variant. They call `BottomSheet` directly with `blurIntensity={30}` (`BidSheet.tsx:349`, `BuyNowSheet.tsx:265`).

### 3.4 `blurIntensity` is a no-op dead parameter for non-glass variants

The `BottomSheet` engine comment at `BottomSheet.tsx:110-114` states: "Blur intensity passed to LiquidGlassBackdrop when the active variant uses the glass material (immersive). Kept for backward compatibility — no longer triggers blur on non-glass variants." Yet `BidSheet`, `BuyNowSheet`, and `ShareSheet` (`ShareSheet.tsx:97`) all pass `blurIntensity={30}`. Because none of them pass `variant="immersive"`, the `useGlassBackdrop` flag is `false` (`BottomSheet.tsx:65-87`) and the blur value is silently ignored. This is a **dead parameter** — callers believe they are getting a glass backdrop and are not. The visual result is a plain `colors.overlay` dim, which is actually correct per the design system, but the code is misleading and will confuse future maintainers.

### 3.5 Hardcoded `borderRadius` in `TransactionSheet`

`TransactionSheet.tsx:108` and `:125` hardcode `borderRadius: 8` for the primary and secondary buttons. This bypasses the `Radius` token system (`Radius.md = 8`). While the value happens to match, hardcoding it means a future radius-token migration will miss these buttons. The sheet's own top radius is correctly sourced from the `transaction` variant config (`BottomSheet.tsx:83`, `Radius.xl = 16`), but the inner button radii are not tokenised.

### 3.6 Inconsistent radius sources across variants

| Variant | Top radius source | Value |
|---------|-------------------|-------|
| `system` | `VARIANT_CONFIGS` → `Radius.xl` | 16 |
| `form` | `VARIANT_CONFIGS` → `Radius.xl` | 16 |
| `inspector` | `VARIANT_CONFIGS` hardcoded | 20 |
| `transaction` | `VARIANT_CONFIGS` → `Radius.xl` | 16 |
| `immersive` | `VARIANT_CONFIGS` hardcoded | 20 |
| `ActionSheet` wrapper | `topRadius={12}` prop override | 12 |

`ActionSheet.tsx:32` passes `topRadius={12}`, overriding the `system` variant's 16px. The `inspector` and `immersive` variants hardcode 20 in the config map instead of using a token. There is no `Radius.xxl` (24px) usage for sheets even though `Design.md` defines it for "navigation docks and genuinely dominant panels only." The radius budget per `AGENTS.md` §4 allows sheets to introduce one additional radius — but the current code introduces two (12 and 20) beyond the standard 16 without a clear role contract.

### 3.7 Missing detent variants — single snap point only

The `BottomSheet` engine accepts a single `snapPoint` (fraction of screen height, default 0.55) and animates between fully closed and that one point (`BottomSheet.tsx:147`, `:152-160`). There is no multi-detent support. The pan gesture (`BottomSheet.tsx:194-215`) only decides open-vs-close — it cannot snap to an intermediate height. This is the single biggest gap versus 2026 flagship sheets, which universally support peek/half/full detents ([Mobile App Wiki](https://mobileapp.wiki/en/uiux/bottom-sheet-modal-guide); [UX Patterns Guide](https://uxpatternsguide.com/patterns/bottom-sheet/)).

### 3.8 Elevation token mismatch — sheets use `floating`, not `modal`

Every non-`immersive` variant uses `Elevation.floating` (`BottomSheet.tsx:63, 69, 77, 84`). `Design.md` explicitly assigns `Elevation.modal` (16px offset, 0.18 opacity, 24px radius) to "bottom sheets, dialogs." The engine under-shadows sheets, making them read at the same depth as sticky docks and FABs.

### 3.9 `glass-bg` / `glass-border` tokens unused by sheets

The `glass-bg` and `glass-border` tokens exist in `ThemeContext.tsx:55, 92, 129` and `Design.md` front matter. They are consumed only by poster/editor components (`TextEditSheet.tsx`, `DrawingCanvas.tsx`, `BackgroundPicker.tsx`, `FontColorPicker.tsx`, `SizePickerPanel.tsx`, `BrushPicker.tsx`) and the sticky action dock micro spec (`Design.md:861`). No bottom sheet uses them. The `LiquidGlassBackdrop` is used only by the `immersive` variant. The `Design.md` "Avoid" list states: "glass is reserved for sticky bars, bottom sheets, and media overlays only" — but the sheets themselves do not participate in the glass system.

### 3.10 Domain sheets duplicate `TransactionSheet`'s footer pattern

`TransactionSheet.tsx:61-90` implements a pinned footer with primary + secondary buttons and a hairline separator. `BidSheet.tsx:464-483` and `BuyNowSheet.tsx:323-342` each reinvent this pattern with `AppButton` + a `dismissLink` Pressable. The three implementations have different button heights (52pt in `TransactionSheet`, `AppButton` "md" in the domain sheets), different cancel treatments (footer button vs. quiet link), and different separators. There is no shared transaction-footer primitive.

---

## 4. Micro Improvements

1. **Tokenise `TransactionSheet` button radii.** Replace `borderRadius: 8` at `TransactionSheet.tsx:108, 125` with `Radius.md`. One-line fix, prevents future drift.

2. **Remove dead `blurIntensity` props.** Delete `blurIntensity={30}` from `BidSheet.tsx:349`, `BuyNowSheet.tsx:265`, and `ShareSheet.tsx:97`. These are no-ops on non-glass variants and mislead maintainers. If a glass backdrop is genuinely wanted for these transaction sheets, switch the variant to `immersive` — but per the design system, transaction sheets should be opaque, so the prop should simply be removed.

3. **Fix sheet elevation.** Change `VARIANT_CONFIGS` for `system`, `form`, `inspector`, and `transaction` to use `Elevation.modal` instead of `Elevation.floating` (`BottomSheet.tsx:63, 69, 77, 84`). This separates sheets from docks/FABs in the depth hierarchy per `Design.md`.

4. **Tokenise `inspector` and `immersive` top radii.** Replace the hardcoded `20` at `BottomSheet.tsx:76, 90` with a `Radius` token. Either add `Radius.xxl` (24) usage or introduce a `Radius.sheet` semantic token. Document the choice in the variant contract.

5. **Add `accessibilityRole="sheet"` and live-region announcements.** The engine sets `accessibilityViewIsModal` (`BottomSheet.tsx:235`) but does not announce the sheet's title/purpose on open. Add an `AccessibilityInfo.announceForAccessibility` call when the sheet opens, sourced from an optional `title` prop.

6. **Respect `AccessibilityInfo.isReduceTransparencyEnabled()`.** Per `AGENTS.md` §27.5, glass must check this flag before rendering. The `LiquidGlassBackdrop` path (`BottomSheet.tsx:238-244`) should fall back to an opaque `surfaceElevated` background when transparency is reduced.

7. **Unify the drag handle.** The handle is 40×5 with `Radius.sm` (`BottomSheet.tsx:322-327`). This is fine, but it should use `colors.border` not `colors.textMuted + '80'` — the handle is a separator affordance, not text.

---

## 5. Macro Improvements — One-Sheet-System Architecture

### 5.1 One sheet system, not a barrel plus bypasses

The core architectural fix: **make the `components/sheets` barrel the only sanctioned entry point for sheets.** The `BottomSheet` engine remains the low-level primitive, but screens and domain components must import a semantic wrapper (`ActionSheet`, `FormSheet`, `InspectorSheet`, `TransactionSheet`) or a domain sheet (`BidSheet`, `BuyNowSheet`) — never `BottomSheet` directly.

Migration plan:
- Move `BidSheet.tsx` and `BuyNowSheet.tsx` from `components/ui/` to `components/sheets/`.
- Rebuild them on top of `TransactionSheet` (which provides the pinned footer, consequence hierarchy, and variant material) instead of calling `BottomSheet` raw.
- Audit the 8 screens that import `BottomSheet` directly and migrate each to the appropriate wrapper:
  - Filter/sort menus → `ActionSheet`
  - Notification preferences, settings panels → `FormSheet`
  - Checkout payment selector, address forms → `FormSheet` or `TransactionSheet` depending on whether a confirmation CTA is pinned.
  - Auction/asset/item detail contextual sheets → `InspectorSheet`
- Add an ESLint rule or code-review gate that flags direct `BottomSheet` imports outside `components/sheets/`.

### 5.2 Sheet variant contract

Formalise the five variants as a contract, not just a config map:

| Variant | Role | Material | Backdrop | Radius | Elevation | Glass? |
|---------|------|----------|----------|--------|-----------|--------|
| `system` (ActionSheet) | Quick choices, menus, pickers | Opaque `surface` | Full dim | `Radius.xl` (16) | `Elevation.modal` | No |
| `form` (FormSheet) | Editors, settings, keyboard forms | Opaque `surface` | Full dim | `Radius.xl` (16) | `Elevation.modal` | No |
| `inspector` (InspectorSheet) | Object/detail inspectors | Opaque `surface` | Light dim (0.72) | `Radius.xxl` (24) | `Elevation.modal` | No |
| `transaction` (TransactionSheet) | Payment/confirm/bid/buy | Opaque `surface` | Full dim | `Radius.xl` (16) | `Elevation.modal` | No |
| `immersive` (MediaStage fullscreen) | Full-bleed media, stories | Glass `glass-bg` + `glass-border` | Glass backdrop | `Radius.xxl` (24) | `Elevation.modal` | Yes |

This contract enforces the `Design.md` rule: "glass is reserved for sticky bars, bottom sheets, and media overlays only." Only `immersive` uses glass; all other variants are opaque. The `inspector` gets the larger radius (24) because it is a genuinely dominant panel that preserves context — matching the `Design.md` radius budget: "20pt+ only for a genuinely dominant panel or dock."

### 5.3 Detent language

Add multi-detent support to the `BottomSheet` engine. Replace the single `snapPoint: number` with `detents?: number[]` (fractions of screen height), defaulting to `[0.4, 0.6, 0.9]` (peek / half / full). The pan gesture should snap to the nearest detent on release, not just open-or-close. This matches iOS 26 `presentationDetents` ([Swift Crafted](https://swiftcrafted.dev/article/swiftui-presentationdetents-ios-26-bottom-sheets)) and Android `BottomSheetBehavior` ([Mobile App Wiki](https://mobileapp.wiki/en/uiux/bottom-sheet-modal-guide)).

Variant-level detent defaults:

| Variant | Default detents | Rationale |
|---------|-----------------|-----------|
| `system` | `[0.4]` | Single peek — quick choice, dismiss fast |
| `form` | `[0.6, 0.9]` | Half for form, full when keyboard opens |
| `inspector` | `[0.4, 0.7, 0.95]` | Peek identity, half details, full scroll |
| `transaction` | `[0.6, 0.9]` | Half for review, full for error recovery |
| `immersive` | `[0.5, 1.0]` | Half media, full immersive |

The inner-scroll handoff is critical: dragging the sheet handle changes detents; dragging the inner `KeyboardAwareScrollView` scrolls content **only after the sheet reaches its largest detent** ([UX Patterns Guide](https://uxpatternsguide.com/patterns/bottom-sheet/)). This prevents the scroll-vs-drag conflict that makes non-detent sheets feel janky.

### 5.4 Glass / backdrop contract

- **Opaque variants** (`system`, `form`, `inspector`, `transaction`): backdrop is `colors.overlay` (rgba(0,0,0,0.4) light / 0.6 dark). No blur. Sheet background is `colors.surface` with a hairline `colors.borderSubtle` top border.
- **Immersive variant**: backdrop uses `LiquidGlassBackdrop` with `blurIntensity` sourced from a token (default 25). Sheet background is `colors.glassBg` with `colors.glassBorder` top border. Check `AccessibilityInfo.isReduceTransparencyEnabled()` and fall back to opaque `colors.surfaceElevated` when reduced.
- **Sticky docks** (not sheets): use `colors.glassBg` + `colors.glassBorder` per the sticky action dock micro spec (`Design.md:861`). Docks are persistent, sheets are temporary — the glass treatment is the same but the elevation and dismissal differ.

### 5.5 Gesture-dismiss consistency

Every sheet must dismiss via:
1. Swipe down on the sheet body (pan gesture, velocity > 600 or travel > 35% of height).
2. Tap the backdrop.
3. Android hardware Back (`BackHandler`, already wired at `BottomSheet.tsx:185-192`).
4. An explicit Close control (X button or Cancel link in the footer/title bar).

Transaction sheets (`BidSheet`, `BuyNowSheet`, `TransactionSheet`) must **block gesture-dismiss during submission** — `BidSheet.tsx:322-325` and `BuyNowSheet.tsx:233-236` already do this via `handleDismiss` guards. This pattern must be preserved in the unified system: a `dismissable` prop (default `true`) that transaction sheets set to `false` during `submitting` stage.

---

## 6. Flagship Acceptance Criteria

A sheet/overlay/dock passes flagship review when:

1. **Radius budget.** The sheet introduces at most one additional radius beyond the viewport's two non-avatar radii. Per `AGENTS.md` §4: "Use no more than two non-avatar radius sizes in one viewport unless a modal is present." Sheets may introduce one additional radius — `inspector`/`immersive` use 24px, all others use 16px. No sheet uses 12px (the `ActionSheet` override at `ActionSheet.tsx:32` must be removed — 12px is a compact utility radius, not a sheet radius).

2. **Glass reserved.** Glass (`glass-bg`, `glass-border`, `LiquidGlassBackdrop`) appears only on: (a) the `immersive` sheet variant, (b) sticky action docks, (c) media overlay controls (MediaStage floating header). No `system`/`form`/`inspector`/`transaction` sheet uses glass. Verified by grep: no `glassBg` reference outside `components/sheets/`, `components/poster/`, dock components, and `ThemeContext`.

3. **Gesture-dismiss.** Every sheet dismisses via swipe-down + backdrop-tap + Back + explicit close. Transaction sheets block dismiss during submission.

4. **State coverage.** Every sheet renders: loading (skeleton or spinner), populated, error (inline + recovery action), submitting (disabled CTA + spinner), success (confirmation + done), and where relevant: empty, offline/ambiguous, recoverable-conflict. `BidSheet` and `BuyNowSheet` already cover entry/review/submitting/success/error/recoverable-conflict — this is the gold standard. `TransactionSheet` must enforce the same coverage via its children contract.

5. **Elevation correctness.** Sheets cast `Elevation.modal`. Docks cast `Elevation.floating`. FABs cast `Elevation.floating`. The depth hierarchy is legible at thumbnail scale.

6. **Detent behaviour.** Multi-detent sheets snap to the nearest detent on release. Inner scroll activates only at the largest detent. Reduced-motion collapses detent animation to instant.

7. **Accessibility.** `accessibilityViewIsModal` is set. The sheet title is announced on open. Focus is trapped inside the sheet. Focus returns to the trigger on close. Reduced-transparency falls back to opaque. The drag handle is `accessibilityRole="separator"` and keyboard-focusable for snap navigation ([Loke Design System — Drawer](https://design.loke.global/docs/design-system/overlay-navigation/drawer)).

8. **Thumbnail test.** At 25% scale, the sheet's primary content (item context + amount + CTA for transaction sheets; action list for action sheets; form fields for form sheets) is the dominant object. The drag handle, backdrop, and chrome recede.

---

## 7. Priority & Sequencing

| Phase | Work | Files | Impact |
|-------|------|-------|--------|
| **P0 — Engine fix** | Tokenise radii, fix elevation (`floating` → `modal`), remove dead `blurIntensity` from callers, add reduced-transparency fallback | `BottomSheet.tsx`, `BidSheet.tsx`, `BuyNowSheet.tsx`, `ShareSheet.tsx`, `TransactionSheet.tsx` | Depth hierarchy correct, no misleading code |
| **P1 — Detents** | Add `detents?: number[]` to engine, multi-snap pan gesture, inner-scroll handoff, variant detent defaults | `BottomSheet.tsx` | Flagship 2026 sheet behaviour |
| **P2 — Domain sheet migration** | Move `BidSheet`/`BuyNowSheet` to `components/sheets/`, rebuild on `TransactionSheet`, extract shared transaction-footer primitive | `BidSheet.tsx`, `BuyNowSheet.tsx`, `TransactionSheet.tsx`, `sheets/index.ts` | One-sheet-system for commerce |
| **P3 — Screen migration** | Migrate 8 direct-`BottomSheet` screens to semantic wrappers | `AuctionDetailScreen`, `AssetDetailScreen`, `ItemDetailScreen`, `BulkListingScreen`, `NotificationsScreen`, `AuctionsScreen`, `CheckoutScreen`, `AuctionHomeScreen` | Barrel becomes the single entry point |
| **P4 — Glass contract** | Wire `glass-bg`/`glass-border` into `immersive` variant and sticky docks, add reduced-transparency guard | `BottomSheet.tsx`, `LiquidGlassBackdrop.tsx`, dock components | Glass scoped per design system |
| **P5 — Accessibility** | Focus trap, focus return, title announcement, keyboard handle navigation | `BottomSheet.tsx`, all wrappers | WCAG 2.2 / platform parity |

P0 and P1 are engine-level and unblock everything else. P2 is the highest product-visibility change (bid/buy-now are the core commerce moments). P3 is the largest mechanical migration. P4–P5 are polish that elevates to flagship.

---

## 8. Token-Level Spec Table

### ActionSheet (`components/sheets/ActionSheet.tsx`)

| Token | Value | Source | Current defect |
|-------|-------|--------|----------------|
| Variant | `system` | `BottomSheet.tsx:62` | Correct |
| Top radius | `Radius.xl` (16) | `VARIANT_CONFIGS.system` | **Override at `ActionSheet.tsx:32` sets 12 — remove** |
| Elevation | `Elevation.modal` | target | **Currently `Elevation.floating` — fix** |
| Backdrop | `colors.overlay` (0.4/0.6) | `BottomSheet.tsx:293` | Correct |
| Sheet bg | `colors.surface` | `BottomSheet.tsx:300` | Correct |
| Top border | hairline `colors.borderSubtle` | `BottomSheet.tsx:314` | Correct |
| Drag handle | 40×5, `Radius.sm`, `colors.border` | `BottomSheet.tsx:322` | **Currently `textMuted + '80'` — change to `border`** |
| Detents | `[0.4]` single peek | target | **Currently single `snapPoint=0.4` — add detents array** |
| Glass | No | contract | Correct |
| Default snap | 0.4 | `ActionSheet.tsx:24` | Correct |

### FormSheet (`components/sheets/FormSheet.tsx`)

| Token | Value | Source | Current defect |
|-------|-------|--------|----------------|
| Variant | `form` | `BottomSheet.tsx:68` | Correct |
| Top radius | `Radius.xl` (16) | `VARIANT_CONFIGS.form` | Correct |
| Elevation | `Elevation.modal` | target | **Currently `floating` — fix** |
| Backdrop | `colors.overlay` full dim | `BottomSheet.tsx:71` | Correct |
| Title bar | 44pt min, `Type.subtitle` | `FormSheet.tsx:107-143` | Correct |
| Left/right action | 44pt hit, `Type.body` | `FormSheet.tsx:118-122` | Correct |
| Detents | `[0.6, 0.9]` | target | **Currently single `0.6` — add full detent for keyboard** |
| Glass | No | contract | Correct |
| Default snap | 0.6 | `FormSheet.tsx:44` | Correct |

### InspectorSheet (`components/sheets/InspectorSheet.tsx`)

| Token | Value | Source | Current defect |
|-------|-------|--------|----------------|
| Variant | `inspector` | `BottomSheet.tsx:75` | Correct |
| Top radius | `Radius.xxl` (24) | target | **Currently hardcoded 20 — tokenise** |
| Elevation | `Elevation.modal` | target | **Currently `floating` — fix** |
| Backdrop | `colors.overlay` × 0.72 | `BottomSheet.tsx:78` | Correct (context preserved) |
| Detents | `[0.4, 0.7, 0.95]` | target | **Currently single `0.7` — add peek + full** |
| Glass | No | contract | Correct |
| Default snap | 0.7 | `InspectorSheet.tsx:24` | Correct |

### TransactionSheet (`components/sheets/TransactionSheet.tsx`)

| Token | Value | Source | Current defect |
|-------|-------|--------|----------------|
| Variant | `transaction` | `BottomSheet.tsx:82` | Correct |
| Top radius | `Radius.xl` (16) | `VARIANT_CONFIGS.transaction` | Correct |
| Elevation | `Elevation.modal` | target | **Currently `floating` — fix** |
| Backdrop | `colors.overlay` full dim | `BottomSheet.tsx:85` | Correct |
| Footer separator | hairline `colors.borderSubtle` | `TransactionSheet.tsx:102-103` | Correct |
| Primary button | 52pt, `colors.brand` / `colors.danger` | `TransactionSheet.tsx:105-111` | **`borderRadius: 8` hardcoded — use `Radius.md`** |
| Secondary button | 52pt, hairline `colors.border` | `TransactionSheet.tsx:123-130` | **`borderRadius: 8` hardcoded — use `Radius.md`** |
| Disabled state | 0.4 opacity on button | `TransactionSheet.tsx:115` | Correct (per dock micro spec) |
| Detents | `[0.6, 0.9]` | target | **Currently single `0.6` — add full for error recovery** |
| Glass | No | contract | Correct |
| Dismissable during submit | `false` | target | **Add `dismissable` prop, guard in engine** |

### BidSheet (`components/ui/BidSheet.tsx` → `components/sheets/BidSheet.tsx`)

| Token | Value | Source | Current defect |
|-------|-------|--------|----------------|
| Variant | `transaction` | target | **Currently no variant (defaults `system`) — set `transaction`** |
| Top radius | `Radius.xl` (16) | via variant | **Currently via `system` default — will be correct after variant fix** |
| Elevation | `Elevation.modal` | via variant | **Currently `floating` — fix via variant** |
| `blurIntensity` | removed | — | **Dead prop at `:349` — delete** |
| Snap | 0.65 | `BidSheet.tsx:348` | **Single snap — add detents `[0.6, 0.9]`** |
| Item header | 44pt thumb, `Radius.md`, `Type.bodyLarge` | `BidSheet.tsx:692-728` | Correct |
| Amount input | `Type.priceList` currency + `AppInput` | `BidSheet.tsx:746-760` | Correct |
| Dominant CTA | `AppButton` primary md, full width | `BidSheet.tsx:801-803` | Correct |
| Cancel link | `Type.body`, `colors.textMuted` | `BidSheet.tsx:805-814` | Correct (quiet secondary) |
| Stages | entry/review/submitting/success/error/recoverable-conflict | `BidSheet.tsx:101, 377-675` | Gold standard — preserve |
| Glass | No | contract | Correct (after `blurIntensity` removal) |

### BuyNowSheet (`components/ui/BuyNowSheet.tsx` → `components/sheets/BuyNowSheet.tsx`)

| Token | Value | Source | Current defect |
|-------|-------|--------|----------------|
| Variant | `transaction` | target | **Currently no variant — set `transaction`** |
| Top radius | `Radius.xl` (16) | via variant | **Fix via variant** |
| Elevation | `Elevation.modal` | via variant | **Fix via variant** |
| `blurIntensity` | removed | — | **Dead prop at `:265` — delete** |
| Snap | 0.65 | `BuyNowSheet.tsx:264` | **Single snap — add detents `[0.6, 0.9]`** |
| Fixed price value | `Type.display + 4`, bold, tabular-nums | `BuyNowSheet.tsx:496-504` | Correct |
| Stages | review/submitting/success/error | `BuyNowSheet.tsx:62, 291-423` | Correct — preserve |
| Glass | No | contract | Correct (after `blurIntensity` removal) |

### MediaStage (`components/ui/MediaStage.tsx`) — immersive overlay

| Token | Value | Source | Current defect |
|-------|-------|--------|----------------|
| Role | Full-bleed media container (not a `BottomSheet`) | `MediaStage.tsx:555` | Correct — MediaStage is an inline overlay, not a bottom sheet |
| Floating controls | 44pt hit (`Control.hit`), transparent, text-shadow scrim | `MediaStage.tsx:684-710, 785-797` | Correct per AGENTS.md §4 (separate hit area from visible shape) |
| Top scrim | LinearGradient 0.36 → 0 | `MediaStage.tsx:672-677` | Correct (functional legibility, not decoration) |
| Page indicator | 5 dots / numeric counter, `rgba(0,0,0,0.55)` badge | `MediaStage.tsx:716-740, 798-832` | Correct (Depop/Vinted pattern) |
| Video controls | `Control.hit` buttons, auto-hide 3s | `MediaStage.tsx:456-549` | Correct |
| Glass | Floating controls may use glass when over media | contract | **Currently uses text-shadow only — acceptable; glass optional for video control bar** |
| Fullscreen transition | `onOpenFullscreen` callback | `MediaStage.tsx:135` | Correct — fullscreen should use `immersive` sheet variant |
| Pinch-to-zoom | maxZoom 4, pan only when zoomed | `MediaStage.tsx:206-254` | Correct |
| Reduced motion | Spring damping collapses | `MediaStage.tsx:252-253, 268` | Correct |

---

## 9. Web Sources

- [NN/G — Bottom Sheets: Definition and UX Guidelines](https://www.nngroup.com/articles/bottom-sheet/)
- [Swift Crafted — SwiftUI presentationDetents iOS 26 Guide](https://swiftcrafted.dev/article/swiftui-presentationdetents-ios-26-bottom-sheets)
- [Mobile App Wiki — Bottom Sheets and Modals: Patterns and Implementation Guide](https://mobileapp.wiki/en/uiux/bottom-sheet-modal-guide)
- [UX Patterns Guide — Bottom sheet UX Pattern](https://uxpatternsguide.com/patterns/bottom-sheet/)
- [LogRocket — How to design bottom sheets for optimized UX](https://blog.logrocket.com/ux-design/bottom-sheets-optimized-ux/)
- [Expo — How to create Apple Maps style Liquid Glass sheets](https://expo.dev/blog/how-to-create-apple-maps-style-liquid-glass-sheets)
- [Android Developers — Material Design 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)
- [DeepWiki — Sheet Presentations (Liquid Glass Reference)](https://deepwiki.com/conorluddy/LiquidGlassReference/5.3-sheet-presentations)
- [Android Developers — BottomSheetScaffold](https://developer.android.com/reference/kotlin/androidx/compose/material3/BottomSheetScaffold.composable)
- [Android Developers — SheetState](https://developer.android.com/reference/kotlin/androidx/compose/material3/SheetState)
- [72Technologies — Modals Are a Routing Problem](https://www.72technologies.com/blog/modals-are-a-routing-problem)
- [Userpilot — When Should You Use a Modal? UX Rules and Alternatives](https://userpilot.com/blog/modal-ux-design/)
- [Plotline — What Are Mobile App Modals (2026 Guide)](https://www.plotline.so/blog/mobile-app-modals)
- [Shaheer Malik — Modal & Dialog Design Best Practices (2026)](https://www.shaheermalik.com/blog/modal-design-best-practices)
- [137Foundry — How to Design Modal Dialogs That Do Not Trap Users](https://137foundry.com/articles/how-to-design-modal-dialogs-overlays-without-trapping-users)
- [Apple Developer — Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [Apple WWDC25 — Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [Apple Newsroom — Liquid Glass design](https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/)
- [Swift Crafted — iOS 26 Liquid Glass SwiftUI Tutorial](https://swiftcrafted.dev/article/ios-26-liquid-glass-swiftui-tutorial)
- [MacRumors — How Liquid Glass Is Changing in iOS 27](https://www.macrumors.com/2026/06/10/how-liquid-glass-is-changing-in-ios-27/)
- [Loke Design System — Drawer](https://design.loke.global/docs/design-system/overlay-navigation/drawer)
- [Google Chrome Modern Web Guidance — Navigation Drawer](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/overlays/navigation-drawer.md)
- [Pravin Kumar — Why I Design Webflow Mobile Menus With a Bottom-Sheet Pattern in 2026](https://www.pravinkumar.co/blog/webflow-mobile-menu-bottom-sheet-design-2026)
- [Plotline — Best Examples of Mobile App Bottom Sheets](https://www.plotline.so/blog/mobile-app-bottom-sheets/)
- [Canopy — ResponsiveDialog spec](https://github.com/rogueoak/canopy/blob/main/docs/specs/0031-responsive-dialog.md)

---

## 10. Summary

ThryftVerse has a well-architected sheet **engine** (`BottomSheet.tsx` with variant configs, gesture dismiss, keyboard awareness, safe-area handling, reduced-motion springs) and a well-designed **barrel** (`components/sheets/index.ts` with four semantic wrappers). The problem is **adoption**: 0 screens use the barrel, 8 screens call the engine directly, and the two most important domain sheets (`BidSheet`, `BuyNowSheet`) live in the wrong folder and bypass the variant system entirely. The engine also has three technical defects: wrong elevation token (`floating` instead of `modal`), dead `blurIntensity` props, and no multi-detent support.

The flagship upgrade path is: fix the engine (P0), add detents (P1), migrate domain sheets to the barrel and `TransactionSheet` base (P2), migrate the 8 screens to semantic wrappers (P3), wire the glass contract (P4), and complete accessibility (P5). The result is one sheet system with a clear variant contract, 2026-standard detent behaviour, glass scoped to immersive/docks/media per the design system, and a depth hierarchy where sheets, docks, and FABs each occupy a distinct elevation layer.
