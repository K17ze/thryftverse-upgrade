# 05 — Threat Model: What Jurisdictional Layering Actually Buys

> Consolidated honest assessment, upgraded 2026-09-23. Every row is either
> observed in the wild (with a real incident cited) or derived from the
> documented mechanics in [`02`](./02-backend-sovereignty-research.md),
> [`03`](./03-payment-jurisdictions-research.md) and
> [`07`](./07-legal-machinery.md). Includes a code-level section for threats
> found in *our own* repo audit. Keep it honest or the structure is theatre.

## 1. Threats the structure DOES protect against

| Threat | Defence | Evidence it works |
|---|---|---|
| Single-government subpoena for all user data | Data pinned per region; keys in NL; no single jurisdiction holds everything | Telegram split-key claim + our layout; Signal's subpoena record shows the *stronger* version (hold nothing → 2 timestamps) |
| One court order reaches decryption keys | key-service NL + token-gated access; (v2) Shamir-split | Telegram FAQ mechanism; note: unpublished & failed in Delhi HC — defense-in-depth, not a shield |
| Cloud provider compelled to kill the platform | Multi-vendor: Cloudflare + Railway + Neon + Upstash | Telegram went further (own ASN) — ours is the proportional version |
| App-store block in one country (Android) | Direct APK + Obtainium/GitHub releases + per-region stores | Telegram's telegram.org APK survived the Russia ban; removals are territory-scoped (China VPN purge, Navalny precedent) |
| Store-review veto on updates | Signed OTA pipeline (staged rollout + rollback already implemented) | Telegram's own update channel analog |
| Hostile acquisition | Foundation stake charter-bound to block | Proton Foundation legally blocks change of control (shareholder-vote veto — see 07 §8 limits) |
| Payment provider de-platforming | Per-cluster providers + `isGatewayConfigured()` failover | Niyo survived YES Bank moratorium, SBM LRS ban, Equitas exit via 3–5 parallel partners |
| ISP/national DNS blocking | Cloudflare anycast + (future) mirror-rotation runbook | Telegram vs Roskomnadzor; RSF Collateral Freedom mirror-fleet model |
| Physical server seizure | Nothing single-site; encrypted backups outside primary jurisdiction | Multi-DC model |

## 2. Threats it only PARTIALLY protects against

| Threat | Why partial | Real-world precedent |
|---|---|---|
| **Founder/key-person detention** | Distributed ownership + multi-sig reduces but can't remove personal risk | **Durov arrested France Aug 2024** — BVI/Dubai/5-DC structure didn't help; arrest produced a data-sharing expansion in ~4 weeks |
| **Payment partner's own regulator** | Your rail's licence can be pulled mid-operation | **RBI barred SBM from all LRS** (Jan 2023–Apr 2024): ~50% of Niyo's book dead 15 months. **Razorpay frozen 17 months** awaiting PA authorisation |
| **Regulator stops one regional book** | Entity separation contains it; region's users still hit | **ASIC DDO stop order vs Stratos Trading, Dec 2025**; RBI, CFTC precedents |
| **Partner churn/exit** | Config-level swaps are fast but not free | **Equitas exited Niyo Jun 2025** — forced migration, degraded product |
| **Middleware/partner insolvency** | Multi-partner helps only if ledgers reconcile | **Synapse 2024**: ~$219M frozen, **$65–95M un-reconcilable**, >100k users locked; "FDIC-insured" marketing proved meaningless for a non-bank |
| **DNS/DPI blocking** | Anycast helps; determined censors escalate | Russia blocked ~19M IPs (2018) — worked vs collateral, Telegram survived via rotation; **post-2019 TSPU does protocol-level DPI**; domain fronting is dead on Google/Amazon |
| **Whitelist-model censorship (Iran)** | Under default-deny, nothing gets out except approved endpoints | **Iran Jan 2026**: near-total blackout → permanent "Selective Whitelist" (stores + Google/GitHub whitelisted). Only whitelisted-channel strategies survive |
| **iOS install in sanctioned regions** | No clean sideload; even EU DMA keeps Apple's notarization kill-switch | Apple froze Telegram updates globally 6 weeks (2018); removed it from China store (2024). **PWA is the only honest fallback** |
| **Platform ban (country bans ThryftVerse itself)** | Multi-provider can't help if the *merchant* is banned | Entity separation contains it to that country's book (Exness model); India §69A shows the dual store+ISP enforcement pattern |
| **CLOUD Act reach via US vendors** | Stripe/Expo/Apple/Google are US persons; control ≠ custody | §2713 reaches provider-controlled data anywhere; our exposure is payment metadata at Stripe + build/OTA artifacts — user data-at-rest stays EU |
| **Compelled update/assistance** | Code signing gates *who* signs, not what a court can order signed | Apple–FBI AWA order (2016, withdrawn — authority unresolved); Australia **TCN** can compel building new capabilities; India **s.69(4)** decryption-assistance duty (up to 7 yrs) |

