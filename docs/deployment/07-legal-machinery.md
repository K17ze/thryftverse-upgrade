# 07 — Legal Machinery: What Each Government Can Actually Compel

**Purpose.** Every "jurisdictional resilience" claim ultimately reduces to a
mechanical question: *which legal instrument reaches which entity, data, or
person?* This file documents the compulsion machinery — MLATs, the CLOUD Act,
GDPR transfer rules, localisation statutes, key-disclosure laws, sanctions, and
platform tax/reporting floors — so that architecture decisions are made against
real law, not vibes.

**Evidence classes used throughout:** `PRIMARY` = statute/treaty/court text;
`OFFICIAL` = regulator/government guidance; `SECONDARY` = law-firm/press/academic
analysis. All sources accessed **2026-09-23**. Nothing here is legal advice;
it is an evidence map for engineering and counsel.

---

## 1. MLATs — the default channel for cross-border criminal compulsion

### 1.1 Mechanics

A Mutual Legal Assistance Treaty is a **government-to-government** channel —
never usable by private parties or civil litigants. The chain:

```
requesting prosecutor → requesting Central Authority
   (US: DOJ OIA; India: MHA IS-II; UK: Home Office UKCA / HMRC / Crown Office)
→ requested Central Authority
   (Switzerland: Federal Office of Justice — dual-criminality + proportionality review)
→ requested state executes under ITS OWN law
   (US: federal court issues §2703 process on probable cause;
    India: court acts under CrPC ss. 166B/105K)
→ evidence returned via central authorities in admissible form
```

Sources: DOJ OIA guidance (OFFICIAL); FJC MLAT practice guide (OFFICIAL); UK MLA
guidelines (OFFICIAL); MHA IS-II comprehensive guidelines, Dec 2019 (OFFICIAL).

### 1.2 Timelines — months, not days

| Metric | Value | Source |
|---|---|---|
| US avg MLAT response time (2013 review) | **~10 months**, "some considerably longer" | President's Review Group, via R Street (SECONDARY) |
| Inbound-to-US requests | 6 weeks – 10 months+ | K&L Gates (SECONDARY) |
| India→US requests (2016 reporting) | **avg 3 yrs 4 months**; narrow requests down to "a few months" | Economic Times (SECONDARY) |
| US OIA backlog (2014) | >1,000 sent, ~3,250 received, **>4,800 pending** | crimlawpractitioner.org (SECONDARY) |

Letters rogatory (no-treaty fallback, also used by civil/defense parties) run on
judicial comity — slower and discretionary.

### 1.3 When MLAT is NOT needed

- **CLOUD Act direct compulsion** on a US provider (§2).
- **Emergency disclosure**: 18 U.S.C. §2702(b)(8)/(c)(4) — providers may
  voluntarily disclose to government on good-faith belief of danger of death or
  serious physical injury (PRIMARY, uscode.house.gov).
- **Executive-agreement orders**: UK and Australian orders go straight to US
  providers, no per-request MLAT (§2.3).
- Comity-based non-treaty requests — discretionary.

### 1.4 Treaty map relevant to a BVI/Swiss/India structure

| Pair | Instrument | Status |
|---|---|---|
| US–Switzerland | MLAT, signed 25 May 1973, in force 23 Jan 1977 — the *first* US MLAT | PRIMARY (state.gov; sr-0-351-933-6) |
| US–India | MLAT, signed 17 Oct 2001, in force 3 Oct 2005; **no dual-criminality requirement** (Art. 1(3)); refusal on sovereignty/security grounds | PRIMARY (state.gov; mea.gov.in) |
| US–BVI | UK MLAT extended to dependencies, in force **9 Nov 1990** — **a BVI holdco is inside the US treaty network** | OFFICIAL (justice.gov) |
| US–EU | 2003 US–EU MLA Agreement + bilateral instruments; in force 1 Feb 2010 covering every member state | OFFICIAL (state.gov) |
| India | MLATs with ~42 countries incl. Switzerland, UK, US, France, UAE, Singapore; **no EU-level MLAT** — patchwork | OFFICIAL (mea.gov.in) |

**Structural consequence.** A US subpoena reaches only (i) persons/entities in
US jurisdiction or (ii) US providers for data in their "possession, custody, or
control." Data held solely by a Swiss operating company with no US-retrievable
path forces the request into MLAT — adding friction and refusal grounds
(sovereignty, proportionality, dual criminality for some measures). That is
**friction, not immunity** — and it does nothing against sanctions (§6),
platform/tax duties (§7), or a subpoena served personally on a US-resident
officer or director.

