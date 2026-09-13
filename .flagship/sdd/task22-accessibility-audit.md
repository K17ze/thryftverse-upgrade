# Task 22 — Accessibility Audit (VoiceOver / TalkBack / Large Text / Reduced Motion)

**Scope:** `HomeScreen`, `ItemDetailScreen`, `CheckoutScreen`, `InboxScreen`, `MyOrdersScreen`, `SellerHubScreen`, `UnifiedDiscoveryScreen`, plus the shared primitives and feature components they delegate to (`AnimatedPressable`, `BottomSheet`, `FlagshipHeader`/`FlagshipScreen`/`FlagshipState`, `ui/Text`, `SwipeableRow`, `Toast`, `InAppNotificationBanner`, `HomeHeader`/`HomeFeedHeader`/`HomeMasonryFeed`/`HomeDiscoveryCard`, `PinterestMasonryGrid`, `OrderLedgerRow`/`OrdersTabRail`, `Seller*Module`, checkout sheets).

**Read-only audit. No files modified.**

---

## 0. Executive summary

The codebase is far ahead of a typical RN codebase on accessibility. Foundational infrastructure exists and is genuinely wired:

- `useReducedMotion` (`hooks/useReducedMotion.ts`) ORs the OS Reduce Motion setting with the in-app preference; every animated surface audited branches on it (feed crossfade `HomeScreen.tsx:559-568`, item-detail dismiss gesture/big-heart/pagination `ItemDetailScreen.tsx:401-440,827-830`, skeleton shimmer `SkeletonLoader.tsx:38-45`, toast `Toast.tsx:46-64`, `BottomSheet` springs `BottomSheet.tsx:168-199`). The earlier loop found **zero** animated components in `components/` that use `withRepeat`/`withSequence`/`withDelay` without a reduced-motion gate.
- `BottomSheet` (`components/BottomSheet.tsx`) is exemplary: `accessibilityViewIsModal` (line 251), `useModalFocusManagement` moves AT focus into the sheet on open (line 166), labelled backdrop dismiss (261-267), drag handle hidden (`no-hide-descendants`, 285).
- `AnimatedPressable` defaults `accessibilityRole="button"`, merges `disabled` into `accessibilityState`, and applies 12pt default hitSlop (lines 50, 157-163).
- Screen content is hidden from AT while sheets are open via `accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"` (Inbox 688-689, ItemDetail 791-792, Checkout 1491-1492).
- Header structure is correct: `accessibilityRole="header"` on `FlagshipHeader` (77), `ScreenHeader` (69), Home brand title (`HomeHeader.tsx:74`), checkout title (1439); tabs use `role="tab"`/`"tablist"` correctly on Home feed tabs and Orders rail (`HomeFeedHeader.tsx:177-199`, `OrdersTabRail.tsx:97-99`).
- Dynamic commerce content uses `accessibilityLiveRegion` (checkout order error `CheckoutScreen.tsx:1715`, live total 1786, `FlagshipState` polite/assertive 193-237, inbox sync error `InboxScreen.tsx:870`) and `AccessibilityInfo.announceForAccessibility` in media surfaces.
- Colour is not the sole state carrier on audited surfaces: unread = bold text + "unread" in the row label (`InboxConversationRow.tsx:196-217`); condition dot is always paired with the grade text + an accessible group label (`ItemDetailScreen.tsx:914-929`); filter-active states are in labels ("Filters, N active", "current filter: …").

**14 issues found: 0 critical, 5 major, 9 minor.**

---

## 1. Findings

### MAJOR

