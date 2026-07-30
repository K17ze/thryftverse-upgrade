# P0 Truth, Security and Contract Prompt

## Mission

Close commercial-truth, privacy and operability defects before visual work.

## Required work

### Direct

- Remove every synthetic commercial default from the mapper.
- Represent missing brand, size, condition, category, price, seller and dates explicitly.
- Return exact listing lifecycle and server-derived viewer capabilities.
- Enforce public visibility rules; authorize owner/operator previews.
- Define save/like/watch metrics correctly.
- Replace hardcoded protection/returns claims with a versioned quote/status.

### Auction

- Add authoritative reserve state to storage and detail response without leaking restricted values.
- Implement Buy Now as one idempotent transaction creating exactly one order and fulfilment reference.
- Return terminal outcome and viewer next action from authoritative order/payment state.
- Define privacy-safe bid activity.

### Co-Own

- Remove or secure the public holdings-detail route.
- Introduce typed, versioned rights and dossier tables/contracts.
- Populate all fields used by the screen or remove unsupported interface claims.
- Return private viewer position separately.
- Make book levels and sequence one atomic snapshot with per-side limits.
- Replace hardcoded snapshot version/current-response freshness.

## Schema requirements

- Version every response contract.
- Use reason-coded capabilities rather than client inference.
- Include `generatedAt`, source timestamps and stable entity versions.
- Validate at route boundaries and generate OpenAPI/contract fixtures.

## Migration discipline

- Add constraints and backfills before making fields required.
- Document treatment of existing incomplete assets/listings.
- Provide rollback/forward-fix plan.
- Do not manufacture historic rights, reserve or policy facts during backfill.

## Tests

- object-level authorization matrix;
- holder and bidder privacy;
- lifecycle capability table tests;
- Buy Now duplicate/retry/concurrency;
- missing-data non-fabrication;
- Co-Own complete/incomplete rights;
- atomic book/sequence consistency;
- policy quote expiry and unavailable state.

## Output

Commit code, migrations, schemas, fixtures and a report mapping every P0 audit item to proof. Leave aesthetic files unchanged except where required to render truthful blocked/missing states.

