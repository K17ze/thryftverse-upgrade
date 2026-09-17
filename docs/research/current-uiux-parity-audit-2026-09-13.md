# ThryftVerse — remaining flagship UI/UX gaps

Audit date: 13 September 2026. Starting HEAD: `f0c992ee8c969779bd8623ce1ad742b8bcae3868`. Branch: `feat/product-detail-contract-media-device-closure`.

This evaluates the current working tree, including intervening uncommitted changes. It does not reissue the earlier report against an old screen architecture. Scope: active direct-commerce detail, auction detail/seller rows, co-own detail/order book/disclosures, Portfolio, Agent Studio, discovery tiles and selected chat interactions. This is a code-backed design audit, not a certification of every route or native visual parity. No product code was changed in this audit.

## Overall judgment

The application is considerably closer to a coherent product in architecture and basic composition. Media-led discovery, flat utility structure, focused screen components, real action handlers and progressive disclosure are all present. The remaining gap is **semantic and interaction consistency**: some surfaces have strong geometry while their labels, colors, hidden states or accessibility behavior contradict the decision the user is trying to make.

The best next investment is not more rounded containers, decorative animation, additional badges or another global token replacement. It is to make each surface answer its primary question immediately, then preserve that clarity at large text, during partial failure, after navigation, and with real-world data lengths.

Evidence labels used below:
- **Confirmed:** source establishes the behavior or constraint.
- **Design judgment:** the proposed composition follows from the inspected code; exact visual severity needs a render.
- **Native check:** a test requirement, not a claim that the current screen failed it.

Priority P1 = affects comprehension, trust or access to essential actions. P2 = substantial interaction/composition gap. P3 = finer consistency refinement.

## What already deserves to be preserved

- **Screen decomposition:** Portfolio, auction detail and Agent Studio now delegate to focused feature components. Do not replace those with another monolithic redesign.
- **Discovery composition:** PinterestMasonryGrid uses FlashList masonry, supplied aspect ratios and an explicit feed-unit span model. Prefetch for listing tiles resolves the same sized source used for rendering. This is meaningful product engineering, not cosmetic token adoption.
- **Auction state ownership:** seller statistics use `sellerAuctionBucket`, distinguishing pending results from settled sales. The earlier ended-with-bids = sold error is not an open finding here.
- **Co-own tab interaction:** CoOwnSegmentNav uses an interruptible underline and reduced-motion fallback. Its action dots describe actual pending work rather than decorative activity.
- **Order-book correctness:** asks accumulate depth before presentation reversal; rows have stable price keys and minimum 44pt targets. Keep these fixes.
- **Portfolio hierarchy:** detailed analytics live in Insights; position breakdowns are expandable. Recently fixed unknown supply and per-unit entry labels are not being counted again as new gaps.
- **Direct-commerce conditions:** condition evidence, actual media navigation, purchase details and seller identity have concrete owners. Preserve those capabilities while simplifying duplicate presentation.
- **Chat reply:** the active ChatMessageItem exposes swipe-reply callbacks. Do not claim the app lacks swipe reply merely because a leaf bubble does not implement the gesture itself.

## Reference decisions to borrow — not visual skins

| Department | Relevant benchmark | Transferable decision | Avoid copying |
|---|---|---|---|
| Discovery / saved objects | Pinterest | Media carries identity; saving has a clear collection destination; intent survives detail navigation | Arbitrary masonry heights, universal overlays, identical treatment for every content type |
| Product detail / offers | Depop | Listing identity and the next buying action are easy to understand; offer is an explicit listing-level action | Another brand's typography, all commerce information collapsed indiscriminately |
| Chat | Snapchat | A message has clear contextual reply behavior through gesture and a discoverable alternative | Ephemeral semantics or playful motion that conflict with transaction records |
| Co-own / Portfolio | Robinhood | Quotes, depth, holdings, returns and execution are separate concepts with explicit context | Treating fractional physical assets as liquid equities, or fabricating a performance line |
| Auction / seller operations | Whatnot | Listing management is contextual, with clear inventory and auction actions | Automatic purchase assumptions or urgency behavior without ThryftVerse's actual contract |
| Across the product | Apple HIG / W3C | Controls have truthful state, legibility and platform-appropriate interaction | Forcing a web-specific layout technique directly into native code |