**M1 — Swipe actions are unreachable for screen-reader users (Inbox)**
`components/SwipeableRow.tsx` — the row exposes a label + hint ("Swipe right to mark read or unread, swipe left to archive", `InboxScreen.tsx:645-659`) but there is **no `accessibilityActions` / `onAccessibilityAction` pair**. VoiceOver/TalkBack users cannot perform the horizontal reveal gesture; the documented pattern is to mirror each swipe action as an AT action. Compounding it: the long-press quick-action sheet (`InboxScreen.tsx:1108-1171`) only offers Mute / Pin / Delete — **"Mark read/unread" and "Archive" have no accessible path at all.** Other gesture components in the same codebase already do this correctly (`MakeOfferSheet.tsx:378`, `SortablePhotoStrip.tsx:169`, `LookCommentsSheet.tsx:293`), so this is a genuine gap, not a convention. Same component is reused in `creator/CreatorDraftListScreen.tsx` and `creator/CreatorLayersSheet.tsx`.

**M2 — Focus escapes behind open sheets on Android (ItemDetail, Checkout)**
`ItemDetailScreen.tsx:791-792` and `CheckoutScreen.tsx:1491-1492` set `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"` on the **ScrollView only**. On iOS, `accessibilityViewIsModal` on the BottomSheet root hides siblings; on Android that prop is inert, so while e.g. the cost-breakdown sheet, overflow sheet, or MakeOfferSheet is open, TalkBack can still traverse and activate:
- ItemDetail: `CommerceDetailHeader` back/share buttons and the `CommerceActionDock` (**"Buy now" / "Make offer"**, lines 773-784, 1380-1407).
- Checkout: header Close button, progress row, and the **sticky footer Pay/Apple Pay/Google Pay buttons** (1429-1464, 1753-1869).
A TalkBack user can "Pay" while an unrelated sheet is visually blocking the screen. Inbox does this correctly — the `accessibilityElementsHidden` is on the screen root `SafeAreaView` (688-689), covering all siblings.

**M3 — Toast notifications are never announced**
`components/Toast.tsx` `ToastItem` — no `accessibilityLiveRegion`, no `AccessibilityInfo.announceForAccessibility`, and it auto-dismisses after 3.2 s (lines 46-55). Every `useToast().show(...)` confirmation/error (e.g. "Followed seller", "Could not follow seller" in `ItemDetailScreen.tsx:1129-1132`) is invisible to AT. The codebase already has the correct pattern — `InAppNotificationBanner.tsx:135-142` announces `title + body` on mount — but the two notification systems coexist and the wrong one carries most transactional feedback. Secondary: the toast's icon-only close button (`Toast.tsx:74-82`) has no `accessibilityLabel` (role="button" via AnimatedPressable but announces only "button").

**M4 — In-app accessibility preference toggles are partially inert (untruthful UI)**
`AccessibilitySettingsScreen` promises five controls; only two do anything app-wide:
- `reducedMotion` — works (ORed in `useReducedMotion`).
- `highContrast` — works (`theme/ThemeContext.tsx:201-252` applies `applyHighContrast`).
- `textSize` — **only applies through `components/ui/Text.tsx`** (`useTextSizeMultiplier`, lines 29-32). That component family is imported by ~19 files; the app contains ~2,600 raw `<Text>` nodes, and all audited screens predominantly use raw `Text` (ItemDetail 23, Checkout 47, Inbox 24, MyOrders 15, Discovery 15, Home 3 — none of them `ui/Text` components). The "Extra large" picker does not change text on any audited screen.
- `boldText` — **zero consumers** outside the settings screen's own preview (`AccessibilitySettingsScreen.tsx:190`).
- `screenReaderHints` — **zero consumers** anywhere.
Violates AGENTS.md §11 (truthful UI) and fails the report's "support large text" requirement beyond the OS pathway.

**M5 — `maxFontSizeMultiplier` caps below the stated 200% goal**
The report/charter target is "all flagship screens work at 200% text". Many audited surfaces cap OS scaling at 1.3–1.5: Home peek title 1.3 (`HomeScreen.tsx:729`), ItemDetail condition/alert/secondary texts 1.4 (`ItemDetailScreen.tsx:921,943,1105,1239,1329`), `AppButton` titles 1.4 (`components/ui/AppButton.tsx:151`), Checkout action labels 1.4 (1482,1607,1611,1676,1723,1742,1794,1825,1846). OS Dynamic Type up to 200% will silently clamp at these caps. This is a deliberate layout-protection tradeoff (`useFontScale.ts` documents it), but it means the 200% claim is not met on buttons and several key texts.

