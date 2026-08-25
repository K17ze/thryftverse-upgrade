# 18 — Notifications and Communication Preferences: Principal Engineering Decision Record

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Messaging Platform + Mobile Platform + Privacy/Legal
**Status:** **P1 department with four P0 truth/delivery defects**
**Recommended status:** **PARTIAL — PREFERENCE ENFORCEMENT IS NOT RELIABLE**

---

## 1. Executive verdict

ThryftVerse has a durable notification inbox, device registry, backend preference rows, idempotent event insertion, push jobs, realtime inbox events, a server-integrated Push Notifications screen and a separate server-integrated Email Notifications screen. This is real infrastructure, not a mock.

It is nevertheless unsafe to claim that notification preferences are consistently honored:

1. `NotificationPreferencesScreen.tsx` is a competing consolidated settings surface whose category/quiet-hour state is device-local. Its banner at `:162` says "Most preferences sync across devices" even though this screen never calls `notificationsApi`.
2. Frontend taxonomy includes `auctionAlerts`; backend `NOTIFICATION_PUSH_CATEGORIES` at `index.ts:8579–8580` does not. Updating that preference returns `INVALID_PREFERENCE_CATEGORY`.
3. Backend `mapEventToPushCategory` at `index.ts:8584–8591` does not map auction, follower or new-listing events. Those notifications bypass user category suppression.
4. Suppressed durable events remain `status='queued'`. An idempotent producer retry enters the existing-event branch and enqueues any queued event **without re-checking preference**. A push suppressed on the first call can therefore be sent by retry.

Delivery truth is also overstated: `processPushQueueJob` treats HTTP 200 from Expo as successful delivery and does not parse per-ticket errors or fetch receipts. The provider message ID is fabricated as `expo:${job.eventId}` (`index.ts:9116`) rather than storing the actual receipt ID. Expo's official August 2026 documentation explicitly says a successful HTTP response/ticket is not delivery and receipts must be checked.

The target is one versioned, purpose-first preference service across in-app, push and email; one mobile control surface; explicit OS/device posture; server-side quiet-hour and preview enforcement; and a delivery state machine that distinguishes created, suppressed, ticketed, provider-accepted, opened and failed.

### 1.1 Maturity scorecard

| Capability | Score | Verdict |
|---|---:|---|
| Durable inbox | 3.5/5 | Cursor list, unread/read-all and realtime exist; delete client calls an absent backend event-delete route |
| Push device registration | 3.0/5 | Register/list/deactivate exists; raw tokens are returned and receipt-driven revocation is absent |
| Preference persistence | 2.5/5 | Backend rows and Push screen integration exist; consolidated screen and quiet hours remain local |
| Taxonomy consistency | 1.0/5 | Frontend/server categories and event mapping disagree; auction controls cannot persist |
| Enforcement correctness | 1.0/5 | Unmapped events bypass preferences; retry can defeat suppression |
| Delivery truth | 1.5/5 | Durable job and provider request exist; HTTP success is called sent without ticket/receipt validation |
| OS reconciliation | 2.5/5 | Push screen reads permission and registers token; no authoritative per-channel Android posture model |
| Privacy/preview | 1.0/5 | Local preview toggle exists but server always sends title/body |
| Quiet hours/digests | 0.5/5 | Device-local UI claims alerts are held; no server scheduling/suppression |
| Email preferences | 3.0/5 | Dedicated backend-linked screen; consent/purpose taxonomy still separate |
| Observability | 2.0/5 | Queue/delivery metrics exist but semantics are wrong and suppression is not represented |
| Flagship UX | 2.0/5 | Two overlapping screens; progress meter gamifies interruption rather than showing actual posture |
| **Overall** | **2.1/5** | **Credible primitives, unreliable preference contract** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Backend storage and APIs

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `008_infra_ops_foundation.sql` | 1–40 | Durable `notification_devices` and `notification_events` exist with useful indexes | Foundation |
| `043_notification_centre_truth.sql` | 4–50 | Adds read state, event type, idempotency and seven-category `notification_preferences` | Foundation |
| `routes/notifications.ts` | 90–216 | Authenticated device register/list/deactivate exists. List returns raw Expo tokens to the client | P1 |
| `routes/notifications.ts` | 218–392 | Cursor inbox, unread, single read and read-all exist. There is no `DELETE /notifications/events/:eventId` | P1 |
| `notificationsApi.ts` | 625–629 | Client exports `deleteNotificationEvent`, calling the absent DELETE route | P1 |
| `routes/notifications.ts` | 394–466 | Preference GET defaults missing rows to true; PUT validates against backend category array and transactionally upserts. No version/ETag/last-write conflict contract | P1 |

