# ThryftVerse Metric Dictionary

Cross-domain dictionary of every metric the platform actually emits. Audit
item R69: previously the only canonical metric dictionary was creator
analytics (`src/domain/creatorAnalyticsContracts.ts`, `METRIC_VERSION =
'creator-analytics-2'`). This document extends canonical coverage to all
domains.

**Scope rule:** every row cites a real emission site in code. If a metric or
event name is defined but never emitted, it is listed under
[Dead definitions](#dead-definitions) or [Coverage gaps](#coverage-gaps) —
never in a domain table.

## Sources

| Layer | Mechanism | Source of truth |
|---|---|---|
| Backend Prometheus | `prom-client` registry, all names prefixed `thryftverse_` | `src/lib/metrics.ts` |
| Metrics exposition | `GET /metrics` (behind `docsAuthHook`) | `src/routes/health.ts:107-119` |
| Runtime default metrics | `collectDefaultMetrics({ prefix: 'thryftverse_' })` — emits `thryftverse_process_*` / `thryftverse_nodejs_*` series | `src/lib/metrics.ts:5-8` |
| Client product analytics | PostHog via `track()` / `trackRaw()` / `trackFunnelStep()` | `frontend/src/analytics/track.ts:83,122,165`; event catalogue `frontend/src/analytics/types.ts:98-150` |
| Client ops telemetry | Buffered `POST /analytics/events/batch` + forwarded to PostHog handler | `frontend/src/lib/telemetry.ts:178` (`trackTelemetryEvent`); handler wiring `frontend/src/analytics/PostHogProvider.tsx:226`; ingestion `src/routes/analytics.ts:80` |
| Creator analytics events | `POST /creator/analytics/events` (server-side event store, not Prometheus) | `src/routes/creatorAnalytics.ts:374`; contract `src/domain/creatorAnalyticsContracts.ts:92-112` |

Note on labels: `recordBackgroundJobDuration` is also emitted for in-process
scheduled jobs under the fixed label `queue="in_process"` — see
`src/index.ts:10025,10034` (the `withScheduledJobGuard` helper, defined at
`src/index.ts:10008`). Those jobs do **not** increment
`thryftverse_background_jobs_total` — only the duration histogram.

---

## 1. Platform / HTTP / runtime

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_http_requests_total` | counter | `method`, `route`, `status` | `src/index.ts:1781` (`observeHttpRequest`, Fastify `onResponse` hook at `src/index.ts:1771`) | Total API requests by normalised route template and status class | Primary signal for 5xx-rate and traffic-drop alerts |
| `thryftverse_http_request_duration_seconds` | histogram | `method`, `route`, `status` | `src/index.ts:1781` | Request latency distribution (buckets 5ms–12s) | p95/p99 per-route latency alerting |
| `thryftverse_database_pool_connections` | gauge | `pool` (`primary`/`replica`), `state` (`total`/`idle`/`waiting`) | `src/routes/health.ts:112` (primary), `src/routes/health.ts:114` (replica) | Postgres pool saturation snapshot, refreshed on each `/metrics` scrape | `state="waiting"` growth = pool exhaustion warning |
| `thryftverse_redis_connection_state` | gauge | `state` (`connected`/`disconnected`) | `src/routes/health.ts:116` | Redis connectivity at scrape time (1/0) | `disconnected=1` = queue/cache degradation alert |
| `thryftverse_process_*`, `thryftverse_nodejs_*` | default collectors | (prom-client defaults) | `src/lib/metrics.ts:5-8` | CPU, memory, event-loop lag, GC, handles | Node runtime health (event-loop lag, heap growth) |

## 2. Commerce & orders

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_gmv_total` | counter | — | `src/index.ts:13101` (escrow-release sweep completion path), `src/index.ts:34779` (buyer-confirmed delivery path) | Gross merchandise value in GBP, incremented per completed order | Business KPI; flat-line during trading hours signals fulfilment breakage |
| `thryftverse_orders_completed_total` | counter | — | `src/index.ts:13102`, `src/index.ts:34780` (paired with each `recordGmv` call) | Orders reaching `completed`/delivered state | Order-completion rate drop alert |
| `thryftverse_background_jobs_total` (queue `infra_ops`, jobs `checkout_reservation_sweep` via `in_process`, `reconciliation_run`, `escrow_release_sweep`, `payout_schedule_sweep`) | counter | `queue`, `job`, `result` | `src/lib/queues.ts:624-645`; `src/index.ts:10025,10034` for `in_process` | See §Background jobs | `result="failed"` spikes on settlement sweeps |

## 3. Payments

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_payment_transitions_total` | counter | `channel`, `from`, `to`, `gateway` | `src/index.ts:7286` (intent status update path A), `src/index.ts:8521` (intent status update path B) | Every payment-intent status transition, grouped by channel and gateway | `to="failed"` rate per gateway = payment-outage signal |

## 4. Auctions

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_auction_settlements_total` | counter | `result` (`settled`/`no_action`/`failed`) | `src/workers/handlers/auctionSweepHandler.ts:240` (`no_action`), `:242` (`settled`), `:247` (`failed` on rollback) | Outcome of each auction-sweep transaction (end auctions, expire overdue payments, expire second-chance offers) | `result="failed"` = sweep is rolling back; settlement pipeline down |

## 5. Notifications (push)

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_push_deliveries_total` | counter | `provider` (`expo`), `status` (`sent`/`failed`/`queued`/`ticketed`/`suppressed`) | `src/index.ts:9806` (no active device → `failed`), `src/index.ts:9959` (`ticketed`/`failed` after Expo tickets); `src/lib/workerRuntime.ts:192` (`suppressed` — preference), `:263` (`queued`), `:280` (`suppressed` — other reason); `src/workers/handlers/pushHandler.ts:72` (`failed`), `:273` (`ticketed`/`failed`); `src/workers/handlers/pushReceiptHandler.ts:229` (`sent` on receipt confirmation), `:232` (`failed`/`expired`) | Push pipeline funnel: queued → ticketed → sent; suppression and failure branches | `failed`/`sent` ratio and `suppressed` spikes = delivery-health alert |
| `thryftverse_push_ticket_errors_total` | counter | `provider`, `error` | `src/index.ts:9898`, `src/workers/handlers/pushHandler.ts:203` | Per-token Expo ticket errors (`DeviceNotRegistered` triggers token revocation) | `DeviceNotRegistered` surge = token-hygiene problem |

No in-app (feed) notification metrics exist — only push delivery is counted.

## 6. Recommendations

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_recommendation_serves_total` | counter | `source` (`decision_service`/`fallback`), `policy_version`, `cold_start` | `src/routes/recommendations.ts:1134` (`recordRecommendationServe`) | Recommendation serves by origin and cold-start status | `source="fallback"` share = decision-service degradation |
| `thryftverse_recommendation_serve_duration_seconds` | histogram | `source`, `policy_version` | `src/routes/recommendations.ts:1134` | Serve latency including fallback path | Recs latency alert; fallback-latency comparison |
| `thryftverse_recommendation_results` | histogram | `source`, `policy_version` | `src/routes/recommendations.ts:1134` | Result count per serve (buckets 0–100) | Zero-result rate = inventory/ranking breakage |

## 7. Search

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_background_jobs_total` / `..._duration_seconds` (queue `search_indexing`, job `search_index_sync`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:1003-1022` (worker), enqueued `src/lib/queues.ts:1657` (`enqueueSearchIndexSyncJob`) and repeatable `src/lib/queuePriorities.ts:94-99` | Search-index sync job executions only | `result="failed"` = catalogue search staleness |

**No dedicated search metrics exist** — no query-volume, latency, or
zero-result-rate series for Meilisearch queries. See Coverage gaps.

## 8. Trust & safety / moderation

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_background_jobs_total` / `..._duration_seconds` (queue `moderation_triage`, job `moderation_triage`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:843-862`; enqueued `src/lib/queues.ts:1476` (`enqueueModerationTriageJob`) | Moderation triage job health only | Job failure = triage backlog growth |
| same series (queue `infra_ops`, jobs `seller_trust_recompute`, `feedback_evaluation`, `dsar_export`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:624-645`; enqueues `src/lib/queues.ts:1266,1291,1633` | Trust-score recompute, feedback evaluation, DSAR export sweeps | `result="failed"` per job |

**No dedicated trust/safety metrics** — fraud scoring, scam scanning, and
moderation decisions emit no Prometheus series. See Coverage gaps.

## 9. Live commerce

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_background_jobs_total` / `..._duration_seconds` (queue `infra_ops`, job `live_lot_sweep`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:624-645`; enqueued `src/lib/queues.ts:1082` (`enqueueLiveLotSweepJob`) | Live-lot sweep job health only | Job failure = stuck live lots |

**No dedicated live metrics** — no viewer-count, stream-health, or live-bid
series server-side. Client events `live_stream_viewed` / `live_bid_placed`
exist (§Client events); `live_stream_joined` is defined but never emitted.

## 10. Co-own

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_background_jobs_total` / `..._duration_seconds` (queue `infra_ops`, jobs `coown_order_expiry_sweep`, `coown_alert_evaluator`, `coown_drip_execution`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:624-645`; enqueues `src/lib/queues.ts:1098,1112,1127` | Co-own sweep/evaluator/drip job health only | Job failure = stale order book, missed alerts |

**No dedicated co-own metrics** — no trade-volume or order-book series
server-side. Client events `coown_trade_started`, `coown_order_placed`,
`coown_order_filled` exist; `coown_buyout_offered` is defined but never
emitted.

## 11. Wallet / Oneze

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_background_jobs_total` / `..._duration_seconds` (queue `infra_ops`, jobs `oneze_withdraw_execute`, `oneze_mint_reserve_allocate`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:624-645`; enqueues `src/lib/queues.ts:1142,1163` | Withdrawal execution and mint-reserve job health | `result="failed"` on withdraw = payout pipeline down |
| `thryftverse_background_job_duration_seconds` (queue `in_process`, jobs `oneze_reconciliation`, `oneze_daily_attestation`, `oneze_fx_sync`, `oneze_auto_adjust`) | histogram | `queue`=`in_process`, `job` | `src/index.ts:10025,10034` via `withScheduledJobGuard`; call sites `src/index.ts:12072-12144` | Duration of in-process Oneze schedulers | Long-running reconciliation = provider slowness |

**No wallet-balance, transfer, or withdrawal-amount series.** Client events
`wallet_viewed`, `withdrawal_initiated` exist.

## 12. Media & catalog pipeline

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_background_jobs_total` / `..._duration_seconds` (queue `media_ingest`, job `media_ingest`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:675-696`; enqueued `src/lib/queues.ts:1361` | Media ingest job health | Ingest failure = broken listing media |
| same series (queue `media_embedding`, job `media_embedding_generate`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:792-813`; enqueued `src/lib/queues.ts:1456` | Embedding generation health | Embedding backlog degrades visual search |
| same series (queue `catalog_import`, jobs `catalog_import_discover`, `catalog_import_hydrate`, `catalog_import_media`, `catalog_import_normalise`, `catalog_import_publish`, `catalog_import_retention`, `catalog_import_reconcile`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:741-762`; enqueues `src/lib/queues.ts:1521-1617` | Catalog-import stage health | Per-stage `result="failed"` pinpoints pipeline breakage |
| same series (queue `importer_extraction`, job `importer_extraction_run`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:894-915`; enqueued `src/lib/queues.ts:1497` | Importer extraction health | Extraction failure = import stalls upstream |
| same series (queue `infra_ops`, jobs `media_ingest_reconcile`, `multipart_session_sweep`, `orphan_upload_intent_sweep`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:624-645`; enqueues `src/lib/queues.ts:1387,1412,1434` | Media reconcile / upload-session cleanup sweeps | Sweep failure = storage leak growth |

No per-asset processing latency or failure-reason series — only job counts.

## 13. Auth & growth

| Metric | Type | Labels | Emitted at | Meaning | Alert relevance |
|---|---|---|---|---|---|
| `thryftverse_user_signups_total` | counter | `method` (`oauth`/`email` observed) | `src/routes/auth.ts:395` (`oauth`), `src/routes/auth.ts:785` (`email`) | New-account creations by method | Signup flat-line = auth funnel breakage |
| `thryftverse_background_job_duration_seconds` (queue `in_process`, job `agent_run_stale_sweep`) | histogram | `queue`=`in_process`, `job` | `src/index.ts:10521` | Stale agent-run sweep duration | — |
| `thryftverse_background_jobs_total` / `..._duration_seconds` (queue `agent-runs`, job `agent-run`) | counter / histogram | `queue`, `job`, `result` | `src/lib/queues.ts:945-966`; enqueued `src/botRuntime/index.ts:854`, `src/routes/bots.ts:1464` | Agent-run job health | Agent-run failure = bot runtime down |

## 14. Creator analytics (existing canonical dictionary)

Canonical contract: `src/domain/creatorAnalyticsContracts.ts` —
`METRIC_VERSION = 'creator-analytics-2'` (line 10), client event types
`view|like|save|comment|share|product_click|profile_visit` (lines 22-31),
server-only `qualified_view` (line 37), summary metrics
`views, qualifiedViews, likes, saves, comments, shares, productClicks,
profileVisits, engagementRate` (lines 123-136), completeness states
`complete|provisional|delayed|unavailable` (line 56).

| Metric / event | Type | Emitted at | Meaning |
|---|---|---|---|
| `POST /creator/analytics/events` ingestion | event store (not Prom) | `src/routes/creatorAnalytics.ts:374` | Client engagement events |
| `thryftverse_background_jobs_total` (queue `infra_ops`, job `analytics_aggregation`) | counter | `src/lib/queues.ts:624-645`; enqueued `src/lib/queues.ts:1245` | Aggregation job producing rollups |
| `thryftverse_background_jobs_total` (queue `infra_ops`, job `scheduled_publication` — per-item results) | counter | `src/workers/handlers/scheduledPublicationHandler.ts:198` (`completed`), `:248` (`failed` policy block), `:290` (`failed` max attempts) | Per-schedule publish outcomes; note the sweep itself runs as job `scheduled_publication_sweep` (dispatch `src/lib/queues.ts:605-606`), so two job label values exist |
| `thryftverse_background_jobs_total` (queue `infra_ops`, jobs `analytics_mv_refresh`, `backup_check`, `auction_end_check`, `escrow_release_sweep`, `payout_schedule_sweep`) | counter | repeatable scheduling `src/lib/queuePriorities.ts:70-115`; worker `src/lib/queues.ts:624-645` | Repeatable infra jobs — **note:** `auction_end_check`, `analytics_mv_refresh`, `backup_check` are scheduled but have no branch in the worker dispatch (`src/lib/queues.ts:581-620`), so they record `completed` without doing work |

## 15. Background jobs (shared series)

`thryftverse_background_jobs_total` (`counter`, labels `queue`, `job`,
`result` ∈ `completed|failed`) and `thryftverse_background_job_duration_seconds`
(`histogram`, labels `queue`, `job`) are the cross-domain workhorses — nearly
every async domain funnels through them. Emission sites: worker wrappers in
`src/lib/queues.ts` at lines 531/544 (`push_notifications`), 624/637
(`infra_ops`), 675/688 (`media_ingest`), 741/754 (`catalog_import`), 792/805
(`media_embedding`), 843/856 (`moderation_triage`), 894/907
(`importer_extraction`), 945/958 (`agent-runs`), 1003/1016
(`search_indexing`); per-item in `src/workers/handlers/scheduledPublicationHandler.ts:198,248,290`;
duration-only for `in_process` jobs at `src/index.ts:10025,10034`.

Queue/job label values observed in code:

- `push_notifications`: `push_send` (enqueue `src/lib/queues.ts:1052`)
- `infra_ops`: `auction_sweep`, `live_lot_sweep`, `coown_order_expiry_sweep`,
  `coown_alert_evaluator`, `coown_drip_execution`, `oneze_withdraw_execute`,
  `oneze_mint_reserve_allocate`, `reconciliation_run`, `domain_outbox_drain`,
  `retention_sweep`, `analytics_aggregation`, `push_receipt_reconciliation`,
  `scheduled_publication_sweep`, `backup_expiry_check`, `dsar_export`,
  `seller_trust_recompute`, `feedback_evaluation`, `media_ingest_reconcile`,
  `multipart_session_sweep`, `orphan_upload_intent_sweep` (dispatch
  `src/lib/queues.ts:581-620`), plus per-item `scheduled_publication`, plus
  repeatable `auction_end_check`, `escrow_release_sweep`,
  `payout_schedule_sweep`, `analytics_mv_refresh`, `backup_check`
  (`src/lib/queuePriorities.ts:70-115`)
- `in_process` (duration histogram only): `provider_submission_reconcile`,
  `checkout_reservation_sweep`, `agent_run_stale_sweep`,
  `oneze_reconciliation`, `oneze_daily_attestation`, `oneze_fx_sync`,
  `oneze_auto_adjust`, `platform_revenue_sweep`, `ops_alerting`
  (`src/index.ts:10450-12629`)
- `media_ingest`: `media_ingest`; `media_embedding`: `media_embedding_generate`;
  `catalog_import`: `catalog_import_*` (7 stages); `importer_extraction`:
  `importer_extraction_run`; `moderation_triage`: `moderation_triage`;
  `agent-runs`: `agent-run`; `search_indexing`: `search_index_sync`

---

## Client events

All events below are emitted client-side. `track()` events go to PostHog
(`frontend/src/analytics/track.ts:83-96`); `trackFunnelStep` emits the step
name as the PostHog event with a `funnel` property (`track.ts:165-177`);
`trackTelemetryEvent` batches to `POST /analytics/events/batch` and forwards
to the PostHog handler (`frontend/src/lib/telemetry.ts:178-229`,
`frontend/src/analytics/PostHogProvider.tsx:226`); `trackProductEvent` emits
item-detail events through the same telemetry pipeline
(`frontend/src/platform/product/productAnalytics.ts:24-40`, handler wired at
`frontend/src/hooks/itemDetail/useItemDetailData.ts:111`).

### PostHog events (`track()`)

| Event | Emitted at |
|---|---|
| `screen_view` | `analytics/useScreenTracking.ts:160,221` |
| `feature_flag_evaluated` | `analytics/useFeatureFlag.ts:77,152,233` |
| `item_viewed` | `hooks/itemDetail/useItemDetailData.ts:134` |
| `item_favorited` | `hooks/itemDetail/useItemDetailActions.ts:120` |
| `item_shared` | `components/ShareSheet.tsx:58,74`; `platform/share/ShareSheet.tsx:133` |
| `share_initiated` / `share_completed` | `components/ShareSheet.tsx:66,72,77`; `platform/share/shareSheet.ts:163` |
| `checkout_started` / `checkout_abandoned` | `hooks/checkout/useCheckoutPaymentFlow.ts:476,317` |
| `purchase_completed` | `hooks/checkout/useCheckoutPaymentFlow.ts:660,696,748,782,876,1071,1152` |
| `offer_submitted` | `hooks/offers/useMakeOfferSubmission.ts:220` |
| `listing_created` / `listing_published` | `hooks/sell/useListingPublishPipeline.ts:236,234` |
| `auction_viewed` / `auction_bid_placed` | `screens/AuctionDetailScreen.tsx:124,173` |
| `live_stream_viewed` | `hooks/livestream/useLiveStreamSession.ts:81` |
| `live_bid_placed` | `hooks/livestream/useLiveBidActions.ts:66` |
| `look_viewed` | `hooks/lookdetail/useLookDetailData.ts:105` |
| `moodboard_created` | `components/moodboard/useMoodboardBoard.ts:134` |
| `collection_created` | `screens/CreateCollectionScreen.tsx:102` |
| `filter_applied` | `screens/FilterScreen.tsx:181-195` |
| `user_signed_up` / `user_logged_in` / `user_logged_out` | `screens/SignUpScreen.tsx:88,133,290`; `screens/LoginScreen.tsx:52`; `store/useStore.ts:865` |
| `profile_viewed` / `follow_toggled` | `screens/UserProfileScreen.tsx:76`; `hooks/userprofile/useUserProfileActions.ts:121,129` |
| `seller_dashboard_viewed` | `components/seller/analytics/useSellerAnalytics.ts:204`; `screens/SellerHubScreen.tsx:186` |
| `message_sent` | `screens/GroupChatScreen.tsx:346,355` |
| `wallet_viewed` / `withdrawal_initiated` | `screens/WalletScreen.tsx:101`; `hooks/withdraw/useWithdrawSubmission.ts:185` |
| `biometric_login_attempted` / `biometric_login_success` / `biometric_login_cancelled` | `screens/BiometricLoginScreen.tsx:82,68,73` |
| `onboarding_completed` | `screens/OnboardingScreen.tsx:67` |
| `push_notification_tapped` / `push_notification_received` | `hooks/usePushNotificationTap.ts:123,147` |
| `report_submitted` / `review_written` | `hooks/report/useReportSubmission.ts:49`; `screens/WriteReviewScreen.tsx:182` |
| `screenshot_taken` | `platform/screenCapture/useScreenshotTracking.ts:60` |
| `coown_trade_started` / `coown_order_placed` / `coown_order_filled` | `screens/TradeScreen.tsx:412,450`; `screens/TradeConfirmScreen.tsx:428,421` |
| `deep_link_auth_redirect` (via `trackRaw`) | `hooks/useDeepLinkAuth.ts:192` |

### Funnel-step events (`trackFunnelStep`)

| Step event | `funnel` | Emitted at |
|---|---|---|
| `checkout_started`, `payment_submitted`, `purchase_completed` | `checkout` | `hooks/checkout/useCheckoutPaymentFlow.ts:481,651,661,697,749,783,830,877` |
| `listing_started`, `listing_submitted` | `listing_creation` | `hooks/sell/useSellScreenData.ts:144`; `hooks/sell/useListingPublishPipeline.ts:151` |
| `signup_started`, `signup_completed`, `onboarding_completed` | `signup` | `screens/SignUpScreen.tsx:278,89,134,291`; `screens/OnboardingScreen.tsx:68` |

### Ops-telemetry events (`trackTelemetryEvent` → `/analytics/events/batch`)

| Event | Emitted at |
|---|---|
| `screen_error_boundary` | `components/ScreenErrorBoundary.tsx:83` |
| `sync_retry_banner_impression` / `sync_retry_tapped` | `components/SyncRetryBanner.tsx:52,58` |
| `commerce_routing_failure` | `platform/commerce/commerceDestination.ts:72` |
| `error_boundary_crash` | `platform/monitoring/AppErrorBoundary.tsx:87` |
| `global_js_error` | `platform/monitoring/globalErrorHandler.ts:60` |

### Item-detail product events (`trackProductEvent` → telemetry pipeline)

| Event | Emitted at |
|---|---|
| `item_detail_view` | `hooks/itemDetail/useItemDetailData.ts:133`; `screens/ExploreCollectionScreen.tsx:131`; `screens/HomeScreen.tsx:582` |
| `item_media_zoom` | `hooks/itemDetail/useItemDetailMedia.ts:52`; `screens/ItemDetailScreen.tsx:402` |
| `item_save` | `components/discover/HomeDiscoveryCard.tsx:99,107`; `hooks/itemDetail/useItemDetailActions.ts:119` |
| `item_share` | `hooks/itemDetail/useItemDetailActions.ts:143` |
| `seller_profile_open` / `seller_message_start` | `hooks/itemDetail/useItemDetailActions.ts:163,172,199` |
| `recommendation_impression` / `recommendation_click` / `recommendation_section_see_all` | `components/product/RecommendationRail.tsx:71,59,178`; `components/product/DiscoveryGrid.tsx:49` |
| `offer_start` / `checkout_start` | `screens/ItemDetailScreen.tsx:667,655` |

## Dead definitions

Defined in code but **never emitted** — dashboards must not rely on these:

- `thryftverse_listings_created_total` — counter defined `src/lib/metrics.ts:111-115`,
  emitter `recordListingCreated` exists (`src/lib/metrics.ts:276`) but has
  **zero call sites** anywhere in `src/`.
- PostHog events in `EventName` (`frontend/src/analytics/types.ts:98-150`)
  with zero `track()` call sites: `order_placed`, `order_completed`,
  `search_performed`, `search_result_tapped`, `live_stream_joined`,
  `look_created`, `voice_message_sent`, `age_verification_completed`,
  `coown_buyout_offered`, `deep_link_opened` (the live deep-link event is
  `deep_link_auth_redirect` via `trackRaw` instead).
- `item_media_view` — `ProductAnalytics.mediaView` defined
  (`frontend/src/platform/product/productAnalytics.ts:58`) but never invoked.
- Telemetry helpers `trackScreenView`, `trackFeatureUsage`, `trackButtonTap`
  (`frontend/src/lib/telemetry.ts:259,285,294`) have zero call sites outside
  their own module.

## Coverage gaps

Domains with **no dedicated metric series** — only generic
`background_jobs_total` coverage or nothing at all:

1. **Search** — no query volume, latency, zero-result rate, or
   Meilisearch-health series. Only `search_index_sync` job counts. Client-side
   `search_performed`/`search_result_tapped` are defined but never emitted, so
   search is unobserved end-to-end.
2. **Trust & safety** — no moderation-decision, fraud-score, scam-scan, or
   report-volume series. `messageScamScanner`, `fraudDetection`,
   `guardrailEngine` emit no Prometheus metrics; only job counters for
   `moderation_triage`/`seller_trust_recompute`/`dsar_export`/
   `feedback_evaluation`.
3. **Live commerce** — no viewer, stream-health, bid-volume, or lot-settlement
   series server-side; only the `live_lot_sweep` job counter. Client emits
   `live_stream_viewed`/`live_bid_placed` but `live_stream_joined` is dead.
4. **Co-own** — no order-book depth, trade volume, or buyout series; only
   sweep job counters. Client covers trade funnel partially
   (`coown_buyout_offered` dead).
5. **Wallet / Oneze** — no balance, transfer-volume, or withdrawal-amount
   series; only job counters/durations.
6. **Listings** — `listings_created_total` defined but never incremented;
   no listing-state or time-to-first-sale series.
7. **Notifications (in-app)** — push pipeline is measured; in-app feed
   notifications (`in_app_only`, read/unread) have no series.
8. **Commerce funnel server-side** — GMV and completed orders exist, but no
   checkout-start/abandon or offer metrics server-side (client-only coverage).