---

## 2. CLOUD Act — reach follows control, not location

### 2.1 The statute

18 U.S.C. §2713 (23 Mar 2018): an ECS/RCS provider "shall comply … to preserve,
backup, or disclose the contents of a wire or electronic communication and any
record or other information pertaining to a customer or subscriber within such
provider's **possession, custody, or control, regardless of whether such
communication … is located within or outside of the United States**."
(PRIMARY, govinfo.gov)

"Control" is undefined in the statute and resolved through the *Bank of Nova
Scotia* line of cases — US courts have long compelled production of overseas
documents from parties subject to US jurisdiction.

### 2.2 Microsoft Ireland → statutory rule

SDNY §2703 warrant (Dec 2013) for Dublin-stored email → Microsoft held in civil
contempt → Second Circuit (2016) held SCA warrants don't reach extraterritorially
→ Congress passed the CLOUD Act mid-appeal → SCOTUS vacated as moot
(17 Apr 2018). The control rule is now statutory. (PRIMARY, supremecourt.gov;
OFFICIAL, CRS R45173)

### 2.3 Escape valves and executive agreements

- **§2703(h) comity motion**: provider may move to quash within 14 days where
  the customer is a non-US person and disclosure risks violating the law of a
  **"qualifying foreign government"** (a CLOUD-agreement country). For conflicts
  with non-qualifying countries (e.g., GDPR states absent agreement) only weak
  common-law comity remains. (OFFICIAL, CRS R45173)
- **US–UK agreement**: signed 3 Oct 2019, **in force 3 Oct 2022** — UK orders
  now go directly to US providers and vice versa. (OFFICIAL, federalregister.gov;
  justice.gov)
- **US–Australia**: signed 15 Dec 2021; listed by DOJ among existing CLOUD
  agreements (exact entry-into-force date unconfirmed — flag).
- **US–Canada**: negotiations announced Mar 2022, **not finalized** as of Dec 2025.
- **US–EU**: stalled; meanwhile the **EU e-Evidence Regulation** production
  orders land on US providers' EU addressees, with an Art. 17 conflict-of-laws
  objection procedure. (SECONDARY, lawfaremedia.org; edrm.net)

### 2.4 What this means for ThryftVerse's vendor stack

- **Stripe, Expo/EAS, Apple, Google, AWS** are US persons. Data they *control* is
  US-reachable wherever physically stored — including data held by their own
  foreign subsidiaries if the US entity can retrieve it.
- Hosting "in Switzerland" via a US-controlled vendor does **not** produce
  Swiss-law-only reach.
- ThryftVerse's own non-US entity holding data is not itself an SCA "provider"
  reachable by US process — **but its US vendors are the reachable layer**.
- Flag: compelled production of ciphertext (vendor holds ciphertext, customer
  holds keys) is still production; "control" boundaries for E2EE data are
  litigated case-by-case.

---

## 3. GDPR cross-border transfer machinery

### 3.1 Adequacy map (as accessed 2026-09-23)

Adequate: Andorra, Argentina, **Brazil**, Canada (commercial only), Faroes,
Guernsey, Israel, Isle of Man, Japan, Jersey, NZ, South Korea, Switzerland,
**UK (renewed 19 Dec 2025)**, Uruguay, US (**DPF-certified orgs only**), EPO.
**Not adequate:** India, China, Indonesia, Vietnam, Saudi Arabia — require
Art. 46 tools. (OFFICIAL, commission.europa.eu)

### 3.2 SCCs + transfer impact assessment (post-Schrems II)

*Schrems II* (C-311/18, 16 Jul 2020): Privacy Shield invalidated; SCCs survive
but exporters must verify case-by-case that destination law lets the importer
comply — the TIA duty embedded in the 2021 SCCs (Decision (EU) 2021/914,
Clause 14). (PRIMARY, curia.europa.eu; eur-lex.europa.eu)

### 3.3 Article 48 — the mirror image of the CLOUD Act

A third-country judgment requiring an EU controller/processor to disclose
personal data "may only be recognised or enforceable in any manner if based on
an international agreement, such as a mutual legal assistance treaty."
EDPB Guidelines 02/2024 (final, June 2025): four-step test; expressly covers the
US-parent-requests-EU-subsidiary scenario. **Net: a US subpoena served on
ThryftVerse's EU entity is not self-executing in the EU; complying voluntarily
is itself a regulated transfer.** (OFFICIAL, edpb.europa.eu)

### 3.4 UK and India variants

