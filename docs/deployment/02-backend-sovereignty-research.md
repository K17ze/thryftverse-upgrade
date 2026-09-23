# 02 — Backend Sovereignty Research: How Telegram-Class Platforms Minimise Institutional Control

> **Research question:** *How did Telegram and comparable platforms configure their
> backend — entities, infrastructure, key custody, distribution — so that no
> single government, court, cloud provider or app store can seize, block or compel
> the whole platform at the application level?*
>
> **Method:** live web research (23 Sep 2026) across court filings (SDNY SEC case
> documents, Delhi HC), corporate registries (Companies House, LEI, Swiss UID,
> Companies House SG), primary technical docs (MTProto, Signal source code,
> Telegram official docs), regulator/primary records, and secondary reporting
> (Reuters, Bloomberg, Wired, Meduza, Spiegel). All claims logged in
> [`06-research-ledger.md`](./06-research-ledger.md). Evidence classes:
> **[PRIMARY]** court/registry/statute, **[OFFICIAL]** vendor's own statements,
> **[SECONDARY]** journalism/analysis, **[FLAG]** unverified.

---

## Part I — Telegram: the reference architecture

Telegram is the canonical example of a consumer-scale platform engineered so
that compelling it requires **coordinated multi-jurisdiction action**, not one
order. But the honest record is more complicated than the marketing: it is a
story of genuine structural resilience *and* repeated compliance under personal
pressure.

### 1. Entity structure — the full verified timeline

Telegram's structure is not a static "BVI + Dubai" pair; it migrated through
three phases as legal exposure moved:

**Phase 1 — US (2013–2014).** `Telegram LLC` (Delaware, formed before
12 Nov 2013) and `Digital Fortress LLC` were registered in the US by associates
David Neff and Alexey Perekopsky. Digital Fortress "paid its bills, registered
its trademarks, contracted its first PR firm, and ran its vast international
network of servers and data centers." [PRIMARY: USPTO TTAB filing 91217737;
SECONDARY: nny360.com, Reuters]

