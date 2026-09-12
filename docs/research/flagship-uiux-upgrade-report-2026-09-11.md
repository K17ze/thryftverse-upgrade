# ThryftVerse production UI/UX upgrade report

## 1. Executive assessment

ThryftVerse's next substantial quality gain will come from making its existing breadth behave as one dependable product. The current implementation already contains serious work: heterogeneous discovery feeds, canonical commerce routing, media-aware product detail, creator documents and upload reconciliation, checkout settlement states, seller operations, and co-ownership reservations. The opportunity is to close the seams between these systems, reduce competing visual structures, and replace implementation assertions with reproducible product evidence.

**Production readiness is not established by this assessment.** This is a research and upgrade specification, not a release certification. Source inspection establishes concrete implementation findings. Native composition, production endpoint behavior, real-account permissions, and released-build performance still require the validation described here. There is no defensible basis for a percentage claim such as “95% flagship” or “Instagram parity.”

The highest-value priorities are:

- **Repair the evidence system.** A legacy visual-completion hook marks mount as completion; selected visual tests assert source strings; Design.md contains future-dated and stale implementation statements. These weaken decisions about what is actually finished.
- **Make uncertainty visible on money surfaces.** Checkout has an unknown-outcome state, but its shared feedback component lacks a dedicated visual branch. Co-ownership confirmation defaults a missing fee rate to 1%. Fix the authoritative contract and the presentation together.
- **Make search coherent.** Current discovery search resets the selected search scope during typing; people-search failures become empty results; visual-search colour/style facets are text matches over returned candidates. These are larger quality gaps than another decorative treatment.
- **Recompose seller operations around urgent work.** The current hub places four destination tiles before liquidity and order tasks. Put the next necessary seller action before destinations and secondary analytics.
- **Finish one interaction language.** Consolidate semantic typography, reduced-motion behavior, transparent control targets, sheets, contextual feedback, and navigation continuity. Preserve different compositions for discovery, communication, creation, commerce, and money.
- **Prove complete journeys.** A saved item, accepted offer, successful listing, order, dispute, or trade must remain consistent across its full surface set after refresh, backgrounding, logout, reconnect, and process restart.

The recommended product identity is **fashion-led discovery with precise commerce and explicit ownership truth**. Imagery supplies personality; typography and geometry supply hierarchy; accurate state supplies trust. Financial and support experiences should communicate calm control. They should not borrow entertainment urgency merely because a benchmark uses it.

## 2. Scope, evidence and limitations

### Assessment snapshot

- Research access date: **11 September 2026**, checked against the Windows host clock.
- Workspace and Git root: `C:/Users/User/Desktop/thryftverse-upgrade`.
- Remote: `https://github.com/K17ze/thryftverse-upgrade.git`.
- Starting branch: `feat/product-detail-contract-media-device-closure`.
- Starting HEAD: `5a24cd32838f9941dcb5a2ed54ccb25327882e67`.
- Evidence includes the **uncommitted working tree**, not only HEAD. Numerous commerce, creator, co-ownership, navigation, test and Design.md changes were already present.
- Inventory found **171 top-level screen TSX files**. This is a file inventory, not 171 independently exercised journeys or confirmed live routes.
- This report is the requested deliverable. No product implementation, merge, deployment, or remote publication is part of this research pass.

### Evidence labels used throughout

- **CODE:** directly inspected source behavior or configuration. A code finding is not automatically a reproduced runtime failure.
- **REFERENCE IMAGE:** directly inspected image supplied in the repository. These establish composition at capture time, not current universal app behavior.
- **PRIMARY:** official product documentation, official engineering material, standards, or original research retrieved online.
- **SECONDARY:** independent usability research or community reports. Population, age and limitations matter.
- **INFERENCE:** an architectural or design risk inferred from evidence, requiring a targeted test.
- **PROPOSAL:** an original ThryftVerse upgrade or acceptance target. Numeric targets in this report are proposed product budgets unless explicitly attributed.

### Native evidence boundary

An Android emulator, `emulator-5554`, and `com.thryftverse.app` were present. Opening the application showed the Expo development launcher. Selecting its recent development-server entry did not yield a product screen during the observed check. Captures therefore establish the launcher state only. They do not establish an app crash, a production outage, or the rendered appearance of this working tree. No current ThryftVerse screen passed a thumbnail or squint test in this assessment. No iOS native session was available.

Authenticated competitors were not operated with test accounts. Online product documentation and repository-supplied images support the benchmark analysis. Exact current pixel dimensions, haptics, timings, account experiments, and failure-state parity are **unverified**. No proprietary competitor implementation is inferred as fact.

### How to interpret priority

- **P0:** release-blocking if the stated money, privacy, destructive-action or unrecoverable-loss failure is reproduced. An identified contract-truth defect may require immediate closure even before visual polish.
- **P1:** material comprehension, continuity, accessibility, state, or flagship-quality gap.
- **P2:** useful refinement after the principal journey works correctly.
- **P3:** optional differentiation, dependent on product evidence and operating capacity.

The static scanner's P0/P1 labels are reported separately. A hardcoded colour is not automatically the same severity as a duplicated payment. Open questions are explicitly called out; absence of proof is not proof of absence.

## 3. Reference strategy by department

### Instagram: social identity, conversation and media continuity

**PRIMARY:** Meta's August 2025 announcement documents credited reposts, opt-in map sharing, and a Friends surface in Reels. Its May 2026 Instants announcement describes camera-originated sharing with an explicit audience and expiry. These support studying authorship, audience and continuity; they do not require ThryftVerse to add a map or disappearing commerce records. [S01](https://about.fb.com/news/2025/08/new-instagram-features-help-you-connect/), [S02](https://about.fb.com/news/2026/05/instants-share-in-the-moment/)

- Transfer: identity remains adjacent to content; a reply has a clear originating object; save/share/repost are distinguishable actions; privacy controls describe actual audience.
- Exceed: keep item condition, availability, seller context and offer state attached to social content without turning every post into a storefront advertisement.
- Avoid: adding social activity badges without privacy projections; copying a tab arrangement from a single account screenshot; making purchasing dependent on watching more content.
- Validate: open item from a Look, open its seller, send a question, return to the same Look and playback position. The object, sender, recipient and transaction context must remain intelligible.

### Pinterest: visual discovery, refinement and collections

**PRIMARY:** Pinterest's May 2025 visual-search announcement describes image-originated refinement, object selection, and combined image/text exploration. Its original Shop The Look paper describes detection, embeddings, serving and relevance evaluation. The paper is a historical architectural reference, not proof of the current proprietary stack. [S03](https://newsroom.pinterest.com/en-au/news/introducing-new-visual-search-features/), [S04](https://arxiv.org/abs/2006.10866)

- Transfer: search continues from the object; collection covers reflect their contents; dense imagery and restrained metadata support scanning.
- Exceed: every shopping result has truthful size, condition, currency and availability. Visual similarity must not imply authenticity or exact identity.
- Avoid: claiming Pinterest parity because a grid is masonry; manufacturing random aspect ratios to make a feed look authored; using a model-generated style label as a verified item attribute.
- Validate: crop to one garment, refine one attribute, inspect another result, then return with crop, query, result order and scroll anchor intact.

### Snapchat: capture and direct manipulation

