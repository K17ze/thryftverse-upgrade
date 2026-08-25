# ThryftVerse Flagship Upgrade — Toasts, Snackbars, Notifications & Transient Messages

**Version:** 1.0
**Benchmark date:** 2026-08
**Scope:** Toast notifications, snackbars, inline banners, success/error toasts, undo bars, push notification previews, in-app notification banners.
**Codebase truth:** `frontend/src/components/Toast.tsx`, `frontend/src/context/ToastContext.tsx`, `frontend/src/components/notifications/InAppNotificationBanner.tsx`, `frontend/src/components/notifications/InAppNotificationCenter.tsx`, `frontend/src/services/inAppNotificationsApi.ts`, `frontend/src/components/settings/SettingsInfoBanner.tsx`, `frontend/src/components/OfflineBanner.tsx`, `frontend/src/components/SyncRetryBanner.tsx`, `frontend/src/components/commerce/detail/CommerceDetailOfflineBanner.tsx`, `frontend/src/components/commerce/detail/CommerceDetailFreshnessBanner.tsx`, `frontend/src/components/coown/CoOwnOfflineBanner.tsx`, `frontend/src/components/coown/CoOwnReconciliationBanner.tsx`.
**Charter references:** AGENTS.md §4 (Native interaction patterns, State coverage, Truthful UI, "Coherent action placement"), §11 (Truthful UI), §13 (Control quality), §14 (State completeness), §17 (Motion and interaction), §27 (2026 Flagship UX psychology principles).

---

## 1. 2026 Competitor Benchmark — Transient Messages in Social-Commerce Apps

