# PKG-10 Report — Contract & test closure: notification registry, seller performance, review photos, distribution dates, settings freshness, font caps

Repo root: `C:/Users/User/Desktop/thryftverse-upgrade` (HEAD `76c0733`, branch `feat/product-detail-contract-media-device-closure`)
Audit source: `ThryftVerse-Post-Upgrade-Audit-2026-09-20.md` §2.2–2.3 + Appendix B (FRESH-11, FRESH-12)

## Status: CLOSED — all findings resolved; 9/9 originally failing backend tests now pass (70/70 in the focused trio).

## Per-finding closure

| Finding | Root cause | Resolution | Side fixed |
|---|---|---|---|
| T1 — `every emit site carries an explicit eventType literal` | `index.ts:9615` emitted `eventType: failureCopy.event` (computed, not a literal) for the carrier parcel-failure branch | Restructured `queueCommerceParcelSettlementNotifications`: shared fields built once by `buildFailureNotification(...)`, spread behind an explicit literal `eventType` at each of the three discrete call sites (`order_parcel_lost` / `order_parcel_damaged` / `order_delivery_failed`) | implementation |
| T1 — `every emitted eventType is declared in NOTIFICATION_EVENT_TYPES` | `coown_price_alert_triggered` and `coown_drip_receipt` emitted by `outboxDrainHandler.ts` but absent from the central `NOTIFICATION_EVENT_TYPES` declaration in `index.ts` | Declared both in `NOTIFICATION_EVENT_TYPES` beside the existing `coown_*` entries | declaration |
| T1 — `every emitted/registered eventType maps to a push preference category` | `smart_sell_decision` was mapped to `'offers'` in the inline `index.ts` mapper but missing from the duplicated canonical copy in `lib/workerHelpers.ts` (drift between twin implementations) | Added `smart_sell_decision → 'offers'` to `workerHelpers.mapEventToPushCategory`, and `smart_sell_decision → 'orders'` to `workerHelpers.mapEventTypeToChannelId`, mirroring the index.ts semantics exactly | implementation |
| T1 — newly literal event types must be declared + registered | Surfacing `order_parcel_lost` / `order_parcel_damaged` / `order_delivery_failed` as literals made them contract-checked | Declared all three in `NOTIFICATION_EVENT_TYPES`; registered all three in `NOTIFICATION_EVENT_REGISTRY` (`commerce` / `important` / `orderAggregation` / `getOrderObject` — consistent with the order family). Push category, Android channel, iOS category and relevance resolve correctly via the existing `order_` prefix rules (`orderUpdates` / `orders` / `order` / 0.8) | declaration + registry |
| T1 — seller performance boosts (3 assertions) | Test asserted pre-disable multipliers 1.3×/1.5×; `VISIBILITY_BOOST` was deliberately disabled to 1.0 for all tiers in commit `d08f129a` ("Trust and Safety flagship upgrade") with documented re-enable preconditions (Phase 0 contract-truth repair) | **Determination: the test was stale; the implementation is the intended contract.** Unvalidated ranking distortion is exactly what the disable prevents; `applyVisibilityBoost`/`VISIBILITY_BOOST` have no production callers. Updated `sellerPerformance.test.ts` to pin the disabled contract (all tiers 1.0) with comments documenting the re-enable preconditions | fixture/test |
| T1 — review photos 422 (2 tests) | Tests submitted `photoUrls` without seeding `upload_finalizations`/`media_assets` ownership rows, so the `MEDIA_NOT_OWNED` provenance gate (a deliberate security fix — arbitrary external URLs were previously persisted and rendered on public seller profiles) correctly 422'd | **Determination: validation is the correct contract** (pinned separately by `reviewMediaProvenance.test.ts`, still passing). **Fixtures fixed** — both tests now seed the provenance-join query so the submitted URLs are the requester's own uploads, exercising the authorized happy path. No route/validation change | fixture/test |
| T2 — distribution-date timezone | `CoOwnDistributionCalendar.formatDate` rendered `new Date(iso).toLocaleDateString('en-GB')` in device-local time; UTC-midnight business dates shift back a day behind UTC | **Contract decision: record/ex/payable dates are civil business dates, not instants.** Added `formatBusinessDate` to `frontend/src/utils/dateFormat.ts` — renders the UTC calendar date (leading `YYYY-MM-DD` date part authoritative; `timeZone: 'UTC'` for parsed fallbacks) with the contract documented in the docstring. Calendar now calls it for `date`, `recordDate`, `exDate`, `payableDate`. Verified under `TZ=America/Chicago`: `2026-09-15T00:00:00Z` → "15 … 2026" | implementation |
| FRESH-11 — settings identity/freshness | `useSettingsScreenData` retained a stale balance across `currentUser.id` changes (and sign-out) while the hook stayed mounted, and coalesced malformed successful snapshots to `?? 0` — a fabricated zero | Effect now clears `walletBalance`/`walletBalanceFailed` at the top of every identity change before fetching; success path requires `Number.isFinite(res.snapshot.availableGbp)` — a missing/malformed balance sets `walletBalanceFailed` → card renders "Unavailable" | implementation |
| FRESH-12 — font-scale cap inconsistency | No shared cap constant; nine ad-hoc literals codebase-wide (1.1–2). `AppSegmentControl` capped its label at 1.3 while `HomeFeedHeader`'s functionally identical feed tabs used 1.4/1.5 | Introduced `MAX_FONT_SCALE` tier grammar in `theme/typography.v2.ts` (the canonical typography contract): `utility: 1.3` (compact text in fixed chrome), `heading: 1.5` (section/editorial titles), `content: 2` (reflowable body). Migrated every `maxFontSizeMultiplier` in the owned files: segment label, feed tab label, feed tab count, signal chip text, degraded status line → `utility`; editorial eyebrow → `utility`, editorial title → `heading`; calendar meta → `utility` | policy + call sites |