**Phase 2 — UK LLP (2014–2019).** `Telegram Messenger LLP` (Companies House
**OC391410**, inc. 21 Feb 2014) with members `Dogged Labs Ltd` (BVI) and
`Telegraph Inc.` (Belize reg. #120,165); Dogged Labs was replaced 10 May 2018 by
`Telegram Messenger Inc.` (BVI reg. #1968129). Pavel Durov listed as PSC. This
LLP was the entity Russia registered in its "information dissemination
organizer" list (Jun 2017) and the nominal defendant in the blocking case.
Liquidated Dec 2018–Jan 2019. [PRIMARY: Companies House officers + PSC filings;
SECONDARY: TASS, news.bitcoin.com]

**Phase 3 — BVI core + Dubai opco (2018–present).**

| Entity | Jurisdiction | Role | Evidence |
|---|---|---|---|
| **Telegram Group Inc.** | BVI (inc. 16 Jan 2018, Craigmuir Chambers, Tortola) | Ultimate holdco; **wholly owned by Pavel Durov** | SEC Joint Stipulation of Undisputed Facts, SDNY 19 Civ. 9439 — **[PRIMARY]** |
| **TON Issuer Inc.** | BVI (inc. 22 Jan 2018) | Wholly-owned subsidiary created to sell Gram purchase agreements; raised ~$1.7B from ~171–175 purchasers | SEC filings, Form D — **[PRIMARY]** |
| **Telegram Messenger Inc.** | BVI (#1968129) | Contracting entity + GDPR data controller in current Privacy Policy | telegram.org/privacy — **[OFFICIAL]** |
| **Telegram FZ-LLC** | Dubai free zone | Operating entity; operational HQ since 2017; Play Store publisher identity | Wikidata Q32049814; Delhi HC CS(COMM) 282/2020 — **[PRIMARY/SECONDARY]** |
| **Telegraph Inc.** | BVI per privacy policy (Belize #120,165 per Companies House — **[FLAG]** inconsistent, possibly redomiciled) | Group member | telegram.org/privacy vs Companies House — **[FLAG]** |
| **Telegram UK Holdings Ltd** | UK (#11208859, inc. 15 Feb 2018) | Dormant; former GDPR Art. 27 representative; **dissolved 11 Feb 2020** | Companies House — **[PRIMARY]** |
| **TON Foundation** | Cayman foundation company (original); successor "The Open Network Stiftung" Swiss non-profit (2023), formally independent | TON stewardship post-SEC settlement | SEC exhibit + EQS press release — **[PRIMARY/OFFICIAL]** |
| **Telegram SG Pte. Ltd.** (UEN 202314686W, 2023) | Singapore | Registry aggregator listing; **affiliation unverified** — likely unrelated. Telegram did assert in Delhi HC that its "servers [are] based in Singapore." | companieshouse.sg — **[FLAG]** |

**Funding/ownership:** Telegram Group Inc. is 100% Pavel Durov (SEC stipulation).
Personally bankrolled ~7 years (~$300M VK proceeds); Mar 2021: >$1B in 5-year
pre-IPO convertible bonds incl. $150M from Mubadala + Abu Dhabi Catalyst
Partners; RDIF minority participation reported against Telegram's public wishes
— a creditor-leverage point on a BVI holdco. [SECONDARY: TechCrunch, Bloomberg;
OFFICIAL: Abu Dhabi Media Office]

**SEC settlement (the enforcement record):** SEC v. Telegram (SDNY): complaint
Oct 2019 → preliminary injunction Mar 2020 barring Gram delivery → settlement
Jun 2020: **$1.224B disgorgement + $18.5M penalty** + 3-year notice obligation.
The BVI structure did not shield it from US securities law once it sold to US
purchasers. [OFFICIAL: SEC press release 2020-146; PRIMARY: court docs]

### 2. Infrastructure — what is actually verifiable

**AS62041 "Telegram"** — RIPE-registered to org `ORG-TMI4-RIPE` ("Telegram
Messenger Inc", BVI); allocated 7 Mar 2014; ~9,216 IPv4 addresses
(91.108.0.0/18, 149.154.160.0/20, 95.161.64.0/20). Peering at AMS-IX (400G),
DE-CIX (400G); upstreams PCCW/Vodafone/Telecom Italia. Some sources name the
holder "Telegram FZ LLC" — registry naming has shifted between entities.
[PRIMARY-registry: bgpview.io, peeringdb, bgp.he.net; FLAG on holder name]

**DC topology — "sticky home-DC" model (officially documented):**
- `help.getConfig` returns `dc_options` (id, ip, port; flags `ipv6`,
  `media_only`, `cdn`, `static`). IPs rotate frequently. [OFFICIAL: core.telegram.org/api/datacenter]
- Accounts are pinned: `PHONE_MIGRATE_X`/`NETWORK_MIGRATE_X` redirects;
  "user information is accumulated in the DC with which the user is
  associated"; files stay where uploaded (`FILE_MIGRATE_X`).
- Community-mapped locations (never officially confirmed; derived from IP
  geolocation): **DC1 Miami, DC2 Amsterdam, DC3 Miami (deprecated ~2020,
  users migrated to DC1), DC4 Amsterdam, DC5 Singapore**. Assignment is by
  phone country code at registration, not current location.
  [SECONDARY: hydrogram docs, dev.moe]
- Privacy Policy confirms UK/EEA user data is stored in **Netherlands** DCs —
  third-party facilities where Telegram rents space but owns servers/network.
  [OFFICIAL]
- **Consequence:** no cross-DC failover — a DC outage strands its accounts
  (documented 12+hr outages). Resilience is jurisdictional, not availability.

**Encrypted CDN (Oct 2017):** third-party caching nodes in high-traffic regions
"where we wouldn't want to place Telegram servers" — only public-channel media;
each file re-encrypted with a unique AES-256-CTR key held only by the master DC
and client; per-fragment SHA-256 verification; CDN DCs treated as "enemy
territory" (upload-only). [OFFICIAL: core.telegram.org/cdn, blog]

### 3. Key custody — the claim vs. the mechanism

**The published claim (verbatim):** "Cloud chat data is stored in multiple data
centers around the globe that are controlled by different legal entities spread
across different jurisdictions. The relevant decryption keys are split into
parts and are never kept in the same place as the data they protect. As a
result, several court orders from different jurisdictions are required to force
us to give up any data." [OFFICIAL: telegram.org/faq — same formulation in
privacy policy and TSF manual]

**What MTProto 2.0 actually documents:**
- `auth_key`: 2048-bit DH-derived key between client device and server, created
  on-device, never transmitted; temp auth keys in server RAM bound via
  `auth.bindTempAuthKey` (PFS for transport). [OFFICIAL]
- Per-message `msg_key` = middle 128 bits of SHA-256(auth_key fragment +
  plaintext). [OFFICIAL]

**Honest critique (all [SECONDARY] inference, mechanism never published):**
1. The key-splitting is a **legal/operational substitute for crypto** — cloud
   chats are not E2E; the server reads them. The "split" protects at-rest
   copies, but the key must exist assembled at runtime to serve data — a court
   can compel the *retrieval process*, not the shares.
2. "Shamir's Secret Sharing" is a **commentator inference** — Telegram has
   never disclosed threshold, parameters, or key-store architecture. Server
   code is closed-source → unverifiable, arguably a Kerckhoffs violation.
3. **It already failed as a legal shield**: Delhi HC (Neetu Singh v. Telegram
   Fz LLC, 30 Aug 2022) rejected the argument that Singapore server location /
   PDPA barred disclosure; Telegram filed admin names, phone numbers, IPs under
   sealed cover by Nov 2022. [PRIMARY: indiankanoon.org, livelaw.in]
4. MTProto was shown not IND-CCA secure (2015) and had client side-channels
   (ETH Zürich 2022, since fixed). [PRIMARY-academic: eprint.iacr.org/2015/1177,
   mtpsym.github.io]

### 4. The 2018–2020 Russia ban — the full mechanics

**Run-up:** FSB demanded decryption for 6 phone numbers (Jul 2017, linked to
the Apr 2017 St. Petersburg metro bombing) → Telegram refused → 800k₽ fine
(Oct 2017) → Supreme Court rejected Telegram's suit (20 Mar 2018) → Tagansky
District Court granted the block order 13 Apr 2018 in an **18-minute hearing**
Telegram's lawyers deliberately skipped. [PRIMARY-UN: OHCHR communication;
SECONDARY: Meduza, TASS, RFERL]

**Blocking mechanics:** Roskomnadzor blacklisted whole subnets — ~1.8M
Amazon/Google IPs on 17 Apr → **~19M at peak** (RKNSHOWTIME). Collateral hit
Twitch, Slack, SoundCloud, Spotify, payment terminals; RKN's chief admitted
blocking 18 networks of >500k IPs each. [SECONDARY: BleepingComputer,
TechCrunch, Guardian, VOA]

**Telegram's countermeasures:**
- **IP rotation** onto AWS/Google address space faster than RKN could list.
- **Push-notification IP distribution**: new server IPs delivered via
  Apple/Google push channels — outside RKN visibility. [SECONDARY: Meduza —
  single-sourced]
- **Domain fronting** via GAE/CloudFront — **lost permanently**: Google killed
  it ~13 Apr 2018, Amazon early May 2018 (also threatening Signal).
  [SECONDARY: The Verge; OFFICIAL: Signal blog]
- **MTProto proxies** shipped mid-ban (Desktop v1.3.0, 31 May 2018) with
  `t.me/proxy` share links; later fake-TLS `ee`-secret mode. [PRIMARY: tdesktop
  releases; OFFICIAL: core.telegram.org/proxy]

**Outcome:** RKN assessed only 15–30% disruption by late May 2018; Apple froze
iOS updates globally for ~6 weeks under Russian pressure; on **18 Jun 2020**
RKN lifted the ban citing Durov's "readiness to counter terrorism." Telegram
outlasted it — but note the endgame was a *negotiated* softening, not pure
technical victory. [SECONDARY: Reuters, Meduza, TheHackerNews; OFFICIAL:
garant.ru]

**Why the 2018 playbook would not transfer cleanly today:** domain fronting is
dead on Google/Amazon; cloud IP-hopping provokes provider eviction (Zello
precedent); and post-2019 Russia deploys **TSPU** — in-path DPI boxes
(Ecofilter, >100 Gbps) at ISP nodes controlled centrally by RKN, doing
SNI/protocol fingerprinting rather than just IP lists. A repeat would face
protocol-level filtering. [PRIMARY: IMC 2022 paper doi.org/10.1145/3517745.3561461;
leaked TSPU docs github.com/DanielLavrushin/tspu-docs]

### 5. Distribution & the store chokepoint

- **Direct APK** from telegram.org/android/apk — "fewer restrictions and
  receives automatic updates directly from telegram.org" (a self-updating
  channel bypassing Play review); APKs also via @TAndroidAPK channel;
  reproducible builds for verifying store binaries. [OFFICIAL]
- **Store pressure events:** Apple removed Telegram+Telegram X globally ~24h
  (Feb 2018, CSAM); froze iOS updates globally ~6 weeks (Apr–Jun 2018, Russia);
  removed Telegram/WhatsApp/Signal from the **China store** (19 Apr 2024, CAC
  order). iOS has no first-class sideload fallback outside EU DMA.
- Telegram treats stores as a censorship chokepoint and maintains self-updating
  APK + desktop installers + web clients as fallback. iOS remains structurally
  Apple-dependent.

### 6. Government-request handling — the honest record

- **The "0 bytes" era was already fiction**: Der Spiegel (Jun 2022) documented
  Telegram handing user data to Germany's BKA; the Interior Ministry confirmed
  **25 disclosures out of 202 requests** — cooperation followed Germany's threat
  to push app-store removal. Delhi HC compelled disclosure (2022).
  [SECONDARY: Spiegel, NDR; PRIMARY: livelaw.in]
- **Durov arrest:** arrested 24 Aug 2024 at Le Bourget (investigation opened
  8 Jul 2024); ~six charges incl. complicity in illegal transactions, refusal
  to communicate intercept data; €5M bail; travel ban fully lifted 13 Nov 2025,
  investigation ongoing. [PRIMARY: tribunal-de-paris.justice.fr; SECONDARY:
  Reuters, AP, France24, Bloomberg]
- **Post-arrest changes:** privacy policy updated **23 Sep 2024** — IP+phone
  disclosable for any criminal-activity suspect (previously terror-only);
  quarterly transparency reports; AI-assisted moderation; joined the **IWF**
  (4 Dec 2024). Crowdsourced transparency-bot data: ~14,600 fulfilled requests
  in India for 2024 alone. [OFFICIAL: telegram.org/privacy, IWF; SECONDARY:
  Verge, BBC, Meduza]

**The structural lesson:** BVI entities, own ASN, split keys and distributed
DCs protected the *platform* through Russia's ban — but none of it protected
the *founder*, and personal criminal exposure produced the compliance expansion
in weeks. Single-person ownership is the SPOF the whole architecture routes
around except at the human layer.

---

## Part II — The peer patterns (different answers to the same question)

### 1. Signal — "hold almost nothing" (the strongest subpoena record)

- **Entity:** Signal Technology Foundation (US 501(c)(3), EIN 82-4506840,
  incorporated Jan 2018) owns Signal Messenger LLC (disregarded subsidiary).
  Seeded with Acton's **$50M unsecured 0% loan** (grown to $105M, due 2068) —
  a loan, not equity; the Foundation has no owner. FY2024: $29.4M revenue
  (~74% donations), $38.0M expenses — structurally donation-dependent.
  [PRIMARY: IRS filings via ProPublica; OFFICIAL]
- **Infra:** US public cloud (AWS DynamoDB/S3/SQS/KMS in the open-source
  server); **SVR3** distributes PIN-based secret recovery across Intel SGX on
  Azure + AMD SEV-SNP on GCP + AWS Nitro — no single cloud/enclave compromise
  exposes secrets (peer-reviewed, NCC-audited). [PRIMARY: OSDI'24 paper;
  PRIMARY-code]
- **Sealed sender** removes the visible "from" field; contacts/social graph/
  avatars are E2EE or unheld.
- **Subpoena record (all published at signal.org/bigbrother):** five+ legal
  processes 2016–2025 (E.D. Va., C.D. Cal., Santa Clara, Luxembourg MLAT,
  D.C. covering 37 numbers) — every response produced only **two Unix
  timestamps** (account creation; last connection). The D.C. subpoena: 7
  accounts didn't exist, 24 had no data, 6 produced timestamps.
  [PRIMARY: signal.org/bigbrother document sets]
- **Residual identity point:** registration still requires a phone number
  (usernames hide it from contacts, Feb 2024). [OFFICIAL]

### 2. Proton — fortress jurisdiction + foundation lock (and its limits)

- **Entity:** Proton AG (Swiss, UID CHE-354.686.492, Plan-les-Ouates);
  **Proton Foundation** (UID CHE-418.863.304, created 17 Jun 2024 via founder
  share endowment) is primary shareholder — **no change of control without
  Foundation consent**. Trustees incl. Tim Berners-Lee. [PRIMARY: uid.admin.ch;
  OFFICIAL]
- **Swiss funnel:** Art. 271 Swiss Criminal Code prohibits responding directly
  to foreign authorities — requests must go MLAT → Swiss Federal Office of
  Justice (dual-criminality check) → Swiss court → Proton.
- **Transparency numbers (Proton Mail):** 2023: 6,378 orders/407 contested;
  **2024: 11,023/655** (+72% YoY); 2025: 9,301/988. **Proton VPN: 458/458
  denied since 2019** — no connection logs exist. [OFFICIAL: proton.me/legal/transparency]
- **Documented compliance events:** 2021 French climate-activist case — Swiss
  order compelled **per-account IP logging** → arrest (Proton removed "we do
  not keep any IP logs" from its policy); 2024 Catalonia chain — Wire disclosed
  registration email → Proton disclosed user-supplied recovery email → Apple
  disclosed name+addresses. **Metadata chaining across compliant-by-law
  services.** [OFFICIAL + SECONDARY]
- **VÜPF drift (the important lesson):** proposed ordinance would force >5,000-user
  services to ID-verify users, retain metadata 6 months, assist decryption.
  Proton's response is **infrastructure diversification** — Lumo AI infra to
  Germany, facilities in Norway, ~CHF 100M, while keeping Swiss HQ.
  **Jurisdictional arbitrage is maintained by mobility, not law.**
  [SECONDARY: heise, swissinfo, lenews]

### 3. Session — "delete the central server" + jurisdictional flight

- **Entity:** Oxen Privacy Tech Foundation (AU) → **Session Technology
  Foundation** (Swiss Stiftung, transferred 11 Oct 2024) after **AFP visited a
  Session employee's home without a warrant** asking about the app and a user —
  cited Australia's Assistance and Access Act (TCN can compel building new
  capabilities). Signing keys, GitHub org, transparency reporting moved to CH.
  [OFFICIAL + SECONDARY: Guardian, 404Media]
- **Network:** ~2,100 staked service nodes / 39 countries (figures vary
  1,500–2,100 by date); onion-routed messages into swarms; no single node knows
  origin+destination; account = 66-char pubkey, no phone/email. Migrated to the
  **Session Network** (Ethereum/Arbitrum SESH token) May 2025; full node stake
  25,000 SESH; **STF capped at ≤10% of nodes** — codified anti-centralization.
  [OFFICIAL]
- **Transparency:** Q4 2024 report — 8 LEA requests, all answered "we cannot
  identify users" (nothing exists server-side). [PRIMARY: OPTF transparency PDF]

### 4. SimpleX / Briar — the nothing-to-seize extreme

- **SimpleX** (SimpleX Chat Ltd, UK #13691484; Dorsey-led $1.3M): **no user
  identifiers of any kind** — pairwise unidirectional queues on disposable SMP
  relays; servers store transiently only; 2024 LEA enquiries answered with
  "no user data exists to disclose." Residual centralization: iOS push via
  SimpleX's own notification servers. Post-Durov-arrest, far-right groups
  migrated there — structurally unmoderatable. [PRIMARY: TRANSPARENCY.md;
  SECONDARY]
- **Briar** (Sublime Software Ltd, UK; OTF grant-funded): pure P2P — Bluetooth/
  Wi-Fi/removable media offline, Tor online; **no server to subpoena, block, or
  DDoS**. Resilience is architectural, not legal. [OFFICIAL]

### 5. Wire / Threema — the Swiss funnel and its edge cases

- **Wire:** parent is Wire Group Holdings GmbH (Berlin HRB 223199 B; >90%
  European investors incl. Schwarz Group 2024) — the 2019 Delaware holding was
  unwound by Aug 2020; servers in Germany/Ireland; MLS co-author. **2024:
  complied with a Swiss-routed Guardia Civil request and disclosed the account
  registration email** — first link in the Catalonia identification chain.
  E2EE protects content; the account model retains a correlatable identifier.
  [OFFICIAL + PRIMARY registry + SECONDARY]
- **Threema:** Threema AG (Swiss, UID CHE-487.082.806; PE-owned — Afinum 2020,
  Comitis Capital 2026); paid-only funding; random 8-char ID, phone/email
  optional hashed; own hardware in two Zurich colocation DCs. **Won a
  structural court victory**: Swiss Federal Administrative Court (May 2023)
  classified Threema as a "derived communication service" — **exempt from
  telco-grade retention/interception duties**; it had refused to build an
  interception interface pending an appealable order. The clearest documented
  case of entity+litigation defeating expanded surveillance duty.
  [PRIMARY: BVGer judgment; SECONDARY: NZZ]

### 6. Matrix — federation as sovereignty-by-deployment

- Matrix.org Foundation C.I.C. (UK #11648710, statutory asset lock, Guardians +
  elected Governing Board); Element (for-profit) donated core IP then switched
  Synapse to **AGPLv3 (Nov 2023)** — the Foundation remains structurally
  dependent on ~£3M/yr of Element development. Sovereignty comes from
  self-hosting: France's **Tchap** (800k+ civil servants, PM-mandated Aug 2025),
  Bundeswehr BwMessenger, gematik. **Caveat:** federation replicates room
  state+metadata to every participating homeserver — gains come from
  self-hosting, not protocol metadata-hiding. [PRIMARY/OFFICIAL]

### 7. WhatsApp — the contrast case

- WhatsApp LLC (Meta, Delaware): E2E content via Signal Protocol, but **metadata
  is unprotected** — the FBI "Lawful Access" document (Jan 2021, FOIA) shows
  WhatsApp as the *only* app of nine offering **pen-register returns every 15
  minutes** (source+destination, near-real-time). Brazil arrested Facebook's
  LatAm VP (Mar 2016) and blocked the service nationally; India litigation over
  traceability pending. E2EE couldn't stop corporate/personnel pressure.
  [PRIMARY: documentcloud FBI doc, court filings; SECONDARY]

### 8. Where structure defeated pressure vs. where it failed

| Defeated / absorbed | Failed / exposed |
|---|---|
| Signal subpoenas → two timestamps each, 5+ times | **Lavabit (2013)**: US LLC compelled to surrender its global SSL key; shut down rather than comply — centralized trust anchor = kill point |
| Proton VPN: 458/458 Swiss orders denied (no logs exist) | ProtonMail 2021: compelled per-account IP logging → arrest |
| Threema v. ÜPF: court-exempted from surveillance duties | Wire→Proton→Apple 2024: metadata chaining identified a pseudonymous activist |
| Session: AU→CH relocation absorbed pressure pre-emptively | Tutanota 2020: Cologne court ordered a built-in monitoring function for one mailbox |
| SimpleX/Briar: nothing to seize | Telegram/Durov 2024: founder arrest → policy expansion in weeks |
| Telegram vs Russia 2018–20: outlasted IP blocking | Domain fronting killed by Google/AWS (2018): infrastructure dependence is a censorship liability |

**Cross-cutting lessons:**
1. **Foundation-over-LLC** (Signal, Proton, Session, Matrix CIC) is the dominant
   ownership pattern — no shareholders to coerce or buy.
2. **Jurisdictional arbitrage is time-limited** — Proton (VÜPF) and Session
   (TOLA) show positions are maintained by *mobility* of infra+entity, not law.
3. **Data-minimization beats legal resistance** — every durable win came from
   *not possessing* data; every loss from possessing a correlatable artifact.
4. **Residual choke points to audit:** store signing keys, push-notification
   servers, registration identifiers, funding concentration (Acton loan;
   Element→Foundation dependence; Telegram's bondholders).

---

## Part III — Censorship circumvention & distribution resilience

### 1. Domain fronting: dead on rented CDN capacity

- **Mechanics:** TLS SNI carries the innocuous front domain; the HTTP Host
  header (encrypted) carries the real one. Security rests on collateral-damage
  economics — the censor must block all of google.com or allow the traffic.
  [PRIMARY: Fifield et al., PETS 2015]
- **Death:** Google disabled it ~13 Apr 2018 ("never been a supported
  feature"); Amazon CloudFront and Fastly followed. AWS sent Signal a
  cease-and-desist over its Souq.com front. [PRIMARY: Signal's published Amazon
  letter; SECONDARY: Verge]
- **What survives in 2026:** Signal still ships fronting configs (Fastly fronts
  with cover domains `github.githubassets.com`, `pinterest.com`,
  `redditstatic.com`; per-country Google reflectors for EG/UAE/OM/PK/QA/UZ/VE)
  — but that persists only at Signal's negotiated scale. **[Do not architect
  ThryftVerse around domain fronting on rented CDN capacity — ToS violation,
  gets shut down.]** A Jan 2026 single-researcher claim alleges Signal's
  reflector design is AiTM-vulnerable — unconfirmed. [PRIMARY: Signal-Android/
  iOS source; FLAG]
- **Replacements:** Signal **TLS proxies** (community NGINX TLS-in-TLS;
  `signal.tube/#domain` links handled pre-network-request); **ECH** (encrypts
  inner ClientHello — but Russia's TSPU blocks all ECH to Cloudflare IPs since
  Nov 2024 via static outer-SNI fingerprint; China blocked ESNI outright);
  **MASQUE** relays (iOS 17+ native); **refraction/decoy routing** (TapDance/
  Conjure — real, but requires ISP partnerships via Psiphon-family tools).
  [PRIMARY: FOCI 2025, IETF, Apple docs, refraction.network papers]

### 2. National blocking mechanics (what you're actually up against)

| State | Machinery | Key facts |
|---|---|---|
| **Russia** | Roskomnadzor registry (139-FZ) + **TSPU** DPI boxes (90-FZ "sovereign internet", 2019) | In-path DPI at ISP/IXP nodes, centrally controlled; triggers on SNI, IP, QUIC (international QUIC dropped wholesale); bypasses exist (TCP segmentation + TLS-record fragmentation) but are cat-and-mouse. [PRIMARY: IMC 2022, FOCI 2025] |
| **China** | GFW | SNI filtering; **decrypts QUIC Initial packets at scale** (since ~Apr 2024); DNS poisoning; real-name registration enables surgical VPN blocking. [PRIMARY: USENIX Sec '25] |
| **Iran** | NIN + Selective Whitelist | **Jan 8, 2026 escalation**: near-total blackout incl. NIN, then phased restoration into **permanent default-deny whitelist** (Google, app stores, GitHub, ChatGPT whitelisted; Instagram/Telegram/WhatsApp require circumvention). Under default-deny, DPI tricks are moot — only whitelisted endpoints carry traffic. [SECONDARY: Filterwatch, Schneier] |
| **India** | IT Act **§69A** + 2009 Blocking Rules | 29 Jun 2020: 59 apps banned — dual enforcement: DoT ordered ISP-level blocks of app IPs/domains **and** store delistings. PUBG precedent: rebranding alone failed (BGMI re-banned 2022); **compliance bargaining worked** (India data relocation + playtime limits → restored May 2023). [SECONDARY + PRIMARY orders] |
| **Turkey** | Law 5651 ladder | Local rep → fines → ad bans → **bandwidth throttling up to 90%** → blocking. Feb 2023 earthquake: Twitter throttled via TLS-handshake interference (>3s handshake times). [PRIMARY: OONI; SECONDARY: Freedom House] |
| **Brazil** | Judicial ISP orders | Aug–Oct 2024 X ban: Anatel-directed ISP blocking + store removal order + **~$9k/day user VPN fines**; 20,000+ ISPs → patchy compliance; X's Cloudflare-IP counter-move called "willful circumvention," fined ~$920k/day. [SECONDARY + order text] |

### 3. App-store censorship precedents (the removal playbook)

| Event | Mechanics | Lesson |
|---|---|---|
| China VPN purge (Jul 2017) | Apple removed VPN apps from **China store only** after MIIT licensing rule | Removals are **territory-scoped** — regional removal ≠ global kill |
| HKmap.live (Oct 2019) | Reject→approve→remove flip-flop; removed **globally**; **PWA survived** | PR pressure can escalate to global; web fallback is the survivor |
| Navalny Smart Voting (Sep 2021) | Apple+Google removed from **Russian stores** on election day after threats to **local staff** | Leverage = in-country staff/legal exposure, not technical means |
| Russia VPN removals (Jul 2024+) | Apple removed 25+ VPN apps on RKN demand; **Google resisted** — of 212 removal orders (Mar–Apr 2025) only ~6 delisted | Divergent store behavior — Play is the more resilient channel in Russia |
| RuStore mandate (425-FZ, eff. 2021) | State-approved software preinstall mandatory on devices sold in Russia | Creates a state-sanctioned alternative channel (with optics costs) |

### 4. Android alternative distribution — the working toolkit

- **Direct APK** best practices: signing is the trust anchor (OS rejects
  mismatched-signer updates); publish SHA-256 + detached sigs; Telegram's
  channel + APKMirror signature-continuity verification are the reference
  patterns. [OFFICIAL: source.android.com apksigning, F-Droid docs]
- **In-app self-update**: verify package-name match + signing-cert continuity
  (`GET_SIGNING_CERTIFICATES`), fail closed. **Play policy blocks this** —
  `REQUEST_INSTALL_PACKAGES` is restricted to core-installer apps → ship the
  self-updating variant as a **separate flavor outside Play**. [OFFICIAL]
- **F-Droid reproducible builds** (since 2023): F-Droid rebuilds from source and
  applies *the developer's* signature — cross-installable with your direct
  APKs, enabling channel migration. `AllowedAPKSigningKeys` pins cert hashes.
  [OFFICIAL]
- **Manufacturer stores:** Samsung Galaxy Store (free, 80/20), Huawei
  AppGallery, Xiaomi GetApps (~110 countries), **RuStore** (state-mandated in
  Russia). ⚠️ **Amazon Appstore is dead on non-Amazon Android since 20 Aug
  2025** — remove from matrices. [OFFICIAL + SECONDARY]
- **Obtainium**: install/update from GitHub/F-Droid/direct-URL with cert-hash
  continuity — the de-facto "RSS-for-APKs" power-user path. [PRIMARY]
- ⚠️ **Google developer verification (the big shift):** from **30 Sep 2026**
  in BR/ID/SG/TH, apps installed from participating stores on certified devices
  must be registered to a **verified developer** (identity + package-name/
  signing-key proof); **global rollout to all install sources in 2027**.
  Unverified sideload survives only via a friction-heavy opt-out flow. →
  **Complete Android Developer Console verification and register the package
  now**, or off-Play distribution degrades. Also note: this gives Google a
  kill-switch over off-Play installs. [OFFICIAL: developer.android.com]

### 5. iOS reality — there is no clean escape

- **EU DMA channels (iOS 17.4+):** alternative marketplaces (AltStore PAL,
  Epic, Aptoide) and **Web Distribution** (17.5+, install notarized apps from
  your own domain — originally required >1M EU first-annual-installs; Oct 2026
  expansion adds 1M worldwide among other criteria). **All still require Apple
  notarization + Apple signs every binary — Apple retains a revocation
  kill-switch even off-store.** CTF €0.50/install >1M punishes free apps at
  scale. Setapp Mobile already shut down (Feb 2026). [OFFICIAL: Apple DMA docs]
- **Japan MSCA (Dec 2025):** alternative marketplaces authorized; no web
  distribution.
- **Enterprise certs:** systematically revoked within days (TutuApp-era abuse;
  Facebook Research VPN 2019) — **never a channel**.
- **TestFlight:** ≤10k testers, 90-day expiry — stopgap only.
- **PWA:** the only censorship-proof iOS install vector (survived HKmap.live) —
  WebKit-bound, push since iOS 16.4, but second-class (no background exec,
  hidden install UX). [SECONDARY: Ars, TechCrunch]
- **Verdict:** iOS resilience ≈ PWA + regional store roulette, not true
  alternative distribution.

### 6. OTA update sovereignty — the Telegram-equivalent for Expo apps

- `expo-updates` speaks an **open protocol**; `updates.url` can point at any
  compliant server. Expo ships `expo/custom-expo-updates-server` (reference,
  not production-hardened); third-party batteries-included servers exist.
  [OFFICIAL + PRIMARY]
- **Code signing**: `expo-updates codesigning:generate` → `private-key.pem`
  (custody-critical, outside source control) + `certificate.pem` bundled in the
  binary; client verifies signatures — protects against tampering by CDN/ISP/
  host "and even EAS itself." On hosted EAS this is a paid-tier feature;
  **self-hosting removes that gate**. [OFFICIAL]
- **CodePush is dead** (App Center sunset 31 Mar 2025).
- **Tradeoffs:** EAS = managed edge CDN but `updates.expo.dev` is a single
  DNS-routable chokepoint + metered MAU; self-hosted = unlimited scale, you own
  key custody/rollback, endpoint can rotate domains. Either way OTA only
  patches JS — the native binary still ships through stores, and store policies
  (Play `REQUEST_INSTALL_PACKAGES`, Apple 2.5.2) constrain what OTA may change.
- **Key custody:** APK signing — Play App Signing splits upload key (resettable)
  from app-signing key (Google KMS); a lost self-managed key = permanent
  inability to update. **Treat the OTA private key like the APK key — it pushes
  arbitrary JS to every device: HSM/KMS or offline escrow, ≥2-person release
  ceremony.** [OFFICIAL: Play App Signing, F-Droid signing docs]

### 7. DNS/edge resilience

- **Multi-provider DNS**: the 2016 Dyn Mirai DDoS killed single-DNS-provider
  sites; the pattern = two authoritative providers in primary/secondary sync.
  [PRIMARY: postmortem.io; SECONDARY: Internet Society]
- **Poisoned-DNS countermeasures**: Signal-Android ships `StaticDns` hardcoded
  service-IP maps + DoH-ish fallback tried before system DNS. [PRIMARY code]
- **Mirror fleets**: RSF Collateral Freedom spins mirror sites in minutes —
  the *mirror fleet* is the rotation unit; Telegram crowdsources MTProto
  proxies via one-tap `t.me/proxy` links with a sponsored-channel incentive —
  **proxy distribution inside the censored app itself**.
- **Collateral freedom** only works while the CDN tolerates it or the state
  tolerates the collateral — Iran's whitelist model ignores it entirely.

---

## Part IV — Synthesis for ThryftVerse

### The four proven patterns

```
A. Telegram — jurisdictional arbitrage + owned infrastructure
   BVI hold · Dubai opco · own ASN · sticky-DC data placement · split keys · own distribution
   → raises cost to "several court orders + coordinated blocking"
   → BUT: founder SPOF; mechanism unpublished; failed in Delhi HC; post-arrest compliance expansion

B. Proton — fortress jurisdiction + foundation lock
   Swiss AG + Stiftung majority · own DCs · Art. 271 funnel
   → strongest legal protection per byte held
   → BUT: jurisdiction drifts (VÜPF) → mobility is the real defence; metadata chaining still identifies

C. Signal — nonprofit + hold nothing
   501(c)(3) + E2E-everything + sealed sender + SVR3
   → nothing exists to compel (5+ subpoenas → 2 timestamps)
   → requires the product to not need server-side data

D. Session/SimpleX/Briar — no centre to seize
   Foundation + staked nodes / disposable relays / pure P2P
   → no subpoena target at all
   → costs protocol maturity, UX, and mainstream viability
```

### Transferability matrix

| Mechanism | Transferable to ThryftVerse? |
|---|---|
| Offshore holdco + operating entity + function-specific shells | **Yes** — DEPLOYMENT.md §21 |
| Regional data pinning (their sticky-DCs → our Neon/Railway/R2 regions) | **Yes** — pin user data by cluster |
| Split decryption keys across jurisdictions | **Partially** — key-service (NL) isolates keys today; true Shamir-split is v2 hardening (blueprint §5) |
| Encrypted CDN for media in hostile regions | **Yes, cheap** — R2 + Cloudflare edge caches ciphertext-adjacent public media |
| Own ASN | **Not yet** — Cloudflare anycast covers most anti-blocking benefit at our scale; revisit >100K MAU |
| E2E-everything / hold-nothing | **No** — commerce requires orders, payouts, shipping data; minimise *sensitive* data instead (key-service pattern) |
| Own distribution (direct APK + self-hosted OTA) | **Yes** — separate non-Play flavor, cert-pinning updater, self-hosted expo-updates server, Obtainium/GitHub releases, PWA for iOS |
| Foundation stake | **Yes** — Proton/Signal anti-acquisition lock (see 07-legal-machinery §8 for honest limits) |
| Single-person ownership/control | **No — actively avoid.** Durov + Lavabit lessons: distribute ownership, keys, signing authority |
| Domain fronting on rented CDN | **No — dead.** Violates ToS; shut down 2018 at Google/Amazon |
| Signal-style community TLS proxies + in-app proxy discovery | **Yes** — realistic surviving circumvention transport |
| Google developer verification for off-Play installs | **Mandatory soon** — Sept 2026 pilot, 2027 global |

### Bottom line

Telegram's resilience was never one trick — it was **consistency across every
layer**: entity map, owned network (ASN), storage layout (sticky DCs), key
custody (split claims), and distribution path (own APK + in-app updates) each
independently resisted single-point compulsion. The honest postscript is that
the founder remained a single point of failure, the key-splitting mechanism is
unpublished and failed its one court test, and post-arrest the platform moved
to negotiated compliance. For ThryftVerse the transferable discipline is:
**audit every layer for "who can compel this?" — entity, compute, data, keys,
payments, stores, OTA updates — and ensure no layer's answer is "one
institution," while remembering that people and legal obligations remain
reachable regardless.**
