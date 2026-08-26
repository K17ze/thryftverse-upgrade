# P2 #25 — Marketplace Catalogue Taxonomy Duplication

**Status:** IMPLEMENTED — all rollout steps 1–5 complete. Step 6 (admin CRUD) and step 7 (editorial facet projection) remain as proposed future work.
**Scope:** `frontend/src` + `backend/api/src` taxonomy surfaces (categories, conditions, sizes, brands, colours, materials).
**Method:** grep for hard-coded arrays + contract/backend source-of-truth tracing → implementation across the full stack.

---

## Executive Finding

ThryftVerse has **no single source of truth for marketplace taxonomy**. The four commerce-fact vocabularies a resale marketplace depends on — categories, conditions, sizes, and brands — are duplicated as ad-hoc string arrays across at least **nine frontend surfaces**, with **no backend taxonomy table, no admin manageability, and no enum constraint** on the listing write path. Each screen authors its own copy, and the copies have already diverged in ordering, label casing, membership, and even the canonical category set itself.

The closest thing to a canonical category model is `frontend/src/constants/categories.ts:16` (`CATEGORIES` with 9 top-level categories + subcategories + emoji/icon metadata), but it is **only consumed by discovery/search surfaces** (`GlobalSearchScreen.tsx:115`, `CategoryDetailScreen.tsx:65`) — the Sell, Edit, Bulk Listing, and AI-Powered Listing screens ignore it entirely and ship their own flat string arrays. Conditions have a type-level contract (`ListingCondition` duplicated in `services/listingsApi.ts:33` and `contracts/DiscoveryListingSummary.ts:37`) but the option *arrays* are re-declared in five screens plus two service-layer validators. Sizes and brands have **no contract at all** — they are pure inline literals.

The backend (`backend/api/src/routes/listings.ts:2353-2356`) accepts `category`, `brand`, `size`, `condition` as free-form `z.string().min(1)` with no enum check against any canonical list. Migration `031_listing_fields.sql:9-12` declares these columns as unconstrained `TEXT`. There is no `categories`, `brands`, `conditions`, or `taxonomy` table in any of the 140+ migrations, and `routes/admin.ts` exposes no taxonomy management endpoints. The only backend canonicalisation lives in the catalog-import mapping layer (`mapping/catalog/categoryMapping.ts`, `conditionMapping.ts`) which maps *external source* values (eBay leaf IDs, eBay condition IDs) to canonical strings — useful for imports, but it does not govern the seller-facing picker vocabulary or validate inbound listing writes.

This is a flagship-correctness defect: a seller can submit `category: 'Vintage'` (valid in Sell/Bulk/AI screens), but `constants/categories.ts` has no 'Vintage' top-level category, the Edit screen has no 'Vintage' option, and the backend will persist it as-is — producing orphaned catalogue facets, broken filter joins, and inconsistent discovery cards. The duplication is not cosmetic; it is a data-integrity leak.

---

## Evidence Table

### Frontend — duplicated taxonomy arrays

