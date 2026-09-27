# ThryftVerse Web vs Mobile — Full Parity Gap Report

**Date:** 2026-09-27 · **Method:** 4 parallel read-only audits (commerce, social/discovery, messaging/support/trust, platform/systems) + structural inventory by the orchestrator. Mobile app (`frontend/`) is the product source of truth; web (`web/`) is audited against it.

---

## 1. Headline numbers

| Metric | Mobile | Web | Delta |
|---|---|---|---|
| Screens / routes | 178 screens | 101 routes | ~77 screens unported or folded |
| Component files | 840 (115 domains) | 359 | ~57% of mobile component mass |
| Hooks | 300 files | 11 files | Web hooks are thin query wrappers |
| Locales | 13 (ar, de, en, es, fr, hi, id, ja, ko, pt, ru, tr, zh) | English only | **i18n absent** |
| Theme system files | 13 files / 3,320 lines (density, motion, haptics, state-copy, radius rules, accent) | 1 token file + globals.css | Several systems unported |
| Animated state system | AnimatedSuccess/Empty/Loading, Lottie, Confetti, DoubleTapHeart | Static Skeleton + CSS fades | **Missing** |

**Honest reading:** the web's *flagship surfaces* (home, PDP, search, co-own, inbox, checkout, auctions) are at parity or better after waves 8–12. The gap is concentrated in (a) whole screens that never got routes, (b) depth inside "partial" surfaces, (c) cross-cutting systems (i18n, composition contract, animation, offline, density/accent), and (d) real backend wiring hidden behind fixture/demo comments.

---

## 2. MISSING — no web route exists (flagship build required)

### Commerce
| Mobile screen | What it does | Flagship web requirement |
|---|---|---|
| `BulkListing` | Multi-item draft grid, per-row validation, batch submit | `/seller-hub/bulk` — grid editor with per-row photo/price/condition, batch submit with progress |
| `AIPhotoEnhancement` | Capability-gated enhance flow: before/after slider, presets, background scenes, provenance states | Sell-flow media studio step with enhancement UI + honest provenance copy |
| `ManageListing` (per-listing command) | Stats (views/likes), share, offer-to-likers, promote, pause/relist, delete | `/seller-hub/listings/[id]` manage surface or a full manage sheet off each row |
| Per-seller `BundleBag` builder | Multi-select ≥2 items from one seller → bundled checkout | `/seller/[username]/bundle` builder keyed by seller |
| `OrderReceipt` (standalone) | Itemised printable/shareable receipt | `/orders/[id]/receipt` printable view + share/copy |

### Discovery / social / content
| Mobile screen | What it does | Flagship web requirement |
|---|---|---|
| `FeedExplanationSheet` + recommendation feedback | "Why am I seeing this?" + not-interested with attribution | Sheet on feed/explore tiles + feedback mutation wired to ranking |
| `Personalisation` | Gender/audience, size, brand, member preference pickers | `/settings/personalisation` or extend `/agents/algorithm` |
| `MoodboardHome` (hub) | Your boards rail + public discovery masonry + create/templates | `/moodboards` index route |
| Moodboard editor depth | Freeform canvas, comments, version history, conflict compare, collaborator management | Canvas editor + 4 collaborator sheets (mobile has all four as components) |
| `LookDetail` social layer | Comments sheet + related-looks feed | Comments UI + related rail on `/look/[id]` |
| `PosterStoryActivity` | Story insights: viewers/reactions/replies/style-votes, completion & engagement rates, peak-time histogram | `/poster/[id]/activity` insights surface (needs a fixture activity contract — currently none exists; do not fabricate) |
| `EditCollection` | Rename, privacy, cover, description | Metadata editor on `/collection/[id]` (web edits items only today) |
| `ExploreCollection` | Param-driven curated collection landing | Shareable curated landing route |
| `GalleriaCollectionDetail` / `GalleriaEditorial` | Full pages | Promote web's sheets to real routes with authored depth |

