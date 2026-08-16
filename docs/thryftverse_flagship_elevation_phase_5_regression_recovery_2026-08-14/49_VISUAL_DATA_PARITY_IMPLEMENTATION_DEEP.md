# Visual Data Parity — Deep Engineering Implementation

> Audit date: 2026-08-14  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## The current anti-pattern

```ts
try {
  const api = await fetch()
  if (api.length) set(api)
  else if (mocksEnabled) set(MOCK_LISTINGS)
}
```

This makes the visual environment depend on backend availability.

## Target architecture

### Package 1 — contracts
`packages/contracts`

Contains:
- ListingSummaryDto
- ListingDetailDto
- MediaDto
- UserSummaryDto
- NotificationEventV2
- ConversationSummaryDto
- schema validators.

Generated/openapi or Zod.

### Package 2 — frontend domain
`frontend/src/domain`

Contains:
- Listing
- Conversation
- Notification
- UserSummary.

No mock imports.

### Package 3 — presentation
`frontend/src/presentation`

- `toHomeDiscoveryItemVM`
- `toSearchCardVM`
- `toNotificationPresentation`
- `toConversationRowVM`.

### Package 4 — fixtures
`frontend/src/fixtures`

Fixtures import **contract types**.
They do not export domain types.

## Runtime boot

```ts
const mode = resolveRuntimeMode()

if (mode === 'fixture-design') {
  provider = new FixtureDataProvider()
} else {
  provider = new ApiDataProvider()
}
```

The provider is selected once.

Do not fetch API then silently swap data source in the same method.

## Data provider contract

```ts
interface MarketplaceDataProvider {
  source: 'fixture'|'api';
  getHomeFeed(...): Promise<...>;
  search(...): Promise<...>;
}
```

Cache wraps either provider separately if needed.

## Explicit commands

- `npm run start:fixtures`
- `npm run start:integration`

The developer always knows which world is active.

## Debug badge

In development only:
small developer menu shows:
`Data source: Fixture`
or `API`.

Never visible in production.

## Schema-validation pipeline

Backend CI:
emit example payloads.

Frontend CI:
parse examples.

Fixture CI:
parse all fixture files.

## Backend completeness report

For staging seed:
```
active listings: 1,000
missing cover: 0.2%
missing identity: 0%
missing dimensions: 4.1%
missing category-required field: 0%
```

Set thresholds.

## Category schema

```ts
interface ListingCategoryPresentationPolicy {
  requiredForActivation: FieldKey[];
  recommended: FieldKey[];
  searchable: FieldKey[];
  cardIdentity: FieldKey[];
  evidencePrompts: EvidencePrompt[];
}
```

Do not hardcode every category in Home.

## Valid brandless product

The activation policy may allow no brand.
The presentation layer knows how to synthesize identity from category/title.

## Invalid active product

Backend should reject or keep draft.
Frontend should not hide it silently.

## Observability

Log:
- presentation-normalizer fallback;
- invalid schema;
- missing dimensions;
- unknown category;
- legacy payload.

Alert when rates exceed threshold.

## Golden seed

Maintain a versioned `visual_seed_v5`.

The fixture and database seed represent the same semantic records, potentially with different IDs.

## CI screenshot

Launch fixture app.
Capture.
Launch backend seed.
Capture.

Automated geometry comparison can flag:
- missing sections;
- card-height drift > threshold;
- empty rail.

Human review decides aesthetic quality.

## Completion criteria

The app should feel equally authored if backend is:
- rich;
- sparse-but-valid;
- category diverse.

No designer should be able to tell which mode is active merely because one looks “more premium.”
