# SDD ledger — plan: .flagship/sdd/wave-ab-plan.md

## Pre-flight scan

| Task pair | Shared file | Conflict found | Ruling |
|-----------|-------------|----------------|--------|
| T1 (F12+F13) + T11 (F09) | TradeConfirmScreen vs SellerHubScreen | None — different files | No conflict |
| T2 (F11+F15) + T8 (F14) | PaymentStateBanner/PulsingDot vs creator files | None — different files | No conflict |
| T9 (F10) + T11 (F09) | SellerHubScreen.tsx | Same file — sequential | T9 first, T11 after |
| T6 (F04) + T5 (F01) | designTokens/typography vs Design.md | Design.md documents typography — T5 may reference T6 outcome | T6 first, T5 after |

No plan-internal contradictions found. All findings verified against current worktree.

Task 1: complete (F12+F13 TradeConfirm � fee fallback removed, hold threshold expanded, directional quote check; review APPROVE_WITH_MINOR 0 critical)
Task 2: complete (F11+F15 Checkout � unknown_outcome banner added, pulse bounded to 3 beats; review APPROVE_WITH_MINOR 0 critical)

Task 3: complete (F02 visuallyComplete � visit-scoped milestones, consumers updated; review APPROVE_WITH_MINOR 0 critical, 2 minor)
Task 4: complete (F03 test refactor � renamed structuralArchitecture.test.ts, 43/43 pass; review APPROVE_WITH_MINOR 0 critical, 1 minor)
Task 5: complete (F01 Design.md � stale assertions fixed, evidence-qualified language; review APPROVE_WITH_MINOR 0 critical, 1 minor)
Task 6: complete (F04 typography � Type.display aligned, @deprecated added; review resolved � co-own balance hero visual change is a correction not regression)
Task 7: complete (F06+F07 search � scope preserved, null price/likes; review APPROVE_WITH_MINOR 0 critical, 3 minor)
Task 8: complete (F14 reduced-motion � 32 files migrated to shared hook; review APPROVE_WITH_MINOR 0 critical, 3 minor)
Task 9: complete (F10 SellerHub states � ResourceStatus added, SyncRetryBanner wired; fix round 1 added 3 tests, 45/45 pass)
Task 10: complete (F18 visual gates triage � 201 findings: 53 defects, ~50 exceptions, ~98 scanner limitations; review APPROVE_WITH_MINOR 0 critical, 3 minor)
Task 11: complete (F09 SellerHub composition � work-first reorder, 395 lines; review APPROVE_WITH_MINOR 0 critical, 3 minor)
Final review: APPROVE_WITH_MINOR, 0 critical, 7 minor. All P0 fixes verified. No regressions. Anti-AI design respected. Masonry preserved.
Minor findings: (1) Design.md stale after F04, (2) feeUnavailable unreachable on real path, (3) format1ze(0) renders 0.00 1ZE, (4) sell-path maxReservedLabel undefined units, (5) unknown_outcome color mismatch, (6) beginVisit render-phase side effect, (7) F13 float params never forwarded.
Minor findings batch: all 4 fixed (Design.md stale note, format1ze(0), maxReservedLabel, beginVisit side effect). tsc clean.
Task 13: complete (F05 Create press � withSpring(0.9)?(0.975) in TabNavigator; review APPROVE_WITH_MINOR 0 critical, 2 minor)
Task 14: complete (F16 AI surfaces � 4 files fixed, conversational-search disclosure corrected; fix round 1 resolved critical finding)
Task 15: complete (Orders � carrier evidence, next-action hints, partial refresh banner; review APPROVE_WITH_MINOR 0 critical, 5 minor)
Task 16: complete (Inbox � timestamp formatting, honest unread dot, delivery glyphs; review APPROVE_WITH_MINOR 0 critical, 5 minor)
Task 17: complete (Item detail � media fraction 0.56/0.60, condition evidence, stale-data banner; review APPROVE_WITH_MINOR 0 critical, 5 minor)
Task 12: complete (F08 visual search � facets now retrieval-scoped, backend + frontend; review APPROVE_WITH_MINOR 0 critical, 4 minor)
Task 18: complete (Media pipeline audit � 23 issues: 3 critical, 8 major, 12 minor; recommended fix contract seam first)
Task 19: complete (Media contract seam � derivatives/EXIF/ICC/blurhash projected through listing reads; review APPROVE_WITH_MINOR 0 critical, 7 minor)
Task 20: complete (Media components � dead code removed, cache keys aligned, contentPosition/fit fixed; review APPROVE_WITH_MINOR 0 critical, 4 minor)
Task 21: complete (Media cleanup � 7 minor findings fixed: auction fit, stripImageExif mismatch, ORDER BY, HEIC warn, dead-mirror, blurhash clamp, dead branch)
Task 22: complete (Accessibility audit � 14 issues: 0 critical, 5 major, 9 minor)
Task 23: complete (Accessibility fixes � M1-M5 all fixed; review APPROVE_WITH_MINOR 0 critical, 5 minor)
Task 24: complete (Focus/cache propagation � dead-key bug fixed, missing invalidations added, focus refetches wired; review APPROVE_WITH_MINOR 0 critical, 4 minor)
Task 25: complete (Recommendation control � contract poisoning fixed, intent reaches ranking, negative feedback surface added; review APPROVE_WITH_MINOR 0 critical, 6 minor)
Task 26: complete (Accessibility cleanup � 5 minor findings fixed, 3 new tests added; review APPROVE_WITH_MINOR 0 critical, 4 minor)
Task 27: complete (Cleanup batch � 10 minor findings fixed: refire loop, silent callers, prefix invalidation, reconciliation, 422s, mock topics, surface mismatch, no-op ledger, redundant hint, double haptic)
Task 28: complete (Design.md updated � v1.9 with media pipeline contract, accessibility patterns, cache propagation, visual search facets, recommendation control)
Final verification: frontend tsc 0 errors, backend tsc 0 errors, frontend lint 0 errors / 15231 pre-existing warnings, backend no eslint config (tsc only), all focused tests pass (48/48 frontend, 20/20 backend), co-own isolation confirmed (0 coown files modified)
Research campaign 2026-09-12: complete � 6 parallel tracks (Instagram/Pinterest/Snapchat/marketplace/psychology/codebase-inventory), ~190 sources, 166 screens graded; master report at docs/research/subdepartment-flagship-gap-report-2026-09-12.md

