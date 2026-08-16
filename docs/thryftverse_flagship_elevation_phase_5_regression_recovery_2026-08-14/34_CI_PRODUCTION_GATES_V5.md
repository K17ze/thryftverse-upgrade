# CI & Production Gates V5

> Audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited remote HEAD: `73be832f2522f828ba2adfe31756da7da2d6e1ca`

## Current HEAD status

Actual GitHub Actions is red.

### Passing
- TypeScript typecheck.
- design token / animated-scroll lint.
- production residue.
- Maestro YAML validation.

### Failing
- Expo Doctor.
- visual golden/Vitest because baselines are missing.

## Expo Doctor

15 SDK-related package mismatches were reported.

Examples include:
- Expo 57.0.7 vs required ~57.0.8;
- expo-camera 57.0.7 vs ~57.0.8;
- expo-blur 57.0.7 vs ~57.0.8;
- FlashList 2.2.1 vs expected 2.2.2.

## Required

1. update/pin compatible versions;
2. regenerate lockfile;
3. run Expo Doctor;
4. do device smoke;
5. commit only when green.

Do not ignore doctor because differences look like patch versions.

## Screenshot gate

Capture reviewed baselines.
Keep test failure if baselines disappear.

## Required branch protection

Production/merge:
- typecheck;
- unit;
- contract;
- Expo Doctor;
- residue;
- design lint;
- screenshot/golden;
- backend tests;
- schema compatibility.

## Completion-report language

Prohibited:
`all tests pass except expected failures`

when branch protection is red.

Use:
`release blocked by ...`

until green.

## Additional Phase 5 gates

- fixture schema validation;
- integration seed contract;
- no runtime import from mockData in production modules;
- notification V2 contract test;
- listing-category completeness test.