### 2.2 Competing mobile sources

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `NotificationPreferencesScreen.tsx` | 36–40 | Live shopping and preview are direct `AsyncStorage` keys | P1 |
| `NotificationPreferencesScreen.tsx` | 57–70 | Other categories and quiet hours come from `SettingsPreferencesContext`, whose effects persist to device storage only | **P0** |
| `NotificationPreferencesScreen.tsx` | 162 | "Most preferences sync across devices. Live shopping and preview settings are saved on this device only." — false claim for categories too | **P0** |
| `NotificationPreferencesScreen.tsx` | 168–186 | Summary/progress meter treats "number enabled" as the primary outcome — interruption gamification | P1 |
| `NotificationPreferencesScreen.tsx` | 278–353 | Quiet hours UI says "Non-urgent notifications are held until ${formatHour(quietHours.endHour)}" (line 351) — no server enforcement exists | **P0** |
| `PushNotificationsScreen.tsx` | — | Imports `get/updateNotificationPreferences`, device register/list/deactivate — partially authoritative | Foundation |
| `EmailNotificationsScreen.tsx` | — | Separate durable schema and screen, increasing taxonomy drift risk | P1 |

**Critical quote — false sync claim (`NotificationPreferencesScreen.tsx:160–163`):**
```tsx
        <Text style={styles.demoBannerText}>
          Most preferences sync across devices. Live shopping and preview settings are saved on this device only.
        </Text>
```
The banner says "Most preferences sync across devices" but the screen uses `SettingsPreferencesContext` (line 70) which persists to device storage only. The categories (offers, messages, orders, etc.) do NOT sync — they're local. Only the `PushNotificationsScreen` calls the server API. This is a P0 false claim under AGENTS.md §11.

**Critical quote — false quiet-hours claim (`NotificationPreferencesScreen.tsx:349–352`):**
```tsx
            <SettingsInfoBanner
              icon="moon-outline"
              text={`Urgent alerts (order updates, security) still arrive during quiet hours. Non-urgent notifications are held until ${formatHour(quietHours.endHour)}.`}
            />
```
"Non-urgent notifications are held until ${formatHour(quietHours.endHour)}" — but quiet hours are device-local only (`SettingsPreferencesContext`). The backend has no quiet-hour enforcement. Notifications are not held; they're sent regardless. This is a P0 false claim.

### 2.3 Taxonomy and enforcement defects

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `settingsPreferences.ts` | `PUSH_NOTIFICATION_DEFINITIONS` | Frontend keys: `orderUpdates`, `auctionAlerts`, `offers`, `priceDrops`, `messages`, `followers`, `wishlist`, `news` | — |
| `index.ts` | 8579–8580 | `NOTIFICATION_PUSH_CATEGORIES = ['messages', 'offers', 'wishlist', 'followers', 'orderUpdates', 'priceDrops', 'news']` — omits `auctionAlerts` | **P0** |
| `index.ts` | 8584–8591 | `mapEventToPushCategory` handles `chat_message`, `offer_accepted`, `order_*`, `review_received`, `resolution_opened`, `payout_processed`, `refund_processed`, `price_drop` only. Auction/follower/new-listing events have no category | **P0** |
| `index.ts` | 8686 | `const pushCategory = mapEventToPushCategory(eventType)` — returns `null` for unmapped events | Foundation risk |
| `index.ts` | 8687–8688 | `let shouldPush = true; if (pushCategory) { ... }` — unmapped events default to `shouldPush = true` | **P0** |
| `index.ts` | 9116 | `deliveredCount > 0 ? \`expo:${job.eventId}\` : null` — fabricated provider message ID | P1 |

**Critical quote — missing auction category (`index.ts:8579–8580`):**
```ts
const NOTIFICATION_PUSH_CATEGORIES = [
  'messages', 'offers', 'wishlist', 'followers', 'orderUpdates', 'priceDrops', 'news',
] as const;
```
No `auctionAlerts`. The frontend has an `auctionAlerts` toggle. When a user toggles it, the PUT request validates against this array and returns `INVALID_PREFERENCE_CATEGORY`. The toggle is non-functional — it cannot be persisted.

