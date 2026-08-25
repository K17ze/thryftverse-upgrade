# ThryftVerse Trust and Safety Moderation Operations — Flagship Implementation Dossier (Upgraded)

**Research cut-off:** 25 August 2026 (includes DSA Implementing Regulation harmonised transparency reporting, Ofcom Risk Assessment Guidance V2.0 June 2026, new UK priority offences December 2025, OpenAI omni-moderation, AWS Rekognition Custom Moderation, Sightengine 2026 capabilities)
**Repository snapshot:** `f82f74a54be79a1721017380ddd5472d856f1679` plus the inspected working tree on `feat/product-detail-contract-media-device-closure`
**Scope:** reporting, proactive detection, moderation cases, operator review, enforcement, notice, appeals, child safety, transparency, DSA statement-of-reasons compliance, Ofcom illegal-content and child-protection duties
**Deliverable type:** codebase-grounded research and implementation dossier; no product code changed
**Decision owner:** Trust & Safety engineering, with Legal/Compliance, Product, ML Platform, SRE and Support as required approvers
**Inspector identity:** senior FAANG mobile/full-stack architect, 20 years, top-level mobile app architecture + front-end UI/UX engineering + back-end design. Anti-AI-design policy enforced throughout.

---

## 0. What changed in this upgrade

This is a deepened re-issue of the 25 August 2026 dossier. Every codebase claim was re-verified by direct file inspection. The following material is new or substantially expanded:

1. **DSA Implementing Regulation (July 2025, first reports due beginning 2026)** — the harmonised transparency reporting template is now in effect. Providers must collect data under the new standardised format with specific content categories (cyber violence, protection of minors, scams and frauds, etc.) and submit statements of reasons to the DSA Transparency Database with standardised attributes (decision visibility/monetary/provision/account, territorial scope, duration, facts, automation, source). The content categories in the DSA Transparency Database now match the harmonised template, enabling cross-tool consistency checks. This directly constrains ThryftVerse's case model, reason taxonomy and transparency export.
2. **Ofcom Risk Assessment Guidance V2.0 (25 June 2026)** — 18 kinds of priority illegal content must be separately risk-assessed. New priority offences added December 2025: cyberflashing and encouraging/assisting serious self-harm (combined with suicide into 'suicide and self-harm'). Providers have three months to complete a risk assessment after launch and must review before significant product changes. This directly constrains ThryftVerse's illegal-content detection, queue design and child-safety controls.
3. **Ofcom Protection of Children Code of Practice (4 July 2025)** — if children are likely to access the service, children's risk assessments, protections and record-keeping are mandatory. This is a hard gate before any minor-facing feature ships.
4. **OpenAI omni-moderation-latest** — free text+image moderation API with 13+ categories (harassment, hate, illicit, self-harm, sexual, violence, etc.) and per-category scores. A viable provider for text and image moderation alongside Rekognition/Sightengine.
5. **AWS Rekognition Custom Moderation** — train custom adapters on your own labelled images to enhance the base model's accuracy on ThryftVerse-specific content (counterfeit goods, marketplace-specific scams). Integrated with Amazon A2I for human review.
6. **Sightengine 2026 capabilities** — image, video, live-stream, text, audio moderation plus AI-generated image detection, deepfake detection, AI video/speech/music detection. Relevant for live-shopping and creator media.
7. **Deeper evidence ledger** — every defect line number re-confirmed against the inspected tree; additional defects around the conversation report idempotency false-ID return, the `console.info` review logging, and the image-only triage limitation.
8. **Deeper implementation specifications** — canonical case graph SQL, provider gateway adapter pattern, automation ladder with shadow evaluation, DSA statement-of-reasons export format, and anti-AI operator workstation design.
9. **Deeper threat model** — coordinated report brigading, evidence tampering, model evasion, provider outage cascades, and regulatory audit failure modes.

---

## 1. Executive verdict

ThryftVerse has meaningful moderation primitives but not yet a complete trust-and-safety operating system. I personally re-verified every claim in §3 against the inspected tree on 25 August 2026.

Listing, user and conversation reports exist; image/text moderation routes exist; the triage ledger records model and human decisions; auto-reject is correctly withheld pending human review (confirmed: `moderationTriageService.ts:317-331`). However:

1. the triage worker is a placeholder returning `human_review` with confidence 0.0 (`moderationTriageHandler.ts:114-127`), so model-derived fields cannot improve prioritization;
2. separate report tables lack one canonical case/notice/appeal graph across listings, users, chats, creator media, auctions, payments and live content;
3. queue ordering by uncertainty alone (`moderationTriageService.ts:443`: `ORDER BY confidence_score ASC, created_at ASC`) does not prioritize imminent harm, minors, credible illegality, virality, victim vulnerability, legal deadlines or coordinated abuse;
4. no complete `My reports` receipt/outcome UI, affected-user statement of reasons, internal complaint or appeal route was found;
5. a broad `admin` role is not an adequate permission model for access to sensitive content, minors' data, legal reports and enforcement;
6. no production operator console proving evidence review, policy versioning, dual control for irreversible actions, workload ownership or SLA escalation;
7. no end-to-end transparency export and no demonstrated Ofcom risk-assessment/change-management workflow;
8. **report taxonomy contract drift** — the UI offers 8 reasons (`off_platform, hate_speech, prohibited, scam, misinformation, privacy, impersonation, minor_safety`) but `user_reports` CHECK allows only 6 older values (`spam, inappropriate, counterfeit, unresponsive, harassment, other`) — valid-looking selections will fail at insert time;
9. **evidence is uploaded but discarded** — `ReportScreen.tsx` populates `evidenceUris` (lines 117/157/192) but none of the three submit calls (lines 211/213/219) pass evidence to the API;
10. **conversation report retry returns a false ID** — `ON CONFLICT DO NOTHING` returns `rowCount=0`, and the handler falls back to the freshly-generated `reportId` that was never persisted (`index.ts:20565-20567`);
11. **mock moderation provider is the production fallback** — unknown/unset `MODERATION_PROVIDER` falls back to mock which always approves (`lib/moderation/index.ts:102-109`), and production readiness does not check for this;
12. **two moderation paths have contradictory authority** — `/moderation/text` auto-rejects on provider result (`routes/moderation.ts:115`) while the triage policy says auto-reject requires human confirmation.

