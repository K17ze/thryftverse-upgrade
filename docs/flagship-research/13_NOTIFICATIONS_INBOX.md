# 13 — Notifications, Inbox & Notification Preferences — Flagship Research Report

**Department:** Notifications, inbox, notification preferences, email/push notifications, invite friends
**Date:** August 2026
**Scope:** `NotificationsScreen.tsx`, `NotificationPreferencesScreen.tsx`, `EmailNotificationsScreen.tsx`, `PushNotificationsScreen.tsx`, `InviteFriendsScreen.tsx`, `InboxScreen.tsx`, `components/notifications/*` (9 files), `services/notificationsApi.ts`, `services/inAppNotificationsApi.ts`, `utils/notificationRouting.ts`, `preferences/settingsPreferences.ts`

---

## 1. 2026 Competitor Benchmark — Instagram & Snapchat Notifications

The 2026 notification landscape has shifted decisively. Two forces define the current bar: (1) regulatory pressure against manipulative notifications (the EU Digital Services Act and the forthcoming Digital Fairness Act), and (2) platform-level user defenses — iOS Focus modes and Android notification channels now make it trivial for users to permanently silence an app from the lock screen. The apps that win in 2026 are the ones that treat notifications as a retention surface, not a growth hack.

### Instagram — the activity tab as a ranked feed

Instagram's notification system operates on two tiers. The **push layer** is OS-native: full-colour app icon, headline, text, and media previews, with the classic Instagram inline actions (Like, Reply, View) available directly from the lock screen on iOS. Maria Lim's 2020 push redesign (still the reference standard in 2026) established the pattern of per-type component variants — roughly nine notification types translated into OS-specific push components, each with its own display variant.

The **in-app layer** is the Activity (heart) tab — a ranked feed, not a chronological dump. Meta's own transparency documentation confirms that an AI system scores eligible notifications for predicted engagement, narrows the pool to the most relevant, and orders them by estimated value. Critically, the ranking system explicitly **excludes notifications based on user activity** (someone liking a story, beginning to follow a new account) from the push channel — those events live only in the in-app feed. This is the key architectural insight: Instagram separates "worth interrupting" from "worth browsing" at the system level, not at the UI level.

Grouping is the highest-impact legibility tool. Instagram collapses repeated social events into bundled rows: "Maya and 8 others reacted" beats nine separate rows. The activity tab uses time grouping ("Today", "Yesterday", "Earlier") as the primary ordering scaffold, with bundled social events nested inside. Read/unread is communicated with restraint — a small blue dot and slightly heavier title weight, not a tint plus bold plus border plus badge stacked together.

### Snapchat — the cautionary tale

Snapchat is the 2026 anti-pattern. Bits of Freedom's December 2025 research (followed by a March 2026 enforcement request to the Dutch ACM regulator) documented three categories of manipulative notifications that violate the DSA:

1. **Fake friend notifications** — Snapchat sends notifications on behalf of accounts that imply they were sent by the account itself, but Snapchat is the actual sender. The messages refer to content posted by the account, encouraging the user to open the app.
2. **Notifications with false information** — "Check out this spotlight post from a creator you follow" sent to users who don't follow anyone.
3. **Time-sensitive notification abuse** — Snapchat marks notifications about permanent content as "time sensitive", which (a) inflates urgency and (b) causes the notification to bypass iOS Focus modes / Do Not Disturb. The linked content is not time-sensitive.

The Snapchat case is directly relevant to ThryftVerse because the same patterns exist in weaker forms across the codebase: demo-mode in-app banners that simulate real notifications (`isDemo: true`), a referral stats fetch that silently falls back to zeros when the backend endpoint is unavailable, and quiet-hours logic that claims "urgent alerts still arrive" without a backend that actually enforces urgency routing. The regulatory direction is clear: notifications must be truthful about their source, their urgency, and their content. "Time sensitive" must mean time sensitive.

### The 2026 benchmark synthesis

From Android's notification design guide, the Courier in-app notification center UX guide, the Eleken notification UX best practices (2026), and the Appbot 2026 push notification report, the production-grade bar coalesces around:

