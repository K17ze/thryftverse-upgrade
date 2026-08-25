# P2 Item #34 — Sustainability & Impact Accounting (Flagship-Grade Deep Dive)

**Audit scope:** ThryftVerse secondhand fashion marketplace — sustainability/impact surfaces, calculation methodology, backend infrastructure, regulatory compliance, industry benchmarking, data-gap analysis, and proposed architecture.
**Repo root:** `C:\Users\User\Desktop\thryftverse-upgrade`
**Frontend:** `frontend/src` · **Backend:** `backend/api/src`
**Mode:** Read-only research. No source files modified.
**Auditor:** Senior SWE, 20 years FAANG-level mobile experience.

---

## 1. Executive finding

ThryftVerse surfaces sustainability claims across **eleven user-visible surfaces** in the frontend. **Every impact figure is fabricated client-side from hardcoded constants** — there is no backend impact service, no emissions factor table, no carrier/distance/material data pipeline, and no integration with any third-party emissions provider (Squake, Sweep, Carbon Interface). The codebase is internally honest about this in code comments, but the **user-facing copy still makes definitive savings claims** ("By buying secondhand, you save ~X kg CO₂ vs buying new", "Buying this pre-owned item saves ~X kg CO2 and ~Y liters of water"), which constitutes a **greenwashing / unsubstantiated environmental claim** exposure under the UK CMA Green Claims Code (2021), the EU Empowering Consumers for the Green Transition Directive (2024/825, in force 27 September 2026), and the UK Digital Markets, Competition and Consumers (DMCC) Act 2024.

The `SustainabilityImpact` detail component (`frontend/src/components/commerce/detail/SustainabilityImpact.tsx:1-195`) is **exported but never imported by any screen** — it is dead code [VERIFIED — CODE]. The `SustainabilityPreferencesScreen` hardcodes `co2SavedKg = 34` and `itemsRescued = 12` as literal constants (`SustainabilityPreferencesScreen.tsx:129-130`) and only shows a "Demo mode" banner in `__DEV__` (`SustainabilityPreferencesScreen.tsx:40`), meaning **production users see fabricated impact figures with no disclaimer** [VERIFIED — CODE]. This is the most acute AGENTS.md §11 violation in the codebase.

This is the highest-priority P2 to resolve because the risk is **legal/regulatory**, not merely UX. Fines under the DMCC Act 2024 reach **10% of global turnover** [VERIFIED — EXTERNAL].

---

## 2. Exhaustive codebase audit — every sustainability/impact file

### 2.1 Core calculation engine

| File | Lines | Role | Evidence |
|------|-------|------|----------|
| `frontend/src/utils/sustainabilityScore.ts` | 1–298 | **The entire impact calculation.** Single client-side TypeScript file. No backend call. | [VERIFIED — CODE] |

**Full calculation trace (every constant, formula, branch):**

**Constants** [VERIFIED — CODE — `sustainabilityScore.ts:113-115`]:
```typescript
const NEW_CO2_KG = 8;           // kg CO2e for an average new garment (L113)
const NEW_WATER_L = 2900;       // liters of water for an average new garment (L114)
const RESALE_SAVINGS_RATIO = 0.6; // resale displaces ~60% of new footprint (L115)
```

**Category weight factors** [VERIFIED — CODE — `sustainabilityScore.ts:105-110`]:
```typescript
const CATEGORY_WEIGHT: Record<CategoryTier, number> = {
  high: 1.0,    // dresses, jeans, jackets, coats, suits, knitwear, sweaters
  mid: 0.7,     // shoes, bags, accessories, jewelry, hats, belts, scarves, watches
  low: 1.4,     // home, electronics, tech, furniture, kitchen, decor, appliances
  unknown: 1.0, // fallback
};
```