Instagram remains a requested visual benchmark, but this audit did not establish a current primary-source pixel specification or inspect an authenticated native Instagram session. No exact grid-ratio, spacing or motion claim is attributed to Instagram here.

## P1 — fix these before calling the experience production-grade

### 1. Status text does not meet contrast targets in the default palette

**Confirmed.** [frontend/src/constants/colors.ts:54](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/constants/colors.ts:54) retains dark danger `#9b0202` and success `#215634`; the dark background is `#0A0A0A` at line 24. Light warning is `#C47A2E` at line 178. ThemeContext uses these base status values; the accent override is for brand colors.

Computed with the WCAG sRGB luminance formula:
- dark success on the main dark canvas: **2.31:1**;
- dark danger on the main dark canvas: **2.27:1**;
- dark success on `#141414`: **2.15:1**;
- light warning on white: **3.40:1**.

Active uses include AgentStudioStatusOverview and PortfolioPerformersCard. This makes important state look muted or disappear, even though surrounding text has improved contrast.

**Decision:** define separate theme-aware foreground status tokens and subtle surface tokens. Preserve semantic financial up/down colors for signed financial values. Do not lighten every decorative status background indiscriminately.

**Acceptance:** normal status text reaches 4.5:1 on each actual canvas/surface; meaningful non-text indicators meet applicable contrast requirements. Check pressed, disabled and high-contrast modes separately. These calculations are not a full accessibility certification. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)

### 2. Unknown restocking fee becomes a definitive free-fee promise

**Confirmed.** [ShippingReturnsInfo.tsx:82](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/commerce/detail/ShippingReturnsInfo.tsx:82) selects “No restocking fee” for null/omitted values. [ItemDetailBuyingSection.tsx:38](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/itemdetail/ItemDetailBuyingSection.tsx:38) supplies commerce but no restocking fee. The fee row still renders at [ShippingReturnsInfo.tsx:166](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/commerce/detail/ShippingReturnsInfo.tsx:166).

**Why it feels unfinished:** polished commerce UX communicates the limits of the quote precisely. Muted styling does not make an unsupported promise truthful.

**Decision:** unknown means “Not provided” or omit the row; zero means “No restocking fee”; a positive known amount shows its real currency. If the policy is relevant before purchase, expose a genuine policy source and carry it through review.

**Acceptance:** omitted, null, zero and positive amounts render as four intentionally handled inputs; none can silently imply a zero fee. Audit the shared commerce contract and actual checkout policy before changing copy.

### 3. Portfolio's best/worst styling can reverse the meaning of returns

**Confirmed.** [portfolioViewModels.ts:109](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/portfolio/portfolioViewModels.ts:109) ranks by percentage; the best result can still be negative. [PortfolioPerformersCard.tsx:35](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/portfolio/PortfolioPerformersCard.tsx:35) always shows best with an upward success-colored arrow and line 48 forces success color. Worst always uses downward/danger treatment at lines 59 and 72.

**Example:** with returns of −2% and −8%, the −2% holding is legitimately highest-ranked but is presented with a green up arrow. With +2% and +8%, the +2% holding receives a down arrow.

**Decision:** rank labels and financial direction must be separate. Derive arrow/color from the actual signed value; use neutral rank text such as “Highest return” and “Lowest return,” or omit comparative labels when there is only one meaningful position.

**Acceptance:** all-negative, all-positive, mixed, zero and single-position datasets remain semantically correct; screen-reader labels include the actual signed return.

### 4. An active asset can be labelled Closed because the viewer has no available units

**Confirmed.** [portfolioViewModels.ts:136](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/portfolio/portfolioViewModels.ts:136) returns closed when `availableUnits` is zero, even if `isOpen` is true. `PortfolioPositionRow` feeds that result to CoOwnPositionCard; the card's Buy action depends on the status.

**Decision:** separate market state, viewer availability/reservations and trade eligibility. “All your units reserved” is not “Market closed.”

