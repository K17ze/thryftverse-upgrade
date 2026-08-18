# ThryftVerse Flagship Upgrade — Pull-to-Refresh, Gesture Interactions & Tactile Patterns

**Flagship research deep-dive — ThryftVerse native interaction upgrade**
**Benchmark date: 2026-08-18**

---

## Overview

Gestures are the invisible language of a native mobile application. A flagship product does not merely "support" gestures — it speaks through them. Every pull-to-refresh, every swipe action, every long-press menu, every drag-to-dismiss, every pinch-to-zoom, and every gesture-driven transition is a sentence in a tactile conversation between the user's thumb and the product's response. When that conversation is fluent, the app feels native. When it is broken or absent, the app feels like a web dashboard trapped inside a phone.

This document defines the ThryftVerse gesture contract: the patterns, thresholds, haptic language, visual feedback, and discoverability system that separate a functional app from a flagship one. It is calibrated against the 2026 competitive landscape (Instagram, Pinterest, eBay, Snapchat, Telegram, Google Messages, iOS Photos), grounded in the ThryftVerse production codebase audit, and aligned with `AGENTS.md` §4 (Native interaction patterns — "press feedback, haptics, motion, and transitions feel native") and `Design.md` (Motion patterns, Native Platform Contract, haptic levels).

---

## 1. 2026 Competitor Benchmark — Gesture Patterns in the Wild

### 1.1 Pull-to-Refresh

**Instagram (2026):** Pull-to-refresh on the feed uses a custom branded spinner that replaces the standard iOS `RefreshControl` indicator. The spinner appears at a consistent pull distance (~60pt), rotates with the user's drag velocity, and fires a light haptic the moment the refresh threshold is crossed. Existing content remains visible during refresh — the user is never punished with a skeleton loader or blank state while data is being fetched. The refresh indicator disappears only when new content has decoded and settled into final geometry.

**Pinterest (2026):** Pinterest's pull-to-refresh is deliberately understated. The indicator is a small circular spinner that fades in as the user pulls past the threshold. Pinterest's emphasis is on perceived performance — the refresh completes so quickly that the indicator is barely visible. The haptic fires on release past threshold, not on crossing, so the user feels the commitment at the moment of release.

**eBay (2026):** eBay uses the platform-native `RefreshControl` on both iOS and Android. The pattern is conservative but reliable. The key lesson: eBay preserves scroll position and existing content during refresh, and shows a "Last updated" timestamp on surfaces where freshness matters (watchlist, saved searches).

**Snapchat (2026):** Snapchat's pull-to-refresh is minimal because the app prioritises real-time content delivery over manual refresh. When present, the indicator is a ghosted Bitmoji icon that rotates — a brand-specific touch that reinforces identity without sacrificing clarity.