The P0 goal is not "add stronger AI moderation." It is to make every safety decision evidence-backed, time-bounded, reviewable and reversible while protecting urgent victims faster — and to meet the DSA and UK OSA regulatory duties that are now in effect.

---

## 2. Evidence method and confidence language

| Marker | Meaning |
|---|---|
| **[V]** | Verified repository fact — observed directly in the named file at the stated lines on the inspected snapshot by the author. |
| **[E]** | External requirement/guidance — supported by an official regulator, platform or standards source linked in §22. |
| **[I]** | Engineering inference/recommendation — proposed design based on the verified facts and external requirements. |

### 2.1 Inspection coverage

```text
native report entry
  ReportScreen.tsx
    -> profileApi.reportUser | listingsApi.reportListing | chatApi.reportConversationOnApi
      -> index.ts user/listing/conversation routes
        -> user_reports | listing_reports | conversation_reports

media upload/publication
  media upload -> media_assets
    -> moderation/image or worker lifecycle
      -> configured provider factory (mock/rekognition/sightengine)
        -> media_assets.moderation_status/status
        -> optional moderation_triage row
          -> admin review route

missing continuation
  report row -X-> canonical case -X-> evidence bundle -X-> policy decision
             -X-> statement of reasons -X-> appeal -X-> transparency record
```

Files inspected directly by the author on 25 August 2026:

- `backend/api/src/workers/handlers/moderationTriageHandler.ts` (full, 226 lines)
- `backend/api/src/lib/moderation/index.ts` (full, 120+ lines — provider factory)
- `backend/api/src/lib/moderation/moderationTriageService.ts` (queue ordering, auto-action gate, lines 264-450)
- `backend/api/src/routes/moderation.ts` (full, 229+ lines — image/text/review routes)
- `backend/api/src/routes/moderationTriage.ts` (admin queue and confirm/reject paths)
- `backend/api/src/db/migrations/048_user_social_graph.sql` (user_reports CHECK constraints, lines 39-52)
- `backend/api/src/db/migrations/065_product_detail_contracts.sql` (listing_reports CHECK constraints)
- `backend/api/src/db/migrations/147_moderation_triage.sql` (triage ledger schema)
- `backend/api/src/db/migrations/149_chat_message_lifecycle_columns.sql` (conversation_reports)
- `backend/api/src/lib/productionReadiness.ts` (confirmed: no moderation provider check)
- `frontend/src/screens/ReportScreen.tsx` (full, 280+ lines — report composer, evidence upload, submit)
- `frontend/src/hooks/chat/useConversationSafety.ts` (composer scam detection)
- `backend/api/src/index.ts` (conversation report route, lines 20544-20577; user/listing report routes)

---

## 3. Evidence ledger: current implementation (re-verified)

| ID | Evidence | Location | Class | Consequence |
|---|---|---|---|---|
| TS-01 | Mobile offers `off_platform`, `hate_speech`, `prohibited`, `scam`, `misinformation`, `privacy`, `impersonation` and `minor_safety`. | `frontend/src/screens/ReportScreen.tsx:24-102` | [V] | The UI taxonomy is broader than persisted schemas. |
| TS-02 | User/listing request schemas accept the broader taxonomy. | `backend/api/src/index.ts:14516-14535`; `:17617-17643` | [V] | Validation passes before the database insert. |
| TS-03 | `user_reports` CHECK allows only `spam, inappropriate, counterfeit, unresponsive, harassment, other`. | `048_user_social_graph.sql:50` | [V] | Several valid-looking report selections will fail at insert time. This is P0 contract drift. |
| TS-04 | Evidence media is uploaded and stored in `evidenceUris`, but none of the three submit calls includes it. | `ReportScreen.tsx:117,157,192` (upload) vs `:211,213,219` (submit without evidence) | [V] | The user pays upload cost and sees attached media, but the moderator never receives it. This is misleading UI. |
| TS-05 | The success screen promises review within 24 hours. | `ReportScreen.tsx:249-279` | [V] | No queue SLA or outcome system backs this promise. Replace with measured/contracted copy. |
| TS-06 | Conversation reports use `ON CONFLICT (idempotency_key) DO NOTHING`; on conflict, the handler returns the newly generated ID rather than selecting the existing row. | `index.ts:20552` (conflict) → `:20565-20567` (false fallback) | [V] | Retry can receive a report ID that does not exist. |
| TS-07 | User/listing IDs concatenate time and `Math.random`; user/listing submission has no idempotency key. | `index.ts:14539-14547`, `:17645-17652` | [V] | Collision quality and retry semantics are below the UUID/idempotent standard used elsewhere. |
| TS-08 | The conversation table starts at `submitted`; other report tables start at `pending`; reason taxonomies also differ. | migrations `048`, `065`, `149` | [V] | Cross-domain queue/query/metrics require branching and cannot reliably share one lifecycle. |
| TS-09 | `routes/listings.ts` contains a modular listing report route, but `index.ts` does not register `registerListingRoutes`; the active monolith contains another implementation. | `routes/listings.ts:113,3227-3262`; `index.ts` import inventory | [V] | Two definitions but one apparent runtime owner, creating drift and misleading review work. |
| TS-10 | Moderation provider defaults to `mock`, unknown values also fall back to `mock`, and mock approves all content. | `config.ts:502`; `lib/moderation/index.ts:94-109`; `mockProvider.ts` | [V] | A configuration typo can turn production moderation into allow-all without startup failure. |
| TS-11 | Production readiness does not check moderation provider. | `lib/productionReadiness.ts` (confirmed: no `MODERATION` match) | [V] | Deployment gates do not close TS-10. |
| TS-12 | `/moderation/text` directly returns a rejection on provider result, while triage policy says automated rejection requires human confirmation. | `routes/moderation.ts:115`; `moderationTriageService.ts:317-331` | [V] | Two moderation paths have contradictory authority rules. |
| TS-13 | An owner can supply arbitrary `modelId` and `modelVersion` when triggering triage. | `routes/moderationTriage.ts:58-61,134-178` | [V] | Audit provenance is caller-authored rather than server-resolved from the model registry. |
| TS-14 | Manual review logs to `console.info`; the media row lacks authoritative decision reason/reviewer fields in this transaction. | `routes/moderation.ts:213-214` | [V] | Application logs do not provide durable decision evidence or a user-notice source. |
| TS-15 | Triage queue order is `confidence_score ASC, created_at ASC` — lowest confidence first. | `moderationTriageService.ts:443` | [V] | Ambiguity outranks severe, viral, minor-safety or legally urgent harm. |
| TS-16 | Triage accepts only image assets. | `moderationTriageHandler.ts:168` (`if (asset.media_kind !== 'image') return`) | [V] | Video, text, chat, profile, live, listing-behavior and composite cases do not share triage. |
| TS-17 | Composer scam detection is local deterministic pattern matching with dismissal state. | `frontend/src/hooks/chat/useConversationSafety.ts:24-70` | [V] | Useful immediate friction, but dismissals are local and produce no server safety event or confirmed outcome. |
| TS-18 | The triage worker's placeholder model returns `human_review` with confidence 0.0 and no labels. | `moderationTriageHandler.ts:114-127` | [V] | Every image routes to the human queue with no prioritization signal until a real model is deployed. |
| TS-19 | No `safety_cases`, `safety_notices`, `safety_decisions`, `safety_appeals`, `statements_of_reasons`, `enforcement_actions`, `safety_audit_events` or `policy_versions` table exists in any migration. | migrations `001`-`152` (confirmed: absent) | [V: absence] | The canonical case graph does not exist. |
| TS-20 | No DSA Transparency Database submission, statement-of-reasons export or Ofcom risk-assessment record exists in the codebase. | repository-wide search (confirmed: absent) | [V: absence] | Regulatory transparency duties cannot be met. |

