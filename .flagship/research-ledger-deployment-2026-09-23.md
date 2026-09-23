# Deployment research campaign ledger — 2026-09-23

## Plan
Deepen `docs/deployment/` research docs via 7 parallel background subagents, then
integrate into upgraded deep reports. DEPLOYMENT.md remains canonical ops runbook.

## Dispatched workers (all background, subagent_explore, web research)
- 403e3db2 — Telegram sovereignty deep-dive (entities, DCs, keys, Russia ban, distribution, Durov)
- b56cf9d3 — Peer platforms (Signal, Proton, Session, SimpleX, Briar, Wire, Matrix, Threema, WhatsApp)
- a4fb66ab — Censorship circumvention & app distribution (domain fronting→ECH, national blocking, store removals, alt-Android/iOS, OTA self-host)
- cbd749e8 — Broker/payment entity layering (Exness, FXCM/Stratos, IC Markets, XM, IBKR, Binance cautionary, Wise, Revolut, Stripe/Adyen/Airwallex)
- b796d56d — Fintech partner-bank/BaaS (Niyo timeline, Indian neobanks, Chime, Synapse collapse, payout rails, marketplace PSPs, MoR mechanics)
- 1164e40c — Legal mechanics (MLAT, CLOUD Act, GDPR transfers, data-localisation map, key-disclosure laws, sanctions, marketplace law, foundation mechanics)
- 1274bba3 — Repo grounding audit (countryCapabilities, key-service internals, PSP wiring, 1ze, OTA config, env-var gaps)

## Rulings
- Ruling: research workers are read-only (subagent_explore); they return reports as
  messages, controller writes all files — keeps write ownership single-threaded.
  Cost if wrong: extra context load in controller; accepted.
- Ruling: DEPLOYMENT.md stays canonical for ops; new depth lives in docs/deployment/.
  Cost if wrong: minor duplication; mitigated by pointer links.

## Status
- [x] workers complete (7/7 returned dense sourced reports)
- [x] integration into docs/deployment/* — new file 07-legal-machinery.md;
      02/03 rewritten as deep reports; 04 audit-corrected with
      [IMPL]/[PARTIAL]/[DOC]/[GAP] marks; 05 deepened with code-level threats;
      06 ledger expanded to ~120 mapped claims; README updated
- [x] adversarial claim check — spot-verified the two highest-risk repo claims
      verbatim (wise_global hard-false at countryCapabilities.ts:674-680;
      oneze_internal leak via null allowedGatewayIds at index.ts:25513-25616)

## Key material findings integrated
- Telegram "0 bytes" was already fiction (BKA 25/202 disclosures; Delhi HC);
  post-Durov-arrest policy broadened 2024-09-23 — structure protects platform,
  not founder.
- Domain fronting dead on rented CDNs; Iran whitelist model (Jan 2026) defeats
  DPI tricks entirely; Google dev-verification mandate lands 2027.
- Synapse = ledger-of-record failure ($65-95M unreconcilable); Niyo survived
  three partner failures via 3-5 parallel banks.
- Custody = universal licence trigger; MoR refuses C2C marketplaces.
- Repo audit: oneze_internal gateway leak, in-memory key-rotation state,
  rewrap gaps (TOTP/protected_change), plaintext message fallback, GDPR export
  omits encrypted tables, docsAuthHook open when ADMIN_TOKEN unset, §10 env ref
  missing ≥10 prod-required vars, all EU pinning is console-only [DOC].