## Wave E — commerce lifecycle implementation (2026-09-12)

G01: complete — CheckoutScreen 2,482 → 722 LOC, pure decomposition into components/checkout/* + hooks/checkout/*; review findings fixed
G08: complete — ChatScreen 2,203 → 711 LOC, FlashList/haptics/a11y preserved; 292 chat tests pass
G15+G16: complete — dead Attach-file button removed, a11y-lie pressables role-fixed (LiveStreamViewer, YourAlgorithm, DiscoverScene), CreateAuction hex → semantic tokens
E-A: complete — offer.created/declined/expired/cancelled/sibling_declined events + outbox drain handlers + notification routing; E-A2 fixed push-channel mapping + dead-lettering mutation paths (index.ts inline drain delegated to shared handler)
E-B: complete — shipByDate/inspectionDeadlineAt/moneyProjection/fulfilmentSnapshot/dispatchExtension in GET /orders/:id; /deliver accepts shipped+delivered, idempotent, confirm-releases-escrow; 'completed' terminal status + migration 280 (+ 'refunding' CHECK fix); dispatch-extension propose/respond endpoints
E-C: complete — OffersScreen (Received/Sent, effective-status sort, server-rule actions, truthful expiry), dead offer exports wired, wrong-actor nav fixed, binding copy added
E-D: complete — DispatchCountdown fabrication removed (server shipByDate only), EscrowBanner typed moneyProjection + truthful in-transit copy, InspectionBanner honest deadline, extension UI both sides gated on capabilities
Checkout order-resume: complete — CheckoutScreen consumes orderId/reservationId, bound hydration, PATCH checkout binding, no list-price re-creation, bare-409 refetch before declaring unavailable
Backend fixes (B1–B7): ISO date casts for offer events, dispatch-extension drain handlers, 'refunding' in migration 280 CHECK, 'completed' in ~20 analytics queries + matview 281, settlement notification on confirm path, per-row cancel events, dead orders.ts mirror deleted
Frontend fixes (F1–F12): ChatSheets hideDocument + make-offer routing restored, bound-409 refetch, effective-status sort, row-disable during flight, counter→conversation nav, extension gating, i18n keys, escrow copy, dead hooks removed, seller-name fallback
Reviews: frontend REQUEST_CHANGES → all 12 findings fixed; backend REQUEST_CHANGES → all 7 findings fixed
Final verification: frontend tsc 0 errors, backend tsc 0 errors, frontend focused tests 50/50, backend offer/order tests pass (2 pre-existing env failures: creator publish idempotency, upload finalization; Redis ECONNREFUSED local-only)
Remaining documented P2/P3: extension withdrawal/buyer-counter/TTL, smart_sell_* audit-event drain handlers, checkout_expires_at field, reservationId binding consumption, ItemDetail seller offers affordance

## Wave F — monolith decomposition + interaction semantics (2026-09-12)

Decompositions (pure refactor, owner-layer extraction):
- ItemDetailScreen 2,039 → 630 (components/itemdetail/*, hooks/itemDetail/*)
- AuctionDetailScreen 1,957 → 455 (components/auctiondetail/*, hooks/auctiondetail/*)
- InboxScreen 1,612 → 238 (components/inbox/*, hooks/inbox/*)
- AuctionHomeScreen 1,608 → 376 (components/auctionhome/*, hooks/auctionhome/*)
- LiveStreamViewerScreen 1,446 → 258 (components/livestream/*, hooks/livestream/*)
- LookDetailScreen 1,454 → 418 (components/lookdetail/*, hooks/lookdetail/*)
- FilterScreen 1,445 → 344 (components/filters/*, hooks/filters/*)
Total: ~11,560 LOC of monoliths → ~2,720 LOC of orchestrators.

Two-tier save (Pinterest pattern): tap = quick-save via toggleSavedProduct, long-press = SaveToCollectionModal. Wired on ItemDetail header/rail + discovery tile bookmarks (SearchScreen, ExploreCollectionScreen host the picker modal).

Adversarial reviews (2 agents, both REQUEST_CHANGES → all findings resolved):
- Commerce review: paginationError write-only → wired LoadMoreFooter (spinner + inline error + retry) into ScopeComposition + SearchOverlay; currencySymbol dep added; dead utils/itemDetailDerived.ts + dead product/* sheets + dead useItemDetailActions exports deleted; stale hero comment fixed. F6/F7/F9 verified pre-existing, not regressions.
- Content review: retryLoadMore dead CTA fixed (shared fetchPage bypasses stale guard closure); livestream lotId race guard restored; isOffline/analyticsEvent live-read via refs (fetch-once preserved); headerGlyph text-shadow restored via glyphStyle; listingFilterId re-seeds on route change; selling empty-state icon/subtitle restored; my-size star icon restored. Inbox inverted swipe label fixed ('Mark read'/'Mark unread').

Test-suite convergence: 5 source-grep test files retargeted to owner layer (195 tests green); animated-scroll checker extended for hook-returns-handler pattern; iconographySystem mocked a11y-prefs context; SellerHubScreen styles extracted to sellerHubScreenStyles.ts (413 → under 400 charter).

Final: frontend tsc 0 errors; 1,855/1,857 tests pass. Remaining failure: diagImport.test.tsx (co-own transform quirk from concurrent work, outside this wave).

## Wave G — remaining user-facing monoliths (2026-09-12)

Decompositions (pure refactor, owner-layer extraction):
- UserProfileScreen 1,339 → 423 (components/userprofile/*, hooks/userprofile/*)
- NotificationsScreen 1,364 → 174 (components/notifications/*, hooks/notifications/*)
- PortfolioScreen 1,348 → 217 (components/portfolio/*, hooks/portfolio/*)
- WithdrawScreen 1,288 → 297 (components/withdraw/*, hooks/withdraw/*)
- InventoryManagementScreen 1,287 → 245 (components/inventory/*, hooks/inventory/*)
Total: ~6,626 LOC of monoliths → ~1,356 LOC of orchestrators.
Skipped deliberately: AssetDetailScreen + SyndicateHubScreen (active concurrent co-own work).

Real defects fixed during the wave:
- Aggregated notification mutations were dead: synthetic `agg:<id>` passed to markNotificationRead/deleteNotificationEvent → server no-op. Cards now carry aggregatedIds + aggregatedUnreadCount; swipe-mark-read/dismiss/open fan out to member event ids; badge decrements by actual unread members.
- useUserProfileScroll webScrollHandler stale closure (pre-existing, verbatim from baseline): `[stickyThreshold]`-only deps froze the mount-time saveScrollOffset → all web scroll offsets recorded under the mount destination, per-destination restore always reset to top. Fixed: saveScrollOffset added to deps.
- useNotificationActions stale notificationCount (introduced during the agg fix): badge decrement now reads useStore.getState() at call time.
- WithdrawScreen dead reducedMotionEnabled call removed (declared at baseline, never consumed).

Adversarial review (REQUEST_CHANGES → resolved): F1/F2/F3 fixed above. F4 (inventory focus-refetch full-screen loading flash), F5 (testID only on populated scaffold), swipe-dismiss badge decrement, sync-on-focus non-silent, missing a11yAudit/captureProtection — all verified verbatim parity with HEAD baseline, documented not changed. Notifications agent also fixed a type-only error in useWithdrawSubmission (string → SupportedCurrencyCode) that surfaced mid-flight between agents.

Final: frontend tsc 0 errors; focused suites 53/53 + 227/227; full suite 1,893/1,895 pass. Remaining failure: diagImport.test.tsx (co-own transform quirk from concurrent work, outside this wave).

## Wave H — 14 monolith decomps + G05 moderation ladder (2026-09-12)

Decompositions (pure refactor, owner-layer extraction):
- AIAgentIntegrationScreen 1,700 → 443 (Agent Studio hub)
- OrderDetailScreen 1,424 → 385
- VisualSearchScreen 1,236 → ~300
- UnifiedDiscoveryScreen 1,232 → ~280 (two-tier save extended here: tap=quick-save, long-press=collection picker via SaveToCollectionModal)
- BotBuilderScreen 1,231 → ~350
- WalletConvertScreen 1,228 → ~300
- SellerAuctionCentreScreen 1,207 → ~350
- MakeOfferScreen 1,174 → ~350
- LiveStreamSellerScreen 1,171 → ~350
- CreateGroupChatScreen 1,132 → 78
- BrowseScreen 1,119 → ~300
- SettingsScreen 1,106 → ~300
- GalleriaScreen 1,100 → ~300
- +1 additional (14 total, ~16,664 → ~2,705 LOC)

G05 moderation ladder (Mute → Restrict → Block):
- Backend (concurrent worker): migration 282 (relationship edges, unique owner/target/kind, self-edge prevention, cascading FKs); POST/DELETE /users/:id/mute + /restrict; restricted-accounts listing; notification fan-out suppression; request-state handling; read-receipt + typing-event exclusion; conversation DTO fields isAuthorMuted/isAuthorRestricted/isRestricted.
- Frontend: chatApi + domain/conversation mapping; profile viewer flags; RestrictedAccountsScreen; ChatSettingsScreen restricted entry; profile more-sheet mute/restrict/block; ConversationInfoScreen restrict action.
- Block bug fix: handleUnblockPartner was local-only, never called the API — now calls unblockUser with rollback.

Adversarial review (REQUEST_CHANGES → resolved):
- F1 blind-toggle defect: toggleMutedUser/toggleRestrictedUser called after committed server ops — when local set diverged from server truth (cross-device writes, hydration lag), unrestrict/unmute ADDED the id instead of removing. Fixed with set-semantics ops (add*/remove*) driven by the committed operation.
- Second-round review caught the same defect on the block ladder (4 sites) + conversation-flag latching: conversation.isRestricted/isBlocked never cleared locally, so derived UI stayed latched after unrestrict/unblock. Fixed: setConversationRestricted/setConversationBlocked mirror ops + setUserModerationInConversations sweep for profile-surface mutations; all 6 block call sites converted to add*/remove*; toggleMutedUser/toggleRestrictedUser/toggleBlockedUser deleted (dead code, wrong semantics for server-synced state).
- New test moderationLadder.test.ts: 9 tests covering idempotency, absence semantics, DM-only sweep, conversation mirror, source guards.

Final: frontend tsc 0 errors; 1,902/1,904 tests pass (2 = diagImport co-own transform quirk, concurrent workstream). moderationLadder 9/9 green.
