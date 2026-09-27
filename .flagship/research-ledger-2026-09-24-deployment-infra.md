# Research Ledger — 2026-09-24 (Deployment Infra Wave)

Question: do flagship apps (Instagram, Telegram, Snapchat, etc.) deploy the way DEPLOYMENT.md prescribes (Railway + Neon + Upstash + R2 + multi-provider payments)?

Legend: PRIM = primary/official eng blog or filing · SEC = secondary analysis · OBS = direct observation.

## Findings — how flagships actually run

- **Instagram**: single rented LA server (2010) → AWS EC2/ELB/EBS/Route53 through $1B Meta acquisition (2012) → Facebook DCs (2014) → Meta shared infra today (TAO, Cassandra, Tupperware/LXC containers, PoP edge network). [PRIM: Wired 5yr post; Instagram eng blog via datacenterknowledge; USENIX LISA'18; QCon SF'16; CACM Meta infra]
- **Snapchat**: launched on **Google App Engine** — a PaaS, the 2011-era analog of Railway. Monolith on GAE for years → Kubernetes microservices across GCP+AWS (service mesh, Envoy). Commitments: $2B/5yr GCP + $1B/5yr AWS (S-1). [PRIM: eng.snap.com service-mesh post; S-1 via TechCrunch/Fortune/CNBC]
- **Telegram**: never public cloud. Own ASNs — AS62041 (RIPE/BVI reg), AS59930 (Miami), AS62014 (Singapore); colo at Equinix AM4/AM5 Amsterdam etc.; sticky home-DC architecture, MTProto, ~5 DCs. [PRIM/OBS: ipinfo AS62041; examineip AS62041; grg.pw traceroute analysis]
- **WhatsApp**: ~550 bare-metal FreeBSD colo servers, Erlang, ~1M TCP conns/box; never cloud pre-Meta. [PRIM: Erlang Factory SF'12/'14 talks; blog.whatsapp.com]
- **Discord**: GCP (Persistent Disks over Local SSDs) + ScyllaDB (migrated from Mongo→Cassandra→Scylla); custom Scylla Control Plane. [PRIM: discord.com/blog]
- **Vinted** (closest competitor): ~7–10K physical servers in own DCs (Amsterdam, Brussels, Düsseldorf, +Dallas edge), Kubernetes + Istio + SONiC, hybrid AWS/GCP/Cloudflare/Fastly, Terraform. [PRIM: Vinted careers/SRE blog]
- **Depop**: Heroku (PaaS) → AWS (EC2/ECS/Lambda/Terraform/Consul/Vault). [PRIM: engineering.depop.com]
- **Etsy**: own DCs (2 sites, one state) → GCP + K8s + Terraform/Prometheus. [SEC: Martin Fowler scale-ups article]
- **Shopify**: own DCs → GKE; built own Heroku-like layer "CloudBuddy" on K8s; pod isolation. [PRIM: shopify.engineering]

## Pattern (INF, high confidence)

Phase 1 launch: simplest managed platform available (App Engine, Heroku, EC2, colo bare metal).
Phase 2 scale: owned hyperscaler accounts + Kubernetes + managed DBs.
Phase 3 flagship: own DCs/ASNs or multi-$B cloud commitments.
Vendor choice is not the differentiator — operational maturity is (failover drills, observability, runbooks, phased rollouts).

## Gap findings vs DEPLOYMENT.md

- **G1 (P1, jurisdiction accuracy):** Railway, Neon (Databricks-owned since 2025), Upstash, Cloudflare, Resend, Sentry are all US-incorporated. CLOUD Act follows vendor *control*, not datacenter geography. Doc §22.1 claim "no CLOUD Act for data at rest in EU" overstates protection — accurate framing is "US vendors, EU data residency" (same posture as AWS-EU). True EU jurisdiction requires EU vendors (OVHcloud, Scaleway, Hetzner, Aiven-FI, Exoscale) or self-host. Decide: accept US-vendor+EU-residency honestly, or re-home key-service/data to EU vendors.
- **G2 (P2):** No documented trigger for PaaS→hyperscaler graduation. Industry heuristic: revisit when PaaS spend >~$2k/mo, when VPC/private-connectivity needed, or compliance boundary must be owned (Qovery 2026 guide). Add a written graduation trigger to DEPLOYMENT.md.
- **G3 (P3):** Confirm single-write-primary + read replicas is the documented day-1 posture (already correct per §20.7 — do not attempt active-active <100K MAU).