The 2026 industry consensus, reinforced by the Material 3 Expressive release (grounded in 46 research studies with 18,000 participants — https://design.google/library/expressive-material-design-google-research) and the WCAG 2.2 time-limits guideline (2.2.1), is that "toast" is not one component but **four different jobs pretending to be one**: inline feedback, ambient status, transient confirmation, and blocking interruption (https://www.72technologies.com/blog/toast-notifications-async-feedback-pattern). The best social-commerce apps in 2026 have internalised this split and rarely use a single generic toast for everything.

### Instagram (Meta, 2026)

Instagram's transient feedback is deliberately quiet and non-blocking. A like, save, or follow produces an immediate inline state change (icon fill + spring scale) rather than a toast — the feedback *is* the control. When Instagram does surface a transient message, it is a small bottom-anchored snackbar with a single text action ("Undo", "View") that auto-dismisses in roughly 4–6 seconds. The Instagram Instants case study (https://medium.com/@solaskarsonal/improving-trust-and-feedback-in-instagram-instants-c4285cf39d4d) surfaced a real 2026 lesson: when the undo window is only "a few seconds" and the snackbar is hard to notice, users lose trust in the feature. The fix Instagram iterated toward was a clearer recovery path, visible feedback at every important step, and matching the interaction model people already know. The takeaway for ThryftVerse: transient feedback must be *visible* and *recoverable*, not just present.

### Pinterest (2026)

Pinterest treats transient feedback as part of its "almost invisible chrome" philosophy. Save actions produce an inline fill + a brief spring; there is no separate toast. Board creation and board-add actions use a small bottom snackbar with a "See it" action. Pinterest's strongest transient-message pattern is the **non-blocking principle**: the user never has to stop scrolling to dismiss a message. Errors on pin load are handled inline with a restrained placeholder, not a global toast. This aligns with the 2026 guidance from Eleken (https://www.eleken.co/blog-posts/notification-ux): match urgency to the right pattern — low-urgency feedback gets a toast/snackbar, medium-urgency gets a banner/inline, high-urgency gets a modal.

### eBay (2026)

eBay's MIND Patterns system (https://ebay.gitbook.io/mindpatterns/messaging/toast-dialog) documents a rigorous accessibility contract for toast dialogs: non-modal, must not steal or trap keyboard focus, must be placed in DOM order so the next tab/reading move is logical, and the screen reader must announce the title and contents. eBay's toast dialog is the canonical reference for accessible transient messages in commerce. The lesson for ThryftVerse: a toast that is not announced to VoiceOver/TalkBack is invisible to a segment of users, and a toast that traps focus breaks the interaction model.

### Snapchat (2026)

Snapchat's transient feedback is gesture-native and ephemeral by design. Send confirmations are a brief bottom snackbar with an undo action; the snackbar is swipe-dismissable. Snapchat's pattern reinforces the 2026 best practice that **swipe-to-dismiss is the expected mobile interaction** for transient overlays (https://github.com/emekauja/react-native-toast-message, https://registry.npmjs.org/react-native-toastcraft). The motion is spring-in, fade-out — mirroring Apple's system banner pattern (https://github.com/synonymdev/bitkit-ios/commit/7256636969adda92191ee0f1f499221f9e64edc6).

### Depop / Vinted (2026)

Depop and Vinted use transient messages sparingly in commerce flows. "Item saved", "Offer sent", "Listing published" appear as brief bottom snackbars with optional "View" actions. Errors (payment failure, listing publish failure) are *not* toasted — they get inline banners or modal confirmation because they block progress. This matches the 137Foundry 2026 guidance (https://137foundry.com/articles/notification-toast-system-that-doesnt-overwhelm-users): confirmations 3–4s auto-dismiss; warnings and errors no auto-dismiss, require explicit close; anything with an undo action at least 6–8 seconds.

### Cross-cutting 2026 principles from competitors

1. **Non-blocking principle:** transient messages never steal focus or trap interaction (eBay MIND, Eleken, AnnounceKit https://announcekit.app/blog/in-app-banners-vs-modals-vs-tooltips/).
2. **Auto-dismiss principle:** duration is semantic, not flat. Success = 3–4s, info = 4–6s, warning = 6–10s or persistent, error = persistent until acknowledged, undo = 6–10s (https://www.humanstandards.org/interaction-patterns/notifications-feedback/, https://137foundry.com/articles/notification-toast-system-that-doesnt-overwhelm-users).
3. **Action-within-message principle:** a snackbar may carry one action ("Undo", "View", "Retry"). Two or more actions turns a quick decision into option evaluation (IBM Carbon, Eleken https://www.eleken.co/blog-posts/notification-ux).
4. **Severity hierarchy:** info / success / warning / error map to consistent colour + icon, system-wide, not per-team (137Foundry, Paste/Twilio https://paste.twilio.design/patterns/notifications-and-feedback).
5. **Motion as transience:** spring-in entrance (12pt rise, opacity fade, 0.98 scale), quick ease-out exit. Exit is shorter than entrance so the slot frees up for the next message (https://github.com/synonymdev/bitkit-ios/commit/7256636969adda92191ee0f1f499221f9e64edc6, https://www.techinterview.org/post/3233475200/build-notification-toast-system/).
6. **One global host, not per-screen toasts:** the single-host architecture is the 2026 standard for React Native (https://vp0.com/blogs/native-toast-notification-modals, https://rorklab.net/en/articles/rork-dev/rork-toast-queue-accessibility-safe-area-design). Per-screen toasts duplicate, vanish on navigation, and re-render heavy lists.
7. **Queue, don't stack chaotically:** feed messages through a queue so two quick actions do not overlap. Max 2 visible on mobile (https://justfigma.com/designing-toasts-and-snackbars-in-figma-patterns-and-handoff/).
8. **Safe-area and keyboard awareness:** a top toast clears the notch/Dynamic Island; a bottom toast clears the home indicator and the keyboard (https://vp0.com/blogs/native-toast-notification-modals).

---

## 2. Psychology & Principles

### Transient feedback as confirmation

Users form snap judgments about an app's quality within seconds (AGENTS.md §27.1). When an action produces no feedback, the user's brain reads it as "did nothing happen?" — a trust deficit. Transient messages exist to close that loop instantly: "Saved", "Sent", "Copied", "Published". The behavioral level of emotional design (AGENTS.md §27.1, Don Norman) is driven by gesture responsiveness and state predictability — a toast that arrives within 100ms of the action and disappears predictably is a signal of technical competence.

### The non-blocking principle

A transient message must never block the user's primary flow. It overlays content; it does not interrupt it. This is the core distinction between a toast/snackbar and a modal/alert (https://announcekit.app/blog/in-app-banners-vs-modals-vs-tooltips/). If the user must stop to read and dismiss, it is not a toast — it is a modal, and modals should be used almost never (https://www.72technologies.com/blog/toast-notifications-async-feedback-pattern). ThryftVerse's current overuse of `Alert.alert` (82 occurrences across 40+ screens — see §3) violates this principle by turning confirmations and errors into blocking modal interruptions.

### The auto-dismiss principle

A flat 3.5-second timer (the current ThryftVerse default in `ToastContext.tsx:46`) is the most common mistake in notification design (https://137foundry.com/articles/notification-toast-system-that-doesnt-overwhelm-users). Duration must be semantic:

| Category | Duration | Rationale |
|----------|----------|-----------|
| Success / confirmation | 3–4s | Low stakes, safe to auto-dismiss quickly |
| Info | 4–6s | Slightly more reading time |
| Warning | 6–10s or persistent | Higher stakes, user may need to act |
| Error | Persistent until acknowledged | Must not vanish before the user reads it |
| Undo | 6–10s | Reader must read message + locate action + tap |

The WCAG 2.2 time-limits guideline (2.2.1) is unambiguous: if content disappears on a timer, users need a way to extend, dismiss on their terms, or not be at the mercy of a countdown (https://www.72technologies.com/blog/toast-notifications-async-feedback-pattern). A toast that auto-dismisses after 3.5s fails screen-reader users, users with cognitive disabilities, and users who glanced away.

### The action-within-message principle (undo)

Gmail's "Undo Send" is the gold standard for 2026 (https://www.humanstandards.org/interaction-patterns/notifications-feedback/, https://www.eleken.co/blog-posts/snackbar-ui). Instead of interrupting users upfront with a confirmation dialog, the system allows the action and briefly offers an Undo option afterward through a snackbar. This is the "action first, confirm after" pattern: the action executes immediately (or appears to), a toast appears with "Undo", the window lasts 5–10 seconds, if undo is clicked the action reverts, if the window expires the action becomes permanent. This preserves flow while giving users a safety net. For ThryftVerse, this applies directly to: delete listing, archive conversation, remove item from collection, block user, leave group — all currently handled with blocking `Alert.alert` confirmations.

### Severity hierarchy (info / success / warning / error)

Colour and iconography must map to severity consistently across the whole product, not per-screen (https://137foundry.com/articles/notification-toast-system-that-doesnt-overwhelm-users). The 2026 standard:

- **Info** — neutral/brand accent, informational icon (`information-circle`). Non-urgent.
- **Success** — green/success accent, `checkmark-circle`. Confirmation only.
- **Warning** — amber/warning accent, `warning`. Caution, may require action.
- **Error** — red/danger accent, `alert-circle`. Something failed, action needed.

The current ThryftVerse toast system (`Toast.tsx:16-22`) defines only three types (`success`, `error`, `info`) and hardcodes the info accent to `#d7b98f` — a warm brand-gold colour that is **not in the token system** (comment at `Toast.tsx:12-14` admits this). There is no `warning` type. This is a severity-hierarchy gap.

### Honest feedback (AGENTS.md §11)

Every transient message must be truthful. AGENTS.md §11 prohibits "generic explanation toasts" for fake/unsupported actions. A success toast must mean the action genuinely succeeded server-side, not that local state changed. An error toast must use user-safe language, not raw backend exceptions. The current codebase mostly follows this, but the toast system's lack of loading/promise states means a "success" toast can fire before the server confirms — a truthfulness risk.

### Motion as transience

Motion communicates that a message is temporary. The 2026 flagship pattern (https://github.com/synonymdev/bitkit-ios/commit/7256636969adda92191ee0f1f499221f9e64edc6) is **asymmetric motion**: spring-in entrance (12pt rise, opacity fade, 0.98 scale, snappy spring), quick ease-out exit. The entrance is longer than the exit so the slot frees up for the next message. Reduced-motion users get instant or simple-fade fallbacks (AGENTS.md §17). The current ThryftVerse toast (`Toast.tsx:36-57`) uses `withTiming` with `Easing.out(Easing.quad)` for entrance and a flat timing exit — functional but not spring-based, and not in the flagship motion family defined in `theme/motionTokens.ts`.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 Two parallel transient-message systems with no unification

The codebase has **two independent transient-overlay systems** that do not know about each other:

1. **Toast system** — `frontend/src/context/ToastContext.tsx` (56 lines) + `frontend/src/components/Toast.tsx` (132 lines). A React Context provider with `useToast().show(message, type)`. Three types: `success`, `error`, `info`. Mounted at `App.tsx:486` (`ToastProvider`) and `App.tsx:526` (`ToastContainer`). Used by ~50+ screens (grep found 100+ matches for `useToast`/`showToast`).

2. **In-App Notification system** — `frontend/src/services/inAppNotificationsApi.ts` (269 lines) + `frontend/src/components/notifications/InAppNotificationCenter.tsx` (76 lines) + `frontend/src/components/notifications/InAppNotificationBanner.tsx` (355 lines). A global in-memory queue with `showNotification(input)`. Eight types: `success`, `warning`, `error`, `info`, `offer`, `message`, `listing`, `order`. Priority-based ordering, max 3 concurrent, auto-dismiss per type, swipe-up-to-dismiss, progress bar, action button. Mounted at `AppNavigator.tsx:354`.

These two systems overlap in responsibility but have completely different APIs, geometries, motion languages, and feature sets. The Toast system is simpler but less capable. The In-App Notification system is more advanced (queue, priority, swipe, progress bar, action button) but is only used for demo notifications (`NOTIFICATION_DEMO_MODE = __DEV__` at `inAppNotificationsApi.ts:21`) and is not wired to real backend events. **No screen uses both.** This is the root architectural defect: two toast systems, neither complete.

### 3.2 Alert.alert overuse — 82 occurrences across 40+ screens

`Alert.alert` is a blocking native modal that interrupts the user's flow. The 2026 consensus is that modals should be used "almost never" for feedback (https://www.72technologies.com/blog/toast-notifications-async-feedback-pattern). Yet ThryftVerse uses `Alert.alert` **82 times** across at least 40 screens, including:

- `ManageListingScreen.tsx:213,238,283` — delete listing, mark as sold, more actions (should be a bottom sheet, per `creator/studio/PageMenu.tsx:5` which already notes "Replaces the old Alert.alert-based page menu")
- `OutfitBuilderScreen.tsx:330,354,361,377` — "Need more items", "Outfit Saved", "No items", "Clear Outfit?" (should be inline banners or snackbars with undo)
- `OrderDetailScreen.tsx:1286,1305,1456,1791` — cancel order, confirm receipt (should be bottom sheet confirmations, not blocking alerts)
- `ChatScreen`/`GroupChatScreen`/`ConversationInfoScreen` — delete message, remove agent, leave group (should be snackbar with undo for delete, bottom sheet for destructive)
- `EditProfileScreen.tsx:118`, `CreateLookScreen.tsx:77`, `AddressFormScreen.tsx:272,396` — form validation/save errors (should be inline error banners)
- `RuntimeSmokeTestScreen.tsx:141,149,157,164` — dev tool (acceptable, but still uses blocking alerts)

Many of these are **confirmation dialogs for destructive actions** that should use the "action first, undo after" snackbar pattern (Gmail pattern) or a designed bottom sheet (`creator/studio/PageMenu.tsx` already demonstrates the correct replacement). The `ContextMenu.tsx:4` component comment explicitly states it "replaces Alert.alert and the" legacy pattern — but the migration is incomplete.

### 3.3 Missing undo functionality

The only undo implementation in the codebase is **ChatScreen's message-delete undo banner** (`ChatScreen.tsx:336-359` styles, `ChatScreen.tsx:1940-1957` render). It is a custom inline banner with `undoBanner`/`undoBannerText`/`undoBannerAction` styles — not a reusable component, not a snackbar, and not part of either toast system. There is no undo for: delete listing, archive conversation, remove item from collection, block user, delete look, delete quick reply, delete bot, delete address, delete payment method. Every one of these uses a blocking `Alert.alert` confirmation instead. This is a P1 flagship defect: the Gmail undo pattern is the 2026 standard for frequent, recoverable destructive actions (https://www.humanstandards.org/interaction-patterns/notifications-feedback/, https://www.eleken.co/blog-posts/snackbar-ui).

### 3.4 Inconsistent toast styling — hardcoded colours outside the token system

`Toast.tsx:14` defines `INFO_ACCENT = '#d7b98f'` — a hardcoded warm gold that is not in `ThemeColors`, `LIGHT_COLORS`, or `DARK_COLORS`. The comment at `Toast.tsx:12-13` admits: "Info toast uses a warm brand-gold accent (#d7b98f) — a ThryftVerse signature color not yet in the token system." This violates Design.md's runtime-truth rule ("Never hardcode proposed tokens in screens") and the migration rule ("Add them to ThemeColors, LIGHT_COLORS and DARK_COLORS in one focused token migration, then consume through useAppTheme().colors").

Additionally, `Toast.tsx:108` hardcodes the toast background to `#191714` (always dark) and `Toast.tsx:125` hardcodes text to `#f3ede3` (warm off-white) — regardless of theme. The comment says this is "intentional design for transient overlay" but it means **dark mode and light mode toasts look identical**, which may be acceptable for a top overlay but is inconsistent with the In-App Notification system which uses `colors.surfaceElevated` (`InAppNotificationBanner.tsx:190`) and adapts to theme. The two systems have fundamentally different visual languages.

### 3.5 Missing toast queue — only "slice(-2)" truncation

`ToastContext.tsx:40` implements "queueing" as `setToasts(prev => [...prev.slice(-2), { id, message, type }])` — it silently drops all but the last 2 toasts and appends the new one. This is not a queue; it is a destructive truncation. If 5 actions fire in rapid succession, 3 messages are silently lost with no promotion logic. Compare to `inAppNotificationsApi.ts:165-173` which has a proper `promotePending()` loop with `MAX_ACTIVE = 3` and priority sorting. The Toast system has no priority, no pending queue, no promotion.

### 3.6 No swipe-to-dismiss on toasts

The Toast system (`Toast.tsx:68-76`) only supports a close button (`AnimatedPressable` with `close` icon). There is no swipe gesture. The In-App Notification system (`InAppNotificationBanner.tsx:144-161`) has a proper `Gesture.Pan()` with `activeOffsetY(-12)`, upward-swipe dismiss, velocity threshold, and spring-back. The 2026 standard is swipe-to-dismiss on all transient overlays (https://github.com/emekauja/react-native-toast-message, https://registry.npmjs.org/react-native-toastcraft, https://vp0.com/blogs/native-toast-notification-modals). The Toast system is behind.

### 3.7 No progress bar on toasts

The In-App Notification system has a progress bar (`InAppNotificationBanner.tsx:263-273`) that shrinks from 100% → 0% over the duration, giving the user a visual sense of how long they have. The Toast system has no progress indicator. The 2026 best practice (Discord pattern, https://www.humanstandards.org/interaction-patterns/notifications-feedback/) is to show a countdown or timer for undo-bearing messages.

### 3.8 Inline banners — at least 8 separate implementations

The codebase has **at least 8 distinct inline banner implementations** with no shared primitive:

1. `SettingsInfoBanner.tsx` — info/warning/error variant, `colors.surfaceAlt` background, 18pt icon, caption text. Used in Verification, PushNotifications, NotificationPreferences, HelpSupport, TwoFactorSetup screens.
2. `OfflineBanner.tsx` — default + compact variants, `colors.warning` tint, retry button, Reanimated opacity. Used for global offline state.
3. `SyncRetryBanner.tsx` — message + retry button, `colors.surfaceAlt` background, telemetry tracking. Used in ItemDetail.
4. `CommerceDetailOfflineBanner.tsx` — warning tint, two-line (title + subtitle), no retry. Used in ItemDetail, AuctionDetail, AssetDetail.
5. `CommerceDetailFreshnessBanner.tsx` — three states (refreshing/stale/failed), each with different icon + colour. Used in ItemDetail, AuctionDetail, AssetDetail.
6. `CoOwnOfflineBanner.tsx` — delegates to the commerce pattern but is a separate import.
7. `CoOwnReconciliationBanner.tsx` — warning tint, title + subtitle + "Contact" action button.
8. `InAppNotificationBanner.tsx` — the most advanced: 8 types, accent icon container, title + body, action button, dismiss, progress bar, swipe gesture.

Plus **screen-local inline banners** that are not reusable components at all:
- `AIPoweredListingScreen.tsx:1128-1164` — local `ErrorBanner` function component with retry + dismiss.
- `AIPhotoEnhancementScreen.tsx:763-771` — another local `ErrorBanner` function (duplicated pattern).
- `CreateGroupChatScreen.tsx:384,574` — `createErrorBanner` and `searchErrorBanner` styles, inline `View` + `Ionicons` + `Text` + `Pressable`.
- `SellerFulfilmentScreen.tsx:467,532,673` — `escrowBanner`, `labelErrorBanner`, `warningBanner` styles, all inline.
- `LooksTab.tsx:297` — `refreshErrorBanner` style, inline.
- `KYCVerificationScreen.tsx:297` — `privacyBanner` style, inline.
- `ChatScreen.tsx:336` — `undoBanner` style, inline.
- `HomeScreen.tsx:1224` — `feedStatusBanner` style, inline.

This is at least **15 inline banner implementations** if you count the screen-local ones. They have inconsistent: background colours (`colors.surfaceAlt`, `colors.warning + '12'`, `colors.danger + '10'`, `#191714`), border treatments (hairline, 1px, none), icon sizes (13pt, 14pt, 15pt, 16pt, 18pt, 20pt), text sizes (`Type.caption`, `Type.meta`, `Type.bodyEmphasis`), and action button styles. This violates AGENTS.md §4's "If three or more screens exhibit the same visual defect, inspect and correct the shared primitive first."

### 3.9 Missing success/error feedback on key actions

Several key actions produce no transient feedback at all:
- `ManageListingScreen.tsx:238` — "Mark as Sold" uses `Alert.alert` then navigates, but no success toast/snackbar after confirmation.
- `OutfitBuilderScreen.tsx:354` — "Outfit Saved" uses `Alert.alert` with an OK button — should be a success toast that auto-dismisses.
- `AddressFormScreen.tsx:272,396` — save/validation errors use `Alert.alert` — should be inline form error banners.
- `EditProfileScreen.tsx:118` — save error uses `Alert.alert` — should be inline banner or error toast.

### 3.10 No warning toast type

The Toast system (`ToastContext.tsx:4`) defines `ToastType = 'success' | 'error' | 'info'`. There is no `warning` type. The In-App Notification system has `warning` (`inAppNotificationsApi.ts:29`) but it is not exposed through the Toast API that most screens use. This means screens that need a warning-level transient message must either downgrade to `info` or upgrade to `error`, distorting the severity hierarchy.

### 3.11 Toast duration mismatch

`ToastContext.tsx:46` sets a 3500ms auto-dismiss timer. `Toast.tsx:43-45` sets a separate 3200ms timer inside `ToastItem`. These two timers race — the 3200ms timer fires first and calls `handleDismiss` (which animates out then calls `dismiss`), then the 3500ms timer fires and calls `dismiss` again on an already-removed id. This is a benign double-dismiss but indicates the two layers are not coordinated. The In-App Notification system has a single `scheduleAutoDismiss` in the service layer (`inAppNotificationsApi.ts:153-163`).

### 3.12 No haptic feedback on toasts

The Toast system has no haptic feedback. The In-App Notification system has haptics on dismiss and action (`InAppNotificationBanner.tsx:174,179`). AGENTS.md §17 and §27.9 require haptic grammar: "haptic light for navigation/selection", "haptic success for completed purchase/win/publish". A success toast should produce a success haptic; an error toast should produce an error haptic.

---

## 4. Micro Improvements

1. **Add `warning` type to the Toast system** — extend `ToastType` to `'success' | 'error' | 'warning' | 'info'` in `ToastContext.tsx:4` and add the config in `Toast.tsx:16-22` using `colors.warning`.
2. **Migrate `INFO_ACCENT` into the token system** — add a `infoAccent` key to `ThemeColors`/`LIGHT_COLORS`/`DARK_COLORS` and consume via `useAppTheme().colors`, removing the hardcoded `#d7b98f` at `Toast.tsx:14`.
3. **Fix the dual-timer race** — remove the `setTimeout` in `ToastItem` (`Toast.tsx:43-45`) and rely solely on the `ToastContext.tsx:46` timer, or vice versa. Single source of truth for duration.
4. **Add haptic feedback** — trigger `HapticType.LIGHT` on toast dismiss, `HapticType.SUCCESS` on success toast appearance, `HapticType.ERROR` on error toast appearance.
5. **Add swipe-to-dismiss to the Toast system** — port the `Gesture.Pan()` pattern from `InAppNotificationBanner.tsx:144-161` into `ToastItem`.
6. **Add a progress bar to toasts** — port the `progressStyle` pattern from `InAppNotificationBanner.tsx:168-171`.
7. **Replace screen-local `ErrorBanner` functions with a shared primitive** — `AIPoweredListingScreen.tsx:1128-1164` and `AIPhotoEnhancementScreen.tsx:763-771` have duplicated `ErrorBanner` components that should use a single `InlineBanner` component.
8. **Unify `SettingsInfoBanner` and `OfflineBanner` visual language** — both are inline banners but use different icon sizes (18pt vs 13–15pt), different backgrounds (`surfaceAlt` vs `warning + '12'`), and different border treatments.

---

## 5. Macro Improvements

### 5.1 Unified toast system — one ToastProvider, one useToast hook, one queue

Consolidate the Toast system and the In-App Notification system into **one canonical transient-message architecture**:

- **One `ToastProvider`** at the app root (`App.tsx`), replacing both the current `ToastProvider` and the `InAppNotificationCenter`.
- **One `useToast()` hook** with an API that subsumes both `show(message, type)` and `showNotification(input)`:
  ```ts
  useToast().show({
    type: 'success' | 'error' | 'warning' | 'info',
    message: string,
    action?: { label: string; onPress: () => void },
    duration?: number, // 0 = sticky
    priority?: 'low' | 'normal' | 'high',
  })
  ```
- **One queue** with priority-based ordering, `MAX_ACTIVE = 2` on mobile (per https://justfigma.com/designing-toasts-and-snackbars-in-figma-patterns-and-handoff/), pending promotion, and per-type default durations (success 4000, info 4000, warning 6000, error 0/sticky, undo 8000).
- **Auto-dismiss with swipe-to-dismiss** — Reanimated `Gesture.Pan()` with upward-swipe dismiss, velocity threshold, spring-back. Pause timer on gesture start.
- **Progress bar** for all auto-dismissing toasts (not just undo).
- **Safe-area aware** — top toasts clear `insets.top`; bottom toasts clear `insets.bottom` and keyboard.
- **Accessibility** — `AccessibilityInfo.announceForAccessibility` on show; `accessibilityLiveRegion="polite"`; extended duration for screen-reader users (per `react-native-toastcraft` pattern).

The In-App Notification system's advanced features (queue, priority, swipe, progress bar, action button) become the baseline for the unified toast system. The simpler `useToast().show(message, type)` API is preserved as a convenience overload for the majority of call sites that only need a simple message.

### 5.2 Snackbar system (with action button)

A **snackbar** is a toast with a single text action button ("Undo", "View", "Retry"). The unified toast system should support `action` natively. The visual distinction: a snackbar is bottom-anchored (not top), uses `colors.surfaceElevated` background (not the always-dark `#191714`), and the action button is a text button in the accent colour with a 44pt hit target. This is the Gmail/Android Material 3 pattern (https://www.eleken.co/blog-posts/snackbar-ui, https://developer.android.com/develop/ui/compose/designsystems/material3).

### 5.3 Inline banner system — one primitive, four severities

Replace all 8+ inline banner components and 7+ screen-local inline banners with **one `InlineBanner` component**:

```tsx
<InlineBanner
  severity="info" | "success" | "warning" | "error"
  icon?: IoniconsName
  title?: string
  message: string
  action?: { label: string; onPress: () => void }
  onDismiss?: () => void
  variant?: "default" | "compact"
/>
```

- **Severity → colour mapping:** info = `colors.brand`/`colors.textMuted`, success = `colors.success`, warning = `colors.warning`, error = `colors.danger`. Background = `${accent}12` (8% tint), border = `${accent}30` (19% tint), hairline width.
- **Icon:** 16–18pt, severity-coloured, in a 28pt rounded-square container with `${accent}18` tint (port from `InAppNotificationBanner.tsx:208`).
- **Title:** `Type.bodyEmphasis` (15/21/600), severity-coloured, optional.
- **Message:** `Type.captionElevated` (13/18/400), `colors.textSecondary`, max 2 lines.
- **Action:** text button, `Type.meta` semibold, accent-coloured, 44pt hit target.
- **Dismiss:** optional `close` icon, 44pt hit target.
- **Variant:** `compact` = pill-style for inline use (port from `OfflineBanner.tsx:64-101`).

This single primitive replaces: `SettingsInfoBanner`, `OfflineBanner`, `SyncRetryBanner`, `CommerceDetailOfflineBanner`, `CommerceDetailFreshnessBanner`, `CoOwnOfflineBanner`, `CoOwnReconciliationBanner`, and all screen-local `ErrorBanner`/`warningBanner`/`escrowBanner`/`privacyBanner`/`undoBanner`/`feedStatusBanner`/`refreshErrorBanner`/`createErrorBanner`/`searchErrorBanner`/`labelErrorBanner` implementations.

### 5.4 Severity hierarchy

Adopt a single severity hierarchy across all transient message types:

| Severity | Colour token | Icon | Duration | Persistence |
|----------|-------------|------|----------|-------------|
| Info | `colors.brand` or `colors.textMuted` | `information-circle` | 4s | Auto-dismiss |
| Success | `colors.success` | `checkmark-circle` | 3–4s | Auto-dismiss |
| Warning | `colors.warning` | `warning` | 6s | Auto-dismiss, action optional |
| Error | `colors.danger` | `alert-circle` | 0 (sticky) | Manual dismiss only |

This hierarchy applies to toasts, snackbars, and inline banners identically. No transient message may use a colour outside this mapping.

### 5.5 Motion language — slide/fade spring

Adopt the asymmetric spring-in, fade-out motion pattern as the canonical transient-message motion:

- **Entrance:** 12pt rise + opacity 0→1 + scale 0.98→1, `Motion.spring.entrance` (damping 22, stiffness 180, mass 1.0 per `theme/motionTokens.ts`), duration ~250ms.
- **Exit:** opacity 1→0 + translateY 0→-12, `Motion.duration.fast` (150ms), `Easing.in(Easing.cubic)`.
- **Swipe-dismiss:** follow finger with `translateY` + opacity proportional to distance, spring-back if below threshold, quick fade-out if above.
- **Reduced motion:** instant appearance/disappearance, no spring, no swipe gesture (tap dismiss only).
- **Stack reposition:** `LinearTransition` so remaining toasts slide smoothly when one is dismissed (per https://rorklab.net/en/articles/rork-dev/rork-toast-queue-accessibility-safe-area-design).

This replaces the current `Toast.tsx:40-41` flat `withTiming` + `Easing.out(Easing.quad)` and aligns with the `theme/motionTokens.ts` spring configs.

### 5.6 Notification preview system

For push-notification previews (when a push arrives while the app is open), use the In-App Notification Banner pattern (`InAppNotificationBanner.tsx`) as the canonical preview: top-anchored, icon container + title + body + optional action, swipe-up-to-dismiss, progress bar, safe-area aware. This already exists — it just needs to be wired to real push events (currently `NOTIFICATION_DEMO_MODE = __DEV__`). The push preview should:
- Appear for 6s (message/offer/listing) or be sticky (order/error).
- Include the sender avatar as the large icon when available.
- Tapping the action navigates to the deep-link target.
- Swiping up dismisses and marks as read.

### 5.7 Alert.alert migration

Systematically replace `Alert.alert` usages with the appropriate non-blocking pattern:

| Current `Alert.alert` use | Replacement |
|---------------------------|-------------|
| Simple confirmation ("Outfit Saved", "Item deleted") | Success toast (auto-dismiss 3–4s) |
| Confirmation with undo ("Delete message?") | Snackbar with Undo action (8s, swipe-dismiss) |
| Destructive confirmation ("Delete listing?", "Cancel order?") | Bottom sheet (`ContextMenu` pattern, per `creator/studio/PageMenu.tsx`) |
| Form validation error | Inline error banner (`InlineBanner` severity=error) |
| Informational ("Could not save draft") | Error toast or inline error banner |
| Dev tool (RuntimeSmokeTest) | Acceptable as `Alert.alert` (dev-only) |

This eliminates the 82 `Alert.alert` occurrences and brings the app in line with the 2026 non-blocking principle.

---

## 6. Flagship Acceptance Criteria

A transient-message system is flagship when:

1. **One toast system** — a single `ToastProvider` at the root, a single `useToast()` hook, a single queue. No parallel systems.
2. **Severity hierarchy** — info / success / warning / error with consistent colour + icon mapping across toasts, snackbars, and inline banners. No hardcoded accent colours outside the token system.
3. **Auto-dismiss with swipe** — semantic durations per severity; swipe-up-to-dismiss with spring-back; progress bar for timed toasts; pause on gesture.
4. **Action button support** — snackbars support one text action ("Undo", "View", "Retry") with a 44pt hit target.
5. **Non-blocking** — no transient message steals focus or traps interaction. `Alert.alert` is reserved for dev tools and true blocking emergencies only.
6. **Motion language** — asymmetric spring-in entrance, quick ease-out exit, `LinearTransition` stack reposition, reduced-motion fallback.
7. **Honest feedback** — success toasts fire only after server confirmation; error toasts use user-safe language; no fabricated success.
8. **Queue, not truncation** — priority-based ordering, max 2 visible on mobile, pending promotion, no silent message loss.
9. **Safe-area and keyboard aware** — top toasts clear the notch/Dynamic Island; bottom toasts clear the home indicator and keyboard.
10. **Accessible** — `AccessibilityInfo.announceForAccessibility` on show; `accessibilityLiveRegion="polite"`; extended duration for screen-reader users; WCAG 2.2 time-limits compliance.
11. **One inline banner primitive** — a single `InlineBanner` component replaces all 8+ banner components and 7+ screen-local banners.
12. **Undo on recoverable destructive actions** — delete listing, archive conversation, remove from collection, block user all offer undo via snackbar instead of blocking `Alert.alert`.

---

## 7. Priority & Sequencing

| Phase | Work | Priority | Effort |
|-------|------|----------|--------|
| 1 | Unify Toast + In-App Notification into one provider/hook/queue | P0 | Medium |
| 1 | Add `warning` type; migrate `INFO_ACCENT` into tokens | P0 | Small |
| 1 | Fix dual-timer race; single duration source of truth | P0 | Small |
| 2 | Add swipe-to-dismiss + progress bar to unified toast | P1 | Medium |
| 2 | Add action button support (snackbar mode) | P1 | Medium |
| 2 | Add haptic grammar (success/error/warning) | P1 | Small |
| 2 | Adopt spring-in/fade-out motion from `motionTokens.ts` | P1 | Small |
| 3 | Build `InlineBanner` primitive; migrate 8 banner components | P1 | Medium |
| 3 | Migrate screen-local inline banners to `InlineBanner` | P2 | Medium |
| 4 | Add undo snackbar for delete listing, archive conversation, remove from collection, block user | P1 | Medium |
| 4 | Migrate `Alert.alert` confirmations → toast/snackbar/bottom sheet | P1 | Large |
| 5 | Wire push notification previews to real push events | P2 | Medium |
| 5 | Extended duration for screen-reader users | P2 | Small |

---

## 8. Token-Level Spec Table

### Toast (top-anchored, auto-dismissing)

| Property | Info | Success | Warning | Error |
|----------|------|---------|---------|-------|
| **Geometry** | full-width minus 32px (16px L/R rail), min height 52px, `Radius.xl` (16px) | same | same | same |
| **Background** | `colors.surfaceElevated` | `colors.surfaceElevated` | `colors.surfaceElevated` | `colors.surfaceElevated` |
| **Accent** | `colors.brand` left border 4px + icon | `colors.success` | `colors.warning` | `colors.danger` |
| **Icon** | `information-circle`, 20pt, accent colour | `checkmark-circle`, 20pt | `warning`, 20pt | `alert-circle`, 20pt |
| **Typography** | `Type.body` (14/20/400), `colors.textPrimary`, max 2 lines | same | same | same |
| **Animation** | spring-in (12pt rise + fade + 0.98 scale, `Motion.spring.entrance`), fade-out (`Motion.duration.fast`) | same | same | same |
| **Duration** | 4000ms auto-dismiss | 3000ms auto-dismiss | 6000ms auto-dismiss | 0 (sticky, manual dismiss) |
| **Position** | top, `insets.top + 12px`, 16px L/R rail | same | same | same |
| **Haptic** | none | `HapticType.SUCCESS` on appear | `HapticType.WARNING` on appear | `HapticType.ERROR` on appear |
| **Swipe** | swipe-up-to-dismiss, velocity > 500 or distance > 40px | same | same | same |
| **Progress bar** | 1.5px, accent colour, 50% opacity, scaleX 1→0 over duration | same | same | none (sticky) |
| **Close button** | `close` icon 16pt, `colors.textSecondary`, 44pt hit target | same | same | same |
| **Max visible** | 2 (mobile), 8px gap between | same | same | same |
| **Accessibility** | `accessibilityLiveRegion="polite"`, `AccessibilityInfo.announceForAccessibility` on show | same | same | `accessibilityLiveRegion="assertive"` |

### Snackbar (bottom-anchored, with action)

| Property | Value |
|----------|-------|
| **Geometry** | full-width minus 32px, min height 52px, `Radius.xl` (16px) |
| **Background** | `colors.surfaceElevated` |
| **Accent** | `colors.brand` for action button; severity accent for icon (if any) |
| **Icon** | optional, 20pt, severity colour |
| **Typography** | message: `Type.body` (14/20/400), `colors.textPrimary`; action: `Type.bodyEmphasis` (15/21/600), `colors.brand` |
| **Animation** | spring-in from bottom (12pt rise + fade), fade-out (`Motion.duration.fast`) |
| **Duration** | 8000ms (undo), 6000ms (view/retry), auto-dismiss |
| **Position** | bottom, `insets.bottom + 16px` (above keyboard if open), 16px L/R rail |
| **Haptic** | `HapticType.LIGHT` on action press |
| **Action** | one text button, 44pt hit target, `colors.brand` text, right-aligned |
| **Swipe** | swipe-down-to-dismiss (bottom-anchored), velocity > 500 or distance > 40px |
| **Progress bar** | 1.5px, `colors.brand`, 50% opacity, scaleX 1→0 over duration |

### Undo bar (snackbar variant)

| Property | Value |
|----------|-------|
| **Geometry** | full-width, min height 48px, `Radius.none` (bottom-anchored bar) or `Radius.xl` (floating) |
| **Background** | `colors.surfaceElevated` or `colors.brand` (high-contrast variant) |
| **Typography** | message: `Type.captionElevated` (13/18/400), `colors.textSecondary`; action: `Type.bodyEmphasis`, `colors.brand` or `colors.textInverse` |
| **Animation** | slide-up from bottom (`Motion.duration.normal`), slide-down on dismiss |
| **Duration** | 8000ms (per Gmail/2026 standard), progress bar visible |
| **Position** | bottom, above tab bar/dock, `insets.bottom` aware |
| **Action** | "Undo" text button, 44pt hit target, right-aligned |
| **Haptic** | `HapticType.LIGHT` on undo press |
| **Replaces** | `ChatScreen.tsx:336-359` custom `undoBanner` styles |

### Inline banner (info / success / warning / error)

| Property | Info | Success | Warning | Error |
|----------|------|---------|---------|-------|
| **Geometry** | full-width minus 32px (16px L/R), `Radius.md` (8px) or `Radius.lg` (12px), min height 44px | same | same | same |
| **Background** | `${colors.brand}12` (8% tint) | `${colors.success}12` | `${colors.warning}12` | `${colors.danger}12` |
| **Border** | `${colors.brand}30` (19% tint), hairline | `${colors.success}30` | `${colors.warning}30` | `${colors.danger}30` |
| **Icon** | `information-circle-outline`, 16–18pt, accent colour | `checkmark-circle`, 16–18pt | `warning`, 16–18pt | `alert-circle`, 16–18pt |
| **Icon container** | 28pt rounded-square (`Radius.md`), `${accent}18` tint | same | same | same |
| **Title** | `Type.bodyEmphasis` (15/21/600), accent colour, optional | same | same | same |
| **Message** | `Type.captionElevated` (13/18/400), `colors.textSecondary`, max 2 lines | same | same | same |
| **Action** | text button, `Type.meta` semibold, accent colour, 44pt hit target, optional | same | same | same |
| **Dismiss** | `close` icon 16pt, `colors.textMuted`, 44pt hit target, optional | same | same | same |
| **Animation** | opacity fade-in (`Motion.duration.fast`), no slide | same | same | same |
| **Duration** | persistent (inline, not auto-dismissing) | same | same | same |
| **Position** | inline within screen content, not overlay | same | same | same |
| **Compact variant** | pill-style, `Radius.full`, 13pt icon, single-line text, no title | same | same | same |

### Push notification preview (in-app, when app is open)

| Property | Value |
|----------|-------|
| **Geometry** | full-width minus 24px (12px L/R), `Radius.lg` (12px), min height 64px |
| **Background** | `colors.surfaceElevated`, `Elevation.floating` shadow |
| **Border** | `colors.borderSubtle`, hairline |
| **Icon container** | 32pt rounded-square (`Radius.md`), `${accent}18` tint, type icon 20pt inside |
| **Large icon** | optional sender avatar, 36pt, `Radius.md`, left of text |
| **Title** | `Type.body` (14/20/600), `colors.textPrimary`, 1 line |
| **Body** | `Type.caption` (12/16/400), `colors.textSecondary`, 2 lines |
| **Action** | text button, `Type.caption` semibold, accent colour, 44pt hit target |
| **Dismiss** | `close` icon 16pt, `colors.textSecondary`, 44pt hit target |
| **Animation** | spring-in from top (120pt slide + fade, `Motion.duration.slow`), fade-out on dismiss |
| **Duration** | 6000ms (message/offer/listing), 0/sticky (order/error), progress bar for timed |
| **Position** | top, `insets.top + 8px`, 12px L/R rail, stacked with 8px gap, max 3 |
| **Swipe** | swipe-up-to-dismiss, velocity > 500 or distance > 40px, spring-back |
| **Haptic** | `HapticType.LIGHT` on appear for high-priority (order/error) |
| **Accessibility** | `accessibilityRole="alert"`, `accessibilityLiveRegion="polite"`, announce title + body |

---

## Sources

1. 137Foundry — "Designing Toast Notifications Users Actually Read" (Aug 2026) — https://137foundry.com/articles/notification-toast-system-that-doesnt-overwhelm-users
2. 72Technologies — "Toast Notifications Are Broken: A Better UX Pattern" — https://www.72technologies.com/blog/toast-notifications-async-feedback-pattern
3. Eleken — "Notification UX: 8 Best Practices + Real Examples (2026)" — https://www.eleken.co/blog-posts/notification-ux
4. Eleken — "Snackbar UI: Best Practices, Examples & UX Tips" — https://www.eleken.co/blog-posts/snackbar-ui
5. Human Standards — "Notifications & Feedback" — https://www.humanstandards.org/interaction-patterns/notifications-feedback/
6. justfigma — "Toasts & Snackbars in Figma (2026)" — https://justfigma.com/designing-toasts-and-snackbars-in-figma-patterns-and-handoff/
7. AnnounceKit — "In-App Banners Vs. Modals Vs. Tooltips" — https://announcekit.app/blog/in-app-banners-vs-modals-vs-tooltips/
8. Google Design — "Expressive Design: Google's UX Research" (Material 3 Expressive, 46 studies, 18,000 participants) — https://design.google/library/expressive-material-design-google-research
9. Android Developers — "Material Design 3 in Compose" (M3 Expressive) — https://developer.android.com/develop/ui/compose/designsystems/material3
10. eBay MIND Patterns — "Toast Dialog" — https://ebay.gitbook.io/mindpatterns/messaging/toast-dialog
11. Paste/Twilio — "Notifications and feedback patterns" — https://paste.twilio.design/patterns/notifications-and-feedback
12. Medium/Sonal Solaskar — "Improving Trust and Feedback in Instagram Instants" (May 2026) — https://medium.com/@solaskarsonal/improving-trust-and-feedback-in-instagram-instants-c4285cf39d4d
13. VP0 Journal — "Native Toast Notification Modals in React Native" — https://vp0.com/blogs/native-toast-notification-modals
14. Rork Lab — "Build a Toast System That Survives Overlaps, Screen Readers, and Notches" — https://rorklab.net/en/articles/rork-dev/rork-toast-queue-accessibility-safe-area-design
15. GitHub — `react-native-toastcraft` (swipe-to-dismiss, queue, Reanimated, haptics) — https://registry.npmjs.org/react-native-toastcraft
16. GitHub — `emekauja/react-native-toast-message` (Reanimated toast stack, swipe-to-dismiss, queueing) — https://github.com/emekauja/react-native-toast-message
17. GitHub — `kimtj12/react-native-hot-toast` (RN hot toast, Reanimated, gesture dismiss) — https://github.com/kimtj12/react-native-hot-toast
18. GitHub — `synonymdev/bitkit-ios` commit — "spring-in, fade-out toast motion" (asymmetric Apple system banner pattern) — https://github.com/synonymdev/bitkit-ios/commit/7256636969adda92191ee0f1f499221f9e64edc6
19. GitHub — `calintamas/react-native-toast-message` PR #591 — "configurable enter/exit animation" — https://github.com/calintamas/react-native-toast-message/pull/591
20. techinterview — "Build a Notification Toast System: Queue, Stack, and Animations" — https://www.techinterview.org/post/3233475200/build-notification-toast-system/
21. UX Patterns Guide — "Undo UX Pattern" — https://uxpatternsguide.com/patterns/undo/
22. Courier — "Push Notification Preview Generator" (iOS/Android character budgets) — https://www.courier.com/tools/push-notification-preview-generator
23. Android Developers — "Notifications" (templates, expanded views) — https://developer.android.com/design/ui/mobile/guides/home-screen/notifications
24. howinsights — "Mastering Toast Notifications: Best Practices, Accessibility, And Modern Implementation" — https://howinsights.org/mastering-toast-notifications/
25. peal.dev — "Toast Notifications Done Right: Sonner, React Hot Toast, and When to Use Each" — https://www.peal.dev/blog/toast-notifications-sonner-react-hot-toast-alternatives