### 3.1 Immediate severity ranking

| Priority | Finding | Required action before broader UI polish |
|---|---|---|
| P0-A | TS-03 schema/request taxonomy mismatch | Migration first; one canonical policy reason registry. |
| P0-B | TS-04 discarded evidence | Bind finalized media asset IDs to the notice transaction; no raw URL array. |
| P0-C | TS-06 false retry ID | `ON CONFLICT ... DO UPDATE/SELECT` and return the actual persisted row. |
| P0-D | TS-10 allow-all production fallback | Production startup must reject mock/unknown provider. |
| P0-E | TS-12 contradictory auto-reject authority | One policy decision service controls every content restriction. |
| P0-F | TS-05 fabricated SLA | Remove 24-hour promise until measured, staffed and policy-backed. |
| P0-G | TS-15 queue prioritizes ambiguity over harm | Replace with versioned harm/exposure/vulnerability/deadline priority. |
| P0-H | TS-19 no canonical case graph | Build the case/decision/appeal/audit schema and service. |
| P0-I | TS-20 no regulatory transparency export | Build DSA statement-of-reasons and Ofcom risk-assessment evidence. |

---

## 4. 2026 regulatory landscape (deepened)

### 4.1 EU Digital Services Act — Implementing Regulation in effect

**[E]** The European Commission adopted an Implementing Regulation (July 2025) that standardises the format, content and reporting periods for transparency reports under the DSA. Providers must collect data according to the new template as of 1 July 2025, with the first harmonised reports due beginning 2026.

**[E — DSA Transparency Database]** Providers of online platforms must submit statements of reasons to the DSA Transparency Database. The database attributes now match the harmonised template content categories. Each statement must include:

- **decision types** — at least one of: `decision_visibility` (visibility restriction), `decision_mandatory` (monetary payment restriction), `decision_provision` (provision of service restriction), `decisionaccount` (account restriction);
- **territorial scope** and **duration** of the restriction;
- **facts and circumstances** relied upon;
- **whether automated means were used**;
- **source** (e.g. trusted flagger, notice, own-initiative);
- **PUID** (platform-unique identifier) that connects the database entry to the platform's internal case;
- **content categories** matching the harmonised taxonomy (cyber violence, protection of minors, scams and frauds, etc.).

**[E — DSA Articles 16-22]** Simple notice-and-action access, outcome notification, clear and specific statements of reasons, a free internal complaint path and human-capable contact rather than automation alone. The Commission's 2026 scam guidance specifically warns against designs that obscure the legally meaningful reporting route.

**Implication [I]:** ThryftVerse's `statements_of_reasons` table and transparency export must produce records matching the DSA Transparency Database schema. The `safety_decisions` table must capture decision type, territorial scope, duration, facts, automation flag, source and PUID. The content categories in the reason registry must map to the DSA harmonised taxonomy. This is not optional for EU-reach services.

### 4.2 UK Online Safety Act — Ofcom V2.0 guidance (June 2026)

**[E]** Ofcom's Risk Assessment Guidance V2.0 (25 June 2026) requires in-scope services to assess 18 kinds of priority illegal content plus other illegal content. Providers have three months to complete a risk assessment after launch and must review before significant product changes.