- **UK**: restricted transfers use the **IDTA** or **UK Addendum** to EU SCCs
  (in force 21 Mar 2022; legacy conversion deadline passed 21 Mar 2024). EU SCCs
  alone are not valid for UK GDPR transfers. (OFFICIAL, ico.org.uk)
- **India DPDP**: s.16(1) is a **negative-list** model — government may restrict
  transfers to specified countries by notification; default is open flow, no
  SCC/TIA. **Status flag:** DPDP Rules notified Nov 2025 but s.16/Rule 15 not
  yet in force; substantive obligations slated ~May 2027; no restricted list
  published. Sectoral rules (RBI localisation) override regardless (s.16(2)).
  (PRIMARY, meity.gov.in; SECONDARY, barandbench.com)

### 3.5 China — three routes with thresholds

PIPL Art. 38: CAC security assessment / accredited certification / standard
contract filing. Post-22 Mar 2024 Provisions: mandatory CAC assessment for
CIIOs, Important Data exporters, and non-CIIOs exporting PI of **>1M**
individuals cumulatively; SCC/certification for 100k–1M; below 100k exempt in
defined scenarios. Certification measures effective **1 Jan 2026**.
(SECONDARY, twobirds.com; conventuslaw.com; chambers.com)

---

## 4. Data localisation — hard vs soft

| Jurisdiction | Instrument | Type | Mechanics |
|---|---|---|---|
| **Russia** | 152-FZ Art. 18(5) + 242-FZ (eff. 1 Sep 2015) | **Hard primary-storage** | Russian citizens' personal data must be recorded/stored on databases in Russia; onward transfer permitted after. Fines ₽1–6M first, ₽6–18M repeat; LinkedIn blocked for non-compliance; enforced vs Facebook/Twitter/WhatsApp. (PRIMARY garant.ru; SECONDARY morganlewis.com) |
| **China** | CSL Art. 37 / PIPL Art. 40 + DSL | **Hard for CIIOs + Important Data** | Onshore storage; export needs CAC assessment. Non-CIIOs use the §3.5 export regime, not blanket localisation. |
| **India** | RBI circular DPSS.CO.OD.No.2785/06.08.005/2017-18 (6 Apr 2018) | **Hard — payment data only** | *Entire* payment-system data incl. end-to-end transaction details and credentials stored **only in India**. Processing abroad permitted if data is deleted abroad and repatriated within 24h/1 business day. Applies to all PSS-Act-authorised PSOs. DPDP itself is **not** a localisation law. (PRIMARY rbi.org.in) |
| **Saudi Arabia** | PDPL (eff. 14 Sep 2023) + Transfer Regs | Transfer-mechanism | SDAIA adequacy list + safeguards/exemptions; no blanket localisation. |
| **Indonesia** | GR 71/2019 | **Split** | *Public-service* ESPs must host in-country (eff. 4 Oct 2021); *private* ESPs may store abroad but must ensure supervision/access — access duty, not localisation. (PRIMARY jdih.komdigi.go.id) |
| **Vietnam** | Cybersecurity Law 24/2018 + Decree 53/2022 | **Conditional hard** | Domestic firms in scope localise unconditionally. Foreign firms in 10 service fields (e-commerce, online payment, social media) must localise **and** open a branch/rep office only after violation + written A05 cooperation request + non-compliance — then 12 months. (PRIMARY thuvienphapluat.vn) |
| **Turkey** | Banking Law 5411 + BRSA regs | **Sectoral hard** | Banks keep primary AND backup systems in Turkey, incl. outsourced/cloud. Payment/e-money institutions similarly localised. (PayPal exited over this.) |
| **Nigeria** | none | Sectoral/soft | NDPA 2023 is transfer-mechanism; localisation pressure via CBN/NITDA only. |
| **Brazil** | LGPD Art. 33 + ANPD Res. 19/2024 | Transfer-mechanism | Adequacy or ANPD SCCs/BCRs; no localisation. |