**2026 consensus:** Pull-to-refresh must (1) preserve existing content during refresh, (2) fire a haptic at the threshold-crossing or release moment, (3) show a clear release-to-refresh state, (4) disappear only when data is settled, and (5) be present on every screen that loads freshness-sensitive data. The 2026 standard also requires a manual refresh button equivalent for accessibility — the gesture must never be the only path to refresh ([uxpatternsguide.com/patterns/pull-to-refresh](https://uxpatternsguide.com/patterns/pull-to-refresh/), [kt.academy/article/pull-to-refresh](https://kt.academy/article/pull-to-refresh)).

### 1.2 Swipe Actions on List Items

**Telegram (2026):** Telegram is the gold standard for compound swipe gestures in 2026. Each chat row supports: swipe left to reply, swipe right to mark as read/archive, long-press for reactions, and pull-down to search. Each gesture has a distinct haptic signature — the user's thumb knows what it triggered before the eyes confirm it. The swipe reveals labelled action panels (icon + text) behind the row, with a partial-reveal state that shows the user what action is available before they commit ([muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/)).

**Google Messages (2026):** Google Messages redesigned its long-press menu in August 2026 to apply a backdrop blur, show an emoji reaction bar above the message, and present a vertical action list below (Reply, Forward, Copy, Star, Delete, Select more, Info, Save). The redesign prioritises one-handed usage — the menu appears anchored to the long-pressed element and repositions near screen edges with a bouncy spring animation ([9to5google.com/2026/08/06/google-messages-menu-redesign](https://9to5google.com/2026/08/06/google-messages-menu-redesign/)).

**iOS Mail / Gmail (2026):** Swipe-to-reveal remains the standard for email-style list actions. Gmail: swipe left to archive, swipe right for options. iOS Mail: swipe to delete, mark as read, archive. The 2026 pattern is bi-directional with 2–3 actions per direction max, partial reveal before threshold, full-swipe to execute the primary action, and a snap-back animation if released before threshold. Destructive actions require confirmation or undo ([uxpatternsguide.com/patterns/swipe-action](https://uxpatternsguide.com/patterns/swipe-action/), [gendesigns.ai/blog/mobile-ui-patterns-2026](https://gendesigns.ai/blog/mobile-ui-patterns-2026)).

**Horizon Design System (ServiceNow, 2026):** Formalises swipe action variants — Primary, Secondary, Tertiary, Destructive, Positive — with distinct colour treatment. Only one primary action per screen. Destructive actions get the strongest visual treatment (red fill) and require undo or confirmation ([horizon.servicenow.com/native-mobile/components/mobile-component-swipe-actions](https://horizon.servicenow.com/native-mobile/components/mobile-component-swipe-actions)).

### 1.3 Long-Press Menus

**iOS Context Menu (2026):** Apple's native `.contextMenu` modifier in iOS 26/27 coordinates three things from one long-press: the pressed element lifts and stays sharp, the backdrop blurs and dims, and an action menu animates in anchored to the element. The system provides the haptic, true backdrop blur, edge repositioning, and VoiceOver wiring automatically. With Liquid Glass rolling across iOS 26 and 27, system menus pick up the new material automatically ([vp0.com/blogs/ios-context-menu-long-press-blur-swiftui](https://vp0.com/blogs/ios-context-menu-long-press-blur-swiftui)).

**TikTok (2026):** TikTok teaches gestures through use — the first time a user pauses on a video, a subtle animation shows that long-press is available for more options. The gesture is not hidden in a tutorial; it is revealed at the moment of need. This contextual gesture discovery is the 2026 best practice ([muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/)).

**NN/G guidance (2026):** Contextual menus should be used for secondary, noncritical actions. The kebab (⋮) or meatball (⋯) icon is a recognised shorthand for "more options" but has low information scent — users cannot predict what the menu contains. Long-press is the touch equivalent of right-click, but it must never be the only path to an action ([nngroup.com/articles/contextual-menus-guidelines](https://www.nngroup.com/articles/contextual-menus-guidelines/)).

### 1.4 Drag-to-Dismiss

**iOS Photos (2026):** The gold standard for drag-to-dismiss on full-screen media. The image slides down with the user's finger, the background opacity diminishes as the drag progresses, and a rubber-band resistance prevents the image from detaching too easily. If the user drags past ~120pt or flicks with sufficient velocity, the viewer dismisses. Otherwise, the image springs back to its resting position. A haptic fires on the dismiss commitment.

**Bottom sheets (2026 consensus):** Every bottom sheet must have a visible drag handle (36×4pt, centred), a minimum drag distance before dismissal (30–40% of sheet height), a velocity override (fast flick dismisses even if distance is short), and clear visual feedback during the drag. The sheet moves with the finger 1:1, with a spring-back if released before threshold. Inner scroll and sheet-drag must not conflict — the sheet drags from the handle or when inner scroll is at the top ([produkthub.dk/guides/how-to-design-for-touch](https://www.produkthub.dk/guides/how-to-design-for-touch), [uxpatternsguide.com/patterns/bottom-sheet](https://uxpatternsguide.com/patterns/bottom-sheet/), [nngroup.com/articles/bottom-sheet](https://www.nngroup.com/articles/bottom-sheet/)).

### 1.5 Pinch-to-Zoom

**iOS Photos / Instagram (2026):** Pinch-to-zoom on media is expected on every full-screen image viewer. The 2026 standard: smooth 1:1 zoom following the pinch gesture, rubber-band clamping at min/max zoom, double-tap to toggle between 1x and 2.5x, pan within the zoomed image, and a snap-back to 1x when the zoom drops below a minimum threshold. The zoom transition is continuously interactive — the user can grab and drag the image during the transition, not just after it completes ([developer.apple.com/videos/play/wwdc2024/10145](https://developer.apple.com/videos/play/wwdc2024/10145/)).

### 1.6 Swipe-to-Navigate

**Instagram (2026):** Introduced horizontal swipe gestures to move between Home, Reels, and Messages tabs. The swipe reduces precision taps and feels faster during one-handed scrolling. The key design decision: the swipe is contextual — it only works on the main tab surfaces, not on detail screens where horizontal swipe might conflict with media carousel navigation ([linkedin.com/posts/vaishnavi-nayak](https://www.linkedin.com/posts/vaishnavi-nayak-a100a7314_uxdesign-productdesign-mobileux-activity-7407101902775025664-0fi3)).

**iOS system (2026):** Swipe-from-edge for back navigation is the platform standard. The 2026 pattern is the predictive-back gesture — the outgoing screen shrinks into a card as the user drags, the scrim opacity tracks the drag progress, and the transition is continuously interactive. If the user cancels, the screen springs back. This gesture-driven transition is the strongest expression of continuity in modern mobile UI ([dev.to/brazzi64/gesture-driven-transitions-in-jetpack-compose](https://dev.to/brazzi64/gesture-driven-transitions-in-jetpack-compose-from-slides-to-predictive-back-1p3f)).

### 1.7 Gesture-Driven Transitions

**Apple Zoom Transition (iOS 18+, 2026):** The zoom transition morphs a tapped cell into the incoming view. It is continuously interactive — the user can grab and drag the element during the transition. This is the 2026 gold standard for card-to-detail transitions: the same UI element persists on screen across the transition, creating a sense of continuity that a slide or fade cannot match ([developer.apple.com/videos/play/wwdc2024/10145](https://developer.apple.com/videos/play/wwdc2024/10145/)).

**React Native Screen Transitions v3.8 (2026):** Introduces a cleaner gesture model — `progress` reflects live gestures, `transitionProgress` is the gesture-free transition, and `gesture.handoff` preserves the release snapshot for dismiss/fling animations. Simultaneous pan, pinch, and rotation gesture composition is now supported. This is the library-level foundation for gesture-driven transitions in React Native ([github.com/eds2002/react-native-screen-transitions/pull/124](https://github.com/eds2002/react-native-screen-transitions/pull/124)).

### 1.8 Haptic Feedback on Gestures

**Android Haptics (2026):** Android formalises three haptic categories: clear haptics (crisp, discrete events like button presses), rich haptics (expressive, textured sensations using wider frequency bandwidth), and buzzy haptics (generalised vibration, discouraged). The 2026 guidance: use action-oriented constants from `HapticFeedbackConstants` for consistency, sequence clear haptics primitives for rich patterns, and simulate virtual texture during gesture input (scrubbing, scrolling) ([source.android.com/docs/core/interaction/haptics/haptics-ux-design](https://source.android.com/docs/core/interaction/haptics/haptics-ux-design), [developer.android.com/develop/ui/views/haptics/haptics-principles](https://developer.android.com/develop/ui/views/haptics/haptics-principles)).

**Haptic Synthesis (2026):** The frontier of tactile design is haptic synthesis — modulating Linear Resonant Actuators to simulate specific physical sensations: mechanical click, surface friction, fluid resistance. In a sovereign design system, haptics are a Primary Interaction Layer that confirms intent before the user has visually processed the change. The "gesture + visual + haptic" triad is the 2026 standard: every gesture completion is confirmed by all three channels simultaneously ([lucky.graphics/learn/haptic-synthesis-mobile-ui](https://lucky.graphics/learn/haptic-synthesis-mobile-ui/)).

**Sequential gesture haptics (2026 research):** Immediate haptic feedback after each detected gesture is significantly more efficient than concatenating all haptics after a gesture sequence. Pattern durations of 0.3–0.5s achieve 80–90% recognition accuracy. This validates the ThryftVerse pattern of firing haptics at threshold-crossing moments, not only on action completion ([dl.acm.org/doi/10.1145/3613904.3642735](https://dl.acm.org/doi/10.1145/3613904.3642735)).

---

## 2. Psychology & Principles

### 2.1 Gestures as Direct Manipulation

Gestures are the most direct form of interaction available on a touch device. When a user drags a bottom sheet down, the sheet moves with their finger — there is no abstraction layer, no button to interpret, no menu to navigate. This is direct manipulation, and it is the interaction model that feels most "native" because it mirrors how humans interact with physical objects. A flagship app maximises direct manipulation: the user's finger is the primary instrument, and every gesture produces an immediate, proportional, physical response.

### 2.2 The "Tactile" Feeling

A native app feels tactile when three channels align simultaneously:

1. **Visual** — the element moves, scales, or transforms in direct proportion to the gesture.
2. **Haptic** — a vibration confirms the gesture's commitment point, threshold crossing, or completion.
3. **Motion physics** — the element settles with spring physics that mimic real-world inertia, not linear easing.

When any of these channels is missing, the gesture feels hollow. A swipe that moves the row but fires no haptic feels slippery. A haptic that fires but the row doesn't move feels random. A row that moves with linear easing instead of spring physics feels robotic. The ThryftVerse `useHaptic` hook and `motionTokens.ts` spring configs exist to ensure all three channels are always aligned.

### 2.3 Gesture as Naturalism

Gestures should feel natural — the user should not have to think about what gesture to perform. This means mapping gestures to physical metaphors: pull down to refresh (gravity, pulling something toward you), swipe left/right to reveal actions (pushing something aside to see what's behind), long-press to inspect (holding something to examine it), pinch to zoom (stretching something with two fingers), drag down to dismiss (pulling a curtain down). When gestures map to physical metaphors, the user's existing mental model of the physical world does the work of discovery.

### 2.4 Haptic Confirmation of Gesture Completion

Every gesture that commits an action must fire a haptic at the commitment moment — not before, not after. The haptic is the tactile signature that says "this action is now committed." For threshold-based gestures (swipe, pull-to-refresh, drag-to-dismiss), the haptic fires the moment the threshold is crossed. For completion-based gestures (long-press, double-tap), the haptic fires when the gesture is recognised. For outcome-based gestures (purchase, bid, delete), a second haptic pattern fires when the outcome is confirmed. This two-stage haptic model (commitment → outcome) is the ThryftVerse standard, already implemented in `utils/hapticPatterns.ts`.

### 2.5 Gesture Economy

The gesture economy principle: a flagship app uses the minimum number of gestures necessary to cover all primary and secondary actions. Every gesture the user must learn is a cognitive cost. Every gesture that conflicts with another gesture is a usability defect. The economy rule: if a gesture can be replaced by a visible control without adding visual noise, prefer the visible control. Gestures are shortcuts, not primary paths. The exception is pull-to-refresh, which is so universally learned that it functions as a primary path.

### 2.6 Gesture Discoverability

Gestures are invisible. If users do not know a gesture exists, it does not exist. The 2026 best practice is progressive disclosure: start with visible buttons, then introduce gesture shortcuts as the user demonstrates competence. Superhuman (the email client) shows keyboard shortcuts inline until the user starts using them, then fades the hints. TikTok reveals long-press options at the moment the user pauses on a video. The ThryftVerse discoverability system must follow this pattern — never tutorial overlays, never onboarding cards, but contextual micro-hints that appear when the user hesitates or repeats an ineffective action ([muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/), [timgraf.com/ux-design/navigation-that-thinks](https://timgraf.com/ux-design/navigation-that-thinks-reducing-cognitive-load-in-mobile-first-navigation-through-touch-interaction-gesture-design-and-thumb-zone-architecture/)).

### 2.7 The "Gesture + Visual + Haptic" Triad

Every gesture interaction in ThryftVerse must satisfy the triad:

| Channel | Requirement | Implementation |
|---------|------------|----------------|
| Visual | Element responds 1:1 with the gesture during drag, settles with spring physics on release | `react-native-reanimated` shared values + `useAnimatedStyle` |
| Haptic | Fires at threshold crossing (commitment) and/or action completion (outcome) | `useHaptic` hook + `HapticPatterns` |
| Motion | Spring physics from `motionTokens.ts` — no linear easing on interactive gestures | `Motion.spring.press`, `Motion.spring.settle`, etc. |

### 2.8 Gesture-Driven Transitions as Continuity

A gesture-driven transition is the strongest expression of continuity in mobile UI. When a user taps a product card and the card morphs into the product detail page (zoom transition), or when a user swipes back and the outgoing screen shrinks into a card (predictive back), the user maintains spatial awareness throughout the transition. The element they interacted with persists across the transition — it does not disappear and reappear in a new context. This is the difference between "navigating to a new screen" and "the screen grew out of the thing I tapped." ThryftVerse must adopt gesture-driven transitions for all card-to-detail and sheet-to-fullscreen paths.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 Codebase Gesture Inventory

A systematic grep across `frontend/src` reveals the current state of gesture adoption:

| Gesture pattern | Files referencing | Screens using | Assessment |
|----------------|-------------------|---------------|------------|
| Pull-to-refresh (`onRefresh`/`refreshing`/`RefreshControl`) | 68 files | ~45 screens | Widely adopted but inconsistent — see §3.2 |
| Swipe actions (`SwipeableRow`/`SwipeableMessage`/`Swipeable`) | 6 files | 3 screens (Inbox, Notifications, CreatorDrafts) | Severely under-adopted |
| Long-press (`onLongPress`) | 35 files | ~15 screens (mostly creator tools) | Present on discovery cards and chat, missing on most list surfaces |
| Gesture handler (`GestureDetector`/`react-native-gesture-handler`) | 62 files | ~30 screens (mostly creator/poster) | Heavy in creator, light in commerce/social |
| Pinch-to-zoom (`pinch`/`PinchGesture`) | 16 files | 8 surfaces (ImageViewer, FullscreenMediaViewer, CommerceMediaStage, MediaStage, ProductMediaGallery, PosterViewer, MoodboardEditor, CreatorCamera/Canvas/Crop) | Present on media viewers, missing on feed images |
| `onPressIn`/`onPressOut` | 21 files | Mostly creator controls + `AnimatedPressable` | Press feedback exists but not universal |
| `PanGestureHandler`/`PanGesture` explicit | 1 file (PosterViewerScreen) | 1 screen | Almost all pan gestures use `Gesture.Pan()` or `PanResponder` |

### 3.2 Pull-to-Refresh Defects

**Defect P1-001: Inconsistent refresh indicator.** The codebase has a custom `RefreshIndicator` component (`frontend/src/components/RefreshIndicator.tsx:22`) that renders a branded "T" circle with rotation and scale interpolation. However, most screens use the platform-native `RefreshControl` from React Native instead. `HomeScreen.tsx:1275` uses `<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand} />`. The custom `RefreshIndicator` is not wired into the main feed. This means the user sees two different refresh indicators depending on the screen — a native spinner on most screens, and the custom "T" indicator on screens that use `RefreshIndicator`.

**Defect P1-002: No haptic on refresh trigger.** The `useScrollHaptics` hook (`frontend/src/hooks/useScrollHaptics.ts:60`) exposes an `onRefresh` callback that fires `HapticType.SUCCESS`, but this hook is not consistently used across all refreshable screens. `HomeScreen.tsx` does not call `useScrollHaptics` — the `handleRefresh` function at line 613 sets `refreshing` to true and calls `refreshListings()` but fires no haptic. The `HapticPatterns.refresh()` pattern (`utils/hapticPatterns.ts:52`) exists but is not called from the main refresh path.

**Defect P1-003: Custom RefreshIndicator has a broken import.** `RefreshIndicator.tsx:57` references `Typography.family.bold` and `Type.bodyLarge.size` but imports `Typography, Radius, Type` from `../theme/designTokens` at line 65 — after the component definition. The `Text` import from `react-native` is also at line 64, after the JSX that uses it. This is a code smell that suggests the component was assembled incrementally and may not be actively used in production.

**Defect P1-004: No release-to-refresh visual state.** The native `RefreshControl` shows a standard spinner but does not communicate the pull progress → release threshold → refreshing state transition with the branded ThryftVerse visual language. The custom `RefreshIndicator` does interpolate pull progress (line 40: `interpolate(scrollY.value, [-100, 0], [360, 0])`) but is not used on the main feed.

### 3.3 Swipe Action Defects

**Defect P1-005: Swipe actions only on 3 screens.** `SwipeableRow` (`frontend/src/components/SwipeableRow.tsx:79`) is a well-built component with threshold haptics, spring snap-back, long-press integration, and accessibility labelling. But it is only used in `InboxScreen.tsx:470` (conversation rows). `NotificationsScreen.tsx:602` uses a different `Swipeable` component from `react-native-gesture-handler` directly, creating an inconsistency. `CreatorDraftListScreen.tsx:753` and `CreatorLayersSheet.tsx:541` also use swipeable patterns. No commerce list screen (MyListings, MyOrders, InventoryManagement, SavedAddresses, Wallet transactions) uses swipe actions.

**Defect P1-006: Two competing swipe implementations.** `SwipeableRow` uses `PanResponder` (React Native built-in) while `SwipeableMessage` (`frontend/src/components/SwipeableMessage.tsx:50`) uses `Gesture.Pan()` from `react-native-gesture-handler`. `NotificationsScreen` uses the `Swipeable` component from `react-native-gesture-handler`. This means three different swipe implementations exist in the codebase with different thresholds, haptic timings, and visual behaviours. The user experience is inconsistent across screens.

**Defect P1-007: No swipe actions on actionable list items.** `MyListingsScreen`, `MyOrdersScreen`, `InventoryManagementScreen`, `SavedAddressesScreen`, `WalletScreen`, `FollowingScreen`, `FollowersScreen`, `SyndicateOrderHistoryScreen`, `DistributionHistoryScreen`, `MarketLedgerScreen` — none of these use swipe actions despite having actionable list items (delete, archive, mark read, reorder, etc.).

### 3.4 Long-Press Defects

**Defect P1-008: No long-press menus on product cards.** `HomeDiscoveryCard.tsx:134` has an `onLongPress` handler that calls `onLongPress(item)`, but the handler in `HomeScreen.tsx:1083` only sets a `peekItem` state for a peek sheet. There is no full long-press context menu with quick actions (Save, See similar, Share, Hide, Report). Pinterest's long-press reveals a radial quick-action wheel; Instagram's reveals a context menu. ThryftVerse only has a peek.

**Defect P1-009: No long-press on notification rows.** `NotificationsScreen.tsx` uses `Swipeable` for swipe actions but has no long-press handler. Google Messages, iOS Mail, and Telegram all support long-press on notification/message rows to reveal a context menu with quick actions.

**Defect P1-010: No long-press on wallet/order list items.** `WalletScreen`, `MyOrdersScreen`, `SyndicateOrderHistoryScreen` — no long-press to view details, copy transaction ID, or report an issue.

### 3.5 Gesture-Driven Transition Defects

**Defect P1-011: No shared-element zoom transition.** `SharedTransitionImage.tsx` and `SharedTransitionView.tsx` exist as 436-byte and 458-byte stubs in `frontend/src/components/` — they are placeholder files with no real implementation. The card-to-detail transition on discovery and feed surfaces uses a standard navigation push, not a zoom transition. iOS 18+ zoom transitions and React Native Screen Transitions v3.8 provide the technology, but ThryftVerse has not adopted them.

**Defect P1-012: No predictive-back gesture.** Android's predictive-back gesture (the outgoing screen shrinks into a card as the user drags from the edge) is not implemented. The back navigation is a standard slide transition with no gesture-driven component.

### 3.6 Haptic Feedback on Gestures — Defects

**Defect P2-001: Haptic not fired on pull-to-refresh.** As noted in §3.2, `HomeScreen.tsx:613` `handleRefresh` does not call `haptic.patterns.refresh()`. The pattern exists in `hapticPatterns.ts:52` but is not wired in.

**Defect P2-002: Haptic not fired on swipe-to-navigate tab switch.** `TabNavigator.tsx:124,132` has `onPressIn`/`onPressOut` handlers but the tab switch haptic is not consistently applied. `useScrollHaptics.onSegmentChange` exists but is not used by the tab navigator.

**Defect P2-003: Android haptics suppressed by default.** `useHaptic.ts:27` sets `ANDROID_IMPACT_ENABLED = false`, which means all impact-style haptics (light, medium, heavy) are suppressed on Android. Only notification haptics (success, error, warning) and selection fire. This means swipe threshold haptics, long-press haptics, and press feedback haptics are all silent on Android. While this avoids jarring system vibration on low-quality actuators, it means Android users get a significantly less tactile experience than iOS users.

### 3.7 Pinch-to-Zoom Defects

**Defect P1-013: No pinch-to-zoom on feed images.** `ImageViewer.tsx:52` implements pinch-to-zoom with `Gesture.Pinch()` and `FullscreenMediaViewer.tsx:85` has a full pinch + pan + drag-to-dismiss composition. But feed images on `HomeScreen` and discovery cards on `BrowseScreen` do not support pinch-to-zoom. The user must navigate to the product detail or full-screen viewer to zoom. Instagram and Pinterest allow pinch-to-zoom directly on feed images.

### 3.8 Swipe-to-Navigate Defects

**Defect P1-014: No swipe-to-navigate between tabs.** `HomeScreen.tsx:1210` shows feed tab indicators but there is no horizontal swipe gesture to switch between "For You" and "Following" tabs. Instagram's 2026 update introduced swipe-between-tabs as a primary navigation pattern. ThryftVerse's feed tabs require tap-only navigation.

**Defect P1-015: No swipe-to-go-back on detail screens.** iOS edge-swipe back navigation is handled by the navigation library, but there is no custom swipe-back on screens that need it (e.g., product detail, where horizontal swipe is consumed by the media gallery carousel). The conflict between media carousel swipe and edge-swipe back is not resolved.

---

## 4. Micro Improvements

1. **Wire `HapticPatterns.refresh()` into every `handleRefresh` function.** The pattern exists at `utils/hapticPatterns.ts:52` — call it at the top of every `handleRefresh` callback. This is a one-line fix per screen.

2. **Fix `RefreshIndicator.tsx` import ordering.** Move the `Text` import and `Typography, Radius, Type` imports to the top of the file (lines 64–65 → lines 1–2). This is a code hygiene fix.

3. **Add `useScrollHaptics` to every refreshable screen.** The hook at `hooks/useScrollHaptics.ts` provides `onRefresh`, `onSegmentChange`, and elastic bounce haptics. Wire it into every `FlashList`/`FlatList`/`ScrollView` that has a `RefreshControl`.

4. **Add long-press handlers to `NotificationsScreen` rows.** The `Swipeable` component at `NotificationsScreen.tsx:602` should also expose an `onLongPress` that opens a context menu (Mark read, Mute, Remove, View details).

5. **Add swipe actions to `MyListingsScreen` rows.** Swipe left to delete/archive, swipe right to edit/duplicate. The `SwipeableRow` component already supports this — wire it in.

6. **Enable Android impact haptics on mid-range+ devices.** Instead of a blanket `ANDROID_IMPACT_ENABLED = false`, detect actuator quality via `expo-haptics` or device capabilities and enable impact haptics on devices with LRA actuators (most 2023+ Android devices).

7. **Add double-tap-to-zoom on feed images.** `DoubleTapHandler.tsx` and `DoubleTapHeart.tsx` already implement double-tap detection. Add a double-tap-to-zoom variant on feed media that navigates to the fullscreen viewer with a zoom transition.

8. **Add swipe-to-navigate on feed tabs.** Wrap the feed content in a `Gesture.Pan()` with `activeOffsetX([-20, 20])` that switches between "For You" and "Following" tabs on horizontal swipe, with a directional slide transition.

---

## 5. Macro Improvements — Gesture System

### 5.1 Pull-to-Refresh Contract

Every screen that loads freshness-sensitive data must implement pull-to-refresh with the following contract:

- **Indicator:** A single, branded ThryftVerse refresh indicator (not the platform-native `RefreshControl`). The custom `RefreshIndicator` must be fixed and adopted as the standard.
- **Pull distance:** 60pt minimum pull before the release-to-refresh state activates.
- **Threshold haptic:** `HapticPatterns.refresh()` fires the moment the pull crosses the threshold.
- **Content preservation:** Existing content remains visible during refresh. No skeleton, no blank state, no fullscreen loader.
- **Completion:** The indicator disappears only when new content has decoded and settled into final geometry.
- **Manual equivalent:** A visible "Refresh" button or retry action exists in empty/error states for accessibility.
- **Last-updated timestamp:** On surfaces where freshness is critical (watchlist, saved searches, wallet), show a "Last updated: [time]" label.

### 5.2 Swipe Action Contract

Every actionable list item must support swipe actions with the following contract:

- **Component:** Use `SwipeableRow` as the single canonical implementation. Deprecate the `Swipeable` import from `react-native-gesture-handler` in `NotificationsScreen` and migrate to `SwipeableRow`.
- **Directional grammar:**
  - Swipe left (trailing edge reveal): primary destructive/action — Delete, Archive, Remove.
  - Swipe right (leading edge reveal): primary positive action — Mark read, Pin, Edit, Duplicate.
- **Threshold:** 80pt (from `SwipeableRow.tsx:59` `DEFAULT_THRESHOLD`). Haptic fires at threshold crossing.
- **Partial reveal:** The action panel (icon + label) is visible during the drag, communicating what action is available before commitment.
- **Full swipe:** A full swipe past 1.5× threshold executes the primary action immediately on release.
- **Snap-back:** If released before threshold, the row springs back with `Motion.spring.press`.
- **Max actions:** 2–3 per direction. If more actions are needed, the last slot is "More" which opens a context menu.
- **Destructive actions:** Red fill (`colors.danger`), require undo toast or confirmation.
- **Accessibility:** Swipe actions are announced as labelled buttons via `accessibilityHint` (already implemented in `SwipeableRow.tsx:286`).

### 5.3 Long-Press Contract

Every media card, list item, and message bubble must support long-press with the following contract:

- **Dwell time:** 350ms (from `motionTokens.ts:210` `longPressMs`). This is shorter than the 400ms in `SwipeableRow.tsx:60` — align to 350ms globally.
- **Haptic:** `HapticPatterns.longPress()` fires when the long-press is recognised.
- **Visual feedback:** The pressed element scales to 0.97 during the dwell, then lifts with a shadow when the menu appears.
- **Menu presentation:** A context menu slides up from the bottom sheet (BottomSheet variant `system`), with the pressed element remaining visible above the menu. Backdrop dims to `colors.overlay`.
- **Menu content:** 4–6 context-appropriate actions. For product cards: Save, See similar, Share, Hide, Report. For messages: Reply, React, Copy, Forward, Pin, Delete. For notifications: Mark read, Mute, Remove, View details.
- **Cancellation:** Any movement >8pt cancels the long-press (already implemented in `SwipeableRow.tsx:186`).
- **Accessibility:** A visible "More" (⋯) button is always available as a non-gesture alternative.

### 5.4 Drag-to-Dismiss Contract

Every bottom sheet and full-screen media viewer must support drag-to-dismiss:

- **Drag handle:** 40×5pt, `Radius.sm`, `colors.textMuted + '80'`, centred at the top of the sheet (already in `BottomSheet.tsx:322`).
- **Threshold:** 35% of sheet height (already in `BottomSheet.tsx:205` `sheetHeight * 0.35`). For full-screen media, 120pt or velocity >600 (already in `FullscreenMediaViewer.tsx:128`).
- **Velocity override:** A fast flick (velocityY >600) dismisses even if the drag distance is short (already in `BottomSheet.tsx:206`).
- **Rubber-band resistance:** `FullscreenMediaViewer.tsx:47` implements `rubberBand()` with 0.35 friction. This should be the standard for all drag-to-dismiss surfaces.
- **Haptic:** `haptic.medium()` fires on dismiss commitment (already in `BottomSheet.tsx:209`).
- **Visual feedback:** The sheet/image moves 1:1 with the finger. For media viewers, opacity diminishes proportionally to drag distance (already in `FullscreenMediaViewer.tsx:116`).
- **Spring-back:** If released before threshold, the sheet springs back with `Motion.spring.entrance`.
- **Inner scroll conflict:** The sheet only drags when inner scroll is at the top. When inner content is scrolled, the pan gesture is yielded to the inner scroll view.

### 5.5 Pinch-to-Zoom Contract

Every full-screen image viewer and product media gallery must support pinch-to-zoom:

- **Min zoom:** 1× (from `motionTokens.ts:214` `pinchMinSnap`). Below 1× snaps back.
- **Max zoom:** 4× (from `motionTokens.ts:216` `pinchMaxDefault`). Detail surfaces may override to 6×.
- **Double-tap:** Toggles between 1× and 2.5× (already in `ImageViewer.tsx:118`).
- **Pan within zoom:** When zoomed >1×, pan is enabled with rubber-band clamping at edges (already in `ImageViewer.tsx:70`).
- **Snap-back:** When zoom drops below 1× on pinch end, animate back to 1× with 200ms timing (already in `ImageViewer.tsx:59`).
- **Haptic:** Fire `haptic.light()` when double-tap zoom activates.
- **Gesture composition:** `Gesture.Simultaneous(Gesture.Race(doubleTap, pan), pinch)` (already in `ImageViewer.tsx:125`).

### 5.6 Haptic Gesture Language

The ThryftVerse haptic gesture language is defined in `utils/hapticPatterns.ts` and `hooks/useHaptic.ts`. The complete vocabulary:

| Pattern | Gesture | Composition | When |
|---------|---------|-------------|------|
| `like` | Double-tap | Two quick light taps | Like on media |
| `refresh` | Pull-to-refresh | Medium impact | Refresh threshold crossed |
| `save` | Tap save | Light tap → selection | Bookmark/save |
| `longPress` | Long-press | Heavy impact | Long-press recognised |
| `delete` | Swipe-to-delete | Heavy impact → error notification | Destructive swipe committed |
| `bidPlaced` | Bid submit | Selection → light tap | Bid committed |
| `purchaseComplete` | Buy submit | Medium impact → success notification | Purchase completed |
| `outbid` | Outbid alert | Warning notification | Outbid detected |
| `auctionWon` | Auction win | Success → success | Auction won |
| `tabSwitch` | Tab switch | Selection tick | Tab/segment changed |
| `toggle` | Toggle | Light tap | Toggle/switch |
| `feedEnd` | Scroll end | Selection tick | Reached end of feed |

**Android enrichment:** Enable impact haptics on Android for devices with LRA actuators. Use `HapticPatterns` for all compound patterns. Keep `ANDROID_IMPACT_ENABLED` as a device-detection flag, not a blanket false.

### 5.7 Gesture-Driven Transition System

Adopt shared-element zoom transitions for all card-to-detail paths:

1. **Discovery card → Product detail:** The tapped card image morphs into the product detail hero media. Use `SharedTransitionImage` (currently a stub — implement using `react-native-reanimated` shared transitions or React Native Screen Transitions v3.8).
2. **Profile grid item → Full-screen archive viewer:** The tapped grid item zooms into the full-screen viewer.
3. **Feed media → Full-screen viewer:** The feed image zooms into the fullscreen media viewer with drag-to-dismiss.
4. **Sheet → Full-screen:** A bottom sheet that expands to full-screen should use a continuous gesture-driven expansion, not a separate presentation.

### 5.8 Gesture Discoverability System

Implement contextual gesture hints — not tutorials, not overlays:

1. **Hesitation detection:** If a user holds their finger on a swipeable row for >500ms without moving, subtly reveal 8pt of the action panel to hint that swipe is available.
2. **Repeat-action detection:** If a user taps a "More" (⋯) button three times for the same action, show a one-time toast: "Tip: swipe left to [action] directly."
3. **First-use micro-hint:** On the first visit to a screen with swipe actions, animate a single 16pt nudge of the first row to reveal the action panel, then snap back. This is a one-time, 300ms animation that never repeats.
4. **Progressive disclosure:** Always provide visible button equivalents. Gestures are shortcuts, not primary paths. The "More" (⋯) button is the non-gesture alternative for long-press. A "Refresh" button is the non-gesture alternative for pull-to-refresh.

---

## 6. Flagship Acceptance Criteria

A ThryftVerse screen is not flagship unless it meets all of the following gesture criteria:

- [ ] **Pull-to-refresh** on every screen that loads freshness-sensitive data, with the branded indicator, threshold haptic, and content preservation.
- [ ] **Swipe actions** on every actionable list item, using `SwipeableRow` as the canonical implementation, with threshold haptic, partial reveal, and snap-back.
- [ ] **Long-press menu** on every media card, list item, and message bubble, with 350ms dwell, heavy haptic, context menu presentation, and visible "More" button equivalent.
- [ ] **Drag-to-dismiss** on every bottom sheet and full-screen media viewer, with drag handle, 35% threshold, velocity override, rubber-band resistance, and dismiss haptic.
- [ ] **Pinch-to-zoom** on every full-screen image viewer, with 1×–4× range, double-tap toggle, pan within zoom, and snap-back.
- [ ] **Haptic feedback** on every gesture completion, using the `HapticPatterns` vocabulary, with the commitment → outcome two-stage model.
- [ ] **Gesture discoverability** — contextual hints on first use, hesitation detection, and visible button equivalents for every gesture.
- [ ] **Reduced motion** — every gesture animation collapses to instant or simple fade when `useReducedMotion()` returns true. Haptics degrade together with motion.
- [ ] **Accessibility** — every gesture has a non-gesture alternative (button, menu, control). Swipe actions are announced via `accessibilityHint`. Long-press menus are reachable via a visible "More" button.

---

## 7. Priority & Sequencing

| Priority | Work item | Effort | Impact |
|----------|-----------|--------|--------|
| P0 | Wire `HapticPatterns.refresh()` into all `handleRefresh` functions | Low | High — every refreshable screen gets tactile feedback |
| P0 | Fix `RefreshIndicator.tsx` import ordering and adopt as the single refresh indicator | Low | Medium — visual consistency |
| P0 | Add `useScrollHaptics` to every refreshable screen | Low | High — elastic bounce + segment change haptics |
| P1 | Migrate `NotificationsScreen` from `Swipeable` to `SwipeableRow` | Medium | High — single canonical swipe implementation |
| P1 | Add `SwipeableRow` to `MyListingsScreen`, `MyOrdersScreen`, `InventoryManagementScreen`, `SavedAddressesScreen`, `WalletScreen` | Medium | High — swipe actions on all actionable lists |
| P1 | Add long-press context menus to product cards (`HomeDiscoveryCard`, `ProductCardV2`, masonry cards) | Medium | High — Pinterest/Instagram-level interaction |
| P1 | Add long-press to notification rows and wallet/order list items | Medium | Medium — consistency |
| P1 | Implement `SharedTransitionImage` for card-to-detail zoom transition | High | High — flagship continuity |
| P1 | Add swipe-to-navigate on feed tabs (For You / Following) | Medium | Medium — Instagram-level navigation |
| P2 | Enable Android impact haptics on LRA-equipped devices | Low | Medium — Android tactile parity |
| P2 | Add pinch-to-zoom on feed images (not just fullscreen viewer) | Medium | Medium — Instagram/Pinterest parity |
| P2 | Implement contextual gesture hints (hesitation detection, first-use nudge) | Medium | Medium — discoverability |
| P2 | Add predictive-back gesture on detail screens | High | Medium — Android continuity |
| P2 | Implement drag-to-dismiss on all remaining sheets that lack it | Low | Medium — consistency |

---

## 8. Token-Level Spec Table

The following table defines the exact token-level specification for each gesture pattern. All thresholds, animations, haptics, and visual feedback are sourced from or aligned with `frontend/src/theme/motionTokens.ts` (`Motion.gestures`, `Motion.spring`, `Motion.duration`) and `frontend/src/utils/hapticPatterns.ts`.

### 8.1 Pull-to-Refresh

| Property | Value | Source |
|----------|-------|--------|
| Gesture threshold | 60pt pull distance | New token: `Motion.gestures.refreshThreshold` (proposed: 60) |
| Activation | Release past threshold | — |
| Animation | Custom `RefreshIndicator` — rotation interpolate `[-100, 0] → [360, 0]deg`, scale `[-100, -20, 0] → [1.2, 0.8, 0]` | `RefreshIndicator.tsx:40-41` |
| Refreshing animation | `withRepeat(withTiming(360, { duration: 800, easing: Easing.linear }), -1)` | `RefreshIndicator.tsx:29-31` |
| Haptic (commitment) | `HapticPatterns.refresh()` — medium impact | `hapticPatterns.ts:52` |
| Haptic (completion) | `HapticPatterns.save()` — light tap → selection (on new content arrival) | `hapticPatterns.ts:84` |
| Visual feedback | Branded "T" circle, 32×32pt, `Radius.xl`, `colors.brand` fill, `Elevation.card` shadow | `RefreshIndicator.tsx:75-87` |
| State transitions | idle → pulling (opacity 0→1 as scrollY passes -40) → release-ready (scale 1.2, full opacity) → refreshing (rotation loop, scale 1.2) → complete (fade out) | `RefreshIndicator.tsx:40-50` |
| Content preservation | Existing content remains visible; no skeleton/blank during refresh | Design contract |
| Reduced motion | Indicator appears at full opacity without rotation; haptic suppressed | `useReducedMotion` |

### 8.2 Swipe-Left Action (trailing edge)

| Property | Value | Source |
|----------|-------|--------|
| Gesture threshold | 80pt | `SwipeableRow.tsx:59` `DEFAULT_THRESHOLD` |
| Activation | Release past threshold; full swipe past 1.5× threshold executes immediately | `SwipeableRow.tsx:230-239` |
| Animation | `translateX` follows finger 1:1, clamped to `MAX_TRAVEL` (96pt); snap-back with `Motion.spring.press` | `SwipeableRow.tsx:138-145, 198-205` |
| Haptic (commitment) | `haptic.selection()` at threshold crossing | `SwipeableRow.tsx:147-150` |
| Haptic (action) | Action-specific: `HapticPatterns.delete()` for destructive, `haptic.light()` for non-destructive | `hapticPatterns.ts:41` |
| Visual feedback | Action panel revealed behind row: icon (`Control.icon` size) + label (`Type.caption`), `colors.danger` or `colors.brand` fill, opacity interpolates with progress | `SwipeableRow.tsx:264-278, 329` |
| State transitions | idle → dragging (panel opacity 0→1) → threshold-crossed (haptic fires, panel full opacity) → released-past-threshold (action fires, row snaps back) → released-before-threshold (snap back, panel fades) | `SwipeableRow.tsx:208-241` |
| Reduced motion | `withTiming(0, { duration: 0 })` snap-back; haptic suppressed | `SwipeableRow.tsx:139-141` |

### 8.3 Swipe-Right Action (leading edge)

| Property | Value | Source |
|----------|-------|--------|
| Gesture threshold | 80pt | `SwipeableRow.tsx:59` |
| Activation | Release past threshold | `SwipeableRow.tsx:236-238` |
| Animation | Same as swipe-left, mirrored | `SwipeableRow.tsx:198-205` |
| Haptic (commitment) | `haptic.selection()` at threshold crossing | `SwipeableRow.tsx:147-150` |
| Haptic (action) | `haptic.light()` for positive actions (mark read, pin, edit) | `useHaptic.ts:54` |
| Visual feedback | Action panel on leading edge: icon + label, `colors.brand` fill, opacity interpolates with progress | `SwipeableRow.tsx:306-323, 311` |
| State transitions | Same as swipe-left, mirrored | `SwipeableRow.tsx:208-241` |
| Reduced motion | Same as swipe-left | `SwipeableRow.tsx:139-141` |

### 8.4 Long-Press Menu

| Property | Value | Source |
|----------|-------|--------|
| Gesture threshold | 350ms dwell | `motionTokens.ts:210` `longPressMs` (align `SwipeableRow.tsx:60` from 400ms) |
| Movement tolerance | 8pt — movement beyond this cancels the long-press | `SwipeableRow.tsx:186` |
| Activation | Timer fires after dwell; cancelled on move or release | `SwipeableRow.tsx:172-183` |
| Animation | Pressed element scales to 0.97 during dwell; on activation, lifts with `Elevation.floating` shadow and backdrop dims to `colors.overlay` | New — aligned with `AnimatedPressable.tsx` |
| Haptic (recognition) | `HapticPatterns.longPress()` — heavy impact | `hapticPatterns.ts:67` |
| Visual feedback | Context menu slides up from bottom (`BottomSheet` variant `system`, `Motion.duration.normal` entrance); pressed element remains visible above menu | `BottomSheet.tsx:152-160` |
| State transitions | idle → pressing (scale 0.97) → dwell-threshold-crossed (haptic, menu appears) → menu-open (backdrop dimmed, element lifted) → dismissed (menu slides down, element settles) | New |
| Reduced motion | Menu appears instantly; scale and lift suppressed; haptic suppressed | `useReducedMotion` |
| Accessibility | Visible "More" (⋯) button always available as non-gesture alternative | Design contract |

### 8.5 Drag-to-Dismiss (Bottom Sheet)

| Property | Value | Source |
|----------|-------|--------|
| Gesture threshold | 35% of sheet height OR velocityY >600 | `BottomSheet.tsx:205-206` |
| Activation | Release past threshold or fast flick | `BottomSheet.tsx:208-210` |
| Animation | `translateY` follows finger 1:1, clamped to `Math.max(0, contextY + translationY)`; snap-back with `Motion.spring.entrance` | `BottomSheet.tsx:199-214` |
| Haptic (dismiss) | `haptic.medium()` on dismiss commitment | `BottomSheet.tsx:209` |
| Visual feedback | Sheet moves 1:1 with finger; backdrop opacity diminishes proportionally (for media viewers); drag handle visible at top | `BottomSheet.tsx:217-222, 322-327` |
| State transitions | open → dragging (sheet follows finger) → threshold-crossed (haptic fires) → released-past-threshold (dismiss spring, `onDismiss` callback) → released-before-threshold (snap back to open) | `BottomSheet.tsx:194-215` |
| Reduced motion | Spring collapses to `REDUCED_SPRING`; haptic suppressed | `useMotionConfig` |
| Inner scroll conflict | Sheet drags only when inner scroll is at top; otherwise pan yields to inner scroll | Design contract — needs implementation |

### 8.6 Pinch-to-Zoom

| Property | Value | Source |
|----------|-------|--------|
| Gesture threshold | Pinch scale >1.01 activates zoom | `ImageViewer.tsx:52-56` |
| Min zoom | 1× — snaps back below this | `motionTokens.ts:214` `pinchMinSnap` |
| Max zoom | 4× standard, 6× detail surfaces | `motionTokens.ts:216` `pinchMaxDefault` |
| Animation | `scale` follows pinch 1:1, clamped `[MIN_ZOOM, MAX_ZOOM]`; snap-back with `withTiming(1, { duration: 200 })` | `ImageViewer.tsx:52-68` |
| Haptic | `haptic.light()` on double-tap zoom activation | New — aligned with `DoubleTapHeart.tsx:48` |
| Visual feedback | Image scales 1:1 with pinch; pan enabled when zoomed >1× with rubber-band clamping at edges (`rubberBand()` friction 0.24) | `ImageViewer.tsx:27-34, 70-105` |
| State transitions | idle (scale 1×) → pinching (scale follows pinch) → released-above-min (scale holds, pan enabled) → released-below-min (snap-back to 1×, pan resets) → double-tapped (toggle 1× ↔ 2.5×) | `ImageViewer.tsx:52-123` |
| Reduced motion | Double-tap zoom target is 2× instead of 2.5×; pinch animation unchanged (gesture-driven, not timing-based) | `ImageViewer.tsx:118` |
| Gesture composition | `Gesture.Simultaneous(Gesture.Race(doubleTap, pan), pinch)` | `ImageViewer.tsx:125` |

### 8.7 Swipe-to-Navigate (tabs)

| Property | Value | Source |
|----------|-------|--------|
| Gesture threshold | 20pt horizontal pan (`activeOffsetX([-20, 20])`) | New — aligned with `SwipeableMessage.tsx:51` |
| Activation | Release past threshold; velocity override at 500pt/s | New |
| Animation | Content slides directionally with `Motion.transitions.tabSwitch` (200ms, translateX 12pt, `crisp` easing) | `motionTokens.ts:185-189` |
| Haptic (commitment) | `HapticPatterns.tabSwitch()` — selection tick | `hapticPatterns.ts:57` |
| Visual feedback | Tab indicator slides to the new tab with `Motion.spring.indicator`; content crossfades/slides | `motionTokens.ts:107` |
| State transitions | tab-A → swiping (content follows finger slightly) → threshold-crossed (haptic) → released-past-threshold (tab switches, indicator slides, content transitions) → released-before-threshold (snap back to tab-A) | New |
| Reduced motion | Instant tab switch; no slide; haptic suppressed | `useReducedMotion` |
| Conflict resolution | Disabled on screens where horizontal swipe is consumed by media carousel; only active on tab container surfaces | Design contract |

### 8.8 Double-Tap

| Property | Value | Source |
|----------|-------|--------|
| Gesture threshold | Two taps within 280ms | `motionTokens.ts:212` `doubleTapMs` |
| Activation | Second tap within window | `DoubleTapHeart.tsx:72-76`, `DoubleTapHandler.tsx:48-52` |
| Animation (like) | Heart scale: `withSequence(withTiming(1.2, { duration: 160 }), withTiming(1.2, { duration: 500 }), withTiming(0, { duration: 180 }))`; opacity: `withSequence(withTiming(1, { duration: 100 }), withDelay(620, withTiming(0, { duration: 180 })))` | `DoubleTapHeart.tsx:61-69` |
| Animation (zoom) | Scale to 2.5× (or 2× reduced motion) with `withTiming(zoomTarget, { duration: 200, easing: Easing.out(Easing.cubic) })` | `ImageViewer.tsx:118-120` |
| Haptic (like) | `haptic.medium()` | `DoubleTapHeart.tsx:48` |
| Haptic (zoom) | `haptic.light()` | New |
| Visual feedback (like) | Heart overlay (80–100pt, `colors.danger`) scales up and fades out over the media | `DoubleTapHeart.tsx:89-91` |
| Visual feedback (zoom) | Image scales to target with ease-out | `ImageViewer.tsx:119` |
| State transitions | idle → first-tap (timer starts) → second-tap-within-window (gesture recognised, haptic + animation fire) → first-tap-then-timeout (treated as single tap) | `DoubleTapHandler.tsx:48-52` |
| Reduced motion | Like: no heart animation, just filled state; Zoom: target 2× instead of 2.5× | `DoubleTapHeart.tsx:52-54`, `ImageViewer.tsx:118` |

---

## References

### Web sources
- [kt.academy — Pull-to-refresh implementation guide](https://kt.academy/article/pull-to-refresh)
- [uxpatternsguide.com — Pull to refresh UX pattern](https://uxpatternsguide.com/patterns/pull-to-refresh/)
- [ui-patterns.com — Pull to refresh design pattern](https://ui-patterns.com/patterns/pull-to-refresh)
- [mozconcepts.com — Essential guide to pull-to-refresh](https://www.mozconcepts.com/the-essential-guide-to-pull-to-refresh-in-mobile-app-design.html)
- [susatest.com — Testing pull to refresh on Android](https://www.susatest.com/blog/how-to-test-pull-to-refresh-android)
- [uxpatternsguide.com — Swipe action UX pattern](https://uxpatternsguide.com/patterns/swipe-action/)
- [horizon.servicenow.com — Swipe actions component spec](https://horizon.servicenow.com/native-mobile/components/mobile-component-swipe-actions)
- [gendesigns.ai — Mobile UI patterns 2026](https://gendesigns.ai/blog/mobile-ui-patterns-2026)
- [developer.android.com — Swipe to dismiss in Compose](https://developer.android.com/develop/ui/compose/touch-input/user-interactions/swipe-to-dismiss)
- [checklist.design — Gesture navigation mobile checklist](https://www.checklist.design/mobile/gesture-navigation)
- [docs.swmansion.com — React Native Gesture Handler docs](https://docs.swmansion.com/react-native-gesture-handler/docs/)
- [paddyb.com — Gesture Handler 3.0 Expo migration guide](https://paddyb.com/tutorials/react-native-gesture-handler-3-expo-migration.html)
- [dopebase.com — Gesture handling in React Native](https://dopebase.com/blog/gesture-handling-react-native-gesture-handler)
- [nngroup.com — Contextual menus guidelines](https://www.nngroup.com/articles/contextual-menus-guidelines/)
- [uxpatternsguide.com — Long press UX pattern](https://uxpatternsguide.com/patterns/long-press/)
- [vp0.com — iOS context menu long-press blur in SwiftUI](https://vp0.com/blogs/ios-context-menu-long-press-blur-swiftui)
- [zenn.dev — Long-press action sheets implementation](https://zenn.dev/orectic/articles/team-board-mobile-long-press-action?locale=en)
- [9to5google.com — Google Messages long-press menu redesign (Aug 2026)](https://9to5google.com/2026/08/06/google-messages-menu-redesign/)
- [source.android.com — Haptics UX design](https://source.android.com/docs/core/interaction/haptics/haptics-ux-design)
- [developer.android.com — Haptics design principles](https://developer.android.com/develop/ui/views/haptics/haptics-principles)
- [lucky.graphics — Haptic synthesis in mobile UI](https://lucky.graphics/learn/haptic-synthesis-mobile-ui/)
- [dl.acm.org — Designing haptic feedback for sequential gestural inputs](https://dl.acm.org/doi/10.1145/3613904.3642735)
- [nngroup.com — Bottom sheets definition and guidelines](https://www.nngroup.com/articles/bottom-sheet/)
- [produkthub.dk — How to design for touch](https://www.produkthub.dk/guides/how-to-design-for-touch)
- [uxpatternsguide.com — Bottom sheet UX pattern](https://uxpatternsguide.com/patterns/bottom-sheet/)
- [mobileapp.wiki — Bottom sheets and modals guide](https://mobileapp.wiki/en/uiux/bottom-sheet-modal-guide)
- [blog.logrocket.com — Bottom sheets optimized UX](https://blog.logrocket.com/ux-design/bottom-sheets-optimized-ux/)
- [muz.li — Mobile app design trends 2026](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/)
- [uxpin.com — Mobile navigation design 2026](https://www.uxpin.com/studio/blog/mobile-navigation-examples/)
- [hashbuilds.com — Swipe gestures mobile touch navigation](https://www.hashbuilds.com/patterns/what-is-swipe-gestures)
- [linkedin.com — Instagram navigation update analysis](https://www.linkedin.com/posts/vaishnavi-nayak-a100a7314_uxdesign-productdesign-mobileux-activity-7407101902775025664-0fi3)
- [goodux.appcues.com — Instagram story swipe and tap protocol](https://goodux.appcues.com/blog/instagrams-story-swipe-and-tap-protocol)
- [timgraf.com — Navigation that thinks: cognitive load in mobile gesture design](https://timgraf.com/ux-design/navigation-that-thinks-reducing-cognitive-load-in-mobile-first-navigation-through-touch-interaction-gesture-design-and-thumb-zone-architecture/)
- [figma.com — Mobile gesture hint design: diegetic UX](https://www.figma.com/community/file/1595421754023199778/mobile-gesture-hint-design-diegetic-ux)
- [dev.to — Predictive-back transitions in Jetpack Compose](https://dev.to/brazzi64/gesture-driven-transitions-in-jetpack-compose-from-slides-to-predictive-back-1p3f)
- [developer.apple.com — Enhance UI animations and transitions (WWDC24)](https://developer.apple.com/videos/play/wwdc2024/10145/)
- [github.com — React Native Screen Transitions v3.8](https://github.com/eds2002/react-native-screen-transitions/pull/124)
- [medium.com — Flip Slip, 3-finger capture, and pinch-to-zoom PoC](https://medium.com/kbtg-life/from-idea-to-reality-behind-flip-slip-3-finger-capture-and-the-pinch-to-zoom-poc-makebykbank-ce09f1baca28)

### Codebase sources
- `AGENTS.md` §4 (Native interaction patterns), §13 (Control quality — haptic levels), §14 (State completeness)
- `Design.md` §Motion (motion patterns, haptic levels), §Native Platform Contract, §Component A (double-tap like), §Component B (long-press quick actions)
- `frontend/src/theme/motionTokens.ts` — `Motion.gestures` (lines 202–217), `Motion.spring` (lines 85–110), `Motion.duration` (lines 51–65)
- `frontend/src/hooks/useHaptic.ts` — haptic grammar (lines 53–107), Android suppression (line 27)
- `frontend/src/utils/hapticPatterns.ts` — compound haptic patterns (lines 16–88)
- `frontend/src/hooks/useSwipeActions.ts` — compound swipe gesture handler (lines 59–210)
- `frontend/src/hooks/useScrollHaptics.ts` — scroll haptic feedback (lines 22–66)
- `frontend/src/components/SwipeableRow.tsx` — canonical swipe-to-reveal row (lines 79–352)
- `frontend/src/components/SwipeableMessage.tsx` — chat message swipe (lines 27–122)
- `frontend/src/components/RefreshIndicator.tsx` — custom refresh indicator (lines 22–88)
- `frontend/src/components/DoubleTapHeart.tsx` — double-tap to like (lines 34–95)
- `frontend/src/components/DoubleTapHandler.tsx` — double-tap gesture detector (lines 21–71)
- `frontend/src/components/ImageViewer.tsx` — pinch-to-zoom + pan + double-tap (lines 43–150)
- `frontend/src/components/product/FullscreenMediaViewer.tsx` — pinch + pan + drag-to-dismiss (lines 85–187)
- `frontend/src/components/BottomSheet.tsx` — drag-to-dismiss bottom sheet (lines 194–283)
- `frontend/src/components/AnimatedPressable.tsx` — press feedback (onPressIn/onPressOut)
- `frontend/src/screens/HomeScreen.tsx` — RefreshControl usage (line 1275), handleRefresh (line 613)
- `frontend/src/screens/InboxScreen.tsx` — SwipeableRow usage (line 470)
- `frontend/src/screens/NotificationsScreen.tsx` — Swipeable usage (line 602)
- `frontend/src/components/SharedTransitionImage.tsx` — stub (436 bytes, unimplemented)
- `frontend/src/components/SharedTransitionView.tsx` — stub (458 bytes, unimplemented)