## Wave 2 — non-US vendor stack (user directive: EU/Asia vendors for global platform; US vendors only inside US cluster)

Verified live 2026-09-24:

- **OVHcloud (FR)**: managed K8s (free control plane; GRA/SBG/DE/UK/WAW + Paris 3-AZ + Milan 3-AZ + **SGP + AP-SOUTH-MUM Mumbai** + SYD + BHS + US), managed PG/MySQL/Valkey/MongoDB (incl. SGP + MUM regions), S3 object storage, no egress fees. Single non-US vendor covering EU+SG+IN. [PRIM: docs.ovhcloud.com]
- **UpCloud (FI)**: managed K8s + managed DBs in all regions incl. sg-sin1; object storage at FI-HEL2/SE-STO1/DE-FRA1/SG-SIN1/US-CHI1. EU co with SG coverage. [PRIM: upcloud.com docs]
- **Gcore (LU)**: managed K8s free control plane; regions incl. Luxembourg, Frankfurt, SG, **Mumbai**, Tokyo, HK, Dubai, Incheon, Istanbul; free egress. [PRIM: gcore.com/pricing]
- **Codemagic (Nevercode OÜ, Tartu EE)**: mobile CI/CD, RN+Expo builds, store publishing — EU replacement for EAS build role. [PRIM: eubuilt.eu, european.alternative.to]
- **Brevo (FR)**: transactional email, data hosted FR+DE, ISO 27001, REST+SMTP. [PRIM: brevo.com]
- **bunny.net (SI, Ljubljana)**: CDN+DNS+edge, 82 countries. [PRIM: bunny.net]
- **E2E Networks (IN, NSE-listed, MeitY-empanelled)**: managed K8s + managed PG/MySQL in Delhi NCR + Chennai — IN-cluster option when DPDP residency hardens (Rules 2025 effective Nov 2025; SDF obligations by May 2027). [PRIM: e2enetworks.com]
- **CtrlS (IN)**: sovereign cloud alternative, MeitY-empanelled, Rated-4 DCs. [PRIM: ctrls.com]
- **KYC correction**: Veriff = US HQ (Veriff Inc, NY — LinkedIn 2026). Non-US KYC picks: iDenfy (LT), IDnow (DE), Fourthline (NL), Sumsub (UK).

## Wave 3 — flagship-parity deep dive (all layers)

- **Marketplace payments (decisive)**: Mangopay (LU/FR) powers **Vinted** (confirmed on vinted.co.uk help page), Rakuten France (100K-user migration), ManoMano, Debenhams — wallets/escrow/circular-money maps to our 1ze loop. Adyen for Platforms (NL) = eBay's backbone (balance accounts, splits, managed payouts, onboarding 33+ countries). Mollie Connect for Marketplaces (NL) has delayed routing + multi-seller checkout. Nium (SG): payouts 190+ countries/100 currencies/100+ real-time corridors. [PRIM: vendor docs + vinted.co.uk]
- **Comms**: Sinch (SE) — serves 8/10 largest tech cos; Batch (FR) push engagement. [PRIM]
- **Live/VOD**: api.video (FR, Roubaix, on OVH infra) — 140+ PoPs, RTMPS/SRT, LL-HLS, custom domains, 99.9% SLA; replaces Mux. [PRIM]
- **KYC depth**: iDenfy (LT) ~$1.35/verify, 24/7 human review, NFC, 70+ eID; IDnow (DE) BaFin-grade VideoIdent + eIDAS/QES. [SEC: rfp.wiki, softwr]
- **Edge security**: Gcore 200+ Tbps DDoS scrubbing + NextGen WAAP tiers, free egress. [PRIM]
- **Tax**: Fonoa (IE) — 190+ jurisdictions <200ms determination, e-invoicing 50+ mandates incl. SG InvoiceNow; replaces Stripe Tax. [PRIM]
- **Honest weakness — email**: Brevo transactional ~5–15s delivery vs Postmark 1–3s; shared marketing/transactional IP pools (Mailflow Authority 2026). Mitigate: dedicated IP on Business plan or self-host Postal for critical flows. [SEC]
- **Honest weakness — OVH noise**: ~147 status incidents since Jan 2025 (StatusGator, mostly regional VPS/bare-metal); managed services 100%/90d (OutageDeck). Mitigate: Paris 3-AZ + Gcore failover + UpCloud cold-standby. [OBS]