**PRIMARY:** Snap's Simple Snapchat announcement was explicitly a test in September 2024. It is evidence of camera-centred intent, not proof of today's universal navigation. Support documentation distinguishes saving to Memories from saving to the device and cautions about incomplete backup. [S05](https://newsroom.snap.com/sps-2024-simple-snapchat), [S06](https://help.snapchat.com/hc/en-us/articles/7012366807956-How-do-I-save-a-Snap-to-Memories-and-Camera-Roll)

- Transfer: immediate capture feedback; uninterrupted transition into editing; persistent work; visible destination and audience before sending.
- Exceed: fashion creation preserves truthful item appearance and linked-product identity, including when a seller changes or removes a listing.
- Avoid: surprise publish gestures; controls that cover the garment; treating an upload-progress animation as evidence of remote persistence.
- Validate: camera permission denied, limited library, interrupted recording, low storage, backgrounding, process death, upload loss and publish reconciliation.

### Depop: fashion commerce and seller utility

**PRIMARY:** Depop's current bundle documentation describes same-shop grouping and automatic application of configured discounts or shipping incentives. Its offer documentation provides seller offers and counteroffers. Apply the principle of transparent price composition; do not copy fee amounts across regions. [S07](https://depophelp.zendesk.com/hc/en-gb/articles/360017585774-Bundles), [S08](https://depophelp.zendesk.com/hc/en-gb/articles/15495796917777-Send-Offer)

- Transfer: garment imagery leads, seller identity stays visible, condition and sizing are easy to inspect, offers are explicit, and fulfilment is operationally simple.
- Exceed: show the exact interaction of an accepted offer, bundle discount, shipping, protection and seller net proceeds before commitment.
- Avoid: letting an “accepted offer” visually imply stock reservation or completed purchase if those are not server guarantees.
- Validate: two buyers contend for one item; one bundle item sells during checkout; an offer expires while open; a partial return changes seller proceeds correctly.

### Robinhood: financial hierarchy and order comprehension

**PRIMARY:** Robinhood distinguishes an indicative last price from execution, explains that limit orders may not fill, and provides chart interactions. Its advanced-chart documentation explicitly identifies additional accidental-trade risk when confirmation is skipped. ThryftVerse should borrow clarity, not auto-send trading. [S09](https://robinhood.com/us/en/support/articles/limit-order/), [S10](https://robinhood.com/us/en/support/articles/using-advanced-charts/), [S11](https://robinhood.com/us/en/support/articles/buying-a-stock/)

- Transfer: one dominant amount, an explicit interval, stable numerical columns, visible order type, full obligation and readable order history.
- Exceed: distinguish asset appraisal, last trade, bid, ask, executable preview and settlement unit on illiquid ownership surfaces.
- Avoid: sparkline-as-reassurance, ornamental green, a liquid-market metaphor for assets without executable depth, or exposing advanced controls before users understand ownership rights.
- Validate: empty book, one-sided book, stale quote, partial fill, reservation expiry, rejected order, disputed custody and unknown submission result.

### Whatnot and platform guidance

Whatnot's current support documentation distinguishes extending timers from non-extending Sudden Death auctions. The transferable lesson is explicit auction rules and server-authoritative closing, not novelty timer icons. [S12](https://help.whatnot.com/hc/en-us/articles/14932924544141-Bid-on-an-item-during-a-show)

Apple and Android guidance ground interaction sizing, accessibility and navigation. These are platform baselines, while the ThryftVerse charter defines the stricter visual restraint policy. Android recommends 48dp targets; Apple's design tips use 44pt. WCAG's web target criterion must not be substituted for native ergonomics. [S13](https://developer.apple.com/design/tips/), [S14](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views), [S15](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)

## 4. What the supplied images actually teach

Five repository images were visually inspected: `overall outlook.jpeg`, `inbox messages.png`, `saved_closet .jpeg`, `edits,looks,pulse reference.jpeg`, and `edit profile settings reference .jpeg` in `reference images/`. Original platform version, account experiment and capture date are not established by their filenames.

- **Discovery composition:** the Pinterest captures combine image mosaics, a dominant media feature and horizontal continuation. Titles sit on the canvas; there is no separate grey container around every caption. Different module proportions create rhythm. Transfer that relationship, rather than reproducing the exact cards or editorial copy.
- **Collection identity:** the saved-items capture uses content mosaics or a single cover plus a short title. Privacy is a compact secondary attribute. The collection's objects provide recognition; a large folder icon would do less useful work.
- **Inbox density:** the Instagram capture has plain conversation rows, recognisable avatars, and concise previews. However, its top search/notes/filter area consumes substantial space. ThryftVerse should preserve row clarity while checking whether its own transaction inbox can surface urgent conversations sooner.
- **Edit-profile boundaries:** fields have meaningful outlines; navigation is transparent; the primary completion action has a disabled appearance. The image also spends substantial height on explanation and avatar editing. This is a reference for hierarchy, not an instruction to reproduce that height on a compact phone.
- **Media overlay contrast:** the light discovery capture uses white controls over photography and a dark primary CTA. ThryftVerse must validate actual background contrast; copying white glyphs without a controlled scrim is insufficient.
- **Selective rejection is part of good reference use:** a reference may include oversized controls, crowded notes, commercial hero content or duplicate labels. Keep only the behavior that supports the ThryftVerse task. The charter's anti-AI policy is compatible with learning from references critically.

No point measurements are asserted from these images: source pixel width is not a known native point width. For the next native pass, normalize captures by logical viewport and font scale, then record first-content position, visible objects, containment count and dock occlusion.

## 5. Verified implementation findings

### F01 - Design evidence is temporally and structurally inconsistent | P1 | CODE

`Design.md:4` declares `benchmark-date: 2026-09-22`, eleven days after the assessment date. Its opening implementation-status statement says runtime premium/luxury tokens are not exposed, while `frontend/src/theme/ThemeContext.tsx` exposes `antiqueGold`, `bronze`, `bronzeSubtle` and semantic accent fields, some deprecated. The current runtime colours are imported from `frontend/src/constants/colors.ts`, so the prose is also an incomplete source-of-truth map.

**Upgrade:** separate immutable reference evidence, current implementation status, and proposed design policy. Give each claim an access date, applicable platform, code symbol and evidence status. Reject future verification dates. Deprecation means “present but not for new use,” not “absent.” **Acceptance:** every VERIFIED statement maps to inspectable current evidence; references and implementation status can be updated without silently changing product policy. Owner: design-system and release engineering.

### F02 - Mount is recorded as visual completion | P1 | CODE

`frontend/src/performance/visuallyComplete.ts:58` marks completion in a mount effect. Its enhanced `useReadiness` also calls `markVisuallyComplete` on mount. Milestones are stored by surface name and recorded only once until reset; the inspected consumers do not demonstrate a per-visit reset lifecycle. Home consumes the legacy hook.

**Upgrade:** issue a visit ID per route focus; measure mount, critical data, first decoded media, interactive controls and visually settled content separately. Complete only after the required milestones for that surface. Record durations from the same monotonic origin. **Acceptance:** delaying image decode does not emit completion; visit two produces independent timings; partial content can be usable without falsely declaring all critical modules ready. Owner: performance platform.

### F03 - Selected “native visual acceptance” tests are source assertions | P1 | CODE

`frontend/src/__tests__/nativeVisualAcceptance.test.ts` contains `toContain` and regex assertions for component names, radii and icon imports. A check that a screen contains `CommerceDetailIdentity` does not establish surface count or visual hierarchy. `.github/workflows/screenshots.yml` separately defines native screenshot jobs; their existence is a positive foundation, but their latest successful execution was not verified here.

**Upgrade:** retain useful architectural checks under accurate names; remove tautological claims; connect real screenshots, device metadata and behavioral assertions to release acceptance. **Acceptance:** an intentionally oversized title or occluding dock fails rendered acceptance even if the same component names remain. Owner: quality engineering and design review.

### F04 - Typography contracts disagree | P1 | CODE

`frontend/src/theme/designTokens.ts` directs new code toward its type exports while `frontend/src/theme/typography.v2.ts` calls itself canonical for new code. Their `display` roles differ: 24 versus 32. The latter's comment that legacy maps mirror the roles is therefore not true for all roles.

**Upgrade:** choose one semantic role definition and make compatibility exports genuine aliases. Migrate by component family after native comparison. **Acceptance:** a role cannot resolve to different geometry depending on import path; native large-text review remains separate from token consistency. Owner: design system.

### F05 - Create press behavior exceeds the charter range | P2 | CODE

`frontend/src/navigation/TabNavigator.tsx:170` uses `withSpring(0.9, spring.tap)`. The canonical pressable and charter describe a restrained 0.97-0.985 range. Increased damping alone is not proof of no motion under reduced-motion settings.

**Upgrade:** use the canonical press policy and explicitly suppress scale when motion is disabled. Keep the existing distinction between a 52pt hit area and a 40pt visible Create shape. **Acceptance:** Create does not visibly collapse or bounce, and reduced motion removes spatial scaling. Owner: navigation.

### F06 - Discovery typing resets search scope | P1 | CODE

`frontend/src/screens/UnifiedDiscoveryScreen.tsx` calls `setSearchScope('items')` inside the effect that runs when the normalized query changes. Users searching People can be returned to Items as they edit the query. The same screen's people-search catch clears results without a distinct people-error state.

**Upgrade:** let explicit scope selection own the scope. Maintain scoped query state, errors, cancellation and cursor. **Acceptance:** selecting People and adding five characters leaves People selected; a failed request renders retry rather than “no people”; old responses cannot replace a newer query. Owner: discovery/search.

### F07 - Search adapters reconstruct incomplete commerce objects | P1 | CODE / INFERENCE

UnifiedDiscovery maps search results into a richer feed unit using `Number(item.priceGbp ?? 0)`, `likes: 0`, `condition: null` and fallback media geometry. These defaults are visible in code; whether every default is rendered depends on the receiving tile. This is a contract-risk finding, not a claim that a zero price was observed on device.

**Upgrade:** return a canonical discovery summary from the search API. Preserve missing price and unavailable social counts as unknown. Permit layout fallback geometry without describing it as verified media metadata. **Acceptance:** null price never displays as free; unknown counts do not appear as zero; seller ID and canonical routing survive the adapter. Owner: API contracts and search presentation.

### F08 - Visual refinements are candidate-local text matches | P1 | CODE

`frontend/src/screens/VisualSearchScreen.tsx:297` filters colour/style by listing text after the API returns candidates. `backend/api/src/routes/visualSearch.ts` contains a bounded candidate retrieval path and explicitly distinguishes visual, heuristic-colour and filter-only methods. The implementation is more honest than an unlabelled fake visual engine, but text filtering can discard relevant images and cannot improve retrieval beyond the fetched candidate set.

**Upgrade:** move structured facets and multimodal refinement into retrieval/ranking; return method, applied constraints and coverage. Preserve honest fallback labels. **Acceptance:** a blue garment without “blue” in its title can be retrieved by visual evidence; unsupported facets are not represented as model-derived facts; empty and unavailable are distinct. Owner: search backend, ML and discovery.

### F09 - Seller hub prioritizes destinations before work | P1 | CODE / visual validation pending

`frontend/src/screens/SellerHubScreen.tsx:244` renders four pillar tiles before the financial hero, trust strip and orders module. It later renders analytics, saved pieces, listings and opportunities. The component split is useful, but the composition covers many domains and still risks a dashboard silhouette.

**Upgrade:** lead with the highest-priority server-backed operational task, a compact money summary and a flat task queue. Move secondary destinations into restrained navigation. Preserve all capabilities. **Acceptance:** the first overdue shipment and its action appear in the first viewport on a compact device; no repeated wallet/order summaries compete with it. Owner: seller experience.

### F10 - Seller focus and partial-state semantics need closure | P1 | CODE / INFERENCE

SellerHub loads through a mount effect and manual refresh in the inspected file, without a screen-focus refresh. Failed secondary order/listing fetches resolve to null, while children receive `isOrdersLoading={sellingOrders === null}` and `isLoading={ownListings === null}`. Null therefore can mean failure or loading at the rendering boundary.

**Upgrade:** use explicit resource states and shared query ownership; refresh on relevant mutation and return. **Acceptance:** failed orders stop showing a loading treatment and expose retry; returning after dispatch removes the task without manual refresh; old-account results cannot populate a new session. Owner: seller data orchestration.

### F11 - Checkout unknown outcome lacks dedicated banner semantics | P1, P0 if recovery permits duplicate obligation | CODE

`frontend/src/utils/checkoutFlow.ts` declares `unknown_outcome`; `CheckoutScreen.tsx:831` sets it after a network failure with a known intent. `PaymentStateBanner.tsx` has no explicit unknown-outcome case, so it falls through to neutral/default styling. Its label is also capped at two lines. The checkout's idempotency and settlement handling should be preserved.

**Upgrade:** provide a distinct checking-result state, a durable operation record and a safe result lookup. Keep the warning readable at large text. Inspect the separate case where the request commits before the client receives an intent ID. **Acceptance:** every lost-response point yields no false success and no blind new attempt; process restart can locate the same operation. Owner: payments and checkout.

### F12 - Co-ownership confirmation invents a fee label when absent | P0 contract-truth gap | CODE

`frontend/src/screens/TradeConfirmScreen.tsx:110` uses `routeFeeRate ?? 0.01`, and lines 407-408 format it into “Including/After ...% fee.” This can represent an unevidenced fee as known. It does not establish that the backend charges the wrong amount; it establishes that the client can display a fabricated percentage.

**Upgrade:** require the fee rate, absolute fee, settlement unit and quote revision from the server preview. Missing data blocks commitment and offers quote refresh. **Acceptance:** an omitted fee never becomes 1%; the confirmed fee and receipt agree under price changes and retries. Owner: co-ownership contract and trade UI.

### F13 - High-risk confirmation uses a proxy instead of the full policy | P1 | CODE

TradeConfirm's comment defines a hold threshold by value or percentage of public float, but its implementation uses `netValue > 5000` and notes the missing float. The screen also compares a current quote with a reserved price using an absolute 2% difference. These deserve policy validation: favorable price movement and a user's deliberately distant limit are not necessarily reasons to reject a quote.

**Upgrade:** return a server-authored confirmation requirement and executable quote validity result. Treat this as financial product policy, not a frontend animation choice. **Acceptance:** both threshold dimensions and directional protection are tested; a valid resting limit is not rejected merely for being far from the last trade. Owner: market policy, backend and trade experience.

### F14 - Reduced-motion entry points are inconsistent | P1 | CODE / INFERENCE

The shared `frontend/src/hooks/useReducedMotion.ts` combines OS and in-app preferences and subscribes to OS changes. `frontend/src/creator/useCreatorPublishWorkflow.ts` imports Reanimated's own `useReducedMotion`. Official documentation says that hook reflects startup state and does not rerender on settings changes. Individual behavior must be traced before declaring a visible violation. [S16](https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/)

**Upgrade:** use one application preference contract at product boundaries, with explicit worklet behavior. **Acceptance:** switching the in-app preference while editing or publishing changes relevant motion without restarting. Owner: accessibility and creator platform.

### F15 - Continuous pending pulses conflict with the local motion policy | P2 | CODE

`frontend/src/components/checkout/PulsingDot.tsx` and PaymentStateBanner use indefinitely repeated opacity sequences while work is pending. They contain reduced-motion handling, which is a strength, but the charter prohibits continuous pulsing.

**Upgrade:** use a conventional bounded pending indicator and specific status copy; reserve animation for state transition and real progress. **Acceptance:** pending payment does not produce an indefinite decorative pulse; the state remains comprehensible without animation. Owner: shared feedback components.

### F16 - A production surface exposes planned capabilities | P2 | CODE

`frontend/src/screens/BotBuilderScreen.tsx:692` displays “Coming soon - not yet available on this deployment” in a planned-capabilities section. This is not evidence of a fake successful action; it is evidence of roadmap content occupying the product interface.

**Upgrade:** show only actionable capabilities to ordinary users, or present a concise, truthful availability explanation at the point of a relevant blocked task. Preserve administrative capability inspection in an appropriate surface. **Acceptance:** consumers do not traverse a catalogue of unavailable controls. Owner: assistant/bot product.

### F17 - Large orchestration files increase state-coupling risk | P1 architectural programme | CODE

Observed screen sizes include Checkout 2,366 lines, Chat 2,167, AuctionDetail 1,941, ItemDetail 1,903, MoodboardEditor 1,750, Sell 1,486 and AssetDetail 1,324. These exceed the charter's 400-line screen threshold. Several already import domain components and hooks; “nothing is modularized” would be false.

**Upgrade:** extract remaining state machines and domain sections as part of behavior repair, not a blanket rewrite. Keep canonical routes and contracts. **Acceptance:** screen orchestration has one clear ownership boundary; failure and retry logic is testable without mounting unrelated sections; no replacement V2 screens. Owner: department maintainers.

### F18 - Static visual policy is currently not clean | P1 evidence gate | CODE

The report-mode visual checker scanned 1,440 files and reported 50 P0-labelled findings, 18 P1-labelled findings and 138 warnings. It says strict default would fail on P0. The checker itself documents that it cannot judge optical alignment, hierarchy, media dominance or transition quality.

**Upgrade:** triage each result into true defect, allowed semantic exception or scanner limitation. Fix ownership-level issues; narrow exceptions rather than adding broad exclusions. **Acceptance:** strict checks pass for the release candidate and rendered review still runs. Do not equate a report-mode exit code of zero with clean gates. Owner: design platform and quality engineering.

## 6. Overall experience language

### One product, five composition families

**PROPOSAL:** define shared behavior without forcing shared silhouettes.

- **Discover:** image-first, variable media proportions, concise identity and price, visible next content, quiet save controls. The dominant object is the garment, look or collection.
- **Communicate:** flat rows and conversation canvas, stable identity, strong unread distinction, a composer that never competes with multiple contextual strips. The dominant object is the conversation.
- **Create:** canvas-first with tools revealed for the selected object. The dominant object is the work in progress; chrome supports direct manipulation.
- **Transact:** object summary, condition/size, delivered cost, commitment and recovery. The dominant object is the purchase decision.
- **Operate and own:** task urgency or a financial position with clearly qualified values. The dominant object is the user's obligation or holding, not a stack of feature cards.

This makes the application recognisable across departments while letting each department solve a different problem. A common type family, icon grammar, inset system, state vocabulary and navigation physics can hold these compositions together.

### Concrete anti-AI composition rules

- Start each surface with an object and a reading order written in one sentence. If the sentence lists six equally important modules, reconsider the hierarchy before implementation.
- Give each visible container a reason: selection, input, contrast over media, a modal boundary, or a real group. “It looks polished” is not a reason.
- Use a flat canvas for utility content. Prefer white space and hairlines to repeated rounded grey panels.
- Keep one primary action per decision region. The screen may have other actions, but they must not all use the same filled emphasis.
- Use a small, controlled radius vocabulary within each viewport. Preserve distinct avatar geometry; do not manufacture an app-wide radius of 24 for everything.
- Remove repeated title/subtitle/eyebrow combinations. Copy should name the object or the next action, not explain that the screen exists.
- Avoid calling every area “Studio,” “Hub,” “Radar,” “Passport,” “Intelligence” or “Premium.” Use those terms only when users understand a distinct capability behind them.
- Do not erase content in pursuit of minimalism. A plain fee row is more premium than a beautiful button that hides total cost.
- Make familiar tasks boring in a good way: clear fields, predictable Back behavior, actual saved state, actionable failure and a durable receipt.

### Acceptance

At 25% scale, an evaluator should distinguish discovery, chat, editing, checkout and seller operations without reading titles. At normal scale, the primary action and state must be evident within a short glance. Test this with first-time participants; do not substitute the implementer's familiarity for usability.

## 7. Navigation and information architecture

**Current anchors:** `TabNavigator.tsx`, the four `navigation/tabStacks/` files, `AppNavigator.tsx`, `navigation/linking.ts`, `navigation/navigationPersistence.ts`, `platform/product/openProductDetail.ts` and `navigation/types.ts`. The tab structure already uses Home, Explore, Create, Inbox and Profile, and Create is an action rather than a selected destination.

### Upgrade specification

- Define Home as the returning user's feed and Explore as deliberate discovery. GlobalSearch, Search, Browse, UnifiedDiscovery and DiscoverScene should have explicit jobs and canonical entry points. Multiple implementations are not inherently duplicates, but inconsistent query/back behavior is.
- Keep creation modal to the current context. Returning from cancellation restores the previous tab and scroll position. Returning from publish should show the created object or a truthful processing state.
- Preserve one back stack per tab. Re-selecting a tab may scroll to top only under a documented rule; it must not unexpectedly discard a nested form or conversation.
- Verify the custom tab-swipe gesture against horizontal media galleries, chart scrubbers, editor gestures, list-row actions and Android edge Back. A gesture cannot be “native” if two owners compete for the same movement.
- Preserve origin metadata for product transitions: object ID, source surface, rail or feed position, filter context and relevant media index. Do not store sensitive payloads in share links.
- Deep links should handle unauthenticated state, removed objects, private collections, missing permissions, expired offers and unavailable markets. Authentication returns to the intended destination once.
- Do not route users to editors as a generic read-only viewer unless the permissions and editing affordances are explicit. UnifiedDiscovery's moodboard-to-editor entry deserves a visitor/owner permission test.
- Give sheets and modal screens different jobs. A single parameter choice belongs in a sheet; a long investigation, multi-step transaction or due-diligence document may need a pushed screen.
- Make Close mean dismiss the temporary task and Back mean return one navigation level. Confirmation is required for actual unsaved work, not every exit.
- Define how navigation behaves when the originating item disappears while a detail screen is open. Restore the surrounding list position rather than leaving a broken destination.

**Acceptance:** exercise tab changes and deep links from cold launch, foreground, background and signed-out state. Run ten repetitions of each return journey without stack duplication. Include Android predictive Back and iOS interactive-pop cancellation. Android's documentation explicitly treats Back as a destination preview; support must be verified in the native build. [S17](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)

## 8. Home feed and social discovery

**Current anchors:** HomeScreen, HomeHeader, HomeFeedHeader, HomeMasonryFeed, useFollowingFeed, useForYouFeed, useRecommendationImpressions and useViewabilityPlayback. Existing work includes persisted For you/Following choice, impression reporting, connectivity awareness, prefetching and single-active-tile playback.

### Composition and behavior

- Keep the first useful media close to the header. Measure the combined height of title/search, mode selector, category signals, stories and status messages. Optimize that sum; shrinking one isolated control is insufficient.
- Make For you and Following meaningfully different. Following must not silently substitute recommendations when empty. Offer a clear discovery continuation instead.
- Keep category signals relevant to the current mode and reflect actual filtering semantics. A chip that only nudges ranking should not visually promise a strict filter.
- Treat editorial modules as finite narrative breaks. Use real content and a deliberate cadence; never fill empty inventory with a fake editorial hero.
- Distinguish listing, Look, Poster and collection affordances. The media can remain primary while a quiet semantic cue clarifies whether tapping opens a purchasable object, an outfit or a story.
- Preserve save and like actions independently. Confirm them locally, reconcile failures and offer undo where appropriate. Avoid repeated toasts for every feed interaction.
- Maintain a stable feed while the user reads. New content should arrive behind a “new items” action or a controlled refresh, not insert above the viewport and shift the target under a finger.
- Keep social counts optional when unavailable. A zero is a statement, not a neutral placeholder.
- Carry “why this item” context into detail and let users act on it. A recommendation explanation should correspond to a real signal and preference action.
- Respect data saver, reduced motion and mute preferences. Prefetch only the next useful media and stop when app focus changes.
- Handle end of feed intentionally: an honest end, an optional next journey and preserved scroll context. Do not loop old inventory and call it new.

### Full-stack dependency

The feed needs stable cursors, de-duplication, availability projections, user-scoped cache keys, provenance and impression IDs. Ranking and media delivery are coupled: a highly relevant result that arrives as a blank tile is still a failed discovery experience. Meta's historical Explore engineering article describes multiple retrieval/ranking stages and caching; it supports evaluating the whole path, not prescribing Meta-scale infrastructure here. [S18](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/)

**Acceptance:** at least two meaningful media objects or clear continuation appear in the first standard-text viewport; image load does not move save targets; refresh does not duplicate IDs; one tile plays at a time; blocked or removed content is no longer recommended after the contract's propagation window.

## 9. Explore, text search and visual search

**Current anchors:** UnifiedDiscoveryScreen, DiscoverScene, SearchScreen, GlobalSearchScreen, BrowseScreen, FilterScreen, VisualSearchScreen, PinterestMasonryGrid, listingsApi visualSearch, and backend search/visualSearch routes.

### Text-search upgrade

- Preserve scope while typing and switching between Items and People. Keep independent cursors and error states per scope.
- Make query, filters, sort, category and result count a single coherent state. A count must identify whether it represents the whole query or only loaded items.
- Show recent queries only within the correct user account; allow deletion and clear-all. Private searches should not reappear after logout.
- Handle short queries deliberately. Brand abbreviations and sizes can be one character or numeric; the current two-character threshold should be a product rule rather than an unexplained blank state.
- Preserve result media and scroll position when Back returns from detail. Keep the keyboard closed unless the previous state was active editing.
- Separate spelling suggestions, semantic expansion and strict filters. Users must be able to see when the system broadened a query.
- Put the most useful filters first for the category: size and condition for garments, dimensions and material for bags, relevant specifications for watches. Avoid presenting every taxonomy field at once.
- Support zero-result recovery that names the conflicting constraint. “No results with size M and your current price range” is more useful than “Try again.”

### Visual-search upgrade

- Keep the submitted image and selected region accessible above results. Editing the crop should not require re-uploading an unrelated image.
- Add a clear alternative to crop dragging: reset crop, whole image, or accessible object selection. A precise gesture cannot be the only way to search.
- Move colour/style constraints into candidate retrieval so relevant items outside the first batch are not lost. Use server facet IDs and canonical taxonomy, not only hardcoded English strings.
- Return a method enum, applied constraints and optional quality warning. Translate technical values such as `heuristic_color_features` into truthful product language.
- Do not display invented percentage similarity. Prefer a plain distinction between visually similar, text-filter matches and exact catalogue identity when independently established.
- Treat user images as sensitive uploads: strip unnecessary metadata, specify retention and permit deletion. Do not send private images into unrelated recommendation or training pipelines by default.
- Save a visual search only if the image or embedding query can be restored under a defined retention policy. Otherwise state that only text/filter criteria were saved; current comments already recognize this boundary.
- Provide failure recovery for unreadable files, unsupported formats, huge images, timeout, no comparable stock and offline cached results.

**Acceptance:** use a labelled fashion relevance set containing colour synonyms, absent descriptions, patterned garments, multiple objects, occlusion and unavailable stock. Evaluate top-result relevance and task completion, not just API latency. Keep ranking-quality metrics separate from claims of authenticity. Pinterest's visual refinement is a benchmark for the journey, while the retrieval design remains a ThryftVerse implementation decision.

## 10. Saved items, closet, collections and moodboards

**Current anchors:** ClosetScreen has Saved, Wishlist, Collections and Outfits modes; it uses ClosetMediaMosaic and board grids. MoodboardEditor, collection screens and the corresponding backend routes exist. The inspected closet skeleton derives its geometry from the tile layout, which is worth preserving.

### Product decisions

- Explain the distinction between Saved and Wishlist through behavior. If both are merely bookmarks, unify their user-facing meaning while preserving data and migration safety. If Wishlist supports price/availability intent, make that difference concrete.
- A collection is a group with an owner, privacy, cover, members and content. A moodboard is a composition. Do not blur these entities by opening every object in the same editor.
- Use real cover mosaics with stable ordering. Empty collections need a restrained create/add prompt; missing tiles should not pretend there are more objects.
- Let users add to a collection at save time without making every quick save a modal interruption. Show the destination and provide a short undo/change action.
- Make bulk selection a distinct mode with a clear selected count and exit. Avoid tiny checkboxes permanently over every image.
- Show sold or removed saved items with truthful state and useful alternatives; do not silently erase personal references.
- Preserve collection order and editing work across interruption. Reordering must have non-drag alternatives and server conflict handling if collaborative.
- Surface private/public status before sharing. A shareable link must not silently make a collection public.
- Provide a read-only recipient experience when the viewer is not an editor. A backend 403 is not a substitute for appropriate controls.
- Distinguish locally saved edits from cloud-synced edits and published compositions. Each label must correspond to actual persistence.

**Acceptance:** save one listing to two collections, rename one, remove it from one, and verify the other is unchanged. Delete a collection without deleting its underlying listing. Open a shared private collection as an unauthorized user. Reorder with screen reader alternatives. Recover after process death without duplicate boards.

## 11. Profile, storefront and edit profile

**Current anchors:** MyProfileScreen, UserProfileScreen, EditProfileScreen, MyProfileIdentityHero, ProfileHeaderHero, ProfileUtilityRail, ShopRail, PosterHighlightsRail, profile-media upload and seller-trust hooks. MyProfile uses a 200pt cover and combines multiple identity/storefront components; the final above-fold density needs native measurement.

### Profile composition

- Make identity and merchandise share the first viewport. A cover must communicate real identity; it should not consume the screen merely because a template has a hero.
- Reduce redundant identity rendering between cover, avatar, header title and display name. Keep the useful handle where it disambiguates accounts.
- Separate owner tools from visitor actions. Edit profile and seller operations belong to the owner; follow, message and shop actions belong to the visitor.
- Use real seller evidence with a readable explanation: verification type, review count, period and eligibility. Hide missing badges rather than replacing them with optimistic defaults.
- Explain whether “sold” means items, orders or completed transactions. Bundle counting and cancellations must not produce contradictory statistics.
- Keep storefront tabs attached to their content and preserve each tab's scroll state. A profile with no Looks should still have a composed, truthful shop experience.
- Let a seller select featured items through a clear preview and durable confirmation. Removed or sold featured items need a defined replacement policy.
- Avoid making personal profile completion a permanent dominant panel. Prompt for missing details only when they unlock a relevant capability.

### Editing details

- Use persistent field labels and sensible keyboard types. Username changes need availability, normalization and race-safe final validation.
- Make photo upload progress visible near the edited media. The previous image should remain available until the replacement is confirmed.
- Preserve crop focal points for cover and avatar separately. A round avatar preview must reflect the final crop.
- Clearly distinguish public fields from private account data. Changing a public display name must not look like changing legal identity.
- Save only changed fields, preserve conflicts, and warn before discarding unsaved edits. A successful toast must wait for the server write.
- Large text must not hide Done, crop actions or validation errors. Keep the error adjacent to its field and move focus appropriately.

**Acceptance:** owner, visitor, blocked visitor, new seller, private account and missing-media cases receive separate reviews. A profile update propagates to feed, inbox, product seller identity and shared previews under a documented cache policy.

## 12. Product detail and the purchase decision

**Current anchors:** ItemDetailScreen, useItemDetailData/actions/media, CommerceMediaStage, CommerceMediaHero, CommerceIdentityBlock, CommerceTrustDossier, CommerceActionDock, CategoryEvidence, ShippingReturnsInfo and the canonical product resolver. Data hooks already fetch listing, server commerce context, seller trust, price history, comparable sales, Q&A and recommendations.

### First viewport

- Prioritize media, identity, price, size/condition and one commitment action. Keep the most important uncertainty visible without forcing a full dossier read.
- Use category-sensitive media framing. A bag handle, shoe toe, garment hem or watch bezel must not be cropped merely to fill a generic aspect ratio.
- Match transition media to the originating tile. Preserve the initial crop until the detail media settles, then allow deliberate inspection.
- Put image count and selected image state in a quiet consistent place. Avoid repeated pagination styles across direct listings, auctions and assets.
- Distinguish a displayed item price from delivered total. If shipping depends on location, label the current estimate and ask for the necessary location at the right moment.

### Decision depth

- Make condition specific: defects, wear, repairs, missing accessories and measurements should have evidence, preferably corresponding media.
- Distinguish seller claims from platform verification. “Seller says authentic” and “authenticated under this programme” are materially different.
- State offer status precisely: submitted, countered, accepted, expired, withdrawn or superseded. Acceptance alone should not imply completion.
- Keep shipping, returns and protection adjacent to the buying decision, with full detail one action away. A shield icon cannot carry the whole policy.
- Show comparable-sale methodology when used: sample size, period, condition matching and whether figures are realized sales. Hide the insight when evidence is weak.
- Avoid fictitious sustainability precision. Use documented methodology and known provenance; do not calculate a confident environmental badge from category alone.
- Keep recommendation rails subordinate to purchase comprehension. The buyer should not scroll past a shopping feed to understand the current item.
- Reflect inventory changes while open. Sold, reserved, removed and region-ineligible items need clear replacement actions, not a stale Buy button.

### Technical closure

Return one server commerce context with price version, fees, available quantity, user eligibility and supported actions. Use that context to derive the dock. Preserve query invalidation across feed, saved items, seller storefront, offers and checkout. Avoid relying on the listing object embedded in route state as current purchase authority.

**Acceptance:** test one-item contention, price change, missing seller, missing second image, failed recommendations, offline cached detail, large text and return from fullscreen media. The primary action must never obscure the last policy row or system navigation.

## 13. Bag, bundles, offers and checkout

**Current anchors:** BundleBagScreen, MakeOfferScreen/MakeOfferSheet, listingOffers route, CheckoutScreen and checkout components, commerceApi, payment-intent polling and backend orders/payments. Existing code includes Stripe PaymentSheet, country capabilities, stable order keys, partial resource handling and unknown-outcome logic.

### Price and commitment

- Group bag items by seller when fulfilment or discounts depend on the seller. Show whether shipments are combined, separate or undecided.
- Define precedence for accepted offers, seller discounts, bundle discounts, credits, taxes, shipping and protection. Return the resolved breakdown from the server; do not reconstruct totals in each client surface.
- Keep totals visible before requesting payment authorization. Baymard's checkout research identifies late cost disclosure and unclear fields/errors as recurring problems; those are directional lessons, not forecasts of ThryftVerse conversion uplift. [S19](https://baymard.com/blog/current-state-of-checkout-ux), [S20](https://baymard.com/learn/reduce-cart-abandonment)
- Show reservation duration only if a server reservation exists. Countdown expiry must revalidate the obligation, not simply restart a client timer.
- Preserve addresses and selected payment method after a recoverable error. Do not demand redundant entry of information the system still has.
- Make card-sheet cancellation a neutral return to checkout. Distinguish it from decline, authentication failure and an unknown result.
- Use explicit payment method language. A balance, internal settlement unit, card and bank transfer have different availability and recovery expectations.

### Recovery and durable state

- Persist the operation identity before sending the first mutation. A ref survives rerender, but not process death.
- Reconcile a request that committed before its response arrived, including when the client has not received an order or intent ID. Lookup by the durable operation key is essential.
- Keep unknown separate from server-confirmed pending. The existing poller returns pending after exhausted attempts; the product should avoid implying a known bank status when all status reads failed.
- Provide “Check payment” with a durable order/operation reference. Do not invite a fresh purchase while the original outcome is unresolved.
- Revalidate inventory and quote after address or shipping changes. Preserve inputs when revalidation changes the total and require explicit acceptance of the new total.
- Treat split bundle fulfilment and partial returns as first-class receipt states. A single order summary must explain per-item outcomes.
- Show success only after the authoritative state supports it. If asynchronous processing remains, title the receipt accordingly.

Stripe's v1 idempotency documentation describes replaying a stored result; its v2 behavior differs. Adopt the semantics for the actual integration version and test application-level recovery independently. Never assume “we use Stripe” means the entire order flow is idempotent. [S21](https://docs.stripe.com/api/idempotent_requests?lang=php), [S22](https://docs.stripe.com/api-v2-overview)

**Acceptance:** inject failures before request send, after server commit, before response parsing, during external authentication and after process restart. Across all cases, the buyer receives at most one intended obligation and can discover its final result.

## 14. Orders, shipping, returns and support

**Current anchors:** OrderDetailScreen imports tracking timeline, dispatch countdown, inspection, package contents, counterparty, escrow, shipment, transaction breakdown, support and capability components. MyOrders, OrderReceipt, OrderSupport, ResolutionCentre and support-case screens exist, with shipping/returns/refund backend routes.

### Operational truth

- Use a chronological event model with source and timestamp. Label-created is not carrier acceptance; delivered is not buyer-inspected; refund initiated is not refund settled.
- Keep the next actionable obligation at the top. A seller needs a dispatch deadline and label action; a buyer needs actual tracking or the available escalation path.
- Preserve delayed or out-of-order events without rewriting history. Show a current status derived from authoritative transitions and let users inspect the timeline.
- Separate estimated delivery, contractual deadline and last carrier update. Avoid a countdown that looks exact when the source provides a broad range.
- Handle multiple packages and partial delivery per item. A bundle must not appear fully delivered because one parcel arrived.
- Make disputes evidence-led: issue type, affected item, photos, description, deadline, submitted evidence and response history.
- Tell the user what can still be edited after submission. Duplicate support tickets should be prevented or merged into one visible case.
- Make returns trackable in both directions. Explain label status, return receipt, inspection, refund amount and settlement stage.
- Place monetary breakdowns close to the event that changes them. Users should understand why a refund differs from the original gross payment.
- Keep support recovery accessible from every blocked state. A generic help article is not sufficient when a payment or parcel is already identified.

### UX details

- Use order numbers suitable for users rather than raw internal IDs in headings.
- Keep timestamps localized but unambiguous near deadlines; show timezone where it affects action.
- Distinguish “Contact seller” from “Contact support.” Preserve the order context when entering either conversation.
- Make evidence upload status explicit and recoverable. Do not let closing a picker discard a half-completed claim without warning.
- Offer a readable receipt or export that matches the backend ledger. Accessibility includes the receipt, not only the checkout screen.

**Acceptance:** replay late webhooks, duplicate carrier events and partial refunds; verify buyer, seller, wallet, inbox and support views converge. No financial action is considered complete solely because the initiating screen changed.

## 15. Seller hub, inventory and analytics

The current seller department has considerable depth. The next step is to make operational priority stronger than navigation density.

### Proposed first viewport

- Header: “Selling” or the established product name, with a restrained listing action.
- If urgent work exists: one concrete task, its deadline, affected order and action.
- A compact financial line: available payout and any relevant hold, with detail behind a single destination.
- The beginning of a flat task list, ordered by deadline and severity.

This is a composition proposal, not a request to delete Wallet, Orders, Analytics, Closet or inventory. Existing pillar destinations can remain as compact links below the operational queue or in a stable tool area. A saved-shopping rail is usually less urgent than dispatch work on a seller command surface.

### Inventory

- Show status and the next useful action: draft, processing, active, reserved, sold, rejected, needs attention or archived.
- Separate moderation failure from incomplete listing data and upload failure. Each has a different recovery owner.
- Bulk actions need selection scope, preview and per-item results. Never present a partial bulk success as a global success.
- Preserve filters and scroll when returning from an item editor. Update only affected rows.
- Imported catalogue review should highlight uncertain fields and provenance. A confidently wrong brand or condition is worse than an honest blank.
- Distinguish draft save, import extraction, listing validation and publication. One progress bar cannot truthfully represent all four without stage labels.

### Seller analytics

- Distinguish gross sales, net proceeds, cash available, processing funds, refunds and held balance.
- Label the interval and comparison baseline. A percentage change from an unavailable or zero prior period must not become a fabricated trend.
- Prefer a short actionable explanation to several equal KPI cards. “Two listings need size measurements” is useful if evidence connects it to actual incomplete items.
- Do not infer an opportunity solely from low views without enough exposure data. Report sample size and uncertainty.
- Make task counts and analytics recover independently. An analytics outage should not block dispatch.
- Add focus refresh and mutation invalidation to close F10. A completed task should disappear across the hub and order list.

**Acceptance:** run seller sessions with zero orders, six urgent orders, failed analytics, stale task data, an active import and an account switch. Above-fold composition should remain focused in each state, and failed modules must not spin indefinitely.

## 16. Inbox and transaction messaging

**Current anchors:** InboxScreen uses FlashList, swipeable rows, conversation APIs and realtime events. ChatScreen includes transaction/context strips, attachment review, replies, reactions, forwarding, agent suggestions, safety warnings and composer-stack resolution. These are existing capabilities, not a blank messaging scaffold.

### Inbox

- Keep conversations as flat rows with a stable avatar, name, last meaningful preview, time and unread state. Decoration should not outrank the sender.
- Group requests, archived and muted conversations by clear rules. Explain where a message moved after an action.
- Show a pending outbound message distinctly from a delivered preview. Do not claim read state without a receipt.
- Make pinned and unread states independent. A pinned thread is not necessarily urgent.
- Put transaction urgency where it helps: an expiring offer or unresolved order can be a concise cue tied to an actual event, not a decorative badge on every thread.
- Preserve ordering during realtime updates. The selected thread should not jump while a swipe action is active.
- Make swipe actions discoverable through a secondary menu. Screen-reader and motor-access users need equivalent actions.

### Conversation

- Budget the composer stack: reply target, attachment, offer context, safety warning, translation and bot controls must not all expand simultaneously. Define precedence and collapsible secondary context.
- Keep the input visible through keyboard transitions, attachment sheets, emoji entry and large text. The last message should not hide behind the composer.
- Use durable local message IDs, server IDs and explicit delivery states. Reconnect must reconcile without duplicates.
- Keep deletion labels truthful: “Delete for me” versus shared removal. Preserve the server's scope, which chatApi already models.
- Respect attachment upload progress and cancellation. Local preview does not mean sent; retry must preserve the chosen recipient and caption.
- Read receipts and typing indicators require opt-out, expiry and session cleanup. Never infer presence from a recent API fetch.
- Translation must preserve the original and label machine-generated output. Do not silently replace legally or financially relevant wording.
- Separate assistant-generated suggestions from actual counterparty messages. Sending still requires the user's represented action and permission scope.
- Preserve search-in-conversation context and provide an accessible jump-back affordance after opening an older result.

**Acceptance:** send while offline, reconnect twice, receive an older event, delete with both scopes, block the counterparty, open a failed attachment and return from an order. Validate message identity, unread counts and transaction state across both devices.

## 17. Camera, Looks, Posters and publication

**Current anchors:** CreateCameraScreen is a re-export; actual entry is CreatorEntryScreen within CreatorStudioShell. Creator documents, composition serialization, UploadManager, UploadJobStore, publicationAttemptStore and useCreatorPublishWorkflow already exist. The backend publication service checks media rows, processing/moderation readiness and idempotent publication.

### Capture-to-edit continuity

- Show a real captured frame immediately, keep orientation stable and transition the same object into the canvas. Avoid a blank intermediate card.
- Make mode names task-based. Users should understand the difference between a listing, Look and Poster before losing work to a mode switch.
- Pause camera resources when covered, backgrounded or permission-revoked. Stop competing preview/audio players.
- Keep recording state, elapsed time, microphone availability and stop action readable over bright and dark scenes.
- Respect limited photo-library access and provide an explicit way to add access. Do not call an empty picker “no photos” when access is restricted.

### Editor quality

- Tools should follow selection. Selecting text exposes text controls; selecting media exposes crop/replace; an unselected canvas has a small global tool set.
- Keep transform handles optically clear but give them adequate hit areas. Add non-gesture controls for scale, rotation, ordering and deletion.
- Make undo/redo apply to semantic operations rather than every frame of a drag. Preserve document revision identity.
- Align preview and export for crop, timing, fonts, layer order, opacity, audio and safe areas. A perfect editor preview with a different published composition is a production defect.
- Do not silently enhance product defects away. Distinguish creative background changes from modifications to the item's evidence.
- Make captions editable and preserve timing. Support original audio, muted preview and rights restrictions without fabricating licensing.
- Keep draft save status explicit and local/remote-aware. Avoid an unspecific “Saved” label when only one persistence layer completed.

### Publication lifecycle

- Separate upload, processing, moderation, ready-to-publish, publishing and published. Percentages must represent measurable progress; unmeasurable processing uses a stage, not invented completion.
- Preserve the current durable publication-attempt design and prove it after app restart. A publication should appear once across profile, feed and viewer.
- Validate user isolation of persisted upload jobs and publication attempts. The inspected UploadJobStore's default key is global; that is a targeted isolation question, not proof of cross-account leakage.
- Warn about missing local source files when restoring a draft. Offer relink or removal rather than a perpetual retry.
- Handle concurrent edits with revision conflicts and compare/reload/duplicate recovery. Do not overwrite the creator's newer work silently.
- Scheduled publication needs timezone, schedule confirmation, cancellation and a server outcome. A local timer is insufficient.

Meta's Edits announcement is useful for studying a cohesive creation workflow. It is not a requirement to reproduce every editor feature. Snap's support documentation also reinforces reviewing the actual full output, not just the first preview frame. [S23](https://about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app/), [S24](https://help.snapchat.com/hc/en-gb/articles/7012362390420-How-do-I-edit-a-Snap-in-Memories)

**Acceptance:** use a project with portrait video, rotated still image, text, sticker, product link and audio. Compare edit preview with the final published media, kill the app during upload and publish, revoke access to a source file, and verify one recoverable document and one authoritative publication.

## 18. Live shopping and auctions

**Current anchors:** AuctionHome/Detail, CreateAuction, SellerAuctionCentre, MyBids, LiveShoppingHome, LiveStreamViewer/Seller, BidSheet, backend auctions, streaming and liveLotEngine routes.

### Auction correctness and presentation

- Show the current lot, current bid, next permissible bid, remaining time and bidding state without requiring a long scroll.
- Distinguish current bid, user's maximum bid, reserve state, estimated fees and final obligation. “Leading” is not “won.”
- Derive the clock from server time and update rules. Reconnect must fetch authoritative close state before enabling a bid.
- Name extension rules in plain language. A non-extending auction needs explicit explanation; do not rely on a skull icon or colour.
- Handle bids received near closure, duplicate bid requests, outbid while confirming and payment failure after winning.
- Keep the user's own bid acknowledgment distinct from the public auction's latest bid. A dropped response must not invite a duplicate maximum bid.
- Use confirmation proportional to monetary risk and server policy. Do not introduce confetti, urgency pulses or auto-send simply to resemble entertainment commerce.

### Live video

- Keep lot identity visible when video stalls. The bid action must reflect market freshness, not just video playback.
- Label stream reconnect and market reconnect separately. They can fail independently.
- Constrain chat density so it does not obscure the product. Allow readable captions and a quiet viewing mode.
- Avoid displaying “live” for a recorded replay without qualification. View count and presence must come from real telemetry with known semantics.
- Preserve audio focus across calls, backgrounding and other app media. Stop capture and streaming cleanly when the seller exits.
- Expose report, block and support where viewers can reach them without accidentally bidding.

**Acceptance:** simulate video loss with healthy bidding, bidding loss with healthy video, server clock skew, a late bid and a seller disconnect. Both the lot and the obligation must remain clear. Whatnot's timer distinction is a behavior benchmark; ThryftVerse's rules must be its own documented contract.

## 19. Co-ownership, portfolio and market detail

**Current anchors:** AssetDetail, Trade, TradeConfirm, Portfolio, SyndicateHub, Buyout, AssetDueDiligence, distributions, corporate actions and voting. Current working-tree work includes a dossier ribbon/sheet, financial charts, disclosure components, authenticated order-book deltas, snapshot recovery and topic reference counts. These should be treated as work to validate, not ignored in a generic “add live data” recommendation.

### Financial hierarchy

- Keep asset identity and ownership instrument distinct. Buying an item, buying units in an entity and participating in a syndicate are different commitments.
- Label appraisal value, unit reference price, last executed price, bid and ask separately. Never use one as an unlabeled substitute for another.
- Pair every changing value with an as-of time and source class. A green connection indicator does not make an old valuation current.
- Show the selected chart interval and whether the series represents trades, valuations or portfolio value. Do not interpolate a smooth market story across no-trade periods without explaining the series.
- Empty depth needs an explicit non-executable state. A chart and a large Buy button must not imply liquidity where the book is empty.
- Keep one meaningful primary amount above the fold. Secondary metrics belong in aligned rows or a focused market panel, not many equally weighted cards.
- Use tabular figures and stable column widths for live data. Do not animate every numeric digit or flash every price change.

### Ownership evidence

- Make custodian, condition, authenticity, insurance, valuation date and fee policy accessible. The new dossier ribbon helps density, but must not hide material uncertainty.
- A boolean such as `custodyInsured` is evidence of a backend assertion, not a complete explanation of coverage. Detailed coverage scope, period, exclusions and document source remain necessary where applicable.
- Explain ownership rights: governance, distribution entitlement, transfer restrictions, fees, buyout rules and insolvency/recovery process. This report specifies product comprehension; qualified domain review must establish the applicable policy.
- Treat reinvestment eligibility as a server capability. Current AssetDetail comments infer visibility from past distributions and identify a first-class eligibility field as the proper improvement.
- Show corporate actions and votes with record date, eligibility, deadline, status and authoritative outcome. A local vote selection must not appear as a submitted vote.
- Preserve unknown versus zero distributions. “No distributions yet” requires complete history; unavailable history should say so.

### Trading and portfolio closure

- Replace the fee fallback in F12 before treating the confirmation as complete.
- Return a signed or versioned preview with full obligation, fee, protected price, estimated fill, reserved amount, expiry and eligibility. The server remains final authority at submission.
- Make partial fill explicit: filled units, remaining units, average execution, fees, order duration and cancelability.
- Reconcile order, balance, holdings, portfolio valuation, ledger and available units together. A successful order in history with unchanged holdings needs a labelled settlement state, not silent disagreement.
- Present returns with cash-flow-aware methodology. A deposit is not profit; changing appraisal is not realized gain.
- Provide an accessible alternative to chart scrubbing: current value, range, extrema, interval change and a data view where needed.
- Retain order-book gap detection and reconnect snapshots; test topic reference counts across stacked detail/trade screens and session changes.

**Acceptance:** test an empty market, stale appraisal, incomplete dossier, one-sided book, fractional quantity, high-value order, near-expiry quote, partial fill, late replay and canceled reservation. Review every receipt against backend rows. Robinhood is a hierarchy and order-literacy reference, not evidence that a fractional collectible has stock-market liquidity.

## 20. Wallet, balance, withdrawal and settlement language

**Current anchors:** WalletScreen, WalletHistory, BalanceHistory, Payments, Withdraw, AddBankAccount, WalletConvert, market ledger screens and wallet/payment/payout routes. The codebase distinguishes internal 1ZE settlement and GBP references in trading, making unit clarity especially important.

- Define one currency/settlement vocabulary across commerce, wallet and co-ownership. Show the asset unit, fiat reference, conversion basis, quote time and any fee separately.
- Distinguish spendable, reserved, processing, held and withdrawable amounts. A large “Balance” without those semantics invites mistaken decisions.
- Make withdrawal eligibility server-authored: identity status, bank verification, available funds, holds, limits and regional capability.
- Show destination in a recognizable masked form and require confirmation for a new destination. Do not expose full bank details in screenshots or routine telemetry.
- Treat estimated arrival as an estimate with business-day and timezone context. A payout schedule must not become a promised arrival time.
- Preserve the withdrawal operation across network loss and app restart. Unknown is not failed; failed is not refunded unless the ledger proves release.
- Display reversal, refund, adjustment and fee as distinct ledger entries with a link to the originating order or operation.
- Use pagination and stable ordering in history. A newly posted adjustment should not change older transaction identity.
- Explain conversion quotes before commitment: source amount, destination amount, rate, fee, expiry and rounding. Preserve decimal precision in the contract and round only for presentation.
- Avoid celebratory treatment for monetary risk. Clear completion and a durable receipt are enough.

**Acceptance:** cancel a withdrawal before submission, lose the response after submission, receive a late failure/reversal, change bank eligibility, and inspect the same amount across wallet, seller payout and trade reservation. All representations should reconcile.

## 21. Onboarding, authentication, settings and privacy

**Current anchors:** AuthLanding, Login, SignUp, Onboarding, biometric and security screens, SettingsScreen, settings route metadata, privacy/account controls, data export/deletion and notification preference screens. Settings already uses shared rows and account-scoped query clearing on logout.

### First use

- Allow useful browsing before asking for commitment where product policy permits. Authentication prompts should preserve the intended save, message or purchase action.
- Request camera, microphone, photos and notifications when their purpose is evident. Do not stack OS permission dialogs on first launch.
- Preserve entered data through failed authentication and password recovery. Avoid forcing a second search for the item after signing in.
- Explain age or identity requirements before a user invests effort in a blocked flow. Do not expose restricted markets and only reveal ineligibility at final submit.
- Keep onboarding choices editable later. Preferences should improve retrieval without pretending that a few chips fully model personal style.

### Settings

- Organize by user goal: account, privacy, notifications, appearance/accessibility, buying/selling and help. Search should match common synonyms and route to the actual setting.
- Show current values on rows where they reduce recall: theme, language, currency, notification mode and security state.
- Keep immediate toggles different from actions requiring confirmation. A failed preference update must revert or remain visibly unsaved.
- Separate system permission from in-app preference. Notifications can be enabled in the app but blocked by the OS; the UI should say which layer needs attention.
- Keep developer flags and deployment diagnostics out of ordinary settings. The inspected FeatureFlagDebugSection is described as developer-gated; verify the runtime gate rather than assuming exposure.
- Make data export and deletion asynchronous workflows with durable status, identity confirmation and recovery. “Request accepted” and “data deleted” are different states.
- On logout/account switch, clear or segregate private caches, search history, drafts, uploads, conversation state and financial operations according to policy. Preserve recoverable work only within its owner account.

**Acceptance:** authenticate mid-journey, deny each permission, revoke it from OS settings, change theme while a sheet is open, switch accounts and return through a deep link. Privacy and continuity must survive all of these paths.

## 22. Notifications, recommendations and assistant features

**Current anchors:** NotificationsScreen, NotificationPreferences, push/email preference screens, YourAlgorithmScreen, algorithmTransparencyApi, conversational search and bot/agent screens. The implementation already models algorithm topics and demo metadata, but production-mode isolation needs targeted verification rather than a blanket assumption that every demo object leaks.

- Group notifications by what the user can do: respond to an offer, dispatch an order, review a message, inspect an ownership event. Avoid a feed of vague “activity” cards.
- Deduplicate push and in-app notifications by event ID; mark read only under a defined rule. Opening a stale notification should explain the current object state.
- Preserve destination and parameters through authentication. An expired offer should open its resolved state, not a broken generic inbox.
- Prioritize critical transactional notifications without conflating them with engagement promotions. Give users meaningful channel and category controls.
- Recommendation controls should state whether they change strict filtering, ranking preference or privacy. “Less” is not the same as “never show.”
- Honour reset and removal in the backend signal pipeline, not merely in the settings screen. Explain any retained immutable transaction records separately from recommendation signals.
- Keep generated listing attributes reviewable. AI suggestions for condition, brand, size, authenticity or value are not evidence until verified under the relevant policy.
- For assistant actions, show scope, proposed action and result. A chat suggestion must not mutate a listing, send a message or spend money without the represented authorization.
- Provide a clear distinction between automated support and human escalation. Do not invent an agent's presence or response time.
- Measure recommendation usefulness through relevant saves, successful retrieval and user control, not only watch time or repeated checking.

Meta's recommendation-reset announcement supports studying user control, while its 2026 teen-account update illustrates age-aware defaults. Those are current product references, not a substitute for ThryftVerse's own privacy and eligibility model. [S25](https://about.fb.com/news/2024/11/introducing-recommendations-reset-instagram/), [S26](https://about.fb.com/news/2026/04/instagram-expands-teen-accounts-inspired-by-13-content-ratings/)

**Acceptance:** mute a category, reset preferences, block a user and change accounts; then verify feed, notifications, search and assistant suggestions respect the new state. Measure propagation, not only toggle persistence.

## 23. Typography, geometry, icons and colour

### Typography

- Resolve F04 through one canonical semantic map. Do not add a third typography layer to reconcile two existing ones.
- Define a small set of roles by purpose: screen identity, section, object title, body, metadata, action and financial value. Different departments may select different dominant roles without inventing arbitrary sizes.
- Specify line height alongside size and font family. Android font padding and iOS baseline behavior need optical review.
- Keep financial digits tabular; preserve currency spacing, minus sign, decimal separators and nonbreaking unit relationships.
- Avoid aggressive negative tracking in long product names or accessibility sizes. Dense typography is not automatically readable typography.
- Use weight rather than an extra subtitle to establish hierarchy. Do not set all metadata to bold or all section names to uppercase.
- Support fallback fonts and multilingual scripts. Imported creative fonts should be confined to authored content, not routine commerce text.

### Geometry and controls

- Keep visible icons around the charter's 20-24pt navigation band, with smaller metadata icons only where appropriate.
- Use transparent targets for Back, Close, overflow, notification and search unless contrast or selection requires containment.
- Distinguish touch target from glyph size. Use at least the platform-appropriate target, reserve space between neighboring controls, and test parent clipping of hitSlop.
- Align icon optical centres with text baselines. Equal SVG boxes do not guarantee equal perceived weight.
- Use hairlines for separators and explicit outlines for fields/focus. Do not alternate unrelated stroke widths within a control family.
- Allow long labels to wrap or change layout. A 44pt row is not a mandatory fixed height when the content needs more space.
- Keep docks within safe-area contracts. Content bottom padding must reflect the actual dock, keyboard and navigation occupancy.

### Colour

- Retain the neutral runtime palette as the base. Real media provides colour on fashion surfaces.
- Reserve green/red for actual meaning: gains/losses, success/failure or selected state with redundant cues. Do not apply green to unverified trust or ordinary availability.
- Test semantic pairs, not isolated tokens. A colour can pass on white and fail on a tinted panel or image.
- Audit status text on dark surfaces independently. Deep reds/greens that look refined on light backgrounds can disappear in dark mode.
- Resolve decorative accent deprecations through a migration list. Do not erase useful status semantics in a global “remove colour” pass.
- Keep theme geometry identical unless the platform requires an accessibility adjustment. Dark mode should not introduce extra cards or glow.

**Acceptance:** compare all shared controls in both themes and at large text with long labels, numbers, missing icons and loading state. Native screenshots and accessibility measurements must both pass.

## 24. Motion, haptics and direct manipulation

### Motion policy

- Use motion to connect cause and effect: press response, sheet origin, mode change, inserted content and successful placement.
- For typical state transitions, the charter's 160-240ms range is a starting policy, not a claim about a competitor's actual timing. Use immediate feedback for interaction and longer progress only where the underlying operation warrants it.
- Follow the finger during drag/scroll. Use interpolation or direct manipulation rather than launching a new spring on every movement.
- Keep interruption correct: a canceled swipe restores the previous state; a sheet reversed mid-dismiss does not flash or leave an overlay intercepting touches.
- Avoid whole-screen entrance animation and large list stagger effects. They delay use and multiply work on lower-end devices.
- Do not animate unknown values into apparent precision. A count should update from real data; a chart should not draw fictitious intermediate trades.
- Centralize reduced-motion behavior and react to in-app settings changes. Reanimated's global reduced-motion configuration affects the application broadly, so test custom overrides carefully. [S27](https://docs.swmansion.com/react-native-reanimated/docs/device/ReducedMotionConfig/)

### Haptic policy

- Use selection feedback for a deliberate selection change, not every navigation push.
- Trigger completion feedback only on the event being represented. A money action's success haptic belongs after authoritative success, not request send.
- Avoid double haptics from both a pressable and its handler. Inspect the existing useHaptic/haptics/autoHaptic paths for overlapping responsibility.
- Keep high-intensity feedback rare. A heavy vibration on ordinary tab changes or routine list presses feels alarm-like.
- Treat haptics as supplementary. Every meaningful state remains visible and screen-reader accessible when vibration is disabled.

**Acceptance:** record real-device interaction video at normal and reduced motion; test fast repeated taps, interrupted transitions and background return. Measure dropped frames and input blocking. Apple describes motion as feedback and guidance; it does not justify motion everywhere. [S28](https://developer.apple.com/design/human-interface-guidelines/motion?changes=_3)

## 25. State architecture and truthful microcopy

### State is not a single loading boolean

For a screen containing multiple remote resources, each resource needs a state such as not requested, loading without data, ready, refreshing with data, failed without data, failed with stale data, forbidden or unavailable. Mutations additionally need idle, validating, submitting, server-pending, unknown outcome, succeeded, failed and safely retryable. These states should be represented by discriminated contracts where useful, not many loosely coupled booleans.

### Proposed state matrix

| State | User treatment | Action policy | Evidence requirement |
| --- | --- | --- | --- |
| First load | Layout-matched skeleton | Essential navigation remains available | No fabricated content |
| Refresh with cache | Existing content plus quiet refresh | Revalidate sensitive actions | Cache age known |
| Partial success | Useful modules plus local retry | Block only affected capability | Per-resource result |
| Empty | Explain absence and relevant next step | Create/discover/change filter | Successful complete query |
| Filtered empty | Name applied constraints | Clear/change a constraint | Query and facet identity |
| Offline cache | State offline and freshness | Safe local actions only | Actual connectivity state |
| Forbidden | Explain access boundary | Sign in/request access/back | Server authorization |
| Removed object | State removed/sold/unavailable | Return or relevant alternative | Canonical object state |
| Submitting | Prevent duplicate command | Safe cancel only if possible | Durable operation key |
| Server pending | Explain known processing | View status | Server status row |
| Unknown outcome | Explain uncertainty | Lookup/reconcile original key | Outcome not yet established |
| Success | Specific result and next destination | Receipt/view object | Authoritative completion |

### Copy details

- “Saved on this device” when local-only; “Synced” only after remote confirmation.
- “Offer accepted” versus “Item purchased.”
- “Label created” versus “Shipped.”
- “Refund requested,” “Refund approved” and “Refund paid” as separate states.
- “Last updated 14:32” for stale market or tracking data; avoid a decorative “Live” pill.
- “Could not load orders” when the request failed; never “No orders yet” by default.
- “Check payment” for unresolved outcome, with the original operation retained.
- “Remove from collection” versus “Delete listing.”
- “Available in your region” only when capability data says so.

**Acceptance:** every critical journey has a visible state map and at least one deterministic failure test. State text must remain readable without colour, motion or an explanatory toast.

## 26. Media quality, delivery and visual completion

**Current anchors:** CachedImage, FlagshipImage, MediaPreview, CommerceMediaStage, listingMediaGeometry, imagePreloader, UploadManager, mediaAssets and compositionRenderer. Expo Image, expo-video and FlashList are declared dependencies. Their presence is not proof that each caller supplies correct metadata or lifecycle handling.

### Image pipeline

- Preserve source width, height, orientation, focal point, thumbnail, blur/thumb hash and media role through API projections.
- Request display-appropriate sizes using device pixel ratio and viewport. Do not download a full-resolution original for every thumbnail.
- Use the same geometry for placeholder and final image. Expo documents that placeholder fit can differ from image fit, creating visible scaling changes unless aligned. [S29](https://docs.expo.dev/versions/latest/sdk/image/)
- Reset recycled image identity so an old listing's photo does not flash on a new listing. Test rapid scroll with network delay and failed images.
- Keep missing media restrained and truthful. A placeholder should maintain geometry without becoming the dominant visual story.
- Review white-on-white products, dark garments, translucent objects, extreme panoramas and portrait crops separately.
- Preserve natural defects and colour evidence in commerce. Creative filters should not silently alter condition evidence.

### Video and export

- Prioritize first useful frame, playback start and rebuffering separately. A poster image is not proof that playback started.
- Maintain one active player per intended region, pause offscreen and release resources after navigation/background changes.
- Match prefetch to bandwidth, data saver and likelihood of use. Excessive prefetch can make the foreground operation slower.
- Provide compatible fallback encodings and adaptive delivery where justified by measured stalls. Do not begin with a codec migration merely because Meta uses one.
- Validate HDR/SDR tone mapping, orientation, audio loudness, captions and output dimensions on physical devices. Colour changes can be a commerce correctness issue.
- Compare creator preview and server-rendered output using frame checkpoints, including non-first pages and later video segments.

Meta's historical video engineering describes separate compatible and advanced encodings plus adaptive delivery. The transferable lesson is to spend delivery work where users see it, while retaining broad playback compatibility. Its published efficiency figures are not a ThryftVerse target. [S30](https://engineering.fb.com/2022/11/04/video-engineering/instagram-video-processing-encoding-reduction/)

**Acceptance:** delayed image decode does not shift layout; recycled tiles show the correct object; final export matches preview; a long feed session stays within a measured memory budget; low-bandwidth browsing remains usable.

## 27. Performance and reliability budgets

**Current anchors:** package declarations include React Native `^0.86.2`, Expo `~57.0.15`, FlashList `2.0.2`, Reanimated `^4.5.1` and TanStack Query `^5.101.1`. These are declared ranges/versions, not verified installed resolutions or compatibility guarantees. Check the lockfile and native build before upgrades.

### Measurement model

- Measure cold start, warm start and route transition separately.
- Record critical data ready, first media decoded, controls ready and stable composition using per-visit identity.
- Track p50, p95 and failure rate by platform, device tier, network, cache state and app build.
- Measure frame time during scrolling, keyboard appearance, chart scrub and editor transform. A fast API cannot compensate for a blocked UI thread.
- Profile release builds. React Native documentation explains the frame budget and recommends native tooling for accurate measurements. [S31](https://reactnative.dev/docs/performance.html), [S32](https://reactnative.dev/docs/debugging)

### Initial proposed acceptance budgets

| Metric | Initial target | Conditions and interpretation |
| --- | --- | --- |
| Visible press response | p95 under 100ms | Local response, not server completion |
| Warm cached core-screen usability | p95 under 800ms | Defined reference device; no simulated success |
| First useful online content | p95 under 2s | Defined test network; measure partial failure separately |
| Animation frame budget | 16.7ms at 60Hz; 8.3ms at 120Hz | Report missed-frame rate, not only average FPS |
| Critical gesture stalls over 100ms | None in acceptance recordings | Profile cause if observed |
| Duplicate intended money operations | Zero | Fault-injection and replay suite |
| Returning to a list | Same object anchor, minimal offset drift | No jump to top unless explicitly requested |
| Critical text/dock overlap | Zero | Both themes and accessibility sizes |
| Unbounded memory growth | None over repeated journey loop | Establish device-specific plateau before a hard MB limit |

These are proposed targets for the next campaign. They are neither measured ThryftVerse results nor published competitor SLAs. Calibrate them against real hardware before making release promises. Classic response-time research supports immediate feedback and visible progress, but does not provide a universal latency guarantee for this product. [S33](https://www.nngroup.com/videos/3-response-time-limits-interaction-design/)

### Architecture refinements

- Keep server state in a consistent query layer with user-scoped keys; keep ephemeral interaction state local. Avoid duplicated authoritative listing or balance stores.
- Define freshness per domain. The inspected queryClient defaults to five-minute stale time and disables window-focus refetch. Market quotes, order obligations and public catalog descriptions cannot all share the same freshness policy.
- Use explicit screen-focus or app-focus integration where appropriate. TanStack's native guidance uses AppState and screen focus rather than assuming browser events. [S34](https://tanstack.com/query/latest/docs/framework/react/react-native)
- Preserve FlashList recycling and stable IDs. Its v2 documentation enables masonry via a prop and notes default visible-position maintenance; its known issues identify reordering and RTL caveats. Test the installed version rather than pasting examples from another version. [S35](https://shopify.github.io/flash-list/docs/v2-migration/), [S36](https://shopify.github.io/flash-list/docs/known-issues/)
- Batch realtime updates without hiding sequence gaps. A fast display of wrong order-book state is worse than a brief explicit resynchronization.
- Prioritize critical queries over optional recommendation or analytics work. Per-module retries should not refetch the whole screen unnecessarily.

## 28. Accessibility, localization and platform parity

### Interaction access

- Target at least 44pt on iOS and 48dp on Android where practical. Keep visible glyphs smaller and avoid overlapping expanded targets.
- Test VoiceOver/TalkBack focus order against the actual native tree. A JSX label alone does not prove the reader can reach the action.
- Announce selected, disabled, busy, expanded and unread states. Do not append confusing hints that repeat or contradict the label.
- Give drag, pinch, long-press and chart-scrub interactions alternatives. This includes moodboard reordering, crop selection and trade-chart inspection.
- Trap focus correctly in modals and restore it to the initiating control on dismissal. Prevent focus from reaching covered content.
- Distinguish Back and Close; allow cancellation of a gesture without accidental action.

### Text and perception

- Test the largest supported OS text settings, not only a synthetic 1.3 multiplier. Fixed height and `numberOfLines` constraints deserve special attention on fees and recovery text.
- Keep contrast at the appropriate threshold for text and essential UI. Validate actual adjacent colours, including tinted and media backgrounds.
- Make chart meaning available without red/green distinction, using labels, signs, patterns and a textual summary.
- Provide captions and usable mute state. Audio-only information needs an alternative.
- Reduced motion, increased contrast and screen-reader use are independent preferences. Supporting one does not establish the others.

### Language and regional detail

- Centralize currency formatting, decimal parsing, date/time and pluralization. Do not concatenate English fragments around localized amounts.
- Test long German-style strings, right-to-left layout, non-Latin names, mixed-direction order numbers and emoji grapheme boundaries.
- Keep original search terms and canonical taxonomy IDs separate from translated labels.
- Show timezone on deadlines where the viewer may travel or the server operates in another region. Handle daylight-saving transitions explicitly for scheduling.
- Preserve culturally neutral icon meaning; novelty icons and flags are poor substitutes for clear language.
- Review Android Back, edge-to-edge insets, keyboard resize and iOS interactive dismissal separately. “Same code” is not “same experience.”

WCAG 2.2 adds requirements including focus not obscured, dragging alternatives, redundant entry and accessible authentication. Use the precise criterion for each test; do not describe 2.4.11 as a general focus-appearance rule. Native platform recommendations complement rather than replace these principles. [S37](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)

**Acceptance:** manually complete browsing, save, message, publish, checkout and support with assistive technology on both platforms. Record actual failures and recovery; never certify accessibility through source scanning alone.

## 29. Full-stack contracts that make design believable

### Contract 1: discovery summary

The API should project canonical object identity, object kind, media geometry, display price with currency, seller identity, availability, optional social evidence, and source/recommendation metadata. Missing values remain nullable. The UI should not reconstruct a rich listing with fabricated zero fields simply to satisfy a component type.

### Contract 2: commerce decision

Return price version, item availability, delivery estimate, fees, supported actions, buyer eligibility and protection applicability. A dock is a projection of those capabilities. It is not a list of buttons that each independently tries the backend.

### Contract 3: operation result

For money and publication, keep operation ID/key, payload identity, actor, status, result reference, timestamps and safe recovery. Persist before send. Distinguish server-pending from unknown transport outcome. Replays must resolve the original operation without creating another one.

### Contract 4: trust evidence

Return evidence type, scope, issuer/source, validity period, status and the entity it covers. Do not let a seller verification badge imply that every item is authenticated or every transaction is insured.

### Contract 5: operational task

SellerHub already has a useful aggregate direction with freshness and topTask. Complete it with a typed action descriptor, required parameters, eligibility, deadline and result propagation. Do not cast a route string and navigate without proving required parameters.

### Contract 6: market snapshot

Keep sequence, server timestamp, freshness, source and gap state with bid/ask/depth. Provide quote preview and execution eligibility separately from chart data. Reconnection must resolve the snapshot before enabling sensitive actions.

### Contract 7: creator document and media

Preserve document revision/hash, referenced media asset/finalization IDs, processing status, moderation, ownership, publication intent and export metadata. The inspected publication service and client walker already embody much of this structure; expand proof rather than inventing a competing pipeline.

### Contract 8: cross-surface propagation

For each mutation, list all affected projections. Example: purchase changes listing availability, bag, offer state, order history, seller tasks, wallet/ledger and notification context. Define transactional updates for shared invariants, outbox events for asynchronous projections, and query invalidation for the client.

**Acceptance:** compare UI rows with live endpoint responses and database-backed status in an authorized test environment. No live endpoint verification was completed in this report. The endpoint checklist later identifies what must be exercised before a production claim.

## 30. Design.md upgrade proposal

Design.md should become easier to execute and harder to misread. It already contains valuable composition and state principles. Its size and historical additions should not let stale assertions outrank current evidence.

### Proposed structure

- **Stable product principles:** media-first fashion identity, neutral palette, truthful state, native interaction, accessibility and anti-AI restraint.
- **Canonical runtime map:** exact token/module ownership; legacy aliases; deprecated exports; migration status.
- **Five composition families:** Discover, Communicate, Create, Transact, Operate/Own, with examples and measurable budgets.
- **Interaction contracts:** control targets, press feedback, sheet anatomy, keyboard behavior, back behavior, reduced motion and haptics.
- **State contracts:** resource/mutation state matrix and approved copy examples.
- **Department specifications:** one concise canonical specification per journey, linked to implementation and acceptance evidence.
- **Reference ledger:** source URL, title, publisher, publication date if available, access date, platform, observed behavior and evidence class.
- **Release evidence:** build identity, device, OS, font scale, theme, fixture/integration mode, screenshot/video and live endpoint result.

### Specific corrections

- Replace the future benchmark date with actual access dates for individual sources.
- Correct the runtime palette ownership and present/deprecated token status.
- Resolve typography source-of-truth conflict, including the 24/32 display discrepancy and differing screen-title roles.
- Remove unsupported exact competitor claims from policy. A code comment about a “Masterworks Digital Asset Passport” is not independent verification of that product's exact UI.
- Replace “already flagship” with “implemented,” “statically verified,” “native reviewed” or “live verified,” each with evidence.
- Separate target numerical budgets from measured results.
- Add a formal exception record for any deliberate departure from the radius, surface, motion or text budget, including scope and expiry/review.
- Move historical campaign logs into a ledger so they cannot silently become current instructions.
- Keep the native product rule and canonical-route rule unchanged in meaning.

### Proposed policy excerpt

> A surface is accepted only for a named build and evidence set. A component's name, a token import, a passing typecheck, or a source-pattern test cannot establish visual quality. Reference geometry is measured only when platform and logical viewport are known. Missing commercial or financial evidence remains unknown, never a frontend default. Each accepted mutation has a durable result and a tested propagation path.

This report proposes these changes without editing the already modified Design.md. A later focused migration can update it alongside the associated implementation evidence.

## 31. Prioritized delivery backlog

This is an implementation sequence, not a claim that every proposed feature is missing. F01–F18 refer to the source-backed findings in chapter 5. Items without an F identifier are design or validation proposals. P0 means correctness or trust should block the affected release; P1 means a substantial product-quality gap; P2 means a refinement after the main interaction works. Effort is relative: small means a focused owner-layer change, medium means several coupled components, and large means a cross-layer workflow. These are not calendar estimates.

### Wave A: establish truthful acceptance and money behavior

| Work item | Priority / effort | Owner and dependency | Acceptance evidence |
| --- | --- | --- | --- |
| Remove route-derived financial fee defaults; use authoritative preview and receipt values (F12) | P0 / medium | Co-own API contract and TradeConfirm | Fee change, missing fee and stale preview tests; live receipt comparison |
| Give unknown checkout outcome a distinct, durable recovery treatment (F11) | P0 / medium | Payment state contract, Checkout, banner | Disconnect after submit; relaunch; reconcile without duplicate charge |
| Verify trade price-deviation and hold-confirmation policies (F13) | P0 investigation / medium | Trading domain owner before UI adjustment | Limit and market scenarios, favorable movement, insufficient evidence |
| Correct readiness instrumentation (F02) | P1 / medium | Performance owner, then surface consumers | Visit-scoped traces that end after useful content or explicit terminal state |
| Separate visual evidence from source-pattern assertions (F03) | P1 / medium | Native QA and CI | Named build, captured screen, state and device; no visual claim from regex |
| Correct future-dated and contradictory design authority (F01) | P1 / small | Design.md and theme ownership | Dated authority record; deprecated aliases marked as migration-only |
| Triage automated visual findings (F18) | P1 / medium | Shared primitives first | Each reported finding confirmed, rejected with reason or assigned an owner |

### Wave B: resolve repeated interaction and state defects

| Work item | Priority / effort | Owner and dependency | Acceptance evidence |
| --- | --- | --- | --- |
| Choose one typography authority and migrate consumers (F04) | P1 / medium | Design-system owner | Same semantic role resolves to one scale; large-text native captures |
| Unify reduced-motion preference consumption (F14) | P1 / small | Accessibility preference owner | OS and in-app changes reflected without relaunch |
| Replace indefinite status pulsing (F15) | P1 / small | Status primitives | Static readable state plus meaningful change announcement |
| Calibrate tab press response (F05) | P2 / small | Navigation primitive | Fast repeated taps, reduced motion, no perceptible shrinking distraction |
| Preserve selected search scope while typing (F06) | P1 / small | Discovery state | Edit query while People selected; selection and result type remain coherent |
| Distinguish people search failure from zero results (F06) | P1 / medium | Search resource state | Offline, server failure, empty and retry render differently |
| Preserve unknown discovery fields (F07) | P1 / medium | Listing projection | Null price, condition and engagement are not fabricated factual values |
| Align visual-search facets with retrieval scope (F08) | P1 / large | Search endpoint and query contract | Requested facets affect candidates; method and coverage remain truthful |
| Refresh seller resources and represent partial failure (F10) | P1 / medium | Seller overview orchestration | Return from order action; one failed resource; account switch during fetch |

### Wave C: compose the surfaces around their primary jobs

- **Seller command center — P1, medium, F09.** Put the most urgent evidenced work first. Consolidate dispatch deadlines and operational actions into one ranked section. Move financial analysis and education into secondary destinations. Keep every existing capability reachable.
- **Home — P1, medium, proposal.** Audit the first useful content position, real media exposure, module repetition and loading geometry. Build an editorial ordering from product intent and available content; avoid a stack of equal-weight feature panels.
- **Search — P1, medium, proposal.** Separate query entry, refinement and result judgment. Preserve query, selected scope, filters and scroll position through item detail and Back.
- **Closet and boards — P1, medium, proposal.** Let collection media communicate the object. Make private/shared state and save destination explicit. Test duplicate save, permission change and missing cover media.
- **Item detail — P1, large, proposal.** Prioritize garment/object judgment, price, condition, seller evidence, delivery and purchase. Make variant availability and buyer protection evidence coherent with checkout. Preserve image focal points and sticky-action clearance.
- **Inbox — P1, medium, proposal.** Keep conversations visually dominant. Audit top-of-screen overhead, unread semantics, delivery states, row truncation and keyboard return behavior.
- **Creator — P1, large, proposal.** Make the artifact dominant during composition. Expose upload, processing, publication and visibility as distinct states while retaining durable draft recovery.
- **Orders — P1, medium, proposal.** Show actual order state, next action, carrier evidence and support entry. Avoid a decorative timeline when the underlying events do not justify it.
- **Co-own — P1, large, proposal.** Establish a stable instrument identity, price context, time range, position and transaction hierarchy. Keep ownership rights, liquidity and financial uncertainty available where they affect a decision.
- **Live commerce — P1, large, proposal.** Preserve video and current item dominance while preventing bids, checkout, chat and connection loss from competing for the same interaction space.

### Wave D: depth, maintainability and refinement

- **AI capability surfaces — P1, medium, F16.** Replace prototype capability presentation with supported actions, explicit permissions and useful recovery. Disabled capability labels must describe a real state, not imply a working integration.
- **Large screen decomposition — P1, incremental, F17.** Extract domain-owned components as each screen is changed. Preserve one orchestration owner; do not replace a monolith with an opaque web of context providers.
- **Media pipeline — P1, large, proposal.** Audit durable local uploads, category-sensitive presentation, missing-media states, retry and cleanup. Validate on a low-memory device and constrained network.
- **Focus and cache propagation — P1, medium, proposal.** Create a mutation-to-surface map before modifying broad query defaults. Reconcile order, seller, wallet, listing and profile consumers explicitly.
- **Accessibility — P1, continuous, proposal.** Include VoiceOver, TalkBack, large text, reduced motion, contrast and focus restoration in the affected screen's acceptance.
- **Microinteraction polish — P2, medium, proposal.** Improve keyboard stability, touch-down feedback, optical alignment, selected state transitions and navigation interruptions after correctness and composition pass.
- **Performance budgeting — P1, medium, proposal.** Baseline actual devices first. Apply the proposed chapter 27 targets only after identifying build type, device class, network and percentile.
- **Recommendation control — P2, large, proposal.** Evaluate hide, interest correction and reset mechanisms with explicit effects. Do not imply immediate global model erasure from a local preference change.

## 32. Rollout and review discipline

### Start with three representative vertical slices

- **Commerce slice:** search result → item detail → checkout → order detail → seller operational update. This tests product projection, media, money, uncertainty, navigation and cache propagation together.
- **Creation slice:** local draft → media upload → processing → publication → profile/discovery visibility. This tests asset dominance, async durability, audience/privacy and truthful success.
- **Investment slice:** asset detail → authoritative preview → confirmation → order state → position/wallet refresh. This tests financial language, freshness, fee truth and uncertain outcomes.

These slices cover distinct interaction grammars. A successful item card does not prove a successful trade ticket; a creator canvas should not inherit seller dashboard density. Shared primitives should support all three without forcing them into identical layouts.

### Sequence each slice through five gates

1. **Contract gate.** Define required, optional and unknown fields, permissions, money units, timestamps, idempotency and terminal states. Identify the authoritative owner of every visible claim.
2. **Composition gate.** Capture the current native first viewport and relevant reference. Compare dominant object, density, containment, typography, media and actions. Record the actual delta before editing.
3. **Interaction gate.** Implement all relevant states and transitions. Test Back, interruption, retry, keyboard, focus return and assistive technology.
4. **Live gate.** Exercise endpoints with controlled accounts and real test rows. Verify mutation propagation and privacy across viewers. Record durable results without exposing sensitive data.
5. **Release gate.** Review the final diff, static checks, existing relevant tests and native captures. A typecheck is one gate input; it cannot substitute for the other gates.

### Manage risk through ownership

- Assign a named owner to typography, resource state, media lifecycle, mutation recovery and navigation presentation. These are product contracts with code owners, not styling chores.
- Keep backend compatibility during projection migrations. Introduce explicit optional fields or versioned semantics before removing frontend assumptions.
- Migrate one primitive family at a time and validate its busiest consumers. A global token replacement can silently change every screen's density.
- Use feature flags only when both sides have valid contracts and a rollback path. A flag does not make a partially migrated money workflow safe.
- Keep rollback compatible with writes already made by the new version. Newly persisted publication/order states may outlive a client rollback.
- Record design exceptions with purpose and affected surfaces. Do not let an exception become another undocumented global rule.
- Review at realistic data density: long seller names, multi-currency values, older conversations, sparse boards, unavailable listings and partial orders.
- Keep engineering estimates separate from this research. Scope and effort depend on native captures, live endpoint results and the size of the migration discovered in implementation.

### Evaluate outcomes without rewarding harmful engagement

- Discovery: successful relevant item inspection, save organization, query refinement success and low accidental navigation.
- Commerce: informed purchase completion, reduction in fee/delivery surprises, recoverable payment uncertainty and fewer incorrect support contacts.
- Seller: urgent work completed correctly, accurate prioritization and less time finding the next action.
- Messaging: successful communication, clear delivery status and reliable return to the same conversation context.
- Creation: recovered drafts, completed valid publications and fewer surprises about audience or asset processing.
- Co-own: comprehension of price/fees/rights, correct order intent and reliable reconciliation. Increased trade frequency alone is not a quality metric.
- Accessibility: task completion with assistive technology, successful large-text use and equivalent state comprehension.

## 33. Final tiny-detail review sheet

Use this sheet on each touched surface. It supplements the department chapters; it is not a reason to add every control to every screen.

### Before the first tap

- Is the main object visible before explanatory chrome consumes the viewport?
- Do all header glyphs share optical weight, alignment and a clear purpose?
- Does a transparent hit target remain easy to operate without becoming a visible grey tile?
- Is the title useful, or does it repeat a tab label and another heading immediately below it?
- Does the actual content determine height, rather than a fixed empty panel?
- Are prices aligned by meaning and currency, with unknown values omitted or explained?
- Are timestamps clear about event time, freshness and local timezone where relevant?
- Do private/shared/verified labels have real evidence and correct audience semantics?
- Does the loading layout reserve image aspect ratio and primary text space?
- Can the user distinguish an empty collection from a failed request?

### During touch, scroll and keyboard use

- Does feedback begin promptly without waiting for a server response?
- Can a second tap accidentally send a duplicate command?
- Does a vertical drag starting on media behave predictably relative to paging and gestures?
- Does a sticky action cover the final row, caption, input or system navigation area?
- Does the keyboard resize or obscure the precise action the user needs next?
- Does dismissing the keyboard preserve input, selection and scroll position?
- Does Back close the current transient layer before leaving the underlying screen?
- Is Android predictive Back consistent with the actual destination?
- Does interrupted navigation leave a spinner, stale overlay or disabled button behind?
- Does an image finishing its load shift the target underneath a finger?

### During asynchronous work

- Are upload bytes, server processing and publication represented as different stages?
- Does the progress indicator describe measurable progress or merely continued activity?
- Can cancellation actually cancel the represented operation?
- Does a timeout indicate unknown outcome when the request may have committed?
- Is retry safe, scoped to the failed unit and backed by the same logical operation key when needed?
- Does recovery survive process death, account change and a new foreground session?
- Are stale usable data and failed refresh visible together without pretending freshness?
- Can a late response overwrite newer intent or another account's data?
- Do subscriptions stop when their scope ends, and reconnect without duplicating listeners?
- Does screen-reader announcement report a meaningful state change without repeating every progress tick?

### After completion and on return

- Is the resulting object identifiable through a durable server response?
- Have all affected screens refreshed or invalidated the correct data?
- Does the user return to the right list position and query/filter context?
- Does the UI preserve the actual receipt rather than reconstructing it from current prices?
- Are dismissed banners gone for the correct reason and scope?
- Does deleted content disappear only for the audience implied by the action label?
- Is the former primary action replaced with the next useful action?
- Does a screen opened from a notification handle unavailable, deleted or unauthorized content?
- Does the same flow work with the largest supported text setting and a screen reader?
- Does a second account observe only what its permissions allow?

## 34. Verification record and live-validation handoff

### Checks performed for this report

| Check | Result | What it establishes |
| --- | --- | --- |
| Workspace, Git root, remote, branch, HEAD and dirty status | Verified | Research is tied to the stated local checkout |
| AGENTS.md, Design.md and relevant skills | Read | Local quality rules informed the report; user report-only scope took precedence |
| Canonical screen and directly related state/service/backend inspection | Performed across the report's findings | Evidence for the specific code observations, not exhaustive execution of every route |
| Supplied reference images | Visually inspected | Composition lessons; no logical-point geometry or universal competitor rollout claims |
| Online product, engineering, accessibility and research sources | Reviewed; ledger below | External benchmark principles with source-specific limits |
| Frontend TypeScript: `node node_modules/typescript/bin/tsc --noEmit --pretty false` | Passed, exit 0 | Static type consistency at check time |
| `node scripts/check-visual-release-gates.mjs --report` | Exit 0 in report mode; 50 P0-labelled, 18 P1-labelled findings and 138 warnings across 1,440 files | Automated scan findings requiring triage; report mode success is not release acceptance |
| Native Android attempt | Emulator and installed development app present; Expo development launcher reached | Device access exists; the actual product UI was not reached for a before/after review |
| iOS native review | Not performed | No iOS visual or interaction certification |
| Live endpoint execution and mutation proof | Not performed | No live-data, payment or publication acceptance claim |
| Existing unit/integration/E2E suite | Not run for this report-only task | No test-suite pass claim |
| Product source edits | None by this research task | Findings and proposals are not implemented fixes |

### Endpoints to verify first

These paths were found in the inspected implementation. They are a focused starting set, not a complete API inventory.

- `POST /visual-search`: validate retrieval method, candidate coverage, facet semantics, partial media and safe unavailable-image behavior.
- `GET /seller-hub/overview`: validate freshness, top task, counters and per-resource failure semantics against actual seller rows.
- `POST /seller-hub/batch-command`: validate authorization, partial outcomes and propagation to orders, inventory and overview.
- `POST /payments/intents`, `GET /payments/intents/:intentId`, and the payment confirmation flow: validate idempotency, ambiguity after disconnect, status reconciliation and receipt projection.
- `POST /creator/documents/:documentId/publications` and `GET /creator/documents/:documentId/publications/:idempotencyKey`: validate lost-response lookup, processing/moderation gates and durable publication identity.
- The creator publication list and `POST/GET/DELETE /creator/documents/:documentId/schedule` flows: validate audience, cancellation, schedule result recovery and visibility across affected surfaces.
- `GET /wallet/1ze/quote` and `GET /wallet/1ze/fx-quote`: validate amount units, expiry, fees and the relationship between preview and execution.
- Co-own preview, order submission, order status, order book and position route families: resolve exact mounted routes during the implementation pass; validate authoritative prices/fees, sequence gaps, reservation outcomes and reconciliation. Do not infer an endpoint name from a screen name.

### Useful local evidence entry points

- [AGENTS.md](C:/Users/User/Desktop/thryftverse-upgrade/AGENTS.md)
- [Design.md](C:/Users/User/Desktop/thryftverse-upgrade/Design.md)
- [Frontend source](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src)

The precise file references embedded in F01–F18 and each department chapter are the primary code evidence. Paths and line numbers refer to the inspected snapshot and can move as the existing dirty worktree changes. Re-check active imports before editing.

### What would change the assessment

- A current native build demonstrating that a proposed hierarchy problem does not occur would downgrade that proposal; source complexity alone does not prove a visual defect.
- A documented authoritative business policy supporting the current trade checks would close the policy question, while still requiring clear user language and appropriate tests.
- A backend contract guaranteeing a field would narrow a null-handling concern, provided all actual responses and migrations honor it.
- Live mutation evidence could close propagation questions. A successful isolated POST without observing every dependent surface would not.
- A CI screenshot artifact could strengthen visual coverage if its build, platform, states and review are known. The mere existence of a workflow cannot.

## 35. Source ledger and interpretation limits

All sources were accessed for this report on 11 September 2026. Publication dates are included where available; undated support/documentation pages are mutable. Product announcements establish a published feature or experiment, not identical availability for every account, platform or region. Proposed ThryftVerse changes are original synthesis unless explicitly attributed.

### Product and platform benchmarks

- **S01 — Meta, 6 August 2025.** [New Instagram features to help you connect](https://about.fb.com/news/2025/08/new-instagram-features-help-you-connect/). Supports social discovery, sharing and connection as product patterns. Does not prove current geometry for the user's account.
- **S02 — Meta, May 2026.** [Instants: share in the moment](https://about.fb.com/news/2026/05/instants-share-in-the-moment/). Supports lightweight in-the-moment sharing direction; availability and surface placement remain rollout-dependent.
- **S03 — Pinterest, 5 May 2025.** [Introducing new visual search features](https://newsroom.pinterest.com/en-au/news/introducing-new-visual-search-features/). Supports visual refinement and image-led discovery. It does not validate ThryftVerse's retrieval implementation.
- **S04 — Shiau and colleagues, 18 June 2020.** [Shop The Look: building a large-scale visual shopping system at Pinterest](https://arxiv.org/abs/2006.10866). Research background for retrieval, object localization and visual shopping; historical architecture, not a current Pinterest implementation inventory.
- **S05 — Snap, 17 September 2024.** [Simple Snapchat](https://newsroom.snap.com/sps-2024-simple-snapchat). Explicitly a test announcement. Used for job-focused navigation principles, not a claim that this layout is universal today.
- **S06 — Snapchat Help, undated.** [Save a Snap to Memories and Camera Roll](https://help.snapchat.com/hc/en-us/articles/7012366807956-How-do-I-save-a-Snap-to-Memories-and-Camera-Roll). Supports distinct save destinations and persistence semantics.
- **S07 — Depop Help, undated.** [Bundles](https://depophelp.zendesk.com/hc/en-gb/articles/360017585774-Bundles). Supports bundle and shipping/discount workflow comparison. Exact market behavior should be rechecked before implementation.
- **S08 — Depop Help, undated.** [Send Offer](https://depophelp.zendesk.com/hc/en-gb/articles/15495796917777-Send-Offer). Supports offer lifecycle and scope comparison; not a recommendation to copy commercial policy.
- **S09 — Robinhood Help, undated.** [Limit order](https://robinhood.com/us/en/support/articles/limit-order/). Supports explanation of order intent and limits. Does not establish rules for ThryftVerse fractional assets.
- **S10 — Robinhood Help, undated.** [Using advanced charts](https://robinhood.com/us/en/support/articles/using-advanced-charts/). Supports chart interaction and information-layer comparison.
- **S11 — Robinhood Help, undated.** [Buying a stock](https://robinhood.com/us/en/support/articles/buying-a-stock/). Supports staged order entry and review as a workflow benchmark; not financial advice or regulatory equivalence.
- **S12 — Whatnot Help, 14 May 2026.** [Bid on an item during a show](https://help.whatnot.com/hc/en-us/articles/14932924544141-Bid-on-an-item-during-a-show). Supports live auction interaction analysis. Platform-specific bid rules should not be transferred without a matching backend contract.
- **S23 — Meta, 22 April 2025, subsequently updated.** [Introducing Edits](https://about.fb.com/news/2025/04/introducing-edits-streamlined-video-creation-app/). Supports end-to-end creator workflow comparison, not exact current control geometry.
- **S24 — Snapchat Help, undated.** [Edit a Snap in Memories](https://help.snapchat.com/hc/en-gb/articles/7012362390420-How-do-I-edit-a-Snap-in-Memories). Supports editing an existing saved artifact as a distinct workflow.
- **S25 — Meta, 19 November 2024, updated 14 July 2025.** [Recommendations reset on Instagram](https://about.fb.com/news/2024/11/introducing-recommendations-reset-instagram/). Supports user control over recommendation experience; does not prove a particular immediate backend effect in ThryftVerse.
- **S26 — Meta, April 2026, updated May 2026.** [Instagram expands Teen Accounts inspired by 13+ content ratings](https://about.fb.com/news/2026/04/instagram-expands-teen-accounts-inspired-by-13-content-ratings/). Supports age-sensitive product defaults as a benchmark. Legal obligations require separate jurisdiction-specific review.

### Native design, accessibility and runtime behavior

- **S13 — Apple Developer, undated.** [UI design tips](https://developer.apple.com/design/tips/). Primary guidance on touch, readability, alignment and native interface basics; not evidence that a particular ThryftVerse screen passes.
- **S14 — Android Developers, mutable documentation.** [Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views). Supports native accessibility and target guidance. Platform-specific units must remain distinct from CSS pixels.
- **S15 — W3C, current explanatory guidance.** [Understanding target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum). Supports WCAG 2.2 web target requirements and exceptions. The report does not equate the web minimum with preferred native hit areas.
- **S16 — Software Mansion, mutable documentation.** [useReducedMotion](https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/). Supports the documented preference sampling behavior underlying F14; verify the installed library's semantics during implementation.
- **S17 — Android Developers, mutable documentation.** [Predictive Back gesture](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture). Supports platform Back behavior and integration testing.
- **S27 — Software Mansion, mutable documentation.** [ReducedMotionConfig](https://docs.swmansion.com/react-native-reanimated/docs/device/ReducedMotionConfig/). Supports global animation preference configuration; user-specific settings still need coherent ownership.
- **S28 — Apple Human Interface Guidelines, mutable documentation.** [Motion](https://developer.apple.com/design/human-interface-guidelines/motion?changes=_3). Supports meaningful motion and accessibility restraint.
- **S29 — Expo, latest documentation at access time.** [Image](https://docs.expo.dev/versions/latest/sdk/image/). Supports image presentation/loading/cache capabilities. Latest documentation is not a recommendation to upgrade packages without compatibility review.
- **S31 — React Native, mutable documentation.** [Performance overview](https://reactnative.dev/docs/performance.html). Supports release-build performance evaluation and frame-budget reasoning.
- **S32 — React Native, documentation updated August 2026.** [Debugging](https://reactnative.dev/docs/debugging). Supports separation of debugging tools from production behavior.
- **S35 — Shopify, documentation updated August 2026.** [FlashList v2 migration](https://shopify.github.io/flash-list/docs/v2-migration/). Supports migration constraints and recycling-aware engineering; does not prove the repository has migrated correctly.
- **S36 — Shopify, documentation updated August 2026.** [FlashList known issues](https://shopify.github.io/flash-list/docs/known-issues/). Supports targeted list verification. A documented issue is not automatically present in this application.
- **S37 — W3C, current standards guidance.** [What's new in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/). Supports focus, dragging, target size and accessible authentication considerations. This report is not a conformance certification.

### Engineering and independent UX research

- **S18 — Meta Engineering, 9 August 2023.** [Scaling Instagram Explore recommendations](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/). Supports retrieval/ranking separation and system-level discovery thinking; historical engineering account.
- **S19 — Baymard Institute, originally November 2024, updated November 2025.** [Current state of checkout UX](https://baymard.com/blog/current-state-of-checkout-ux). Independent ecommerce research supports reducing checkout friction and ambiguity. Its study population and web context are not ThryftVerse native-app measurements.
- **S20 — Baymard Institute, undated overview.** [Reduce cart abandonment](https://baymard.com/learn/reduce-cart-abandonment). Supports checkout problem framing; no conversion uplift is forecast for ThryftVerse.
- **S21 — Stripe, mutable API documentation.** [Idempotent requests, API v1](https://docs.stripe.com/api/idempotent_requests?lang=php). Supports safe retry reasoning within the documented API's semantics.
- **S22 — Stripe, mutable documentation.** [API v2 overview](https://docs.stripe.com/api-v2-overview). Used to avoid treating different API generations' idempotency behavior as interchangeable. ThryftVerse's own logical operation durability must be explicitly designed.
- **S30 — Meta Engineering, 4 November 2022.** [Reducing Instagram video processing costs](https://engineering.fb.com/2022/11/04/video-engineering/instagram-video-processing-encoding-reduction/). Supports processing-pipeline tradeoffs; not a mandate to reproduce Meta's infrastructure.
- **S33 — Nielsen Norman Group, Jakob Nielsen, 25 October 2019.** [Three response-time limits in interaction design](https://www.nngroup.com/videos/3-response-time-limits-interaction-design/). Qualitative latency-perception context. Proposed app budgets in chapter 27 are separate and require measurement.
- **S34 — TanStack, latest documentation at access time.** [React Native integration](https://tanstack.com/query/latest/docs/framework/react/react-native). Supports connectivity and focus integration; exact package compatibility must be checked in the repository.

### Additional triangulation and lower-confidence material

- [Nielsen Norman Group: recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/) and [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) inform the recommendation to keep immediate choices recognizable and secondary complexity reachable. These are general principles, not proof of an optimal layout for this product.
- [FlashList public issue tracker](https://github.com/Shopify/flash-list/issues) was reviewed for current failure modes involving list interaction, sticky layout and accessibility. Reports motivate tests; none is asserted as reproduced in ThryftVerse.
- [Instagram's App Store listing](https://apps.apple.com/us/app/instagram/id389801252) provides a current distribution-facing perspective. Store ratings and individual reviews do not establish defect prevalence, causality or universal feature availability.
- A [Depop community discussion about bundles](https://www.reddit.com/r/Depop/comments/1ugjz62/psa_for_those_w_bundles_enabled/) suggests discount comprehension as a useful scenario to test. It is an anecdotal hypothesis, not a verified product-policy source or quantified research finding.

### Research boundaries

- Public announcements, support pages, engineering articles and supplied images reveal different parts of a product. Their claims are not interchangeable.
- Authenticated competitor flows were not exhaustively operated on matched physical devices. This report therefore compares supported behaviors and observed supplied compositions rather than claiming pixel-perfect current competitor parity.
- No attempt was made to infer private recommendation weights, confidential conversion data or unpublished financial safeguards.
- Source coverage is broad across the requested departments, but the internet and codebase are not exhaustively covered. The strongest actionable conclusions are the explicit inspected-code findings and the acceptance criteria that can now be tested.

## 36. Recommended first implementation brief

Commission the first pass around **truthful commerce and shared interaction quality**, with a bounded scope: payment uncertainty, authoritative co-own fees and policy verification, search state correctness, seller partial-resource behavior, typography ownership and reduced-motion consistency. These have concrete source-backed starting points and affect trust or repeated behavior.

Then undertake three native composition passes: seller command center, discovery/item detail, and creator workflow. Use the actual running development build, retain local before/after captures and review both themes and large text. Apply the same surface grammar to related screens only after it succeeds in the representative slice.

The desired end state is specific: content dominates the viewport; controls behave predictably; every commercial claim has an owner; uncertainty is recoverable; native interaction survives interruption; and acceptance is backed by a named build, live results and rendered evidence. That is the production-quality improvement this report recommends.
