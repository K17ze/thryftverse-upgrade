# Production Residue Audit Checklist

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## Static search

Across production source excluding docs/tests/dev-only:

### Demo/mock
`DEMO_MODE`
`isDemo`
`mockData`
`mock`
`placeholder`
`fake`
`simulate`

Every match must be removed, dev/test-only, or intentionally truthful.

### AI naming
`AI API`
`AI-powered`
`Bot`
`bot`

Ensure these appear only where the product intentionally needs them. Consumer agent surfaces use Agent terminology.

### Design-by-reference
`Instagram`
`Snapchat`
`Pinterest`
`flagship`
`premium`
`glassmorphism`
`psychology`
`per spec`
`per audit`

These generally become short invariant comments or are removed.

### Persistence/security
`Math.random()`
`Date.now()` in persisted IDs
AsyncStorage with key/secret/token/credential
raw API key logging
auth header logging
secret in navigation params.

## Visual audit

Per screen:
- duplicate title?
- duplicate CTA?
- duplicate status?
- duplicate filter?
- multiple smart suggestion surfaces?
- nested cards?
- unnecessary pills?
- permanent explanation copy?
- arbitrary gradient/shadow?
- three-part icon/label/subtitle treatment for obvious action?

## Artifact

Generate a machine-readable residue report:
file, line, match, disposition, owner, allowlist reason.

New violations fail CI.