## Business-contract determinations

1. **Seller visibility boosts**: implementation wins. `VISIBILITY_BOOST` was deliberately flattened to 1.0 (commit `d08f129a`) because tiered ranking distortion requires a versioned experiment, authoritative metrics and new-seller guardrails. The test pinned the retired policy. Tests now assert the disabled contract; re-enabling must be a deliberate contract change, not a silent revert.
2. **Review photo validation**: implementation wins. `MEDIA_NOT_OWNED` (422) is a security gate mirroring avatar/cover ownership checks; the tests were simply unauthorized fixtures. Validation unchanged — the authorized happy path is now exercised correctly.
3. **Distribution dates**: record/ex/payable are civil business dates. `formatBusinessDate` renders the UTC calendar date independent of device timezone. Instant timestamps (messages, "updated at") remain device-local via the existing formatters — intentionally untouched.
4. **Font caps**: caps are retained (large-text safety is intentional), named, and made consistent. Feed tabs/segment labels are the same compact-chrome grammar, so they share `utility` (1.3). Chips, eyebrow and status captions are the same tier; `editorialTitle` is the only heading-tier text migrated (2 → 1.5).

## Files changed (this package only)

- `backend/api/src/index.ts` — NOTIFICATION_EVENT_TYPES +5 types; literal emit sites for parcel-failure notifications
- `backend/api/src/lib/notificationEventRegistry.ts` — registered `order_delivery_failed`, `order_parcel_lost`, `order_parcel_damaged`
- `backend/api/src/lib/workerHelpers.ts` — `smart_sell_decision` → `offers` preference + `orders` channel (parity with index.ts mapper)
- `backend/api/src/__tests__/sellerPerformance.test.ts` — pinned disabled-boost contract
- `backend/api/src/routes/supportReviews.test.ts` — seeded media-ownership fixtures in the two photo tests
- `frontend/src/utils/dateFormat.ts` — new `formatBusinessDate` (UTC civil-date contract)
- `frontend/src/components/coown/CoOwnDistributionCalendar.tsx` — uses `formatBusinessDate`; `MAX_FONT_SCALE.utility`
- `frontend/src/hooks/settings/useSettingsScreenData.ts` — identity-scoped balance; malformed snapshot → unavailable
- `frontend/src/theme/typography.v2.ts` — new `MAX_FONT_SCALE` tier grammar
- `frontend/src/components/ui/AppSegmentControl.tsx` — `MAX_FONT_SCALE.utility`
- `frontend/src/components/home/HomeFeedHeader.tsx` — all caps migrated to `MAX_FONT_SCALE` tiers

## Out-of-scope observations (not fixed — files not owned by this package)

- `frontend/src/services/notificationsApi.ts` `NotificationEventType` union and `notificationViewModels.ts` `EVENT_TYPE_CARD_MAP`/`FILTER_EVENT_TYPES` are a **read-only frontend mirror** that does not yet know `order_parcel_*` / `order_delivery_failed` / `coown_price_alert_triggered` / `coown_drip_receipt` (it also carries `follow_received`, which the backend never declares — pre-existing drift). Backend `NOTIFICATION_FILTER_EVENT_TYPES` was deliberately **not** extended so badge counts still match the frontend filter buckets exactly; the new types render via generic fallback under "All". A follow-up package should extend the frontend mirror.
- `mapEventToPushCategory` / `mapEventTypeToChannelId` / friends are duplicated verbatim between `index.ts` and `lib/workerHelpers.ts` — this drift is what produced the `smart_sell_decision` gap. Consider consolidating index.ts onto the lib copies (larger refactor, not done here).
- `outboxDrainHandler.ts` and `coOwn*.ts` were **not** touched per the ownership constraint — no fix required them.
- Other civil-date renderers outside ownership (`components/coown/asset-detail/corporateActionHelpers.ts`, `DistributionHistoryScreen.tsx`, `AssetOverviewDetails.tsx`, lockup/valuation dates) share the device-local pattern and are candidates for `formatBusinessDate` migration by their owning package.

## Verification

- `cd backend/api && DATABASE_URL=postgres://localhost:1/x node --import tsx --test src/__tests__/notificationContract.test.ts src/__tests__/sellerPerformance.test.ts src/routes/supportReviews.test.ts` — **70/70 pass** (was 61 pass / 9 fail)
- Adjacent suites: `notificationSystem.test.ts` + `walletMoneyPath.test.ts` + `routes/notifications.test.ts` 63/63; `reviewMediaProvenance.test.ts` 5/5
- `cd frontend && npx vitest run src/__tests__/coownDistributionDepth.test.tsx` — **14/14**, including under `TZ=America/Chicago`
- `sellerAnalyticsAndHubUpgrade.test.ts` + `structuralArchitecture.test.ts` — 90/90
- `npx tsc --noEmit` — clean in `backend/api` and `frontend`
- No commits made.
