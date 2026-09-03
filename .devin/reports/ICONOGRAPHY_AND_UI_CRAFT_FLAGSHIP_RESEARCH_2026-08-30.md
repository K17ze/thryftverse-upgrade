# ThryftVerse — Iconography and UI Craft: Codebase Research and Upgrade Plan

**Research date:** 30 August 2026

**Scope:** The four supplied icon crops, current production UI source, current Design.md, icon dependencies, and the surrounding layout/interaction patterns that make otherwise competent icons feel generic.

**Deliverable:** Research and implementation recommendations, not an implemented redesign.

**Workspace:** C:/Users/User/Desktop/thryftverse-upgrade

**Branch:** feat/product-detail-contract-media-device-closure

**Starting and observed HEAD:** e5b615f9c83e4171b84a6980a1231f005c8016dc

**Working-tree qualification:** Existing uncommitted implementation changes were present. Findings describe the working files inspected, not just that commit. Line numbers can drift as ongoing work continues.

---

## 1. Decision in plain language

The user’s objection is justified as a craft problem. The current system can be consistent in package choice and still look like a stock application.

**A paid icon pack is not necessary. A new package alone will not solve this.** The app already has a mainstream vector family and a custom SVG renderer. What is missing is a sufficiently enforced relationship between glyph shape, optical weight, task meaning, text, row density, selected state, and placement.

There are two different decisions:

1. **Maintenance:** Plan the migration from `@expo/vector-icons` to the scoped, family-specific `@react-native-vector-icons/ionicons` package. Expo’s July 2026 documentation now advises against the wrapper; its June 2026 announcement recommends family-specific packages. This is a dependency-maintenance recommendation, not a promise of better-looking drawings. [Expo icon guidance](https://docs.expo.dev/guides/icons/), [Expo migration announcement](https://expo.dev/blog/moving-away-from-expo-vector-icons).
2. **Art direction:** Correct the existing family in a tightly scoped native comparison, with **Phosphor regular/bold/fill as the first challenger** and Lucide as an optional utility-focused challenger. Choose after comparing real Seller Hub rows, header controls, and media overlays. Do not install three permanent families or declare a winner from a package homepage.

The most urgent visual change is not a more elaborate compass. It is restoring the relationship between small glyphs and the large amount of space surrounding them.

### Recommended order

- Correct row geometry and icon roles.
- Correct misleading metaphors and state semantics.
- Establish an optically balanced comparison sheet and complete screen pilot.
- Decide whether corrected Ionicons is sufficient or a different family materially improves the product.
- Execute dependency migration and any family migration as separate, verifiable changes.
- Extend the winning system through actual shared primitives and then department-specific controls.

**Do not respond to “bare” by adding a pastel square, gradient, shadow, or circle behind every icon.** Some containment is useful; decorative containment everywhere would reintroduce the problem the user is trying to remove.

---

## 2. Evidence boundaries

### What was actually inspected

- All four supplied image crops.
- A TypeScript-AST inventory of 1,309 non-test TS/TSX files under frontend/src.
- Shared navigation rows, settings rows, headers, icon tokens, custom creator glyphs, creator control consumers, seller navigation, media indicators, AI-provider identity mappings, and selected high-use screens.
- The current Design.md icon and control specifications.
- Official package documentation, package-maintainer documentation, public design-system guidance, and W3C guidance.

### What is not established

- These narrow crops do not provide a complete screen, device density, accessibility scale, app build identifier, or native layout measurement.
- The compass crop cannot be uniquely assigned to one route.
- The white tag crop has several plausible production sources.
- No new native application capture, gesture test, release bundle measurement, or screen-reader session was performed in this research pass.
- No claim is made that Pinterest, Snapchat, Instagram, Coinbase, or Corner use a particular commercial icon pack.
- This report does not claim screen-by-screen access to subscription-only Mobbin galleries. The public Coinbase component documentation is a primary reference, not evidence of every Coinbase mobile screen.
- Repository-wide source inventory is broader than repository-wide interaction validation. It identifies migration coverage; it does not certify every rendered icon.

### Evidence labels used below

| Label | Meaning |
|---|---|
| Observed | Visible in the supplied crop |
| Source-confirmed | Directly present in inspected code |
| Derived | Calculated from source geometry or token values |
| Candidate | Plausible source match, not unique identification |
| Proposed | A design/engineering recommendation requiring implementation and validation |

A comment saying “flagship,” “matched optical weight,” or “enforced” is not visual evidence.

---

## 3. The four screenshots, individually

### Image 1 — Small compass on a white canvas

**Observed:** A fine outline compass, isolated from its label and surrounding screen.

The problem visible here is modest optical presence, not proven poor vector quality. A circular outer boundary and a small internal needle distribute relatively little ink across the available area. Enlarging the outer frame does not necessarily make the needle easier to read.

**Source candidates:**

- [HomeScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/HomeScreen.tsx:1136): a compact compass empty-state treatment.
- [UnifiedDiscoveryScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/UnifiedDiscoveryScreen.tsx:470): a discovery empty state.
- [FeedExplanationSheet.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/algorithm/FeedExplanationSheet.tsx:75): an exploratory recommendation explanation.
- Onboarding also uses the metaphor.

The main Explore tab uses a search metaphor in [TabNavigator.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/navigation/TabNavigator.tsx), so this crop must not be reported as proof that the bottom tab compass is undersized.

**Upgrade decision:**

- If this is a navigation action: use a 22–24pt optically balanced drawing inside the existing practical target.
- If it is a compact empty-state ornament: test whether it adds useful meaning at all. A precise sentence and relevant action may carry the state better.
- If it indicates discovery rather than search: retaining a compass is reasonable, but assess the outer circle and needle together.
- Do not use a generic compass to label unrelated experiences merely because it looks editorial.
- Do not turn every compass into a filled circle. Test the filled variant only where its role and family support it.

**Acceptance:** At actual device size, the metaphor is recognizable without zooming; its weight belongs with neighbouring text/icons; it does not become the screen’s dominant object.

### Image 2 — White filled price tag over media

**Observed:** A small filled white tag in a rounded image corner. The crop does not show whether the tag is interactive.

**Candidate implementations:**

| Candidate | Source treatment |
|---|---|
| [PinterestMasonryGrid.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/discover/PinterestMasonryGrid.tsx:499) | Filled tag, size 15, top-right, shown when itemIds is non-empty |
| [LookMasonryTile.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/look/LookMasonryTile.tsx:84) | Tag treatments around size 14 in different tile variants |
| [LooksTab.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/explore/LooksTab.tsx:122) | A smaller tag treatment |
| [ClosetMediaMosaic.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/closet/ClosetMediaMosaic.tsx:203) | A very small tag treatment |
| [PosterStickerLayer.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/poster/PosterStickerLayer.tsx:676) | Product-tag rendering in poster content |

These are not five confirmed sources for the same screenshot. They show how the same meaning is currently expressed at different scales and in different contexts.

In the masonry candidate, the gradient protects lower caption content; it does not establish reliable contrast behind the top-right tag. White on a light garment or pale sky can disappear.

**Upgrade decision: separate indicator from action.**

- **Indicator:** Keep it small, approximately 14–16pt, with a purpose-built local contrast treatment if needed. The parent tile should announce shoppability and the meaningful product count. It does not need its own 44pt visible button.
- **Independent shop action:** Give it a non-overlapping practical target, an explicit action label, and a 16–20pt glyph. Ensure it does not accidentally open the general tile destination.
- Use one product-tag drawing per equivalent context.
- Preserve location consistency across related media cards.
- Test the tag against bright, dark, patterned, and low-quality media.
- Keep the media corner radius and tag inset independent: neither should be derived by eye from an arbitrary screenshot crop.

**Acceptance:** The tag remains legible, does not cover the product’s focal point, and communicates the same action/status everywhere it appears.

### Image 3 — Shield, green check, seller metrics, catalogue import

**High-confidence source match:** [SellerHubScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/SellerHubScreen.tsx:242). The verification banner, caught-up check, Gross/Net metrics, and Catalogue section align with the crop.

Important correction: the pale orange shape is a cropped portion of a verification banner. The image does **not** establish that the app has an isolated oversized orange icon tile.

**Source-confirmed issues:**

- The not-verified prompt uses `shield-checkmark-outline`, even though it asks the seller to become verified.
- The same checked-shield metaphor appears on the verification destination.
- Catalogue import uses a cube, which resembles inventory or a parcel more than an import operation.
- Multiple semantically different objects are represented with small outlines of similar visual weight.

The verification boolean is derived from `sellerTrust?.verified === true`, not a hardcoded success. Preserve that useful fact. However, the banner condition is simply `!isVerified`; it does not independently prove a capability is blocked, and an unresolved trust response can be visually conflated with unverified unless the screen’s surrounding loading/error treatment prevents it.

**Upgrade decision:**

- Use an identity/document metaphor for “Verify identity.”
- Use a verified mark only when verified status is actually evidenced.
- Distinguish loading/unknown, action required, pending review, verified, and unavailable states.
- Use amber only for a genuinely actionable caution, not as a permanent upgrade advertisement.
- Use an import/tray-arrow metaphor for catalogue import, while retaining parcel/cube semantics for shipments or physical inventory.
- Keep the green caught-up check quiet and contextual; do not make a status symbol visually compete with the money information.

**Acceptance:** A user cannot mistake an invitation to verify for proof of verification. A user can distinguish catalogue import from inventory browsing without memorizing arbitrary symbols.

### Image 4 — List, grid, chart, trophy, wallet, shield

**High-confidence source match:** Seller Hub’s Manage listings, Inventory dashboard, Analytics, Auctions, Payouts, and Verification rows.

This is the clearest example of “bare but overdone”:

- The icons themselves are small and quiet.
- The vertical allocation around them is large.
- Rows add descriptive text and section structure while offering little visual differentiation.
- The trophy communicates winning more naturally than managing auctions.

The fix is not “make all icons 28pt.” It is to give a **22pt leading glyph, readable label, concise useful secondary information, and appropriately dense row** a coherent relationship.

Suggested semantic mapping:

| Destination | Existing metaphor | Proposed meaning |
|---|---|---|
| Manage listings | List | Keep a clear list/listings metaphor |
| Inventory dashboard | Grid | Keep grid/inventory if distinct from listings |
| Analytics | Chart | Keep a chart; simplify detail at small sizes |
| Auctions | Trophy | Use a recognizable auction/bidding metaphor; trophy reserved for a genuine won result |
| Payouts | Wallet | Keep if destination is the wallet; use payout arrow/account semantics only if destination changes |
| Verification | Checked shield | Identity/verification process; verified mark only for evidenced state |

Do not change a route or label merely to fit the most attractive icon in a pack.

---

## 4. Inventory: what the repository actually uses

### Declared dependencies

[frontend/package.json](C:/Users/User/Desktop/thryftverse-upgrade/frontend/package.json) declares:

| Dependency | Declared version | Relevance |
|---|---|---|
| @expo/vector-icons | ^15.1.1 | Current general icon wrapper |
| react-native-svg | 15.15.4 | Existing SVG rendering capability |
| expo | ~57.0.15 | Current declared Expo SDK |
| react-native | ^0.86.2 | Native compatibility constraint |
| expo-font | ~57.0.1 | Font-loading path |
| @expo/ui | ~57.0.12 | Native UI capability already declared |

Lucide, Phosphor, expo-symbols, and the scoped RNVI Ionicons package are not direct dependencies in this manifest. These are declarations, not a claim that every resolved installed version or peer relationship has been validated.

### Production-source AST inventory

Method: enumerate frontend/src TS/TSX with rg; exclude __tests__, .test, and .spec files; parse imports and JSX with the local TypeScript compiler API.

| Measure | Count |
|---|---:|
| Source files scanned | 1,309 |
| Files importing @expo/vector-icons | 563 |
| Ionicons JSX sites | 2,330 |
| CreatorGlyph JSX sites | 7 |
| Total JSX sites in these two renderers | 2,337 |
| Sites using numeric literal size | 1,855 |
| Sites using IconGrammar size expression | 345 |
| Sites using other size expressions | 137 |
| Sites without explicit size | 0 |
| Distinct numeric literal size values | 27 |

Approximately 79.4% use numeric literal sizes; approximately 14.8% use IconGrammar expressions.

**Interpretation:** A size-token system exists, but it is not the dominant authoring path. The scan found Ionicons as the general imported family, not a patchwork of Feather, FontAwesome, Lucide, and Phosphor.

This contradicts the diagnosis “the app looks bad because it mixes lots of icon packages.” It also qualifies older repository claims that icon-size normalization is complete.

### Literal-size distribution

| Size | Sites | Size | Sites | Size | Sites |
|---|---:|---|---:|---|---:|
| 8 | 3 | 9 | 3 | 10 | 27 |
| 11 | 30 | 12 | 165 | 13 | 60 |
| 14 | 226 | 15 | 33 | 16 | 375 |
| 17 | 12 | 18 | 286 | 19 | 4 |
| 20 | 215 | 21 | 5 | 22 | 148 |
| 24 | 81 | 25 | 1 | 26 | 17 |
| 28 | 61 | 30 | 1 | 32 | 34 |
| 36 | 10 | 40 | 16 | 48 | 24 |
| 56 | 10 | 64 | 4 | 100 | 4 |

A literal size is not automatically a defect. Metadata, a full-size empty-state pictogram, a navigation glyph, and a media annotation are different roles. Conversely, replacing every number with the nearest token would not prove visual parity.

Counts describe source sites, not rendered instances. A reusable row can render hundreds of times; data-driven icon names are not expanded into separate JSX counts. Aliased/custom renderers beyond the two identified names are not claimed as completely enumerated.

### High-concentration review queue

| Source | Ionicons/CreatorGlyph sites | Why review it |
|---|---:|---|
| CreatorAssetPicker | 62 | Repeated controls, selection, media metadata |
| SellScreen | 43 | Capture, listing assistance, action hierarchy |
| EditListingScreen | 31 | Form and media consistency |
| GlobalSearchScreen | 30 | Scope, search, filter and AI semantics |
| CreatorCanvas | 21 | Tool recognition and direct manipulation |
| AIAgentIntegrationScreen | 20 | Provider identity and connection states |
| ListingSuccessScreen | 19 | Avoid oversized generic success decoration |
| LookDetailScreen | 18 | Media actions and overlays |
| CreatorPublishSheet | 17 | Pending, failure, progress and publish controls |
| CheckoutScreen | 17 | Trust, payment and ambiguous-outcome semantics |
| BrowseScreen | 17 | Filter, save, discovery consistency |
| ListingMediaStudio | 17 | Crop/rotate/capture grammar |

These counts prioritize inspection. They do not justify rewriting all these screens in one commit.

---

## 5. Root cause A: shared row geometry makes the icons look weaker

### FlagshipNavigationRow

[FlagshipNavigationRow.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/flagship/FlagshipNavigationRow.tsx:98) uses:

- Leading glyph: Control.iconCompact = 18.
- Default tint: textSecondary.
- Internal content row minimum: 44.
- Outer vertical padding: 12 + 12.
- Default separator top margin: 12.
- Hairline separator.
- Icon-to-text gap: 8.

For a normal separated row with no extra children, the source-derived minimum is approximately:

**44 + 24 + 12 + hairline = 80pt plus hairline.**

For the same row without a separator, it is approximately 68pt. The public minHeight default of 44 does not make this a 44pt row because the child minimum and padding already exceed it.

This is a layout diagnosis, not a measured native screenshot height.

### Why it reads poorly

A small 18pt outline is placed inside a row that can occupy approximately 80pt. The eye reads “small miscellaneous symbol floating in a large allocation” rather than “purposeful navigation item.”

A larger icon alone could balance the empty space, but it would preserve the unnecessarily tall structure. Fix the allocation first.

### Separator alignment defect

The separator sits inside an already horizontally padded inner view. Its additional left margin includes Space.md again:

- Text starts at outer padding 16 + icon 18 + gap 8 = 42.
- Separator starts at outer padding 16 + margin 42 = 58.

Under default props, the separator is therefore approximately 16pt farther right than the intended text edge. No-icon rows also need their own correctly derived inset.

**Proposed owner-layer correction:**

- Make the row own its total minimum height.
- Use approximately 56pt for one-line and 64–68pt for two-line rows as initial Design.md-compatible pilot values, not rigid clipping heights.
- Allow growth for large text and localization.
- Use a 22pt leading glyph in a stable 24pt decorative slot.
- Use a consistent 10–12pt icon/label gap chosen for this row family.
- Derive separator inset from the actual text column once, without double-counting parent padding.
- Keep trailing chevrons at 16–18pt.
- Preserve every route, callback, disabled state, and useful subtitle.

There is also an accessibility verification need: the non-tappable/disabled branch returns the visual content without the labeled pressable wrapper. Confirm that disabled controls retain understandable semantics rather than simply ceasing to be announced as controls.

### SettingsRow

[SettingsRow.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/settings/SettingsRow.tsx:91) uses a different structure:

- Glyph: 24.
- Decorative icon wrapper: 44 × 44.
- Outer vertical padding: 24 total.
- Declared row minimum: 56.
- Chevron: 20.
- Negative left margin on the icon slot.

That produces an icon-bearing row with a source-derived minimum of approximately 68pt before any larger content.

The 44pt child View is described in a comment as a touch target, but it has no independent action. The parent row is already the press target. This is an accessibility principle applied to the wrong layer.

**Proposed correction:** Retain a full-size row target; reduce only the decorative slot. Keep 44pt or larger for independently tappable trailing controls.

Do not conflate navigation rows, switches, and text/value rows into an over-configurable universal component. Share geometry where their hierarchy is equivalent; preserve purposeful differences.

---

## 6. Root cause B: the design specification still permits inconsistent interpretations

The current [Design.md](C:/Users/User/Desktop/thryftverse-upgrade/Design.md:829) has several strong principles, but they do not yet form one executable icon contract.

| Current specification | Problem | Proposed report-to-spec update |
|---|---|---|
| Settings icon area is 44pt square | Confuses decorative column with independent target | Decorative slot around 24pt; whole row owns target; 44pt applies to independent actions |
| Standard inline icon 20–24pt | “Inline” also includes smaller metadata elsewhere | Name roles explicitly: navigation, leading row, inline metadata, indicator, pictogram |
| Use Ionicons/project mappings | Package choice can be mistaken for complete quality control | Specify optical board, meanings, variants, and migration ownership |
| Outline default / filled active in token comments | Does not describe a filled static product indicator or verified status | Fill can encode state or an approved role; never infer action state from fill alone |
| Selection never changes family stroke weight | Good consistency principle, but requires selected-shape rules | Keep surrounding stroke language stable; use a designed fill, underline, or selection marker |
| “All hardcoded sizes migrated” in historical charter notes | Current source inventory does not support repository-wide completion | Replace retrospective claims with dated scope/evidence, not another blanket claim |

No changes to Design.md were made in this research pass. These are proposed corrections to apply alongside the implementation, so the same geometry mistake is not reintroduced by a future contributor.

### Suggested replacement policy

> An icon’s interaction target, decorative slot, optical bounds, and vector viewBox are separate measurements. The parent action owns accessibility geometry. A decorative leading icon does not acquire a 44pt column solely because interactive buttons require practical targets. Equivalent roles share family, optical weight, size band, alignment, and state grammar. Documented optical exceptions are permitted; arbitrary per-screen styling is not.

### Do not enforce the wrong thing

[designTokens.ts](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/theme/designTokens.ts:469) supplies useful size bands, but its filledStates list includes outline names and has no production reader found by symbol search. It is not an implemented state machine.

Do not expand that list and call the result state consistency. Prefer explicit semantic pairs at the actual consuming controls, such as saved/unsaved, sound-on/muted, and visibility-on/hidden.

---

## 7. Root cause C: “one family” is not “one optical language”

The visible result depends on more than the icon’s nominal size:

1. Vector coordinate system.
2. Actual ink bounds inside that system.
3. Stroke width after scaling.
4. Curves, terminals, internal negative space, and detail.
5. Relationship to the adjacent typeface and weight.
6. Contrast against the actual surface.
7. Rasterization at device density.
8. Static, selected, disabled, and pressed treatments.

A 22pt square grid, a 22pt narrow chevron, and a 22pt circular compass do not necessarily appear equally large. Their boxes can match while their visual mass differs.

### What to measure in the pilot

For the high-frequency glyphs, record:

- Nominal frame.
- Approximate visible bounds.
- Optical center adjustment, if required.
- Stroke treatment at 16, 22, and 24pt.
- Default and selected silhouettes.
- Adjacent 15–16pt text.
- Light/dark and media-background behavior.

Allow small documented per-glyph optical adjustments in the owner mapping. Do not scatter translateX/translateY patches through hundreds of screens.

Carbon’s public icon guidance explicitly treats size relative to typography, center alignment, monochrome color, and interaction target padding as connected concerns. Its particular sizes are tuned to IBM Plex; the relevant lesson is the relationship, not copying IBM’s measurements into Inter without inspection. [Carbon icon usage](https://carbondesignsystem.com/elements/icons/usage/).

### Important technical distinction

Ionicons rendered as a font cannot be meaningfully re-authored by setting React Native fontWeight. Likewise, the Ionicons web component’s CSS stroke control is not an API for the current React Native font renderer.

For controllable stroke geometry, use an SVG renderer with an appropriate asset or a family that exposes supported weight/stroke controls. [Ionicons usage](https://ionic.io/ionicons/usage).

### Contrast does not explain everything

Base light tokens currently include textSecondary #666666 and textMuted #6C6C6C. Their calculated contrast against white is approximately 5.74:1 and 5.25:1. The base dark equivalents also exceed 3:1 against the base dark canvas.

These calculations do **not** prove every rendered icon passes:

- ThemeContext has increased-contrast overrides.
- Press/disabled opacity affects appearance.
- A media background is not a solid token.
- Thin anti-aliased geometry may look weaker than its nominal color ratio implies.
- The supplied screenshot may not represent the current working-tree palette.

W3C requires 3:1 for visual information needed to identify controls/states and explicitly discusses thin anti-aliased shapes appearing fainter despite nominal contrast. Decorative or redundant graphics have different applicability. Do not falsely report all secondary-gray icons as contrast failures. [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast).

---

## 8. Package decision matrix — researched 30 August 2026

| Option | What it actually improves | Limits / risks | Recommendation |
|---|---|---|---|
| Correct current Ionicons usage | Lowest visual migration cost; existing familiar metaphors | Font-rendered stroke cannot be freely tuned; some metaphors need review | Mandatory baseline in pilot |
| Scoped RNVI Ionicons | Modern family-specific dependency path; cleaner maintenance | Same family is not automatically a redesign; font/version collisions during migration | Recommended maintenance work |
| Lucide React Native | SVG geometry, explicit strokeWidth, predictable utility language | Outline-heavy character can still look generic; arbitrary fill is not a designed selected variant | Optional challenger |
| Phosphor React Native | Regular/bold/fill and other designed weights; useful state range | Community adapter; bundle/import and compatibility checks required | First visual challenger, not automatic installation |
| Reviewed Phosphor core SVG subset | Direct control over selected assets using existing SVG capability | Local asset maintenance and license notices; avoid hand-copy drift | Alternative to runtime adapter |
| expo-symbols | Platform symbols with OS-aware rendering | SDK 57 docs label API beta; platform mapping and availability need testing | Consider for native/system surfaces only |
| Custom authored glyphs | Distinct product meanings and brand character | Most expensive to author and validate consistently | Limited exceptions, especially creator tools |

### A. Scoped RNVI Ionicons

The upstream package provides family-specific imports and a static-font option. Select one loading strategy compatible with the actual Expo build, then verify cold launch, offline launch, native release builds, and updates. Do not install the old unscoped react-native-vector-icons package as the supposed modernization. [RNVI Ionicons package](https://github.com/oblador/react-native-vector-icons/tree/master/packages/ionicons).

The migration must inspect imports in source, tests, mocks, icon-name types, config, and transitive dependencies. Expo warns that mixing font versions/packages for the same family can produce incorrect or missing glyphs. It also says not to manually add scoped RNVI node_modules font paths to the expo-font config plugin. Any bundle saving must be measured here, not copied from Expo’s example. [Expo migration announcement](https://expo.dev/blog/moving-away-from-expo-vector-icons).

**Verdict:** Recommended maintenance, independent of whether Ionicons wins the visual comparison.

### B. Lucide

The official React Native package uses react-native-svg and exposes size, strokeWidth, and absoluteStrokeWidth. Its documented defaults are size 24 and strokeWidth 2; the current declared SVG major in this repo is within the guide’s supported major range, but exact peer/build compatibility still needs verification.

Use curated imports. The documentation warns against an import-all dynamic component because it pulls in the entire module set. Do not assume web bundler tree-shaking behavior automatically proves Metro bundle results. [Lucide React Native](https://lucide.dev/guide/packages/lucide-react-native).

**Verdict:** A strong utility candidate, not a universal “premium” stamp. Test key filled/selected needs before choosing it as the product family.

### C. Phosphor

The community React Native adapter provides six weights, including regular, bold, and fill. Its current README warns that barrel imports can include the full set without tree-shaking. It documents per-icon imports and notes that an imported icon carries all its weights. Its current naming uses an Icon suffix.

Treat those import details as version-sensitive; verify the installed package exports. Do not copy internal build paths or enable experimental bundler behavior across the application merely to make one icon trial convenient. [Phosphor React Native maintainer documentation](https://github.com/duongdev/phosphor-react-native).

**Verdict:** First challenger because designed weight/filled variants directly address this complaint. Default to regular; use bold only where the entire relevant region has been evaluated. Avoid thin/light for small navigation. Duotone is not the default remedy for bare UI.

A pinned, reviewed subset from the official core assets can instead be rendered through the existing SVG infrastructure. Preserve the upstream license and asset provenance. [Phosphor core](https://github.com/phosphor-icons/core).

### D. Native symbols

Current Expo SDK 57 documentation describes expo-symbols as using SF Symbols on Apple platforms and Material Symbols on Android/web; it still marks the API beta. Describing it as iOS-only would be outdated. Platform-specific names, fallback availability, and rendered behavior require explicit testing. [Expo Symbols](https://docs.expo.dev/versions/latest/sdk/symbols/).

Material Symbols offer weight, fill, grade, and optical-size axes. These are useful design controls, not permission to combine five unrelated treatments in one viewport. [Material Symbols guide](https://developers.google.com/fonts/docs/material_symbols).

The app’s existing TabNavigator uses React Navigation, not an automatic Expo Router NativeTabs conversion path. Do not re-architect navigation merely to try native glyphs.

**Verdict:** Optional system integration, not a wholesale shortcut to branded application quality.

### E. What not to import

- A huge multi-family package solely to make the icon picker larger.
- A web-only icon package into native screens.
- PNG screenshots of competitor icons.
- A brand-logo pack as a substitute for ordinary UI semantics.
- Lottie animations for routine buttons.
- A second full icon family without a migration boundary.
- A new abstract “UniversalPremiumIcon” wrapper that has no live consumers.

MIT/ISC-family packages reduce procurement cost; they do not remove attribution, versioning, or brand/trademark obligations. This report does not prescribe exporting Apple symbol assets to non-Apple platforms.

---

## 9. Proposed icon role contract

These are **pilot defaults**, not externally certified dimensions or final native measurements.

| Role | Glyph / slot proposal | Target ownership | Tint and state | Containment |
|---|---|---|---|---|
| Header Back/Close/Search/More | 22–24pt glyph in stable frame | Independent 44pt minimum practical target | Primary foreground; restrained press | Transparent at rest |
| Bottom navigation | Around 24pt; optically corrected set | Existing full tab target | Explicit selected/unselected pair | Existing nav architecture |
| Leading navigation row | 22pt glyph, approximately 24pt decorative slot | Whole 56pt+ row; grow with content | Match label hierarchy, not disabled-looking | None |
| Metadata | 14–16pt; simplified at small scale | Parent content/action | Secondary foreground | None |
| Trailing disclosure | 16–18pt | Parent row | Quieter than destination/value | None |
| Media indicator | 14–16pt | Parent tile, unless independent action | Inverse with verified local contrast | Minimal backing if needed |
| Media action | 20–24pt | Independent 44–48pt | Inverse; clear disabled/selected treatment | Local scrim only where needed |
| Creator tool | 22–24pt; simpler internal detail | 44–48pt control | Stable selected shape/marker | One selected treatment |
| Status/trust | 14–18pt with text where needed | Usually noninteractive | Evidence-driven status color | Only a real status boundary |
| Empty-state pictogram | 28–40pt, or no pictogram | Separate CTA target | Supporting, not dominant | No obligatory badge |
| Brand/provider identity | Approved artwork / wordmark | Identity row if actionable | Brand policy, restrained placement | No fake generic logo |

### Optical weight policy

- Start with one normal weight per region.
- Compare 22pt navigation to the actual adjacent typeface, not a generic design-tool label.
- Keep selected variants related to the unselected silhouette.
- Do not synthesize a bold icon using shadows, duplicate paths offset by fractions, or fontWeight.
- Do not increase all icon sizes because one complex drawing collapses at 16pt; use a simpler small-size drawing.
- Do not scale glyphs with the same multiplier as large accessibility text if this makes toolbars overflow. Keep controls reachable and adapt layout deliberately.
- Review RTL for directional arrows. Do not mirror clocks, letters, product logos, or media-play symbols indiscriminately.

### Color policy

Three practical foreground roles are enough for ordinary UI: primary utility, secondary metadata, and inverse media. State colors are additional semantics, not decorative accents.

Use color to distinguish pending/warning/error/success only when those distinctions are backed by the state machine. A selected action must not depend on hue alone.

### Typography relationship

- Leading row icons center against the content block.
- Inline symbols need cap-height/optical alignment appropriate to the text.
- Multi-line rows must specify whether the icon follows the first line or the whole block.
- Avoid one blanket “baseline-align every icon” rule. Different layouts need different optical anchors.
- Keep secondary text because it clarifies a destination or state, not because every row template has a subtitle property.

---

## 10. Semantic cleanup across the codebase

### Product semantics before library names

Maintain a compact reviewed vocabulary such as back, close, search, filter, sort, save, share, import, inventory, payout, verifyIdentity, verified, retryUpload, and productTag.

The semantic vocabulary should describe user intent. It should not expose arbitrary backend strings as icon names.

A typed mapping is useful only if it is immediately consumed by canonical components. The repository has previously removed a dead SemanticIcon/iconRegistry abstraction; do not recreate an unused architecture.

### Concrete correction queue

| Evidence | Problem | Proposed correction |
|---|---|---|
| Seller Hub Auctions uses trophy | Outcome icon used for a management destination | Auction/bid metaphor; preserve trophy for won result |
| Seller Hub import uses cube | Same metaphor competes with shipment/inventory | Import tray/arrow, with text retained |
| Unverified prompt uses checked shield | Visual suggestion of achieved trust | Identity process symbol; evidence-backed verified variant |
| [aiProviderApi.ts](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/services/aiProviderApi.ts:108) maps OpenAI to cube, Anthropic to chat bubbles, Gemini to globe | Generic symbols masquerade as provider identity | Approved provider artwork where permitted, or strong plain provider names |
| [AIAgentIntegrationScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/AIAgentIntegrationScreen.tsx:1017) casts config.icon as any | Icon contract bypassed | Typed identity/semantic mapping; no arbitrary icon-name cast |
| [categories.ts](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/constants/categories.ts:148) uses rocket for skateboards | Novelty metaphor unrelated to actual object | Correct category image/glyph or plain label |
| [GlobalSearchScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/GlobalSearchScreen.tsx:911) uses sparkles for a search mode | Magic metaphor does not explain search behavior | Explicit mode name and relevant search/scan symbol |
| [SellScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/SellScreen.tsx:893) uses sparkles | Generic AI decoration | Describe the actual assistive action, retaining useful disclosure |
| [ChatAgentPicker.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/chat/ChatAgentPicker.tsx:191) uses sparkles for agent identity | Agents look interchangeable | Real saved identity/avatar or restrained initials plus agent label |
| ChatActionSheet and messageContextMenuCapabilities contain sparkles | Action semantics drift between definitions and renderer | Update the owner action definition and consuming sheet together |
| [LookDetailScreen.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/screens/LookDetailScreen.tsx:841) uses a larger sparkle | Decorative hierarchy competes with authored media | Review the surrounding state/action, not just the icon name |

Do not replace every sparkle with a lightbulb. That merely changes the generic metaphor. “Suggest a title,” “Remove background,” “Find similar,” and “Describe this image” are different tasks.

User-authored decorative stickers are a different category. A sparkle that a creator deliberately adds to a poster is not equivalent to a misleading product-control metaphor.

### Psychology, with appropriate limits

The following are design hypotheses, not claimed conversion uplifts:

- **Recognition:** Clear metaphors reduce the need to read every row repeatedly.
- **Learned consistency:** One meaning repeated consistently lets users reuse prior knowledge.
- **Visual grouping:** Tight icon/label association makes the row feel authored; excessive distance makes it feel assembled.
- **Signal priority:** Reserve color and fill for meaningful states so they remain informative.
- **Trust calibration:** A verified mark creates an expectation of evidence; using it on an unverified prompt weakens the distinction.
- **Agency:** Explicit action names make AI assistance understandable and reversible; magic symbols obscure what will happen.
- **Perceived quality:** Stable geometry and response communicate care more reliably than extra decoration.

Test these hypotheses through task recognition and error observations, not fabricated percentages.

Consistent identification is also an accessibility concern: equivalent functionality should be identified consistently, including names and symbols. [W3C consistent identification](https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification).

---

## 11. CreatorGlyph: preserve the useful investment, repair the fragile parts

[CreatorGlyph.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/creator/controls/CreatorGlyph.tsx:31) already contains a broad purpose-built set for editing, layers, color, typography, composition, audio, and history.

This is a better starting point than rebuilding all editor symbols from scratch.

### Source-confirmed geometry

- 24-unit viewBox.
- Stroke width 1.9.
- Round caps and joins.
- Selected variants for relevant glyphs.
- Default size 24.
- A registry of specific glyph renderers.

At rendered size 22, an ordinary 1.9-unit stroke in that viewBox scales to approximately 1.74 logical units. The number 1.9 is therefore not a fixed on-screen stroke at every size.

This calculation does not imply 1.74 is intrinsically wrong. It explains why an editor glyph can appear weaker when reduced.

### Selected-state inverse problem

Some selected drawings use a currentColor filled body and hardcoded white internal details:

- Drawing: [line 730](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/creator/controls/CreatorGlyph.tsx:730).
- Sticker: [line 748](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/creator/controls/CreatorGlyph.tsx:748).
- Other selected tools use similar white details.

If a caller chooses white as currentColor over media, those internal white details no longer contrast with the body.

**Proposed repair:** Where the feature is a hole or separation, author actual negative space. Where it is intentionally two-tone, provide a reviewed contrasting-detail treatment tied to the surface. Test both rather than replacing every white with black.

### Complexity audit

At 22pt, simplify:

- Overlapping panels.
- Multiple ticks/handles.
- Tight dashed lines.
- Fine waveform detail.
- Tiny letters inside a second shape.

Keep the distinctive action silhouette. Crop, trim, split, safe zone, and cutout must not collapse into five different rectangles.

### Real consumers matter

Symbol-level search confirms CreatorIconButton is used by DrawingWorkspace through the controls barrel. It is **not dead**. A direct-import-only search would miss those consumers.

CreatorToolButton and contextual editor controls are separate real pathways. Improving only one component will not normalize the whole editor.

**Acceptance:** Render the full creator glyph board in default/selected/disabled states on light, dark, and media surfaces; then inspect the actual DrawingWorkspace, contextual rail, and More sheet. A clean icon board alone is not sufficient.

---

## 12. Headers and motion: quiet does not mean lifeless

[PressScale.icon](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/theme/designTokens.ts:491) is 0.92 despite the neighbouring comment describing a 0.97–0.985 range.

That token is consumed by [FlagshipHeader.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/flagship/FlagshipHeader.tsx:99). [ScreenHeader.tsx](C:/Users/User/Desktop/thryftverse-upgrade/frontend/src/components/ui/ScreenHeader.tsx:47) separately uses 0.92.

This is not proof of a visible animation bug in the supplied still images. It is a source-confirmed policy mismatch worth correcting in the same control-quality pass.

### Proposed response

- Test opacity or a subtle 0.97–0.985 scale for compact header actions.
- Never animate the actual hit rectangle smaller.
- Preserve immediate touch response.
- Reduced motion should not remove state feedback; use opacity or instant state change.
- Avoid haptics on every inconsequential metadata tap.
- A navigation icon should not bounce or spring repeatedly.
- On press cancellation, restore the state without leaving a ghost selected appearance.
- Keep loading replacement inside a fixed glyph frame to avoid shifting neighbours.

Coinbase’s public IconButton API requires an accessible label, supports transparent resting treatments, and defines active, loading, and disabled states. This is a useful quality benchmark: the icon is an interaction contract, not merely an SVG in a circle. It is public web-component documentation, not a certification of the native app’s exact geometry. [Coinbase IconButton](https://cds.coinbase.com/components/inputs/IconButton/).

---

## 13. Shared-component leverage and migration boundaries

Do not equate file naming with production reach.

| Owner | Finding | Upgrade responsibility |
|---|---|---|
| FlagshipNavigationRow | Active in Seller Hub and other navigation surfaces | Fix total height, leading slot, separator inset, disabled semantics |
| SettingsRow | Broad settings usage | Correct decorative slot; preserve toggle/value/loading behavior |
| FlagshipHeader | Broad active header usage | Standardize glyph role and press response |
| ScreenHeader | Additional live header family | Align equivalent navigation controls without unnecessary rewrite |
| AppHeader | Export exists; no production consumers found in symbol search | Do not spend the main pass here |
| EmptyState | Broad active use | Role-based pictogram sizing and appropriate absence states |
| AppEmptyState / AnimatedEmptyState | Definitions/exports found, no production consumers found in symbol search | Do not assume their improvements reach active screens |
| CreatorIconButton | Real DrawingWorkspace consumers through barrel | Editor-specific target, selected, media treatment |
| CreatorToolButton | Separate active tool-control pathway | Same semantic/optical policy adapted to label/selection needs |
| CreatorGlyph | Dedicated SVG owner | Shape, negative space, optical variants |
| TabNavigator | Existing tab identity and selected state | Preserve routes, avatar behavior, badge behavior |

The broad-import scan suggests high leverage in FlagshipHeader, SettingsRow, and EmptyState. Counts based on direct import text are approximate; barrels and indirect ownership must be traced before deleting or consolidating anything.

### Architecture recommendation

1. Keep drawing geometry in the actual renderer/assets.
2. Keep semantic state mapping near the canonical component or a small shared mapping with live users.
3. Keep row geometry in row primitives.
4. Keep interaction state in the existing control/state owner.
5. Keep trust/availability information in the existing hook/API contract.
6. Keep bespoke creator tools in the creator department.

This avoids both extremes: hundreds of arbitrary inline choices, and a complicated universal wrapper with no real leverage.

---

## 14. The “AI-slop” cleanup must extend beyond the glyph

| Pattern | Source-grounded example | Better authored treatment | Do not do |
|---|---|---|---|
| Tiny symbol in oversized structure | FlagshipNavigationRow geometry | Rebalance row height, slot, label and subtitle | Increase every icon to fill waste |
| Decorative target confusion | SettingsRow 44pt child View | Parent owns target; decorative slot is compact | Add a visible background to justify the slot |
| Repeated generic identity | Provider cubes/chat/globes | Name and truthful brand identity | Invent a different colorful logo |
| Static status metaphor | Checked shield on not-verified prompt | State-specific identity/verification treatment | Imply trust with a decorative badge |
| Weak media indicator | White top-right tag without guaranteed contrast | Tested local contrast and parent semantics | Add a large opaque card over the image |
| Token compliance mistaken for quality | Four size tokens but many scattered meanings | Rendered role contract and live consumer ownership | Replace numbers mechanically and stop |
| Empty-state icon inflation | Literal sizes reaching 64/100 exist | Appropriate pictogram or intentional text-only composition | Giant stock icon as emotional content |
| Inconsistent tactile identity | Multiple press scales across controls | One restrained family of responses | Bounce every icon to make it feel alive |
| Policy/comment drift | “All migrated,” but current inventory differs | Dated, scoped evidence | More completion claims without native captures |

### Composition requirements by department

**Discovery / Looks / Posters**

Media remains the visual anchor. Utility icons should frame access to the content, not form a second layer of card chrome. Save, share, product tags, and media-type indicators need stable placement and non-overlapping semantics.

**Seller Hub / Inventory**

Operational clarity wins. Use compact, readable rows and meaningful state information. Do not give every operational destination the same subtitle rhythm if some already explain themselves.

**Settings / Account**

Treat leading icons as scanning aids. Section labels and row values matter more than decoration. Support large text without pushing the trailing control off-screen.

**Creator / Editor**

Tools need stronger recognition than tiny metadata icons. Use restrained contextual grouping and labels for ambiguous operations. Selection must survive grayscale and accessibility reading.

**Agent / Integration**

Make provider identity, connection scope, health, and available action distinguishable. A server symbol is appropriate for a custom endpoint, not automatically for every provider. Do not remove truthful labels to make the screen “minimal.”

**Commerce / Payments**

Status signs must reflect actual state. “Sending,” “confirmed,” “failed,” and “outcome unknown” cannot share a success check. A new icon pack must not alter financial or authorization behavior.

These department notes are review directions, not claims that every listed screen was runtime-tested.

---

## 15. Full-stack consequences: where icons stop being merely visual

Most glyph replacement needs no backend change. However, some icon decisions expose an information-contract problem.

### Trace the relevant owner path

| Meaning | Existing source path | Required preservation |
|---|---|---|
| Seller verified | useSellerTrust → sellerTrust.verified → SellerHubScreen | No verified state from absence/defaults |
| Seller summary | fetchSellerHubOverview → overview → task/metric sections | Keep loading, freshness, and error distinctions |
| Catalogue import | fetchImportBatches → batch status → import rows | Progress/failure/action-required must remain truthful |
| Shoppable media | itemIds → tile indicator and navigation | Do not promise available products from a decorative tag alone |
| Provider connection | provider configuration + stored/server connection state → integration screen | Separate identity, saved configuration, tested connection, and health |
| Editor selected tool | existing tool state → control → glyph selected variant | Do not use local animation state as the source of selection |
| Upload action | upload state → control/status → retry or completion | No checkmark before confirmed completion |

### Specific trust issue to resolve in implementation

The Seller Hub verification banner comment says it appears when a real capability is gated, but the actual condition only tests not-verified. If a capability-specific warning is desired, use existing authoritative capability information or explicitly extend that contract.

If that information is unavailable, show a neutral verification destination/status. Do not invent a blocked capability to justify an amber warning.

### Why this is part of icon quality

Icons are compressed assertions. A lock claims a constraint. A check claims completion. A shield claims protection. A filled bookmark claims saved state. Changing the graphic without verifying the assertion can make a polished UI less trustworthy.

Any implementation touching those assertions must verify the endpoint/hook state and error handling. This report does not claim those live endpoints were exercised.

---

## 16. Pilot protocol: choose with evidence, not taste adjectives

### Pilot surfaces

Use three small but representative native surfaces:

1. Seller Hub: verified and unverified states; navigation rows and import.
2. Discovery tile: bright/dark media, product tag, saved/unsaved.
3. Creator contextual rail: default, selected, disabled, and media overlay.

### Candidate sets

- A: current Ionicons with corrected geometry and semantics.
- B: Phosphor regular with approved fill variants.
- C: Lucide with controlled stroke, if needed after A/B review.

Keep the text, data, spacing, and viewport the same across candidates. Otherwise a better layout can be falsely credited to the new family.

### Two distinct comparisons

**Glyph-only board:** Compare the same meanings at 16, 22, and 24pt; check optical balance and selected pairs.

**Whole-screen comparison:** Compare dominant object, density, useful content, and whether utility chrome recedes. A gorgeous icon sheet can still produce a poor screen.

### Recognition questions

For unfamiliar users:

- What do you expect this icon to do?
- Is this status already achieved or asking you to act?
- Which control would you use to import products?
- Is the tag an action or information?
- Can you distinguish undo, redo, trim, split, and crop?

Do not invent research results. Record actual errors and hesitations when testing is performed.

### Proposed internal decision rule

Choose the smallest dependency/design change that:

- Clearly improves recognition and optical coherence in complete screens.
- Does not reduce accessibility or state truthfulness.
- Does not introduce a material startup/bundle regression without a justified benefit.
- Works in both native themes and on media.
- Has maintainable licensing, imports, and migration ownership.

These are project acceptance criteria, not an assertion that one package objectively outperforms all others.

---

## 17. Implementation sequence

### Wave 0 — Baseline and spec correction

**Files:** Design.md, designTokens, canonical row/header owners.

- Capture native baseline at consistent viewport, data, theme, and font scale.
- Record first useful content Y-position, useful rows above fold, glyph size, text start, separator start, and visible-container count.
- Correct the decorative-slot wording in Design.md.
- Define the role/variant policy with a small optical board.
- Preserve the existing working tree and avoid overlapping in-progress creator changes without coordination.

**Exit:** Baseline and chosen geometry are documented; no assumption that token changes alone meet the goal.

### Wave 1 — Seller Hub pilot

**Files:** FlagshipNavigationRow, SettingsRow where equivalent geometry is shared, SellerHubScreen.

- Correct nested row minimum/padding.
- Correct separator inset.
- Increase leading navigation glyph from compact metadata role to standard navigation role.
- Review subtitle usefulness individually.
- Fix auction/import/verification semantics.
- Preserve MyListings, InventoryManagement, SellerAnalytics, SellerAuctionCentre, Wallet, and Verification destinations.
- Retain genuine warning and status states; do not remove capability.

**Exit:** Native before/after shows materially better density, legibility, and semantic clarity. Large text and disabled states remain usable.

### Wave 2 — Dependency maintenance

**Files:** package manifest/lockfile, relevant configuration, all affected imports/types/mocks.

- Resolve a compatible scoped RNVI Ionicons version.
- Review the upstream migration tooling before applying it.
- Migrate the family consistently.
- Inspect transitive old-wrapper use.
- Verify font names, loading behavior, and release build.
- Rebuild the native application when native dependencies/config require it.
- Measure actual asset and bundle changes.

**Exit:** No missing/wrong glyphs on cold start or offline launch; no unsupported claim that the app now looks better merely because imports changed.

### Wave 3 — Approved art direction

If corrected Ionicons wins, retain it and refine the reviewed subset.

If Phosphor or Lucide wins:

- Establish explicit migration boundaries.
- Use curated imports or reviewed assets.
- Migrate equivalent regions together.
- Do not leave one row family containing three visual systems.
- Keep creator custom tools only where they serve distinct semantics.
- Remove superseded general-family usage only after full consumer verification.

**Exit:** Whole pilot screens beat the baseline, not just the icon board.

### Wave 4 — High-leverage primitives

- FlagshipHeader and ScreenHeader.
- Settings/navigation rows.
- Active EmptyState.
- CreatorIconButton / CreatorToolButton.
- Shared media indicators and action controls.

**Exit:** Repeated defects disappear across actual consumers, not merely in newly created components.

### Wave 5 — Department sweep

Review the high-concentration source queue, then remaining direct icon sites. Classify each as standard role, documented exception, decorative content, or obsolete/dead use.

Use separate focused changes for discovery, creator, seller/settings, chat/agents, and commerce. Review navigation and state semantics after each department.

**Exit:** Every active icon site has an intentional role; exceptions are documented and visually justified.

### Wave 6 — Native and release acceptance

Complete the checklist below. Retain local captures and test notes; do not commit screenshots or temporary audit tools unless requested.

**Exit:** Claim native visual completion only after actual native validation.

---

## 18. Verification and regression coverage

### Geometry and native render

- Compare at normal font scale and a large accessibility text setting.
- Include a compact viewport and a typical modern device.
- Check actual optical bounds, not only width/height props.
- Confirm decorative slots do not inflate rows.
- Confirm separators align with the intended text column.
- Confirm no overlapping hit regions.
- Confirm sticky bars do not obscure content.
- Confirm no selected-state layout shift.
- Confirm loading replacement keeps the same frame.
- Perform thumbnail and squint checks on whole screens.

A normal row-heavy viewport should expose several useful destinations, not an oversized series of tiny icons. The exact count depends on headers, content, and accessibility scale; do not force a fixed count by clipping text.

### State matrix

| State | Required visual result | Required behavior |
|---|---|---|
| Default | Clear role and quiet hierarchy | Correct action |
| Pressed | Immediate restrained response | Cancel/release correctly |
| Selected | Shape/marker plus accessible state | True underlying selection |
| Disabled | Understandable, not mistaken for missing content | No action; reason where needed |
| Loading | Stable geometry, progress where relevant | Prevent duplicate mutation |
| Success | Specific confirmed result | No premature checkmark |
| Failure | Recognizable failure with recovery | Retry appropriate operation |
| Unknown outcome | Distinct from success and ordinary failure | Check result / safe retry |
| Offline | Truthful availability | No fake completion |
| Permission denied | Clear constraint | Settings/recovery path if applicable |
| Missing icon/asset | No invisible critical action | Supported fallback/label and diagnostic |
| Dark/increased contrast | Same composition and readable glyph | No theme-specific functionality loss |
| RTL | Correct directional symbols | Correct reading/navigation order |

### Accessibility

- Icon-only actions have specific labels: “Close editor,” not “X icon.”
- Decorative row glyphs are not separately announced as duplicate images.
- Parent rows remain correctly named and actionable.
- Selected, checked, busy, and disabled states are exposed.
- Trust labels describe actual status.
- Focus indication is visible where applicable.
- VoiceOver/TalkBack order follows the visual/task order.
- Large text does not hide the only action.
- Tappable status indicators have a purpose; ordinary status marks are not fake buttons.
- 44pt practical native targets are not confused with WCAG CSS-pixel criteria.

### Performance and packaging

- Measure release bundle and assets before/after.
- Do not count package download size as shipped application size.
- Test cold-start icon readiness; App.tsx currently explicitly loads Inter, not Ionicons, in its main useFonts call.
- That absence alone is not proof of missing glyphs: the icon library can load fonts dynamically.
- Test list scrolling and overlay rendering with realistic item counts.
- Avoid rendering an entire dynamic icon registry to pick one icon.
- Do not introduce animations or per-item providers without profiling.
- Keep SVG paths simple and stable.
- Verify any native symbol fallback on supported OS versions.

### Tests worth adding during implementation

After inspecting and improving the real interaction:

- Behavioral tests for selected/disabled/loading semantics.
- Correct routes and action callbacks after icon migration.
- Evidence-backed verified/pending/unknown presentations.
- Product-tag parent labeling versus independent-action behavior.
- Typed semantic mappings that cannot silently pass unsupported icon names.
- Focused native screenshot comparisons for inverse selected glyphs and row geometry.
- Cold-launch and release-build smoke checks.

Do not add tests that only assert a file exists, a component contains an icon name string, or a constant equals the number just written. Inventory scripts are audit tools, not evidence of user behavior.

---

## 19. Acceptance backlog

Priority here describes execution order, not a formally measured incident severity.

| ID | Priority | Owner | Action | Evidence needed to close |
|---|---|---|---|---|
| IC-01 | First | Design.md + row owners | Separate decorative slot from target | Updated spec and native row capture |
| IC-02 | First | FlagshipNavigationRow | Correct compounded height | Native one/two-line dimensions |
| IC-03 | First | FlagshipNavigationRow | Correct separator inset | Text/separator alignment capture |
| IC-04 | First | SellerHubScreen | Correct auction/import metaphors | Recognition review; routes unchanged |
| IC-05 | First | SellerHubScreen + trust owner | Separate verification process/result/unknown | State-matrix test and captures |
| IC-06 | First | Pilot implementation | Compare corrected Ionicons and Phosphor | Identical-content native comparisons |
| IC-07 | Next | Dependency owner | Scoped RNVI migration | Clean dependency/font/release validation |
| IC-08 | Next | Header owners | Align press response and icon roles | Reduced-motion and press tests |
| IC-09 | Next | Media tile owners | Normalize product-tag meaning and contrast | Bright/dark/patterned media captures |
| IC-10 | Next | CreatorGlyph | Correct inverse selected details | White and dark selected-state board |
| IC-11 | Next | Creator control owners | Align real tool consumers | Rail/drawing/sheet captures |
| IC-12 | Next | AI provider identity owner | Replace arbitrary provider pseudo-logos | Approved artwork/plain-name treatment |
| IC-13 | Next | Search/chat/sell action owners | Remove magic metaphors in product controls | Action semantics and routes verified |
| IC-14 | Sweep | Screen owners | Classify remaining literal sizes | Role inventory with justified exceptions |
| IC-15 | Sweep | Accessibility owner | Verify labels/state/disabled branches | VoiceOver/TalkBack results |
| IC-16 | Release | Native QA | Whole-screen visual and performance acceptance | Native capture pack and release smoke results |

### Explicit anti-regression rules

- No global replacement of every icon size with 22.
- No new package without a defined role and import strategy.
- No ornamental icon containers added just to make UI look richer.
- No verified/check/lock/shield state without truthful meaning.
- No new dead wrapper advertised as architecture progress.
- No destruction of existing routes or useful controls.
- No assumption that dark gray is inaccessible without checking actual colors/context.
- No claim of 1:1 competitor parity from small crops or static source review.
- No percentage improvement claimed without a measured experiment.
- No package-family decision justified only by popularity.

---

## 20. Recommended outcome for ThryftVerse

The target is not “more expensive-looking icons.” It is a recognizable product language:

- Strong enough glyphs to scan immediately.
- Compact, deliberate structure around them.
- Stable meanings across departments.
- Selection and status that tell the truth.
- Media that remains the dominant visual object.
- Native controls that respond consistently.
- A small number of custom tools where the product genuinely needs them.

**My recommendation:** Start with Seller Hub’s shared row geometry and semantic errors, compare corrected Ionicons against Phosphor in native screens, and separately modernize the Expo icon dependency. Keep the existing SVG capability. Do not buy or install a large icon bundle as the first move.

The current evidence supports a system upgrade, not a claim that Ionicons is intrinsically low quality. The report also does not rule out replacing it: if a controlled native comparison shows a better family materially improves recognition and optical balance, migrate deliberately.

### Research completion and implementation status

- Four supplied crops: inspected.
- Current source inventory: completed with scope limitations stated.
- Shared owner diagnosis: completed for the principal patterns above.
- Current online package/design research: completed using primary sources.
- Production UI changes: none.
- Package installation or dependency changes: none.
- Design.md edits: none.
- Native visual validation: not performed this pass.
- Live endpoint validation: not performed this pass.
- TypeScript/tests: not run for this documentation-only change.
- Commits: none.

**Status: RESEARCH COMPLETE — IMPLEMENTATION AND NATIVE VALIDATION PENDING.**

### Companion document

This report specializes the broader parity work in [FLAGSHIP_DESIGN_MD_PARITY_UPGRADE_REPORT_2026-08-30.md](C:/Users/User/Desktop/thryftverse-upgrade/.devin/reports/FLAGSHIP_DESIGN_MD_PARITY_UPGRADE_REPORT_2026-08-30.md). It does not substitute an icon audit for the editor/upload and full-state implementation work in that report.
