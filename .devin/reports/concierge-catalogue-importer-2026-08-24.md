# ThryftVerse Concierge Catalogue Importer

**Research and implementation blueprint**  
**Date:** 24 August 2026  
**Research horizon:** Official material available through 24 August 2026  
**Workspace:** `C:\Users\User\Desktop\thryftverse-upgrade`  
**Starting branch:** `feat/product-detail-contract-media-device-closure`  
**Starting HEAD:** `ab0b99d8f8ea54c0f156fa4ae39b8c99fe6716ce`  
**Scope:** Seller-authorised catalogue acquisition from approved sources, human-assisted import,
normalisation, media ingestion, seller verification, draft publication, operational tooling,
security, compliance, rollout, and source-partnership strategy.

> Product promise: **“Send us your shop. We’ll build your ThryftVerse closet for you.”**

## 1. Executive decision

Build this as a **concierge import platform with source adapters**, not as a universal
cross-listing scraper.

The correct first release is:

1. seller explicitly starts an import and grants narrowly described permission;
2. ThryftVerse acquires catalogue data through an approved API or a seller-provided package;
3. backend workers copy and verify the media, map fields, flag uncertainty, and create an
   import workspace;
4. a concierge operator resolves mechanical issues but cannot invent product facts;
5. the seller reviews a concise ready/needs-attention queue;
6. ThryftVerse creates **draft listings**;
7. only an explicit seller approval can activate them.

Do not ship a field that accepts an arbitrary eBay, Vinted, Depop, or Etsy shop URL and then
scrapes it. Seller permission does not override a marketplace’s API terms, anti-scraping rules,
copyright restrictions, or access controls. Do not ask for marketplace passwords, session
cookies, exported browser cookies, or two-factor codes.

### Recommended connector order

| Priority | Route | Decision on 24 Aug 2026 | Why |
|---:|---|---|---|
| 0 | Seller-owned CSV/ZIP + original media | **Build first** | Works across sources without impersonation or scraping; ideal concierge wedge |
| 1 | eBay OAuth | **Build first automated connector** | Public seller APIs, OAuth user consent, scalable inventory reports |
| 2 | Depop partner API | **Apply now; pilot after approval** | API is private, but Depop explicitly supports cross-listing integrations |
| 3 | Vinted Pro Integrations | **Partnership-only pilot** | Limited allowlist; existing-item import requires the Vinted account manager |
| 4 | Etsy API | **Do not implement without written approval** | Current API terms explicitly prohibit diverting sales or migrating Etsy members |
| 5 | Continuous multi-channel sync | **Separate later product** | Different permissions, oversell liability, webhooks, conflict resolution, and support burden |

The launch proposition should remain **one-time, read-only import**. “Keep every marketplace in
sync” is not a checkbox on this feature; it is an inventory-control product with materially
different operational risk.

## 2. What the seller is buying psychologically

The cold-start problem is not the listing form. It is the perceived cost, uncertainty, and
loss of control in moving an existing business.

The experience needs to resolve four seller anxieties:

- **Effort:** “Will this really save me time?” Show item count and a truthful progress summary,
  not a long integration wizard.
- **Control:** “Will you publish something wrong?” Import to a private workspace, preserve the
  source value, show what changed, and require approval.
- **Trust:** “Are you taking over my marketplace account?” Use the marketplace’s own consent
  screen, request read-only scopes where available, say “We cannot change your eBay shop,” and
  provide Disconnect/Delete controls.
- **Quality:** “Will my shop look worse?” Preserve media order and source facts, then make only
  confidence-labelled suggestions for ThryftVerse taxonomy, condition, and merchandising.

The winning first viewport is therefore not four equal integration cards. It is a single authored
choice:

```
Bring your shop to ThryftVerse
We prepare the drafts. You decide what goes live.

[ Connect eBay ]

Selling somewhere else? Send your catalogue to our import team →
```

Source logos can aid recognition, but they must not imply endorsement or availability. A source
that is awaiting partnership approval should say **“Join the assisted-import pilot”**, not expose
a dead “Connect” control.

## 3. Product boundaries

### 3.1 In scope for v1

- one-time acquisition of the seller’s own active inventory;
- approved OAuth/API connector for eBay;
- seller-uploaded CSV/XLSX/ZIP and original-media packages;
- human-assisted field mapping and exception handling;
- title, description, source URL, price/currency, category, brand, size, condition, quantity,
  SKU, media order, and source-state preservation where available;
- remote media copied into ThryftVerse’s authoritative object store;
- deterministic validation plus optional AI suggestions;
- exact and probable duplicate detection;
- seller review, bulk correction, approval, draft creation, and idempotent publication;
- progress, failure, retry, cancellation, revocation, audit, and retention controls;
- import operations console with role-restricted access.

### 3.2 Explicitly out of scope for v1

- scraping marketplace web pages or undocumented/private APIs;
- automatic publishing without seller approval;
- asking staff or users for marketplace credentials;
- importing buyer names, messages, order addresses, reviews, or sales history;
- copying source-specific reputation or “verified” badges;
- automatic price conversion without seller confirmation;
- silently upgrading item condition;
- automatically deleting or ending listings on the source marketplace;
- continuous quantity/order synchronisation;
- generative rewriting presented as the seller’s original description;
- image enhancement that changes the represented item;
- importing sold items as available inventory.

## 4. Source feasibility research

## 4.1 eBay — viable public connector

### Official access route

