# ThryftVerse — Deployment Documentation

> **Purpose:** This folder is the deployment knowledge base. It consolidates (a) how
> to deploy ThryftVerse to production, (b) researched evidence on how platforms like
> Telegram, Signal, Proton and Session configured their backends to minimise
> single-institution control, and (c) researched evidence on how cross-border
> financial platforms (Exness, FXCM, Niyo Global, merchant-of-record providers)
> structure entities and payment layers across jurisdictions — and how those
> patterns apply to ThryftVerse.
>
> **Research date:** September 2026 (live web research; sources logged in
> [`06-research-ledger.md`](./06-research-ledger.md)).
> **Canonical operational runbook:** [`DEPLOYMENT.md`](../../DEPLOYMENT.md) at repo
> root remains the authoritative step-by-step provisioning guide. This folder does
> not duplicate it — it adds the research, rationale and decision layer around it.

---

## Document map

| # | Document | Read this when… |
|---|----------|-----------------|
| — | [`DEPLOYMENT.md`](../../DEPLOYMENT.md) (repo root) | You are actually provisioning production — accounts, secrets, Neon/Upstash/R2/Railway setup, env vars, EAS builds, runbooks, multi-country matrix (§§1–37). |
| 01 | [`01-operational-summary.md`](./01-operational-summary.md) | You need the day-1 topology and deployment checklist at a glance without reading 2,600 lines. |
| 02 | [`02-backend-sovereignty-research.md`](./02-backend-sovereignty-research.md) | You need the deep case study: how Telegram (and Signal, Proton, Session, Wire, Matrix) structured entities, datacentres, key custody and distribution so that no single institution can seize, block or compel the whole platform. |
| 03 | [`03-payment-jurisdictions-research.md`](./03-payment-jurisdictions-research.md) | You need the deep case study: how Exness and FXCM run entity-per-licence books, how Niyo Global runs a partner-bank layer with no licence of its own, and how merchant-of-record providers move legal liability across borders. |
| 04 | [`04-thryftverse-blueprint.md`](./04-thryftverse-blueprint.md) | You need the applied answer: the recommended entity stack, infrastructure layout, key-custody model, payment routing and distribution channels for ThryftVerse — **audit-corrected against the actual code** (every claim marked `[IMPL]`/`[PARTIAL]`/`[DOC]`/`[GAP]`). |
| 05 | [`05-threat-model.md`](./05-threat-model.md) | You need the honest threat model — what this structure protects against, what it does not, the failure cases observed in the wild (Durov arrest, Roskomnadzor, RBI/SBM, ASIC stop order, Synapse collapse, Binance plea, Iran whitelist, VÜPF drift), **plus threats found inside our own codebase**. |
| 06 | [`06-research-ledger.md`](./06-research-ledger.md) | You need to verify any claim. Every material assertion maps to a dated primary or authoritative source, incl. the code-level repo audit. |
| 07 | [`07-legal-machinery.md`](./07-legal-machinery.md) | You need the compulsion mechanics underneath every "jurisdictional resilience" claim: MLAT timelines, CLOUD Act reach, GDPR Art. 48, data-localisation map, key-disclosure laws, sanctions, marketplace tax floors, and what foundation locks actually do. |

## How the documents relate

```
DEPLOYMENT.md (root)          ← HOW: step-by-step provisioning & runbooks
        │
docs/deployment/
  01-operational-summary      ← WHAT: condensed day-1 topology & checklist
  02-backend-sovereignty      ← WHY (case study): institutional-control minimisation
  03-payment-jurisdictions    ← WHY (case study): cross-border payment layering
  04-thryftverse-blueprint    ← SO WHAT: applied architecture & decisions (audit-corrected)
  05-threat-model             ← LIMITS: honest protection boundary + in-repo findings
  06-research-ledger          ← PROOF: sources, access dates, claim mapping
  07-legal-machinery          ← LAW: compulsion mechanics (MLAT/CLOUD/GDPR/keys/sanctions)
```

## Core conclusions (one-paragraph version)

1. **No platform is above the law; the achievable goal is raising the cost of
   compulsion.** Telegram's real architecture is: BVI holding + Dubai operating +
   own ASN + datacentres under different legal entities + decryption keys split so
   they are never co-located with the data they protect — meaning several court
   orders in several jurisdictions are required to force disclosure. **Honest
   postscript:** the key-split mechanism is unpublished, failed its one court
   test (Delhi HC 2022), and the founder's arrest produced a data-sharing
   expansion in weeks — the structure protects the platform, not the person.
   Signal instead accepts one jurisdiction (US) and holds almost nothing
   (5+ subpoenas → 2 timestamps each). Proton pairs a strong jurisdiction
   (Switzerland) with a foundation change-of-control veto — and moved infra out
   of Switzerland when the law drifted (VÜPF), proving *mobility* is the real
   defence. Session removes the central server. ThryftVerse is a commerce
   platform — it *must* hold transaction data — so the honest pattern is
   Telegram's layering + Proton's governance lock, not Signal's data minimalism.
2. **Cross-border payment platforms don't have one licence — they have a routing
   table.** Exness runs ≥8 licensed entities and points each client at the entity
   matching their jurisdiction (EU/UK clients into CySEC/FCA books; everyone else
   into Seychelles/BVI/Mauritius). FXCM/Stratos does the same, including a
   deliberately unregulated SVG entity for uncovered markets. Niyo Global holds no
   licence at all — it is a UX layer on RBI-regulated partner banks, and survived
   **three** partner failures (YES Bank moratorium, RBI's 15-month SBM LRS ban,
   Equitas exit) only because it ran 3–5 banks in parallel. The universal licence
   trigger is **custody of customer funds** — never hold them. For ThryftVerse
   the equivalent already exists in code (`countryCapabilities.ts` cluster →
   gateway routing); the missing layer is *which legal entity contracts with
   users, PSPs and banks in each region*. Binance is the counterexample:
   arbitrage by opacity ends in a $4.3B plea and a monitorship.
3. **Day-1 is the resilient configuration — but verify it in code, not
   consoles.** The 2026-09-23 audit found the entire EU-region pinning is
   operator console settings invisible to the repo (`[DOC]`), OTA is Expo-hosted
   (a US chokepoint), and Wise is hard-disabled as a rail despite being listed
   in DEPLOYMENT.md's matrix. The blueprint (`04`) now marks every claim
   `[IMPL]`/`[PARTIAL]`/`[DOC]`/`[GAP]` so the doc↔code gap is visible instead
   of assumed.

## Rules for maintaining this folder

- **DEPLOYMENT.md stays canonical for operations.** If provisioning steps change,
  edit DEPLOYMENT.md; update `01-operational-summary.md` only if the topology
  itself changes.
- **Every claim needs a source or a code reference.** Add entries to
  `06-research-ledger.md` whenever a new claim is introduced. Distinguish primary
  documentation, court/registry records, vendor docs, and secondary analysis.
- **Keep the honesty clauses.** Every document states what a pattern does *not*
  protect against. Do not soften them — the threat model is the difference between
  engineering and marketing.
