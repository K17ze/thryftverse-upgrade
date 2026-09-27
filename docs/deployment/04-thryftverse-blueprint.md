# 04 — ThryftVerse Jurisdiction & Payment Blueprint

> The applied answer: given the research in [`02`](./02-backend-sovereignty-research.md),
> [`03`](./03-payment-jurisdictions-research.md) and
> [`07`](./07-legal-machinery.md), what should ThryftVerse's entity stack,
> infrastructure layout, key custody, payment routing and distribution look
> like — and what **already exists in this repo** versus what is only a
> documented target?
>
> Complements DEPLOYMENT.md §§19–26 (strategy) and §§27–37 (per-country matrix).
> This file is the **decision document**.
>
> **Implementation status legend** (from the 2026-09-23 code audit):
> `[IMPL]` implemented in code · `[PARTIAL]` partially implemented ·
> `[DOC]` documented target only, nothing in code · `[GAP]` documented but
> absent or contradicted.

---

## 1. Chosen pattern: Hybrid B + A (with payment-layer routing from the broker model)

ThryftVerse must retain transaction data (orders, payouts, addresses, KYC), so
Signal's "hold nothing" is impossible and Session's "no centre" is incompatible
with settlement. We take:

- **From Telegram (A):** entity separation by function, infrastructure spread
  across jurisdictions, own distribution channel, keys never co-located with
  the compellable layer.
- **From Proton (B):** a fortress primary jurisdiction (EU/NL) plus a
  foundation-style governance lock against acquisition.
- **From Exness/FXCM (payment layer):** per-region contracting entities and
  per-cluster PSP routing — the user signs with the *regional* entity.
- **From Niyo (payment layer):** every regulated rail is a swappable partner —
  ≥2 live providers per strategic cluster, because partner failure is a
  *when*, not an *if*.
- **From Synapse (negative):** any balance-touching ledger is reconciled daily
  against the regulated partner — our `oneze` reserve/reconciliation machinery
  already implements this pattern internally (§5).

## 2. Entity stack (target — DEPLOYMENT.md §21)

```
ThryftVerse Group Ltd (BVI)            holding: IP, brand, domain, vendor MSAs
├── ThryftVerse Operations AG (CH)     operating: team, payroll, EU/UK contracting party
│   or ThryftVerse FZ-LLC (Dubai)      (alternative if team is UAE-based)
├── ThryftVerse Foundation (CH)        10–20% equity, charter blocks hostile acquisition
├── ThryftVerse India Pvt Ltd          IN contracting party — required once Razorpay
│                                      (needs Indian entity/PAN/GST) goes live
└── Regional contracting passthrough   EU users ↔ CH opco · IN users ↔ IN entity ·
                                       RoW ↔ BVI holding (via opco services agreement)
```

**Honest legal footnotes** (from 07-legal-machinery):
- A BVI holdco is **inside the US treaty network** (US–UK MLAT extended to BVI,
  in force 1990) — it buys MLAT friction (months, dual-sovereignty review), not
  immunity. It does nothing against sanctions or marketplace tax duties.
- The foundation lock is a **shareholder-vote veto**, not legal impossibility —
  Swiss supervisors can appoint organs; asset sales remain theoretical paths.
  It blocks *change of control via share transfer*, which is the real threat.
- US-person founders/officers remain personally subpoenable wherever they sit —
  structure around the *person* layer too (§7).

## 3. Infrastructure & data layout — audit-corrected

**Critical correction from the code audit:** DEPLOYMENT.md's EU-pinned day-1
deployment is a **console/operator choice, not encoded anywhere in the repo** —
there is no `railway.json`, `wrangler.toml`, `fly.toml` or IaC; `KEY_SERVICE_REGION`
/`KEY_SERVICE_COUNTRY` are `/health` metadata only; `S3_REGION=auto` is passed
through; the R2 `jurisdiction: "eu"` snippet in §20 is illustrative (no wrangler
file exists); the frontend has a single prod endpoint (`api.thryftverse.com`).
**All EU-region claims are `[DOC]` — enforced by runbook, not code.**