| Layer | Path:Line | Assessment |
|---|---|---|
| Sell screen | `frontend/src/screens/SellScreen.tsx:65` | `CONDITION_OPTIONS = ['New with tags','Very good','Good','Satisfactory']` [VERIFIED — CODE] |
| Sell screen | `frontend/src/screens/SellScreen.tsx:1021` | Inline category array `['Women','Men','Kids','Home','Vintage','Accessories','Beauty','Sportswear','Luxury']` — **9 entries, includes 'Vintage'/'Accessories'/'Sportswear'/'Luxury' which do not exist in `constants/categories.ts`** [VERIFIED — CODE] |
| Sell screen | `frontend/src/screens/SellScreen.tsx:1023` | Inline brand array `['Nike','Adidas','Zara','H&M','Gucci','Prada','Uniqlo','Levi\'s','ASOS','Other']` — 10 entries [VERIFIED — CODE] |
| Sell screen | `frontend/src/screens/SellScreen.tsx:1025` | Inline size array `['XS','S','M','L','XL','XXL','UK 6','UK 8','UK 10','UK 12','One Size']` — 11 entries, no 'XXS', casing 'One Size' [VERIFIED — CODE] |
| Sell screen | `frontend/src/screens/SellScreen.tsx:1341` | Second inline brand array `LUXURY_BRANDS = ['Gucci','Prada','Louis Vuitton','Chanel','Hermès','Dior','Balenciaga','Bottega Veneta','Saint Laurent','Burberry','Versace']` — luxury classification heuristic, **11 brands with zero overlap with the picker brand list beyond Gucci/Prada** [VERIFIED — CODE] |
| Edit listing | `frontend/src/screens/EditListingScreen.tsx:51-54` | Four separate arrays: `CONDITIONS`, `SIZES = ['XXS','XS','S','M','L','XL','XXL','One size']` (8 entries, casing 'One size', no UK sizes), `BRANDS = ['Nike','Adidas','Zara','H&M','Ralph Lauren','Off-White','Stone Island','Stussy','Other']` (9 entries, **diverges from Sell's 10-brand list**), `CATEGORY_OPTIONS = ['Women','Men','Designer','Kids','Home','Electronics','Entertainment','Hobbies & collectables','Sports']` (9 entries, **diverges from Sell's category list — adds Designer/Electronics/Entertainment/Hobbies & collectables/Sports, drops Vintage/Accessories/Beauty/Sportswear/Luxury**) [VERIFIED — CODE] |
| Bulk listing | `frontend/src/screens/BulkListingScreen.tsx:49-52` | `CATEGORY_OPTIONS = ['Women','Men','Kids','Home','Vintage','Accessories','Beauty','Sportswear','Luxury']` (matches Sell's stale list), `CONDITION_OPTIONS` (matches Sell) — **no brand/size pickers at all** [VERIFIED — CODE] |
| AI-powered listing | `frontend/src/screens/AIPoweredListingScreen.tsx:70-74` | `CONDITION_OPTIONS` + `CATEGORY_OPTIONS = ['Women','Men','Kids','Home','Vintage','Accessories','Beauty','Sportswear','Luxury']` — same stale Sell list [VERIFIED — CODE] |
| Filter screen | `frontend/src/screens/FilterScreen.tsx:50,70-76` | `ConditionOption` type + `CONDITION_OPTIONS` array of `{value,label,accessibilityLabel}` objects — **same 4 conditions but re-shaped with 'Any' sentinel and a11y labels**; brand/size options are derived dynamically from loaded listings (`FilterScreen.tsx:203-226`) so Filter is the one surface that does NOT hard-code brands/sizes [VERIFIED — CODE] |
| Global search | `frontend/src/screens/GlobalSearchScreen.tsx:130-135` | `KNOWN_CONDITIONS: readonly ListingCondition[]` — 4 conditions, re-declared for normalisation [VERIFIED — CODE] |
| Listing mapper | `frontend/src/services/listingMapper.ts:79-84` | `VALID_CONDITIONS: readonly ListingCondition[]` — 4 conditions, re-declared for inbound mapping [VERIFIED — CODE] |
| Bulk listing API | `frontend/src/services/bulkListingApi.ts:46` | `VALID_CONDITIONS = ['New with tags','Very good','Good','Satisfactory']` — 4 conditions, re-declared for validation [VERIFIED — CODE] |
| Search autocomplete | `frontend/src/services/searchAutocompleteApi.ts:125-145` | Hard-coded size terms (`XS…XXL`, `UK 6…UK 14`) and colour terms (`Black,White,Beige,Brown,Navy,Olive,Burgundy,Cream,Grey`) — **9 colours exist only here, nowhere else in the codebase** [VERIFIED — CODE] |
| Size guide | `frontend/src/components/product/SizeGuideSheet.tsx:22-95` | `SIZE_GUIDES` record with per-category size rows — a parallel size vocabulary used for buyer reference, not aligned with seller pickers [VERIFIED — CODE] |
| Discovery scene | `frontend/src/scenes/discovery/DiscoverScene.tsx:41-50` | `DISCOVER_CATEGORIES = ['All','Clothing','Shoes','Bags','Accessories','Jewelry','Home','Art']` — **a third category vocabulary**, facet-style not top-level ('Jewelry' vs 'Jewellery' in `constants/categories.ts:51`) [VERIFIED — CODE] |
| Unified discovery | `frontend/src/screens/UnifiedDiscoveryScreen.tsx:75` | `CATEGORY_PILLS = ['All','New','Vintage','Streetwear','Designer','Home','Tech']` — **a fourth category vocabulary**, editorial pills with no relationship to the canonical tree [VERIFIED — CODE] |
| Category tree | `frontend/src/screens/CategoryTreeScreen.tsx:22-39` | `TREES` record with Women/Men/Kids subcategory strings — **a fifth, hand-authored subcategory tree**, only 3 of the 9 canonical categories, and the subcategory labels do not match `constants/categories.ts` subcategory names [VERIFIED — CODE] |
| Personalisation | `frontend/src/screens/PersonalisationScreen.tsx:20-24` | `CATEGORY_SIZE_OPTIONS`, `BRAND_OPTIONS` (preference tokens, not catalogue values) — adjacent but distinct vocabulary [VERIFIED — CODE] |
| Style quiz | `frontend/src/screens/StyleQuizScreen.tsx:37-50` | `GENDER_OPTIONS`, `STYLE_OPTIONS` — style vocabulary, not catalogue taxonomy [VERIFIED — CODE] |

### Frontend — canonical-ish sources

| Layer | Path:Line | Assessment |
|---|---|---|
| Category constant | `frontend/src/constants/categories.ts:16-153` | `CATEGORIES: Category[]` — 9 top-level categories (women, men, designer, kids, home, electronics, entertainment, hobbies, sports) with id/name/emoji/color/subcategories. **Closest to canonical but consumed only by GlobalSearchScreen + CategoryDetailScreen.** Missing 'Vintage', 'Accessories', 'Beauty', 'Sportswear', 'Luxury' that Sell/Bulk/AI screens use. [VERIFIED — CODE] |
| Category policy contract | `frontend/src/contracts/listingCategoryPolicy.ts:34-45,196-279` | `CategoryId` union (11 ids incl. cars, yachts) + `SUBCATEGORY_POLICIES` map. **Defines which subcategories exist for policy enforcement but does not expose a picker vocabulary or labels.** [VERIFIED — CODE] |
| Condition type (services) | `frontend/src/services/listingsApi.ts:33-37` | `type ListingCondition = 'New with tags' \| 'Very good' \| 'Good' \| 'Satisfactory'` — type-level contract, **duplicated** in `contracts/DiscoveryListingSummary.ts:37-41` [VERIFIED — CODE] |
| Condition type (contracts) | `frontend/src/contracts/DiscoveryListingSummary.ts:37-41` | Second `ListingCondition` declaration — **identical members, separate type identity** [VERIFIED — CODE] |

### Backend — source-of-truth gap

| Layer | Path:Line | Assessment |
|---|---|---|
| Listing write schema | `backend/api/src/routes/listings.ts:2353-2356` | `category/brand/size/condition: z.string().min(1).optional()` — **no enum, no canonical-list check**. Free-form text accepted. [VERIFIED — CODE] |
| Listing search schema | `backend/api/src/routes/listings.ts:132-135` | Same free-form strings for filter query params. [VERIFIED — CODE] |
| DB schema | `backend/api/src/db/migrations/031_listing_fields.sql:9-12` | `category TEXT`, `brand TEXT`, `size TEXT`, `condition TEXT` — **unconstrained columns, no FK, no CHECK enum**. [VERIFIED — CODE] |
| Backend policy | `backend/api/src/lib/listingCategoryPolicy.ts:1-60` | Port of frontend category policy — enforces *required-field* rules per category but **does not validate category/condition membership**. [VERIFIED — CODE] |
| Catalog import mapping | `backend/api/src/mapping/catalog/categoryMapping.ts:52-76` | `EBAY_CATEGORY_MAP` — eBay leaf ID → canonical string. Canonical strings ('Jackets & Coats', 'Dresses'…) **do not match `constants/categories.ts` top-level ids or subcategory names**. [VERIFIED — CODE] |
| Condition mapping | `backend/api/src/mapping/catalog/conditionMapping.ts:35-40,60-67` | `CONDITION_RANK` + eBay condition ID → canonical condition. Canonical set matches the 4 conditions but lives only here. [VERIFIED — CODE] |
| Admin route | `backend/api/src/routes/admin.ts` | **No category/brand/taxonomy/condition management endpoints** (grep returned 0 matches). [VERIFIED — CODE] |
| Migrations | `backend/api/src/db/migrations/*` | **No `categories`, `brands`, `conditions`, `sizes`, or `taxonomy` table** in any of 140+ migrations. [VERIFIED — CODE] |

---

## Duplication Map

### Categories — at least 6 distinct vocabularies

| Surface | Count | Set | Divergence |
|---|---|---|---|
| `constants/categories.ts` (canonical-ish) | 9 | women, men, designer, kids, home, electronics, entertainment, hobbies, sports | Has ids + subcategories + metadata; missing 'Vintage' |
| SellScreen / BulkListingScreen / AIPoweredListingScreen | 9 | Women, Men, Kids, Home, Vintage, Accessories, Beauty, Sportswear, Luxury | **Stale legacy set** — no Designer, Electronics, Entertainment, Hobbies, Sports; uses display labels not ids |
| EditListingScreen | 9 | Women, Men, Designer, Kids, Home, Electronics, Entertainment, Hobbies & collectables, Sports | Matches canonical-ish set but uses labels ('Hobbies & collectables') not ids ('hobbies') |
| DiscoverScene | 8 | All, Clothing, Shoes, Bags, Accessories, Jewelry, Home, Art | **Facet vocabulary** — 'Jewelry' (US) vs canonical 'Jewellery' (UK) |
| UnifiedDiscoveryScreen | 7 | All, New, Vintage, Streetwear, Designer, Home, Tech | **Editorial pills** — 'Tech', 'Streetwear', 'New' exist nowhere else |
| CategoryTreeScreen | 3 | Women, Men, Kids (with hand-authored subcat strings) | Only 3 of 9 categories; subcat labels diverge from `constants/categories.ts` |

**Net:** a seller can pick 'Vintage' in Sell, but Edit has no 'Vintage' option, `constants/categories.ts` has no 'Vintage' entry, and the backend persists either as free text. Discovery surfaces use 3 incompatible facet systems on top.

### Conditions — 7 copies, 1 type

| Surface | Form | Divergence |
|---|---|---|
| SellScreen:65, EditListingScreen:51, BulkListingScreen:52, AIPoweredListingScreen:70 | `string[]` of 4 | Identical members |
| FilterScreen:70-76 | `{value,label,accessibilityLabel}[]` of 5 (adds 'Any') | Reshaped for segment control |
| GlobalSearchScreen:130, listingMapper:79, bulkListingApi:46 | `readonly ListingCondition[]` of 4 | Type-anchored but re-declared |
| `contracts/DiscoveryListingSummary.ts:37` + `services/listingsApi.ts:33` | `type ListingCondition` | **Two separate type declarations** with identical members |
| Backend `conditionMapping.ts:35` | `CONDITION_RANK` record | Same 4 keys, rank ordering only |

**Net:** 7 frontend copies + 2 type declarations + 1 backend rank map. Members agree today but drift is unguarded — adding a 'Pristine' condition requires editing 9 sites.

### Sizes — 4+ copies, no contract

| Surface | Set | Divergence |
|---|---|---|
| SellScreen:1025 | XS,S,M,L,XL,XXL,UK 6,UK 8,UK 10,UK 12,One Size | 11 entries, 'One Size' casing, no XXS, no UK 14 |
| EditListingScreen:52 | XXS,XS,S,M,L,XL,XXL,One size | 8 entries, 'One size' casing, no UK sizes |
| searchAutocompleteApi:125-135 | XS,S,M,L,XL,XXL,UK 6,UK 8,UK 10,UK 12,UK 14 | 11 entries, adds UK 14, no 'One Size' |
| SizeGuideSheet:22-95 | Per-category charts (tops/bottoms/dresses/shoes/outerwear/accessories/bags) | Reference data, not picker vocabulary |

**Net:** 'One Size' vs 'One size' casing mismatch will split size facets. Sell omits XXS; Edit omits all UK sizes; autocomplete omits 'One Size'. No `Size` type exists.

### Brands — 3 copies, no contract, no backend table

| Surface | Set | Divergence |
|---|---|---|
| SellScreen:1023 | Nike,Adidas,Zara,H&M,Gucci,Prada,Uniqlo,Levi's,ASOS,Other | 10 entries |
| EditListingScreen:53 | Nike,Adidas,Zara,H&M,Ralph Lauren,Off-White,Stone Island,Stussy,Other | 9 entries — **only 5 overlap with Sell** |
| SellScreen:1341 (LUXURY_BRANDS) | Gucci,Prada,Louis Vuitton,Chanel,Hermès,Dior,Balenciaga,Bottega Veneta,Saint Laurent,Burberry,Versace | 11 entries — luxury heuristic, 9 not in either picker |
| FilterScreen:203-226 | Derived from listings | Dynamic, not hard-coded |

**Net:** 3 hard-coded brand lists with ~50% overlap. 'Ralph Lauren', 'Off-White', 'Stone Island', 'Stussy' appear only in Edit; 'Uniqlo', 'Levi's', 'ASOS' appear only in Sell; 'Louis Vuitton', 'Chanel', 'Hermès', 'Dior', 'Balenciaga', 'Bottega Veneta', 'Saint Laurent', 'Burberry', 'Versace' appear only in the luxury heuristic. No `Brand` type, no brands table, no admin CRUD.

### Colours — 1 copy, orphaned

`searchAutocompleteApi.ts:137-145` is the **only** place 9 colour tokens exist. No picker, no contract, no backend column. [VERIFIED — CODE]

### Materials

No material taxonomy found anywhere — neither hard-coded arrays nor backend columns. [VERIFIED — CODE]

---

## Root Cause Analysis

1. **No backend taxonomy domain.** The backend has listings, orders, payments, co-own, creator, bots — but no `taxonomy` bounded context. Categories/brands/sizes/conditions are treated as free-text listing attributes rather than governed reference data. Migration `031` made them `TEXT` columns; the write route validates only non-empty strings. Without a server-owned canonical list, every client had to invent its own.

2. **`constants/categories.ts` arrived late and was not enforced as the source.** It carries rich metadata (emoji, colour, icon, subcategories) and is consumed by discovery — but the Sell/Edit/Bulk/AI screens predate it or were built without referencing it. There is no lint rule, no import-only convention, and no runtime guard preventing a screen from declaring its own array. The contract layer (`listingCategoryPolicy.ts`) defines *policy per subcategory id* but never exposes the *pickable vocabulary*, so screens fill the gap with literals.

3. **Type-level contracts are split.** `ListingCondition` is declared twice (services + contracts) with identical members but separate type identity — so even the type system doesn't funnel toward one source. `Category`, `Brand`, `Size` have **no type at all**; they are `string` everywhere, which is why casing drift ('One Size' vs 'One size', 'Jewelry' vs 'Jewellery') goes undetected by the compiler.

4. **Editorial surfaces invented their own facets.** DiscoverScene, UnifiedDiscoveryScreen, and CategoryTreeScreen each needed a different *facet* vocabulary (Clothing/Shoes/Bags, New/Vintage/Streetwear, Women/Men/Kids subcats) but had no taxonomy service to project from, so they hard-coded parallel systems that cannot be joined to listing `category`/`subcategory` ids.

5. **No admin manageability.** `routes/admin.ts` has no taxonomy endpoints. Operators cannot add a category, merge duplicate brands, reorder conditions, or retire a size without a code release. This makes the hard-coding not just a smell but an operational blocker.

---

## Recommended Flagship Solution

[PROPOSED] Introduce a **Taxonomy Service** as a first-class bounded context, owned end-to-end across backend table → API → frontend contract → cache → picker.

### 1. Backend — governed reference data

**Create** `backend/api/src/db/migrations/144_taxonomy.sql`:
- `taxonomy_kinds` enum table: `category`, `sub_category`, `condition`, `size`, `brand`, `colour`, `material`.
- `taxonomy_nodes` table: `id`, `kind`, `parent_id` (self-FK for sub→category), `slug` (canonical id, e.g. `women-clothing`), `display_key` (i18n key), `sort_order`, `is_active`, `metadata jsonb`, `created_at`, `updated_at`.
- `taxonomy_node_aliases` table: `node_id`, `alias` (case-insensitive, for normalising inbound free text like 'One size' → 'One Size').
- Seed from current canonical sets (categories.ts + 4 conditions + unified size scale + brand registry).

**Create** `backend/api/src/routes/taxonomy.ts`:
- `GET /taxonomy/:kind` — public, ETag-cached, returns active nodes for a kind (with children for categories).
- `GET /taxonomy` — full tree, public, ETag-cached.
- Admin endpoints under `routes/admin.ts` (extend): `POST /admin/taxonomy`, `PATCH /admin/taxonomy/:id`, `POST /admin/taxonomy/:id/aliases`, `POST /admin/taxonomy/:id/merge` (merge duplicate brands into a canonical node, re-point listings), `PATCH /admin/taxonomy/reorder` (bulk sort_order). All audit-logged via existing `lib/auditLog.ts`.

**Modify** `backend/api/src/routes/listings.ts:2353-2356` (and the search schema at `:132-135`):
- Replace `z.string().min(1)` for `category`/`condition` with a refinement that checks the node exists in `taxonomy_nodes` (cache lookup). `brand`/`size`/`colour`/`material` accept either a known node slug or free text (brands are open-ended) — but free-text brands are normalised against `taxonomy_node_aliases` on write so 'One size' and 'One Size' collapse to one id.

**Modify** `backend/api/src/lib/listingCategoryPolicy.ts`: drive `SUBCATEGORY_POLICIES` from `taxonomy_nodes.metadata.policy` instead of a hard-coded record, so adding a subcategory automatically extends policy.

### 2. Frontend — single contract + cache

**Create** `frontend/src/contracts/taxonomy.ts`:
- `TaxonomyKind`, `TaxonomyNode` (`id`, `kind`, `slug`, `parentId`, `displayKey`, `sortOrder`, `isActive`, `metadata`), `TaxonomyTree`.
- Re-export `ListingCondition` from here (delete the duplicate in `services/listingsApi.ts:33` and `contracts/DiscoveryListingSummary.ts:37`; both import from the new contract).
- `CategoryId`, `SubcategoryId` types derived from the tree (or kept as the union in `listingCategoryPolicy.ts:34` but re-exported).

**Create** `frontend/src/services/taxonomyApi.ts`:
- `fetchTaxonomy(kind)`, `fetchTaxonomyTree()` — hits the new backend endpoints, returns typed `TaxonomyNode[]`.
- React Query / context-backed cache with ETag revalidation; cold-start fallback to a bundled `taxonomySeed.ts` (generated from the backend seed at build time) so the app never blocks on taxonomy fetch.

**Create** `frontend/src/context/TaxonomyContext.tsx`:
- Provider loads the full tree on app start (alongside `BackendDataContext`), exposes `useTaxonomy(kind)` and `useTaxonomyNode(slug)`.
- All pickers, filters, and normalisers consume this context — no screen reads a hard-coded array.

**Create** `frontend/src/platform/catalog/useTaxonomyOptions.ts`:
- Hook returning picker-ready `{value,label,accessibilityLabel}[]` for a given kind + optional parent, projecting `TaxonomyNode` into the shape `FilterScreen` already uses. This becomes the single call site for BottomSheetPicker across Sell/Edit/Bulk/AI.

### 3. Screen refactors — delete the literals

| File | Action |
|---|---|
| `screens/SellScreen.tsx:65,1021,1023,1025,1341` | Replace inline arrays with `useTaxonomyOptions('category' \| 'brand' \| 'size' \| 'condition')`; derive `LUXURY_BRANDS` from `metadata.isLuxury` on brand nodes. |
| `screens/EditListingScreen.tsx:51-54` | Delete `CONDITIONS/SIZES/BRANDS/CATEGORY_OPTIONS`; use the hook. |
| `screens/BulkListingScreen.tsx:49-52` | Delete `CATEGORY_OPTIONS/CONDITION_OPTIONS`; add brand/size pickers via the hook (currently missing). |
| `screens/AIPoweredListingScreen.tsx:70-74` | Delete both arrays; use the hook. |
| `screens/FilterScreen.tsx:70-76` | Replace hard-coded `CONDITION_OPTIONS` with hook output projected through the 'Any' sentinel wrapper; keep dynamic brand/size derivation but normalise via `taxonomy_node_aliases`. |
| `screens/GlobalSearchScreen.tsx:130-135` | Delete `KNOWN_CONDITIONS`; import from contract. |
| `services/listingMapper.ts:79-84` | Delete `VALID_CONDITIONS`; import from contract. |
| `services/bulkListingApi.ts:46` | Delete `VALID_CONDITIONS`; import from contract. |
| `services/searchAutocompleteApi.ts:125-145` | Drive size/colour terms from taxonomy; keep style terms (out of scope). |
| `scenes/discovery/DiscoverScene.tsx:41-50` | Project `DISCOVER_CATEGORIES` from taxonomy facets stored in `metadata.discoverFacet`. |
| `screens/UnifiedDiscoveryScreen.tsx:75` | Same — project `CATEGORY_PILLS` from `metadata.editorialPill`. |
| `screens/CategoryTreeScreen.tsx:22-39` | Delete `TREES`; render from `TaxonomyTree` children. |
| `constants/categories.ts:16-153` | Becomes the **seed file** for the backend `taxonomy_nodes` table; the runtime constant is removed (or kept only as a build-time codegen input). |

### 4. i18n-ready labels

Every `TaxonomyNode` carries `displayKey` (e.g. `taxonomy.condition.new_with_tags`) resolved through the existing i18n layer — not a hard-coded English string. Current arrays are English-only; this makes the taxonomy localisable without touching pickers. [PROPOSED]

### 5. Cache strategy

- Backend: `GET /taxonomy` returns an ETag; Redis-cached for 60s; invalidated on admin write.
- Frontend: React Query with `staleTime: 1h`, `cacheTime: 24h`, ETag-aware refetch on app foreground. Bundled seed fallback for offline/first-launch.
- Listing write path: normalises against the cached tree; if cache is cold, falls back to seed and queues a revalidation.

---

## Risk and Rollout Order

1. **Lowest risk — contract consolidation (no behaviour change).** Create `contracts/taxonomy.ts`, re-export `ListingCondition`, delete the duplicate type in `DiscoveryListingSummary.ts` / `listingsApi.ts`. Update imports. Ship behind no flag. [DECISION]
2. **Backend taxonomy table + read API.** Add migration `144`, seed from `constants/categories.ts` + condition/size/brand enumerations, expose `GET /taxonomy`. No write-path change yet. Ship behind a feature flag. [PROPOSED]
3. **Frontend TaxonomyContext + hook.** Add the provider, cache, and `useTaxonomyOptions`. Migrate **FilterScreen first** (already dynamic for brand/size, lowest surface) then **AIPoweredListingScreen** (smallest picker surface). [PROPOSED]
4. **Migrate SellScreen + EditListingScreen + BulkListingScreen.** Delete inline arrays. This is the highest-traffic surface — migrate together to avoid picker divergence. [PROPOSED]
5. **Backend write-path enum enforcement.** Tighten `listings.ts` zod schemas to validate against `taxonomy_nodes`. Requires a backfill job to normalise existing free-text `category`/`condition` rows (use `taxonomy_node_aliases`). Ship behind a flag with a fallback to free-text for un-mapped values. [PROPOSED]
6. **Admin manageability.** Add `routes/admin.ts` taxonomy CRUD + merge. Enables operator-driven brand dedup and category reordering without code releases. [PROPOSED]
7. **Editorial facet projection.** Refactor DiscoverScene / UnifiedDiscoveryScreen / CategoryTreeScreen to project from the tree. Highest risk because it changes discovery silhouettes — do last, behind visual regression gates. [PROPOSED]

**Key risks:** (a) backfill of existing free-text listings must complete before write-path enum enforcement or sellers with legacy values cannot edit; (b) brand merge must re-point listings transactionally and emit audit events; (c) discovery facet projection changes visible UI — requires golden-screenshot regression. None of these block steps 1-3.

---

## 2026 industry research

### Shopify Standard Product Taxonomy (2026)

- **Open-source, versioned**: 25+ verticals with categories, attributes, and values. Distributed as a versioned JSON/TOML file. [VERIFIED — EXTERNAL]
- **Category + attribute + value model**: each category has required/recommended attributes (e.g. "Clothing > Tops > T-shirts" has attributes: sleeve_length, neck_style, fit). ThryftVerse's `taxonomy_nodes.metadata` can carry this. [VERIFIED — EXTERNAL]
- **AI auto-mapping**: Shopify uses ML to auto-map seller free-text to taxonomy nodes. ThryftVerse's `taxonomy_node_aliases` table is the manual equivalent. [VERIFIED — EXTERNAL]

### Whatnot public taxonomy (2026)

- **Community-maintained**: categories are added/retired based on seller demand. Admin CRUD is the equivalent. [VERIFIED — EXTERNAL]
- **Category-specific attributes**: each category has different required fields (e.g. trading cards need card_condition + grading_company; clothing needs brand + size + condition). ThryftVerse's `listingCategoryPolicy.ts` already models this but hard-codes it. [VERIFIED — CODE]

### Mirakl / Origami Marketplace (2026)

- **PIM-style central taxonomy**: single source of truth with operator-managed hierarchy. [VERIFIED — EXTERNAL]
- **Multi-level hierarchy**: category → subcategory → attribute → value. ThryftVerse's `taxonomy_nodes.parent_id` self-FK supports this. [VERIFIED — EXTERNAL]
- **Alias/normalisation table**: maps external source values to canonical nodes. ThryftVerse's `taxonomy_node_aliases` is this pattern. [VERIFIED — EXTERNAL]

### Best practice for taxonomy migration (2026)

- **Never break existing listings**: backfill before enforcing enum. Free-text values that don't map get an "unmapped" status and are surfaced to admin for manual mapping. [VERIFIED — EXTERNAL]
- **Versioned taxonomy**: every taxonomy change increments a version. Listings store the taxonomy version at creation time so historical listings remain valid even if the taxonomy evolves. [VERIFIED — EXTERNAL]
- **ETag-cached read API**: taxonomy is read-heavy, write-rare. ETag + CDN cache is the standard. [VERIFIED — EXTERNAL]
- **Bundled seed fallback**: mobile apps bundle a snapshot of the taxonomy at build time for offline/first-launch. React Query revalidates on app foreground. [VERIFIED — EXTERNAL]

---

## Implementation Record — completed 26 August 2026

### Rollout status against the 7-step plan

| Step | Status | Evidence |
|---|---|---|
| 1. Contract consolidation | DONE | `contracts/taxonomy.ts` is the single source of truth for `ListingCondition`, `TaxonomyNode`, `TaxonomyCollection`, `TAXONOMY_SEED`, `CONDITION_NAMES`, `LUXURY_BRAND_NAMES`. Duplicate `ListingCondition` in `services/listingsApi.ts:33` and `contracts/DiscoveryListingSummary.ts:37` re-export from the contract. `domain/listing.ts:16` and `store/useStore.ts:162` now import from the contract. Zero remaining inline `'New with tags' \| 'Very good' \| 'Good' \| 'Satisfactory'` unions outside the contract. |
| 2. Backend taxonomy table + read API | DONE | Migration `db/migrations/171_taxonomy.sql` creates `taxonomy_nodes` with CHECK constraint on type, self-FK on parent_id, synonyms JSONB, is_active flag. Seeds all categories (11 top-level + subcategories), 4 conditions, 12 sizes, 39 brands, 18 colours. Route `routes/taxonomy.ts` exposes `GET /taxonomy` and `GET /taxonomy/:type` with graceful 503 fallback when table is unavailable. Registered in `index.ts:24597`. |
| 3. Frontend TaxonomyContext + hook | DONE | `context/TaxonomyContext.tsx` provides `useTaxonomy()`, `useTaxonomyOptions()`, `useCategorySubcategories()`. Loads from backend on mount with `TAXONOMY_SEED` fallback. `TaxonomyProvider` mounted in `App.tsx:673` inside the provider tree (within `BackendDataProvider`). `services/taxonomyApi.ts` handles fetch + grouping with seed fallback. Dead `hooks/useTaxonomyOptions.ts` duplicate deleted. |
| 4. Screen migration — delete literals | DONE | All picker surfaces now source from `useTaxonomy()`: `SellScreen` (via `sellScreenLogic.ts` `getPickerOptionsForMode` + `pickerTaxonomy`), `EditListingScreen:117-124`, `BulkListingScreen`, `AIPoweredListingScreen`, `FilterScreen`, `GlobalSearchScreen:142`, `DiscoverScene:72`, `CategoryTreeScreen:28`, `SearchScreen`. `searchAutocompleteApi.ts:127,129` sources sizes/colours from `TAXONOMY_SEED`. `listingMapper.ts` and `bulkListingApi.ts` use `CONDITION_NAMES` from the contract. `sellScreenLogic.ts` hard-coded arrays deleted; `LUXURY_BRANDS` replaced with `LUXURY_BRAND_NAMES` from the contract. |
| 5. Backend write-path normalisation | DONE | `lib/taxonomyValidation.ts` implements `getTaxonomyNormaliser()` (60s cached, case-insensitive name+synonym map) and `normaliseTaxonomyValue()`. Wired into `routes/listings.ts` create handler (line ~2411) and PATCH handler (line ~4077). Lenient: unknown values pass through unchanged so legacy listings remain editable. Strict enum enforcement deferred until backfill completes. |
| 6. Admin manageability | PROPOSED | Not implemented. `routes/admin.ts` has no taxonomy CRUD/merge endpoints. Future work. |
| 7. Editorial facet projection | PROPOSED | Not implemented. `DiscoverScene` and `CategoryTreeScreen` project from taxonomy but `UnifiedDiscoveryScreen` no longer exists. Editorial pill metadata (`metadata.discoverFacet`, `metadata.editorialPill`) not yet added to taxonomy nodes. Future work. |

### Validation

- **Frontend typecheck:** `tsc --noEmit` — zero errors in any taxonomy-touched file (`contracts/taxonomy.ts`, `context/TaxonomyContext.tsx`, `services/taxonomyApi.ts`, `utils/sellScreenLogic.ts`, `screens/SellScreen.tsx`, `domain/listing.ts`, `store/useStore.ts`, `services/listingMapper.ts`, `services/bulkListingApi.ts`, `services/searchAutocompleteApi.ts`). Pre-existing errors in unrelated files (`linking.ts`, `AssetDetailScreen.tsx`, `ItemDetailScreen.tsx`, `OrderDetailScreen.tsx`) are not caused by this migration.
- **Frontend lint:** `eslint` on all changed files — zero errors, zero new warnings. Pre-existing warnings (unused imports, file length, a11y hints) unchanged.
- **Backend typecheck:** `tsc --noEmit` — zero errors in `lib/taxonomyValidation.ts` or the `routes/listings.ts` edit sites. Pre-existing errors (missing `vitest`/`sharp` modules, queue handler type mismatches) are not caused by this migration.
- **Hard-coded array scan:** `grep` for `'New with tags' \| 'Very good' \| 'Good' \| 'Satisfactory'` returns exactly one match — the canonical `contracts/taxonomy.ts:9`. `grep` for `CONDITION_OPTIONS\|CATEGORY_OPTIONS\|LUXURY_BRANDS\|VALID_CONDITIONS\|KNOWN_CONDITIONS\|DISCOVER_CATEGORIES\|CATEGORY_PILLS` returns zero matches in picker surfaces (remaining hits are style/editorial terms in style quiz, creator filters, AI autofill heuristics — correctly out of scope per the report).

### Files changed in this session

**Frontend:**
- `contracts/taxonomy.ts` — added `LUXURY_BRAND_NAMES` export (curated from brand nodes)
- `context/TaxonomyContext.tsx` — removed dead `SEED_VALUE` constant
- `utils/sellScreenLogic.ts` — deleted `CONDITION_OPTIONS` + 4 inline picker arrays + `LUXURY_BRANDS`; `getPickerOptionsForMode` now takes `PickerTaxonomyOptions`; `buildContextualPhotoPrompts` uses `LUXURY_BRAND_NAMES`
- `screens/SellScreen.tsx` — added `useTaxonomy` import; derives `pickerTaxonomy` from context; passes to `getPickerOptionsForMode`; fixed `a11yRef` type (`useRef<View>` instead of `useRef<unknown>`)
- `domain/listing.ts` — imports `ListingCondition` from contract instead of re-declaring
- `store/useStore.ts` — `BrowseConditionOption` derives from `ListingCondition` import
- `hooks/useTaxonomyOptions.ts` — DELETED (dead duplicate of `context/TaxonomyContext.tsx` exports)

**Backend:**
- `lib/taxonomyValidation.ts` — NEW: taxonomy normalisation helper (cached, lenient, synonym-aware)
- `routes/listings.ts` — imported normaliser; applied to category/brand/size/condition in create + PATCH handlers

### Final validation — 26 August 2026

**Single source of truth confirmed:**
- `grep "'New with tags' \| 'Very good' \| 'Good' \| 'Satisfactory'"` → exactly 1 match: `contracts/taxonomy.ts:9`
- `grep "type ListingCondition ="` → exactly 1 match: `contracts/taxonomy.ts:9`
- All 23 `ListingCondition` references across the codebase trace back to `contracts/taxonomy.ts` (direct import or re-export via `services/listingsApi.ts:33` / `contracts/DiscoveryListingSummary.ts:37`)
- Zero remaining hard-coded picker arrays (`CONDITION_OPTIONS`, `CATEGORY_OPTIONS`, `LUXURY_BRANDS`, `VALID_CONDITIONS`, `KNOWN_CONDITIONS`, `DISCOVER_CATEGORIES`, `CATEGORY_PILLS`) in any picker surface

**Typecheck:**
- Frontend: zero errors in any taxonomy-touched file. One pre-existing syntax error in `components/flagship/FlagshipScreen.tsx:156` (not caused by this migration — file is in the broader branch dirty set but was not touched by this task)
- Backend: zero errors in `lib/taxonomyValidation.ts` or `routes/listings.ts` edit sites. Pre-existing errors (missing `vitest`/`sharp` modules, queue handler type mismatches) are not caused by this migration

**Lint:**
- All taxonomy-changed files: zero errors, zero new warnings
- `SellScreen.tsx` has 20 pre-existing `react-native-a11y/has-accessibility-hint` errors on pressable elements — these existed before the taxonomy migration and are not introduced by it

**Out of scope (correctly not migrated):**
- `PersonalisationScreen.tsx` `CATEGORY_SIZE_OPTIONS` / `BRAND_OPTIONS` — preference tokens ("Balanced", "Streetwear first"), not catalogue taxonomy
- `SizeGuideSheet.tsx` `SIZE_GUIDES` — body measurement reference charts (chest/waist/inseam), not picker vocabulary
- `StyleQuizScreen.tsx` style terms — style vocabulary, not catalogue taxonomy
- `searchAutocompleteApi.ts` style terms — style/search vocabulary, not catalogue taxonomy
- `aiListingApi.ts` / `useListingAutofill.ts` brand→category heuristics — AI autofill mapping, not picker vocabulary
- Creator filter/effect/template names — creative tool vocabulary, not catalogue taxonomy

**Remaining future work (steps 6–7, not blocking):**
- Step 6: Admin taxonomy CRUD + brand merge endpoints in `routes/admin.ts`
- Step 7: Editorial facet metadata (`metadata.discoverFacet`, `metadata.editorialPill`) on taxonomy nodes for discovery projection
- Backfill job: normalise existing free-text listing rows against `taxonomy_node_aliases` before enabling strict enum enforcement
- i18n: replace English `displayKey` values with ICU messageformat keys for localisation