**[E — new priority offences, December 2025]** The UK government created two new priority offences: cyberflashing and encouraging/assisting serious self-harm. Ofcom combined suicide and self-harm into a single kind of illegal harm ('suicide and self-harm') and added cyberflashing as a separate kind. Providers must review and update their illegal content risk assessments to assess these new harms.

**[E — Protection of Children Code of Practice, 4 July 2025]** If children are likely to access the service, providers must complete children's risk assessments, put in place protections, and comply with record-keeping and review duties.

**Implication [I]:** ThryftVerse's illegal-content detection must cover the 18 priority offences including the new cyberflashing and self-harm categories. The case model must support risk-assessment records, mitigation measures and review cycles. Child-safety controls (age assurance, content filtering, reporting) are mandatory before any minor-facing feature ships. Legal counsel must validate exact obligations by entity, territory and scale before launch.

### 4.3 Regulatory overlap matrix

| Duty | DSA (EU) | OSA (UK) | ThryftVerse implication |
|---|---|---|---|
| Notice-and-action | Article 16 | Illegal content duties | Canonical notice with receipt, subject locator, jurisdiction |
| Statement of reasons | Article 17, Transparency DB | Record-keeping | `statements_of_reasons` with DSA-compatible attributes |
| Internal complaint/appeal | Article 20 | (best practice) | Free internal appeal with independent reviewer |
| Human review of automation | Article 22 | Safety duties | Automated decisions logged, reversible, human-supervised for high-impact |
| Risk assessment | (VLOPs/VLOSEs) | All in-scope services | Ofcom V2.0: 18 priority offences, review before significant change |
| Child protection | (Guidelines for minors) | Protection of Children Code | Children's risk assessment, age assurance, content filtering |
| Transparency reporting | Implementing Regulation, annual/biannual | Record-keeping | Harmonised template export, DSA Transparency DB submission |
| Priority offences — cyberflashing | (Member-state-specific) | New UK priority offence (Dec 2025) | Detection, queue, reporting for image-based sexual abuse |
| Priority offences — self-harm | (Member-state-specific) | Combined 'suicide and self-harm' | Detection, queue, crisis resources |

---

## 5. Moderation provider landscape (2026)

### 5.1 OpenAI omni-moderation-latest

**[E]** Free text+image moderation API. Accepts text and image inputs (up to 20MB per image). Categories: harassment, harassment/threatening, hate, hate/threatening, illicit, illicit/violent, self-harm, self-harm/intent, self-harm/instructions, sexual, sexual/minors, violence, violence/graphic. Returns per-category boolean flags and scores.

**[I] Fit for ThryftVerse:** text moderation for listings, messages, reviews and profile bios. Image moderation as a complementary provider. The free tier makes it viable for high-volume text scanning. Does not handle video, audio or live-stream — combine with Rekognition or Sightengine for those modalities. Does not provide custom moderation adapters.

### 5.2 AWS Rekognition Content Moderation

**[E]** Detects explicit adult, suggestive, violence, drugs, tobacco, alcohol, hate symbols, gambling and disturbing content in images and videos. Custom Moderation allows training custom adapters on your own labelled images to enhance accuracy on domain-specific content. Integrated with Amazon A2I for human review workflows. Hierarchical taxonomy for granular business rules by geography, audience and time.

**[I] Fit for ThryftVerse:** primary image/video moderation provider. Custom Moderation adapters for marketplace-specific content (counterfeit goods, restricted items, scam listing patterns). A2I integration for the human review queue. Already has a provider adapter in the codebase (`rekognitionProvider.ts`).

### 5.3 Sightengine

**[E]** Image, video, live-stream, text, audio moderation. 120+ image moderation classes. AI-generated image detection, deepfake detection, AI video/speech/music detection. OCR and QR code moderation. Text moderation with rule-based and ML models.

**[I] Fit for ThryftVerse:** live-stream moderation for live-shopping, deepfake detection for creator media, audio moderation for voice messages. Already has a provider adapter in the codebase (`sightengineProvider.ts`).

### 5.4 Provider gateway design

```text
content (text/image/video/audio/live)
  -> provider gateway resolves provider+model+version from policy
  -> adapter normalizes provider labels to ThryftVerse policy reason codes
  -> policy maps normalized labels to action + jurisdiction
  -> result stored with content hash, provider request ID, model/taxonomy version
  -> raw provider response in encrypted, access-restricted evidence storage
```

**[I] Multi-provider strategy:**
- **Text:** OpenAI omni-moderation (primary, free) + Sightengine text (secondary for profanity/PII)
- **Images:** AWS Rekognition + Custom Moderation adapter (primary) + Sightengine (secondary for AI-generated detection)
- **Video:** AWS Rekognition video moderation (primary) + Sightengine video (secondary)
- **Audio:** Sightengine audio moderation (only viable option currently)
- **Live-stream:** Sightengine live-stream moderation (real-time frame sampling)

Never map provider failure to `approved`. Provider failure returns `unavailable`, queues retry and leaves publication pending.

---

## 6. Target domain model

Build a canonical case graph while retaining domain-specific report projections:

```sql
-- Migration: 153_safety_case_graph.sql

CREATE TABLE safety_reason_codes (
  code TEXT PRIMARY KEY,
  dsa_category TEXT,                    -- maps to DSA harmonised taxonomy
  uk_priority_offence TEXT,             -- maps to Ofcom 18 priority offences
  severity_class SMALLINT NOT NULL,     -- 1=low, 2=medium, 3=high, 4=critical
  user_facing_label TEXT NOT NULL,
  is_illegal_content BOOLEAN NOT NULL DEFAULT false,
  requires_legal_review BOOLEAN NOT NULL DEFAULT false,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at TIMESTAMPTZ
);

CREATE TABLE policy_versions (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  jurisdiction TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ,
  user_facing_explanation_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE safety_notices (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  subject_type TEXT NOT NULL CHECK (subject_type IN
    ('user','listing','message','conversation','media','auction','live_session')),
  subject_id TEXT NOT NULL,
  subject_snapshot JSONB NOT NULL,       -- immutable content/locator snapshot
  basis TEXT NOT NULL CHECK (basis IN ('terms','illegal_content','unsure')),
  reason_code TEXT NOT NULL REFERENCES safety_reason_codes(code),
  jurisdiction TEXT,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN
    ('normal','elevated','emergency')),
  allegation TEXT,
  reporter_status TEXT,                  -- authenticated, anonymous, trusted_flagger
  acknowledgement_state TEXT NOT NULL DEFAULT 'pending' CHECK (acknowledgement_state IN
    ('pending','sent','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reporter_id, idempotency_key)
);

CREATE TABLE safety_cases (
  id TEXT PRIMARY KEY,
  notice_id TEXT REFERENCES safety_notices(id),
  owner_team TEXT,
  severity SMALLINT NOT NULL DEFAULT 2,
  involves_minor BOOLEAN NOT NULL DEFAULT false,
  involves_vulnerable_user BOOLEAN NOT NULL DEFAULT false,
  virality_score INTEGER NOT NULL DEFAULT 0,
  exposure_count INTEGER NOT NULL DEFAULT 0,
  sla_class TEXT NOT NULL DEFAULT 'standard' CHECK (sla_class IN
    ('standard','priority','emergency')),
  sla_deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN
    ('open','under_review','decision_pending','enforcement_pending',
     'closed','appealed','reopened')),
  linked_case_ids TEXT[],
  policy_version_id TEXT REFERENCES policy_versions(id),
  jurisdiction TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE safety_case_evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES safety_cases(id) ON DELETE CASCADE,
  media_asset_id TEXT REFERENCES media_assets(id),
  evidence_hash BYTEA NOT NULL,          -- content hash for integrity
  source TEXT NOT NULL CHECK (source IN
    ('reporter','system_scan','provider','partner_notice','law_enforcement')),
  access_class TEXT NOT NULL CHECK (access_class IN
    ('standard','sensitive','legal_hold','csam_restricted')),
  retention_class TEXT NOT NULL,
  chain_of_custody JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE safety_decisions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES safety_cases(id),
  decision TEXT NOT NULL CHECK (decision IN
    ('no_violation','restrict','escalate','emergency_hold')),
  policy_rule_id TEXT NOT NULL,
  policy_version_id TEXT NOT NULL REFERENCES policy_versions(id),
  evidence_ids TEXT[] NOT NULL,
  territorial_scope TEXT[],
  duration_kind TEXT NOT NULL CHECK (duration_kind IN ('permanent','temporary')),
  duration_until TIMESTAMPTZ,
  user_reason_code TEXT NOT NULL REFERENCES safety_reason_codes(code),
  internal_reason TEXT NOT NULL,
  automated_means BOOLEAN NOT NULL DEFAULT false,
  model_id TEXT,
  model_version TEXT,
  model_confidence REAL,
  human_reviewer_id TEXT REFERENCES users(id),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE enforcement_actions (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES safety_decisions(id),
  action_type TEXT NOT NULL CHECK (action_type IN
    ('content_removal','visibility_restriction','feature_limit','warning',
     'account_restriction','account_suspension','emergency_hold','monetary_restriction')),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  scope JSONB NOT NULL,
  executed_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  reversed_by TEXT REFERENCES users(id),
  reversal_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','executed','failed','reversed'))
);

CREATE TABLE statements_of_reasons (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES safety_decisions(id),
  affected_user_id TEXT NOT NULL REFERENCES users(id),
  -- DSA Transparency Database compatible fields
  decision_visibility BOOLEAN NOT NULL DEFAULT false,
  decision_mandatory BOOLEAN NOT NULL DEFAULT false,
  decision_provision BOOLEAN NOT NULL DEFAULT false,
  decision_account BOOLEAN NOT NULL DEFAULT false,
  territorial_scope TEXT[] NOT NULL DEFAULT '{}',
  duration TEXT NOT NULL,
  facts TEXT NOT NULL,
  automated_means BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL,
  puid TEXT NOT NULL UNIQUE,             -- platform-unique identifier
  dsa_category TEXT NOT NULL,
  user_notification_state TEXT NOT NULL DEFAULT 'pending',
  submitted_to_dsa_db BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE safety_appeals (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES safety_decisions(id),
  appellant_id TEXT NOT NULL REFERENCES users(id),
  grounds TEXT NOT NULL,
  new_evidence_ids TEXT[],
  independent_reviewer_id TEXT REFERENCES users(id),
  deadline TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN
    ('submitted','under_review','upheld','overturned','withdrawn')),
  outcome_reason TEXT,
  remedy TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE safety_audit_events (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES safety_cases(id),
  actor_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_safety_cases_status_severity ON safety_cases(status, severity DESC);
CREATE INDEX idx_safety_cases_sla_deadline ON safety_cases(sla_deadline) WHERE status IN ('open','under_review');
CREATE INDEX idx_safety_notices_reporter ON safety_notices(reporter_id);
CREATE INDEX idx_safety_audit_case ON safety_audit_events(case_id, created_at);
```

Do not copy prohibited content into every table. Use access-controlled evidence references, legal holds and retention rules.

---

## 7. Detection and decision architecture

```text
user report / media scan / rules / model / partner notice
  -> normalize notice (canonical reason from registry)
  -> deduplicate and link entities
  -> severity + exposure + vulnerability + deadline priority
  -> operator case
  -> policy-bound decision
  -> transactional enforcement + notifications + appeal eligibility
  -> DSA statement-of-reasons + transparency export
  -> outcome metrics
```

Models may classify, retrieve similar cases, summarize long threads and prioritize. They must not invent evidence or silently make irreversible high-impact decisions. Store the exact model/version, input-evidence references, output, confidence, policy mapping and served decision. Use shadow evaluation and sampled quality review before expanding automation.