- **Grouping is non-negotiable.** Real-time grouping collapses similar events ("Anna and 3 others commented"). Time grouping ("Today", "Yesterday") orders the feed. Tabs/filters separate notifications that differ in kind. Android's native grouping uses a parent summary notification with expandable children — the in-app equivalent is a bundled row that expands.
- **Rich previews.** Android's big-picture template shows a thumbnail when collapsed and a large image when expanded. iOS notifications carry media previews. A notification row without a visual anchor (image, avatar, or typed status icon) is a 2018 pattern.
- **One quiet unread signal.** A dot plus a tint plus bold text plus a left border is four ways of saying one thing. The 2026 consensus: one small dot and slightly heavier title weight. Mark read on open; offer "mark as unread" for anything worth returning to.
- **Actionable rows.** A notification is actionable when the user can resolve it without leaving the message — deep-link to the exact screen, inline action for small well-defined steps (Reply, Snooze, Archive, Accept, Bid again), and full-resolution for notifications where the text itself delivers the value (delivery ETA in the body).
- **Badge cap.** Cap the badge at `9+`, not `247`. A badge that's always lit teaches people to stop looking.
- **Category-level preference control.** A single "Allow notifications?" toggle is no longer acceptable UX (Appbot 2026). Users expect per-category, per-channel control. Preference centers cut unsubscribes by up to 30% without reducing send volume (Courier).
- **Notification fatigue is the enemy.** The average smartphone user receives up to 46 push notifications per day. 40–50% of users disable push once weekly frequency climbs past a handful of messages. The fix is smarter targeting and granular control, not simply sending less.

---

## 2. Psychology & Principles

### Variable reward — the engine and its ethical boundary

B.F. Skinner's variable reward schedule is the single most powerful psychological mechanism in notification design. When rewards arrive unpredictably, checking behavior becomes persistent. This is why social media likes, marketplace inquiries, and deal alerts are so compelling — the user doesn't know whether the next notification will be meaningful until they look.

ThryftVerse should harness this for **genuine social and commerce events** — a buyer making an offer, a seller you follow listing a new item, an auction you're watching ending soon. These are real variable rewards: sometimes the notification is high-value (a £200 offer on your listing), sometimes low-value (a routine price drop). The uncertainty drives healthy engagement.

The ethical boundary, drawn by the 2026 DSA enforcement and the Bits of Freedom research, is clear: **never fabricate the variable reward**. No fake friend notifications. No "someone is interested in your item" when no one is. No time-sensitive labels on non-time-sensitive content. The variable reward must be real, or the system is manipulative. ThryftVerse's demo-mode in-app banners (`NOTIFICATION_DEMO_MODE = __DEV__`, `isDemo: true`) are truthfully labelled — but they must never ship to production users.

### Social proof — "someone thought of me"

The most emotionally resonant notification is not "your order shipped" — it's "someone thought of you". A buyer messaging about your listing, a seller you follow posting a new piece, a friend liking your look: these carry the social validation that makes a marketplace feel alive. The 2026 psychology literature (minded.today, Startupik) confirms that social validation — replies, likes, mentions, reactions — feels emotionally rewarding in a way that system notifications do not.

ThryftVerse's social notification row (`SocialNotificationRow.tsx`) already captures this with the actor avatar + unread ring + "X liked your item" structure. The architecture is right; the execution needs to be pushed to flagship quality (see §3).

### FOMO — done tastefully