| Layer | Placement (target) | Status | Compulsion surface |
|---|---|---|---|
| Compute (api, key-svc, ml-svc) | Railway Amsterdam | `[DOC]` — region is a Railway console setting | EU/NL if set; operator-discipline dependent |
| Postgres | Neon EU West | `[DOC]` | EU/GDPR if set |
| Redis | Upstash EU West 1 | `[DOC]` | EU/GDPR if set |
| Object storage | R2 `jurisdiction:"eu"` | `[DOC]` — console/CLI bucket choice | EU if set |
| DNS/WAF/CDN | Cloudflare anycast | `[IMPL]` (by provider) | Global |
| **Keys** | `key-service` deployed EU/NL; `KEY_SERVICE_REGION`/`_COUNTRY` are health metadata only | `[PARTIAL]` | placement is operator choice; crypto layer is real (§5) |
| Build/OTA | Expo EAS (US), `updates.url=https://u.expo.dev/...` | `[IMPL]` — Expo-hosted, **not** self-hosted | US chokepoint for updates (see §6) |
| Stores | Apple/Google | `[IMPL]` | US-territory removal risk (02 §III.3) |
| Backups | pg_dump → AES-256-CBC (`BACKUP_ENCRYPTION_KEY`) → S3 SSE-KMS | `[IMPL]` workflow; cross-jurisdiction claim `[DOC]` | depends on bucket jurisdiction |

**Action item (P1):** encode region choices as IaC or deployment manifests so
the residency posture is reviewable and can't silently drift — today it is
invisible to the repo.

## 4. Payment layer — per-cluster routing (audit-corrected)

`countryCapabilities.ts` resolves every country to a cluster
(`IN, US, UK, EUROPE, MIDDLE_EAST, CHINA_NEARBY, GLOBAL`) with per-cluster
`gatewaysByChannel` across **5 channels** (`commerce`, `co-own`,
`wallet_topup`, `wallet_withdrawal`, `oneze_wallet`), payout priorities, tax
rules, and restricted items. `isGatewayConfigured()` env-gates each provider.
`[IMPL]`

**Audit-verified provider matrix** (`POST /webhooks/:provider`,
`index.ts:31181+`; verified signature verification + normalization + idempotent
settlement for each):

| Provider | Intents | Refunds | Payouts | Public listing | Audit note |
|---|---|---|---|---|---|
| Stripe | ✓ | ✓ | ✓ (Connect) | ✓ | readiness requires ≥1 complete provider set |
| Razorpay | ✓ (UPI) | ✓ | ✓ | ✓ | — |
| Mollie | ✓ (iDEAL/Bancontact/Klarna) | ✓ | ✓ | ✓ | — |
| Flutterwave | ✓ | ✓ | ✓ | ✓ | — |
| Tap | ✓ | ✓ | ✓ | ✓ | — |
| PayPal | ✓ (alt-methods REST) | via provider | — | via alt-methods | env-gated |
| **Wise** | **✗** | **✗** | **payout-status webhooks + revenue sweeps only** | **✗ hard-disabled** | `isGatewayConfigured('wise_global')` returns `false` (`countryCapabilities.ts:674-680`); Wise appears in **no** payout priority list; `WISE_WEBHOOK_SECRET` is consumed — not dead config, but **Wise is not a live rail** |
| `oneze_internal` | closed-loop debit/escrow | via commerce pipeline | — | **suppressed per-user — but see leak below** | always "configured" |
| `mock_fiat_gbp` | dev only | — | dev | dev | forbidden in prod by readiness check + 404 |

**Corrections to earlier drafts:** Wise is **not** a payment gateway or payout
priority — it is only the outbound executor for platform revenue sweeps and a
payout-status webhook source. Do not list Wise as a user-facing rail in
DEPLOYMENT.md §§27–28 without qualification.

**Payout priorities (code, `countryCapabilities.ts`):** IN `[razorpay_in,
stripe_americas]`; US `[stripe_americas]`; UK `[stripe_americas, mollie_eu]`;
EU `[mollie_eu, stripe_americas]`; ME `[tap_gulf, stripe_americas]`; CN_NEARBY
`[stripe_americas]`; GLOBAL `[stripe_americas, mollie_eu]`.

**`[GAP]` — internal-rail leak:** `GET /payments/gateways` with **no `userId`**
returns all active DB gateways *including `oneze_internal`* — `allowedGatewayIds=null`
bypasses the channel filter and `isGatewayConfigured('oneze_internal')` always
returns true (`index.ts:25513-25616`, `countryCapabilities.ts:196-216`).
Per-user lists correctly exclude it. **Fix: require `userId` or filter internal
rails unconditionally.**

**`[IMPL]` — per-region contracting:** the cluster→entity mapping is the
"routing matrix" from 03-Part-I §5 done in code. Receipts/ToS/PSP accounts must
name the regional entity (ops discipline, not code). The Stripe account's legal
entity = CH opco for EU/UK/RoW; Razorpay = Indian entity.

