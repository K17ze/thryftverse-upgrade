# ThryftVerse: remaining native UI/UX parity gaps

Reviewed 28 September 2026 against HEAD `244d242aba13b3dd8ab0febd0e00d4068bf6c377`.

Workspace: `C:/Users/User/Desktop/thryftverse-upgrade`. Branch: `feat/product-detail-contract-media-device-closure`. Starting worktree: clean. Execution: single-agent source audit and fresh online research. No application code changed, no commits, no subagents.

**Assessment:** The code now contains several strong product patterns. The next quality gain should come from consistent layout ownership, exact financial readability, useful disclosure summaries, and complete interaction states. Another layer of cards, shadows or ornamental icons would make these surfaces worse.

This is a new audit of the current code, not a replay of the September 13 report. Findings distinguish **confirmed source behavior**, **design judgment**, and **native validation needed**. No native device was connected when `adb devices` was checked. This report does not certify rendered pixel parity, performance, live backend correctness or exhaustive whole-repository coverage. It reviews the requested native departments and their directly relevant shared components; the recently added web frontend is outside this pass.

## What already meets the intended design direction

- **Flat commerce sections:** `CommerceDetailSection` and `CommerceDetailDisclosureRow` use hierarchy and hairlines rather than surrounding every fact with a card. Preserve this direction; repair their composition contracts below.
- **Co-own navigation and dossier:** `CoOwnSegmentNav` supports measured tab geometry and 200% text scaling. `CoOwnDossierRibbon` has a neutral document glyph, a stable title and a compact factual preview. The former unconditional checked-shield concern is resolved.
- **Financial truth:** `PortfolioPerformersCard` derives direction from the signed return, rather than treating the highest-ranked position as necessarily profitable. Preserve the neutral zero state there.
- **Truthful commerce unknowns:** `ShippingReturnsInfo` now omits unknown restocking fees; it no longer presents missing data as no fee.
- **Description disclosure:** `ItemDetailItemDetails` now measures laid-out lines rather than relying only on character count. Short text with explicit line breaks can expose expansion.
- **Agent health:** `AgentStudioStatusOverview` distinguishes no connections, zero healthy connections, degraded coverage and all healthy. Merely having a connection no longer creates a green health signal.
- **Auction management:** `AuctionSellerActions` provides actions scoped to the current auction, including bid history, the available sale order and item listing. Do not reintroduce the old detail-to-global-hub detour.
- **Discovery infrastructure:** `PinterestMasonryGrid` uses FlashList, media-ratio handling and listing-media-aware prefetch resolution. Non-listing media still lacks equivalent state handling, discussed below.
- **Group permissions:** server-loaded authority, expandable permission rows and checked/disabled radio semantics are substantially better than a generic settings dashboard.
- **Activity:** the active market ledger uses `MarketActivityRow`, with explicit status, timestamp and restrained separation. The older exported `CoOwnActivityRow` was not treated as an active-screen defect: no JSX consumer was found in the scoped search.

These are source-level strengths. They are not substitutes for a native screenshot review.

## Reference decisions and evidence boundaries

All links below were researched on 28 September 2026. Public documentation supports behavior and information architecture; it does not establish exact current native spacing or radii.

