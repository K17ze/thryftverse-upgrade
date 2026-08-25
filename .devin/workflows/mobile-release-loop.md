---
auto_execution_mode: 0
description: Promote a tested Expo native binary or OTA update through protected staging, gradual rollout, health gates, and rehearsed recovery
---

# Mobile Release and OTA Loop

Use this workflow for release-readiness review, EAS builds, store submission, OTA
publication, rollout, or rollback. It is read-only until the user explicitly
authorizes the named external action and environment.

## Required inputs

- candidate commit SHA and clean/dirty state;
- iOS/Android platforms and EAS profile/channel;
- binary versus OTA classification;
- app version, build numbers, runtime version, and native fingerprint/diff;
- staging and production environments;
- release owner, approver, observation window, abort thresholds, and recovery owner.

Never infer authorization to publish, submit, promote, roll back, or change a
protected environment.

## 1. Classify the artifact

Inspect `frontend/app.json`, `app.config.js`, `eas.json`, lockfile, Expo modules,
config plugins, permissions, and native changes. If the JavaScript update is not
compatible with every targeted installed runtime, build a new binary. A native
dependency, plugin/config, permission, SDK, or native contract change is not a safe
OTA merely because TypeScript passes.

Record one identity chain:

```text
Git SHA → dependency lock → app/runtime version → EAS build/update ID
→ signing identity → store/build channel → rollout cohort
```

Do not rebuild when promoting: production should receive the exact update or binary
verified in staging whenever the platform supports promotion.

## 2. Pre-release gates

Resolve the authoritative CI/release controller and inspect its dependency graph.
Fail closed if approval is disconnected, a remote build is not awaited, a required
target/secret is absent, a gate is `continue-on-error`, or a success message can run
without the operation succeeding.

Require, as relevant:

- frontend typecheck, lint, tests, visual/residue/mock/SSL/bundle gates;
- backend/key/ML gates and contract compatibility;
- clean and upgrade migration rehearsal; forward-fix/restore plan;
- SBOM, dependency review, code/secret scan, immutable Action pins, provenance;
- completed EAS build IDs for both requested platforms;
- signed release-build device journeys, accessibility, startup/frame pacing,
  permissions, interruption, background/resume, offline/reconnect, and deep links;
- provider, worker, backup/restore, observability, and support readiness.

A queued remote build is not a completed artifact. A printed instruction is not a
rollback. A checksum-only backup check is not a restore drill.

## 3. Staging promotion

Use a persistent staging/store-beta build with the same runtime, environment shape,
and signing configuration as production. Deploy from the candidate SHA, run the
critical synthetic journeys, and record device/build/update IDs and telemetry.
Never use production customer accounts for staging proof.

For OTA, confirm channel, runtime compatibility, code signing, asset availability,
embedded fallback, and update health. For binaries, confirm store metadata,
entitlements, privacy declarations, permissions, deep links, and server backward
compatibility while old app versions remain active.

## 4. Gradual production rollout

Before authorization, define:

| Gate | Success threshold | Abort threshold | Observer | Action |
|---|---|---|---|---|
| crash-free sessions | explicit value | explicit value | named dashboard/owner | hold/rollback |
| startup/update failures | explicit value | explicit value | named dashboard/owner | hold/rollback |
| critical journey SLI | explicit value | explicit value | named dashboard/owner | hold/forward-fix |

Start with the smallest useful cohort, preserve a control cohort, and advance only
after the observation window passes. Never use arbitrary percentages or timers as
proof. Separate canary telemetry by build/update ID and platform.

## 5. Recovery

Rehearse before release:

- OTA rollback to a known previous update and to the embedded update;
- store rollout halt and server-side compatibility/feature disable;
- database restore or forward-fix consistent with migration support;
- provider/worker replay and idempotent reconciliation;
- user/support communication and status ownership.

After rollback, verify recovery on affected runtimes and devices. Do not announce
success until the command completed and health returned inside the agreed bounds.

## 6. Evidence and terminal status

Record authorization, approver, SHA, EAS/store IDs, runtime, channel, commands and
exit codes, protected-environment decision, cohort, health snapshots, rollback ID,
and not-run reasons. Redact secrets and customer data.

Without a completed signed artifact, device matrix, protected staging proof,
observed production rollout, and recovery evidence, report validation pending or
blocked. Static configuration cannot earn production sign-off.

Research basis, reviewed 25 August 2026: [EAS deployment](https://docs.expo.dev/eas-update/deployment/),
[runtime versions](https://docs.expo.dev/eas-update/runtime-versions/),
[EAS rollbacks](https://docs.expo.dev/eas-update/rollbacks/),
[Google canary releases](https://sre.google/workbook/canarying-releases/), and
[GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