### 7.1 Priority model (replaces TS-15)

Do not create a mysterious composite score that operators cannot reason about. Compute a versioned priority tuple:

```text
priority_v1 = (
  emergency_or_legal_deadline,       -- boolean: 1 if emergency/legal SLA
  involves_minor_or_vulnerable,      -- boolean: 1 if minor/vulnerable user
  credible_imminent_harm,            -- 0-3: assessed immediacy of physical/financial harm
  exposure_virality,                 -- 0-100: normalized exposure growth rate
  severity_class,                    -- 1-4: from safety_reason_codes
  trusted_notifier,                  -- boolean: 1 if trusted flagger/law enforcement
  repeat_offender_or_linked_cases,   -- 0-N: count of linked cases for same subject
  oldest_due_time                    -- timestamp: for tie-breaking (FIFO within same priority)
)
```

Order: `emergency DESC, minor DESC, harm DESC, virality DESC, severity DESC, trusted DESC, linked DESC, due_time ASC`.

Confidence decides automation eligibility within a policy; it does not decide who gets helped first. SLA clocks pause only for explicit states such as `awaiting_reporter_evidence`, with a recorded reason.

### 7.2 Automation ladder

1. **Offline benchmark** on adjudicated, policy-specific data — measure per-policy precision/recall.
2. **Shadow only** — no product effect; compare model output to human decisions.
3. **Queue prioritization** — model output informs priority and routing but not action.
4. **Narrow auto-approval** for low-harm, high-precision cohorts with sampling audit.
5. **Narrow temporary restriction** only for a separately approved emergency policy (e.g. CSAM hash match → immediate removal + human review).
6. **Permanent restriction** remains human-supervised and appealable.

Required metrics are per policy and cohort: precision, recall, false-positive rate, false-negative severity, calibration, coverage, provider unavailable rate, appeal/reversal rate and time-to-intervention. One global accuracy number is unacceptable.

---

## 8. Failure-state matrix

| Failure | User truth | System action | Operator action |
|---|---|---|---|
| Evidence upload succeeds; notice insert fails | `Report not sent`; retain draft references temporarily | no case; cleanup TTL | none unless repeated platform fault |
| Notice created; acknowledgement notification fails | receipt still returned | outbox retry | notification exception queue |
| Provider unavailable | `Checking content` where publication waits | moderation pending, retry/backoff | provider incident only after threshold |
| Enforcement partially applies | do not claim completed restriction | `enforcement_pending`, compensate/retry | urgent exception case |
| Appeal submitted during outage | durable local/server operation ID; unknown outcome if ambiguous | idempotent poll | appeal queue after recovery |
| Evidence removed by author | preserve governed snapshot/hash if lawful | case evidence remains under retention/legal hold | access only by purpose |
| Duplicate report retry | same persisted receipt ID (fixes TS-06) | no duplicate case/economic effects | dedupe/link for pattern only |
| Mass malicious reports (brigading) | targets remain protected from brigading | reporter-rate/reputation controls; case dedupe | inspect coordinated abuse |
| Model evasion (adversarial perturbation) | content held pending review | provider fallback + human review | quality audit on evasion patterns |
| DSA transparency DB submission fails | user already notified; no user-visible impact | retry with backoff; alert compliance | compliance queue after threshold |
| Ofcom risk assessment overdue | no user-visible impact | alert compliance team | mandatory review before significant change |
| CSAM detection (if implemented) | immediate removal; user redirected to crisis resources | preserve per legal obligation; report to NCMEC/UK authorities | restricted-access reviewer only |

---

## 9. User experience and anti-AI policy

### 9.1 Reporter flow

- Start from the exact object being reported; preserve its reference automatically.
- Ask one high-signal category question, then only conditional details needed for action.
- Separate `Report illegal content` where legally required, but explain it in plain language.
- Show receipt ID, submitted time, safety actions available now (block/mute/leave), and outcome state.
- Never promise removal. Say `Received`, `Under review`, `Action taken`, or `No violation found` with an appeal route where applicable.
- **Fix TS-04:** evidence filmstrip must show `Uploading` → `Attached` → `Submitted` states; the submit call must include finalized media asset IDs.
- **Fix TS-05:** replace "reviewed within 24 hours" with truthful, measured language: `Received at 14:32. We'll review and let you know the outcome.`

### 9.2 Affected-user flow

- One restrained decision screen, not a red "danger" card.
- State what was restricted, the policy/legal rule, whether automation was used, duration, consequences and appeal deadline.
- Keep primary `Appeal decision` visible; destructive or legal escalation is secondary.
- The automated-means disclosure is readable text, not an icon tooltip (DSA Article 17 requirement).

### 9.3 Operator surface

- Case/evidence is the dominant object. Do not build equal rounded statistic cards.
- Persistent narrow metadata rail: severity, SLA, subject history, policy and linked cases.
- Evidence comparison, decision composer and audit history remain distinct work modes.
- Blur/redact sensitive media by default; require a reasoned reveal that is audited.
- No card-on-card composition; flat canvas with hairline separators.
- One radius grammar, one icon family, one press feedback.
- Queue shows priority tuple components, not a single opaque score.

---

## 10. Operating model

Define queues and on-call ownership for:

1. **illegal goods/scams** — priority offences including fraud, counterfeit, scams;
2. **harassment/hate** — harassment, hate speech, cyberflashing (new UK priority offence);
3. **sexual safety/CSAM** — restricted access, specialized legal/operational design, hash-matching/provider partnerships where lawful, no generalized developer access, trained reviewers;
4. **self-harm** — suicide and self-harm (new combined UK priority offence), crisis resources;
5. **IP/counterfeit** — intellectual property, counterfeit goods;
6. **commerce disputes** — marketplace-specific disputes, refund/return abuse;
7. **emergency/law-enforcement requests** — time-bounded legal requests.