**Acceptance:** an open asset with all viewer units reserved still shows the correct market state; Buy and Sell use their own permissions; paused is preserved where the authoritative contract supports it.

### 5. Agent Studio conflates connection existence with health

**Confirmed.** [AgentStudioStatusOverview.tsx:62](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/agents/AgentStudioStatusOverview.tsx:62) uses success color when `totalConnections > 0`, rather than when the connections are healthy. Its subtitle branches on counts at lines 77–85. The caller separately computes `healthyConnections`, so the distinction is available.

**Example:** 0/2 healthy connections can still receive success styling and a generic ready-sounding explanation.

**Decision:** show an operational sentence: “2 connections need attention,” with a Connections destination. Use healthy, degraded and unavailable states derived from actual results. Reserve the summary's strongest emphasis for work needing action.

**Acceptance:** 0/0, 0/2, 1/2 and 2/2 states have distinct truthful treatments; partial resource failure does not erase the identity of the failing resource.

### 6. Co-own dossier always displays a checked shield

**Confirmed.** [CoOwnDossierRibbon.tsx:87](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/CoOwnDossierRibbon.tsx:87) renders `shield-checkmark-outline` regardless of whether authenticity or insurance exists. Text fragments themselves are conditional, but the icon is unconditional.

**Decision:** a dossier-opening control should use a neutral document/info symbol. Render verification as a distinct, backend-evidenced fact, not as decorative navigation chrome.

**Acceptance:** an asset with no authentication or insurance evidence displays no visually affirmative trust mark. Keep one clear dossier destination.

### 7. Financial disclosure text is less accessible than ordinary product copy

**Confirmed.** CoOwnDossierRibbon caps text at 1.3 and one line (`:96`); CoOwnSegmentNav caps labels at 1.3 (`:211`) with fixed 44pt tab height. Active CoOwnAssetProspectus and CoOwnFeeSchedule also cap important text at 1.3, including risk content. In contrast, the current direct-commerce components widely allow 2.0.

**Decision:** allow larger text and adapt the composition. A compact summary may truncate with an accessible full label, but the destination containing actual fees/risks must remain readable at the user's chosen scale.

**Acceptance:** at 200% text, essential fees and risk paragraphs are readable without clipping; tab labels/actions remain distinguishable; no forced font shrinking is used to conceal layout failure.

## P2 — the fine design decisions still keeping surfaces below the target

### 8. Auction headline places two competing values on one line

**Confirmed constraint; visual severity needs native inspection.** [CommerceDetailTransactionSurface.tsx:234](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/commerce/detail/CommerceDetailTransactionSurface.tsx:234) lays out the price and aside horizontally. Primary value is single-line and can shrink to 78% (`:106`). [AuctionBidPanel.tsx:71](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/auctiondetail/AuctionBidPanel.tsx:71) also keeps the state sentence on one line at price-list scale.

**Decision:** price is the anchor; state is a subordinate, wrapping line on compact or large-text layouts. Do not make a long localized price smaller while a short state keeps its original size.

**Acceptance:** large prices, long currency formats, “Awaiting payment” and large text fit without ellipsizing the financial value. Compare the first viewport in live, outbid and terminal states.

### 9. Auction live-region ownership may announce too frequently

**Confirmed declaration; runtime impact unverified.** [AuctionBidPanel.tsx:72](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/auctiondetail/AuctionBidPanel.tsx:72) marks the primary state text as a polite live region. When presentation supplies a frequently changing countdown, this can create recurring announcements.

**Decision:** expose the readable countdown on focus, but announce meaningful events such as outbid, ending threshold and ended separately. Do not turn every second into an accessibility event.

**Acceptance:** TalkBack/VoiceOver remains usable while the auction clock changes; crossing a genuine state boundary produces one useful announcement.

### 10. Direct product descriptions can hide text without exposing Read more

**Confirmed.** [ItemDetailItemDetails.tsx:109](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/itemdetail/ItemDetailItemDetails.tsx:109) collapses by three rendered lines, but the expansion control is gated by string length >120 (`:126`). A shorter description with several explicit newlines can exceed three lines while the expansion action is disabled.