## Wave 4 — FX boundaries & co-own liquidity

- **FX conversion happens inside PSP treasury, not broker back-connections.** Mangopay has native Conversions API: Spot FX (1 call) + Guaranteed FX (quote→locked rate→convert, 2 calls) across multi-currency user + client wallets [PRIM: mangopay.mintlify.app/guides/fx]. Adyen: 150+ settlement currencies, Enterprise Funding nets pay-ins→payouts; INR/BRL/MYR/MXN/AED local-rail only [PRIM: docs.adyen.com]. Nium: FX inside 190+ country payout corridors [PRIM]. Retail CFD brokers (FXCM/Exness) + consumer forex cards (Niyo) cannot custody platform money flow — wrong licence, trading APIs not payment plumbing.
- **Fractional-collectibles sector = graveyard with one survivor.** Rally runs CLOB + market-hours-only + 5-day min-hold + buyout halts + SEC Reg A Series-LLC per asset; has going-concern warning on parent audit. Masterworks: Reg A, 3–10yr holds, ATS secondary. Otis liquidated post-Public acquisition; Collectable in DE litigation since 2022. Thin liquidity killed the category → order book alone insufficient. [PRIM: rallyrd.com, masterworks.com; SEC filings via angelinvestorsnetwork]
- **Thin-market literature**: LOBs fail in thin markets; AMMs need inventory capital + bleed LVR; batch (call) auctions are fairness-optimal fallback for illiquid books [arXiv 2302.11652, 2210.04929].
- **Regulatory**: fractional exposure w/ profit expectation ≈ MiFID II instruments (CySEC C659, ESMA 2023 statement, FSMA); US = Reg A securities path; IN = grey zone. Co-own must exclude US at launch + EU counsel before MM pool.
- **Design output**: `docs/deployment/08-money-liquidity-architecture.md` — 5-layer pool (primary issuance → guarded CLOB → platform MM → batch auction → buyout backstop), env vars, gap list vs existing code (fxEngine + reservations + lockups + DRIP already built).

## Wave 5 — admitted-security model (user: co-own = real traded security, 1ze-only settlement, real-world ownership)

- **Taxonomy match**: SEC Jan-2026 tokenized-securities statement — co-own = "custodial tokenized security" (3rd-party custody + unit evidences ownership); ledger tech irrelevant, off-chain records same analysis [PRIM: sec.gov].
- **Compliant EU venues exist**: 21X — first EU DLT Pilot Regime licence (Dec 2024), CLOB via smart contracts on Polygon, atomic settlement, appointed market maker (Tradevest), defined trading hours — proves our L2/L3 shape is licenceable [PRIM: 21x.eu]. Assetera (AT) — MiFID II licence, "compliant umbrella" for issuers, B2B API, secondary buy/sell, retail+professional [PRIM: assetera.com]. Swarm (DE, BaFin). Path A = partner venue at launch; Path B = own MiFID authorization at scale.
- **1ze second surface**: PSD2 Limited Network Exclusion (Art 3(k)) fits commerce use BUT >€1M/12mo → mandatory CA notification (FCA direction; EBA GL-2022-02). Security settlement weakens LNE → default = keep regulated money in Mangopay EMI e-wallets, 1ze as unit-of-account. Crypto-formatting 1ze → MiCA EMT territory; keep it a DB unit. [PRIM: EBA, FCA handbook]
- **Required machinery**: per-asset custody SPV-record, MiFID appropriateness test, per-asset disclosure doc, order/txn recordkeeping, MAR wash-trade surveillance in CLOB, cluster gating (US excluded, IN/GCC pending counsel).

## Wave 6 — rail decision (Stripe-primary) + entity/licence map