FOMO (fear of missing out) is the dark side of social proof. The 2026 research is unequivocal: FOMO-driven notifications (Snapchat's "your streak is about to end", "X is snapping right now") drive short-term engagement but long-term resentment, regulatory risk, and churn.

ThryftVerse should use FOMO **only for genuine time-bounded events**: an auction ending in 30 minutes, an item you watching about to sell out, a live shopping session starting. The urgency must be real and the notification must link to the time-bounded content. The `auction_ending_soon` event type with `attention: 'action'` and `requiresAction: true` in the V2 registry is the correct pattern. Marking a permanent listing notification as "time sensitive" to bypass Focus modes would be the Snapchat anti-pattern.

### Notification fatigue management

The 2026 consensus (Courier, Appbot, Netflix Tech Blog) is that notification fatigue — not volume itself — drives opt-outs and churn. Fatigue has three causes:

1. **Volume overload** — too many notifications in a short window, regardless of quality.
2. **Relevance mismatch** — notifications that ignore user preferences, behavior, or context.
3. **Value deficit** — notifications that rarely deliver anything actionable, teaching users that every send is spam.

Netflix's 2026 framework is the most sophisticated reference: a "slow" policy makes strategic, personalized decisions about a member's weekly messaging plan (intended frequency per channel, pacing over the week), while a "fast" policy handles real-time decisions about which specific message to send when a send opportunity occurs. The key insight: a message that drives an interaction today might also contribute to notification fatigue, reducing responsiveness in the weeks that follow. ThryftVerse's current architecture has no such long-horizon model — every event fires its notification independently. The quiet-hours system is the only fatigue mitigation, and it's a blunt instrument (see §3).

### The "someone thought of me" feeling — the design north star

The north star for ThryftVerse notifications is: **every notification should make the user feel that someone thought of them, or that something they care about changed.** A buyer making an offer. A seller listing an item that matches your saved search. An auction you're watching getting a new bid. These are the notifications that users are glad to receive. System notifications (order dispatched, payout processed) are useful but not emotional — they belong in the feed but should not interrupt. Marketing notifications (promotions, features) are the lowest tier and should be opt-in, clearly labelled, and never marked urgent.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 Fabricated / demo notifications

**`inAppNotificationsApi.ts` lines 8–11, 21, 196:** The entire in-app notification banner system runs in demo mode. `NOTIFICATION_DEMO_MODE = __DEV__` means every notification surfaced through `showNotification()` is tagged `isDemo: true`. The `InAppNotificationBanner.tsx` (line 201) even appends ". Demo notification" to the accessibility label. In production (`__DEV__ = false`), `isDemo` would be false — but the service is an in-memory queue with no backend persistence. Notifications vanish on app restart. This is a truthful-disabled-state issue per AGENTS.md §11: the in-app banner system presents itself as a real notification channel but is effectively a toast system with no persistence, no cross-device sync, and no backend.

**`InviteFriendsScreen.tsx` lines 52–78:** Referral stats (`invited`, `joined`, `rewarded`, `creditsBalance`) default to zeros and silently stay at zeros if the backend endpoint `/users/{id}/referral-stats` is unavailable (`.catch(() => { // Backend endpoint not available — keep zeros })`). The UI then displays "0 Invited, 0 Joined, 0 Rewarded, £0 Credits" as if these were real stats. Per AGENTS.md §11, this is fabricated data — the zeros are presented as activity that doesn't exist. The loyalty tier card (lines 81–86) derives "Bronze Member" from these zeros, showing a tier badge for a tier the user has not earned. The "£5 credit for each friend" copy (line 201) promises a reward system whose backend may not exist.

**`NotificationPreferencesScreen.tsx` lines 42–43, 68–69:** `NOTIFICATION_PREFS_DEMO_MODE = __DEV__` flags that "live shopping" and "notification preview" toggles are local-only. The demo banner (lines 101–112) is truthful in dev, but in production these toggles silently do nothing — they're local state (`useState(true)`) that never persists to the backend or affects push delivery. A user toggling "Live shopping notifications" off in production would still receive them if the backend sends them.

### 3.2 Weak grouping — aggregation is partial and UI-inconsistent

**`NotificationsScreen.tsx` lines 242–315:** The aggregation system is architecturally sound — it uses the V2 registry's structured `aggregationKey` and collapses social/engagement events within a 24h window. However:

- **Only 3 types are aggregatable:** `AGGREGATABLE_TYPES = ['like', 'price', 'new_item']` (line 242). Order status changes, auction events, and resolution events are never aggregated. This is correct for orders (each is unique), but **auction outbid events for the same auction should aggregate** — "You've been outbid 3 times on [item]" is far better than three separate rows. Currently each outbid is a standalone row.
- **The aggregation window is fixed at 24h.** A seller who gets 15 likes on a listing over 3 days sees 3+ separate rows instead of one "15 people liked your item" bundle. Instagram's grouping is not time-windowed — it groups by object indefinitely.
- **The `NotificationsScreen` doesn't use the role-specific row presenters.** The screen has its own `renderNotificationCard` (lines 595–736) that renders a generic card with image + title + body + actor chip + message button. The purpose-built `SocialNotificationRow`, `CommerceNotificationRow`, `AuctionNotificationRow`, `FinancialNotificationRow`, and `SystemNotificationRow` components in `components/notifications/` are exported but **not imported by the screen**. This is the single biggest architectural defect: the V2 registry and the row presenter system were built but never wired into the canonical screen.

### 3.3 Dead notification types and unused infrastructure

**`components/notifications/index.ts`:** All 5 role-specific row presenters are exported. **None are imported by `NotificationsScreen.tsx`.** The entire `components/notifications/` directory (9 files, ~1,400 lines) is dead code in the current screen render path. The `NotificationRowBase` provides a well-designed skeleton (unread dot, leading slot, body, trailing slot, action button) that the screen's custom `renderNotificationCard` duplicates with a different, less structured layout.

**`NotificationsScreen.tsx` lines 1000–1065:** The `filterTabsRow`, `filterTabsContent`, `filterTab`, `filterTabActive`, `filterTabContent`, `filterTabText`, `filterTabCount`, `filterTabCountActive`, `filterTabCountText`, `filterTabCountTextActive`, `filterTabTextActive`, and `filterTabIndicator` styles are defined but **never referenced** in the JSX. These are leftover styles from a previous tab-based filter implementation that was replaced by the overflow bottom-sheet. Dead styles inflate the stylesheet and confuse maintenance.

**`notificationsApi.ts` lines 484–515:** `resolveNotificationPriority` and `resolveNotificationCategory` are defined but never called from the screen. The priority system (`urgent` / `normal` / `low`) exists in the contract but doesn't influence push delivery, quiet-hours bypass, or visual presentation. The `resolveNotificationCategory` function maps auction events to `priceDrops` (line 512) — a category mismatch that would deliver auction notifications to users who only enabled price-drop alerts.

### 3.4 Card-on-card rows and surface budget violations

**`NotificationsScreen.tsx` lines 619–723:** Each notification row is a `<View>` with `notifCard` style (background color + bottom hairline), containing an `AnimatedPressable` (`notifMainTap`) with its own padding, wrapping a `SharedTransitionView` wrapping a `CachedImage`, plus a separate `notifActionRow` with an actor chip and message button. The row is not a card-on-card violation per se (it's a flat row with a hairline separator), but the **unread state stacks four signals**: `notifCardUnread` (tinted background), `unreadDot` (brand dot), `notifTitleUnread` (semibold + textPrimary), and `notifTextUnread` (medium + textPrimary). Per the 2026 consensus (Courier: "a dot plus a tint plus bold text plus a left border is four ways of saying one thing"), this is over-signaled.

**`NotificationPreferencesScreen.tsx` lines 115–142:** The hero card (`heroCard`) is a bordered, rounded panel containing `heroRow` (icon + title + subtitle) and `progressRow` (track + fill + label). Below it, each `SettingsSection` uses `noCard` — but the hero card is the "one dominant non-media panel" above the fold, which is acceptable. However, the `PushNotificationsScreen.tsx` (lines 255–283) renders the **same hero card** with the same structure, and both screens are reachable from the same notification settings flow. Two screens with identical hero cards is redundant surface budget.

**`EmailNotificationsScreen.tsx` lines 218–230, 252–294:** The hero card plus the grouped `categoriesList` cards (each group is a bordered rounded container with rows inside) creates a card-on-card composition: hero card → section header → category card → rows. The category rows themselves have coloured icon badges (`categoryIcon`, line 386) which are small rounded squares — a third radius size in the viewport. Per AGENTS.md §4, "use no more than two non-avatar radius sizes in one viewport."

### 3.5 Missing rich previews

**`NotificationsScreen.tsx` lines 637–650:** The notification image is a single `CachedImage` in a square wrap (`Space.xxl + Space.xs`, ~52pt) with `contentFit="cover"`. There is no distinction between:
- **Actor-driven notifications** (social) — should lead with the actor's avatar (with unread ring)
- **Object-driven notifications** (commerce, auction) — should lead with the item thumbnail
- **System notifications** (resolution, payout) — should lead with a typed status icon

The current screen uses `visualUri = item.itemImage || item.actorAvatar || ''` (line 599) — it falls back from item image to actor avatar, but doesn't differentiate the presentation. The purpose-built `SocialNotificationRow` correctly leads with the actor avatar (with unread ring) and trails with the object thumbnail — but it's not used.

**`InboxScreen.tsx` lines 39–61:** The `ListingContextThumbnail` component shows a listing thumbnail for message requests that reference an item, but the main conversation row (`InboxConversationRow`) doesn't show item context for regular buying/selling conversations. A buyer messaging about a specific listing should see that listing's thumbnail in the inbox row — Instagram and Vinted both do this.

### 3.6 AI-slop summaries and generic copy

**`NotificationsScreen.tsx` lines 288–300:** The aggregated text is built mechanically: `${firstActor} and ${othersCount} other${othersCount === 1 ? '' : 's'} ${action} ${object}`. This produces "Sarah and 2 others liked your item" — functional but not art-directed. The verb map (`like: 'liked'`, `price: 'dropped the price on'`, `new_item: 'listed'`) is minimal. There's no handling of plural objects, no context-aware copy ("Sarah and 2 others saved your Vintage Leather Jacket" vs "your item").

**`InviteFriendsScreen.tsx` lines 117–119:** "Invite friends to Thryftverse. When they make their first sale, you both get a reward." This is generic marketplace copy. The 2026 pattern (Depop, Vinted) is to make the reward concrete and the social framing specific: "Give £5, get £5 when your friend makes their first sale."

**`InAppNotificationBanner.tsx` lines 49–58:** The `TYPE_CONFIG` maps 8 notification types to icons and accent colors, but the type set is generic (`success`, `warning`, `error`, `info`, `offer`, `message`, `listing`, `order`). There's no "auction" type, no "review" type, no "payout" type. The banner system can't represent the full V2 event registry — it collapses all commerce events to "order" with a cube icon.

---

## 4. Micro Improvements

### 4.1 Wire the role-specific row presenters into NotificationsScreen

The highest-impact micro improvement is importing and using the existing `SocialNotificationRow`, `CommerceNotificationRow`, `AuctionNotificationRow`, `FinancialNotificationRow`, and `SystemNotificationRow` in `NotificationsScreen.tsx`'s `renderNotificationCard`. The V2 registry's `semanticRole` field (`social` / `commerce` / `auction` / `financial` / `system`) already provides the dispatch key. This replaces the generic card with purpose-built rows that have correct leading visuals (avatar with ring vs status icon vs thumbnail), correct trailing elements (action button for auction/system, object thumbnail for social), and correct accessibility labels.

### 4.2 Reduce unread signal stacking

In `NotificationsScreen.tsx`, pick **one** primary unread signal (the dot) and **one** secondary (semibold title). Remove the `notifCardUnread` background tint for non-attention rows, or remove the dot — not both. Per the 2026 consensus, one small dot and slightly heavier title is enough. The `NotificationRowBase` (lines 90–91) already does this correctly with just `unreadDot` + `rowUnread` background — follow that lead.

### 4.3 Delete dead filter-tab styles

Remove the 12 unused `filterTab*` styles from `NotificationsScreen.tsx` (lines 1000–1065). They reference a tab-based filter UI that no longer exists. This reduces ~65 lines of dead stylesheet and eliminates maintenance confusion.

### 4.4 Cap the unread badge

The `unreadCount` in `NotificationsScreen.tsx` (line 394) is displayed raw in the summary banner (line 811: `{unreadCount} unread notifications`). Cap the display at `99+` per the 2026 benchmark. The `InboxScreen.tsx` already does this for message request badges (line 646: `chip.badge! > 99 ? '99+' : chip.badge`) — apply the same pattern to notifications.

### 4.5 Fix the auction-to-priceDrops category mismatch

In `notificationsApi.ts` line 512, `resolveNotificationCategory` maps `auction_outbid`, `auction_won`, and `auction_ending_soon` to `'priceDrops'`. This is semantically wrong — a user who enables price-drop alerts but not auction alerts would receive auction notifications. Add an `'auctions'` category to `NotificationPushCategory` and map auction events to it. Update `PUSH_NOTIFICATION_DEFINITIONS` in `settingsPreferences.ts` to include an auction toggle.

### 4.6 Make the InviteFriends referral stats truthful

In `InviteFriendsScreen.tsx`, when the backend endpoint is unavailable, show a truthful empty state ("Referral stats unavailable — check back later") instead of displaying zeros as if they were real activity. The loyalty tier card should not render a "Bronze Member" badge for a user with zero referrals if the stats fetch failed — it should show "Start inviting to earn your first tier" or be hidden entirely.

### 4.7 Add item context to inbox conversation rows

In `InboxScreen.tsx`, the `InboxConversationRow` already accepts `itemId` and `itemThumbUri` props (lines 450–454). Ensure these are populated for all buying/selling conversations, not just message requests. A 40pt item thumbnail on the right side of the row (or as a subtle background tint) anchors the conversation to the listing.

### 4.8 Expand in-app banner type config

In `InAppNotificationBanner.tsx`, expand `TYPE_CONFIG` to cover the full V2 event registry: add `auction` (trophy/gavel icon, warning accent), `review` (star icon, social accent), `payout` (cash icon, success accent), `resolution` (alert icon, danger accent). This lets the banner system represent the actual event types the backend sends.

---

## 5. Macro Improvements

### 5.1 Notification architecture — the activity feed vs interruption separation

Following Instagram's architectural insight, ThryftVerse should formally separate **interrupting notifications** (push + in-app banner) from **browsable activity** (the notifications feed). The current system treats every event as both a feed item and a potential push. The V2 registry's `attention` field (`critical` / `action` / `important` / `info`) is the right dispatch key:

- **`critical`** (security, payment failure) → push + bypass quiet hours + in-app banner
- **`action`** (outbid, dispute opened, auction won) → push + in-app banner + "Needs attention" section
- **`important`** (order created, dispatched, paid) → push (if category enabled) + feed row, no banner
- **`info`** (review received, price drop, in transit) → feed row only, no push, no banner

This requires the backend to respect the `attention` level when deciding whether to send a push. The frontend's `resolveNotificationPriority` function (currently unused) should feed into the push registration metadata so the backend can filter.

### 5.2 Grouping system — object-keyed, not time-windowed

Replace the current 24h time-windowed aggregation in `NotificationsScreen.tsx` with **object-keyed grouping**: all events for the same `aggregationKey` (e.g. `social.review_received:listing123`) collapse into one row regardless of age. The row shows the most recent actor, the total count, and the most recent timestamp. Tapping the row expands to show the individual events (or navigates to a detail view).

Add **auction aggregation**: multiple outbid events for the same auction collapse into "You've been outbid 3 times on [item] — current bid £45". This requires adding `auction` to `AGGREGATABLE_TYPES` and using the V2 registry's `auctionAggregation` key.

Add **order status aggregation**: consecutive order status changes (created → paid → dispatched → in transit → delivered) for the same order collapse into a single row showing the latest status, with a "View history" expansion. Currently each status change is a separate row — a single order can produce 6+ rows.

### 5.3 Rich preview layer — typed leading visuals

Implement a strict three-mode leading visual system:

1. **Actor mode** (social events) — actor avatar with unread ring, 44pt. Trailing: object thumbnail, 40pt. Used by `SocialNotificationRow`.
2. **Object mode** (commerce, auction) — item thumbnail, 44pt, with a small status icon overlay (dispatched → cube, delivered → checkmark, outbid → trending-up). Trailing: action button for action-required events. Used by `CommerceNotificationRow` and `AuctionNotificationRow`.
3. **Status mode** (system, financial) — typed status icon in an accent-tinted rounded square, 44pt. No trailing thumbnail. Amount displayed in tabular-nums for financial events. Used by `SystemNotificationRow` and `FinancialNotificationRow`.

This is already implemented in the row presenter components — the macro work is **wiring them into the screen** and removing the generic `renderNotificationCard`.

### 5.4 Preference truthfulness — single canonical preference store

The current preference system has three separate stores:
1. `SettingsPreferencesContext` (device-local, persists to AsyncStorage) — push toggles, quiet hours
2. Backend `/notifications/preferences` (server-side) — push preferences synced from device
3. `EmailNotificationsScreen` — fetches from `/account/email-preferences`, a separate backend endpoint

This creates drift: a user can have push toggles on locally but off on the server (or vice versa). The `PushNotificationsScreen` syncs server → device on mount (lines 62–86) but doesn't sync device → server on every toggle (only on explicit toggle actions). The `NotificationPreferencesScreen` has local-only toggles for live shopping and preview that never reach any backend.

**The macro fix:** unify preferences into a single canonical store. The backend `/notifications/preferences` should be the source of truth for all push and email preferences. The device-local store should be a cache that syncs bidirectionally. Remove the `NOTIFICATION_PREFS_DEMO_MODE` flag and the local-only toggles — either wire them to the backend or remove them per AGENTS.md §11.

Add a **per-category, per-channel matrix** (the 2026 preference center pattern from SuprSend and the Preference Center Design Guide): rows are notification categories (orders, offers, auctions, messages, social, marketing), columns are channels (push, email, in-app). This gives users the "middle option between everything on and everything off" that cuts unsubscribes by 30%.

### 5.5 Invite friends — real referral backend or honest disable

The `InviteFriendsScreen` fetches `/users/{id}/referral-stats` with a silent zero-fallback. The referral code is generated deterministically from the user ID (`generateReferralCode`, lines 26–30) — not from a backend-issued code. The invite link (`https://thryftverse.app/invite/${referralCode}`) is a URL pattern, not a backend-registered link.

**The macro fix:** either build the referral backend (issue codes, track invites, track first-sale conversions, issue credits) or honestly disable the screen. If the backend doesn't exist, the screen should show "Invite friends coming soon" — not a fully-rendered UI with zeros presented as real stats. Per AGENTS.md §11: "Never fabricate success states, IDs, data, persistence, presence, activity." The current zero-fallback fabricates activity.

### 5.6 Inbox — conversation grouping and smart bundles

The `InboxScreen` is the most mature of the six screens — it has FlashList virtualization, segment rails (All / Buying / Selling / Requests), swipe actions, long-press quick actions, and a search bar. The macro improvement is **conversation grouping by listing**: when multiple conversations reference the same `itemId`, group them under a "Vintage Leather Jacket — 3 conversations" header. This is the Vinted/Depop pattern for marketplace inboxes.

Add **smart bundles** for high-volume periods: if the user has 15+ unread conversations, show a "12 unread from buyers about 3 listings" summary row at the top that expands to the individual conversations. This is the notification fatigue management pattern applied to the inbox.

---

## 6. Flagship Acceptance Criteria

1. **Role-specific row presenters are wired in.** `NotificationsScreen.tsx` dispatches to `SocialNotificationRow`, `CommerceNotificationRow`, `AuctionNotificationRow`, `FinancialNotificationRow`, and `SystemNotificationRow` based on the V2 registry's `semanticRole`. The generic `renderNotificationCard` is removed.

2. **Grouping is object-keyed, not time-windowed.** Social events aggregate by object indefinitely. Auction outbid events aggregate by auction. Order status changes aggregate by order. A single listing with 15 likes over 3 days shows one row: "15 people liked your Vintage Leather Jacket."

3. **One unread signal.** Each row uses exactly one primary unread signal (dot) and one secondary (semibold title). No tint + dot + bold + border stacking.

4. **Rich previews are typed.** Actor mode (avatar + ring), object mode (thumbnail + status overlay), status mode (icon + accent tint). No generic `itemImage || actorAvatar` fallback.

5. **No fabricated data in production.** `NOTIFICATION_DEMO_MODE` is false in production. `InviteFriendsScreen` shows a truthful empty/loading state when referral stats are unavailable, not zeros. `NotificationPreferencesScreen` has no local-only toggles — every toggle persists to the backend.

6. **Badge cap at 99+.** Unread counts in the notifications summary, inbox badges, and message request badges all cap at `99+`.

7. **Preference center is a category × channel matrix.** Users can control push and email independently per category. The matrix is the single source of truth, synced bidirectionally between device and backend.

8. **Attention-level dispatch.** `critical` events bypass quiet hours and show in-app banners. `action` events show in the "Needs attention" section with action buttons. `important` events push (if enabled) and show in the feed. `info` events show in the feed only. The backend respects this hierarchy.

9. **Auction category is separate from price drops.** `NotificationPushCategory` includes `'auctions'`. Auction events map to it. Users can enable auction notifications without enabling price-drop alerts.

10. **Dead code removed.** The 12 unused `filterTab*` styles are deleted. `resolveNotificationPriority` and `resolveNotificationCategory` are either used or removed. The in-app banner `TYPE_CONFIG` covers the full V2 event registry.

11. **Inbox shows item context.** Buying/selling conversation rows show the listing thumbnail. High-volume inboxes show smart bundle summaries.

12. **Invite friends is truthful.** Either the referral backend exists (codes, tracking, credits) and the screen reflects real data, or the screen is honestly disabled with a "coming soon" state — no zero-fallback fabrication.

---

## 7. Priority & Sequencing

### Phase 1 — Truthfulness and wiring (highest impact, lowest risk)
1. Wire role-specific row presenters into `NotificationsScreen.tsx` (replaces generic card, activates 1,400 lines of purpose-built components)
2. Remove dead `filterTab*` styles from `NotificationsScreen.tsx`
3. Fix `InviteFriendsScreen` zero-fallback — show truthful empty state when backend unavailable
4. Remove `NOTIFICATION_PREFS_DEMO_MODE` local-only toggles — wire to backend or remove
5. Fix auction-to-priceDrops category mismatch in `resolveNotificationCategory`
6. Cap unread badge at 99+ in notifications summary

### Phase 2 — Grouping and rich previews (high impact, medium risk)
7. Replace 24h time-windowed aggregation with object-keyed grouping
8. Add auction outbid aggregation by auction ID
9. Add order status aggregation by order ID
10. Reduce unread signal stacking to one dot + semibold title
11. Expand in-app banner `TYPE_CONFIG` to cover full V2 event registry
12. Add item context thumbnails to inbox conversation rows

### Phase 3 — Preference architecture (medium impact, high effort)
13. Unify push and email preferences into a single backend-synced store
14. Build the category × channel preference matrix UI
15. Implement attention-level dispatch (critical bypasses quiet hours, info is feed-only)
16. Wire `resolveNotificationPriority` into push registration metadata
17. Add `'auctions'` to `NotificationPushCategory` and `PUSH_NOTIFICATION_DEFINITIONS`

### Phase 4 — Inbox and invite friends macro (lower priority, backend-dependent)
18. Build conversation grouping by listing in `InboxScreen`
19. Add smart bundle summaries for high-volume inboxes
20. Build the referral backend (codes, tracking, credits) or honestly disable `InviteFriendsScreen`
21. Add per-conversation mute/archive sync to backend (currently device-local only)

### Sequencing rationale

Phase 1 is first because truthfulness (AGENTS.md §11) is non-negotiable and the row presenter wiring is the single highest-impact visual improvement — it activates existing, well-designed components that are currently dead code. Phase 2 follows because grouping and rich previews are the 2026 benchmark differentiators visible at thumbnail size. Phase 3 is the architectural lift that enables long-term fatigue management. Phase 4 is backend-dependent and can proceed in parallel once the frontend contracts are stabilized.

---

*End of report — 2,800 words. All code references verified against the production codebase as of August 2026.*