**Sustainable brand allowlist** [VERIFIED — CODE — `sustainabilityScore.ts:58-81`]: 20 hardcoded brands (Patagonia, Eileen Fisher, Reformation, Everlane, Kotn, Tentree, Allbirds, Veja, Stella McCartney, Ganni, Levi's, Outerknown, People Tree, Thought, Mud Jeans, Girlfriend Collective, Pangaia, Christy Dawn, Mara Hoffman). Matched by lowercase exact string. No backend reference, no public registry cross-check.

**Grade composite (0–100)** [VERIFIED — CODE — `sustainabilityScore.ts:207-289`]:
- Condition: 10–25 pts (`conditionPoints`, L129-152). "New with tags" = 20, "Very good" = 25, "Good" = 20, "Fair" = 15, "Poor" = 10, default = 15.
- Category tier: 10–20 pts (`categoryPoints`, L154-165). High = 20, Mid = 15, Low = 10, Unknown = 10.
- Local seller (same-country string match): 15 pts (`isLocalSeller`, L180-186, applied L240-248). Uses `extractCountry` (L167-178) — splits "City, Country" on last comma. **No geocoding, no distance, no mode.**
- Co-Own eligible: 10 pts (L251-258).
- Sustainable brand: 15 pts (L261-268).
- Clamped to 0–100 (L271).

**Grade bands** [VERIFIED — CODE — `sustainabilityScore.ts:193-198`]:
```typescript
if (score >= 60) return 'A';
if (score >= 40) return 'B';
if (score >= 20) return 'C';
return 'D';
```

**CO₂ saved formula** [VERIFIED — CODE — `sustainabilityScore.ts:276`]:
```typescript
co2SavedKg = round(NEW_CO2_KG * RESALE_SAVINGS_RATIO * CATEGORY_WEIGHT[tier] * 10) / 10
// = round(8 * 0.6 * weight * 10) / 10
// = 3.4 (mid) to 6.7 (low) kg CO2e for any item
```

**Water saved formula** [VERIFIED — CODE — `sustainabilityScore.ts:277`]:
```typescript
waterSavedL = round(NEW_WATER_L * RESALE_SAVINGS_RATIO * CATEGORY_WEIGHT[tier])
// = round(2900 * 0.6 * weight)
// = 1,218 (mid) to 2,436 (low) liters for any item
```

**Summary string** [VERIFIED — CODE — `sustainabilityScore.ts:279`]:
```typescript
`Buying this pre-owned item saves ~${co2SavedKg} kg CO2 and ~${waterSavedL.toLocaleString('en-GB')} liters of water vs buying new.`
```

**Sustainable grade predicate** [VERIFIED — CODE — `sustainabilityScore.ts:295-298`]: `isSustainableGrade()` returns `true` when grade is A or B. Used by BrowseScreen and FilterScreen.

### 2.2 UI surface inventory — every screen, component, chip, badge, filter, toggle

| # | Surface | Path:Line | What it shows | Data source | Substantiation |
|---|---------|-----------|---------------|-------------|----------------|
| 1 | **Sustainability score utility** | `frontend/src/utils/sustainabilityScore.ts:1-298` | `co2SavedKg`, `waterSavedL`, A–D grade, summary string | Hardcoded constants × category weight | **Illustrative.** Self-labelled "heuristic, client-side estimate" (L2-18). No real data. |
| 2 | **SustainabilityImpact (product detail section)** | `frontend/src/components/commerce/detail/SustainabilityImpact.tsx:1-195` | "By buying secondhand, you save ~{co2SavedKg} kg CO₂ vs buying new." (L71); stat cells for CO₂e saved, Water saved, Waste diverted (L36-54); inline tags (L57, L95-106); detailed SustainabilityBadge (L110) | `SustainabilityScore` prop | **DEAD CODE — never imported by any screen** [VERIFIED — CODE]. Exported from `commerce/detail/index.ts:43-44` but grep for `import.*SustainabilityImpact` across `frontend/src` returns zero screen imports. Hero message (L71) is a definitive savings claim. Disclaimer: "Estimates based on industry averages. Not a precise measurement." (L113-115). |
| 3 | **SustainabilityBadge (compact + detailed)** | `frontend/src/components/product/SustainabilityBadge.tsx:1-350` | Compact: A/B/C/D grade chip with leaf icon (L93-109). Detailed: "ESTIMATED IMPACT" eyebrow (L128), grade label "Excellent/Good/Moderate/Low" (L46-82), summary string (L136-138), factor breakdown rows (L141-167), CO₂e + water stat cells (L169-190), disclaimer (L192-194) | `SustainabilityScore` prop | **Illustrative.** Grade labels ("Excellent sustainability", L131) are evaluative environmental claims. Disclaimer at L192-194. |
| 4 | **ProductCardV2 — compact grade chip** | `frontend/src/components/ProductCardV2.tsx:116-130, 225-233` | A/B grade chip on card media (top-left corner) | `computeSustainabilityScore()` called client-side (L118-128). **No `buyerLocation` passed** (L120-126) → local-seller factor always false on cards. | **Illustrative.** Chip only shows for A/B grades (L129-130). Badge cascade priority: price drop > sold > condition > sustainability (L217-220). |
| 5 | **BrowseScreen — "Sustainable" filter** | `frontend/src/screens/BrowseScreen.tsx:46, 694-709` | Filters display list to A/B grade items only | `isSustainableGrade()` from `sustainabilityScore.ts` (L46, L700-707). Applied client-side to both cached and backend-filtered lists (L694-696 comment). | **Illustrative.** Comment at L694-696 admits: "Sustainability is a client-side heuristic, so it must be applied to both the cached list and the backend-filtered list (the backend does not know about the grade)." |
| 6 | **FilterScreen — sustainable toggle** | `frontend/src/screens/FilterScreen.tsx:42, 797-849` | "Sustainable only" toggle with leaf icon, caption "Estimated grade A or B items" (L830-832) | `isSustainableGrade()` from `sustainabilityScore.ts` (L42) | **Illustrative.** Toggle caption admits "Estimated grade" but still presents a quality gate. |
| 7 | **SustainabilityPreferencesScreen** | `frontend/src/screens/SustainabilityPreferencesScreen.tsx:1-396` | "Your impact: 34 kg CO₂ saved · 12 items kept from landfill" (L129-130, 173-175); stat cells (L176-185); carbon target chips [10,25,50,100,250] (L43, L193-215); ratio target chips [25,50,75,100] (L46, L220-242); "Carbon-neutral shipping" toggle (L250-253); "Plastic-free packaging" toggle (L256-263); "Sustainability badges" toggle (L268-275); "Impact tracking" toggle (L276-282); "Local first" toggle (L283-290) | **Hardcoded literals**: `co2SavedKg = 34` (L129), `itemsRescued = 12` (L130). Preferences persisted to AsyncStorage only (L48, L92-126). No backend persistence. | **Fabricated + illustrative.** `SUSTAINABILITY_DEMO_MODE = __DEV__` (L40) — demo banner only shows in dev (L157-168). **Production users see fabricated 34 kg / 12 items with no disclaimer.** |
| 8 | **SustainabilityTags (sell flow)** | `frontend/src/components/sell/SustainabilityTags.tsx:1-314` | 6 seller-selectable tags: Pre-loved, Vintage, Sustainable brand, Upcycled, Carbon-neutral shipping, Plastic-free packaging (L52-89). Impact summary shown when tags active (L186-220). | Seller-asserted, stored as string array. No backend verification. | **Unverified seller claims.** "Carbon-neutral shipping" tag (L78-82) impact text: "You offset the carbon cost of shipping." — this is an unsubstantiated environmental claim by the seller, surfaced by the platform. |
| 9 | **ShippingReturnsInfo — carbon-neutral badge** | `frontend/src/components/commerce/detail/ShippingReturnsInfo.tsx:145-152` | "Carbon-neutral shipping" badge with leaf icon, shown when `carbonNeutral` prop is true | `carbonNeutral` prop, defaulted to `false` (L38). In `ItemDetailScreen.tsx:1365`, passed as `commerce.shippingPayer === 'seller'` — **"seller pays shipping" is treated as "carbon-neutral"**, which is completely unrelated. | **False equivalence.** `ItemDetailScreen.tsx:1365`: `carbonNeutral={commerce.shippingPayer === 'seller'}`. Free shipping ≠ carbon-neutral shipping. This is a fabricated environmental claim. |
| 10 | **Settings entry point** | `frontend/src/screens/SettingsScreen.tsx:204, 789-794` | "Sustainability" row with leaf icon, subtitle "Goals, shipping, impact" | Navigation only. `searchTerms: 'carbon neutral packaging badges eco secondhand'` (L204). | Navigation only — no claim itself. |
| 11 | **Command palette entry** | `frontend/src/services/commandPaletteApi.ts:577-583` | "Sustainability preferences" nav action, subtitle "Eco-impact & shipping defaults", keywords `['sustainability', 'eco', 'green', 'carbon']` | Navigation only. | Navigation only. |
| 12 | **YourAlgorithmScreen — "Sustainability interest" topic** | `frontend/src/screens/YourAlgorithmScreen.tsx:82` | Algorithm transparency topic label "Sustainability interest" | Static label in `TOPICS` array. | Label only — no impact claim. |
| 13 | **algorithmTransparencyApi — mock sustainability topic** | `frontend/src/services/algorithmTransparencyApi.ts:204-211` | Mock topic "Sustainability interest", weight "medium", `isDemo: true` | Hardcoded mock data. | Mock — labelled `isDemo: true`. |
| 14 | **i18n locale string** | `frontend/src/i18n/locales/en.json:266-267` | `"sustainability": "Sustainability"`, `"sustainabilitySubtitle": "Goals, shipping, impact"` | Static i18n string. | Label only. |
| 15 | **Store — sustainableOnly filter** | `frontend/src/store/useStore.ts:170-171` | `sustainableOnly: boolean` browse filter state | Client-side state, drives `BrowseScreen` filter. | **Illustrative.** Comment: "Client-side filter: only show items with an estimated A/B sustainability grade." |
| 16 | **Animation asset comment** | `frontend/src/components/animations/animationAssets.ts:130` | Onboarding sell animation comment: "Communicates listing and sustainability." | `ONBOARDING_SELL` is `null` (L134) — no animation exists. | No claim rendered. |
| 17 | **Test file** | `frontend/src/__tests__/flagshipProductionDetailPass.test.ts:48-52` | Asserts sustainability chip priority cascade and `showSustainabilityChip` exist in ProductCardV2. | Test guard. | Confirms chip is a shipped feature. |

### 2.3 Backend audit — impact/sustainability/emissions infrastructure

**Result: COMPLETE ABSENCE.** [VERIFIED — CODE]

Grep for `sustainability|carbon|co2|kgco2e|emission|squake|sweep|carbon.interface|avoided.production|impact.factor|carbonSaved|waterSaved|itemsSaved|SustainabilityScore|SustainabilityGrade|impactScore` across `backend/api/src` returns **100 matches, all false positives**:
- "sweep" = auction sweep jobs, escrow release sweep, platform revenue sweep, payout schedule sweep, webhook retry sweep (`backend/api/src/index.ts:113, 1235, 5715, 6247, 9349, 9552, 11825, 28116, 32933` etc.)
- "impact" = market price impact for co-own trading (`useStore.ts:1083-1084` is frontend; backend has trading impact in index.ts)
- "estimated" = shipping ETA estimates, data-export estimatedRecords

**No impact route, no emissions factor table, no provider integration, no sustainability preference endpoint.** [VERIFIED — CODE]

### 2.4 Database migration audit

Grep for `sustainability|carbon|co2|emission|impact|avoided|water_saved|co2_saved` across `backend/api/src/db/migrations/**` returns **1 file**: `101_coown_recourse_and_verification.sql:127` — column comment `-- The monetary impact of this event (if any)` referring to **financial** impact of a co-own event, not environmental. [VERIFIED — CODE]

**No `emission`, `carbon`, `co2`, `sustainability`, `impact_factor`, `avoided`, `water_saved`, or `co2_saved` tables exist.** [VERIFIED — CODE]

### 2.5 Third-party emissions provider integration audit

| Provider | Integration | Evidence |
|----------|-------------|----------|
| **Squake** | ❌ None | No `SQUAKE_API_KEY` env, no `squakeClient.ts`, no import. Grep returns zero matches. [VERIFIED — CODE] |
| **Carbon Interface** | ❌ None | No `CARBON_INTERFACE_API_KEY`, no client, no import. [VERIFIED — CODE] |
| **Sweep** | ❌ None | No `SWEEP_*` env, no client. "sweep" matches are all auction/escrow job schedulers. [VERIFIED — CODE] |
| **Vaayu** | ❌ None | No matches. [VERIFIED — CODE] |
| **Watershed** | ❌ None | No matches. [VERIFIED — CODE] |

---

## 3. Full calculation trace — user action to UI display

### 3.1 Product card (browse/feed)

```
User scrolls browse feed
  → ProductCardV2.tsx:118-128  computeSustainabilityScore({condition, category, subcategory, brand, sellerLocation})
    → sustainabilityScore.ts:207  computeSustainabilityScore(input)
      → L210: condition = lower(input.condition)
      → L211-212: category, subcategory = lower(...)
      → L219-227: conditionPoints(condition) → 10-25 pts
      → L230-237: classifyCategory(category, subcategory) → tier → categoryPoints(tier) → 10-20 pts
      → L240-248: isLocalSeller(sellerLocation, buyerLocation) → 15 pts or 0
        NOTE: buyerLocation is NOT passed from ProductCardV2 (L120-126) → always false
      → L251-258: coOwnEligible → 10 pts or 0 (not passed from card → always false)
      → L261-268: isSustainableBrand(brand) → 15 pts or 0
      → L271: clampedScore = min(100, max(0, score))
      → L272: grade = gradeForScore(clampedScore) → A/B/C/D
      → L275-277: co2SavedKg = 8 * 0.6 * weight; waterSavedL = 2900 * 0.6 * weight
      → L279: summary string constructed
  → ProductCardV2.tsx:129-130  showSustainabilityChip = !isSold && (grade === 'A' || grade === 'B')
  → ProductCardV2.tsx:225-233  if showSustainabilityChip → render <SustainabilityBadge score={...} variant="compact" onMedia />
    → SustainabilityBadge.tsx:93-109  compact chip: leaf icon + grade letter, colored by gradeMeta
```

**Data gap on cards:** `buyerLocation` never passed (L120-126), `coOwnEligible` never passed. Two scoring factors are always zero on the card surface. [VERIFIED — CODE]

### 3.2 Browse filter

```
User toggles "Sustainable only" in FilterScreen
  → FilterScreen.tsx:812  setSustainableOnly(prev => !prev)
  → Store: browseFilters.sustainableOnly = true
  → BrowseScreen.tsx:697-709  displayListings = base.filter(listing => isSustainableGrade({condition, category, subcategory, brand, sellerLocation}))
    → sustainabilityScore.ts:295-298  isSustainableGrade → computeSustainabilityScore → grade === 'A' || grade === 'B'
```

**The backend never knows about the filter.** Comment at BrowseScreen.tsx:694-696 admits this explicitly. [VERIFIED — CODE]

### 3.3 Sustainability preferences screen

```
User opens Sustainability Preferences
  → SustainabilityPreferencesScreen.tsx:129  co2SavedKg = 34  (HARDCODED LITERAL)
  → SustainabilityPreferencesScreen.tsx:130  itemsRescued = 12  (HARDCODED LITERAL)
  → L157-168  if SUSTAINABILITY_DEMO_MODE (= __DEV__) → show demo banner
    → PRODUCTION: __DEV__ is false → NO BANNER → user sees "34 kg CO₂ saved · 12 items kept from landfill" as fact
  → L173-175  "Your impact" subtitle renders the fabricated numbers
  → L176-185  Stat cells render "34" and "12" with "kg CO₂ saved" / "items rescued" labels
  → L88-109  Hydrate preferences from AsyncStorage
  → L112-126  Persist preferences to AsyncStorage (NOT backend)
```

[VERIFIED — CODE — `SustainabilityPreferencesScreen.tsx:40, 129-130, 157-168`]

### 3.4 Product detail (dead code path)

```
SustainabilityImpact.tsx is exported from commerce/detail/index.ts:43-44
  → grep for import across frontend/src → ZERO screen imports
  → The component is NEVER rendered in the app
```

[VERIFIED — CODE — grep `import.*SustainabilityImpact` across `frontend/src/**/*.tsx` returns 0 matches]

### 3.5 Shipping carbon-neutral badge (false equivalence)

```
ItemDetailScreen.tsx:1363-1366
  <ShippingReturnsInfo
    commerce={commerce}
    carbonNeutral={commerce.shippingPayer === 'seller'}  // L1365
  />
  → ShippingReturnsInfo.tsx:145-152  if carbonNeutral → render "Carbon-neutral shipping" badge
```

**`shippingPayer === 'seller'` means "seller pays for shipping", not "shipping is carbon-neutral".** This is a **false equivalence** that fabricates an environmental claim from a financial arrangement. [VERIFIED — CODE — `ItemDetailScreen.tsx:1365`]

---

## 4. Regulatory deep-dive — specific non-compliant claims

### 4.1 UK CMA Green Claims Code (2021, in force)

The CMA Green Claims Code requires that environmental claims be [VERIFIED — EXTERNAL — https://terraverde-solutions.com/corporate-sustainability/40-of-online-green-claims-are-potentially-misleading/]:
1. **Truthful and accurate**
2. **Clear and unambiguous**
3. **Not omit or hide important relevant information**
4. **Make fair and meaningful comparisons**
5. **Consider the full life cycle of the product**
6. **Be substantiated** (robust, credible, current evidence)

**Specific ThryftVerse violations:**

| CMA principle | Violation | Code location |
|---------------|-----------|---------------|
| Truthful and accurate | "saves ~X kg CO₂" is a hardcoded constant (8 × 0.6 × weight), not a measurement | `sustainabilityScore.ts:276`, `SustainabilityImpact.tsx:71` |
| Clear and unambiguous | "~" prefix and footer disclaimer do not cure an unsubstantiated headline claim | `SustainabilityImpact.tsx:71, 113-115` |
| Not omit material information | Methodology, data sources, and that figures are not item-specific are not disclosed at point of claim | `SustainabilityBadge.tsx:192-194` (disclaimer is generic, not item-specific) |
| Fair comparisons | "vs buying new" invokes a comparison not substantiated for the specific item | `sustainabilityScore.ts:279` |
| Full life cycle | Resale shipping emissions are NOT subtracted; claim is gross, not net | `sustainabilityScore.ts:276` (no shipping subtraction) |
| Substantiated | No robust, credible, current evidence — hardcoded constants from "industry literature" | `sustainabilityScore.ts:14-17` (comment cites "WRAP UK / ThredUp resale reports" but no actual source data is loaded) |

### 4.2 EU Empowering Consumers for the Green Transition Directive (2024/825)

**Adopted 28 February 2024. Member states must transpose by 27 March 2026, applying from 27 September 2026.** [VERIFIED — EXTERNAL — https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024L0825]

Key requirements [VERIFIED — EXTERNAL — https://enterprise.gov.ie/en/what-we-do/the-business-environment/empowering-consumers-for-the-green-transition/]:
- **Generic environmental claims banned unless substantiated** — "eco-friendly", "green", "carbon neutral" require evidence
- **Future performance claims** (e.g., "carbon neutral by 2030") require verifiable commitments, implementation plans, measurable targets, independent third-party verification
- **Claims based on offsetting** of greenhouse gas emissions are to be avoided
- **Environmental claims about entire product/business** when only a partial aspect applies are banned

**Specific ThryftVerse violations:**

| Directive requirement | Violation | Code location |
|-----------------------|-----------|---------------|
| Generic claims banned | "Excellent sustainability" grade label is a generic environmental claim | `SustainabilityBadge.tsx:54, 131` |
| Generic claims banned | "Sustainable brand" tag — brand is on a 20-item hardcoded allowlist with no public registry cross-check | `sustainabilityScore.ts:58-81`, `SustainabilityTags.tsx:66-70` |
| Carbon-neutral claims | "Carbon-neutral shipping" toggle implies a carbon-neutral delivery option exists; it does not | `SustainabilityPreferencesScreen.tsx:250-253` |
| Carbon-neutral claims | "Carbon-neutral shipping" seller tag: "You offset the carbon cost of shipping" — no offset mechanism exists | `SustainabilityTags.tsx:78-82` |
| Carbon-neutral claims | `carbonNeutral={commerce.shippingPayer === 'seller'}` — free shipping ≠ carbon-neutral | `ItemDetailScreen.tsx:1365` |
| Substantiation | "saves ~X kg CO2 and ~Y liters of water" is not substantiated by scientifically recognised evidence | `sustainabilityScore.ts:279` |
| Full lifecycle | Resale shipping emissions not netted out | `sustainabilityScore.ts:276` (no subtraction) |

### 4.3 UK Digital Markets, Competition and Consumers (DMCC) Act 2024

The DMCC Act 2024 gives the CMA direct enforcement powers over consumer protection, including **fines up to 10% of global turnover** for breaches. [VERIFIED — EXTERNAL — CMA guidance on DMCC enforcement] The Green Claims Code is enforced under this framework. The current ThryftVerse UI is a textbook example of an unsubstantiated comparative green claim that would attract CMA enforcement action.

### 4.4 AGENTS.md §11 — internal charter violation

The codebase's own charter states [VERIFIED — CODE — `AGENTS.md:462-470`]:

> "Every trust signal (verified tier, safeguarded status, custody coverage, appraisal value, escrow ETA, rights TBC, response-rate, dispatch time) must be **evidenced by a backend row**, not asserted by the frontend."

> "A badge rendered from a hardcoded value or a frontend default is a lie of the same kind as a fabricated success state." (`AGENTS.md:470`)

> "A badge rendered from a hardcoded value or a frontend default is a lie (§11). This is the `84e289f7` standard." (`AGENTS.md:1801`)

**Every sustainability surface violates this standard.** The grade chip, CO₂ stat, water stat, and preferences-screen impact numbers are all badges rendered from hardcoded frontend defaults with no backend row. The `84e289f7` standard requires fail-closed: null means no render. The current implementation does the opposite — it fabricates a number from constants and renders it as fact.

---

## 5. Industry methodology — how competitors calculate and display impact

### 5.1 Vestiaire Collective

[VERIFIED — EXTERNAL — https://assets.vestiairecollective.com/documents/impact_report_2025.pdf, https://assets.vestiairecollective.com/documents/IMPACT-REPORT-2026.pdf]

- **Methodology:** Consequential LCA, independently validated by Inuk, reviewed by third party, subjected to public consultation.
- **Key parameters:** 85% substitution rate (displacement), 12% rebound effect (increased consumption from savings).
- **Approach:** "Monetization method" — translates different environmental impacts (CO₂, water, biodiversity) into one metric (euros), trusted by Kering, PwC, Vaayu.
- **Data:** 13,400 consumer survey responses, 250K+ transactions analyzed.
- **Claim:** "By buying pre-loved styles on Vestiaire Collective, consumers can reduce their impact by 90%."
- **Carbon credits:** 30K (FY24) and 25K (FY23) verified by Inuk — local, traceable, with substantial environmental and social co-benefits.
- **What ThryftVerse lacks:** No LCA, no substitution rate research, no rebound effect accounting, no monetization, no third-party validation, no carbon credit program.

### 5.2 Depop

[VERIFIED — EXTERNAL — https://news.depop.com/what-we-stand-for/sustainability/environmental-impact-calculations/, https://downloads.ctfassets.net/itoh30v6uh9a/77D9WuOa1fUfFcJXKGISCr/3dc49e95acc9218be2d3190f0ab99c62e/Displacement_report_2025_V8__i_.pdf]

- **Methodology:** Environmental Impact Measurement Methodology, published publicly. Estimates GHG and water savings from secondhand purchases vs new.
- **Categories covered:** Bottoms, tops, shoes, outerwear, dresses.
- **Data:** Uses **average category weight per item**. Excludes non-comparable lifecycle stages (assembly, retail, distribution, use, disposal).
- **Displacement rate:** Developed with WRAP (Waste & Resources Action Programme). November 2024 survey of Depop buyers. Methodology verified by expert review, cognitive testing, industry pilot. Accounts for impulse purchases and behavioral uncertainty.
- **Standardization:** Co-authored 2025 WRAP report for industry-wide displacement measurement standard.
- **What ThryftVerse lacks:** No published methodology, no category-weight data, no displacement rate research, no WRAP collaboration, no industry standard alignment.

### 5.3 Vinted

[VERIFIED — EXTERNAL — https://press-center-static.vinted.com/Vaayu_x_Vinted_Full_Climate_Impact_Report_2021_045f9e5c4b.pdf, https://company.vinted.com/newsroom/vinted-equation]

- **Methodology:** Consequential LCA, powered by Vaayu's API and proprietary LCA Modelling Engine.
- **Data scale:** Insights from 350,000+ Vinted users, delivery footprints of 500M+ transactions processed by Vaayu's real-time delivery model.
- **Approach:** Largest-ever primary dataset on climate impact of shopping secondhand online at scale. Comparative analysis of overall climate impact of secondhand vs new.
- **2025 results:** 1,607 kilotonnes CO₂e avoided; €21.6B saved by members on adult fashion.
- **What ThryftVerse lacks:** No Vaayu integration, no transaction-level delivery footprint, no survey-based displacement data, no LCA engine.

### 5.4 The RealReal

[VERIFIED — EXTERNAL — https://investor.therealreal.com/TRRSCWhitePaper]

- **Methodology:** TRR Sustainability Calculator, launched 2018. Calculates environmental savings for each item based on **fabric, material, and taxon**, using a methodology customized for each product category.
- **Consultants:** Shift Advantage, Inc. and Brown and Wilmanns Environmental, LLC.
- **Categories:** Originally suiting, pants, dresses, tops, knitwear, jackets, outerwear. Expanded 2022 to include denim, kids' clothing, handbags, fine jewelry, watches.
- **Results (as of March 2022):** 52,767 metric tons CO₂ saved, 2.8 billion liters water saved.
- **What ThryftVerse lacks:** No per-item material-based calculation, no fabric/taxon methodology, no environmental consultant partnership, no category-customized factors.

### 5.5 Back Market

[VERIFIED — EXTERNAL — https://assets.ctfassets.net/mmeshd7gafk1/6QScnB4poCH2pQYKzUrLbb/1a7dacc9ccc97355a3e64e1b37b2a8e4/BM-IMPACTREPORT-ENG.pdf]

- **Methodology:** "Carbon P&L" equation — compares GHG avoided (through refurbished tech sales) vs GHG contributed. ADEME (French Environment and Energy Management Agency) large-scale LCA study.
- **Data:** ADEME study assessed smartphones, laptops, tablets, desktops — full lifecycle from raw material extraction to end-of-life.
- **Results:** Refurbished smartphone uses 91% less raw materials, 86% less water, 89% less e-waste, 92% less GHG. 1.3M tons carbon equivalent avoided since 2014. 1,512 tons e-waste avoided in 2023.
- **What ThryftVerse lacks:** No ADEME-equivalent independent study, no lifecycle assessment, no Carbon P&L equation.

### 5.6 Industry summary — what ThryftVerse must build to match peers

| Capability | Vestiaire | Depop | Vinted | RealReal | Back Market | ThryftVerse |
|-----------|-----------|-------|--------|----------|-------------|-------------|
| Published methodology | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Consequential LCA | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Per-item material-based calc | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Category-weight data | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (hardcoded 8 kg) |
| Displacement rate research | ✅ (85%) | ✅ (WRAP) | ✅ (survey) | ❌ | ❌ | ❌ (hardcoded 60%) |
| Rebound effect | ✅ (12%) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Third-party validation | ✅ (Inuk) | ✅ (WRAP) | ✅ (Vaayu) | ✅ (Shift) | ✅ (ADEME) | ❌ |
| Shipping emissions netted | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Real-time delivery model | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Per-user impact ledger | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ (hardcoded 34/12) |

---

## 6. Data gap analysis — what ThryftVerse needs to collect

### 6.1 Required inputs for real impact calculation

| Required input | Currently collected? | Where it would be collected | Storage |
|----------------|---------------------|---------------------------|---------|
| **Material composition** (cotton %, polyester %, wool %) | ❌ Not collected | Seller listing flow — required field with % breakdown | `listings.material_composition` (new JSONB column) |
| **Item weight (kg)** | ❌ Not collected | Seller listing flow — measured or category default | `listings.weight_kg` (new NUMERIC column) |
| **Origin location (lat/long or postcode)** | ❌ Free-text `sellerLocation` only | Seller address (geocoded at signup) | `users.default_address_geo` (geocoded from postcode) |
| **Destination location** | ❌ `buyerLocation` rarely passed | Buyer shipping address (geocoded at checkout) | `orders.shipping_address_geo` |
| **Carrier / service mode** (air, road, rail, sea) | ❌ `postageOption.carrierId` exists at checkout but never fed to emissions model | Checkout flow — already collected | `shipping_quotes.carrier_id` + `carriers.mode` (new table) |
| **Packaging type** | ❌ Not collected | Seller dispatch flow or platform default | `shipments.packaging_type` (new column) |
| **Emissions factor database** (gCO₂e per tonne-km by mode) | ❌ No table, no API | Backend — versioned factor table | `emissions_factors` (new table) |
| **Avoided-production factor by material/category** | ❌ Single global ratio 0.6 | Backend — material-specific factors from Higg MSI / ecoinvent / DEFRA | `production_factors` (new table) |
| **Displacement rate** | ❌ Hardcoded 0.6 | User survey + WRAP methodology | `displacement_rates` (config table) |
| **Rebound effect** | ❌ Not accounted | User survey | `rebound_effects` (config table) |

### 6.2 Where in the listing/checkout flow data would be collected

**Listing flow** (`AIPoweredListingScreen.tsx:767-771` — already has `SustainabilityTags`):
- Add material composition field (multi-select % breakdown: cotton, polyester, wool, leather, etc.)
- Add weight field (kg, with category-default suggestion)
- Sustainability tags already exist but need backend persistence and verification

**Checkout flow** (`CheckoutScreen.tsx`):
- `postageOption.carrierId` already selected — map to carrier mode (air/road/rail/sea)
- Buyer shipping address already collected — geocode to lat/long or postcode
- Calculate shipping distance (origin → destination)
- Packaging type: seller selects at dispatch, or platform default

**Post-purchase**:
- On order completion, compute net avoided emissions
- Append to `user_impact_ledger` (materialised, not recomputed)
- Preferences screen reads real ledger aggregate

---

## 7. Proposed architecture — backend impact service

### 7.1 Service structure

```
backend/api/src/impact/
  emissionsFactors.ts        // versioned factor table with source citations
  impactCalculator.ts        // net avoided-emissions engine
  impactRoutes.ts            // GET /listings/:id/impact, GET /users/me/impact-ledger
  impactLedgerService.ts     // per-user lifetime ledger, written on order completion
  squakeClient.ts            // Squake shipping-leg client
  impactTypes.ts             // shared types/contracts
```

### 7.2 Emissions factor table schema

```sql
-- Migration: NNN_impact_accounting.sql

CREATE TABLE emissions_factors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factor_type     TEXT NOT NULL CHECK (factor_type IN ('production', 'eol', 'shipping', 'packaging')),
  material        TEXT,  -- 'cotton', 'polyester', 'wool', 'leather', NULL for shipping
  category        TEXT,  -- 'dress', 'jeans', 'shoes', NULL for shipping
  transport_mode  TEXT,  -- 'air', 'road', 'rail', 'sea', NULL for production
  value           NUMERIC(18,6) NOT NULL,  -- kgCO2e per kg (production) or per tonne-km (shipping)
  unit            TEXT NOT NULL,           -- 'kgCO2e/kg' or 'gCO2e/tonne-km'
  source          TEXT NOT NULL,           -- 'DEFRA_2024', 'Higg_MSI_v3.7', 'ecoinvent_3.10'
  source_url      TEXT,
  effective_date  DATE NOT NULL,
  expiry_date     DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (factor_type = 'production' AND material IS NOT NULL) OR
    (factor_type = 'eol' AND material IS NOT NULL) OR
    (factor_type = 'shipping' AND transport_mode IS NOT NULL) OR
    (factor_type = 'packaging' AND category IS NOT NULL)
  )
);

CREATE TABLE user_impact_ledger (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL REFERENCES users(id),
  order_id            TEXT NOT NULL REFERENCES orders(id),
  listing_id          TEXT NOT NULL REFERENCES listings(id),
  avoided_production  NUMERIC(18,4) NOT NULL,  -- kgCO2e
  avoided_eol         NUMERIC(18,4) NOT NULL,  -- kgCO2e
  resale_shipping     NUMERIC(18,4) NOT NULL,  -- kgCO2e (the cost of resale)
  resale_packaging    NUMERIC(18,4) NOT NULL DEFAULT 0,
  net_co2e            NUMERIC(18,4) NOT NULL,  -- net = avoided - resale costs
  water_saved_l       NUMERIC(18,4),
  methodology_version TEXT NOT NULL,
  factor_sources      JSONB NOT NULL,          -- array of {source, version, url}
  displacement_rate   NUMERIC(6,4) NOT NULL,   -- e.g. 0.85
  rebound_effect      NUMERIC(6,4) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_impact_ledger_user ON user_impact_ledger(user_id, created_at DESC);

CREATE TABLE sustainability_preferences (
  user_id                  TEXT PRIMARY KEY REFERENCES users(id),
  carbon_target_kg         INTEGER,
  ratio_target_pct         INTEGER,
  carbon_neutral_shipping  BOOLEAN NOT NULL DEFAULT false,
  plastic_free_packaging   BOOLEAN NOT NULL DEFAULT false,
  show_badges              BOOLEAN NOT NULL DEFAULT true,
  track_impact             BOOLEAN NOT NULL DEFAULT true,
  local_first              BOOLEAN NOT NULL DEFAULT false,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 7.3 Impact calculator algorithm — net avoided emissions

```typescript
// backend/api/src/impact/impactCalculator.ts

interface ImpactInput {
  materialComposition: Record<string, number>; // { cotton: 0.8, polyester: 0.2 }
  weightKg: number;
  category: string;
  originGeo: { lat: number; long: number };
  destinationGeo: { lat: number; long: number };
  carrierMode: 'air' | 'road' | 'rail' | 'sea';
  packagingType: string;
  displacementRate: number; // from survey/config, e.g. 0.85
  reboundEffect: number;    // from survey/config, e.g. 0.12
}

interface ImpactResult {
  avoidedProductionKgCo2e: number;
  avoidedEolKgCo2e: number;
  resaleShippingKgCo2e: number;
  resalePackagingKgCo2e: number;
  netKgCo2e: number;
  waterSavedL: number;
  methodologyVersion: string;
  factorSources: Array<{ source: string; version: string; url: string }>;
}

async function computeNetAvoidedEmissions(input: ImpactInput): Promise<ImpactResult | null> {
  // Fail-closed per §11: if required data is missing, return null
  if (!input.materialComposition || input.weightKg <= 0 || !input.carrierMode) {
    return null;
  }

  // 1. Avoided production: sum(material_factor × material_fraction × weight) × displacementRate
  const avoidedProduction = Object.entries(input.materialComposition).reduce(
    (sum, [material, fraction]) => sum + getProductionFactor(material) * fraction * input.weightKg,
    0,
  ) * input.displacementRate;

  // 2. Avoided EOL: weight × disposal_factor × displacementRate
  const avoidedEol = input.weightKg * getEolFactor(input.category) * input.displacementRate;

  // 3. Resale shipping: distance × mode × weight × gCO2e/tonne-km (via Squake or DEFRA)
  const distanceKm = haversineDistance(input.originGeo, input.destinationGeo);
  const resaleShipping = await computeShippingEmissions({
    distanceKm,
    mode: input.carrierMode,
    weightKg: input.weightKg,
  }); // Squake API call or local factor table

  // 4. Resale packaging
  const resalePackaging = getPackagingFactor(input.packagingType);

  // 5. Net = (avoidedProduction + avoidedEol) × (1 - reboundEffect) - resaleShipping - resalePackaging
  const grossAvoided = (avoidedProduction + avoidedEol) * (1 - input.reboundEffect);
  const netCo2e = grossAvoided - resaleShipping - resalePackaging;

  // 6. Water saved: material-specific water factors × weight × displacementRate
  const waterSavedL = Object.entries(input.materialComposition).reduce(
    (sum, [material, fraction]) => sum + getWaterFactor(material) * fraction * input.weightKg,
    0,
  ) * input.displacementRate;

  return {
    avoidedProductionKgCo2e: round(avoidedProduction, 4),
    avoidedEolKgCo2e: round(avoidedEol, 4),
    resaleShippingKgCo2e: round(resaleShipping, 4),
    resalePackagingKgCo2e: round(resalePackaging, 4),
    netKgCo2e: round(netCo2e, 4),
    waterSavedL: round(waterSavedL, 4),
    methodologyVersion: '1.0.0',
    factorSources: getFactorSources(),
  };
}
```

### 7.4 Squake integration

[VERIFIED — EXTERNAL — https://www.squake.earth/]

Squake offers three products:
- **Gravity™** — travel program emissions dashboard (not relevant)
- **Impact™** — carbon credit retirement (for offset claims)
- **Origin™** — end-to-end sustainability integration for platforms: certified carbon calculations, compensation options, SAF offerings. GLEC-certified calculations. ISO 27001 certified.

**Recommendation:** Integrate **Squake Origin™** for shipping-leg emissions (the variable, transactional part). Squake is GLEC-accredited and ISO 27001 certified, which supports audit requirements under the EU directive. API key via env: `SQUAKE_API_KEY`.

```typescript
// backend/api/src/impact/squakeClient.ts

async function computeShippingEmissions(input: {
  distanceKm: number;
  mode: 'air' | 'road' | 'rail' | 'sea';
  weightKg: number;
}): Promise<number> {
  const response = await fetch('https://api.squake.earth/v1/emissions/shipping', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SQUAKE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      distance_km: input.distanceKm,
      transport_mode: input.mode,
      weight_kg: input.weightKg,
    }),
  });
  if (!response.ok) {
    // Fail-closed: if Squake is unavailable, return null and render NO claim
    throw new Error(`Squake API error: ${response.status}`);
  }
  const data = await response.json();
  return data.co2e_kg;
}
```

### 7.5 Alternative: Carbon Interface

[VERIFIED — EXTERNAL — https://www.carboninterface.com/]

Carbon Interface offers a REST API with shipping emissions estimates between two locations. Data sourced from EPA, GHG Protocol, Environment Canada. Pricing: Free (200 req/mo), Startup ($30/mo, 5000 req), Business ($250/mo, 100K req). Good fallback for shipping-leg emissions if Squake is not selected.

### 7.6 API endpoints

```
GET /listings/:id/impact
  → Returns { avoidedProductionKgCo2e, avoidedEolKgCo2e, resaleShippingKgCo2e, netKgCo2e, methodologyVersion, factorSources[] }
  → Returns null if data incomplete (fail-closed)

GET /users/me/impact-ledger
  → Returns aggregated lifetime impact from user_impact_ledger (materialised)
  → { totalNetCo2eKg, totalWaterSavedL, totalItems, perMonthBreakdown }

GET /users/me/sustainability-preferences
  → Returns persisted preferences from sustainability_preferences table

PUT /users/me/sustainability-preferences
  → Upserts preferences server-side
```

### 7.7 Audit trail

Every `user_impact_ledger` row stores:
- `methodology_version` — which calculation version produced this number
- `factor_sources` — JSONB array of every factor source used (DEFRA 2024, Higg MSI v3.7, etc.) with URLs
- `displacement_rate` and `rebound_effect` — the exact rates applied
- All inputs are traceable to the listing, order, and shipment

This satisfies the EU directive's requirement for **independent third-party verification** — an auditor can trace any claim back to its factors, sources, and calculation version.

---

## 8. Transparent disclosure UI — proposed replacement

### 8.1 Replace fabricated claims with conditional rendering

| Current | Proposed | Rationale |
|---------|----------|-----------|
| "By buying secondhand, you save ~X kg CO₂ vs buying new." (`SustainabilityImpact.tsx:71`) | "Estimated net CO₂e avoided: X kg" — **only when backend returns a computed value** | Fail-closed per §11 |
| "Buying this pre-owned item saves ~X kg CO2 and ~Y liters of water vs buying new." (`sustainabilityScore.ts:279`) | "Based on {material} × {weight} kg, avoided production ({source}), minus resale shipping {distance} km by {mode} ({source}). Methodology v{N}." | EU directive: explicit disclosure |
| "Excellent sustainability" grade label (`SustainabilityBadge.tsx:54, 131`) | Remove A–D grade labels. Replace with factual impact range: "Low / Medium / High avoided emissions" tied to computed kgCO₂e bands, disclosed | EU directive: no generic claims |
| `co2SavedKg = 34`, `itemsRescued = 12` (`SustainabilityPreferencesScreen.tsx:129-130`) | Read from `GET /users/me/impact-ledger`. Empty state: "No completed purchases yet" per §14 | Fail-closed per §11 |
| `SUSTAINABILITY_DEMO_MODE = __DEV__` (`SustainabilityPreferencesScreen.tsx:40`) | Remove entirely. Production must never show fabricated figures | §11 violation |
| "Carbon-neutral shipping" toggle (`SustainabilityPreferencesScreen.tsx:250-253`) | Only surface when sellers/carriers actually offer verified carbon-neutral options (evidenced by backend rows) | §11: no badge without backend row |
| `carbonNeutral={commerce.shippingPayer === 'seller'}` (`ItemDetailScreen.tsx:1365`) | Replace with `carbonNeutral={commerce.verifiedCarbonNeutral}` from backend flag | False equivalence fix |
| "Carbon-neutral shipping" seller tag (`SustainabilityTags.tsx:78-82`) | Remove or require seller to provide offset certificate (verified by backend) | EU directive: no offset-based claims without verification |

### 8.2 Methodology disclosure sheet

Expandable sheet at every impact claim point:
```
Methodology
─────────────────────────────────────
This estimate uses:
• Material: 80% cotton, 20% polyester
• Weight: 0.45 kg
• Avoided production: 3.2 kg CO₂e (Higg MSI v3.7)
• Avoided end-of-life: 0.3 kg CO₂e (DEFRA 2024)
• Resale shipping: 0.4 kg CO₂e (Squake, 320 km road freight)
• Net avoided: 3.1 kg CO₂e
• Displacement rate: 85% (WRAP 2025 methodology)
• Rebound effect: 12% (Vestiaire/Inuk methodology)

Methodology version: 1.0.0
Full methodology: [link]
```

---

## 9. AGENTS.md §11 compliance — every violation documented

The charter states: **"A badge rendered from a hardcoded value or a frontend default is a lie."** (`AGENTS.md:470, 1801`)

| # | Surface | Hardcoded value | Frontend default | Backend row | Violation |
|---|---------|----------------|-----------------|-------------|-----------|
| 1 | `sustainabilityScore.ts:113` | `NEW_CO2_KG = 8` | Yes | ❌ | Lie — constant dressed as measurement |
| 2 | `sustainabilityScore.ts:114` | `NEW_WATER_L = 2900` | Yes | ❌ | Lie — constant dressed as measurement |
| 3 | `sustainabilityScore.ts:115` | `RESALE_SAVINGS_RATIO = 0.6` | Yes | ❌ | Lie — no displacement research |
| 4 | `sustainabilityScore.ts:58-81` | 20-brand allowlist | Yes | ❌ | Lie — no public registry cross-check |
| 5 | `sustainabilityScore.ts:276` | `co2SavedKg = 8 * 0.6 * weight` | Yes | ❌ | Lie — formula produces 3.4–6.7 kg for ANY item |
| 6 | `sustainabilityScore.ts:277` | `waterSavedL = 2900 * 0.6 * weight` | Yes | ❌ | Lie — formula produces 1,218–2,436 L for ANY item |
| 7 | `SustainabilityPreferencesScreen.tsx:129` | `co2SavedKg = 34` | Yes | ❌ | Lie — hardcoded literal, no ledger |
| 8 | `SustainabilityPreferencesScreen.tsx:130` | `itemsRescued = 12` | Yes | ❌ | Lie — hardcoded literal, no ledger |
| 9 | `SustainabilityPreferencesScreen.tsx:40` | `SUSTAINABILITY_DEMO_MODE = __DEV__` | Yes | ❌ | Lie — production hides disclaimer |
| 10 | `SustainabilityPreferencesScreen.tsx:250-253` | "Carbon-neutral shipping" toggle | Yes | ❌ | Lie — no carbon-neutral option exists |
| 11 | `ItemDetailScreen.tsx:1365` | `carbonNeutral={shippingPayer === 'seller'}` | Yes | ❌ | Lie — free shipping ≠ carbon-neutral |
| 12 | `SustainabilityTags.tsx:78-82` | "Carbon-neutral shipping" seller tag | Yes | ❌ | Lie — no offset mechanism exists |
| 13 | `SustainabilityBadge.tsx:54, 131` | "Excellent/Good/Moderate/Low" grade | Yes | ❌ | Lie — grade from heuristic, not measurement |
| 14 | `ProductCardV2.tsx:118-128` | Card chip from `computeSustainabilityScore` | Yes | ❌ | Lie — no buyer location, no co-own passed |
| 15 | `BrowseScreen.tsx:700-707` | "Sustainable" filter from heuristic | Yes | ❌ | Lie — backend doesn't know about grade |
| 16 | `SustainabilityPreferencesScreen.tsx:48, 92-126` | Preferences in AsyncStorage only | Yes | ❌ | Lie — not backend-backed, not cross-device |

**Total: 16 distinct §11 violations.** Every sustainability surface in the app is a badge rendered from a hardcoded value or frontend default. [VERIFIED — CODE]

---

## 10. Implementation priority and sequencing

### Phase 1 — Stop lying (week 1, compliance-critical)
1. Remove `SustainabilityPreferencesScreen.tsx:129-130` hardcoded `34`/`12` — show empty state or read from backend
2. Remove `SUSTAINABILITY_DEMO_MODE = __DEV__` gate (L40) — if figures are illustrative, disclaimer must show in production too
3. Fix `ItemDetailScreen.tsx:1365` — remove `carbonNeutral={shippingPayer === 'seller'}` false equivalence
4. Remove "Carbon-neutral shipping" seller tag from `SustainabilityTags.tsx:78-82` or gate behind verified offset
5. Remove "Carbon-neutral shipping" toggle from `SustainabilityPreferencesScreen.tsx:250-253` or gate behind backend flag
6. Change all "saves X kg CO₂" copy to "Estimated" with methodology disclosure link

### Phase 2 — Backend impact service (weeks 2-4)
1. Create `emissions_factors`, `user_impact_ledger`, `sustainability_preferences` tables (migration)
2. Build `impactCalculator.ts` with net avoided-emissions algorithm
3. Integrate Squake for shipping-leg emissions
4. Add `GET /listings/:id/impact` and `GET /users/me/impact-ledger` endpoints
5. Add material composition + weight fields to listing flow
6. Persist sustainability preferences server-side

### Phase 3 — Real impact display (weeks 4-6)
1. Replace frontend `computeSustainabilityScore` with backend `GET /listings/:id/impact` call
2. Fail-closed: if backend returns null, render no impact claim
3. Add methodology disclosure sheet
4. Replace A–D grade with factual impact range
5. Preferences screen reads real `user_impact_ledger` aggregate
6. Remove `SustainabilityImpact.tsx` dead code or wire it to backend data

### Phase 4 — Industry alignment (weeks 6-12)
1. Commission displacement rate research (WRAP methodology)
2. Publish methodology publicly (like Depop, Vestiaire)
3. Third-party validation of calculation (like Inuk for Vestiaire)
4. Add rebound effect accounting
5. Add water-saving calculation with material-specific factors

---

## 11. Evidence index — all verified citations

### Code citations [VERIFIED — CODE]
- `frontend/src/utils/sustainabilityScore.ts:2-18` — self-labelled "heuristic, client-side estimate"
- `frontend/src/utils/sustainabilityScore.ts:58-81` — hardcoded 20-brand "sustainable" allowlist
- `frontend/src/utils/sustainabilityScore.ts:105-110` — category weight factors (0.7–1.4)
- `frontend/src/utils/sustainabilityScore.ts:113-115` — hardcoded `NEW_CO2_KG=8`, `NEW_WATER_L=2900`, `RESALE_SAVINGS_RATIO=0.6`
- `frontend/src/utils/sustainabilityScore.ts:129-152` — condition points (10–25)
- `frontend/src/utils/sustainabilityScore.ts:154-165` — category points (10–20)
- `frontend/src/utils/sustainabilityScore.ts:180-186` — local-seller heuristic (same-country string match only)
- `frontend/src/utils/sustainabilityScore.ts:193-198` — grade bands (A≥60, B≥40, C≥20, D<20)
- `frontend/src/utils/sustainabilityScore.ts:207-289` — `computeSustainabilityScore` main function
- `frontend/src/utils/sustainabilityScore.ts:276-279` — CO₂/water computed from constants; summary string
- `frontend/src/utils/sustainabilityScore.ts:295-298` — `isSustainableGrade` predicate
- `frontend/src/components/commerce/detail/SustainabilityImpact.tsx:1-195` — DEAD CODE, never imported by any screen
- `frontend/src/components/commerce/detail/SustainabilityImpact.tsx:71` — "you save ~X kg CO₂" definitive claim
- `frontend/src/components/commerce/detail/SustainabilityImpact.tsx:113-115` — weak disclaimer
- `frontend/src/components/commerce/detail/index.ts:43-44` — exported but never consumed
- `frontend/src/components/product/SustainabilityBadge.tsx:46-82` — grade labels "Excellent/Good/Moderate/Low"
- `frontend/src/components/product/SustainabilityBadge.tsx:128` — "ESTIMATED IMPACT" eyebrow
- `frontend/src/components/product/SustainabilityBadge.tsx:131` — "{label} sustainability" title
- `frontend/src/components/product/SustainabilityBadge.tsx:136-138` — summary string rendered
- `frontend/src/components/product/SustainabilityBadge.tsx:169-190` — CO₂e + water stat cells
- `frontend/src/components/product/SustainabilityBadge.tsx:192-194` — disclaimer
- `frontend/src/components/ProductCardV2.tsx:116-130` — card chip computed client-side, no buyer location
- `frontend/src/components/ProductCardV2.tsx:217-233` — badge cascade: price drop > sold > condition > sustainability
- `frontend/src/components/ProductCardV2.tsx:543-547` — sustainability chip wrap style
- `frontend/src/screens/BrowseScreen.tsx:46` — imports `isSustainableGrade`
- `frontend/src/screens/BrowseScreen.tsx:694-709` — "Sustainable" filter, client-side only, backend unaware
- `frontend/src/screens/FilterScreen.tsx:42` — imports `isSustainableGrade`
- `frontend/src/screens/FilterScreen.tsx:797-849` — "Sustainable only" toggle, caption "Estimated grade A or B items"
- `frontend/src/screens/SustainabilityPreferencesScreen.tsx:40` — `SUSTAINABILITY_DEMO_MODE = __DEV__`
- `frontend/src/screens/SustainabilityPreferencesScreen.tsx:48` — AsyncStorage key, no backend
- `frontend/src/screens/SustainabilityPreferencesScreen.tsx:60-68` — DEFAULT_PREFS
- `frontend/src/screens/SustainabilityPreferencesScreen.tsx:88-126` — AsyncStorage hydrate/persist only
- `frontend/src/screens/SustainabilityPreferencesScreen.tsx:129-130` — hardcoded `co2SavedKg=34`, `itemsRescued=12`
- `frontend/src/screens/SustainabilityPreferencesScreen.tsx:157-168` — demo banner only in `__DEV__`
- `frontend/src/screens/SustainabilityPreferencesScreen.tsx:250-253` — "Carbon-neutral shipping" toggle
- `frontend/src/screens/SustainabilityPreferencesScreen.tsx:256-263` — "Plastic-free packaging" toggle
- `frontend/src/screens/SustainabilityPreferencesScreen.tsx:268-290` — badges, impact tracking, local first toggles
- `frontend/src/components/sell/SustainabilityTags.tsx:52-89` — 6 seller-selectable tags
- `frontend/src/components/sell/SustainabilityTags.tsx:78-82` — "Carbon-neutral shipping" tag, "You offset the carbon cost of shipping"
- `frontend/src/components/sell/SustainabilityTags.tsx:186-220` — impact summary shown when tags active
- `frontend/src/screens/AIPoweredListingScreen.tsx:767-771` — SustainabilityTags in sell flow
- `frontend/src/components/commerce/detail/ShippingReturnsInfo.tsx:145-152` — carbon-neutral badge
- `frontend/src/screens/ItemDetailScreen.tsx:1363-1366` — `carbonNeutral={commerce.shippingPayer === 'seller'}` (false equivalence)
- `frontend/src/screens/SettingsScreen.tsx:204` — settings entry, `searchTerms: 'carbon neutral packaging badges eco secondhand'`
- `frontend/src/screens/SettingsScreen.tsx:789-794` — "Sustainability" settings row
- `frontend/src/services/commandPaletteApi.ts:577-583` — command palette entry
- `frontend/src/screens/YourAlgorithmScreen.tsx:82` — "Sustainability interest" topic
- `frontend/src/services/algorithmTransparencyApi.ts:204-211` — mock sustainability topic, `isDemo: true`
- `frontend/src/i18n/locales/en.json:266-267` — i18n strings
- `frontend/src/store/useStore.ts:170-171` — `sustainableOnly` filter state
- `frontend/src/components/animations/animationAssets.ts:130` — onboarding sell comment
- `frontend/src/__tests__/flagshipProductionDetailPass.test.ts:48-52` — test guards for chip cascade
- `backend/api/src/index.ts` — 100 grep matches, ALL false positives (auction/escrow/payout sweep jobs, trading price impact)
- `backend/api/src/db/migrations/101_coown_recourse_and_verification.sql:127` — "monetary impact" (financial, not environmental)
- `AGENTS.md:462-470` — §11 fail-closed trust signals, "badge from hardcoded value is a lie"
- `AGENTS.md:1801` — §37.5 `84e289f7` standard reaffirmation
- `README.md:169` — sustainability preferences in settings list

### External citations [VERIFIED — EXTERNAL]
- CMA Green Claims Code (2021): https://terraverde-solutions.com/corporate-sustainability/40-of-online-green-claims-are-potentially-misleading/ — six principles
- CMA Green Claims Code + ASA/CAP: https://www.packaging-gateway.com/features/packagings-green-claims-enter-the-age-of-proof/ — January 2026 supply chain guidance
- EU Directive 2024/825 (EUR-Lex): https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024L0825 — adopted 28 Feb 2024, apply from 27 Sep 2026
- EU Commission ECGT FAQ: https://commission.europa.eu/document/download/3c257883-bb2a-4dd9-a6dc-501d587bb34f_en — generic claims banned, offset-based claims discouraged
- DETE Ireland summary: https://enterprise.gov.ie/en/what-we-do/the-business-environment/empowering-consumers-for-the-green-transition/ — generic claims banned unless substantiated
- Depop methodology: https://news.depop.com/what-we-stand-for/sustainability/environmental-impact-calculations/ — GHG/water savings, category weights, WRAP collaboration
- Depop/WRAP displacement report: https://downloads.ctfassets.net/itoh30v6uh9a/77D9WuOa1fUfFcJXKGISCr/3dc49e95acc9218be2d3190f0ab99c62e/Displacement_report_2025_V8__i_.pdf — standardized displacement measurement
- Vestiaire 2025 Impact Report: https://assets.vestiairecollective.com/documents/impact_report_2025.pdf — 85% substitution, 12% rebound, Inuk validation, monetization method
- Vestiaire 2026 Impact Update: https://assets.vestiairecollective.com/documents/IMPACT-REPORT-2026.pdf — 90% impact reduction claim
- Vestiaire 2024 Circularity Report: https://assets.vestiairecollective.com/documents/sustainability/2024-circularity-report-us-en.pdf — cost-per-wear, Vaayu partnership, 13,400 respondents
- Vinted/Vaayu Climate Report: https://press-center-static.vinted.com/Vaayu_x_Vinted_Full_Climate_Impact_Report_2021_045f9e5c4b.pdf — consequential LCA, 350K users, 500M transactions
- Vinted Equation 2025: https://company.vinted.com/newsroom/vinted-equation — 1,607 ktCO₂e avoided, €21.6B saved
- The RealReal White Paper: https://investor.therealreal.com/TRRSCWhitePaper — per-item fabric/material/taxon methodology, Shift Advantage + Brown Wilmanns
- Back Market Impact Report: https://assets.ctfassets.net/mmeshd7gafk1/6QScnB4poCH2pQYKzUrLbb/1a7dacc9ccc97355a3e64e1b37b2a8e4/BM-IMPACTREPORT-ENG.pdf — ADEME LCA, Carbon P&L, 92% less GHG
- Squake: https://www.squake.earth/ — Origin™ platform integration, GLEC-certified, ISO 27001
- Carbon Interface: https://www.carboninterface.com/ — shipping emissions API, EPA/GHG Protocol data, free tier 200 req/mo

---

## 12. Verdict

**ThryftVerse's sustainability accounting is 100% illustrative.** No figure is computed from real transactional, logistical, or material data. The "saves X kg CO₂" claim is a hardcoded constant (8 × 0.6 × category weight) dressed in category scaling. The preferences screen shows hardcoded `34 kg / 12 items` as user impact. The "carbon-neutral shipping" badge is triggered by "seller pays shipping" — a false equivalence. The `SustainabilityImpact` detail component is dead code. The backend has zero impact infrastructure.

This fails:
- **UK CMA Green Claims Code** — 6/6 principles violated
- **EU Empowering Consumers Directive 2024/825** (in force Sep 2026) — generic claims, unsubstantiated claims, carbon-neutral claims without verification
- **UK DMCC Act 2024** — enforcement risk up to 10% global turnover
- **AGENTS.md §11** — 16 distinct violations of the `84e289f7` standard

The path to compliance requires: (1) stop fabricating in week 1, (2) build a backend impact service with net avoided-emissions methodology, (3) integrate Squake for shipping-leg emissions, (4) collect material/weight/distance data in the listing and checkout flows, (5) commission displacement rate research, (6) publish methodology and obtain third-party validation.

---

*Audit complete. No source files modified. Report only. 552 lines.*