eBay supports OAuth user authorisation, scopes, short-lived access tokens, refresh tokens,
revocation, and seller-authorised API access. eBay advises applications to treat access and
refresh tokens as confidential and recommends OAuth even for its older Trading APIs.
See [eBay authorisation guidance](https://developer.ebay.com/develop/guides/sell/authorization).

For catalogue discovery, one endpoint family is not enough:

- `getInventoryItems` reads records in eBay’s Inventory API model;
- `getOffers` supplies offer/listing attributes linked to those records;
- the Sell Feed API’s `LMS_ACTIVE_INVENTORY_REPORT` provides a scalable active-inventory export;
- the Trading API’s `GetSellerList` retrieves listings belonging to the seller represented by
  the user token and provides pagination/date filtering.

The [eBay Inventory API overview](https://developer.ebay.com/api-docs/sell/inventory/static/overview.html)
describes inventory items, offers, variations, and migration of eligible legacy listings. The
[Sell Feed guide](https://developer.ebay.com/api-docs/sell/static/feed/sell-feed.html) documents
the Active Inventory Report under the `sell.inventory` scope, while the
[GetSellerList guide](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/browse-seller.html)
confirms that items for the seller tied to the user token are returned.

### Important design correction

Do **not** assume `getInventoryItems` alone equals the seller’s entire eBay shop. Inventory API
records and live eBay listings are related but not identical, particularly for legacy listings.
The connector needs a discovery strategy selected by account capability:

1. request the Active Inventory Report for broad, scalable discovery;
2. hydrate records through the most suitable official detail endpoint;
3. use Inventory API items/offers when present;
4. use Trading listing details where required and approved;
5. checkpoint every page/task so an interrupted import resumes rather than restarts.

### Recommended scope and behaviour

- request only the scopes required to read seller inventory;
- use eBay’s external consent page and validate `state`;
- exchange and refresh tokens only on the backend;
- default to active fixed-price listings; expose auctions as an opt-in import class;
- record eBay item ID, SKU, listing type, source state, source last-modified time, source URL,
  and acquisition method;
- do not call eBay write endpoints in v1;
- revoke the grant when the seller disconnects if eBay supports the grant’s revocation path;
- handle seller-side revocation as `reauthorization_required`, not as an import failure.

### eBay caveat

eBay notes that listings created through its Inventory API must subsequently be managed through
that API rather than Seller Hub. ThryftVerse is reading and recreating listings, not migrating
their management authority inside eBay, so there is no reason to call `bulkMigrateListings` in
the first release. That method is useful for understanding eBay’s models, not as the ThryftVerse
import mechanism.

## 4.2 Depop — commercially promising, private API

Depop documents API-key authentication, inventory management, orders, webhooks, offers, and a
sandbox for approved business/charity integrations. It also says the API is not public and that
it works with cross-listing tools through API connections. Access must be requested from Depop.
See [Depop’s business seller and API page](https://depophelp.zendesk.com/hc/en-gb/articles/4411154329233-Selling-as-a-charity-or-business).

### Decision

Start the commercial application now, but do not build against guessed endpoints. Request:

- permission for a seller-authorised one-time catalogue read/import use case;
- the current partner OpenAPI contract and sandbox;
- authentication model and per-seller authorisation/tenancy semantics;
- inventory-read completeness, image access, rate limits, and pagination;
- rights to retain recreated listing text and seller-owned media after disconnect;
- webhook availability if a later sold-item sync pilot is contemplated;
- branding, disclosure, support, security, and deletion requirements.

Until approved, Depop sellers should enter the seller-provided assisted path. Depop’s web CSV
upload feature creates listings on Depop; it is not evidence that Depop offers a public export of
the active catalogue. Do not label a sales-history download as an inventory export.

## 4.3 Vinted — allowlisted Pro partnership only

Vinted Pro Integrations is available only to a limited set of allowlisted Pro businesses. Its
official documentation describes HMAC-signed requests, item management, webhooks, order access,
and an initial allocation of 500 active-item slots.

More importantly, Vinted distinguishes items created through the integration from pre-existing
Vinted items. The official import workflow says to contact the Vinted account manager; after
Vinted performs the import, `GET /api/v1/items/imported` returns the imported records. See
[Vinted Pro Integrations documentation](https://pro-docs.svc.vinted.com/).

### Decision

- no consumer Vinted connector;
- no unofficial endpoints, session-token automation, or logged-in browser scraping;
- apply for a Vinted Pro Integrations partnership only if the intended seller cohort qualifies;
- validate whether Vinted’s imported-item response and permitted media access are sufficient;
- obtain written rights for the one-time ThryftVerse recreation use case;
- treat Vinted webhooks/stock sync as a later, separately consented integration.

The current `GetImportedItems` example exposes title, description, ID, URL, and status. That alone
does not prove full catalogue/media portability. The partnership contract must close the missing
field and image-acquisition questions before engineering commits to parity.

## 4.4 Etsy — technical API availability, legal product blocker

Etsy Open API v3 technically exposes seller listing reads with OAuth scopes. Technical
availability does not make this use case permissible.

Etsy’s API Terms, last updated 18 August 2026, require Etsy’s prior approval of the application
purpose and prohibit API use that diverts sales or migrates Etsy members from Etsy. They also
prohibit automated scraping unless expressly authorised in writing, require data minimisation,
and restrict caching. See [Etsy API Terms](https://www.etsy.com/uk/legal/api/).

### Decision

Do not expose “Connect Etsy” and do not submit a standard OAuth integration as if the issue were
only engineering. The gate is:

1. send Etsy a precise written application-purpose proposal;
2. request express written approval for seller-directed catalogue recreation on ThryftVerse;
3. complete counsel review of content, media, data-retention, trademark, disclosure, and support
   obligations;
4. implement only if Etsy approval and contractual terms explicitly cover this use case.

If not approved, the acceptable fallback is seller-provided **original catalogue material** over
which the seller has rights—not ThryftVerse fetching or scraping Etsy pages. Even a seller export
must be reviewed to ensure it contains no buyer data and that the seller has the necessary rights
to reuse the content away from Etsy.

## 4.5 Seller-provided import — the universal and safest launch wedge

Offer three supported packages:

1. **Structured catalogue:** ThryftVerse CSV/XLSX template plus image files.
2. **Source export:** a source-generated seller inventory export that the seller is entitled to
   provide, subject to source-specific review.
3. **Concierge folder:** original photographs plus a manifest or seller notes; staff reconstruct
   drafts and the seller verifies every material fact.

The upload must include a click-through attestation that the seller owns or is licensed to reuse
the supplied text and media and that the package contains no buyer/customer personal data.

The server must reject archives with path traversal, symlinks, executables, nested archives,
oversized expansion ratios, encrypted files, or unsupported formats. Extract in an isolated
worker with quotas and malware scanning.

## 5. End-to-end seller experience

## 5.1 Entry points

Use three restrained entry points that resolve to one owner flow:

- Sell screen: `Import a shop` below the primary camera/listing action;
- seller profile/closet empty state: `Bring over your existing listings`;
- Seller Hub: `Catalogue imports` with past and in-progress batches.

Avoid a modal immediately asking for a URL. Start with the value proposition and supported route.

## 5.2 Flow

### Step 1 — choose a source

Show only truthful states:

- **Connect eBay** — available;
- **Send a catalogue** — available;
- **Depop pilot** — request access;
- **Vinted Pro pilot** — request access;
- Etsy absent or clearly marked unavailable pending approval.

### Step 2 — informed consent

The consent screen should state in plain language:

- exact source and connected account;
- data read: seller-owned active listings and listing media;
- data not read: passwords, messages, reviews, buyer data, payouts;
- purpose: prepare private ThryftVerse drafts;
- whether the connection is one-time or retained for resume;
- raw-data retention period;
- how to disconnect and delete the import;
- confirmation that nothing is published without approval.

Store the immutable consent text version, timestamp, source, scopes, locale, and actor. A checkbox
in local React state is not adequate consent evidence.

### Step 3 — acquisition and progress

The user can leave the screen. The backend owns progress. Use meaningful phases rather than fake
percentages:

```
Connecting → Finding listings → Copying photos → Preparing details
→ Ready to review / Needs your input
```

If quantitative progress is available, show `32 of 40 prepared`. If the source report is still
being generated and total count is unknown, use indeterminate phase copy; never invent 73%.

### Step 4 — review workbench

The dominant object is the listing media and readiness, not a dashboard of metric cards.

Recommended information architecture:

- top summary: `36 ready · 4 need attention`;
- filters: Ready, Needs input, Possible duplicates, Excluded;
- virtualised two-column media queue on phone, with compact status marks;
- tap opens a focused item editor with **Imported** and **ThryftVerse** values where they differ;
- bulk correction for category, shipping method, price policy, and publish selection;
- persistent `Review 4 issues` action until blocking fields are resolved;
- primary action: `Approve 36 drafts`;
- no celebratory success animation before the backend confirms results.

### Step 5 — approval and publication

Approval is a durable server mutation with an idempotency key. It freezes the reviewed field
revision. Publication then consumes that exact revision; it must not silently apply later AI or
operator edits.

Recommended two-step language:

1. `Approve 36 drafts` — confirms facts and rights, creates/locks listing drafts.
2. `Publish 36 listings` — activates only items that pass current validation, media moderation,
   seller requirements, and category policy.

For a lower-friction cohort, these can be one confirmation sheet backed by two server stages, but
the audit record must retain the distinction.

### Step 6 — completion

Show a factual receipt:

```
36 live
3 kept as drafts
1 needs a new photo

[ View your closet ]   [ Fix remaining item ]
```

Partial completion is not failure. The receipt links every rejected item to a concrete recovery
action. If the client loses the publication response, show **Result not confirmed — Check result**.

## 6. Domain state machines

## 6.1 Connection state

```
pending_authorisation
  → active
  → reauthorisation_required
  → revoked
  → expired
  → deleted
```

## 6.2 Batch state

```
created
  → discovering
  → hydrating
  → ingesting_media
  → normalising
  → awaiting_operator
  → awaiting_seller
  → approved
  → publishing
  → completed

Any non-terminal stage → paused_rate_limit | paused_reauth | failed_recoverable
Any pre-publication stage → cancelling → cancelled
```

`completed` may include live, draft, excluded, and failed item counts. It does not mean every item
was published.

## 6.3 Item state

```
discovered → hydrated → media_pending → mapping_pending
→ ready | needs_input | probable_duplicate | excluded
→ approved → draft_created → publishing → live
                              ↘ failed_recoverable
                              ↘ outcome_unknown → reconciled
```

State transitions must be validated in the domain service. Do not let route handlers write
arbitrary status strings.

## 7. Architecture fitted to this repository

## 7.1 Existing foundations to reuse

The repository already contains useful production primitives:

- `backend/api/src/lib/queues.ts`: BullMQ queues, retries, metrics, DLQ routing, and standalone
  worker support;
- `backend/api/src/workers/index.ts`: worker process lifecycle;
- `backend/api/src/db/migrations/069_transactional_domain_outbox.sql`: transactional domain
  outbox;
- `backend/api/src/db/migrations/074_authoritative_media_lifecycle.sql`: authoritative media
  processing state;
- `backend/api/src/routes/uploads.ts` and `backend/api/src/lib/media/pipeline.ts`: upload
  finalisation, scanning/moderation, and publishability;
- `frontend/src/services/listingPublication.ts`: recoverable listing/media publication stages;
- `backend/api/src/routes/listings.ts`: listing creation, media-finalisation verification, and
  draft/active state;
- `frontend/src/services/aiListingApi.ts` and listing quality services: optional suggestion
  infrastructure, if provenance and confidence are preserved.

## 7.2 Existing code not suitable as the importer owner

`frontend/src/services/bulkListingApi.ts` is a device-side sequential loop. It validates a
client-only shape, takes the first local image URL, calls listing creation one item at a time,
and requests `status: 'active'`. It has no source connection, durable batch, import item,
provenance, remote-media ingest, server checkpoint, frozen approval revision, or atomic recovery.

It can inform validation copy, but must not become the import orchestration layer. The canonical
import owner must be backend state plus workers. `BulkListingScreen.tsx` can donate interaction
ideas, but the review workbench needs server pagination, durable filters, and item revisioning.

## 7.3 Proposed module map

```text
backend/api/src/
  routes/catalogImports.ts
  domain/catalogImports/
    catalogImportService.ts
    catalogImportTypes.ts
    catalogImportStateMachine.ts
    catalogImportValidation.ts
    catalogImportPublication.ts
    catalogImportRetention.ts
  integrations/catalogSources/
    connector.ts
    connectorRegistry.ts
    ebayConnector.ts
    sellerPackageConnector.ts
    depopConnector.ts          # compiled/registered only after partner approval
    vintedConnector.ts         # compiled/registered only after partner approval
    etsyConnector.ts           # absent until written approval
  mapping/catalog/
    canonicalListingSchema.ts
    categoryMapping.ts
    conditionMapping.ts
    sizeMapping.ts
    currencyPolicy.ts
    deduplication.ts
    fieldProvenance.ts
  lib/media/remoteImport.ts
  workers/handlers/
    catalogImportDiscoveryHandler.ts
    catalogImportHydrationHandler.ts
    catalogImportMediaHandler.ts
    catalogImportNormalisationHandler.ts
    catalogImportPublicationHandler.ts
    catalogImportRetentionHandler.ts
  db/migrations/
    1xx_catalog_import_foundation.sql
    1xx_catalog_import_provenance.sql
    1xx_catalog_import_publication.sql

frontend/src/
  services/catalogImportApi.ts
  hooks/useCatalogImport.ts
  hooks/useCatalogImportItems.ts
  screens/CatalogImportStartScreen.tsx
  screens/CatalogImportConsentScreen.tsx
  screens/CatalogImportProgressScreen.tsx
  screens/CatalogImportReviewScreen.tsx
  screens/CatalogImportItemScreen.tsx
  screens/CatalogImportSummaryScreen.tsx
  components/catalogImport/
    ImportListingTile.tsx
    ImportReadinessBar.tsx
    ImportedFieldDiff.tsx
    ImportBulkCorrectionSheet.tsx
    ImportIssueNavigator.tsx

ops/ or approved internal frontend owner/
  CatalogueImportQueue
  CatalogueImportBatchDetail
  CatalogueImportMappingEditor
```

Keep the route file thin. The current backend already has very large ownership files; adding the
importer directly to `index.ts` would deepen the duplicate-authority problem.

## 8. Connector contract

Source-specific behaviour belongs behind a typed adapter. The core domain must not branch on
`if (source === 'ebay')` throughout its workers.

```ts
type CatalogSource = 'ebay' | 'seller_package' | 'depop' | 'vinted';

interface SourceCapability {
  authorization: 'oauth' | 'partner_key' | 'seller_upload';
  canReadInventory: boolean;
  canReadMedia: boolean;
  canReadVariations: boolean;
  supportsIncrementalCursor: boolean;
  supportsRevocation: boolean;
  legalApprovalVersion: string;
}

interface DiscoveryCheckpoint {
  cursor?: string;
  reportTaskId?: string;
  page?: number;
  sourceSnapshotAt: string;
}

interface DiscoveredSourceItem {
  externalItemId: string;
  sourceUrl?: string;
  sourceUpdatedAt?: string;
  sourceState: string;
  sourceChecksum: string;
  minimal: Record<string, unknown>;
}

interface HydratedSourceItem {
  externalItemId: string;
  sourceUpdatedAt?: string;
  raw: Record<string, unknown>;
  media: Array<{
    externalMediaId?: string;
    url: string;
    position: number;
    declaredMimeType?: string;
  }>;
}

interface CatalogSourceConnector {
  readonly source: CatalogSource;
  readonly capability: SourceCapability;

  beginAuthorization(input: BeginAuthorizationInput): Promise<AuthorizationRedirect>;
  completeAuthorization(input: AuthorizationCallbackInput): Promise<ConnectionGrant>;
  revoke?(connection: Connection): Promise<void>;

  discover(input: DiscoverInput): AsyncIterable<DiscoveryPage>;
  hydrate(input: HydrateInput): Promise<HydratedSourceItem>;
  refreshConnection?(connection: Connection): Promise<ConnectionGrant>;
}
```

Rules:

- adapters return source facts, not ThryftVerse listing rows;
- adapters never write listings;
- raw provider errors are mapped to stable domain errors but retained in restricted diagnostics;
- connector rate limits and retry hints control job scheduling;
- every page/report has a persisted checkpoint;
- a connector can be disabled through configuration without a mobile release;
- partnership-gated adapters are not registered merely because a file exists.

## 9. Data model

Use relational columns for ownership, lifecycle, uniqueness, timestamps, and queryable status;
use JSONB for provider-specific snapshots and field-level mapping evidence.

## 9.1 `catalog_import_connections`

| Column | Purpose |
|---|---|
| `id` | internal stable ID |
| `user_id` | ThryftVerse seller owner |
| `source` | approved connector enum |
| `external_account_id` | provider seller/shop identifier |
| `external_display_name` | display only; not authority |
| `encrypted_access_token` | envelope-encrypted, nullable |
| `encrypted_refresh_token` | envelope-encrypted, nullable |
| `token_expires_at` | refresh scheduling/recovery |
| `scopes` | exact granted scopes |
| `status` | connection state machine |
| `consent_version` | immutable consent copy version |
| `consented_at` | evidence timestamp |
| `revoked_at`, `deleted_at` | lifecycle |

Unique active connection: `(user_id, source, external_account_id)`.

## 9.2 `catalog_import_batches`

| Column | Purpose |
|---|---|
| `id`, `user_id`, `connection_id` | identity and ownership |
| `source`, `mode` | connector and `one_time`/future mode |
| `status`, `status_reason` | durable state |
| `checkpoint_json` | page/report/cursor resume state |
| `source_snapshot_at` | consistency boundary |
| `discovered_count`, `ready_count`, `issue_count`, `published_count` | truthful summaries |
| `approval_revision` | frozen reviewed batch revision |
| `approved_at`, `approved_by` | seller approval evidence |
| `raw_delete_after` | retention enforcement |
| `created_at`, `updated_at`, `completed_at` | operations/SLO |

## 9.3 `catalog_import_items`

| Column | Purpose |
|---|---|
| `id`, `batch_id`, `user_id` | identity/ownership |
| `external_item_id`, `source_url` | source identity and provenance |
| `source_state`, `source_updated_at` | sold/active/staleness defence |
| `source_checksum` | replay/change detection |
| `raw_snapshot_ciphertext` | short-lived encrypted source payload |
| `normalised_fields` | canonical candidate fields |
| `field_revision` | optimistic concurrency |
| `readiness`, `blocking_issues` | review queue |
| `duplicate_of_listing_id`, `duplicate_score` | dedupe evidence |
| `seller_decision` | selected/excluded |
| `draft_listing_id` | canonical listing link |
| `publication_status`, `publication_idempotency_key` | safe publication |

Unique source identity should include the seller account:
`(source, external_account_id, external_item_id)`.

## 9.4 `catalog_import_media`

| Column | Purpose |
|---|---|
| `import_item_id`, `position` | ownership/order |
| `external_media_id`, `source_url_ciphertext` | short-lived acquisition reference |
| `fetch_status`, `attempt_count`, `last_error_code` | worker recovery |
| `sha256`, `perceptual_hash` | integrity/dedupe |
| `sniffed_mime_type`, `byte_size`, `width`, `height` | validation |
| `media_asset_id`, `finalization_id` | authoritative ThryftVerse media receipt |
| `moderation_status`, `publishability` | listing gate |
| `source_url_delete_after` | retention |

## 9.5 `catalog_import_field_provenance`

One row per material field/revision:

```text
import_item_id
field_name
source_kind          # marketplace | seller | operator | deterministic_map | ai_suggestion
source_value_json
resolved_value_json
confidence
mapping_version
changed_by
changed_at
reason_code
```

This table answers “Why does this listing say ‘Very good’?” without keeping the complete provider
payload forever.

## 9.6 Events and audit

- `catalog_import_events`: append-only product/worker timeline for user progress;
- existing `audit_logs`: operator and privileged actions;
- existing `domain_outbox`: post-commit notifications, search indexing, and analytics;
- publication idempotency records: request hash, result, and unknown-outcome reconciliation.

Never put OAuth tokens, raw provider payloads, signed media URLs, or full descriptions in logs.

## 10. Canonical field mapping

## 10.1 Mapping principles

1. Preserve the source value and source identity.
2. Map deterministically when there is a reviewed rule.
3. Use AI only to suggest when deterministic mapping cannot resolve the field.
4. Never convert low confidence into a material fact.
5. Never improve condition or authenticity claims automatically.
6. Require seller review for price/currency, shipping, condition uncertainty, prohibited/restricted
   categories, and any authenticity-related claim.
7. Version every mapping table so reprocessing is reproducible.

## 10.2 Field policy

| Source field | ThryftVerse policy |
|---|---|
| Title | Preserve; trim only safe whitespace; suggest a better title separately |
| Description | Preserve author text; remove source-only boilerplate through reviewed rules; show diff |
| Price | Preserve amount/currency; if not GBP, show rate timestamp and require confirmed GBP price |
| Condition | Source-specific table; map downward on ambiguity or block; never map upward silently |
| Category | Map leaf taxonomy to canonical category; low confidence blocks publication |
| Brand | Canonical brand alias table; unknown remains seller-entered text |
| Size | Category-aware size system and original label; never discard original size |
| Quantity | One for ordinary resale unless source evidence supports more; sold/zero is excluded |
| SKU | Preserve seller SKU; generate internal ID separately |
| Shipping | Do not import source policy as if it were valid on ThryftVerse; require profile default or review |
| Variations | Phase-gated; flatten only with explicit seller review and separate stock identity |
| Tags | Treat as discovery hints, not verified facts |
| Authenticity/verification | Never import a marketplace badge or infer a ThryftVerse trust signal |

## 10.3 AI policy

AI can propose:

- category and subcategory;
- brand spelling normalisation;
- attribute extraction from the seller’s own text;
- probable duplicate clusters;
- missing-field questions;
- quality warnings such as unclear cover photo.

AI cannot:

- assert authenticity;
- upgrade condition;
- infer a material that affects policy without review;
- rewrite and publish descriptions without explicit acceptance;
- train on source data unless platform permission, user terms, privacy basis, and retention policy
  explicitly allow it.

The UI should label suggestions by action (“Suggested category”) rather than decorate every field
with an “AI” badge.

## 11. Duplicate and stale-listing defence

Run deduplication in layers:

1. exact source account + external item ID;
2. normalised source URL;
3. source checksum and seller SKU;
4. exact media SHA-256;
5. perceptual image similarity;
6. candidate model using title, brand, size, price, and media similarity;
7. human confirmation for probable duplicates.

Never automatically merge distinct listings based only on similar titles or images. Vintage
resellers often have multiple visually similar items.

Immediately before publication, recheck source state where the connector permits it. If an item
became sold/removed during a long concierge review, move it to `source_changed` and require the
seller to confirm availability. A one-time import cannot guarantee continued source synchrony;
say so at approval.

## 12. Remote media ingestion

Imported images must become authoritative ThryftVerse media. Do not hotlink marketplace CDN URLs
as listing media.

```text
approved connector returns media reference
  → restricted remote fetcher
  → byte/MIME/dimension validation
  → malware and decompression checks
  → EXIF/GPS strip and safe re-encode
  → object-store upload
  → upload finalisation record
  → existing media ingest/moderation worker
  → publishable media asset
  → listing-media binding
```

### SSRF and media-fetch requirements

Remote fetching is an SSRF boundary. Follow the
[OWASP SSRF Prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html):

- the connector, not the mobile client, supplies the fetch URL;
- allowlist exact approved provider/CDN hosts per connector;
- resolve DNS and reject loopback, private, link-local, multicast, and cloud-metadata addresses;
- revalidate every redirect target or disable redirects;
- restrict schemes to HTTPS;
- cap redirects, connect/read timeouts, bytes, pixels, frames, and decompressed size;
- sniff content; do not trust extension or response MIME;
- stream to bounded temporary storage rather than buffering arbitrary bodies;
- strip metadata and re-encode supported images;
- quarantine failures and keep error details out of seller-facing copy;
- delete source URLs after the acquisition/retry window.

Preserve source media order and geometry. Store the original SHA-256 and a perceptual hash. Media
edits suggested by ThryftVerse must be non-destructive and separately revisioned.

## 13. Publication correctness

The importer should call a backend publication service that applies the same invariants as the
canonical listing route:

- authenticated seller owns the batch and import item;
- approval revision matches the item revision;
- all required fields are complete;
- cover and attachments have verified finalisation receipts;
- media is processed, moderated, and publishable;
- category is active and permitted;
- item is not source-sold, excluded, or a confirmed duplicate;
- current seller/shipping requirements pass;
- stable publication key has not been used with a different payload.

Create drafts first. Activation should be a transaction per listing, not one database transaction
for forty media-heavy items. Batch publication is an orchestrated saga with independent item
results and an immutable batch receipt.

### Unknown outcome

If the worker sends the create/activate mutation and loses the response, the result is ambiguous.
It must:

1. persist `outcome_unknown`;
2. query by stable listing/publication ID;
3. compare the stored request hash;
4. adopt the committed result if it matches;
5. retry only if the absence of a commit is proven.

Never turn an ambiguous result into either “failed” or “live” without reconciliation.

## 14. API surface

Suggested external routes:

```text
GET    /catalog-imports/sources
POST   /catalog-imports/connections/:source/authorize
GET    /catalog-imports/connections/:source/callback
GET    /catalog-imports/connections
DELETE /catalog-imports/connections/:connectionId

POST   /catalog-imports/packages/presign
POST   /catalog-imports/packages/:packageId/finalize

POST   /catalog-imports/batches
GET    /catalog-imports/batches
GET    /catalog-imports/batches/:batchId
POST   /catalog-imports/batches/:batchId/start
POST   /catalog-imports/batches/:batchId/cancel
POST   /catalog-imports/batches/:batchId/retry
DELETE /catalog-imports/batches/:batchId/raw-data

GET    /catalog-imports/batches/:batchId/items?cursor=&readiness=&decision=
GET    /catalog-imports/items/:itemId
PATCH  /catalog-imports/items/:itemId
POST   /catalog-imports/batches/:batchId/bulk-corrections
POST   /catalog-imports/batches/:batchId/approve
POST   /catalog-imports/batches/:batchId/publish
GET    /catalog-imports/batches/:batchId/publication-receipt
```

Every mutation requires:

- authentication and owner/role authorisation;
- schema validation;
- `Idempotency-Key` where a retry could duplicate work;
- optimistic `If-Match`/revision for field edits and approvals;
- rate limits;
- audit context;
- stable machine-readable error codes and recovery hints.

Progress can use authenticated Server-Sent Events or existing realtime infrastructure, but the
screen must always recover from `GET /batches/:id`; live events are an optimisation, not authority.

## 15. Worker and queue topology

Extend the existing BullMQ infrastructure with a dedicated `catalog_import` queue and DLQ rather
than putting network-heavy imports on the serial `infra_ops` queue.

Suggested job names:

```text
catalog_import_discover:{batchId}
catalog_import_hydrate:{itemId}:{sourceChecksum}
catalog_import_media:{mediaId}
catalog_import_normalise:{itemId}:{mappingVersion}
catalog_import_publish:{itemId}:{approvalRevision}
catalog_import_reconcile:{itemId}:{publicationKey}
catalog_import_retention:{batchId}
```

Queue policy:

- deterministic job IDs for deduplication;
- source-specific concurrency and token-bucket rate limits;
- exponential backoff with provider `Retry-After` support;
- no retry for permission/legal/schema failures;
- bounded retries followed by DLQ and operator recovery;
- lease/heartbeat for long report downloads;
- child item jobs only after the parent checkpoint commits;
- metrics for queue age, attempt count, duration, rate-limit pauses, and DLQ depth;
- cancellation checks between stages;
- transactional outbox between database state and user notifications.

Do not chain a forty-item import entirely inside one BullMQ job. Fine-grained, idempotent jobs make
partial progress visible and recovery cheap.

## 16. Authentication, token, and privacy design

### OAuth/native-app security

Use an external system browser, not an embedded credential WebView. Native-app OAuth best
practice requires an external user-agent and PKCE for public clients; see
[RFC 8252](https://www.rfc-editor.org/info/rfc8252/). Apply current OAuth security guidance from
[RFC 9700](https://www.rfc-editor.org/info/rfc9700/): exact redirect matching, `state`, PKCE S256
where supported, authorization-code flow, least scopes, replay defence, and refresh-token
protection.

Preferred implementation:

```text
mobile requests one-time authorisation transaction from backend
→ backend creates state/nonce and approved redirect
→ mobile opens system browser
→ provider redirects to HTTPS backend callback
→ backend validates state and exchanges code
→ backend stores encrypted grant
→ backend redirects to claimed app link containing only transaction status
→ mobile fetches connection status from authenticated API
```

Never put provider tokens in deep links, AsyncStorage, analytics, crash reports, or client logs.

### Token storage

- envelope encrypt tokens with a managed KMS key;
- separate encryption context per connection/user/source;
- keep plaintext only in process memory for the provider request;
- never return it to the mobile app;
- redact headers/query parameters in logs and traces;
- support key rotation and token re-encryption;
- audit decrypt and revoke operations;
- revoke/delete on disconnect subject to provider capability;
- alert on unusual connector volume and repeated authentication failures.

### UK data protection

The importer should observe purpose limitation, data minimisation, storage limitation, security,
and accountability. The [ICO’s data protection principles](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/)
state that personal data should be adequate, relevant, limited to what is necessary, and kept no
longer than necessary.

Complete before pilot:

- controller/processor and lawful-basis analysis;
- data protection impact assessment;
- record of processing activity;
- privacy notice and source-specific consent copy;
- vendor/subprocessor review for storage, AI, moderation, and observability;
- retention schedule and deletion job;
- data-subject request/export/delete handling;
- incident runbook and source-contract notification periods;
- access review for concierge operators.

Catalogue imports should not ingest buyers or orders. If a provider response includes unnecessary
personal data, discard it at the adapter boundary before persistence.

### Proposed retention defaults for counsel review

| Data | Default proposal |
|---|---|
| OAuth access token | Until expiry/refresh; encrypted |
| OAuth refresh token | Until import completion + short recovery window, then revoke/delete for one-time mode |
| Raw provider payload | 30 days or shorter after completion |
| Source media URL | Delete after verified ingestion + retry window |
| Normalised seller-approved fields | Retained as listing data |
| Field provenance | Retained while listing/import record is needed for audit |
| Failed seller package | 7 days after terminal failure unless seller retries |
| Audit/security events | Per security/legal retention schedule |

These are product recommendations, not legal conclusions. Final durations must be approved by
counsel and source agreements.

## 17. Rights, policy, and marketplace safety

At approval, the seller should attest that:

- they control the source shop or supplied catalogue;
- they own or have permission to reuse the listing text and media;
- the item is available and lawful to sell on ThryftVerse;
- imported facts, condition, price, and quantity are accurate;
- supplied files contain no third-party/customer personal data.

The attestation does not replace ThryftVerse moderation or policy checks. Imported content must
pass the same prohibited-item, counterfeit, intellectual-property, safety, and category rules as
a manually created listing.

Source provenance should be retained internally but not rendered as an endorsement. Never import
source ratings, reviews, sales counts, “top seller” labels, or verification badges into
ThryftVerse trust signals.

## 18. Concierge operations model

## 18.1 Roles

| Role | Allowed | Not allowed |
|---|---|---|
| Import support | view batch health, contact seller, retry safe stages | view tokens, publish, invent facts |
| Catalogue specialist | map fields, mark issues, reorder seller media | assert authenticity, approve for seller |
| Import supervisor | resolve DLQ, approve mapping rule release | reveal secrets, bypass policy |
| Security admin | revoke connection, investigate access | edit catalogue facts |
| Seller | edit, exclude, approve, publish, delete | access another seller’s batch |

Use least-privilege RBAC, reason codes, and audited break-glass access. Staff never sign in to the
seller’s marketplace account and never request a password or 2FA code.

## 18.2 Operator queue

Prioritise by seller impact rather than a generic table:

- awaiting operator beyond SLA;
- source reauthorisation required;
- package rejected with seller action pending;
- mapping blockers;
- media quarantine;
- probable duplicates;
- publication unknown outcomes;
- DLQ items.

Every operator action should either resolve a specific issue, request a seller fact, or retry an
idempotent stage. Free-form hidden edits are not acceptable.

## 18.3 Service promises

Start with conservative, measurable promises:

- automated eBay import starts within 60 seconds of consent;
- 95% of supported active items discovered within 15 minutes for the initial target catalogue
  size, excluding provider report latency;
- assisted packages acknowledged immediately and reviewed within one business day during pilot;
- seller can always see whether ThryftVerse, the source, or the seller must act;
- cancellation stops new work promptly and completes deletion asynchronously with a receipt.

Do not market “instant” until production percentiles prove it.

## 19. Observability and success metrics

### Reliability metrics

- connection authorisation success by source and app version;
- discovery completeness and duration;
- provider calls, latency, 429s, 5xx, schema drift, and reauth rate;
- job queue age, retries, DLQ depth, cancellation latency;
- media fetch/scan/moderation success and bytes;
- mapping readiness by category/source;
- approval-to-draft and draft-to-live success;
- unknown-outcome count and reconciliation age;
- retention deletion lag;
- operator touches and time per item.

### Product metrics

- import start rate from eligible seller onboarding;
- consent completion;
- median imported items per seller;
- time from consent/package to ready-to-review;
- ready-without-edit percentage;
- seller edits by field;
- approval and publish conversion;
- day-7 listing survival and first-sale conversion;
- support contacts and import abandonment;
- duplicate/sold-after-import incidents;
- seller-reported correctness.

The north-star metric should be **verified listings made live per importing seller**, not “items
scraped” or “AI fields generated.” Add guardrails for support contacts, correction rate,
moderation rejection, and duplicate incidence.

### Traceability

Propagate `batchId`, `itemId`, `jobId`, `connector`, and provider request correlation ID through
structured logs and traces. Hash or omit external IDs where analytics does not need them. Never
use title, description, media URL, or token as a metric label.

## 20. Testing strategy

## 20.1 Contract tests

- frozen provider fixtures for each supported schema/version;
- pagination, report polling, cursor resume, and rate-limit behaviour;
- schema drift and unknown enum values fail safely;
- OAuth callback state, replay, expiry, denial, and revocation;
- connector capability registration matches approved configuration.

## 20.2 Mapping tests

- golden category/condition/size fixtures by source;
- low-confidence mappings remain blocked;
- condition never upgrades across ambiguous mappings;
- original values and mapping version remain reconstructible;
- currency conversion cannot bypass seller confirmation;
- trust badges and authenticity are never inferred.

## 20.3 Media/security tests

- private/loopback/link-local/metadata IPs blocked for IPv4 and IPv6;
- DNS rebinding and redirect-to-private-host blocked;
- unsupported schemes/MIME, polyglots, decompression bombs, oversized pixels, nested archives,
  zip-slip, symlinks, and encrypted archives rejected;
- EXIF/GPS stripped;
- duplicate content hashes reuse safely without cross-user leakage;
- quarantined media cannot become a listing cover.

## 20.4 State and publication tests

- every allowed and prohibited transition;
- worker crash after each commit boundary resumes idempotently;
- same idempotency key + same payload returns same result;
- same key + different payload fails closed;
- response loss after commit reconciles instead of duplicating;
- partial batch completion produces an accurate receipt;
- source-sold item cannot publish without fresh seller confirmation;
- approval revision mismatch blocks stale publication.

## 20.5 Access/privacy tests

- cross-seller batch/item access denied;
- operator roles cannot decrypt tokens or publish;
- revocation and deletion remove access and raw data;
- tokens and source URLs are redacted from logs/errors/analytics;
- consent record is immutable and linked to the correct version;
- package containing buyer data follows quarantine/escalation policy.

## 20.6 Native UX matrix

- iOS and Android system-browser return flows;
- interrupted auth and app process death;
- background/foreground progress recovery;
- offline review edits and conflict resolution;
- large text, screen reader, reduced motion, low-end Android performance;
- 1, 40, 500, and provider-limit catalogue sizes;
- loading, empty, needs-input, partial, revoked, rate-limited, cancelled, and unknown-outcome states.

## 21. Delivery plan

## Phase 0 — legal, partnerships, and design contract (2–4 weeks)

- approve product boundaries and one-time mode;
- complete DPIA/rights/retention review;
- submit Depop, Vinted, Etsy, and eBay developer/partnership enquiries;
- obtain eBay production keys and confirm API call limits;
- freeze canonical import schema and state machines;
- build source capability registry and feature gates;
- prototype the seller review workbench with real listing-density fixtures;
- define concierge SOP and role matrix.

**Exit gate:** no source is presented as connectable without documented permission and a tested
acquisition route.

## Phase 1 — assisted seller package MVP (4–6 weeks)

- package presign/finalise endpoints;
- isolated archive inspection/extraction worker;
- batch/item/media/provenance migrations;
- seller package connector;
- deterministic mapping and blocking validation;
- remote/local authoritative media ingestion;
- review screens and bulk corrections;
- operator exception queue;
- draft-first idempotent publication and receipt;
- retention/deletion jobs and audit.

**Exit gate:** a seller can submit 40 original listings, leave the app, return to a durable review
queue, correct issues, approve, and publish without a fabricated or duplicate result.

## Phase 2 — eBay automated pilot (4–6 weeks after keys)

- external-browser OAuth and backend grant vault;
- Active Inventory Report plus official detail-hydration strategy;
- source rate limiting/checkpoints/schema monitoring;
- eBay mapping tables and fixtures;
- source-state recheck before publication;
- sandbox, then staff accounts, then 25–50 seller pilot;
- operational dashboards and on-call runbook.

**Exit gate:** measured discovery completeness, media rights/ingestion, publication accuracy,
revocation, deletion, and provider-limit recovery meet pilot SLOs.

## Phase 3 — partner connectors (timing controlled by partners)

- Depop sandbox and approved seller tenancy;
- Vinted allowlisted Pro pilot and account-manager import flow;
- connector-specific contracts, mappings, branding, and incident procedures;
- never copy eBay assumptions into private partner adapters.

## Phase 4 — optimisation

- confidence-based sample review for trusted sellers without reducing explicit approval;
- operator tooling and mapping feedback loops;
- category-specific media quality suggestions;
- import invitation/referral and Seller Hub lifecycle;
- optional continuous sync discovery document.

## Phase 5 — continuous sync, only as a separate launch

Requires its own design for:

- source of truth and conflict resolution;
- sold/quantity webhooks and polling gaps;
- oversell prevention and reservation semantics;
- write permissions and marketplace-side mutations;
- operator replay, reconciliation, and webhook inbox;
- seller-visible sync health;
- source-specific SLA and liability.

Do not enable it by retaining one-time OAuth tokens “just in case.”

## 22. Implementation work packages

| Package | Deliverable | Depends on |
|---|---|---|
| A | Legal/source capability registry | partner and counsel decisions |
| B | Domain migrations and state service | A |
| C | Dedicated BullMQ import queue/DLQ/metrics | B |
| D | Seller package ingestion and archive security | B, C |
| E | Canonical mapper, provenance, dedupe | B |
| F | Authoritative remote media importer | C, existing media pipeline |
| G | Review API and native workbench | B, E, F |
| H | Draft/activation publication saga | B, F, existing listing owner |
| I | Ops queue, RBAC, audit, retention | B–H |
| J | eBay connector/OAuth/report hydration | A–F |
| K | Pilot observability, runbooks, native QA | all |

Suggested team for a production pilot: one backend/integration owner, one native product engineer,
one product designer, fractional security/privacy, catalogue operations lead, QA/SDET support, and
partner/legal ownership. A single engineer can prototype it; they should not solo-operate a
production migration service involving third-party credentials and seller inventory.

## 23. Release gates

The importer is ready for a limited pilot only when:

- source permission/terms and production credentials are recorded;
- no arbitrary URL or undocumented API path exists;
- OAuth uses external browser, exact callback validation, state, least scopes, backend token
  exchange, encryption, revocation, and redaction;
- batch/item/media/provenance state survives app and worker restarts;
- archive and remote-fetch security suites pass;
- every imported media object has an authoritative media receipt and moderation state;
- seller sees source-vs-resolved differences and blocking uncertainty;
- approval is immutable, revision-bound, and auditable;
- publication is draft-first, idempotent, and reconciles unknown outcomes;
- duplicate and source-sold items fail closed;
- cancellation, disconnect, deletion, and retention have verified receipts;
- operators use least privilege and cannot publish for the seller;
- full native state matrix passes on signed iOS/Android builds;
- provider sandbox and live pilot evidence exist;
- support, incident, provider-outage, schema-drift, and credential-compromise runbooks are staffed.

## 24. Primary risks and mitigations

| Risk | Severity | Mitigation |
|---|---:|---|
| Marketplace terms prohibit migration | Critical | capability registry; written approval; no connector without legal gate |
| Unofficial scraping/account lockout | Critical | approved APIs/seller packages only; no credentials/cookies |
| SSRF through media URLs | Critical | connector allowlists, DNS/IP/redirect validation, isolated bounded fetcher |
| Counterfeit or prohibited goods imported at scale | Critical | same moderation/policy gates; no bulk bypass; fail-closed categories |
| Duplicate listings from retries | High | source uniqueness, job IDs, publication idempotency, reconciliation |
| Item sold elsewhere during review | High | source-state recheck where available; seller availability confirmation |
| Wrong condition/category at scale | High | deterministic versioned maps, confidence blockers, seller review |
| Leaked provider tokens | Critical | KMS envelope encryption, backend-only, redaction, least scopes, revocation |
| Provider schema/rate-limit changes | High | contract fixtures, schema alerts, checkpoints, feature kill switch |
| Staff invents listing facts | High | provenance, reason codes, restricted roles, seller-only approval |
| Raw data retained indefinitely | High | `delete_after`, deletion worker, metrics, audit receipt |
| “Concierge” becomes unscalable manual labour | Medium | measure touches/item; improve deterministic maps; keep exception-only ops |
| Partner connector marketed before approval | High | backend capability response controls UI; unavailable source has no connect CTA |

## 25. Recommended first implementation sequence in this codebase

1. Create the three foundation migrations: connections/batches/items, media/provenance, and
   publication/idempotency.
2. Add a typed domain service and state transition tests before routes.
3. Add a dedicated `catalog_import` BullMQ queue, DLQ, handler registration, metrics, and worker
   shutdown support using the existing queue conventions.
4. Build `seller_package` first, including secure ZIP/CSV/XLSX processing and catalogue fixtures.
5. Build server-owned remote media ingest that issues the same authoritative media assets and
   finalisation receipts expected by listing publication.
6. Implement deterministic mapping, provenance, dedupe, and readiness blockers.
7. Add thin REST routes and cursor-paginated review queries.
8. Build the native start/progress/review/item/summary flow with complete states.
9. Add draft-first batch publication and unknown-outcome reconciliation.
10. Add ops RBAC, exception queue, audit, retention, and deletion.
11. Integrate eBay OAuth and Active Inventory Report/detail hydration behind a disabled-by-default
    source flag; enable only after sandbox and legal/production-key gates.
12. Run signed-device, live-provider, security, large-catalogue, and operator pilot validation.

Do not begin with source-logo cards, AI copy rewriting, or a generic shop-URL textbox. The hard
product is reliable acquisition, truthful mapping, verified media, seller control, and safe
publication.

## 26. Product copy recommendation

### Seller acquisition

**Headline:** Bring your shop. We’ll prepare the listings.  
**Body:** Connect an approved shop or send your catalogue. We copy the details and photos into
private drafts for you to check. Nothing goes live until you approve it.  
**Primary:** Connect eBay  
**Secondary:** Send a catalogue

### Consent reassurance

**We will access:** Your active listing details and listing photos.  
**We will not access:** Your password, buyer messages, reviews, payouts, or order addresses.  
**Control:** Disconnect or delete the import at any time.

### Progress

- Finding your listings
- Copying photos securely
- Preparing details
- 36 ready to review

Avoid “AI-powered migration,” “magic import,” or “100% accurate.” The premium experience is calm,
specific, and accountable.

## 27. Final recommendation

Approve the concierge importer as a strategic seller-acquisition programme with this launch
shape:

```text
Universal assisted package importer
          +
Public eBay OAuth connector
          +
Human exception operations
          +
Seller-controlled draft approval
          +
Partnership pipeline for Depop and Vinted
          +
Explicit legal stop on Etsy until written approval
```

This gives ThryftVerse the cold-start advantage in the original proposition without creating an
unreliable scraping product or quietly taking control away from sellers. The durable moat is not
the connector logo. It is the import operating system: provenance, verified media, mapping
quality, exception handling, seller trust, and idempotent publication.

## 28. Official source register

### Marketplace documentation

- [eBay Inventory API overview](https://developer.ebay.com/api-docs/sell/inventory/static/overview.html)
- [eBay seller authorisation and OAuth](https://developer.ebay.com/develop/guides/sell/authorization)
- [eBay Sell Feed API](https://developer.ebay.com/api-docs/sell/static/feed/sell-feed.html)
- [eBay Active Inventory Report flow](https://developer.ebay.com/api-docs/sell/static/feed/merchant-data-downloadable-reports-flow.html)
- [eBay GetSellerList guide](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/browse-seller.html)
- [Etsy Open API reference](https://developers.etsy.com/documentation/reference/)
- [Etsy OAuth authentication](https://developers.etsy.com/documentation/essentials/authentication/)
- [Etsy API Terms, updated 18 Aug 2026](https://www.etsy.com/uk/legal/api/)
- [Vinted Pro Integrations documentation](https://pro-docs.svc.vinted.com/)
- [Vinted commercial-selling guidance](https://www.vinted.co.uk/help/413/1120-commercial-selling)
- [Depop business seller and API guidance](https://depophelp.zendesk.com/hc/en-gb/articles/4411154329233-Selling-as-a-charity-or-business)
- [Depop listing on web/CSV upload](https://depophelp.zendesk.com/hc/en-gb/articles/8608273715217-Listing-on-web)
- [Depop sales download](https://depophelp.zendesk.com/hc/en-gb/articles/360039263713-How-to-use-your-sales-download)

### Security and privacy standards

- [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/info/rfc9700/)
- [RFC 8252 — OAuth 2.0 for Native Apps](https://www.rfc-editor.org/info/rfc8252/)
- [OWASP Server-Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- [ICO — UK GDPR data protection principles](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/)

## 29. Status

This document is a research and implementation blueprint. No marketplace connector, database
migration, route, worker, native screen, operator console, or live-provider validation was
implemented by this report-only task.

**Status:** `PLANNED — IMPLEMENTATION AND PARTNER APPROVAL REQUIRED`
