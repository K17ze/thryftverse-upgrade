# Phase 3 Execution Roadmap

> Phase 3 audit date: 2026-08-14  
> Repository: `K17ze/thryftverse-upgrade`  
> Branch: `feat/product-detail-contract-media-device-closure`  
> Audited HEAD: `315a0760267354be46fec8a5f83ad8746badd392`

## WP-01 — Agent production truth
- remove/gate demo agent APIs
- Agent domain model
- RuntimeRegistry
- Secret Vault
- real connection probe
- dynamic models
- residue tests

Exit: no fake agent appears as real.

## WP-02 — Capability broker
- typed tools
- grants
- approval policy
- activity ledger
- Pause all
- risk tiers

Exit: runtime cannot bypass app authorization.

## WP-03 — Runtime adapters
- direct provider
- managed agent foundation
- remote host
- Codex host
- Hermes host
- native iOS/Android capability interfaces

Exit: sessions normalize into one event model.

## WP-04 — Agent UX
Agents Home, Connections, Create Agent, Agent Detail, Agent Session, Activity.

Exit: no consumer Bot nomenclature.

## WP-05 — Profile P0
Canonical resolver and public/owner split.

Implement before broad visual work.

## WP-06 — Poster Composer V3
Split top-level UI, reduce chrome, context tools, frame overview, video editing, publish handoff.

## WP-07 — Look Composer V3
Dedicated spatial workspace, item-native add flow, cutout/crop, layout assistance.

## WP-08 — Co-Own V3
Identity off media, simpler first viewports, Market details, evidence Due Diligence, shared cache.

## WP-09 — Chat V3
Controller decomposition, real AgentSession integration, approvals, suggestion priority.

## WP-10 — Wallet V3
Home, Add, Convert, Withdraw, Earnings, Activity; review + biometric transaction flow.

## WP-11 — Settings
Move real Agents out of developer-only IA. Keep protocol debugging advanced.

## WP-12 — Human art direction
Source residue cleanup, surface budgets, native QA.

## Commit discipline

Prefer focused commits:
- `fix(profile): make public profile projection immutable`
- `security(agent): remove insecure credential fallback`
- `feat(agent): add capability broker`
- `refactor(creator): split poster composer`
- `refactor(creator): split look composer`
- `refactor(wallet): separate money movement flows`
- `polish(coown): defer market microstructure`

## Stop conditions

Do not advance while:
- P0 truth issue remains;
- screenshot gate fails;
- duplicate affordance persists;
- a new demo path appears;
- a change adds more permanent chrome without measured justification.
