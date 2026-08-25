---
auto_execution_mode: 0
description: Orchestrate a repository-wide readiness assessment into evidence-backed, reviewable vertical slices without making production claims from static code
---

# Flagship Production Readiness Loop

Use this workflow for broad readiness, parity, launch, or repository-health work.
For a normal feature or bug, start with the smallest specialist workflow instead.

## Required inputs

- product outcome and release boundary;
- target environment and platforms;
- critical journeys and unacceptable failure modes;
- whether live staging, physical devices, and external providers are available;
- explicit authorization for any production read or mutation.

Default to read-only production access and isolated local/staging mutations.

## 1. Establish the immutable snapshot

Record:

```text
workspace root / Git root / remote / branch / HEAD
applicable AGENTS.md / dirty paths / user-owned changes
target environment / artifact IDs / research access date
```

Inspect `package.json`, package-level manifests, `.github/workflows`, Expo/EAS
configuration, Compose files, migration tooling, and gate documents before naming
commands. Do not assume a copied script works from every package directory.

## 2. Build the capability map

Map critical journeys top-down and bottom-up. For each capability capture:

| Capability | Canonical owner | Coupled systems | Highest evidence | Risk | Next proof |
|---|---|---|---:|---|---|

Use the lowest honest evidence level:

| Level | Evidence | Permitted claim |
|---:|---|---|
| 0 | prose, TODO, dated report | proposed |
| 1 | file/package/schema exists | scaffolded |
| 2 | canonical route/import registered | reachable candidate |
| 3 | focused static checks and tests pass | engineering-ready candidate |
| 4 | clean build/migration/recovery rehearsal passes | deployable candidate |
| 5 | isolated live endpoint/provider/worker evidence passes | live-verified |
| 6 | signed artifact passes the device/state matrix | native-verified |
| 7 | comparative review, accessibility/performance evidence, human acceptance | signed off |

The capability is capped by its lowest critical dependency. Levels 0–4 never
become “production,” “complete,” “parity,” or “flagship.”

## 3. Route work to one owner workflow

| Change shape | Primary workflow | Additional gate |
|---|---|---|
| current external decision | `research-driven-upgrade-loop.md` | dated source ledger |
| data, mutation, realtime, worker | `live-signs-convergence-loop.md` | isolated live evidence |
| rendered UI or interaction | `visual-flagship-convergence-loop.md` | native capture |
| messaging | `message-department-convergence-loop.md` | delivery/replay/privacy matrix |
| signed build or OTA | `mobile-release-loop.md` | artifact identity + rollback |
| code review only | `review.md` | no writes |

A coupled surface runs both live-signs and visual convergence. Do not create a
department-wide styling wave or a repository-wide refactor as the first slice.

## 4. Select the smallest risk-closing slice

Prioritize:

1. security/privacy exposure, data loss, money ambiguity, false trust;
2. release path that can publish or report success incorrectly;
3. dead primary journey, broken route, or unrecoverable mutation;
4. contract drift, stale propagation, offline/realtime failure;
5. first-viewport hierarchy, accessibility, performance;
6. secondary polish.

Define one source-of-truth owner, directly coupled layers, acceptance evidence,
rollback/forward-fix, and explicit out-of-scope items. Keep refactors separate
unless they are required for the slice to remain correct.

## 5. Repository governance gate

Assess rather than assume:

- protected default/release branches or rulesets;
- required current checks, resolved conversations, fresh approvals, and merge queue;
- ownership for mobile, backend, migrations, security, payments, messaging, and CI;
- least-privilege Actions permissions and protected deployment environments;
- third-party Actions pinned to reviewed full commit SHAs;
- dependency review, update automation, code/secret scanning, SBOM, and provenance;
- one declared owner for CI, build, staging, release, OTA, rollback, and backup paths;
- short-lived branches, reviewable changes, and searchable rationale.

Missing governance is a readiness finding, not permission to mutate repository or
organization settings.

## 6. Engineering gates

Resolve exact commands from manifests. The current canonical command families are:

```text
npm run frontend:typecheck
npm run frontend:test
npm --prefix frontend run lint
npm --prefix frontend run check:visual-gates
npm --prefix frontend run check:residue
npm run backend:api:build
npm run backend:api:test
npm --prefix backend/api run test:integration   # requires isolated Postgres
npm run backend:key:build
npm --prefix backend/key-service test
```

Run only gates relevant to the changed slice, then the authoritative CI set. A
pre-existing failure is recorded before edits and never re-labelled as caused by
the slice. Migration, backup/restore, worker, provider, and release checks require
their own isolated evidence; file presence is not a pass.

## 7. Failure decisions

At every gate choose one: continue, rework the same slice, roll back, forward-fix,
or stop blocked. Stop immediately for environment ambiguity, unexpected production
targeting, secret exposure, destructive migration uncertainty, unknown external
outcome without reconciliation, or evidence that the diff overlaps user-owned work.

## 8. Evidence packet and sign-off

Record command, working directory, timestamp, exit code, sanitized output, build or
update ID, endpoint/environment, device/OS, screenshot or recording path, reviewer,
and not-run reason. Never commit secrets, customer data, temporary logs, or captures
unless requested.

The final report uses the format and lowest honest status required by `AGENTS.md`.
It names remaining blockers and the next bounded slice; it does not convert an
inventory into completion.

Research basis, reviewed 25 August 2026: [Google small changes](https://google.github.io/eng-practices/review/developer/small-cls.html),
[GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
[GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use),
[NIST SSDF](https://csrc.nist.gov/projects/ssdf), and [SLSA 1.2](https://slsa.dev/spec/v1.2/).