**Settlement vs custody rule:** ThryftVerse must never custody user fiat —
PSPs hold buyer funds, payout rails deliver seller funds. We hold *receivables*,
not *deposits*. The licence trigger is custody (03 §II.7). **Exception to
watch — `oneze`:** the closed-loop internal rail is deeply implemented (§5) —
mint requires a settled payment intent in prod; burn/redemption requires a
`payoutRequestId` (direct redemption is structurally unavailable);
`ONEZE_ENABLE_DIRECT_REDEMPTION` is documented but **never read by `config.ts`**
(`[GAP]` — wire it or delete it). Whether 1ZE is e-money/stored value is a
legal question — keep it non-redeemable-outside-payout and jurisdiction-gated
(the seed policies already deny GLOBAL P2P and gate IN/DE/FR/GB/AE/NG/KE).

**MoR for long-tail:** MoR (Stripe Managed Payments/Paddle) may cover
*first-party* platform revenue in low-volume markets — but **MoR explicitly
refuses marketplace/C2C flows** (03 §II.6); seller↔buyer sales stay on
sub-merchant rails, and facilitator/DAC7/TCS duties are ours regardless.

## 5. Key custody & the 1ZE rail — audit-verified current state

**Key service `[IMPL]` with real crypto:**
- `backend/key-service`: AES-256-GCM, 12-byte IV, per-namespace+version keys
  via deterministic HKDF from `KEY_SERVICE_MASTER_KEY_B64` (exactly 32 bytes);
  namespaces `profile/message/wallet`; base64 AAD required; client/admin token
  split; prod rejects the dev master key and requires ≥32-char distinct tokens.
- Backed tables: `user_secure_profiles`, `secure_messages`,
  `wallet_secure_snapshots`, `user_totp_factors.secret_ciphertext`,
  `protected_change_history.old_value_encrypted`. Provider API credentials use
  a separate local vault (`ENCRYPTION_KEY`).

**Audit caveats (fix before relying on rotation):**
- **`[PARTIAL]` Rotation state is in-memory** — restart resets current version
  to `KEY_SERVICE_DEFAULT_KEY_VERSION`. Old ciphertext still decrypts
  (deterministic HKDF), so the failure mode is silent *version regression*:
  new writes revert to the old version after restart. Persist version state.
- **`[PARTIAL]` Rewrap coverage gap** — `/keys/rewrap` iterates only
  `user_secure_profiles`, `secure_messages`, `wallet_secure_snapshots`
  (`index.ts:9367-9497`). **`user_totp_factors` and `protected_change_history`
  are never rewrapped** — rotation leaves TOTP secrets under the old key.
- **`[PARTIAL]` Plaintext fallback** — `resolveMessageBody` falls back to the
  `body` column on decrypt failure (migration-friendly, but ciphertext failure
  silently degrades to plaintext).
- **`[GAP]` GDPR export** — `/users/me/export` serializes raw rows across ~30
  tables; encrypted tables are **omitted entirely** — neither decrypted nor
  exported.
- AAD reconstruction uses `changed_at` ISO vs DB value
  (`accountTakeoverService.ts:811-812`) — works only if formats match; add a
  regression test.

**1ZE rail `[IMPL]`, deeply:** `applyWalletLedgerDelta` (walletMoneyPath.ts)
with deterministic locking + claim-before-mutate idempotency; mint requires a
settled payment intent in prod; three-phase withdrawal (quote → reserve →
security-admin-gated execute); P2P with per-jurisdiction policies + **travel
rule** when cross-country ≥ `ONEZE_TRAVEL_RULE_THRESHOLD_UNITS`; Redis kill
switches (`oneze:mint_burn_halted`, fail-closed on malformed state;
`PAYOUTS_PAUSED_REDIS_KEY` set by reconciliation on mismatch); daily
HMAC-signed attestation; FX sync; reserve policy. **This is the Synapse lesson
already embodied**: ledger + reconciliation + halt + attestation.

**v2 (Telegram-grade, scheduled not day-1):** Shamir k-of-n split of the master
key across jurisdictions (NL key-service + CH opco HSM/KMS + offline multi-sig
recovery set). Justified when wallet volumes make key compromise existential —
schedule with IN-region provisioning. **Caveat from 02 §I.3:** Telegram's own
split-key mechanism is unpublished and failed its one court test — treat
Shamir-splitting as defense-in-depth, not a legal shield; courts compel
*processes*, not shares.