| Reference | Primary evidence | Transferable decision |
| --- | --- | --- |
| Robinhood | [Level II market data](https://robinhood.com/us/en/support/articles/level-ii-market-data/) | Resting orders show price and quantity; depth is distinct from historical trades. Keep these concepts legible and do not blur quote state with execution state. |
| Depop | [Make Offer](https://depophelp.zendesk.com/hc/en-gb/articles/4412315779345-Make-Offer), [Send Offer](https://depophelp.zendesk.com/hc/en-gb/articles/15495796917777-Send-Offer) | Offer and purchase are distinct actions. Surface the next meaningful buying decision and preserve the commercial context. |
| Pinterest | [Create boards](https://create.pinterest.com/en-us/product-features/how-to-create-boards/?change_language=true), [Save from the web](https://help.pinterest.com/en/article/add-pins-from-the-web) | Discovery connects an image to a clear save destination. Media integrity and action clarity are more useful benchmarks than decorative masonry alone. |
| Snapchat | [Reply in Chat](https://help.snapchat.com/hc/en-us/articles/7012338497172-How-do-I-reply-to-a-Snap-in-Chat) | Reply is reachable through a contextual menu and a gesture. Preserve context and provide an accessible equivalent to gestures. |
| Instagram | [DM updates, March 2024](https://about.fb.com/news/2024/03/instagram-dm-updates/), [DM updates, February 2025](https://about.fb.com/news/2025/02/new-instagram-dm-features-stay-connected/) | Rich messaging capabilities stay attached to the conversation. These dated announcements establish features, not September 2026 pixel geometry. |
| Whatnot | [Manage listings](https://help.whatnot.com/hc/en-us/articles/48441579309837-Manage-your-product-listings) | Inventory management belongs in a coherent seller workflow. A row should make its item and next operational task easy to scan. |
| Apple | [UI design tips](https://developer.apple.com/design/tips/) | Align related content, keep text legible and provide practical touch targets. Its published minimum is 44 × 44 points. |

The proposed visual treatments below are ThryftVerse design judgments informed by those behaviors and the local charter. They are not claims that the references use the same measured layouts.

## Priority findings

P1 means a meaningful readability, access or state-understanding gap. P2 means a composition or interaction-quality gap. P3 means documentation or maintenance drift. All findings remain open recommendations unless explicitly described as resolved above.

### 01 — P1: Shared disclosure rows compress the actual destination

**Evidence:** [CommerceDetailDisclosureRow.tsx:80](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/commerce/detail/CommerceDetailDisclosureRow.tsx:80>) clamps both label and summary to one line. Its trailing cluster can take up to 52% of the row. Consumers include purchase details, ownership rights and risk disclosure.

**Impact:** A long meaningful label competes with generic copy such as “Full breakdown.” At large text sizes the destination can become the least readable part of the control.

**Upgrade:** Give the destination priority. Permit two-line labels; move a meaningful summary below the label at narrow widths or large text. Remove generic summaries. Keep the chevron optically separate and fixed-sized.

**Acceptance:** At 320/390/430-point widths and 100/150/200% text, the full action remains understandable, the chevron remains reachable, and neighboring rows do not collide. Fix the shared primitive before individual consumers.

### 02 — P2: Shared disclosure motion ignores the preference it reads

**Evidence:** The same component reads `useReducedMotion`, but uses it only to gate haptics. Its pressed style always applies a scale transform.

**Upgrade:** Use opacity-only press feedback with reduced motion. Keep the haptic preference independent of animation preference. Reconsider the unconditional 12-point hitSlop around an already 44-point row: adjacent disclosure rows can have overlapping expanded targets within the parent.

**Acceptance:** Inspect stacked rows under normal and reduced motion; taps near a separator activate the intended row, and disabling motion removes scaling.

### 03 — P2: Nested page padding creates inconsistent text edges

**Evidence:** [CommerceDetailSection.tsx:112](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/commerce/detail/CommerceDetailSection.tsx:112>) supplies `Space.md` horizontal padding. [ShippingReturnsInfo.tsx:177](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/commerce/detail/ShippingReturnsInfo.tsx:177>) adds another `Space.md` while nested inside it. Auction `descriptionBlock` similarly adds horizontal padding within a padded editorial section. `Space.md` is 16.

**Impact:** These children sit 16 points farther inward than their neighboring section content. The inconsistent left edges make a composed screen look assembled from independent widgets.

**Upgrade:** Let the section own the page inset. Add an explicit embedded treatment only where the child is also used independently. Avoid compensating with negative margins.

**Acceptance:** Overlay vertical guides on item and auction screenshots. Headings, paragraph bodies and disclosure labels should align unless a deliberate subordinate indentation communicates hierarchy.

### 04 — P2: Purchase information has two competing entry points

**Evidence:** [ItemDetailBuyingSection.tsx:34](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/itemdetail/ItemDetailBuyingSection.tsx:34>) places “Costs, delivery & protection / Full breakdown” immediately beside a separate expandable “Shipping & Returns” component.

**Impact:** Buyers must infer which container owns delivery, returns and charges. Neither generic “Full breakdown” nor repeated categories helps the buying decision.

**Upgrade:** Define one ownership model: a factual purchase summary leading to full terms, with separate shipping disclosure only if it provides a distinct task. Preserve all current detail capabilities. Use known cost and return facts in the summary instead of explanatory filler.

**Acceptance:** A buyer can find total-cost context and return policy without opening two destinations to compare overlapping content.

### 05 — P2: The collapsed shipping row conceals the returns decision

**Evidence:** [ShippingReturnsInfo.tsx:76](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/commerce/detail/ShippingReturnsInfo.tsx:76>) sets `summaryLine` to the always-nonempty shipping label. The JSX fallback `summaryLine || returnsLabel` therefore never exposes returns in the summary.

**Upgrade:** Include known returns status in a short second line or combined wrapping summary. Unknown policy should remain unknown. A no-returns policy is a decision fact, not information to bury behind expansion.

**Acceptance:** Free shipping plus no returns, paid shipping plus a defined return window, and unknown policy each produce a truthful, readable collapsed state.

### 06 — P2: Auction condition is duplicated and overemphasized

**Evidence:** [AuctionDetailInfoSections.tsx:63](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/auctiondetail/AuctionDetailInfoSections.tsx:63>) passes condition into `resolveEvidenceGroups`, then renders it again in a separate Condition row. The resolver includes condition in multiple category branches. The standalone value uses `TypographyV2.priceList` and bold weight.

**Upgrade:** Give condition one canonical location. Use ordinary factual typography for its value, reserving price hierarchy for money. Preserve category-specific condition evidence rather than deleting useful attributes.

**Acceptance:** A listing in a category whose evidence group includes condition displays the grade once; its visual emphasis does not rival the bid amount.

### 07 — P2: Long auction descriptions displace bid activity

**Evidence:** [AuctionDetailInfoSections.tsx:55](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/auctiondetail/AuctionDetailInfoSections.tsx:55>) renders unrestricted description text before bid activity and rules. Item detail already has measured expansion, so this is cross-department inconsistency.

**Upgrade:** Use measured progressive disclosure and keep a short factual preview. Preserve full seller copy. Decide whether a compact bid-activity summary should precede long item evidence on an active auction.

**Acceptance:** A multiline, long description cannot push every bid-history affordance several screens away; expansion preserves reading position and remains accessible.

### 08 — P2: Auction bid-history action lacks the standard target geometry

**Evidence:** The `bidActivityViewAll` style in [AuctionDetailInfoSections.tsx:179](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/auctiondetail/AuctionDetailInfoSections.tsx:179>) has vertical padding but no minimum target height; its adjacent chevron is 14 points. The control also applies a pressed scale without a local reduced-motion branch.

**Upgrade:** Use the shared disclosure/action geometry once corrected: at least the project target height, a quiet consistent chevron, wrapping text and restrained preference-aware feedback.

**Acceptance:** Measure the resulting native target rather than assuming padding creates 44 points. Test the longest bid-count label and large text.

### 09 — P2: Seller auction rows ask too many elements to compete

**Evidence:** [SellerAuctionRow.tsx:90](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/auction/SellerAuctionRow.tsx:90>) combines title, state, optional brand, an internal divider, primary value, local value, action text, leading status and bid count next to a 96-point image. Monetary lines are clamped to one line.

**Design judgment:** This row behaves like a small dashboard. It makes repeated inventory scanning harder, especially when title and operational status both need space.

**Upgrade:** Prioritize item identity, one commercial value and one next task. Put supporting currency and state into a quiet wrapping line. Consider a smaller media slot after comparing crops on device. Preserve full details in the scoped management destination.

**Acceptance:** At default text a representative viewport exposes roughly four useful inventory rows; at large text values remain exact and action labels remain understandable. This density target is local, not a measured Whatnot specification.

### 10 — P1: Financial columns remain bounded by hardcoded rails

**Evidence:** [CoOwnOrderBook.tsx:29](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/CoOwnOrderBook.tsx:29>) fixes price at 90 points and units at 80. Numeric cells now allow two lines, improving the earlier version, but still have a two-line limit. The separate top-of-book values in [AssetMarketSection.tsx:289](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetMarketSection.tsx:289>) remain single-line.

**Risk:** Large values and 200% text can exceed the rails. A monetary value must not be silently shortened to preserve a normal-size layout.

**Upgrade:** Define a responsive financial layout, using measured available width and text scale. At the breakpoint, show exact price and units in a structured stacked row or a clearly scrollable table. Do not substitute ambiguous abbreviations in executable quotes.

**Acceptance:** Native tests with long prices, seven-digit unit quantities, one-sided books, no bids and no asks. Keep headers aligned, digits tabular and row selection targets usable. Verify selected level still opens the intended order ticket.

### 11 — P2: Quote repetition and an unlabeled imbalance strip add noise

**Evidence:** `AssetMarketSection` renders a bid/spread/ask strip, then the embedded `CoOwnOrderBook` repeats bid and ask in its spread band. The imbalance strip shows percentage text whose bid/ask meaning is supplied by color and an accessibility label, rather than visible side labels.

**Upgrade:** Keep necessary spread context near the ladder, but remove redundant quote emphasis. Label the gauge “Bid” and “Ask,” or omit it when it does not aid this audience. If depth is scaled against all supplied levels rather than visible levels, state the scope clearly.

**Acceptance:** A monochrome screenshot still explains the gauge. In a thumbnail, the ladder and primary quote dominate; repeated metrics do not look like competing headers.

### 12 — P1: Co-own identity still caps and shrinks the primary price

**Evidence:** [AssetDetailIdentity.tsx:109](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetDetailIdentity.tsx:109>) uses one line, a 1.3 font multiplier and a 0.7 minimum shrink scale on the dominant price. Basis text is capped at 1.4. [AssetDetailModals.tsx:209](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetDetailModals.tsx:209>) retains 1.3 caps on several disclosure titles.

**Upgrade:** Adopt the same large-text strategy across identity, market, dossier and sheets. Reflow supporting context below the price rather than shrinking the most important number.

**Acceptance:** At 200% text the price remains exact and legible, the basis remains visible, and sheet titles scale consistently with the page that opened them.

### 13 — P2: Zero daily change is presented as an upward move

**Evidence:** [AssetDetailIdentity.tsx:132](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetDetailIdentity.tsx:132>) uses `movePct24h >= 0` for the up arrow, positive color and announcement “up.” Exactly zero therefore renders as positive movement.

**Upgrade:** Use three states: positive, negative and unchanged. Consider sign-aware rounding so tiny negative values do not produce confusing signed zero.

**Acceptance:** Positive, negative, exact zero and values that round to zero have mutually coherent text, glyph, color and screen-reader descriptions.

### 14 — P2: Trading rules do not match their stated disclosure contract

**Evidence:** [AssetMarketSection.tsx:734](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetMarketSection.tsx:734>) describes a tappable disclosure and full rules sheet in its comment, but renders static Views with single-line values instead.

**Upgrade:** Choose deliberately between a static factual summary and an actual rules destination. Explain price protection through authoritative policy data and give fee/settlement terms room to wrap. Verify the backend protection policy before changing its claim; this audit does not establish that the circuit-breaker statement is false.

**Acceptance:** Every apparent disclosure has a real destination, and complete material terms are reachable without clipped text. Correct the misleading comment as part of the same change.

### 15 — P1: Provider selector chips are undersized and omit selected semantics

**Evidence:** [AgentStudioConnectionsSection.tsx:107](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/agents/AgentStudioConnectionsSection.tsx:107>) renders provider buttons with visual selection but no selected/checked accessibility state. `providerChip` in `agentStudioStyles.ts` has 4-point vertical padding and no minimum height or expanded hit area.

**Upgrade:** Use accessible single-selection semantics and a full-size transparent target around the compact visible chip. Remove unreachable “coming soon” branches from the two-provider list during cleanup, without inventing provider support.

**Acceptance:** Both providers are reachable at the project touch minimum; TalkBack/VoiceOver announces which is selected. The visible shapes can remain compact.

### 16 — P2: Agent list metadata favors implementation over purpose

**Evidence:** [AgentStudioAgentsSection.tsx:119](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/agents/AgentStudioAgentsSection.tsx:119>) displays runtime and version as the main subtitle, with single-line name and status. `providerStatus` refuses to shrink.

**Upgrade:** Show the agent's real purpose or actionable setup issue first, where the contract supplies it. Move runtime/version into detail. Allow title and status to reflow together; do not invent task results or activity.

**Acceptance:** A long agent name remains distinguishable beside “Setup needed” at large text. The row answers what the agent does or needs before how it is implemented.

### 17 — P1: Agent partial failures lose resource identity

**Evidence:** [useAgentStudioResources.ts:16](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/hooks/useAgentStudioResources.ts:16>) fetches bots, connections and approvals independently, but reduces all rejected outcomes to one boolean. `AgentStudioStatusOverview` then replaces the whole summary with a generic retry row. Connection error text is also clamped to one line in the list.

**Upgrade:** Keep per-resource freshness/error state. Mark the affected tab or section, preserve healthy information, and expose the full actionable connection error in context. Retrying should identify what is being refreshed.

**Acceptance:** Fail each resource separately. The other two remain useful, stale data is labeled, and the failed resource does not read as confirmed empty. Test failures while approvals exist.

### 18 — P1: Editorial discovery images lack an explicit failure treatment

**Evidence:** [PinterestMasonryGrid.tsx:622](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/discover/PinterestMasonryGrid.tsx:622>) and the Poster/Moodboard branches use direct ExpoImage instances without local `onError` or placeholder handling. Their parent supplies a neutral fill, so a failed image can leave that fill carrying the entire visual tile.

**Upgrade:** Give all media unit types a consistent loading/error/retry contract. Preserve editorial ratios and image identity; do not replace failed media with unrelated stock photography. Prefer reusable media behavior without forcing every content type into the same card composition.

**Acceptance:** Broken URL, timeout, offline cache hit, offline cache miss and recycled-cell source changes all retain a coherent tile and truthful action.

### 19 — P2: Verification glyphs use the wrong contrast role over media

**Evidence:** Look and Poster creator checks at [PinterestMasonryGrid.tsx:650](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/discover/PinterestMasonryGrid.tsx:650>) use `colors.brand` beside white text on a dark scrim. The neutral light-theme brand is near-black.

**Upgrade:** Use a media-overlay foreground role, with a controlled backing if actual imagery requires it. Preserve the existing server-derived verification condition.

**Acceptance:** Check light and dark themes over black, white and high-frequency photographs. The glyph remains visible without gaining more visual weight than creator identity.

### 20 — P2: Discovery reduced motion is read but discarded

**Evidence:** [PinterestMasonryGrid.tsx:479](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/discover/PinterestMasonryGrid.tsx:479>) explicitly discards the reduced-motion value; non-listing images retain fixed 160ms transitions.

**Upgrade:** Apply the preference consistently to media transitions. Measure whether decoded-ratio updates also cause visible reflow; avoid assuming an accurate final aspect ratio means a stable loading transition.

**Acceptance:** Reduced-motion media swaps are instant or use the documented permitted fallback. A slow-image test records loading-to-final geometry rather than checking only the final frame.

### 21 — P1: Message bubbles expose a button without a normal activation action

**Evidence:** [MessageBubble.tsx:328](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/chat/MessageBubble.tsx:328>) assigns button semantics to a Pressable with only `onLongPress`. Reply and media controls are nested inside it. `SwipeableMessage` adds gesture behavior but no explicit accessibility action mapping.

**Upgrade:** Define a coherent accessible message node with actions for available reply/menu capabilities, while keeping media and links independently operable. Do not add redundant focus stops. The app already has swipe reply: absence of that feature is not the finding.

**Acceptance:** Navigate text, image, document, reply, failed-send and agent-draft messages with TalkBack and VoiceOver. Activation and custom actions must perform what is announced; nested controls must remain reachable.

### 22 — P2: Message swipe cleanup covers completion but not explicit finalization

**Evidence:** [SwipeableMessage.tsx:95](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/SwipeableMessage.tsx:95>) resets displacement in `onEnd`, with no explicit `onFinalize` cleanup. It emits a threshold haptic and another haptic when the action fires.

**Risk requiring reproduction:** A failed or interrupted gesture path may retain translation depending on its lifecycle. Do not claim a reproduced stuck bubble from source alone.

**Upgrade:** Separate commit logic from unconditional cleanup and use one deliberate haptic event unless a two-stage interaction is intentional.

**Acceptance:** Interrupt a swipe with vertical scrolling, navigation and cancellation. The row returns to rest without firing an unintended action. Normal swipe still preserves quoted-message context.

### 23 — P2: Portfolio partial-state recovery is too implicit

**Evidence:** [PortfolioPartialBanner.tsx:13](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/portfolio/PortfolioPartialBanner.tsx:13>) gives a two-line warning but no local action. `PortfolioScreen` does have pull-to-refresh, so recovery is available, just not clearly connected to the warning.

**Upgrade:** Add a quiet retry action or clear refresh instruction; keep existing positions visible. Avoid clamping the warning at large text. Where available, expose which positions are stale or missing rather than relying only on a global qualification.

**Acceptance:** Partial results remain usable and a user can discover recovery without knowing the hidden gesture. Never present a partial total as complete.

### 24 — P2: Group permissions loading and read-only modes need deliberate presentation

**Evidence:** [GroupPermissionsScreen.tsx:135](</C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/GroupPermissionsScreen.tsx:135>) starts with a centered spinner. The populated state has three predictable expandable rows. Users without management capability can expand options that are all disabled. A read-only explanation already exists, but it is below the full permission list.

**Upgrade:** Use a restrained three-row loading skeleton. Move the existing read-only explanation nearer the first affected control or into the introduction, using server capability data. Keep permission values inspectable and preserve reconciliation after uncertain updates.

**Acceptance:** Loading-to-content geometry stays stable. A non-admin understands why changes are unavailable; offline and authority restrictions do not use indistinguishable explanations.

### 25 — P3: Design documentation has fallen behind the actual token contract

**Evidence:** `Design.md` remains version 1.9 with September 12 source verification. Its palette block does not document the current `successText`, `dangerText` and `warningText` foreground roles now present in `frontend/src/constants/colors.ts`.

**Upgrade:** Reconcile the document with runtime token roles. Explicitly distinguish status fills from readable status foregrounds, and record embedded spacing ownership and large-text layout rules. Avoid another decorative palette migration.

**Acceptance:** A developer following Design.md chooses the correct foreground token without reverse-engineering existing screens. Documentation examples match the actual canonical typography and theme exports.

## Recommended execution sequence

1. **Shared component foundations:** disclosure wrapping, reduced-motion press behavior and section inset ownership. Recheck item, auction and co-own consumers together.
2. **Financial readability:** responsive quote/book layouts, identity price scaling and neutral zero movement. Verify values and order-ticket selection end to end.
3. **Item and auction composition:** one purchase-information model, one condition presentation, bounded descriptions, usable bid-history actions and a scannable seller row.
4. **Agent operational clarity:** provider target geometry, accessible selection, purpose-led rows and per-resource error recovery. Do not add visual polish over ambiguous status.
5. **Discovery and conversation continuity:** media failure states, media-overlay contrast, reduced motion, accessible message actions and gesture cleanup.
6. **State polish and documentation:** portfolio recovery, group permission loading/read-only treatment, then update Design.md from validated behavior.

Do not rewrite all departments at once. Each batch should retain real navigation, handlers and contracts, and finish with native captures before moving to the next batch.

## Minute-detail acceptance sheet for every affected surface

| Dimension | Required check |
| --- | --- |
| Dominant object | Identify what should catch the eye first. At 25% scale, that object must remain dominant. |
| First viewport | Record first useful content Y-position and useful object count; compare like-for-like states. |
| Insets | One owner for page padding; use guides to detect accidental 16-point nesting. |
| Type | Check 100%, 150% and 200% font scaling; record actual wrapping and clipped content. |
| Numbers | Exact values, tabular digits, explicit unit/basis, neutral zero, no silent ellipsis on executable prices. |
| Glyphs | Consistent family and optical size by role; transparent practical targets around small glyphs. |
| Containment | Count non-media rounded containers above the fold. Every persistent fill must communicate a real role. |
| Touch | Measure targets and inspect overlapping hit areas; test edges and adjacent controls. |
| State | Loading, empty, filtered empty, partial, stale, offline, denied, failed and retry where relevant. |
| Money actions | Confirm submitting, confirmed outcome and unknown outcome stay distinct; UI polish cannot establish transactional correctness. |
| Motion | Press, interruption, dismissal and reduced-motion behavior; no decorative repeated entrance animations. |
| Media | Portrait garments, shoes, bags, jewelry and missing media; check crop and loading geometry. |
| Accessibility | Reading order, selected state, expanded state, role, activation and equivalent gesture actions. |
| Navigation | Correct destination, parameters, Back destination and return-to-source context. |
| Sticky regions | Record content hidden by docks, keyboard and safe areas. |
| Theme | Same geometry in light and dark; contrast measured over the actual composited background. |

This matrix is a proposed verification plan, not a claim that all checks passed during this audit.

## Review limitations and self-check

- Current source and active consumers were inspected; no application implementation was modified.
- A concurrent change to `web/src/lib/api/http.ts` appeared during the audit. It was not authored or modified by this audit and was left untouched.
- No connected native target was available at the time of inspection. No new before/after captures, thumbnail comparison or screen-reader session was performed.
- No live mutation or backend verification was performed. No TypeScript or test pass is claimed; this was a research-only pass.
- Older resolved findings were explicitly removed from the open list. An apparently inactive activity-row component was excluded rather than presented as a current screen defect.
- Official reference documentation was consulted. No unsupported claim of exact Instagram/Pinterest/Robinhood pixel matching is made.
- Audit self-evaluation: accuracy 4/5 (source-backed, native risks remain unverified); completeness 3/5 (focused native departments, not exhaustive runtime coverage); clarity 4/5 (evidence separated from judgment); actionability 4/5 (owners and acceptance conditions supplied); conciseness 3/5 (deliberately detailed for the requested review). These assess the report, not product quality.

**Status: CURRENT-CODE AUDIT DELIVERED — NATIVE VISUAL AND INTERACTION VALIDATION PENDING.**

## Subsequent implementation: disclosure and purchase-section components

The audit above records the original HEAD. The following changes were made afterward in the working tree:

- Shared disclosure labels and supporting facts now wrap in one content column. Counts use plain tabular text instead of a fixed-height badge. Decorative glyphs are excluded from accessibility, and the default accessible label includes supporting facts and counts, including zero.
- Disclosure press feedback is opacity-only. Removed overlapping extra hitSlop while preserving the minimum target. Haptic preference handling remains owned by the existing haptic hook.
- Shipping and sustainability content inherit the containing section's inset. This addresses item-detail alignment; the separate auction-description inset finding is still open.
- The shipping disclosure exposes shipping and returns together before expansion, including an explicit unknown-policy state. All expanded policy rows remain available, and unknown fees remain omitted.
- The purchase link now reads “Costs & buyer protection”; removed its generic “Full breakdown” summary and decorative information glyph. The existing sheet and its capabilities remain intact. Full purchase-information consolidation is still open.
- Validation: frontend TypeScript completed successfully; 75 tests passed across commerce-detail runtime, shipping/returns disclosure, co-own asset-detail runtime and distribution-depth suites. Scoped diff whitespace check passed. These tests validate behavior, not native geometry.
- No connected native device or listening local API/Metro port was found during this pass. Native captures, large-text layout, optical glyph review and screen-reader verification remain pending.
- Removed JSX was presentation-only: a count badge wrapper, redundant shipping glyphs, and generic summary copy. No destination, API call, purchase capability or policy detail was removed. No backend contract was changed.

**Implementation status: IMPLEMENTED — NATIVE DEVICE VALIDATION PENDING. The overall flagship goal remains active.**

## Subsequent implementation: auction information hierarchy

- Auction descriptions now use a measured three-line preview with an accessible expansion action. Explicit line breaks trigger expansion correctly; full seller text remains available. Changing auction or description resets the disclosure through its content key.
- Condition is owned by one dedicated row, with body-scale emphasis instead of price-scale typography. Category evidence retains all other supplied facts.
- Embedded category evidence no longer adds a second page inset on auction and item detail; standalone consumers retain their previous inset.
- Leading-bid amounts and identity stack on narrow screens, large text, or long formatted amounts. Removed line clamps on bidder context. Removed the live region around continuously changing relative-time text; the screen's separate auction state announcements remain untouched.
- Bid history now uses the shared full-target disclosure control, with a consistent chevron and singular/plural announcement. It remains reachable when the preview fails, provided the auction reports bids. The same navigation callback and rules action are preserved.
- Replaced one obsolete source-style-name assertion with runtime callback coverage; tested description expansion and short-copy behavior. All 97 tests in five selected commerce/auction suites passed. Native rendering and screen-reader verification remain pending; `adb devices` still reported no target.

These changes address audit findings 06–08 and the auction/category-evidence portion of 03 in implementation. They do not establish native visual closure or overall flagship parity.

## Subsequent implementation: remaining findings 04, 09–25 (parallel wave)

Implemented on top of the prior waves in the same working tree via seven
file-disjoint packages, then a fresh-context adversarial review and a fix
round. Verified: repo-wide `tsc --noEmit` clean; 72+ new tests and 400+
existing-suite tests pass across commerce, auction, co-own, agent, chat,
discovery and portfolio surfaces.

- **04 — purchase-information ownership.** `ShippingReturnsInfo` owns the
  at-a-glance delivery/returns truth (collapsed summary + expanded policy);
  "Costs & buyer protection" previews only sheet-owned facts (est. total,
  protection fee, authenticity) and never restates shipping/returns.
- **09 — seller auction row.** Rebuilt into identity → one exact commercial
  value + next task → one quiet wrapping metadata line; media 96→80pt
  (`ThumbSize.lg`); internal hairline and monetary clamps removed. A
  pre-existing divergence between the headline amount (`currentBidGbp > 0`)
  and the meta/a11y amount (`bidCount > 0`) was single-sourced through a new
  `resolvePriceAmount` shared with `resolvePriceText`.
- **10–11 — financial readability.** `CoOwnOrderBook` measures available
  width against fontScale; below the rail threshold levels render as
  structured stacked rows with exact price/units (never abbreviated). The
  imbalance gauge carries visible Bid/Ask labels and a "visible depth"
  scope caption. `AssetMarketSection`'s strip demotes to units-at-best
  while the ladder owns the canonical bid/spread/ask band.
- **12–13 — identity price.** Removed `adjustsFontSizeToFit`, shrink scale
  and font-multiplier caps on the dominant price, basis and context; three-
  state 24h movement (positive/negative/unchanged) with sign-aware rounding
  and a `Number.isFinite` guard — `NaN`/`Infinity` render no pill.
- **14 — trading rules.** Honest wrapping static summary; the stale
  tappable-disclosure comment was corrected and the circuit-breaker claim
  now matches the backend contract (per-order protection cap).
- **15 — provider chips.** Verified already satisfied at HEAD (radio role,
  `selected` state, 44pt `providerChipTarget`, no coming-soon branches);
  connection error text unclamped.
- **16–17 — agent clarity.** Agent rows lead with purpose/setup state from
  real contract fields; `useAgentStudioResources` now tracks per-resource
  `{loading|ok|stale|error}` with per-key request tokens — a single-
  resource retry can no longer strand siblings in `loading`; stale vs
  error vs loading are distinguished, verbatim errors surface in context,
  and both the overview and the affected section carry labeled retries.
- **18–20 — discovery media.** All grid media types share a local
  failure contract (coherent muted tile keyed to the failed URI, no stock
  substitution); verification glyphs use `mediaOverlayText` on a scrim
  backing; `reducedMotion` is applied to media transitions instead of
  being discarded.
- **21–22 — chat accessibility and gesture.** Message bubbles expose
  named `accessibilityActions` (activate/reply/menu plus mirrored media
  actions) wired through `SwipeReplyContext` to the identical reply
  callback; inert bubbles demote to `text` role. Swipe commit lives in
  `onEnd` and unconditional cleanup moved to `onFinalize` (end/fail/cancel/
  interruption); haptics collapsed to one threshold-commit event. New
  strings are keyed under `messaging.messageActions`.
- **23 — portfolio partial recovery.** The banner carries a quiet 44pt
  retry wired to refresh with a busy state, stale-position count, and no
  line clamp; `usePortfolioData` no longer clears the partial qualifier
  when a refresh fails while partial data remains on screen.
- **24 — group permissions.** Geometry-matched three-row skeleton replaces
  the centred spinner; the read-only explanation moved into the intro with
  distinct offline vs authority-denied copy.
- **25 — Design.md v1.10.** Palette reconciled with the runtime token
  contract (status fills vs `*Text` foreground roles, media-overlay roles,
  corrected swatches); added section-owned-inset and no-shrink-dominant-
  value layout rules and gesture-parity/hit-area accessibility rules.

**Parked (rulings):** per-position *missing* counts need a
`failedAssetIds`-style contract `usePortfolioData` does not expose (stale
labeling works via `mark.isStale`); new en.json keys fall back to English
in other locales per the deliberate merge convention; pre-existing
hardcoded a11y strings outside this wave's strings were left for a
dedicated i18n pass.

**Native validation still pending:** no connected device — geometry,
screen-reader and 200%-text claims are source/test-verified, not
device-verified.

**Implementation status: FINDINGS 01–25 IMPLEMENTED — NATIVE DEVICE
VALIDATION PENDING.**