- **Stripe-primary confirmed viable** [PRIM: docs.stripe.com/connect]: separate-charges-and-transfers = the escrow-hold pattern; Connect accounts ~90+ countries (AE/CY/GCC/EU; IN/BD/MY preview); platform-country restriction critical — **UAE platform = UAE-only connected accounts + no on_behalf_of → Stripe platform must sit on the Cyprus EEA entity** (cross-border payouts EEA/UK/US/CA/CH, +0.25%, free intra-EEA & UK↔EEA). Stripe lacks: per-user wallets (→ our 1ze ledger), wallet-to-wallet (→ ledger), conversion API (→ fxEngine + settlement FX).
- **Cyprus CIF** [PRIM: cysec.gov.cy IFR/IFD guide + fee directive]: Cat B €750K initial capital (MTF/OTF + dealing on own account — required for MM-as-principal), Cat A €75–100K agency-only; €7K app fee; €5–10K/yr + turnover variable; EU/EEA passport. Cyprus = full MiFID II, just fastest/cheapest EU passport — "light" is speed/cost, not substance.
- **UAE** [PRIM: CBUAE rulebook]: SVF licence for wallets — **single-purpose SVF exempt** (closed-loop 1ze usable only on platform likely qualifies); RPSCS for payment aggregation; SCA/DFSA for securities venue — Dubai incorporation does NOT authorize a trading venue; VARA only if on-chain.
- **Doctrine**: licences follow the investor, not the incorporation. Structure = Dubai HoldCo (tax/HQ) → Cyprus OpCo (CIF + Stripe platform + LNE notifications) → IN partner entity later; US excluded.

## Wave 7 — OVH vs AWS honest parity assessment

- **Catalog depth**: AWS 200+ managed services (same catalog in EU regions); OVH ~45 (deepest EU); Scaleway ~30 (most developer-complete — has serverless+GPU+AI); Hetzner ~8 [SEC: Gart Solutions service-by-service benchmark, techstrong.it].
- **RDS-tier PG matched** (OVH Enterprise 99.99% 3-AZ); **Aurora-tier matched by nobody in EU** (distributed storage, scale-to-zero, 15 replicas, global DB). No EU Lambda (except Scaleway), no DynamoDB-equivalent anywhere, thinner IAM, smaller Terraform ecosystem.
- **Where OVH wins**: price (free egress vs ~$83/TB AWS), SecNumCloud, GAIA-X, EU jurisdiction, only EU provider with SG+Mumbai regions. Reliability: more status noise than hyperscalers; SBG fire 2021 precedent.
- **Verdict recorded in answer**: OVH = best EU-jurisdiction catalog, not industry-best. Our stack needs only ~6 primitives (VM/K8s, PG, Valkey, S3, LB, edge) — all at parity tier. Aurora/Lambda/DynamoDB/SageMaker gaps irrelevant to current architecture (self-hosted compose). Choice is jurisdictional, accepted trade-off, mitigated by Gcore failover + UpCloud standby.

## Wave 8 — flagship multi-jurisdiction hosting (TikTok/Pinterest verification)

- **TikTok = the reference implementation of our doctrine** [PRIM: newsroom.tiktok.com; Reuters; DCD]: US user data → Oracle Cloud Texas under USDS gatekeeping + independent board + source-code inspection ($1B+ "Project Texas"); EU data → Dublin + Hamar/Norway DCs ("Project Clover" secure enclave); Asia/global → own DCs in Singapore + Johor, Malaysia; domestic China → own DCs Hebei. ByteDance deliberately exited Alibaba Cloud (SG) for overseas apps in 2021 → AWS+Oracle. Jurisdiction-partitioned hosting: vendor choice follows data sovereignty per region — same shape as our EU-primary + satellites + US-satellite doctrine.
- **Honest caveat**: $1B+ Project Texas still failed to satisfy US regulators → PAFACA divest-or-ban law. Jurisdictional engineering mitigates, doesn't eliminate, political risk.
- **Pinterest = 100% AWS** [PRIM: AWS case studies, Pinterest eng blog]: owns zero servers; born-in-cloud 2010; 10K+ EC2 G5 inference + 600+ P4 training; 500PB; Graviton migration 2021-24 (38% cost cut on API fleet). US flagships stay on US vendors because jurisdiction was never their constraint.
- **Instagram**: was AWS EC2 → Meta-owned DCs post-acquisition (wave 1). US flagships optimize for cost/control at scale, not sovereignty.

## Source classes used

Primary eng blogs (Snap, Discord, Shopify, Instagram/Meta, WhatsApp, Depop), SEC filing (Snap S-1), conference talks (USENIX LISA, QCon, Erlang Factory), ASN/registry data (ipinfo, examineip, RIPE), career-page infra disclosures (Vinted), secondary analysis (Qovery, datacenterknowledge, Martin Fowler).