**Critical quote — unmapped events bypass suppression (`index.ts:8686–8688`):**
```ts
  const pushCategory = mapEventToPushCategory(eventType);
  let shouldPush = true;
  if (pushCategory) {
```
If `mapEventToPushCategory` returns `null` (auction, follower, new-listing events), `pushCategory` is `null`, the `if` block is skipped, and `shouldPush` remains `true`. The notification is sent regardless of user preferences. This is a P0 preference bypass.

### 2.4 Provider delivery defects

| Evidence | Lines | Finding | Severity |
|---|---|---|---|
| `index.ts` | 9021–9099 | Sends one Expo HTTP request per device; does not batch, apply provider backoff or enforce stable collapse semantics | P1 |
| `index.ts` | 9052–9081 | Any HTTP 2xx increments `deliveredCount`; Expo can return ticket `{status:'error'}` inside HTTP 200 | **P0** |
| `index.ts` | 9113–9117 | Event becomes `sent` when `deliveredCount > 0`; provider message ID is `expo:${job.eventId}` — fabricated, not the actual receipt ID | **P0** |
| No receipt polling worker | — | `DeviceNotRegistered`, credential and provider failures are not authoritatively reconciled; inactive tokens persist | **P0** |

**Critical quote — fabricated provider message ID (`index.ts:9113–9117`):**
```ts
    [
      job.eventId,
      status,
      deliveredCount > 0 ? `expo:${job.eventId}` : null,
      deliveredCount > 0 ? null : 'delivery_failed',
```
`expo:${job.eventId}` — this is not a provider message ID. It's a string concatenation of "expo:" with the internal event ID. The actual Expo receipt ID (returned in the ticket response) is never stored. This means receipts cannot be polled by provider ID, and `DeviceNotRegistered` errors cannot be reconciled to specific tokens.

---

## 3. End-to-end flow traces

### 3.1 Current producer-to-user flow

```text
domain route/worker
  → queueUserNotification
    → INSERT notification_events status=queued (idempotent)
    → mapEventToPushCategory(eventType)     [index.ts:8686]
      → null for auction/follower/new-listing → shouldPush=true (bypass)
      → mapped category → read preference
        → enqueue BullMQ push job OR skip
    → record queued metric regardless
    → publish notification.queued realtime event (in-app inbox)
  → worker loads active raw tokens
  → POST once per token to Expo
  → HTTP 2xx => deliveredCount++           [index.ts:9052-9081]
  → deliveredCount > 0 => status='sent'     [index.ts:9113-9117]
  → provider message ID = `expo:${eventId}` (fabricated)
```

### 3.2 Current settings flow

```text
NotificationPreferencesScreen → SettingsPreferencesContext/AsyncStorage only
  → "Most preferences sync across devices" (false)  [:162]
  → quiet hours "held until" (false)                 [:351]
  → progress meter gamifies interruption             [:168-186]

PushNotificationsScreen
  → GET server preferences (best effort)
  → copy into local context
  → optimistic local toggle → PUT one server category
  → quiet hours still local

EmailNotificationsScreen → separate email preference API/schema
```

### 3.3 Target flow

```text
domain event
  → notification policy registry(eventType, purpose, urgency, legal basis)
  → preference/device/quiet-hour/preview evaluation snapshot
  → durable notification intent
    → suppressed(final reason) OR scheduled(nextEligibleAt) OR channel jobs
  → provider ticket validation
  → receipt reconciliation/token revocation
  → opened/actioned via client acknowledgement
  → delivery ledger/metrics
```

---

## 4. August 2026 benchmark research