### MINOR

**m6 — Skeleton loading states are silent**
`MasonrySkeleton` (Discovery), `SellerHubSkeleton`, `OrderRowSkeleton`, `CheckoutSkeleton`, and the inline inbox skeleton rows (`InboxScreen.tsx:917-927`) render non-accessible `View`s — no `accessibilityLabel="Loading"`, no live region, not hidden-but-announced. A VoiceOver user hears the header then silence until content appears. `FlagshipState`'s skeleton variant does set `accessibilityLiveRegion="polite"` (199), so the convention exists and is inconsistently applied.

**m7 — Home "peek" preview modal lacks modal semantics/focus**
`HomeScreen.tsx:697-769` uses a raw `Modal`: no `accessibilityViewIsModal`, no `useModalFocusManagement` (the pattern used everywhere else via BottomSheet). The card `Pressable` carries `accessibilityRole="none"` (715) with no group label — a screen-reader user hears "Close preview" then isolated buttons with no context that this is a listing preview (title is read, but nothing announces the preview's purpose).

**m8 — Tab-like controls use `button` role on Discovery**
Scope tabs and category pills in `UnifiedDiscoveryScreen.tsx` use `accessibilityRole="button"` + `accessibilityState={{selected}}` (633-635, 779-791) where `tab`/`radio` semantics fit and are used correctly elsewhere (`OrdersTabRail`, `HomeFeedHeader`, Inbox chips). State is still announced, so impact is low — semantic inconsistency.

**m9 — "More filters" active indicator is colour/dot-only**
`InboxScreen.tsx:719-726` — when a secondary filter (unread/archived/groups) is active but the rail is collapsed, a small `filterDot` View signals state. The button label stays "More filters" with no `accessibilityState`/label mention of the active filter, and the dot is colour-only with no text alternative.

**m10 — A few touch targets fall under 44pt/48dp**
- `MyOrdersScreen.tsx:617-624` — "Clear" filter `Pressable`: ~15pt text height + `hitSlop {top:6,bottom:6}` → ~27-30pt effective vertical target.
- `CheckoutScreen.tsx:1474-1483, 1734-1743` — partial-data action / "Try again": ~30pt + 8pt hitSlop → ~46pt, borderline under the 48dp Android recommendation.
- `MyOrdersScreen.tsx:483-493, 638-645` — footer "Retry" / stale-banner "Retry": text-size targets with 8pt hitSlop.
(`AnimatedPressable`'s 12pt default hitSlop covers most other small controls; these are raw `Pressable`s that opted out.)

**m11 — Realtime inbox updates don't announce**
`InboxScreen.tsx:212-258` — incoming realtime messages reorder rows and flip unread state silently; no `announceForAccessibility` (the pattern used in media components) for "new message from X".

**m12 — Description expand control disables itself under focus**
`ItemDetailScreen.tsx:958-987` — the whole-description `Pressable` is `disabled` once expanded; if AT focus is on it when activated, focus can drop (the separate "Show less" `AnimatedPressable` at 989-1002 partially mitigates).

**m13 — Sheet close does not restore focus to the trigger**
`useModalFocusManagement` supports `triggerRef` for return-focus (hook lines 61-68; `BottomSheet.tsx:127`), but only `SellerAnalyticsScreen.tsx:270` passes it. Every sheet in the audited screens restores focus to an arbitrary element on dismiss — functional on iOS (modal trait) but suboptimal and unfixed on Android.

**m14 — Decorative elements inside labelled rows leak**
Minor instances where inner chrome isn't `accessible={false}` inside an accessible parent: e.g. inbox requests-banner chevron/mail icons (`InboxScreen.tsx:942,953`), request-row avatar stack (529-556) — merged under the parent's label on iOS but individually traversable in some TalkBack paths. Low impact since parents carry labels.

---

## 2. Per-screen scorecard

| Screen | Labels/roles | Hints/state | Touch targets | Font scaling | Reduced motion | Modal/focus |
|---|---|---|---|---|---|---|
| Home | Good (header, tiles, save btn) | Good | Good (44pt glyph targets) | Good (caps ≤2) | Good | **Peek modal: weak (m7)** |
| ItemDetail | Very good | Very good | Good | Caps at 1.4 on secondary text (M5) | Good (gesture, heart, pagination gated) | **Focus leak behind sheets on Android (M2)** |
| Checkout | Excellent | Excellent (live regions, busy/disabled states) | Mostly good; a few thin text buttons (m10) | Caps at 1.4 on CTAs (M5) | Good (`reducedMotion` → PaymentStateBanner) | **Focus leak behind sheets on Android (M2)** |
| Inbox | Very good | **Hint lies about unreachable swipe actions (M1)** | Good | Good | Good | Good (root-level hiding) |
| MyOrders | Good | Good | **"Clear"/"Retry" targets <44pt (m10)** | OK | n/a (no animations) | Filter sheet via BottomSheet — good |
| SellerHub | Good (all in child modules) | Good | Good (`Control.hit`/`minHeight` throughout) | OK | n/a | Good |
| UnifiedDiscovery | Good | Good | Good | Caps at 2 — good | n/a | Good |

---

## 3. Counts

| Severity | Count |
|---|---|
| Critical | 0 |
| Major | 5 (M1-M5) |
| Minor | 9 (m6-m14) |
| **Total** | **14** |

## 4. Top 5 issues (priority order)

1. **M1** — `SwipeableRow` lacks `accessibilityActions`/`onAccessibilityAction`; mark-read/archive are unreachable for VoiceOver/TalkBack, and the quick-action sheet doesn't cover them.
2. **M2** — `accessibilityElementsHidden` scoped to ScrollView only → Android TalkBack can reach Buy/Pay buttons behind open sheets (ItemDetail, Checkout).
3. **M4** — `boldText`/`screenReaderHints` have zero consumers; `textSize` reaches only the 19-file `ui/Text` family — three of five settings toggles are effectively decorative.
4. **M3** — `Toast` never announced + unlabeled icon-only dismiss; all `useToast` feedback is invisible to screen readers.
5. **M5** — `maxFontSizeMultiplier` 1.3–1.5 caps contradict the "works at 200% text" claim on CTAs and key secondary text.

## 5. Recommended next action

1. **M1 (highest ROI):** add `accessibilityActions`/`onAccessibilityAction` to `SwipeableRow` mirroring `leftAction`/`rightAction`, and add "Mark read/unread" + "Archive" to the inbox quick-action sheet. One component fix, two unreachable features restored.
2. **M2:** lift `accessibilityElementsHidden`/`importantForAccessibility` from the ScrollViews to the screen-root container in `ItemDetailScreen`/`CheckoutScreen` (matching the Inbox pattern), covering header + sticky docks.
3. **M3:** route `ToastItem` through `AccessibilityInfo.announceForAccessibility` (copy the `InAppNotificationBanner` pattern) and label the close button.
4. **M4:** decide per toggle — either implement consumers (a global `Text` defaultProps/font-style layer for `boldText`/`textSize`, hint-density plumbing for `screenReaderHints`) or remove/narrow the settings so the UI is truthful.
5. **M5/m6-m14:** batch — raise CTA caps to ≥1.8 where layout allows, add a "Loading" live-region wrapper to list skeletons, add modal semantics to the Home peek overlay, and fix the sub-44pt text buttons.
