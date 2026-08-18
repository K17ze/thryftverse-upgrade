# 27 — Push Notifications & Deep Linking

> **Department:** Push Notifications, Deep Linking & Re-engagement Infrastructure
> **Benchmark date:** 2026-08-18
> **Scope:** Push notification strategy, permission UX, opt-in flow, iOS APNs channels, Android notification channels, rich media notifications (images/video/carousels), action buttons, grouped/threaded notifications, quiet hours, notification preferences, delivery infrastructure (Expo/FCM/APNs), token lifecycle management, retry/backoff, delivery analytics, universal links (iOS), app links (Android), deep link routing, apple-app-site-association, assetlinks.json, deep link testing, re-engagement campaigns.
> **Charter references:** AGENTS.md §2 (deep system research, layer diagnosis), §4 (anti-AI-made design — "stateless UI", "truthful UI"), §6 (truthful UI — no fabricated success), §14 (state completeness), §17 (motion and interaction); Design.md "Notifications & Inbox", "State Coverage", "Performance gate".
> **Primary benchmarks:** Instagram (social push + deep links), Snapchat (streak push + re-engagement), eBay (commerce push + order tracking deep links), Pinterest (taste-based push + visual deep links). Secondary: Depop, Vinted (marketplace push patterns), TikTok Shop Live (live shopping push).

---

## 1. 2026 Competitor Benchmark

Push notifications are the single highest-leverage re-engagement channel for a mobile app — and the single fastest way to drive an uninstall when done wrong. The 2026 consensus across Instagram, Snapchat, eBay, and Pinterest reveals a converging discipline: contextual permission asks, per-category channels, rich media, action buttons, and deep links that land the user on the exact object the notification is about.

### The 2026 push stack

| Layer | 2026 industry standard | Tooling |
|---|---|---|
| Permission strategy | Soft-ask pre-prompt → OS prompt; contextual triggers only (after purchase, after favorite, after first message); never on launch | Custom in-app pre-prompt UI + OS prompt |
| iOS delivery | APNs with per-category notification categories; Notification Service Extension for rich media (images/video); threadIdentifier for grouping; interruptionLevel for Focus mode alignment | APNs + Notification Service Extension |
| Android delivery | FCM with per-category notification channels (Android 8+); importance levels per channel; BigPictureStyle for rich media; groupKey for grouping; action buttons | FCM + NotificationChannel |
| Rich media | Image attachments (product photos, listing thumbnails); video for live shopping; carousels for collections; iOS requires Notification Service Extension, Android renders natively | iOS: NSE; Android: native |
| Action buttons | iOS: up to 4 buttons per category; Android: up to 3; "Complete purchase" / "Save for later" / "Reply" — act without opening app | Notification action categories |
| Grouping | iOS: threadIdentifier groups notifications into stacks; Android: groupKey + summary notification; prevents notification spam from one conversation/event | thread-identifier / group-key |
| Deep linking | Universal Links (iOS) + App Links (Android); every push payload carries a route object; tap lands user on the exact screen for the object | apple-app-site-association + assetlinks.json |
| Token lifecycle | Auto-reregister on token refresh (iOS 16+ token rotation); server-side token validation; stale token cleanup; per-device deactivation | Expo Notifications + server device registry |
| Delivery analytics | Delivery rate, open rate, CTR per category; bounce/invalid token tracking; A/B test notification copy and timing | Custom analytics + Expo receipt API |
| Quiet hours | User-configurable quiet hours; server-side suppression during quiet window; iOS Focus mode alignment via interruptionLevel | Server-side quiet hours + iOS interruptionLevel |