**Decision:** base truncation affordance on measured text overflow, not character count. Preserve original line breaks; do not assume characters map to lines across locales and font sizes.

**Acceptance:** a 70-character five-line description and long translated text both offer expansion when truncated. No fade or inactive message body hides content without recovery.

### 11. Product purchase information has competing disclosure paths

**Confirmed composition; design judgment.** [ItemDetailBuyingSection.tsx:32](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/itemdetail/ItemDetailBuyingSection.tsx:32) presents “Costs, delivery & protection” with the summary “Full breakdown,” followed by ShippingReturnsInfo, which independently expands overlapping shipping/returns information.

**Decision:** show one useful purchasing summary and one obvious route to the comprehensive breakdown. “Full breakdown” names the interaction but conveys no buying information. Keep shipping/returns inline only if it adds distinct facts rather than a second competing path.

**Acceptance:** the user can identify delivery cost, returns status and any unknown total in one scan; related disclosures use consistent labels and the same underlying contract. Depop's explicit offer action is a useful benchmark for separating the primary transaction choice from supporting explanation. [Depop Make Offer](https://depophelp.zendesk.com/hc/en-gb/articles/4412315779345-Make-Offer)

### 12. Auction description has no length budget before bid history

**Confirmed.** [AuctionDetailInfoSections.tsx:55](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/auctiondetail/AuctionDetailInfoSections.tsx:55) renders the complete description before bid activity, without progressive disclosure.

**Decision:** preserve seller evidence but bound the first description preview. A long seller essay should not move operational history arbitrarily far down a live auction. Use measured expansion as above, retaining meaningful condition/evidence facts separately.

**Acceptance:** 30-word and 1,000-word descriptions have predictable access to latest bid and rules; expanded text is fully reachable.

### 13. Order-book columns can truncate the numbers that matter most

**Confirmed constraint; rendering impact depends on data.** [CoOwnOrderBook.tsx:30](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/CoOwnOrderBook.tsx:30) fixes price at 90pt and size at 80pt. Price, size and cumulative cells use one line (`:301` onward). The row now has a good 44pt minimum, but vertical accessibility improvements do not solve horizontal pressure.

**Decision:** use explicit right-aligned numeric columns with a compact large-text mode. If abbreviated quantities are allowed, show a clearly accessible full value and exact order-ticket value. Never silently shorten a price.