### Messaging / trust
| Mobile screen | What it does | Flagship web requirement |
|---|---|---|
| `ChatSettings` | 3-way who-can-message, read receipts, offers-in-chat, order-updates-in-chat | Messaging prefs section + store keys (web has one binary switch) |
| `GroupBotManagement` | Connect/disconnect chat agents per group | Panel inside `/inbox/[id]/info` + conversation-agents contract |
| `SellerVerification` (demands inbox) | List of verification demands with status | `/verification/demands` list route |
| `VerificationResponse` | Respond to authenticity/possession/condition/inspection demands with media upload | Response flow with evidence upload (the loop is entirely absent) |
| `MutedConversations` | Muted list with unmute | Muted tab/filter in `ConversationList` (state exists, UI doesn't) |
| DAC7 tax section | Tax-residency collection inside verification | Section on `/verification` |
| DSA illegal-content report | Trust & Safety entry | Route/entry from `/help` |

### Platform / systems
| Mobile screen | What it does | Flagship web requirement |
|---|---|---|
| `AssetLeaderboard` | Co-Own market leaderboard | `/co-own/leaderboard` from real fixture volume/returns |
| `WalletExchange` | Asset↔currency exchange UX | Extend `/wallet/convert` or new route |
| `MarketLedger` (market-wide) | Cross-market tape | `/co-own/ledger` aggregating the per-asset tape |
| `AccountSecurityRecovery` | Recovery codes / backup methods | Section in `/settings/security` |
| `ConnectedAccounts` | OAuth/connected services | Settings surface |
| `AccountControl` | Restrict/deactivate states | Settings surface |
| `AgentMemory` | Agent memory viewer | `/agents/memory` |
| `SyndicateOnboarding` | Dedicated syndicate explainer | Extend existing Co-Own gate or dedicated flow |
| `CorporateActionDetail` / `Vote` | Dedicated screens; votes currently session-local `useState` | Real screens + persisted vote mutation (financial integrity) |
| `SellerAnalytics` (full) | Cohorts, category splits, conversion | `/seller-hub/analytics` beyond the single revenue chart |

*Deliberately absent (agree):* `ModelRegistry`, `RuntimeSmokeTest` (dev tools), `BiometricLogin` (could map to WebAuthn/passkeys later), `CreateCamera` (needs a getUserMedia story or an honest file-upload-only stance).

---

## 3. PARTIAL — route exists, flagship depth missing

| Surface | Mobile has | Web lacks |
|---|---|---|
| **Checkout** | Delivery/carrier selector, verification add-on toggle, itemised breakdown sheet, progress overlay/dots, partial-data banner, trust cluster | All of the above (web has address/payment pickers + summary only) |
| **MakeOffer** | Expiry-hours selector, review sheet, conversation-linked offers | Sends immediately, fixed expiry, no review step |
| **Inventory** | Search bar, summary row, multi-select + BulkActionsBar + BulkEditSheet, promotions panel | Filter/sort/row actions only — no bulk anything, no promotions |
| **CatalogImportItem** | Per-item editor: media rail, `ImportedFieldDiff`, extraction candidates, issue navigator, keep/edit/exclude decision | Inline title/price/condition only |
| **Closet** | Media mosaic hero, collections section, outfits section, price-drop chip, identity strip, header actions | Flat grid + rails only |
| **Moodboard editor** | Canvas + 4 collaborator sheets | Read + masonry reorder |
| **Support thread** | Context bar (order/listing/payout), bot→human handoff, evidence states, pagination | Thread + composer only; accept/escalate fixture-gated |
| **Order support/returns** | Reason-specific evidence guidance + photo upload, refund-amount validation | Text-only sheets |
| **Notifications** | Full category filter sheet, server filter counts, quiet-hours badge | All/Unread/Orders chips only |
| **Verification** | DAC7 tax section | Absent |
| **Seller analytics** | Full analytics screen (cohorts, splits, conversion) | One embedded revenue chart |
| **Trade** | Standalone TradeConfirm + receipt | Embedded panel, no confirm/receipt step |
| **Settings security** | Real flows | Sessions hardcoded, 2FA explicit demo flag, password change sends nothing — needs live wiring + honesty labels |
| **Corporate actions** | Dedicated detail/vote screens | Inline session-local voting |
| **Chat composer** | Voice messages, documents | Photos only |
| **In-thread media** | Fullscreen viewer route | Inline render, no tap-to-expand (MediaLightbox exists — wiring gap) |
| **Message requests** | Accept / delete / block | Accept/Decline only |
| **Outfit builder** | AI "complete the look" suggestion card | Absent |
| **Home signals** | Backend-driven dynamic signal chips | Static `HOME_SIGNALS` constant |
| **Conversational search** | AI trust/confidence signal per answer | Absent |
| **Visual search** | Saved visual searches | Not persisted |

---

## 4. Cross-cutting systems (the deepest structural gaps)

1. **i18n — absent.** Mobile ships 13 locales via i18next; web is hardcoded English and the settings "Language" control swaps a label only. Flagship requirement: next-intl/i18next pipeline + locale routing + the 13 locale bundles.
2. **Flagship composition contract — absent.** Mobile's `components/flagship/*` (FlagshipScreen, FlagshipState, FlagshipStickyFooter, FlagshipDangerZone, skeleton system) plus four governance docs (ACCESSIBILITY_CHECKLIST, COMPOSITION_GUIDE, MEDIA_QA_MATRIX, TERMINOLOGY) define the quality bar. Web views are bespoke; there is no auditable state machinery or copy registry. Port the contract (web-adapted) + the docs.
3. **State copy registry — absent.** Mobile `stateCopyRegistry.ts` enforces canonical loading/empty/error/partial/offline copy; web authors copy ad hoc per call site → drift.
4. **Animated state system — absent.** AnimatedSuccessState/EmptyState/LoadingState, Lottie assets, Confetti, DoubleTapHeart, StaggeredGridEntrance. Web confirmations (purchase, payout, vote) land static.
5. **Offline/network layer — absent.** No `navigator.onLine` detection, no offline banner, no sync-status grammar (mobile: OfflineBanner, SyncRetryBanner, SyncStatusPill, RetryState).
6. **Density system — absent.** Mobile compact/regular/editorial per department; web has one density. Requirement: `data-density` attribute + token scale + settings row.
7. **Accent preference — absent.** Mobile has an accent picker; web is brand-colour-only.
8. **Motion tokens — partial.** Web has easings/durations/reduced-motion but no codified token module or grammar doc; mobile has motionTokens + motionPresets + MOTION_GRAMMAR.md.
9. **Charts — partial.** Web's candle/depth charts exceed mobile, but there is no ChartTooltip primitive and no generic Line/Bar chart (seller analytics needs them).
10. **Media pipeline — partial.** No gesture image viewer, no video pipeline (mobile has thryft-media-export / thryft-video-export modules), no camera capture. Web posters/pulse are stills-only by honest design.
11. **Hooks breadth.** Mobile's 300 hooks include voice recorder/player, conversation agents, per-group chat preferences, device provider keys, checkout capability orchestration, creator analytics — none have web equivalents.

---

## 5. Where the web already exceeds mobile

- Desktop refinement rail with true facet counts + URL-persisted sort (eBay-grade)
- TradingView-grade depth ladder/order book on Co-Own
- Two-pane WhatsApp-Web inbox with group admin depth
- Notification type-section grouping with in-row follow
- Editorial serif grammar + per-level typography tracking (wave 12)
- Lightbox keyboard/drag navigation; PDP sticky buy column

---

## 6. Prioritised roadmap (flagship impact order)

**Tier 1 — money & trust (build first)**
1. Checkout delivery selector + verification add-on + breakdown sheet
2. Seller verification demands + response flow (with evidence upload)
3. Order support/return evidence upload + refund validation
4. Settings security live wiring (+ recovery codes, connected accounts, account control)
5. Corporate-action vote persistence + dedicated screens

**Tier 2 — seller power tools**
6. Inventory bulk operations + promotions
7. Per-listing manage surface
8. Bulk listing
9. CatalogImport per-item editor (field diff, candidates, issue navigator)
10. Seller analytics screen (needs Line/Bar chart + tooltip primitives)

**Tier 3 — social/algorithm depth**
11. Feed explanation sheet + recommendation feedback loop
12. Personalisation prefs
13. Moodboards hub + editor depth (canvas, comments, versions, collaborators)
14. Look comments + related looks
15. Poster story activity (requires a new fixture contract first)

**Tier 4 — platform systems**
16. i18n pipeline (13 locales)
17. Flagship composition contract + state copy registry + governance docs
18. Animated state system (success/empty/empty, confetti, double-tap heart)
19. Offline/network layer (banner, retry grammar, sync status)
20. Density + accent personalisation

**Tier 5 — parity odds & ends**
21. Muted list, message-request block, in-thread media lightbox wiring, voice/document composer, offer expiry/review, bundle builder, receipt page, wallet exchange, market ledger, asset leaderboard, agent memory, group bot management, outfit AI suggest, galleria sub-pages, curated collection landing, collection metadata editing, dynamic home signals, chat trust signals
