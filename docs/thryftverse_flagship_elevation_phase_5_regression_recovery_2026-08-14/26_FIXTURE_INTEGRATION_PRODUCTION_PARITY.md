# Fixture / Integration / Production Parity Engineering

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Objective

Design against reality without losing deterministic visual QA.

## Fixture catalogue

Fixtures are not random mockData.
They are **schema-valid test records**.

Generate or validate them against the same DTO schema.

## Fixture dimensions

Every critical field gets:
- ideal;
- absent optional;
- minimum;
- maximum;
- long;
- malformed rejected.

## Integration seed

Maintain a backend seed set matching golden routes.

The same semantic record should be renderable:
- fixture;
- seeded backend.

## Snapshot metadata

Every golden artifact stores:
- runtime mode;
- API source;
- seed version;
- app SHA;
- platform;
- dimensions;
- theme.

## Geometry parity

Allow text/image content differences.
Flag:
- card collapses;
- missing sections;
- major vertical shift;
- zero/empty rails;
- fallback avatar differences;
when caused by inconsistent contracts.

## Dev defaults

If backend URL is configured and healthy:
consider defaulting development to integration-truth.

Fixture design becomes an explicit command:
`npm run start:fixtures`

Integration:
`npm run start:integration`

This prevents accidental design signoff on mock richness.

## No hidden fallback

If integration mode API fails:
show failure/cached truth.
Do not silently switch to pretty fixtures.

## Production build guard

Static check:
production bundle cannot import `data/mockData` from runtime modules.
