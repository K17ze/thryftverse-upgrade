# 06 — Research Ledger (Sources & Claim Map)

> All research performed **live on 23 September 2026** across seven parallel
> research workers (Telegram, peer platforms, censorship/distribution, broker
> entities, fintech partner models, legal machinery, repo audit). Evidence
> classes: **PRIMARY** = court filings, registries, statutes, regulator notices,
> protocol docs, source code · **OFFICIAL** = vendor's own statements ·
> **SECONDARY** = journalism/analysis · **FLAG** = unverified/conflicting.
>
> URLs abbreviated where the claim text names the document uniquely; full URLs
> are embedded in the citing sections of `02`, `03`, `07`.

## A. Telegram — entities, infrastructure, key custody, requests

| Claim | Class | Source |
|---|---|---|
| Telegram LLC (DE) + Digital Fortress LLC (Buffalo NY) were the 2013–14 US entities; Digital Fortress ran servers/DCs, trademarks, PR | PRIMARY/SECONDARY | USPTO TTAB 91217737 filing; nny360.com; Reuters |
| Telegram Messenger LLP (UK, OC391410, inc. 21 Feb 2014); members Dogged Labs Ltd (BVI) → Telegram Messenger Inc. (BVI #1968129, 2018) + Telegraph Inc. (Belize #120,165); PSC = Durov; liquidated Dec 2018/Jan 2019 | PRIMARY | Companies House officers/PSC filings |
| Telegram Group Inc. (BVI, inc. 16 Jan 2018, wholly owned by Pavel Durov); TON Issuer Inc. (BVI, 22 Jan 2018, wholly-owned sub); ~$1.7B from ~171–175 Gram purchasers | PRIMARY | SEC v. Telegram SDNY 19 Civ. 9439 — Joint Stipulation of Undisputed Facts (filing 72); Form D filings |
| SEC settlement: $1.224B disgorgement + $18.5M penalty + 3-yr notice duty (Jun 2020) | PRIMARY/OFFICIAL | SEC press release 2020-146; court docs |
| Telegram Messenger Inc. (BVI) = contracting entity + GDPR data controller in current Privacy Policy | OFFICIAL | telegram.org/privacy |
| Telegram FZ-LLC (Dubai free zone) = operating entity; operational HQ since 2017 | SECONDARY/PRIMARY | Wikidata Q32049814; Delhi HC CS(COMM) 282/2020 |
| Telegram UK Holdings Ltd (#11208859) — dormant, dissolved 11 Feb 2020 | PRIMARY | Companies House |
| TON Foundation: original = Cayman foundation company (SEC exhibit); successor = Swiss non-profit "The Open Network Stiftung" (2023), independent | PRIMARY/OFFICIAL | SEC exhibit 16.17; EQS/ton.foundation |
| AS62041 "Telegram" — RIPE org ORG-TMI4-RIPE (Telegram Messenger Inc, BVI); allocated 7 Mar 2014; ~9,216 IPv4; AMS-IX/DE-CIX 400G peering; upstreams PCCW/Vodafone/TI | PRIMARY-registry | bgpview.io, peeringdb.com, bgp.he.net |
| Sticky home-DC model: `PHONE_MIGRATE_X`/`NETWORK_MIGRATE_X`/`FILE_MIGRATE_X`; "user information is accumulated in the DC with which the user is associated" | OFFICIAL | core.telegram.org/api/datacenter |
| DC map (community-derived, never officially confirmed): DC1 Miami, DC2 Amsterdam, DC3 Miami (deprecated ~2020), DC4 Amsterdam, DC5 Singapore; assignment by phone country code | SECONDARY | hydrogram docs; dev.moe |
| UK/EEA user data stored in Netherlands DCs; Telegram owns servers in third-party facilities | OFFICIAL | telegram.org/privacy |
| Encrypted CDN: third-party caching nodes in hostile regions; per-file AES-256-CTR keys held by master DC+client only; SHA-256 fragment verification; CDN = "enemy territory" upload-only | OFFICIAL | core.telegram.org/cdn; telegram.org/blog/encrypted-cdns |
| Split-key claim (verbatim): "decryption keys are split into parts and are never kept in the same place as the data they protect… several court orders from different jurisdictions are required" | OFFICIAL | telegram.org/faq; privacy policy; TSF manual |
| Key-split mechanism (Shamir/threshold/architecture) **never published**; "Shamir" is commentator inference; server code closed-source | SECONDARY | security.stackexchange.com/q/238562 |
| Key-splitting failed as a legal shield: Delhi HC rejected Singapore-server/PDPA argument; Telegram disclosed admin names/phones/IPs under seal (Nov 2022) | PRIMARY | Neetu Singh v. Telegram Fz LLC (indiankanoon.org); livelaw.in |
| MTProto: 2048-bit DH auth_key created on-device, never transmitted; temp keys RAM-only via bindTempAuthKey; not IND-CCA (2015); client side-channels found 2022 (fixed) | PRIMARY-academic/OFFICIAL | core.telegram.org/mtproto/*; eprint.iacr.org/2015/1177; mtpsym.github.io |
| "0 bytes" claim contradicted pre-2024: Germany BKA received data; 25 disclosures / 202 requests confirmed | SECONDARY | Der Spiegel (Jun 2022); NDR |
| Durov arrested Le Bourget 24 Aug 2024; ~6 charges; €5M bail; travel ban lifted 13 Nov 2025, investigation ongoing | PRIMARY/SECONDARY | tribunal-de-paris.justice.fr; Reuters; Bloomberg |
| Post-arrest: privacy policy broadened 23 Sep 2024 (IP+phone for any criminal-suspect order; was terror-only); quarterly transparency; IWF membership 4 Dec 2024; ~14,600 fulfilled India requests (2024, crowdsourced) | OFFICIAL/SECONDARY | telegram.org/privacy; Verge; BBC; IWF; Meduza |
| Funding: personally bankrolled ~7yrs; Mar 2021 >$1B convertible bonds incl. $150M Mubadala/ADCP; RDIF minority reported against wishes | SECONDARY/OFFICIAL | TechCrunch; Bloomberg; Abu Dhabi Media Office |

## B. Russia ban & censorship mechanics

| Claim | Class | Source |
|---|---|---|
| FSB demanded keys for 6 numbers (Jul 2017, St. Petersburg bombing); 800k₽ fine; Supreme Court rejected suit 20 Mar 2018; Tagansky block order 13 Apr 2018 in 18-minute hearing | PRIMARY-UN/SECONDARY | OHCHR communication; Meduza; TASS; RFERL |
| RKN blocked ~1.8M→**~19M IPs** (AWS/Google subnets); collateral hit Twitch/Slack/Spotify/payment terminals; only 15–30% disruption by late May 2018 | SECONDARY | BleepingComputer; TechCrunch; Guardian; VOA; TheHackerNews |
| Countermeasures: cloud IP rotation; push-delivered IP config (Meduza — single-sourced, flag); domain fronting (killed by Google Apr 2018, Amazon May 2018); MTProto proxies shipped mid-ban (tdesktop v1.3.0) | SECONDARY/PRIMARY | Guardian; Meduza; Verge; Signal blog; tdesktop releases; core.telegram.org/proxy |
| Ban lifted 18 Jun 2020 citing "readiness to counter terrorism" — negotiated endgame, not pure technical victory | OFFICIAL/SECONDARY | garant.ru; Reuters; Meduza |
| TSPU (post-2019): in-path DPI boxes (Ecofilter >100Gbps) at ISPs, centrally controlled; SNI/IP/QUIC triggers; bypasses via TCP segmentation + TLS-record fragmentation | PRIMARY | IMC 2022 (doi.org/10.1145/3517745.3561461); FOCI 2025; leaked tspu-docs |
| GFW decrypts QUIC Initial packets at scale (~Apr 2024); distinct QUIC blocklist | PRIMARY | USENIX Security '25 (gfw.report) |
| Iran Jan 8 2026: near-total blackout incl. NIN → permanent **Selective Whitelist** (default-deny; stores/Google/GitHub whitelisted; Telegram/WhatsApp need circumvention) | SECONDARY | Filterwatch; Schneier |
| India §69A: Jun 2020 ban = ISP blocks + store delistings; PUBG→BGMI: rebranding failed, compliance bargaining (India data + limits) worked (May 2023) | SECONDARY/PRIMARY | Gadgets360; IndianExpress; TechCrunch; ET |
| Turkey 5651: rep → fines → ad bans → 90% bandwidth throttle; Feb 2023 Twitter throttled via TLS-handshake interference | PRIMARY/SECONDARY | OONI; Freedom House |
| Brazil Aug–Oct 2024 X ban: ISP blocking + store removal + ~$9k/day user VPN fines; X's Cloudflare-IP move = "willful circumvention" fined ~$920k/day | SECONDARY | PBS; Guardian; order text |
| ECH: deployed at Cloudflare scale but TSPU blocks ECH-to-Cloudflare since Nov 2024 via static outer-SNI; benefit today = privacy, not circumvention | PRIMARY/SECONDARY | FOCI 2025; jonsnowwhite.de; Cloudflare docs |
| Domain fronting dead on Google/Amazon (2018); Signal still ships Fastly fronting configs + per-country Google reflectors (source-verified) — persists only at negotiated scale | PRIMARY-code/OFFICIAL | Signal-Android/iOS source; signal.org blog |

## C. Peer platforms

| Claim | Class | Source |
|---|---|---|
| Signal Foundation 501(c)(3) EIN 82-4506840 (Jan 2018) owns Signal Messenger LLC; Acton $50M→$105M 0% loan due 2068; FY2024 $29.4M rev / $38.0M exp | PRIMARY | ProPublica IRS filings; signalfoundation.org |
| Signal infra = AWS (DynamoDB/S3/SQS/KMS); SVR3 splits secret recovery across SGX-Azure + SEV-SNP-GCP + Nitro-AWS | PRIMARY | Signal-Server source; OSDI'24 paper |
| Signal subpoena record: 5+ processes (E.D.Va, C.D.Cal, Santa Clara, Luxembourg MLAT, D.C.×37 numbers) → only 2 timestamps each | PRIMARY | signal.org/bigbrother document sets |
| Proton AG (UID CHE-354.686.492); Proton Foundation (CHE-418.863.304, Jun 2024) primary shareholder — change-of-control veto; Art. 271 funnel (MLAT→FOJ→Swiss court) | PRIMARY/OFFICIAL | uid.admin.ch; proton.me |
| Proton transparency: 2024 = 11,023 orders/655 contested; VPN 458/458 denied (no logs) | OFFICIAL | proton.me/legal/transparency |
| ProtonMail 2021: Swiss order compelled per-account IP logging → French arrest; "no IP logs" removed from policy | OFFICIAL/SECONDARY | proton.me blog; Verge |
| Wire→Proton→Apple chain (2024): registration email → recovery email → identity (Catalonia activist) | SECONDARY | TechCrunch |
| Proton VÜPF response: Lumo infra→Germany, Norway facilities, ~CHF 100M, CHF 900M Geneva plan conditional | SECONDARY | heise; swissinfo; lenews |
| Session: OPTF (AU) → **Session Technology Foundation (CH, Oct 2024)** after AFP warrantless home visit + TOLA exposure; ~2,100 staked nodes/39 countries; Session Network May 2025 (SESH on Arbitrum, 25k stake); STF ≤10% of nodes | OFFICIAL/SECONDARY | getsession.org; Guardian; 404Media |
| Session transparency: Q4 2024 = 8 LEA requests, all answered "cannot identify users" | PRIMARY | OPTF transparency report PDF |
| SimpleX: no user identifiers of any kind; unidirectional SMP relays; 2024 LEA enquiries → nothing to disclose; residual: iOS push via SimpleX servers | PRIMARY/OFFICIAL | TRANSPARENCY.md; simplex.chat |
| Briar: pure P2P (BT/Wi-Fi/Tor); no server to subpoena; UK Sublime Software Ltd; OTF grants | OFFICIAL/SECONDARY | briarproject.org; OTF |
| Wire: parent Wire Group Holdings GmbH (Berlin; Schwarz Group investor); 2019 Delaware holdco unwound by Aug 2020; DE/IE servers; disclosed registration email (2024 Catalonia chain) | PRIMARY/OFFICIAL/SECONDARY | HRB 223199 B; wire.com; TechCrunch |
| Threema: Threema AG (CHE-487.082.806; Comitis Capital 2026); paid-only; **won BVGer ruling May 2023** — "derived service" exempt from telco surveillance duties | PRIMARY | BVGer judgment (jurispub.admin.ch); NZZ |
| Matrix: Foundation C.I.C. (#11648710, asset lock); Element AGPLv3 pivot (Nov 2023); Tchap mandated for French civil servants (Aug 2025); metadata replicates to all homeservers | PRIMARY/OFFICIAL | matrix.org; element.io; DINUM |
| WhatsApp: E2E content but unprotected metadata — FBI doc: only app of 9 with **15-min pen-register returns**; Brazil exec arrest + blocks; India traceability litigation | PRIMARY/SECONDARY | FBI "Lawful Access" doc (FOIA); court filings; Reuters |
| Lavabit 2013: compelled global SSL key → shutdown — canonical centralized-trust-anchor kill | PRIMARY/SECONDARY | 4th Cir. opinion; Ars; NYT |

## D. App stores & distribution

| Claim | Class | Source |
|---|---|---|
| China VPN purge (Jul 2017), Navalny app (Sep 2021), China removes Telegram/WhatsApp/Signal (Apr 2024): removals are **territory-scoped**; leverage = in-country staff exposure | SECONDARY | TechCrunch; AP; BBC; WSJ |
| Russia VPN removals (2024+): Apple complied (25+ apps); **Google resisted** — ~6 of 212 orders delisted | SECONDARY/PRIMARY | Reuters; HRW; TechRadar |
| Direct-APK trust anchors: signing continuity enforced by OS; publish SHA-256+detached sigs; `REQUEST_INSTALL_PACKAGES` restricted → self-updater must be non-Play flavor | OFFICIAL | source.android.com; Play policy; F-Droid docs |
| **Google developer verification**: Sep 2026 pilot (BR/ID/SG/TH) → **2027 global**: all installs must trace to verified developer; unverified sideload = friction flow | OFFICIAL | developer.android.com/developer-verification |
| iOS DMA: alt marketplaces + Web Distribution (EU); Apple notarizes + signs every binary → revocation kill-switch survives off-store; CTF €0.50/install>1M; Japan MSCA = marketplaces only | OFFICIAL/PRIMARY | Apple DMA docs; addendum PDF |
| Amazon Appstore dead on non-Amazon Android (20 Aug 2025) | SECONDARY | TechCrunch |
| expo-updates = open protocol; `updates.url` any compliant server; reference server ships (not production-hardened); code signing protects "even from EAS"; CodePush dead Mar 2025 | OFFICIAL/PRIMARY | docs.expo.dev; expo/custom-expo-updates-server |
| Play App Signing: upload key resettable, app-signing key Google-KMS; lost self-managed key = permanent update loss | OFFICIAL | Play support docs |

## E. Broker entities & routing

| Claim | Class | Source |
|---|---|---|
| Exness tree: CySEC 178/12 (no retail), FCA 730729 (no retail), FSA SD025 (global retail + FSCA ODP branch), BVI SIBA/L/20/1133, Curaçao 0003LSI, Mauritius GB20025294, Kenya CMA 162, Jordan JSC 51905, UAE SCA CP-0001100, Belize 9110312; owners Valov 50–75%/Lychagov 25–50% | PRIMARY/OFFICIAL | exness.com/regulation; client agreements; CMA register; Companies House PSC |
| FXCM/Stratos: Jefferies → Stratos Group Intl → FCA 217689, CySEC 392/20 (EEA except Belgium), AFSL 309763, FSCA 46534, ISA, **Stratos Global LLC (SVG — unregulated catch-all)** | PRIMARY/OFFICIAL | Pillar 3; CySEC register; FXCM sites |
| FXCM failures: SNB 2015 (~$225M debits → Leucadia rescue secured on sub equity); CFTC US expulsion 2017 ($7M, NDD fraud); Jefferies foreclosure 2023 → 100% owner; ASIC DDO stop order Dec 2025 | PRIMARY | SEC 8-Ks; CFTC 7528-17; ASIC 25-295MR/26-004MR |
| IC Markets/XM/eToro/IBKR/Plus500: same tiered pattern — Tier-1 licences + offshore catch-all (Raw Trading SD018, XM Global Belize, eToro Seychelles SD076); IBKR = licence-per-market maximalist, no catch-all; eToro splits AU & US by product across two licences each | PRIMARY/OFFICIAL | regulation pages; SEC exhibits; SCB register; IBKR 10-K |
| Binance: "no HQ" → Malta MFSA denial (2020); Binance.US fake-independence (BAM custodied at Binance Holdings; CZ 81% chain); Nov 2023 guilty plea **$4.316B** + 3yr monitor + CZ 4mo prison; VARA licence conditioned on CZ ceding voting rights | PRIMARY | FinCEN consent order; DOJ; Oregon DFCS order; VARA register |
| Client routing: structured country codes → `residence×classification×products→entity` matrix; corroborated by IP/device/funding signals; per-entity domains + ToS; blocked lists contractual; entity migrations are regulator-supervised events | SECONDARY/OFFICIAL | ebsfintech.com; Sumsub docs; entity ToS; IBKR IBCE→IBIE merger notices |

## F. Fintech partner-bank / BaaS / payouts / tax

| Claim | Class | Source |
|---|---|---|
| Niyo = Finnew Solutions Pvt Ltd (Bengaluru); ~$180M raised; partner timeline: YES Bank→DCB (2018)→IDFC→Equitas (NiyoX 2021)→SBM; **YES Bank moratorium Mar 2020 stranded travellers; RBI barred SBM from all LRS Jan 2023–Apr 2024 (~50% of Niyo's book); Equitas exit 1 Jun 2025**; zero custody — account belongs to bank | PRIMARY/OFFICIAL/SECONDARY | RBI press releases; sbm.bank.in; goniyo.com; Livemint; Inc42 |
| India: **no neobank licence exists** — DBUs only for scheduled banks; PA needs ₹15→25Cr net-worth + escrow; marketplaces must hive off PA (clause 3.6); slice→NESFB merger (Oct 2023) is the bespoke licence path; Razorpay barred from new merchants ~17 months during PA review | OFFICIAL | RBI Master Directions; DBU circular; RBI authorisations |
| Chime→Stride Bank acquisition $590M (Sept 2026): BaaS model has a scale ceiling even for the biggest success | PRIMARY/SECONDARY | businesswire; bankingdive |
| **Synapse**: Ch.11 Apr 2024; >100k users frozen; ~$219M frozen, **$65–95M unreconcilable**; Yotta $109M→$1.4M; Fed C&D vs Evolve; FDIC daily-reconciliation NPRM; CFPB $118.9M victim fund | PRIMARY | CFPB order; trustee reports; FDIC NPRM; Fed enforcement |
| Payout networks: Wise Platform (80 licences, 160+ countries), Airwallex (60+, 200+), Nium (80+/40+ jurisdictions — "infrastructure, not your authorization"), Rapyd, Thunes (~50) | PRIMARY | provider docs |
| Marketplace models: Stripe Connect liability split (platform bears Express/Custom); Adyen = own bank licences; Mangopay = EU EMI wallet model; Tipalti = all-state MTLs | PRIMARY | provider docs |
| **MoR refuses marketplaces** — Paddle acceptable-use excludes C2C; correct instrument = sub-merchant flows + facilitator/DAC7 compliance | SECONDARY/OFFICIAL | paddle.com acceptable-use; merchantofrecordfinder |
| Licence trigger = **custody of customer funds** (US MTL 49-state NMLS patchwork; EU EMI passports 27; India PA/PPI escrow; SG MPI; UAE SVF) | OFFICIAL/PRIMARY | NMLS report; RBI; licence maps |
| Wise: 80+ licences → direct scheme access (BoE RTGS 2018 first non-bank, Pix, Zengin); Jersey holdco 2026 for Nasdaq primary | PRIMARY/OFFICIAL | BoE; Wise filings; LSE RNS |
| Revolut ladder: EMI→Lithuania specialised bank (2018)→full ECB licence (2021)→UK bank restrictions lifted Mar 2026→Mexico bank (2026)→US charter application filed 10 Mar 2026 | PRIMARY/SECONDARY | OCC CD1390; CNBV; Reuters |

## G. Legal machinery

| Claim | Class | Source |
|---|---|---|
| MLAT = government-only channel via central authorities; US avg ~10 months; India→US avg 3y4m (2016); >4,800 pending at OIA (2014) | OFFICIAL/SECONDARY | DOJ OIA; FJC guide; R Street; ET |
| US–BVI MLAT in force 1990 (UK treaty extension) — BVI holdco inside US treaty network; US–India MLAT in force 2005 (no dual criminality); US–CH 1977 | PRIMARY/OFFICIAL | state.gov; justice.gov; mea.gov.in |
| CLOUD Act §2713: control test, location irrelevant; Microsoft Ireland mooted by statute; §2703(h) comity only for qualifying countries; US–UK agreement in force Oct 2022 | PRIMARY/OFFICIAL | govinfo.gov; SCOTUS; CRS R45173; federalregister |
| GDPR Art. 48 + EDPB 02/2024: foreign orders not self-executing on EU entities; SCCs+TIA post-Schrems II; UK needs IDTA/Addendum; India DPDP = negative-list, not yet in force (~May 2027); RBI payment-data localisation is hard + cannot be structured around | PRIMARY/OFFICIAL | eur-lex; EDPB; ICO; DPDP Act; RBI circular 2785 |
| Localisation map: Russia 242-FZ hard; China CIIO hard; India payment-data hard; Turkey banking hard; Indonesia split; Vietnam conditional-hard; Brazil/Saudi/Nigeria transfer-mechanism | PRIMARY/OFFICIAL | statutes + regulator docs (07 §4 table) |
| Key disclosure: UK RIPA s.49 (2–5yr); France 434-15-2 (3yr+€270k); India s.69 (7yr, assistance duty); Australia TCN (compel new capability); US AWA unresolved post-Apple-FBI | PRIMARY | legislation.gov.uk; Conseil constitutionnel; IT Act; Home Affairs guidance; court orders |
| Sanctions: OFAC strict liability + 50% rule + secondary sanctions + USD-clearing nexus — domicile nearly irrelevant; app stores are themselves the sanctioned-market chokepoint | OFFICIAL/PRIMARY | OFAC FAQs; tri-seal note; Google/Apple docs |
| Marketplace floor: US facilitator laws (all sales-tax states), EU DAC7 (non-EU operators too, 31 Jan), VAT deemed-supplier (≤€150/non-EU sellers), India GST TCS 0.5% + s.194-O TDS 0.1% | PRIMARY/OFFICIAL | Wayfair; DAC7; VAT Directive Art.14a; CGST s.52/24 |
| Foundations: Swiss Stiftung state-supervised (Art. 84/83d — supervisor can appoint organs/reassign assets); Dutch stichting unsupervised; Cayman foundation company; Proton lock = shareholder-vote veto not impossibility | PRIMARY/OFFICIAL | ZGB; kvk.nl; Cayman law; proton.me |

## H. Repo audit (code-level, this repository)

| Claim | Class | Source |
|---|---|---|
| `GET /payments/gateways` without `userId` returns `oneze_internal` (internal rail leaks to public list) | PRIMARY-code | `index.ts:25513-25616`; `countryCapabilities.ts:196-216` |
| `isGatewayConfigured('wise_global')` hard-false; Wise = payout-status webhooks + revenue sweeps only, in no payout priority list | PRIMARY-code | `countryCapabilities.ts:674-680`; `index.ts:31772+` |
| `ONEZE_ENABLE_DIRECT_REDEMPTION` never read; prod burn requires `payoutRequestId` | PRIMARY-code | grep; `index.ts:22086-22091` |
| Key-service version state in-memory → restart regresses to default version | PRIMARY-code | `backend/key-service/src/server.ts` |
| Rewrap misses `user_totp_factors` + `protected_change_history` | PRIMARY-code | `index.ts:9367-9497`; `accountTakeoverService.ts:1032` |
| Message decrypt falls back to plaintext `body`; GDPR export omits encrypted tables | PRIMARY-code | `messageEncryption.ts`; `index.ts:16015+` |
| No IaC/region pinning exists — all EU placement is console choice; single prod endpoint | PRIMARY-code | repo scan |
| OTA = Expo-hosted `u.expo.dev`; self-hosted OTA is doc-only; code signing wired (fail-closed without cert) | PRIMARY-code | `app.json:115-118`; `app.config.js`; `release-train.yml` |
| `docsAuthHook` open when `ADMIN_TOKEN` unset; §10 env ref missing ≥10 prod-required vars + all Mollie/Flutterwave/Tap/PayPal creds | PRIMARY-code | `index.ts:742-765`; `productionReadiness.ts` |
| Committed SSL pins are dev self-signed placeholders | PRIMARY-code | `validate-ssl-pins.mjs`; pinning docs |

## I. Known unverified / watch items

| Item | Status |
|---|---|
| Telegram key-split mechanism (Shamir vs other) | Never published — OFFICIAL claim only; all specifics are inference |
| Telegraph Inc. domicile | Privacy policy says BVI; Companies House records Belize — inconsistent |
| Telegram SG entities (Pte Ltd 202314686W / LLP T16UF3546D) | Affiliation unverified — likely unrelated |
| AS62041 legal holder | Sources split between Telegram Messenger Inc (BVI) and Telegram FZ LLC (UAE) |
| Push-delivered IP distribution during Russia ban | Single-sourced (Meduza) |
| Exness Uruguay entity | None found — treat as non-regulatory presence at most |
| XM Belize licence number | Conflicting values across sources |
| Stratos ZA "intermediary-only" qualifier | FSP 46534 confirmed; restriction qualifier unverified |
| Signal fronting AiTM vulnerability claim (Jan 2026) | Single-researcher, unconfirmed |
| Marlinspike–MobileCoin advisory details | Contested, not formally disclosed |
| US–Australia CLOUD agreement exact in-force date | DOJ lists as existing; date unconfirmed |
| TCN "no systemic weakness" statutory section | Design confirmed; exact section unverified |
| India TCS 0.5% rate | Rests on secondary source |
| Durov case final disposition | Travel ban lifted Nov 2025; investigation ongoing — verify before external citation |