**Acceptance:** six-digit prices, large cumulative quantities and 200% type remain unambiguous. Keep the existing best-price-first accumulation correctness. [Robinhood Level II](https://robinhood.com/us/en/support/articles/level-ii-market-data/?hcs=true)

### 14. Dossier summary prioritizes whatever happens to fit first

**Confirmed layout; design judgment.** CoOwnDossierRibbon joins condition, custodian name/location, insurance, authentication and fee into one single-line fragment string. A long custodian name can crowd out fees and the dossier's scope.

**Decision:** choose the summary deliberately: two high-value facts plus a stable “Dossier” affordance; put the remaining evidence in the destination. The reading order should follow user importance, not source concatenation order.

**Acceptance:** long custodian names cannot hide the existence of fee/risk detail. The whole row remains one disclosure target rather than many tiny chips.

### 15. “Trading rules” is described as a disclosure but implemented as static rows

**Confirmed.** [AssetMarketSection.tsx:734](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/coown/asset-detail/AssetMarketSection.tsx:734) comments describe a tappable disclosure opening a sheet, but the returned structure is non-interactive Views at `:739` onward. It includes an unconditional circuit-breaker statement at `:744`.

**Decision:** either implement a real, clearly named rules destination or document these as static facts. Verify the price-protection statement against the applicable order-type contract; source inspection here establishes unconditional copy, not that the backend lacks protection.

**Acceptance:** any chevron/disclosure language has an actual destination; applicable protections, exclusions and fees can be inspected, and statements are not confused with live health guarantees.

### 16. Seller auction rows contain too many simultaneous reading tasks

**Confirmed structure; design judgment.** [SellerAuctionRow.tsx:86](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/auction/SellerAuctionRow.tsx:86) onward includes title, state, optional brand, internal hairline, 1ZE value, local value, action label/chevron, operational sentence and bid count alongside a 96pt thumbnail.

**Decision:** one identity line/group, one price group and one next-action/status line. Drop a repeated brand only when title already conveys it; move secondary currency or detail into a subordinate position. Do not remove lifecycle/recovery capabilities.

**Acceptance:** scan 4–6 useful rows on a normal list viewport where practical; each row answers item → state → next action. A high bid count must not displace payment/dispatch status. [Whatnot listing management](https://help.whatnot.com/hc/en-us/articles/48441579309837-Manage-your-product-listings)

### 17. Agent selection lacks semantic selected state

**Confirmed.** [AgentStudioConnectionsSection.tsx:97](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/agents/AgentStudioConnectionsSection.tsx:97) renders OpenAI/Custom provider choices with selected fill/border, but the Pressables around `:111` expose button roles without selected/checked accessibility state.

**Decision:** treat a mutually exclusive provider set as radios or a selected segmented control, with the same state in the accessibility tree. Remove dead “coming soon” branches for choices that are no longer offered.

**Acceptance:** assistive technology announces the selected provider and selection changes once; form fields and connection errors remain tied to that provider.

### 18. Agent list metadata says how it is built before what needs attention

**Confirmed presentation; design judgment.** [AgentStudioAgentsSection.tsx:93](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/agents/AgentStudioAgentsSection.tsx:93) assembles runtime mode and version below a truncated name, with a separate truncated status label at `:113`.

**Decision:** default rows should prioritize agent name, purpose or latest actionable issue, and one status. Runtime/provider/version belongs in detail unless it explains a current failure. Keep expert connection settings available in their dedicated tab.

**Acceptance:** a long agent name and setup-required state are intelligible at large text; the list does not resemble a developer configuration dump.

### 19. Look/poster/moodboard images have a different failure contract from listing media

**Confirmed.** [PinterestMasonryGrid.tsx:582](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/discover/PinterestMasonryGrid.tsx:582), `:657` and `:721` implement ExpoImage directly with supplied URI, cover crop and fixed transition. These branches have no local onError/retry/placeholder handling comparable to the richer listing-media path.

**Decision:** keep the existing content-type composition, but align media lifecycle behavior: stable geometry, restrained failed-image treatment, retry if appropriate, and no invisible actionable object. Propagate focal metadata when the contract actually provides it.

**Acceptance:** expired URL, slow fetch and corrupt image are handled for every feed-unit type. Do not invent replacement media. Pinterest's saved-object model supports treating each tile as a meaningful object, not a blank interchangeable card. [Pinterest saving](https://help.pinterest.com/en/article/save-pins-on-pinterest)

### 20. Media verification icons use theme brand color over an image scrim

**Confirmed.** Look/poster tiles use `colors.brand` for verification at [PinterestMasonryGrid.tsx:619](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/discover/PinterestMasonryGrid.tsx:619) and `:694`, while adjacent text uses scrimTextPrimary. The default light brand is near black, despite the lower image area receiving a dark gradient.

**Decision:** use an image-overlay foreground treatment with reliable contrast. Brand colors belong to the canvas context unless a controlled backing makes them legible over media.

**Acceptance:** verification remains visible over black clothing, white backgrounds and saturated imagery in both themes. Existence of the badge must remain backed by the existing verified flag.

### 21. Reduced-motion policy stops at the listing boundary

**Confirmed declaration; effect depends on image implementation.** PinterestMasonryGrid reads reduced motion but the look/poster/moodboard branches still pass `transition={160}` (`:599`, `:674`, `:739`, `:751`).

**Decision:** send the preference through all media tile branches. A static crossfade may be acceptable under a documented policy, but the current contract should not claim an instant fallback while leaving these transitions fixed.

**Acceptance:** one stated image-transition policy across content types, checked on recycled cells and repeat visits.

### 22. Bubble accessibility and nested message actions need a coherent action model

**Confirmed structure; actual traversal needs native testing.** [MessageBubble.tsx:314](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/chat/MessageBubble.tsx:314) gives a long-press-only outer Pressable a button role, while reply references and media are nested Pressables at `:330` and following. The outer control has no ordinary onPress shown in this branch.

**Decision:** expose message content as readable content with named actions; expose reply/media as distinct targets where platform traversal permits. Use the existing swipe-reply implementation rather than adding a competing gesture path. Make reply-reference activation say which original message it opens.

**Acceptance:** double-tap/activate on a focused message does something consistent with its role; Reply is available without a swipe; nested media/reply targets remain reachable without firing unrelated actions. [Snapchat reply alternatives](https://help.snapchat.com/hc/en-us/articles/7012338497172-How-do-I-reply-to-a-Snap-in-Chat)

## Native checks required before judging minute visual parity

These are acceptance questions, not confirmed failures:

- **First viewport:** capture direct item, auction and co-own at the same usable width. Record first useful content Y, dominant object, useful object count and dock occlusion. Do not infer this from comments such as “eliminates 400px.”
- **Typography:** test 1.0, 1.3 and 2.0 scale with real long titles/prices, not only short fixtures. Optical rhythm needs both themes and realistic data.
- **Image crops:** garments, shoes, watches and bags need distinct evidence samples. Cover is not inherently wrong; a particular crop must be judged against its subject.
- **Sheet continuity:** open/dismiss/reopen sheets through back, close, backdrop and gesture; inspect focus restoration and any moment with two sheets active.
- **Input stability:** type, paste, attach media, invoke keyboard and return from permissions. Check composer jump, stale reply context and obscured send actions.
- **Motion:** interrupt tab changes, fast-repeat taps and list refresh. Verify one causal transition rather than multiple independent animations.
- **Color:** test actual composited backgrounds and disabled states, not only token hex values.
- **Recovery:** offline → online, stale market → fresh, pending → unknown outcome → reconciled. The recovery affordance should live next to the affected object.
- **Discovery navigation:** return from detail to the exact tile/scroll position; verify the saved state and collection destination remain consistent. [Pinterest board organization](https://help.pinterest.com/en-gb/article/boards)

No populated native reference comparison was performed in this audit. The preceding runtime attempt bundled the app but stopped at authentication with the local backend unavailable. Source checks cannot establish animation feel, touch ergonomics, actual clipping or app-wide aesthetic equivalence.

## Recommended execution order

1. **Trust/readability:** findings 1–7. These are the highest-value changes and several have deterministic data fixtures.
2. **Shared financial layout:** findings 8–9 and 13, plus correctly signed Portfolio insight presentation. Fix the owner primitive and verify each consumer.
3. **One purchasing information path:** findings 10–12 and 14–15. Preserve all evidence and actions while eliminating ambiguous disclosure hierarchy.
4. **Operational lists:** findings 16–18. Optimize scan order and resource-specific recovery.
5. **Media/chat parity:** findings 19–22, with native behavior checks against the user's ongoing changes before editing.
6. **Rendered refinement:** apply the native checklist and iterate. Accept a department only with its worst relevant states, not merely a successful default screenshot.

Do not implement all changes as one undifferentiated global redesign. Use narrow, reviewable surface passes and retain the successful current architecture.

## Audit validation and limitations

- Read active screen imports and relevant component implementations; distinguished recently closed findings from remaining ones.
- Inspected current working-tree changes instead of assuming the earlier report was still accurate.
- Calculated the four reported contrast ratios directly from the current palette.
- Researched public primary documentation from Robinhood, Pinterest, Depop, Snapchat, Whatnot, Apple and W3C. Search snippets do not establish proprietary implementation details or exact visual measurements.
- No automated UI tests, benchmarks or full backend audit were executed for this report. No application source changes were made.
- Report completeness is bounded to the inspected paths; it is not an exhaustive catalog of every tiny defect in the repository.
- Self-review: strongest evidence is in deterministic semantic/contrast findings; weakest evidence is aesthetic severity without populated native captures. Those judgments are labelled rather than presented as measured failures.

The next quality jump comes from making these small decisions agree with one another. The code already has much of the necessary capability; it still needs one consistent standard for what a value, status, disclosure and interaction means.
