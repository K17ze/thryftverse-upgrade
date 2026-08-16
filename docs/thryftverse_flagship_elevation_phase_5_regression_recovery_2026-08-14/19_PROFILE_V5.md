# Profile V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Preserve owner/public separation

No regression.

## Owner profile

Profile remains identity-first.
Administrative content cannot reclaim the first viewport.

## Public

Follow + Message + overflow.
Trust near shop context.

## Richness

Profile can be visually richer through:
- cover crop;
- avatar;
- Shop media;
- Looks;
not hero cards.

## Small flows

Audit:
- edit avatar;
- edit cover;
- crop;
- follower/following;
- blocked user;
- share profile;
- seller reviews;
- verification;
- report;
- mute/restrict;
- self deep link;
- private account.

## Data contract

Public profile endpoint must contain every visual field needed by UserProfile so it never reaches into owner-local store.

## Acceptance

No user sees duplicate TPP/self projections.