### 4.1 Expo push notifications — receipt validation

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Expo push sending/receipts, updated August 2026](https://docs.expo.dev/push-notifications/sending-notifications/) | Ticket OK means Expo accepted payload, not user delivery; receipts must be checked; `DeviceNotRegistered` tokens must stop receiving sends | Current HTTP-2xx `sent` state is invalid (`index.ts:9113–9117`); build ticket/receipt reconciliation and token revocation |
| [Expo push FAQ](https://docs.expo.dev/push-notifications/faq/) | Delivery is best-effort/at-least-once to providers and can duplicate or fail | Product needs idempotent user-visible events, collapse/dedupe and no guaranteed-delivery language |
| [Expo Push Ticket documentation](https://rubydoc.info/gems/expo-server-sdk/Expo/Push/Ticket) | Ticket has `ok?`/`error?` status; error tickets expose `original_push_token` for `DeviceNotRegistered` | Parse ticket body per-response; extract receipt ID on OK; extract failed token on error |

### 4.2 Apple and Android notification guidelines

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Apple: asking notification permission](https://developer.apple.com/documentation/UserNotifications/asking-permission-to-use-notifications?language=objc) | People can allow/deny notification authorization and change it later | App "master switch" must not impersonate OS authorization; show both states and route to Settings |
| [Apple HIG: Notifications](https://developer.apple.com/design/human-interface-guidelines/notifications/) | Notifications should be timely/high-value, concise, non-duplicative and avoid sensitive content; foreground handling should be subtle | Rank/aggregate events, suppress duplicate foreground banners and default previews conservatively |
| [Android notification channels](https://developer.android.com/develop/ui/compose/notifications/channels) | Users control channel behavior; after channel creation the app cannot change behavior programmatically and should link to channel settings | Stable channel IDs and an OS-posture section are mandatory; toggles cannot promise control they do not have |

### 4.3 Regulatory

| Source | Finding | ThryftVerse application |
|---|---|---|
| [ICO Direct Marketing Guidance](https://ico.org.uk/media2/seff5ium/direct-marketing-guidance-all-1-0-2.pdf) | PECR and UK GDPR may require consent/lawful-basis analysis for direct marketing | Marketing purpose, consent evidence and transactional exceptions must be separate from generic notification toggles. Legal must approve policy |

---

## 5. Capability, channel and ownership matrix

| Concern | Current owner | Current truth | Target owner |
|---|---|---|---|
| In-app inbox visibility | notification event row | Mostly authoritative | notification intent/event service |
| Push category | duplicated frontend/backend mapping | conflicting | versioned policy registry |
| Push enabled | backend rows + local copies | split | preference service |
| Email enabled | separate user email table | durable but separate taxonomy | preference service with email projection |
| Quiet hours | device context (`NotificationPreferencesScreen.tsx:278–353`) | not enforced | preference service + scheduler |
| Preview content | device key (`NotificationPreferencesScreen.tsx:36–40`) | not enforced | server delivery renderer + OS settings |
| OS permission | device OS + partial screen state | device authoritative | device capability projection |
| Android channel behavior | OS | not represented | OS remains owner; app deep-links/reconciles |
| Token validity | device row | stale until explicit deactivation | provider receipt reconciler |
| Delivery status | HTTP response (`index.ts:9052–9081`) | mislabeled | ticket + receipt state machine |
| Marketing consent | email/push booleans | purpose/legal basis unclear | consent/communication preference service |

---

## 6. User psychology, JTBD and trust

Users are not managing "features"; they are managing interruption, privacy and the fear of missing consequential events.

### 6.1 Jobs

1. "Let urgent commerce/security messages reach me."
2. "Stop low-value interruption without breaking orders/messages."
3. "Hide sensitive content on a lock screen."
4. "Make this preference apply everywhere I use the account."
5. "Tell me when the OS — not the app — is blocking delivery."

### 6.2 Trust failures to prevent

- A toggle that cannot affect the event producer (auction toggle → `INVALID_PREFERENCE_CATEGORY`).
- "Held until 8 AM" when no server scheduler exists (`NotificationPreferencesScreen.tsx:351`).
- "Sent" when only HTTP transport succeeded (`index.ts:9113–9117`).
- A preview-off setting while body text is still transmitted.
- Re-enabling suppressed delivery on a retry.
- "All notifications off" while mandatory security/legal notices still appear without explanation.
- "Most preferences sync across devices" when categories are device-local (`NotificationPreferencesScreen.tsx:162`).

---

## 7. Strict anti-AI flagship UX specification

### 7.1 First viewport

```text
Notifications

Push is blocked by iPhone settings       Open Settings

Messages                                  On
Orders & delivery                         On
Auctions                                  Important only
Offers & price changes                    Off

Quiet hours                         22:00–07:00
```

- No progress bar for "5 of 8 enabled" (`NotificationPreferencesScreen.tsx:174–186`); interruption is not a completion game.
- No card per category. Flat grouped rows, one posture exception above fold.
- Purpose first; reveal channel detail in a drill-down only when needed.
- Preview privacy appears near posture, not buried below marketing.

### 7.2 Complete state matrix

| State | UX |
|---|---|
| Hydrating | Row-shaped skeletons; switches disabled |
| Synced | Server revision and OS posture reconciled |
| Offline cached | Show cached state/age; safe changes enter durable preference outbox |
| Optimistic update | Switch changes, subtle saving state |
| Rejected/conflict | Roll back exact row and offer latest server state |
| Unknown outcome | "Checking setting"; GET by revision/idempotency before retry |
| OS denied | App preference preserved, delivery unavailable, Settings action |
| Channel disabled | Identify Android channel and deep-link |
| No device token | Explain push unavailable; do not imply category disabled |
| Quiet hours active | Show next delivery window and exception policy |
| Mandatory purpose | Locked row with precise reason, not a generic tooltip |
| Partial provider outage | Inbox remains available; push posture shows degraded only if useful |

### 7.3 Motion/accessibility

- No celebration/haptic for enabling more notifications.
- Selection haptic on toggle; error haptic only on authoritative rejection.
- Switch labels include purpose, selected state, channel and constraint.
- Screen-reader order: posture → purposes → schedule/privacy → channel/device detail.
- Dynamic Type rows wrap without clipping switch/status.
- Reduced motion removes progress/switch flourish; state changes remain announced.

---

## 8. Target architecture and contracts

```ts
type Purpose =
  | 'direct_message' | 'order_transactional' | 'auction_activity'
  | 'offer_activity' | 'price_watch' | 'social_activity'
  | 'account_security' | 'service_legal' | 'marketing';
type Channel = 'in_app' | 'push' | 'email';

interface CommunicationPreferenceSet {
  schemaVersion: 2;
  revision: number;
  timezone: string;
  quietHours: { enabled: boolean; startLocal: string; endLocal: string; days: number[] };
  previewPolicy: 'full' | 'sender_only' | 'hidden';
  purposes: Array<{
    purpose: Purpose;
    channels: Partial<Record<Channel, 'enabled' | 'disabled' | 'mandatory'>>;
    digest: 'immediate' | 'daily' | 'weekly';
    legalBasisRef?: string;
  }>;
  updatedAt: string;
}

interface NotificationIntent {
  id: string;
  userId: string;
  eventId: string;
  eventType: string;
  purpose: Purpose;
  urgency: 'critical' | 'time_sensitive' | 'normal' | 'low';
  policyVersion: string;
  preferenceRevision: number;
  state: 'created' | 'suppressed' | 'scheduled' | 'queued' | 'ticketed' |
         'provider_accepted' | 'failed' | 'opened' | 'expired';
  suppressionReason?: 'preference' | 'quiet_hours' | 'rate_limit' | 'foreground_dedupe';
  nextEligibleAt?: string;
}
```

The registry owns event→purpose, urgency, mandatory policy, default channels, TTL, collapse key and preview renderer. Unknown events fail closed to **in-app only**, alert operations, and never default to unrestricted push.

### Device contract

Store token encrypted/tokenized; API returns `deviceId` plus redacted label, never raw token. Include platform, app version, locale, timezone, OS authorization, Android channel capabilities, token status, last seen/revoked time. Receipt reconciler deactivates `DeviceNotRegistered`.

---

## 9. Delivery and preference state machines

### Preference mutation

```text
synced(revision N)
 → optimistic(idempotencyKey, expectedRevision=N)
   → accepted(revision N+1)
   → conflict(409,current revision)
   → rejected(validation/legal constraint)
   → unknown(network lost)
unknown → GET preference/command by key → accepted|rejected|retry same key
```

### Delivery

```text
created
 → policy_evaluated
   → suppressed(final reason)
   → scheduled(nextEligibleAt)
   → queued
queued → ticket_error(failed/retryable) | ticketed(receiptId)
ticketed → provider_accepted | receipt_failed | receipt_timeout
provider_accepted → opened/actioned | expired
```

Do not use "delivered" unless the underlying channel supplies that evidence. Expo provider acceptance is not device display.

### Quiet hours

- Evaluate in the user's IANA timezone at event time.
- Persist DST-safe local schedule, never only UTC hour offsets.
- Critical account security and explicitly approved time-sensitive commerce bypass; policy table names each exception.
- Delayed events keep original event time and are re-evaluated at release for expiry/dedupe.

---

## 10. Security, privacy and threat analysis

| Threat/failure | Current exposure | Control |
|---|---|---|
| Preference bypass | `index.ts:8686–8688` — incomplete mapping, unmapped events default to `shouldPush=true` | Registry + evaluation snapshot on every enqueue/retry |
| Retry defeats suppression | Queued event re-enqueued without preference re-check | Re-evaluate preference on idempotent repair |
| Token disclosure | `routes/notifications.ts:90–216` — raw tokens returned/listed | Encryption, redaction, device IDs, log scrub |
| Account token transfer | Token ON CONFLICT changes owner | Revoke old-user association atomically; audit login transfer |
| Lock-screen disclosure | Server always sends body | Server preview renderer by policy; sensitive defaults hidden |
| Spam/fatigue | No digest/rate policy | Per-purpose budgets, collapse keys, foreground dedupe |
| Stale token | No receipt poll (`index.ts:9116` — fabricated ID) | Receipt worker + `DeviceNotRegistered` revocation |
| Misleading metrics | HTTP 2xx = `sent` (`index.ts:9052–9081, 9113–9117`) | Ticket/receipt state metrics |
| Marketing without consent | Generic news toggle/defaults | Consent evidence, purpose/legal-basis ledger |
| Cross-device overwrite | Last-write wins | Revision/If-Match conflict handling |
| Timezone/DST | Local integer hours (`NotificationPreferencesScreen.tsx:278–353`) | IANA timezone and boundary tests |
| False sync claim | `NotificationPreferencesScreen.tsx:162` | Remove or wire to server API |
| False quiet-hours claim | `NotificationPreferencesScreen.tsx:351` | Remove or implement server enforcement |

---

## 11. SLOs, SLIs and observability

| Journey | SLI | Target |
|---|---|---:|
| Preference read/write | successful authoritative requests | 99.95% monthly |
| Preference propagation | accepted write → second device p99 | ≤2 s |
| Suppression correctness | disabled-purpose pushes sent | **0** |
| Intent durability | committed source events with intent/suppression record | 99.999% |
| Time-sensitive queue latency | intent → Expo ticket p95/p99 | ≤3 s / ≤10 s |
| Receipt reconciliation | ticket → terminal receipt p99 | ≤20 min |
| Invalid token cleanup | `DeviceNotRegistered` → inactive p99 | ≤5 min |
| Duplicate visible notifications | duplicates / intents | <0.01% |
| Quiet-hours leakage | non-exempt push inside window | **0** |

Metrics: intent count by purpose/channel/state, suppression reason, queue age, ticket error, receipt error, active token churn, preference version conflicts, quiet-hour delayed/expired counts and deep-link open success. Never put title/body/token/email in labels or logs.

---

## 12. Migration, flags, compatibility and rollback

### Flags

```text
notification_policy_registry_v2
notification_preferences_v2
notification_receipts_v1
notification_quiet_hours_server
notification_preview_server
notification_settings_unified
```

### Phase 0 — immediate correctness

1. Add `auctionAlerts` to `NOTIFICATION_PUSH_CATEGORIES` (`index.ts:8579–8580`) or map auctions into an approved existing purpose; do not leave UI toggle broken.
2. Re-check preference on idempotent queued-event repair.
3. Add `suppressed` state/reason and stop recording queued metric for suppression.
4. Remove/correct quiet-hours claim (`NotificationPreferencesScreen.tsx:351`) and cross-device sync claim (`NotificationPreferencesScreen.tsx:162`) until enforcement exists.
5. Disable consolidated local screen route or redirect it to canonical Push screen.

### Phase 1 — registry and canonical preferences

- One generated purpose/event/channel registry shared as backend contract and frontend type.
- Migrate seven booleans and email preferences to v2 rows, retaining compatibility projection.
- Version/revision + idempotent mutation API.
- Canonical Notifications screen reads server; AsyncStorage becomes cache only.

### Phase 2 — provider truth/device posture

- Parse Expo ticket body; store receipt IDs (not `expo:${eventId}`).
- Receipt worker with exponential backoff and 24-hour receipt window.
- Deactivate invalid tokens; batch sends within provider limits.
- Return redacted devices and reconcile OS/channel state.

### Phase 3 — privacy, quiet hours and digest

- Server-side preview renderer.
- IANA timezone quiet-hour scheduler/exceptions.
- Dedupe, frequency budget and digest aggregation.
- Consent/legal-basis evidence for marketing.

Shadow-evaluate v1/v2 policies and log difference before routing. Rollback routes delivery through v1 while retaining v2 intent ledger. Never roll back consent evidence or receipt history. Old clients receive v1 compatibility booleans until minimum app version.

---

## 13. File/owner/dependency implementation map

| Work | Files | Owner/dependency |
|---|---|---|
| Retry/suppression correctness | `backend/api/src/index.ts` (lines 8579–8580, 8584–8591, 8686–8688), notification tests | Messaging Platform |
| Taxonomy migration | migration 043 successor, policy registry, `settingsPreferences.ts` | Messaging + Product + Legal |
| Canonical API | `routes/notifications.ts`, `notificationsApi.ts` | API/Mobile |
| Unified settings | `NotificationPreferencesScreen.tsx` (lines 162, 278–353), `PushNotificationsScreen.tsx`, context | Mobile UX |
| Receipt worker | queue/worker runtime, notification device store | Platform/SRE |
| Preview/quiet hours | renderer, scheduler, timezone profile | Privacy + Messaging |
| Email convergence | email routes/service/screen | Lifecycle Messaging |
| OS posture | Expo notification bootstrap + Android channels | Mobile Platform |

---

## 14. Test and release gates

- Every registered event type has exactly one purpose/urgency/channel policy.
- Auction/follower/order/message/marketing preference integration tests prove provider job is or is not created.
- Idempotent retry cannot change suppression outcome unless a new explicitly versioned intent is created.
- Expo HTTP 200 containing ticket error is failed, not sent.
- Receipt `DeviceNotRegistered` deactivates token.
- Quiet hours pass spring/fall DST, timezone change, cross-midnight and expired-event tests.
- Second-device preference update appears within SLO; revision conflict is truthful.
- Preview-hidden payload contains no message/order-sensitive body.
- Android channel-disabled and iOS denied states deep-link correctly.
- Logout/account switch cannot send prior user notifications to the device.
- Large Text, VoiceOver/TalkBack and reduced motion pass.
- Production canary verifies suppression leakage is zero before broad rollout.

---

## 15. Explicit non-goals

- Guaranteed device delivery language; APNs/FCM/Expo are best effort.
- In-app replacements for OS channel controls.
- AI-generated notification copy or send-time optimization before policy correctness/consent.
- A gamified "notification health" score.

---

## 16. Decisions requiring product, legal/trust and operations input

1. Define each purpose and which messages are mandatory, legally required or user-controllable.
2. Define whether category disable affects push only or in-app inbox visibility too.
3. Approve default preview policy for messages, orders, security and auctions.
4. Define quiet-hour bypass rules and auction-ending behavior.
5. Define marketing lawful basis/consent evidence with UK privacy counsel.
6. Decide retention for notification content, delivery ledger and device metadata.

---

## 17. Priority decision summary

| Priority | Decision |
|---:|---|
| **P0** | Fix event/category registry (`index.ts:8579–8580`); auction controls currently cannot persist and auction events bypass suppression (`index.ts:8686–8688`) |
| **P0** | Re-check preference during idempotent repair; retry currently can send a suppressed push |
| **P0** | Stop calling HTTP 2xx "sent" (`index.ts:9052–9081, 9113–9117`); implement ticket/receipt truth |
| **P0** | Remove false sync claim (`NotificationPreferencesScreen.tsx:162`) and quiet-hour claim (`:351`) or wire authoritative enforcement |
| **P1** | Converge two push settings screens and email taxonomy |
| **P1** | Add revision, OS posture, server preview/quiet hours, consent and observability |

---

## 18. Final assessment

**The department has infrastructure but not a reliable user contract.** The backend has a registered aggregate, durable events, device registry and push jobs — but `NOTIFICATION_PUSH_CATEGORIES` omits `auctionAlerts` (`index.ts:8579–8580`), `mapEventToPushCategory` doesn't map auction/follower events (`index.ts:8584–8591`), unmapped events default to `shouldPush=true` (`index.ts:8686–8688`), HTTP 2xx is called "sent" without ticket validation (`index.ts:9052–9081`), and the provider message ID is fabricated as `expo:${eventId}` (`index.ts:9116`). The consolidated settings screen claims "Most preferences sync across devices" (`NotificationPreferencesScreen.tsx:162`) when they don't, and claims quiet hours hold notifications (`:351`) when no server enforcement exists. Until taxonomy, retry suppression and provider receipt handling are fixed, a toggle is not trustworthy and "sent" is not factual. Correct the policy engine first, converge the settings surfaces second, and apply restrained purpose-first design only after the backend can prove that each preference is enforced.