Sources: [OneSignal — Push Notification Best Practices 2026](https://onesignal.com/blog/onesignal-guide-push-notification-best-practices-2026/); [Pushwoosh — 23 Push Notification Best Practices 2026](https://www.pushwoosh.com/blog/push-notification-best-practices/); [Pushwoosh — Rich Push Notifications](https://www.pushwoosh.com/blog/rich-push-notifications/); [Pushwoosh — Android Push Notifications 2026](https://www.pushwoosh.com/blog/android-push-notifications/); [Appbot — App Push Notification Best Practices 2026](https://appbot.co/blog/app-push-notifications-2026-best-practices/); [Expo — Universal and App Links](https://expo.dev/blog/universal-and-app-links); [React Navigation — Deep Linking](https://reactnavigation.org/docs/deep-linking).

### Instagram — social push with rich media and deep links

Instagram's push strategy is the benchmark for social engagement. Every notification carries a deep link that lands the user on the exact post, story, or profile. Rich media includes the profile picture or post thumbnail in the notification itself. Notifications are grouped by type — multiple likes on the same post stack into a single "X and 12 others liked your post" notification, not 13 separate notifications. The permission ask is contextual: Instagram prompts after the user has had a meaningful engagement (posting, following, messaging), not on launch.

### Snapchat — streaks as the retention engine

Snapchat's streak notifications are the canonical example of variable-reward push driving daily retention. The streak notification ("Your streak with X is about to expire!") creates urgency through loss aversion. Snapchat's push timing is tuned to the user's timezone and usage patterns — a streak warning arrives 22 hours after the last snap, not at a random server-side time. Every push carries a deep link directly to the chat with that friend.

### eBay — commerce push with action buttons

eBay's push strategy is the benchmark for marketplace commerce. Order updates include action buttons ("Track package", "View order") that act without opening the full app. Outbid notifications carry a deep link directly to the auction with the bid sheet pre-opened. Price drop notifications for watchlist items include the product image as rich media. eBay uses per-category channels on Android: "Order updates", "Auction alerts", "Price drops", "Messages", "Promotions" — each independently muteable by the user.

### Pinterest — taste-based visual push

Pinterest's push notifications are visual-first: the notification includes the pin image as rich media, and the deep link lands on the pin closeup. Pinterest's recommendation engine drives "Ideas for you" pushes that are personalized to the user's taste profile — these have measurably higher CTR than generic promotional pushes because the content is relevant.

### Converging principles

1. **Permission is earned, not demanded.** The OS prompt is a one-shot opportunity on iOS — once denied, the user must go to Settings to re-enable, and very few do. A soft-ask pre-prompt that explains the value before triggering the OS prompt is the 2026 standard ([Pushwoosh — 23 Best Practices](https://www.pushwoosh.com/blog/push-notification-best-practices/)).
2. **Channels are the user's control surface.** Android notification channels (and iOS notification categories) let users mute specific notification types without disabling all notifications. A user who wants order updates but not promotional pushes should be able to make that choice. Offering this control reduces opt-outs ([Pushwoosh](https://www.pushwoosh.com/blog/push-notification-best-practices/)).
3. **Rich media earns the tap.** Industry benchmarks put CTR improvement from rich media at 2-3× ([Pushwoosh — Rich Push](https://www.pushwoosh.com/blog/rich-push-notifications/)). A product image in a cart-recovery push shows the user exactly what they left. A generic banner adds nothing the headline didn't say.
4. **Action buttons reduce friction.** "Complete purchase" and "Save for later" cover the two most common responses to a cart-recovery push. Two well-labeled buttons outperform four vague ones. On iOS you get up to 4; on Android up to 3 — don't fill all slots by default ([Pushwoosh](https://www.pushwoosh.com/blog/push-notification-best-practices/)).
5. **Every push carries a deep link.** A push that opens the app to the home screen is a failed push. The user tapped because they were interested in the specific content of the notification — land them on that content.
6. **Grouping prevents spam.** Multiple notifications from the same conversation, auction, or order should stack into a group, not flood the notification shade. iOS uses `threadIdentifier`; Android uses `groupKey` with a summary notification.
7. **Quiet hours are respected.** Server-side quiet hours suppression ensures the user is never buzzed at 3 AM. iOS Focus mode alignment via `interruptionLevel` lets the OS decide whether to surface the notification based on the user's current Focus.

---

## 2. Psychology & Principles

### The 2-second lock-screen test

A notification has roughly two seconds to justify its existence on someone's lock screen. Every element must earn its space: the title (50 chars max) communicates the core value in a single glance; the body (14-25 words) expands with just enough detail to make the tap feel worthwhile; the rich media provides instant visual context ([OneSignal — Best Practices 2026](https://onesignal.com/blog/onesignal-guide-push-notification-best-practices-2026/)). "50% off ends tonight" is specific and urgent. "Exciting news inside!" is not.

### Variable reward and the hook model

Push notifications are the primary trigger in Nir Eyal's Hook Model (trigger → action → variable reward → investment). The notification is the trigger; the tap is the action; the content behind the notification is the reward. The variability of the reward — sometimes it's a message from a friend, sometimes a price drop on a watchlist item, sometimes nothing interesting — is what makes the notification compelling. This is the same psychology that makes slot machines addictive, and it must be wielded ethically. A notification that never delivers a worthwhile reward trains the user to ignore future notifications.

### Notification fatigue and the uninstall risk

A poorly timed, irrelevant notification is ignored at best, and provokes an app uninstall at worst. Both iOS and Android make it trivial for users to permanently silence an app — often directly from the lock screen. In 2026, iOS Focus Modes let users bundle or silence non-critical notifications, and Android notification channels give users channel-level mute controls per app. A notification sent to a muted channel simply doesn't appear ([Appbot — 2026 Best Practices](https://appbot.co/blog/app-push-notifications-2026-best-practices/)). The cost of notification spam is not just "they ignore it" — it's "they permanently disable your app's notifications," which removes the re-engagement channel entirely.

### Permission as trust

The push permission prompt is a trust transaction. The user is granting the app the right to interrupt them at any time. Asking for this right on app launch — before the app has demonstrated any value — is the most effective way to get denied. The 2026 standard is the contextual ask: after a purchase ("Enable notifications to track your order?"), after favoriting an item ("Get notified when this item's price drops?"), after sending a first message ("Get notified when they reply?"). The contextual ask frames the permission as a benefit to the user, not a demand from the app.

### The soft-ask pre-prompt

The iOS permission prompt is a one-shot opportunity. Once the user taps "Don't Allow," the only way to re-enable is to navigate to Settings → Notifications → App → Allow Notifications — and fewer than 5% of users ever do this. The soft-ask pre-prompt is a custom in-app screen that explains what the user will receive and why it's worth allowing, with "Allow" and "Not now" buttons. If the user taps "Not now," the OS prompt never fires — preserving the ability to ask again later. If the user taps "Allow," the OS prompt fires with a much higher probability of acceptance because the user has already consented conceptually ([Pushwoosh — 23 Best Practices](https://www.pushwoosh.com/blog/push-notification-best-practices/)).

### Deep links and the "right destination" principle

A push notification that opens the app to the home screen is a broken promise. The user tapped because they were interested in the specific content — a new message, a price drop, an auction outbid. Landing them on the home screen forces them to navigate to the content themselves, which is friction. The 2026 standard: every push payload carries a route object that resolves to the exact screen for the object. Tapping "You were outbid on Vintage Leather Jacket" opens the auction detail with the bid sheet pre-opened, not the auctions list.

### Interruption hierarchy

Not all notifications are equal. A "Your order has shipped" notification is informational — it can wait. A "You were outbid with 30 seconds left" notification is urgent — it needs to interrupt. The 2026 iOS `interruptionLevel` API (`passive`, `active`, `timeSensitive`, `critical`) lets the OS decide whether to break through Focus modes. Android's channel importance levels (`IMPORTANCE_HIGH`, `IMPORTANCE_DEFAULT`, `IMPORTANCE_LOW`, `IMPORTANCE_MIN`) serve the same purpose. Mapping notification types to interruption levels is a product decision, not an engineering afterthought.

---

## 3. Architectural Issues & Engineering Flaws

Push notification and deep-linking debt blocks production in concrete ways:

### Low opt-in rate = no re-engagement channel

An app with a 25% push opt-in rate has lost the re-engagement channel for 75% of its users. Those users can only be re-engaged by opening the app voluntarily — which, for a marketplace with no daily-use habit, means they churn. The opt-in rate is determined almost entirely by the permission ask strategy: apps that ask on launch average 30-40% opt-in; apps that use contextual asks with soft-prompt pre-asks average 55-65% on iOS and 70-80% on Android ([Pushwoosh 2025 study](https://www.pushwoosh.com/blog/android-push-notifications/)). ThryftVerse's current strategy — contextual asks without a soft-prompt pre-ask — is better than launch-time asks but leaves significant opt-in rate on the table.

### Silent delivery failures = user never knows

Push delivery is not guaranteed. APNs and FCM have delivery rates of 95-98% under normal conditions, but tokens expire, devices unregister, and network conditions cause drops. If the backend doesn't track delivery status, doesn't retry failed deliveries, and doesn't clean up stale tokens, notifications silently disappear. The user never knows they missed a notification; the app team never knows delivery is failing. This is especially dangerous for order-critical notifications ("Your order has shipped") where a missed notification triggers a support ticket.

### Broken deep links = broken promise

A push notification that taps to a broken deep link — wrong screen, missing params, fallback to home — is worse than no deep link at all. The user tapped because they were interested; landing on the wrong screen is a broken promise that erodes trust. Deep links break when: the route object doesn't match the navigation schema, the target screen doesn't exist in the current navigation state, params are missing or wrong-typed, or the deep link handler races with navigation readiness. ThryftVerse's current deep link handling — a manual `Linking.getInitialURL` + `navigationRef.navigate` queue — is fragile and untested.

### No rich media = lower CTR

Text-only push notifications have 2-3× lower CTR than rich-media notifications ([Pushwoosh — Rich Push](https://www.pushwoosh.com/blog/rich-push-notifications/)). For a visual marketplace where the product image IS the product, sending a "New listing from X" notification without the listing image is leaving 60-70% of taps on the table. iOS requires a Notification Service Extension to display rich media; without it, only text shows even if the payload includes an image URL.

### No channel strategy = all-or-nothing muting

Without per-category notification channels (Android) or notification categories (iOS), the user's only option is to mute all notifications or none. A user who wants order updates but is annoyed by promotional pushes will mute all — losing the order-update channel. Per-category channels let the user mute promotions while keeping order updates, preserving the high-value notification channel.

### No grouped notifications = notification spam

Without grouping, a conversation with 10 new messages produces 10 separate notifications. An auction with 5 bid updates produces 5 notifications. This floods the notification shade and triggers the user to mute the app. iOS `threadIdentifier` and Android `groupKey` stack related notifications into a single group with a summary, preventing spam while preserving the information.

### No delivery analytics = flying blind

Without delivery rate, open rate, and CTR per notification category, the app team cannot optimize. Which notification types drive engagement? Which are ignored? Which are muted? Without this data, notification strategy is guesswork. The Expo Push API provides receipt endpoints for delivery confirmation, but ThryftVerse doesn't use them.

### Missing association files = broken universal links

iOS Universal Links require an `apple-app-site-association` file hosted at `https://thryftverse.com/.well-known/apple-app-site-association`. Android App Links require an `assetlinks.json` file hosted at `https://thryftverse.com/.well-known/assetlinks.json`. These files verify the domain owner's association with the app. Without them, universal links and app links fail silently — the URL opens in the browser instead of the app. ThryftVerse's `app.json` declares `associatedDomains` and `intentFilters`, but no association files exist in the repo — they must be hosted on the web server, and their absence is a silent deep-link failure.

---

## 4. AI Slop Diagnosis

AI-generated push notification code has predictable, identifiable failure modes:

### The "enable notifications on launch" anti-pattern

AI models, when asked to "add push notifications," frequently generate a permission request on app launch. This is the single most effective way to get denied — the user hasn't seen any value yet, and the OS prompt appears as an aggressive demand. ThryftVerse avoids this (the `pushPermission.ts` module explicitly documents the contextual-ask principle), but the soft-ask pre-prompt UI is missing — the OS prompt fires directly after a contextual action, without an in-app explanation first.

### No rich media in the payload

AI models generate push payloads with `title` and `body` text only. The `expo-notifications` API supports rich media via the Notification Service Extension on iOS and native rendering on Android, but AI code rarely includes image URLs in the payload or sets up the extension. ThryftVerse's backend push delivery (`index.ts:8721-8733`) sends `title`, `body`, `channelId`, and `data` — no image, no video, no action buttons. This is the AI default.

### Single 'default' channel

AI models generate a single `'default'` notification channel on Android with `IMPORTANCE_MAX`. This gives the user no granular control — they can only mute all or none. ThryftVerse's `pushPermission.ts:73-78` and `config.ts:429` (`pushDefaultChannel: 'default'`) exhibit exactly this pattern. A senior engineer would define per-category channels mapped to the notification event registry's semantic roles.

### Manual deep-link handling instead of NavigationContainer linking prop

AI models frequently handle deep links manually via `Linking.getInitialURL()` + `navigationRef.navigate()` instead of using React Navigation's `linking` prop. The React Navigation docs explicitly warn: "We don't recommend handling deep links yourself using a ref as it can be error-prone and significantly more complicated. Using the linking prop is the recommended way" ([React Navigation — Deep Linking](https://reactnavigation.org/docs/deep-linking)). ThryftVerse's `App.tsx:319-332` handles invite deep links manually, and the `NavigationContainer` (line 491) has NO `linking` prop. Push-tap routing goes through a separate `navigationRef` queue in `usePushNotificationTap.ts`. This dual-path manual handling is the AI-generated pattern, not the recommended pattern.

### No retry/backoff on delivery failure

AI models generate a `fetch(expoPushApiUrl, ...)` call with no retry logic. If the Expo Push API returns a 5xx or the network times out, the notification is silently lost. ThryftVerse's `index.ts:8715-8759` exhibits this — a single `fetch` with no retry, no backoff, no exponential jitter. Failed deliveries are logged but not retried.

### No token lifecycle management

AI models register the push token once and never handle token refresh. iOS 16+ rotates tokens periodically; Android tokens can change on app reinstall. Without a `Notifications.addEventListener('pushTokenReceived', ...)` listener and server-side token update, the server sends to stale tokens and delivery silently fails.

### No grouped notifications

AI models send each notification as a standalone event with no `threadIdentifier` (iOS) or `groupKey` (Android). A conversation with 10 messages produces 10 notifications. ThryftVerse's backend push delivery (`index.ts:8721-8733`) includes no grouping identifier — every notification is standalone.

### No delivery analytics

AI models fire the push and forget. No receipt checking, no open-rate tracking, no CTR measurement. ThryftVerse's `recordPushDelivery` (`index.ts:8706,8786`) records sent/failed status but doesn't track whether the notification was opened or tapped — no CTR data.

---

## 5. Current ThryftVerse Audit (file:line defects)

### Push permission — `frontend/src/lib/pushPermission.ts`

| Line | Defect |
|---|---|
| 11 | `PushPermissionContext = 'chat' \| 'favorite' \| 'checkout' \| 'settings'` — only 4 contextual triggers; missing 'auction_bid', 'price_alert', 'follow', 'listing_sold' |
| 55-84 | `requestPushPermissionWithContext` — triggers the OS prompt directly with no soft-ask pre-prompt UI; the contextual trigger is correct but the pre-prompt that explains value before the OS prompt is missing |
| 73-78 | Android channel setup: single `'default'` channel with `AndroidImportance.MAX` — no per-category channels (orders, social, news, auctions) |
| 95-104 | `requestPushPermissionOnce` — once-per-context is correct, but there's no re-prompt strategy for users who denied but later had a high-value trigger (e.g., "Enable notifications to get outbid alerts?") |

### Push tap handling — `frontend/src/hooks/usePushNotificationTap.ts`

| Line | Defect |
|---|---|
| 8 | `createNavigationContainerRef<RootStackParamList>()` — creates a SEPARATE navigation ref from the one in `App.tsx:71`; two refs means the push handler's ref may not be the one attached to the NavigationContainer |
| 12-13 | `pendingRoute` + `navigationReady` module-level singletons — not React state, not context; fragile lifecycle management |
| 67-71 | `handleForegroundNotification` — only increments `notificationCount`; does NOT show a visible in-app banner or toast for foreground notifications; the user gets no visible feedback when a push arrives while the app is open |
| 82-88 | `getLastNotificationResponseAsync()` — handles cold-start push tap, but the `.catch(() => {})` silently swallows errors; if the last notification response is malformed, the user lands on the home screen with no indication |
| 32 | `nav.navigate(screen, params)` — bypasses TypeScript's route param type checking via `as { navigate: (screen: string, params?: unknown) => void }`; a wrong-typed param crashes at runtime, not at compile time |

### Notification routing — `frontend/src/utils/notificationRouting.ts`

| Line | Defect |
|---|---|
| 23-39 | `VALID_SCREENS` set is a hardcoded allowlist — must be manually kept in sync with the navigation schema; adding a new screen requires updating this set or deep links silently fail |
| 41-157 | `resolveNotificationRoute` — extensive if/else chain for each screen; no schema-driven routing; adding a new notification type requires adding a new if-branch |
| 113-153 | Payload-based fallback — tries to infer the route from `orderId`, `ticketId`, `auctionId`, `assetId`, `listingId` in the payload; this is fragile because it assumes specific payload key names that must be kept in sync between backend and frontend |
| 159-170 | `extractRouteFromPushData` — checks for `data.route` object first, falls back to payload inference; the dual-path (explicit route vs inferred) is a complexity smell |

### Deep linking — `frontend/App.tsx`

| Line | Defect |
|---|---|
| 319-332 | Manual `Linking.getInitialURL()` + `Linking.addEventListener('url')` handling for invite tokens ONLY; no general deep-link routing for `thryftverse://` or `https://thryftverse.com/...` URLs |
| 491-521 | `<NavigationContainer>` has NO `linking` prop — React Navigation's built-in deep-link integration is not used; all deep-link routing is manual and fragile |
| 354-360 | `navigationRef.navigate('Chat', { conversationId: ... })` — invite deep-link navigation is handled inline in a useEffect, not through a central deep-link router |
| 365 | `Alert.alert('Group Invite', ...)` — uses a native alert dialog for success/error feedback instead of a designed in-app surface; reads as prototype-level UX |

### App configuration — `frontend/app.json`

| Line | Defect |
|---|---|
| 5 | `"scheme": "thryftverse"` — custom scheme registered ✓ |
| 13-16 | `associatedDomains: ["applinks:thryftverse.com", "applinks:www.thryftverse.com"]` — Universal Links declared ✓, but requires `apple-app-site-association` file hosted at the domain (NOT found in repo) |
| 33-65 | Android `intentFilters` with `autoVerify: true` for `https://thryftverse.com` — App Links declared ✓, but requires `assetlinks.json` file hosted at the domain (NOT found in repo) |
| 82 | `"expo-notifications"` plugin listed ✓, but no Notification Service Extension configured for iOS rich media |

### Backend push delivery — `backend/api/src/index.ts`

| Line | Defect |
|---|---|
| 8715-8734 | `fetch(config.expoPushApiUrl, ...)` — single fetch per device, no retry, no backoff, no exponential jitter; a 5xx or timeout silently loses the notification |
| 8721-8733 | Push payload: `to`, `title`, `body`, `channelId`, `data` — no `image` field for rich media, no `actionId` for action buttons, no `threadIdentifier` for grouping, no `interruptionLevel` for iOS Focus alignment |
| 8713 | `for (const device of devicesResult.rows)` — sequential per-device delivery; for a user with 3 devices, delivery is 3 sequential fetches; should be parallelized |
| 8762 | `const status = deliveredCount > 0 ? 'sent' : 'failed'` — binary sent/failed; no partial delivery tracking (2 of 3 devices succeeded) |
| 8693-8707 | `no_active_device` → marks event as `failed` — no fallback to email or in-app notification; the user never receives the information |

### Backend config — `backend/api/src/config.ts`

| Line | Defect |
|---|---|
| 428 | `expoPushApiUrl: process.env.EXPO_PUSH_API_URL ?? 'https://exp.host/--/api/v2/push/send'` — Expo push only; no direct APNs/FCM fallback for when Expo is down |
| 429 | `pushDefaultChannel: process.env.PUSH_DEFAULT_CHANNEL ?? 'default'` — single channel; no per-category channel mapping |

### Notification event registry — `backend/api/src/lib/notificationEventRegistry.ts`

| Line | Defect |
|---|---|
| 16-27 | `NotificationSemanticRole` (social/commerce/auction/financial/system) and `NotificationAttentionLevel` (critical/action/important/info) — excellent metadata foundation, but NOT used for channel routing, interruption level mapping, or grouping; the registry exists but the delivery pipeline ignores it |

### Push preferences — `frontend/src/preferences/settingsPreferences.ts`

| Line | Defect |
|---|---|
| 56-64 | `PUSH_NOTIFICATION_DEFINITIONS` — 7 categories (orderUpdates, offers, priceDrops, messages, followers, wishlist, news) with labels, subtitles, icons, and groups — good UI foundation, but these categories are NOT mapped to Android notification channels or iOS notification categories on the delivery side |
| 66-70 | `PUSH_NOTIFICATION_GROUPS` — 3 groups (orders, social, news) — good IA, but again not wired to delivery channels |
| 74-78 | `DEFAULT_QUIET_HOURS` — 22:00-08:00 default; `isQuietHoursActive` function exists (line 84-95) — but this is client-side only; the backend has no quiet-hours awareness and will send pushes during the user's quiet window |

### In-app notification list — `frontend/src/screens/NotificationsScreen.tsx`

| Line | Defect |
|---|---|
| 1-60 | The in-app notification list exists with SectionList, Swipeable, EmptyState, SkeletonLoader — good state coverage for the in-app surface, but this is the PULL surface (user opens the app and checks notifications), not the PUSH surface (notification arrives and user taps) |
| 349 | `notifications.forEach((notification) => {` — processes notifications for display, but no deep-link routing from in-app notification tap to the target screen is visible in the first 60 lines (would need to check further) |

### Missing infrastructure

| Item | Status |
|---|---|
| iOS Notification Service Extension | **Missing** — no NSE configured; iOS rich media (images/video) cannot render without it |
| Android per-category channels | **Missing** — single `'default'` channel only |
| `apple-app-site-association` file | **Missing** — not in repo; must be hosted at `https://thryftverse.com/.well-known/` |
| `assetlinks.json` file | **Missing** — not in repo; must be hosted at `https://thryftverse.com/.well-known/` |
| NavigationContainer `linking` prop | **Missing** — deep links handled manually, not via React Navigation's built-in integration |
| Push token refresh listener | **Missing** — no `Notifications.addEventListener('pushTokenReceived', ...)` |
| Push delivery retry/backoff | **Missing** — single fetch, no retry |
| Push delivery receipts | **Missing** — Expo receipt API not used for delivery confirmation |
| Push open/CTR tracking | **Missing** — no analytics on notification opens or CTR |
| Grouped notifications | **Missing** — no `threadIdentifier` or `groupKey` in payload |
| Action buttons | **Missing** — no action categories defined |
| Foreground notification display | **Missing** — foreground pushes only increment a counter, no visible banner |
| Server-side quiet hours | **Missing** — quiet hours checked client-side only; backend sends regardless |
| Soft-ask pre-prompt UI | **Missing** — OS prompt fires directly after contextual trigger |
| A/B testing notification copy | **Missing** — no experimentation infrastructure for notifications |

---

## 6. Micro Improvements (file-and-line-level)

### M1 — Add NavigationContainer `linking` prop

In `frontend/App.tsx:491`, add the `linking` prop to `NavigationContainer`:
```tsx
import * as Linking from 'expo-linking';

const linking = {
  prefixes: [Linking.createURL('/'), 'https://thryftverse.com', 'https://www.thryftverse.com'],
  config: {
    screens: {
      ItemDetail: 'item/:itemId',
      OrderDetail: 'order/:orderId',
      AuctionDetail: 'auction/:auctionId',
      Chat: 'chat/:conversationId',
      UserProfile: 'u/:userId',
      // ... map every deep-linkable screen
    },
  },
};

<NavigationContainer ref={navigationRef} linking={linking} ...>
```
This replaces the manual `Linking.getInitialURL` handling (lines 319-332) and the separate `pushNavigationRef` in `usePushNotificationTap.ts:8` with React Navigation's built-in, tested deep-link integration.

### M2 — Add per-category Android notification channels

In `frontend/src/lib/pushPermission.ts`, replace the single `'default'` channel (lines 73-78) with per-category channels:
```ts
const CHANNELS = [
  { id: 'orders', name: 'Orders & Shipping', importance: Notifications.AndroidImportance.HIGH },
  { id: 'auctions', name: 'Auction Alerts', importance: Notifications.AndroidImportance.HIGH },
  { id: 'messages', name: 'Messages', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'social', name: 'Social', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'news', name: 'News & Promotions', importance: Notifications.AndroidImportance.LOW },
];
```
Map each `PUSH_NOTIFICATION_DEFINITIONS` category to a channel. Send `channelId` in the push payload from the backend.

### M3 — Add iOS Notification Service Extension for rich media

Create a Notification Service Extension target in the iOS project (via EAS Build config or Xcode). The extension intercepts the push payload before display, downloads the image from the URL in `data.imageUrl`, and attaches it to the notification. Without this, iOS renders text-only even if the payload includes an image URL. Add `imageUrl` to the backend push payload (`index.ts:8721-8733`).

### M4 — Add soft-ask pre-prompt UI component

Create a `PushPermissionSoftAsk` component that appears at contextual moments (after purchase, after favorite, after first message) with a designed in-app card: "Get notified when [specific value]?" with "Allow" and "Not now" buttons. Only on "Allow" does `requestPushPermissionWithContext` fire. This preserves the one-shot OS prompt for users who have already conceptually consented.

### M5 — Add retry/backoff to backend push delivery

In `backend/api/src/index.ts:8715`, wrap the `fetch` in a retry loop:
```ts
async function sendWithRetry(url, body, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers, body });
      if (response.ok || response.status < 500) return response; // don't retry 4xx
      // 5xx: exponential backoff with jitter
      await sleep(Math.min(1000 * 2**attempt, 8000) + Math.random() * 500);
    } catch (e) {
      if (attempt === maxRetries - 1) throw e;
      await sleep(Math.min(1000 * 2**attempt, 8000));
    }
  }
}
```

### M6 — Add grouped notifications

In the backend push payload (`index.ts:8721-8733`), add grouping identifiers:
```ts
body: {
  to: device.token,
  title: job.title,
  body: job.body,
  channelId: channelForEventType(job.eventType),
  threadIdentifier: groupKeyForEvent(job), // iOS grouping
  groupKey: groupKeyForEvent(job),         // Android grouping
  data: { ... },
}
```
Group by conversation ID for messages, by auction ID for auction alerts, by order ID for order updates.

### M7 — Add action buttons

Define notification action categories on the client (in `pushPermission.ts` or a new `pushActions.ts`):
```ts
await Notifications.setNotificationCategoryAsync('order_update', [
  { identifier: 'TRACK', buttonTitle: 'Track Package', options: { opensAppToForeground: true } },
  { identifier: 'VIEW_ORDER', buttonTitle: 'View Order', options: { opensAppToForeground: true } },
]);
```
Reference the category in the push payload via `categoryIdentifier`.

### M8 — Add `apple-app-site-association` and `assetlinks.json`

Create and host these files at `https://thryftverse.com/.well-known/`:
- `apple-app-site-association`: JSON with `applinks` → `details` → `appIDs` (team ID + bundle ID) → `paths` (whitelist of deep-linkable paths)
- `assetlinks.json`: JSON with `assetlinks` → `target` → `package_name` + `sha256_cert_fingerprints` → `namespace` + `relation`

Without these files, Universal Links and App Links fail silently.

### M9 — Add push token refresh listener

In `frontend/App.tsx` or a dedicated hook:
```ts
Notifications.addEventListener('pushTokenReceived', (event) => {
  // Re-register the new token with the backend
  registerNotificationDevice({ token: event.data, platform, appVersion });
});
```

### M10 — Add foreground notification banner

In `usePushNotificationTap.ts:67-71`, replace the count-only increment with a visible in-app banner:
```ts
const handleForegroundNotification = useCallback((notification) => {
  setNotificationCount(notificationCount + 1);
  // Show an in-app banner/toast with the notification title/body
  // Tapping the banner navigates to the route
  showToast({ title: notification.request.content.title, body: notification.request.content.body, onPress: () => handleNotificationResponse(...) });
}, [...]);
```

### M11 — Add server-side quiet hours enforcement

In the backend push delivery pipeline (`index.ts:8301`), before queueing a notification, check the user's quiet hours:
```ts
if (await isUserInQuietHours(userId)) {
  // Hold the notification until quiet hours end, or deliver silently
  await db.query('INSERT INTO notification_queue (user_id, event_id, deliver_after) VALUES ($1, $2, $3)', [userId, eventId, quietHoursEnd]);
  return;
}
```

### M12 — Add delivery receipts and CTR tracking

After sending via Expo Push API, check the receipt:
```ts
const receiptId = (await response.json()).id;
// Later, poll https://exp.host/--/api/v2/push/getReceipts to check delivery status
```
Track notification opens via `Notifications.addNotificationResponseReceivedListener` → fire analytics event with `eventId`, `eventType`, `category`.

---

## 7. Macro Improvements (structural/architectural)

### A1 — Push as a product system, not a feature

The root architectural flaw is that push notifications are treated as a delivery mechanism (send title + body to Expo) rather than a product system with strategy, segmentation, channel routing, rich media, action buttons, grouping, analytics, and A/B testing. The fix is structural: push becomes a product surface with a dedicated owner, a notification strategy document, per-category channel mapping, rich media pipeline, action button taxonomy, grouping rules, delivery analytics dashboard, and A/B testing infrastructure. The `notificationEventRegistry.ts` semantic metadata (role, attention, requiresAction) is the foundation — it must be wired to the delivery pipeline, not just stored.

### A2 — Channel strategy mapped to semantic roles

The `notificationEventRegistry.ts` already defines `NotificationSemanticRole` (social/commerce/auction/financial/system) and `NotificationAttentionLevel` (critical/action/important/info). These should drive:
- **Android channel**: `orders` (commerce), `auctions` (auction), `messages` (social), `social` (social), `news` (system), `financial` (financial)
- **iOS interruptionLevel**: `critical` → `critical`, `action` → `timeSensitive`, `important` → `active`, `info` → `passive`
- **Grouping key**: by object reference (conversationId, auctionId, orderId) extracted by the registry's `objectExtractor`
- **Action buttons**: by semantic role — commerce → "Track" + "View Order"; auction → "Bid" + "Watch"; social → "Reply" + "View"

This mapping turns the registry from a metadata store into the routing brain of the push system.

### A3 — Deep-link contract: every push carries a route object

Every push payload must carry a structured `route` object (`{ screen: string, params: Record<string, unknown> }`) that the client resolves via the NavigationContainer `linking` prop. No payload-inference fallback (the current `notificationRouting.ts:113-153` inference from `orderId`/`auctionId`/`listingId` in the payload). The route is explicit, typed, and validated against the navigation schema at build time. This eliminates the fragile dual-path routing and makes deep links reliable.

### A4 — Rich media pipeline

The backend must include `imageUrl` in every push payload for visual notifications (listing, auction, order, profile). The iOS Notification Service Extension downloads and attaches the image. Android renders natively. The image is the product thumbnail (already available in the listing/auction data). This is a 2-3× CTR improvement for minimal effort — the images already exist, they just need to be included in the payload and rendered via the NSE.

### A5 — Token lifecycle management

Push tokens are not permanent. iOS 16+ rotates tokens; Android tokens change on reinstall. The client must:
1. Register the token on app launch
2. Listen for `pushTokenReceived` events and re-register
3. The backend must validate tokens on send and clean up invalid ones (Expo returns `DeviceNotRegistered` error → mark token as inactive)

Without this, the server accumulates stale tokens and delivery rates silently degrade over time.

### A6 — Notification analytics dashboard

Build a notification analytics dashboard tracking:
- **Delivery rate** per category (sent / attempted)
- **Open rate** per category (opened / delivered)
- **CTR** per category (tapped / delivered)
- **Mute rate** per category (muted / enabled)
- **Bounce rate** per category (bounced / sent)

This data drives notification strategy: which categories drive engagement, which are muted, which need copy/timing optimization. Without this, notification strategy is guesswork.

### A7 — Multi-channel fallback

When push delivery fails (no active device, token expired, quiet hours), the system should fall back to email or in-app notification. The backend already has an in-app notification store (`notification_events` table); a failed push should still create an in-app event so the user sees it when they next open the app. For critical notifications (order shipped, auction won), email fallback ensures the information reaches the user even if push fails.

### A8 — Deep-link test coverage

Deep links must be tested end-to-end:
- Unit test: `resolveNotificationRoute` with every event type → expected route
- Integration test: `thryftverse://item/123` → ItemDetail screen with `itemId: '123'`
- Integration test: `https://thryftverse.com/auction/456` → AuctionDetail screen
- E2E test: push tap → correct screen renders

Without test coverage, deep links break silently when the navigation schema changes.

---

## 8. Flagship Acceptance Criteria

A flagship push + deep-link system must achieve:

- **Opt-in rate >55% iOS, >75% Android** — contextual asks with soft-prompt pre-ask; never on launch
- **Delivery rate >95%** — retry/backoff, stale token cleanup, delivery receipt tracking
- **CTR >3%** — rich media on all visual notifications, action buttons on actionable notifications
- **Deep-link reliability 100%** — every push tap lands on the exact screen for the object; no home-screen fallbacks
- **Per-category channels** — Android: 5+ channels (orders, auctions, messages, social, news); iOS: notification categories with action buttons
- **Rich media coverage** — 100% of visual notifications (listing, auction, order, profile) include an image; iOS NSE configured
- **Grouped notifications** — messages, auction alerts, and order updates grouped by object reference; no notification spam
- **Action buttons** — commerce notifications have "Track" / "View Order"; auction notifications have "Bid" / "Watch"; social notifications have "Reply" / "View"
- **Quiet hours enforced server-side** — no push delivered during the user's quiet window; held and delivered when quiet hours end
- **Foreground notification display** — when a push arrives while the app is open, a visible in-app banner appears with tap-to-navigate
- **Token lifecycle managed** — auto-reregister on token refresh; stale tokens cleaned up on delivery failure
- **Universal Links + App Links working** — `apple-app-site-association` and `assetlinks.json` hosted; `https://thryftverse.com/item/123` opens the app, not the browser
- **NavigationContainer `linking` prop** — deep links handled by React Navigation's built-in integration, not manual `Linking.getInitialURL` + `navigationRef.navigate`
- **Notification analytics** — delivery rate, open rate, CTR per category tracked and dashboarded
- **A/B testing** — notification copy and timing A/B testable with statistical significance

### Thumbnail test

A push notification from ThryftVerse at 25% scale on the lock screen must show: a recognizable brand icon, a clear title (≤50 chars), a body with enough context to justify the tap, and — for visual notifications — a product thumbnail that provides instant context. If the notification is text-only when it should be visual, it is not done.

### Squint test

Open the notification shade with 10 ThryftVerse notifications. They should be grouped into 3-4 stacks (orders, auctions, messages, social), not 10 individual notifications. If the shade is flooded with individual notifications, grouping is not working.

---

## 9. Priority & Sequencing

| Priority | Item | Why first | Risk | Unblocks |
|---|---|---|---|---|
| P0 | M1 — NavigationContainer `linking` prop | Every deep-link-dependent feature relies on this; the current manual handling is fragile and untested | Medium — touches App.tsx navigation setup | All deep-link features |
| P0 | M8 — `apple-app-site-association` + `assetlinks.json` | Without these, Universal Links and App Links fail silently; they're a one-time hosting setup | Low — static files on web server | Universal Links, App Links |
| P0 | M5 — Retry/backoff on push delivery | Without retry, notifications are silently lost on transient failures; order-critical notifications need reliability | Low — wrap existing fetch in retry loop | Delivery reliability |
| P1 | M2 — Per-category Android channels | Gives users granular control; reduces all-or-nothing muting | Low — add channel definitions | Channel strategy |
| P1 | M4 — Soft-ask pre-prompt UI | Preserves the one-shot OS prompt for conceptually-consented users; directly lifts opt-in rate | Low — new UI component | Higher opt-in rate |
| P1 | M3 — iOS Notification Service Extension | Unlocks rich media on iOS; 2-3× CTR improvement | Medium — requires native iOS target | Rich media on iOS |
| P1 | A3 — Deep-link contract (route object in every payload) | Eliminates fragile payload inference; makes deep links reliable | Medium — touches backend push payload + client routing | Deep-link reliability |
| P1 | A5 — Token lifecycle management | Prevents silent delivery degradation from stale tokens | Low — add listener + server cleanup | Delivery reliability over time |
| P2 | M6 — Grouped notifications | Prevents notification spam; improves notification shade UX | Low — add threadIdentifier/groupKey to payload | Notification grouping |
| P2 | M7 — Action buttons | Reduces friction; user acts without opening app | Medium — requires action category setup + handlers | Action button functionality |
| P2 | M10 — Foreground notification banner | Currently foreground pushes are invisible; this is a state-coverage gap | Low — wire to existing toast system | Foreground state coverage |
| P2 | M11 — Server-side quiet hours | Currently quiet hours are client-side only; backend sends regardless | Medium — backend quiet hours check | Quiet hours enforcement |
| P2 | A2 — Channel strategy mapped to semantic roles | Wires the notificationEventRegistry to the delivery pipeline | Medium — mapping + backend integration | Intelligent channel routing |
| P2 | A4 — Rich media pipeline | 2-3× CTR improvement; images already exist in the data | Medium — NSE + payload changes | Rich media on all visual notifications |
| P3 | M9 — Push token refresh listener | Prevents stale token accumulation | Low — add event listener | Token lifecycle |
| P3 | M12 — Delivery receipts + CTR tracking | Enables notification analytics and optimization | Medium — receipt polling + analytics events | Notification analytics |
| P3 | A6 — Notification analytics dashboard | Data-driven notification optimization | High — dashboard infrastructure | Notification strategy optimization |
| P3 | A7 — Multi-channel fallback | Ensures information reaches user even when push fails | Medium — email/in-app fallback pipeline | Delivery reliability for critical notifications |
| P3 | A8 — Deep-link test coverage | Prevents silent deep-link breakage on schema changes | Medium — test infrastructure | Deep-link reliability CI gate |

### The minimum viable push launch

If only one thing can be done first, it is **M1 + M8 + M5**: NavigationContainer `linking` prop, association files hosted, and retry/backoff on delivery. These three convert push + deep links from "fragile and untested" to "reliable and standard." Every additional feature (channels, rich media, action buttons, grouping) then becomes an additive improvement on a working foundation.

---

## 10. Token-level Spec

| Token | Value | Notes |
|---|---|---|
| `push.permissionStrategy` | Soft-ask pre-prompt → OS prompt; contextual triggers only | Never on launch; preserve one-shot OS prompt |
| `push.permissionContexts` | `chat`, `favorite`, `checkout`, `settings`, `auction_bid`, `price_alert`, `follow`, `listing_sold` | Extended from current 4 to 8 contextual triggers |
| `push.androidChannels` | `orders` (HIGH), `auctions` (HIGH), `messages` (DEFAULT), `social` (DEFAULT), `news` (LOW) | Per-category channels; user-muteable independently |
| `push.iosCategories` | `order_update` (TRACK, VIEW_ORDER), `auction_alert` (BID, WATCH), `message` (REPLY, VIEW), `social` (VIEW), `news` (VIEW) | Notification categories with action buttons |
| `push.iosInterruptionLevel` | `critical` → critical; `action` → timeSensitive; `important` → active; `info` → passive | Mapped from notificationEventRegistry attention level |
| `push.richMedia.iosExtension` | Notification Service Extension configured | Downloads image from `data.imageUrl` and attaches |
| `push.richMedia.androidStyle` | BigPictureStyle with image URL | Native rendering, no extension needed |
| `push.grouping.iosKey` | `threadIdentifier` = object reference (conversationId, auctionId, orderId) | Groups notifications into stacks |
| `push.grouping.androidKey` | `groupKey` = object reference + summary notification | Groups with summary |
| `push.retry.maxAttempts` | 3 | Exponential backoff with jitter |
| `push.retry.backoffMs` | `min(1000 * 2^attempt, 8000) + random(0, 500)` | Exponential with jitter |
| `push.delivery.receiptCheck` | Poll Expo receipt API after send | Confirms delivery to APNs/FCM |
| `push.analytics.events` | `push_sent`, `push_delivered`, `push_opened`, `push_action_tapped`, `push_muted` | Per-category tracking |
| `push.quietHours.enforcement` | Server-side; hold until quiet hours end | Client-side check is insufficient |
| `push.tokenLifecycle.refresh` | `Notifications.addEventListener('pushTokenReceived', re-register)` | iOS 16+ token rotation |
| `push.tokenLifecycle.cleanup` | Mark token inactive on `DeviceNotRegistered` error | Prevents stale token accumulation |
| `push.foregroundDisplay` | In-app banner/toast with tap-to-navigate | Not just a count increment |
| `push.fallbackChannel` | In-app notification event + email for critical | When push delivery fails |
| `deeplink.prefixes` | `[Linking.createURL('/'), 'https://thryftverse.com', 'https://www.thryftverse.com']` | Custom scheme + universal links |
| `deeplink.config` | Path-to-screen mapping in NavigationContainer `linking.config` | Schema-driven, not if/else chain |
| `deeplink.associationFiles.ios` | `apple-app-site-association` at `https://thryftverse.com/.well-known/` | Required for Universal Links |
| `deeplink.associationFiles.android` | `assetlinks.json` at `https://thryftverse.com/.well-known/` | Required for App Links |
| `deeplink.routeObject` | `{ screen: string, params: Record<string, unknown> }` in every push payload | Explicit, typed, no inference |
| `deeplink.testCoverage` | Unit + integration + E2E for every event type → route | CI gate on schema changes |

---

## 11. What "feels AI-made" here, and how to patch it

| AI tell in current state | Patch |
|---|---|
| Single `'default'` Android channel with `IMPORTANCE_MAX` | Per-category channels mapped to semantic roles |
| No rich media in push payload | Include `imageUrl`; configure iOS Notification Service Extension |
| Manual `Linking.getInitialURL` + `navigationRef.navigate` | NavigationContainer `linking` prop with path-to-screen config |
| No retry/backoff on `fetch(expoPushApiUrl)` | Exponential backoff with jitter, max 3 retries |
| No grouped notifications | `threadIdentifier` (iOS) + `groupKey` (Android) in payload |
| No action buttons | Notification categories with action identifiers |
| Foreground push only increments a count | Visible in-app banner with tap-to-navigate |
| Client-side quiet hours only | Server-side quiet hours enforcement |
| No token refresh listener | `pushTokenReceived` event listener + re-register |
| No delivery receipts or CTR tracking | Expo receipt API + analytics events per notification |
| No `apple-app-site-association` / `assetlinks.json` | Host association files at `.well-known/` |
| `Alert.alert()` for deep-link success/error | Designed in-app surface, not native alert dialog |
| Separate `pushNavigationRef` from main `navigationRef` | Single navigation ref; use NavigationContainer `linking` prop |
| `VALID_SCREENS` hardcoded allowlist | Schema-driven from navigation types |
| Payload-inference fallback for routing | Explicit `route` object in every payload |

Each of these is a defect a senior mobile engineer would not ship. The aggregate is the reason a user would receive a ThryftVerse push notification, tap it, land on the home screen instead of the target, and conclude "this app is broken." Patching them is the path from fragile push delivery to a flagship notification system.

---

*Generated 2026-08-18 by the ThryftVerse flagship research programme. Live 2026 web benchmark + production codebase audit + psychology + micro/macro prescription. Sources: OneSignal, Pushwoosh, Appbot, Expo, React Navigation, React Native docs.*