**Distribution keys:** OTA `private-key.pem` + Android signing key belong in
multi-sig/HSM custody with a ≥2-person release ceremony — the OTA key pushes
arbitrary JS to every device; it is as powerful as the APK key. The repo
already enforces: `app.config.js` fails closed without
`keys/update-certificate.pem`; private key materialized at publish time only
(umask 077, scrubbed `always()`) in `release-train.yml`.

## 6. Distribution resilience — audit-corrected

| Channel | Status | Covers |
|---|---|---|
| App Store / Play | `[IMPL]` standard path | normal regions |
| Signed EAS OTA (staging/canary/1%→100%, rollback, prod-approval env) | `[IMPL]` — `ota-staged-rollout.yml`, `release-train.yml`, `ota-rollback.yml`; code signing wired | runtime updates via **u.expo.dev (US chokepoint)** |
| Self-hosted expo-updates server (`updates.thryftverse.app`) | `[DOC]` — no self-hosted server exists; `updates.url` points at Expo | removes the US chokepoint + metered MAU |
| Direct APK + published SHA-256 + Obtainium-trackable GitHub releases | `[DOC]` — **no APK build/serve config found** | Play-blocked regions; requires Google dev verification (2027 global mandate — see 02 §III.4) |
| Self-update flavor (cert-pinning, `REQUEST_INSTALL_PACKAGES`) | `[DOC]` | must be a separate non-Play flavor |
| Samsung/Huawei/Xiaomi stores; RuStore | `[DOC]` | market-entry decisions; **drop Amazon Appstore (dead Aug 2025)** |
| PWA fallback | `[DOC]` — not built | the only honest iOS answer |
| SSL pinning | `[IMPL]` infra + fail-closed validation | **committed pins are dev self-signed placeholders — replace pre-store** |

**Per-region OTA channels** (`production-eu/-in/-sg/-me`) ship jurisdiction-
specific config without store review — the commerce analog of Telegram's update
channel. Channel mapping exists; per-region channels are config work, not new
code.

## 7. Team & operations (the human layer — Durov + Lavabit lessons)

- No single person holds: DB master creds, key-service admin token, Android
  signing key, OTA private key, PSP dashboard owners, domain registrar.
- Multi-sig/dual-control on: signing keys, master-key recovery shares, DNS
  changes, store releases.
- **`[GAP]` `docsAuthHook`** (`index.ts:742-765`) — docs/metrics are open when
  `ADMIN_TOKEN` is unset despite intent to gate; fail closed.
- Founders' physical residency is a deployment decision.

## 8. DEPLOYMENT.md §10 env-reference gaps (audit)

§10 is materially incomplete — **missing production-required vars**:
`APP_URL`, `REDIS_QUEUE_URL`, `REDIS_CACHE_URL`, `S3_CDN_BASE_URL`,
`DECISION_SERVICE_TOKEN`, `ENCRYPTION_KEY`, `KYC_RETURN_URL`,
`KYC_WEBHOOK_SECRET`, `MODERATION_PROVIDER`, `MEILISEARCH_URL`,
`PERSONA_*`/`ONFIDO_*` (vendor-conditional), all `MOLLIE_*`, `FLUTTERWAVE_*`,
`TAP_*`, `PAYPAL_*` creds, plus ~50 operational vars (ONEZE_* controls, FX_*,
`PAYOUT_*`, `S3_*` caps, `JWT_*`, `WEBAUTHN_*`, `CORS_ALLOWED_ORIGINS`,
`WEBHOOK_IP_ALLOWLIST_*`, `PAYMENT_WEBHOOK_TOLERANCE_SECONDS`, etc.).
Also documents `ONEZE_ENABLE_DIRECT_REDEMPTION` which is never read, and has
default mismatches (`ONEZE_FX_SYNC_INTERVAL_MS` doc 86400000 vs code 300000;
`ONEZE_FX_PROVIDER_BASE_CURRENCY` doc INR vs code USD). **Action item (P1):
reconcile §10 with `config.ts`'s `REQUIRED_PRODUCTION_VALUES`.**

## 9. What this blueprint deliberately does *not* do

- Does not pursue own-ASN/own-DC — Cloudflare anycast + multi-vendor is
  proportional; revisit >100K MAU.
- Does not chase E2E for transaction data — impossible for settlement.
- Does not seek a financial-services licence — structure avoids custody.
  The `oneze` closed-loop rail is the exception to keep legally bounded
  (jurisdiction-gated policies + no external redemption path).
- Does not promise immunity — see [`05-threat-model.md`](./05-threat-model.md)
  and [`07-legal-machinery.md`](./07-legal-machinery.md).