Establish severity definitions, handoff rules, regional coverage, wellness controls for reviewers, calibrated QA sampling and escalation playbooks.

Child-safety material needs specialized legal and operational design: restricted access, preservation/reporting obligations by jurisdiction, hash-matching/provider partnerships where lawful, no generalized developer access, and trained reviewers. Legal counsel must validate the exact NCMEC/UK/EU obligations before launch.

---

## 11. Delivery plan

### Phase 0 — truthful closure (3-5 engineer-days)

- Keep placeholder model disabled and remove any production claim of AI moderation.
- **Fix TS-10:** production startup must reject mock/unknown moderation provider.
- **Fix TS-05:** remove 24-hour promise until measured, staffed and policy-backed.
- Inventory all enforcement paths and ensure each has a policy version, reason and reversal path.
- Make high-severity reports alert the duty queue without waiting for batch triage.

### Phase 1 — unified cases and user rights (8-12 engineer-days)

- **Fix TS-03:** introduce `safety_reason_codes` registry; reconcile UI/API/DB taxonomy.
- **Fix TS-04:** bind finalized media asset IDs to the notice transaction.
- **Fix TS-06:** `ON CONFLICT ... DO UPDATE/SELECT` returning the actual persisted row.
- Add canonical case, evidence, decision, reason and appeal migrations (`153_safety_case_graph.sql`).
- Normalize existing report tables into the case service through an outbox.
- Ship report receipts, `My reports`, decision notices and appeals.

### Phase 2 — operator workstation (10-15 engineer-days)

- Add fine-grained roles, least-privilege evidence access, audit and workload ownership.
- Build case queues with priority-tuple ordering (replaces TS-15), evidence viewer, policy-bound decision composer and SLA escalation.
- Require second approval for permanent account deletion/high-impact irreversible decisions.
- **Fix TS-12:** one policy decision service controls every content restriction.
- **Fix TS-14:** replace `console.info` with durable `safety_audit_events`.

### Phase 3 — assisted triage (8-12 engineer-days plus provider setup)

- Integrate provider/model adapters behind a model registry and shadow ledger.
- Provider gateway: OpenAI omni-moderation (text), Rekognition + Custom Moderation (images/video), Sightengine (live/audio/deepfake).
- **Fix TS-13:** server resolves model ID/version from registry; callers submit content/purpose only.
- **Fix TS-16:** extend triage to video, text, chat, profile and composite cases.
- Measure per-policy precision/recall, subgroup quality, reversal rate and time-to-action.
- Permit narrowly scoped auto-actions only after documented thresholds and rollback drills.

### Phase 4 — governance and transparency (5-8 engineer-days plus legal review)

- Generate DSA-compatible statement-of-reasons export and submit to DSA Transparency Database.
- Build Ofcom risk-assessment records (18 priority offences including cyberflashing and self-harm).
- Run quarterly policy calibration, appeal audits and red-team abuse exercises.
- Publish meaningful transparency metrics without exposing victims or evasion details.

---

## 12. Acceptance gates

- Every report yields a durable receipt, case ID and eventual outcome state.
- Every restriction links to a versioned policy, evidence references, decision maker and reversal capability.
- High-severity cases outrank low-confidence low-harm cases (priority tuple replaces confidence-ascending).
- Appeals cannot be decided solely by the same automated output or original reviewer.
- Operator access is purpose-scoped, time-bounded where appropriate and fully audited.
- Model outage never becomes silent approval or fabricated safety.
- Mock provider cannot be selected in production (TS-10 fixed).
- Evidence media is bound to the notice transaction and visible to moderators (TS-04 fixed).
- Conversation report retries return the actual persisted ID (TS-06 fixed).
- Report taxonomy is consistent across UI, API and database (TS-03 fixed).
- One policy decision service controls every content restriction (TS-12 fixed).
- DSA statement-of-reasons export matches the DSA Transparency Database schema.
- Ofcom risk assessment covers 18 priority offences including cyberflashing and self-harm.
- Tests cover duplicate reports, coordinated reporting abuse, partial enforcement failure, appeal reversal and notification failure.
- Native validation covers reporting from listing/profile/chat/creator media, large text, screen reader, offline retry and blocked-user safety.

---

## 13. Test and validation programme

### Contract tests

- Every mobile reason code inserts successfully in a clean migrated database.
- Evidence IDs survive submit and cannot bind another user's/private/unfinalized media.
- All three subject routes return the same canonical status vocabulary.
- Idempotent retries return the identical notice ID, including concurrent retries.
- DSA statement-of-reasons export validates against the DSA Transparency Database schema.

### State/property tests

- Decision/enforcement/notice/appeal transitions reject illegal edges.
- A case can be rebuilt from append-only events.
- Appeal reversal restores all affected projections or creates a visible exception.
- No model/provider failure produces `approved`.

### Abuse tests

- report brigading, self-report, blocked-user report, deleted content, edited content, forged message ID, malicious evidence, oversized details and idempotency collision;
- moderator conflict, double decision, stale resource version, unauthorized evidence reveal and compromised admin;
- adversarial image/text perturbation and policy-evasion language without disclosing detection thresholds;
- DSA transparency DB submission failure and retry;
- Ofcom risk-assessment overdue alert.

### Native EAS matrix

- Android/iOS, small/large phone, light/dark, large text, screen reader, reduced motion;
- offline before upload, loss during upload, loss after submit, background/resume and process death;
- keyboard/no keyboard, bottom-nav occlusion and safe-area/cutout;
- report from listing, profile, one message, group, creator media, auction and live surface.

---

## 14. Observability and operating SLOs

Initial internal objectives — validate with staffing and legal policy before user promises:

- notice API availability ≥ 99.95%; duplicate-effect rate = 0;
- evidence-binding integrity = 100%; orphan-finalized evidence cleanup within 24h;
- emergency/minor-safety alert dispatch p99 < 60 seconds;
- provider-unavailable rate and queue age segmented by modality/provider;
- decision-to-enforcement propagation p99 < 60 seconds for ordinary restrictions;
- appeal decision reversal rate and decision consistency by policy/cohort;
- operator sensitive-evidence reveal rate, duration and anomaly alerts;
- no unowned P0/P1 case; every breached SLA has an escalation event;
- DSA statement-of-reasons submission success rate ≥ 99.5%;
- Ofcom risk-assessment review cycle compliance = 100%.

These are operational targets, not UI promises. Publish only after sustained measurement.

---

## 15. Dependencies and explicit non-goals

Use PostgreSQL plus the existing transactional outbox as the source of truth. Redis may accelerate queue counters, never own reports. Object storage remains evidence storage only behind asset records. A dedicated case service module is warranted; a new database or graph database is not yet warranted. Search indexes may support operator retrieval but cannot decide enforcement.

Non-goals for P0:

- building a general-purpose "AI moderator" brand;
- automatic permanent bans;
- public moderator identities;
- copying prohibited content into analytics;
- promising a universal response time;
- a decorative admin analytics dashboard before case execution works;
- proprietary root heuristics before platform proof is correct;
- consumer trust scores/security dashboards.

---

## 16. Revised release gate

The moderation department must remain release-blocked for user-generated marketplace scale until TS-03, TS-04, TS-06, TS-10, TS-12 and TS-15 are fixed and verified live. A provider configured in EAS is not sufficient: canonical cases, evidence, decision reasons, outcome notification, appeal/recovery, DSA statement-of-reasons export and Ofcom risk-assessment records must also work.

---

## 17. Primary-source research ledger

| Source | External point used |
|---|---|
| [European Commission — Implementing Regulation on transparency reporting](https://digital-strategy.ec.europa.eu/en/library/implementing-regulation-laying-down-templates-concerning-transparency-reporting-obligations) | Harmonised templates, content categories, reporting periods, data collection from 1 July 2025, first reports due beginning 2026. |
| [European Commission — Harmonised transparency reports under the DSA](https://digital-strategy.ec.europa.eu/en/news/harmonised-transparency-reports-under-dsa-bring-enhanced-clarity-content-moderation-practices) | Standardised machine-readable template, content categories matching DSA Transparency Database, cross-tool consistency checks. |
| [DSA Transparency Database](https://transparency.dsa.ec.europa.eu/) | Statement-of-reasons submission, decision types (visibility/monetary/provision/account), territorial scope, duration, facts, automation, source, PUID. |
| [DSA Transparency Database — Statement attributes](https://transparency.dsa.ec.europa.eu/page/additional-explanation-for-statement-attributes) | Article 17(1) and 17(4) clear and specific requirements, PUID uniqueness, decision type minimums. |
| [EUR-Lex — Digital Services Act, Articles 16-22](https://eur-lex.europa.eu/eli/reg/2022/2065) | Notice-and-action, statement of reasons, internal complaint, human review of automation. |
| [European Commission — DSA guidelines, updated 2 July 2026](https://digital-strategy.ec.europa.eu/en/policies/dsa-guidelines) | 2026 scam guidance, legally meaningful reporting route. |
| [Ofcom — Online safety regulatory documents and guidance](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/online-safety-regulatory-documents) | Risk Assessment Guidance V2.0 (25 June 2026), 18 priority offences, Codes of Practice, Children's Code. |
| [Ofcom — Illegal content duties under the Online Safety Act](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/illegal-content-duties-under-the-online-safety-act) | Three-month risk assessment deadline, review before significant change, record-keeping. |
| [Ofcom — Protection of children duties](https://www.ofcom.org.uk/online-safety/protecting-children/protection-of-children-duties-under-the-online-safety-act) | Children's risk assessment, protections, record-keeping. |
| [Ofcom — New priority offences: cyberflashing and self-harm](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/statement-new-priority-offences-serious-self-harm-and-cyberflashing) | December 2025 new priority offences, combined 'suicide and self-harm', cyberflashing as separate kind. |
| [Ofcom — Risk Assessment Guidance V2.0 PDF](https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/updates/risk-assessment-guidance-and-risk-profiles.pdf) | V2.0 published 25 June 2026, 18 kinds of priority illegal content. |
| [OpenAI — Moderation guide](https://developers.openai.com/api/docs/guides/moderation) | omni-moderation-latest, text+image, free, 13+ categories, per-category scores. |
| [OpenAI — Moderations API reference](https://developers.openai.com/api/reference/resources/moderations/) | Category fields: harassment, hate, illicit, self-harm, sexual, violence and sub-categories. |
| [AWS Rekognition — Content Moderation](https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html) | Image/video moderation, Custom Moderation adapters, A2I human review, hierarchical taxonomy. |
| [AWS Rekognition — Content Moderation product page](https://aws.amazon.com/rekognition/content-moderation/) | 95% unsafe content flagging, custom labels, brand safety, geographic rules. |
| [Sightengine — Content Moderation docs](https://sightengine.com/docs/moderate) | Image, video, live-stream, text, audio, AI-generated detection, deepfake detection. |

Technical claims were checked against official regulator/platform sources available on 25 August 2026. No competitor marketing source is used as a regulatory requirement.

---

## 18. Final status

**PARTIAL — BACKEND CAPABILITY BLOCKER.** Useful report and triage primitives exist, but unified cases, rights/appeals, operator controls, production detection, DSA statement-of-reasons compliance and Ofcom risk-assessment records remain P0. The regulatory clock is ticking: DSA harmonised transparency reports are due, Ofcom V2.0 risk assessments must cover 18 priority offences including the new cyberflashing and self-harm categories, and the canonical case graph does not yet exist in the database.