**ThryftVerse floor:** the binding hard requirement is **India's RBI
payment-data rule** — and it cannot be structured around, because the obligation
attaches to the authorised payment-system operator processing the Indian leg
(e.g., Razorpay's PA entity), not to ThryftVerse's domicile. Russia and China
are effectively market-exit decisions absent local infrastructure.

---

## 5. Key-disclosure and compelled-assistance laws

| Jurisdiction | Instrument | Power | Penalty for refusal |
|---|---|---|---|
| **UK** | RIPA Part III s.49 | Disclosure notice for the key to lawfully-obtained protected data; s.54 tipping-off offence | s.53: **2 yrs** general, **5 yrs** national-security/child-indecency (confirmed *R v S* [2008] EWCA Crim 2177) |
| **Australia** | TOLA 2018 (Telco Act Part 15) | TAR (voluntary) → TAN (compel existing capability) → **TCN (compel building a NEW capability; AG+Comms Minister + expert/retired-judge review)**; statutorily cannot require "systemic weakness" (flag: section cite unverified) | per instrument |
| **France** | Penal Code Art. 434-15-2 | Surrender/implement decryption key on judicial requisition | **3 yrs + €270k**; 5 yrs + €450k if refusal enabled a crime (upheld, QPC 2018-696) |
| **India** | IT Act **s.69** (2008 amend.) + 2009 Rules | Direction to intercept/monitor/**decrypt**; s.69(3) obliges "all facilities and technical assistance"; defines "decryption key holder" | s.69(4): **up to 7 yrs + fine** |
| **US** | No statute; **All Writs Act** route | Feb 2016 CDCA order to Apple to build signed bypass firmware (San Bernardino); withdrawn after third-party unlock — **AWA-compelled-backdoor authority remains unresolved appellate law**; compelled password disclosure splits on Fifth Amendment "foregone conclusion" | contempt |
| **EU** | No EU-wide law | Belgium Art. 88quater (special-knowledge persons, not suspects); Germany/Netherlands: no decryption duty on suspects (self-incrimination); witnesses compellable | — |
| **Switzerland** | No specific statute (flag) | Compulsion flows through BÜPF/PTSS instruments | — |

**Architectural corollary:** E2EE/zero-knowledge design converts every
key-disclosure regime into an impossibility rather than a compliance question —
you cannot disclose what you cannot access. But it does **not** prevent
compelled *assistance* (Australia TCN) or compelled *client-side* delivery
(the Apple–FBI model), which target the software pipeline itself — including
update-signing keys (see 02-backend-sovereignty, §8).

---

## 6. Sanctions — the regime where domicile is nearly irrelevant

- **OFAC blocking**: SDN designation → all property within the US or in
  possession/control of US persons must be blocked; virtually all dealings
  prohibited absent licence. **50 Percent Rule**: aggregate ≥50% ownership
  (direct or indirect) by blocked persons auto-blocks the entity — ownership,
  not control. (OFFICIAL, OFAC FAQs 398/402)
- **Secondary sanctions**: non-US persons sanctioned for dealings with SDNs or
  comprehensively sanctioned regimes even with **no US nexus** (EO 14024,
  EO 13902 authorities).
- **No local entity required for exposure**: civil penalties are strict
  liability (~$386,136/violation IEEPA per the Mar 2024 tri-seal note);
  jurisdiction routinely grounded on **USD clearing through US correspondent
  accounts** or "causing" a US person to violate (BAT case: sole US touch was an
  indirect foreign branch of a US bank). (SECONDARY, mayerbrown.com)
- **App distribution is itself the chokepoint**: App Store unavailable in Cuba,
  Iran, North Korea, Sudan, Syria, Crimea; Play users in Crimea/DNR/LNR can't
  purchase; Apple blocks apps "connected to U.S. embargoed countries" as US
  sanctions law mandates. (OFFICIAL, support.google.com)

**Structural conclusion:** a non-US holding structure does *not* remove
sanctions exposure — USD clearing creates a US nexus; Apple/Google/Stripe are US
persons whose compliance binds your distribution regardless of domicile;
secondary sanctions reach non-US actors directly.

---

## 7. Marketplace compliance floor — duties no structure removes

| Regime | Trigger | Duty |
|---|---|---|
| **US marketplace facilitator laws** (all sales-tax states; post-*Wayfair* 21 Jun 2018) | Platform facilitates third-party sales past economic-nexus thresholds (model: $100k; no state went lower) | Platform itself collects+remits sales tax, files returns, handles exemption certs. (PRIMARY supremecourt.gov; OFFICIAL streamlinedsalestax.org; NCSL) |
| **EU DAC7** (Dir. 2021/514; live 1 Jan 2023) | Platform facilitates EU sellers / EU-sited property — applies to **non-EU operators too** (register in one member state) | Collect, **verify** (due-diligence duty), and annually report seller identity, account, TIN, income by **31 Jan**; automatic exchange between member states. (OFFICIAL, taxation-customs.ec.europa.eu) |
| **EU VAT deemed-supplier** (Art. 14a VAT Directive, eff. 1 Jul 2021) | Platform "facilitates" ≤€150 imported-consignment sales or intra-EU sales by non-EU sellers | Platform **deemed to receive and re-supply the goods** — split supply; platform accounts for VAT; OSS/IOSS single filing. UK runs an equivalent post-Brexit regime (flag: verify with HMRC). (OFFICIAL, vat-one-stop-shop.ec.europa.eu; revenue.ie) |
| **India GST TCS** (CGST s.52) | E-commerce operator collects consideration on supplies | TCS on net taxable supplies — **rate 0.5% (0.25+0.25) since 10 Jul 2024** (secondary; flag); GSTR-8 monthly; **ECO must register regardless of turnover** (s.24(x)); sellers via ECO lose small-supplier exemption (s.24(ix)). (PRIMARY cbic.gov.in; OFFICIAL gstcouncil.gov.in) |
| **India income-tax TDS s.194-O** | ECO credits gross sales to participants | TDS — **rate cut 1% → 0.1% eff. 1 Oct 2024** (Finance Act 2024). |

**Bottom line:** facilitator/deemed-supplier/TCS/DAC7 duties attach to
*operating a platform that facilitates supplies into a market*, not to the
holding entity's location. A BVI/Swiss stack changes who gets sued, not whether
collection and reporting duties exist.

---

## 8. Foundation mechanics — what a purpose-lock does and doesn't do

| Vehicle | Mechanics | Supervision |
|---|---|---|
| **Swiss Stiftung** (ZGB Art. 80 ff.) | Ownerless purpose-bound assets; founder retains no rights | **State-supervised** (Art. 84): supervisor can set cure deadlines, **appoint organs**, even **reassign assets to a similar-purpose foundation** (Art. 83d). (PRIMARY droit-bilingue.ch; OFFICIAL swissfoundations.ch) |
| **Dutch stichting** (BW 2 Art. 285) | Orphan/purpose fund governed by its board; no members | **No state supervisor** — which is exactly why it's used for insolvency-remote structures. (OFFICIAL kvk.nl) |
| **Cayman foundation company** (Law 2017) | Company declared a foundation; memorandum must prohibit distributions to members; powers allocable to founders/supervisors | Company-law machinery; secretary must be a "qualified person." (PRIMARY legislation.gov.ky) |
| **US 501(c)(3)** (Signal model) | Nonprofit parent owns LLC subsidiary; lock = IRC charitable-purpose rules: no private inurement; dissolution assets to exempt purposes | IRS + state AG charity oversight |

**Proton model (Jun 2024):** founders donated Proton AG shares to the Swiss
Proton Foundation, making it primary shareholder — "no change of control can
occur without the consent of the foundation." (OFFICIAL, proton.me)

**Limits — material for honest claims:**
1. The lock is a **shareholder-vote veto**, not legal impossibility — asset
   sales and compelled insolvency remain theoretical paths; foundation boards
   are humans replaceable under supervisory powers.
2. Strength = the foundation's **voting stake**; dilution and minority
   issuances remain vectors.
3. It does **nothing** against state compulsion of the operating company —
   Swiss courts still compel Proton AG. A Stiftung is a governance device,
   not a jurisdictional shield.
4. Duties run to the *purpose*, enforceable via the supervisory authority —
   not via any contractual user right.
5. Claims that a foundation makes a company "unsellable" are marketing
   shorthand; the accurate statement is that sale requires cooperation of a
   purpose-bound, state-supervised board with no profit motive.

---

## 9. Cross-cutting synthesis

1. **Entity layering buys time and friction, not immunity.** BVI+Switzerland
   forces criminal compulsion into MLAT channels (10-month averages, refusal
   grounds, dual-sovereignty review) — but both are inside the US treaty
   network, and GDPR Art. 48 cuts the other direction.
2. **The vendor layer is the real attack surface.** CLOUD Act reach follows
   *control* — Stripe/AWS/Expo/Apple data is US-reachable wherever stored —
   while GDPR/Schrems II makes your disclosure to them a regulated transfer
   needing SCCs + TIA.
3. **Compliance floors are location-independent.** Facilitator tax, DAC7,
   India TCS + RBI payment-data localisation, and sanctions attach to
   *transacting into the market*, not to incorporation site.
4. **Encryption architecture outperforms entity architecture** against
   key-disclosure regimes — but compelled-assistance powers target the
   software itself.
5. **Foundations** provide credible governance locks, not jurisdictional
   shields.

**Unverified / flagged:** India–Germany MLAT status; US–Australia CLOUD
entry-into-force date; TCN "no systemic weakness" exact section; UK
deemed-supplier VAT details (needs HMRC source); Brazil adequacy decision
status; India TCS 0.5% rate rests on a secondary source; Swiss key-disclosure
absence asserted from silence.