## 3. Threats it does NOT protect against (honest floor)

| Threat | Why the structure can't help |
|---|---|
| **Coordinated multi-government action** | US+EU+IN coordination defeats distribution. The ceiling of the whole strategy. |
| **Lawful orders where we operate** | Operating there means answering their courts — entity separation doesn't exempt an operating entity from its own regulator |
| **Key-disclosure/compelled-assistance regimes** | UK RIPA s.49 (2–5 yrs), France 434-15-2 (3 yrs+€270k), India s.69 (7 yrs), Australia TCN, US All Writs. E2EE converts *disclosure* to impossibility but not *compelled assistance* — and commerce can't be fully E2E |
| **Sanctions** | OFAC reach follows USD clearing + US-person vendors + secondary sanctions — **domicile is nearly irrelevant** (07 §6) |
| **Marketplace tax/reporting floor** | Facilitator laws, DAC7, deemed-supplier, India TCS/TDS attach to *transacting into the market*, not to incorporation site |
| **Jurisdictional drift** | **VÜPF pushed Proton to move infra out of Switzerland (2025–26)**; Session fled Australia's TOLA. The fortress moves — defence is *mobility*, not any one country |
| **Nation-state attackers** | They compromise infrastructure regardless; goal is *expensive and visible*, not impossible |
| **Opacity-as-strategy** | **Binance**: "no HQ" → $4.3B plea, 3-yr monitorship, CZ prison + forced voting-right cession. Jurisdiction attaches via currency and customers |

## 4. Code-level threats found in our own audit (2026-09-23)

These are real, in-repo findings — not hypothetical:

| Finding | Risk | Status |
|---|---|---|
| `GET /payments/gateways` without `userId` leaks `oneze_internal` in the public list | Internal closed-loop rail exposed in API surface — confusing at best, information leak at worst | `[GAP]` — fix: require userId or filter internal rails unconditionally |
| Key-service rotation version state is **in-memory** | Restart silently regresses new writes to default key version | `[PARTIAL]` — persist version state |
| Rewrap misses `user_totp_factors` + `protected_change_history` | After rotation, TOTP secrets stay under the old key forever | `[PARTIAL]` — extend rewrap coverage |
| Message decrypt **falls back to plaintext `body`** | Ciphertext failure degrades silently to plaintext | `[PARTIAL]` — intended for migration; monitor/expire it |
| GDPR export omits encrypted tables entirely | Export is incomplete vs "all your data" expectations | `[GAP]` — decrypt-or-note |
| `docsAuthHook` open when `ADMIN_TOKEN` unset | Docs/metrics unauthenticated in prod | `[GAP]` — fail closed |
| All EU-region pinning is operator console choice | Residency posture invisible to code review; can silently drift | `[DOC]` — encode as IaC |
| `u.expo.dev` is a single US chokepoint for OTA | US legal pressure on Expo can stall all updates | `[DOC]` — self-host target |
| DEPLOYMENT.md §10 missing ≥10 prod-required env vars | Operators following docs hit readiness-check failures | `[GAP]` — reconcile with `REQUIRED_PRODUCTION_VALUES` |
| Committed SSL pins are dev self-signed placeholders | Shipping them = broken or insecure pinning | flagged in-repo; replace pre-store |

## 5. Failure-mode playbook (precedents → pre-built answers)

| Scenario | Pre-built answer |
|---|---|
| PSP disabled in a region (SBM-LRS event) | Second live PSP per strategic cluster + `isGatewayConfigured()` failover (already in code) + comms template |
| Partner insolvency (Synapse event) | Ledger-of-record at regulated partner or daily reconciliation — our `oneze` recon/attestation machinery already embodies this; extend to any future pooled balances |
| Regional regulator stop order (ASIC-DDO event) | Entity-per-region contracting contains it; runbook: freeze regional intake, keep payouts running |
| App store delisting in a country | Direct APK + checksum page + Obtainium channel live *before* needed; Google dev verification completed (2026–27 mandate) |
| Founder/key-person unavailable | Multi-sig custody on signing/OTA/master keys; ≥2-person runbook executors |
| Jurisdiction turns hostile (VÜPF event) | Region-is-config migration rehearsal; entity mobility plan |
| Key-service compromise | Rotation runbook **+ fix in-memory version state first**; v2 Shamir-split |
| Compelled-update demand | Code-signing custody documented; legal escalation path; transparency reporting commitment |
| Whitelist-model shutdown | Keep update/APK endpoints on whitelisted categories (app stores, major CDN/cloud endpoints) |

## 6. The one-line threat model

> The structure converts "one order takes down the platform" into "several
> jurisdictions must act in coordination, in public, over months" — and converts
> every partner failure from a platform outage into a regional, containable
> incident. It does not, and cannot, make ThryftVerse immune to law — and the
> weakest links are the *people* (Durov), the *ledgers* (Synapse), and the
> *distribution chokepoints* (Apple/Expo), not the entities.
