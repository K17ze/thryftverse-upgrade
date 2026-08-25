---
auto_execution_mode: 0
description: Close one frontend-to-backend capability with truthful state, isolated live evidence, propagation, security, and recovery
---

# Live-Signs Convergence Loop

Use this workflow for any change involving data, endpoints, mutations, realtime,
workers, trust signals, authentication, privacy, or external providers. One surface
passes end to end before its pattern is generalized.

## Required inputs and safety boundary

Record the user journey, entity or aggregate, target environment, test identity,
allowed mutations, cleanup plan, and directly coupled surfaces. Local or isolated
staging is the default. Never mutate production, trigger real payments/messages,
or access customer data without explicit authorization. Redact tokens, personal
data, internal IDs, and provider payloads from evidence.

## 1. Trace the complete contract

Map both directions:

```text
migration/table → repository/query → transaction → handler → schema/serializer
→ API client → query/cache/store → orchestration → UI → route

user action → optimistic/outbox state → request/idempotency → transaction/worker
→ event/replay → cache invalidation/reconciliation → every consuming surface
```

For each field and state record the canonical owner, authorization projection,
nullable behavior, producer, consumers, persistence lifetime, and versioning rule.
Identify mocks, hardcoded values, duplicate types, discarded server fields, and
frontend assertions. Production fallback to mock data is a failure.

## 2. Define invariants before code

State observable invariants, not one prescribed implementation:

- authorization and privacy fail closed;
- trust/status signals render only from evidenced server state;
- replaying the same operation cannot double-create, double-sell, or double-charge;
- concurrent writers preserve the business invariant through an appropriate
  transaction, constraint, lock, compare-and-swap, or isolation level;
- an accepted mutation propagates to every consuming surface;
- reconnect detects event gaps and returns to canonical state;
- timers, subscriptions, uploads, and abortable requests are cleaned up;
- logs/metrics expose outcome without leaking sensitive data.

For messaging or creation, use a stable client operation ID. For money or other
irreversible operations, define an idempotency contract and reconciliation lookup.

## 3. Implement the state machine

Cover the states relevant to the journey:

```text
initial/loading · cached/refreshing · populated · empty · filtered-empty
partial · offline · permission/auth denied · submitting/queued
acknowledged · succeeded · failed/retryable · failed/final · unknown outcome
```

Unknown outcome means the request may have committed but the response was lost. It
is neither success nor failure. Preserve the operation key, provide “Check result,”
and retry only through the same idempotent contract. Never fabricate confirmation.

Deterministic fixtures are for local/staging verification. A truthful production
empty state is valid; production seed data is not a completion requirement.

## 4. Propagation and realtime

Enumerate the propagation surface set before the mutation. Use the repository's
canonical query invalidation, normalized store update, focus refetch, or event
reconciliation mechanism. Do not add a screen-local timer to compensate for stale
ownership.

Realtime streams need authorization, monotonic sequence/version information or an
equivalent gap detector, reconnect/backoff, bounded buffering, deduplication, and a
canonical refetch path. Process death and multi-device behavior must not depend on
in-memory state alone.

## 5. Verify in layers

1. Run type and focused unit/contract tests.
2. Start only the isolated dependencies required by the slice.
3. Provision a disposable database and set `RUN_INTEGRATION_TESTS=true` plus
   `TEST_DATABASE_URL` through the secure environment. Parse and record only its
   redacted host/database name; reject missing, unknown, shared, or production-like
   targets. Set `DATABASE_URL` explicitly to this validated target before migration.
4. Migrate a clean schema and, when relevant, rehearse upgrade compatibility.
5. Hit the actual local/staging endpoint with synthetic identities and rows.
6. Exercise success, duplicate/replay, unauthorized, validation, concurrency,
   interruption, offline, and unknown-outcome paths.
7. Confirm every consuming surface converges after mutation and app restart.
8. Confirm worker retry/dead-letter or provider reconciliation when applicable.
9. Clean up synthetic data and record sanitized evidence.

Resolve commands from manifests. Common families include:

```text
npm run backend:api:build
npm run backend:api:test
npm --prefix backend/api run test:integration
npm run backend:api:migrate
npm run frontend:typecheck
npm run frontend:test
```

This repository's integration script can return exit code 0 while database tests
are skipped. A passing gate therefore requires the expected persistence cases to
run with zero relevant skips; record counts, not only the exit code.

Do not run the migration rollback command until matching down migrations are proven
to exist and are tested; prefer a rehearsed forward-fix when rollback is unsupported.

## 6. Security and observability gate

Verify authentication, object-level authorization, data minimization, rate limits,
input/media validation, secret handling, abuse/report/block paths, and auditability.
Use OWASP MASVS for native controls and ASVS for backend controls as baselines, not
as proof that the implementation passed.

Define user-centered SLIs for the journey: success rate, latency percentile,
duplicate rate, stale-state rate, queue age, reconciliation time, and unknown-outcome
rate. A metric without alert/owner or a log without correlation context is not an
operational closure.

## 7. Independent critique and terminal status

Give a reviewer the contract trace, sanitized endpoint evidence, propagation set,
state matrix, and test results—without the implementation narrative. The reviewer
checks fabrication, authorization, races, stale surfaces, leaks, and recovery. If an
independent reviewer or live environment is unavailable, report the corresponding
validation pending status; do not self-sign.

Research basis, reviewed 25 August 2026: [NIST SSDF](https://csrc.nist.gov/projects/ssdf),
[OWASP MASVS](https://mas.owasp.org/MASVS/), [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/),
and [OpenTelemetry observability](https://opentelemetry.io/docs/concepts/observability-primer/).
