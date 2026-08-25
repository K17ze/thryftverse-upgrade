# ThryftVerse Marketplace Operations and Admin Console — Implementation-Grade P0 Dossier (Upgraded)

**Research cut-off:** 25 August 2026 (includes FCA operational resilience insights one year on March 2026, NCSC Zero Trust Network Access guidance May 2026, NCSC ZTNA design blog May 2026, NIST SP 800-63B-4 final July 2025, FCA PS25/12 Supplementary Regime in effect 7 May 2026, CMA direct enforcement one-year report April 2026)
**Repository evidence snapshot:** f82f74a54be79a1721017380ddd5472d856f1679 plus the inspected working tree on `feat/product-detail-contract-media-device-closure`
**Decision:** **DO NOT expose the current high-impact admin/ops mutations to a production workforce or call the current system an operations console.**
**Scope:** workforce identity, authorization, approvals, immutable audit, cases/queues, customer-data access, money operations, trust and safety, seller review, auctions, 1ZE controls, webhooks/DLQ and incident response.
**Document status:** implementation blueprint and hard release-gate dossier. No product code was changed.
**Inspector identity:** senior FAANG mobile/full-stack architect, 20 years, top-level mobile app architecture + front-end UI/UX engineering + back-end design. Anti-AI-design policy enforced throughout.

## 0. What changed in this upgrade

This is a deepened re-issue of the 25 August 2026 dossier. Every codebase claim was re-verified by direct file inspection. The following material is new or substantially expanded:

1. **FCA operational resilience — one year on (March 2026)** — the FCA published insights and observations on the operational resilience framework one year after the transition period ended on 31 March 2025. Firms in scope (including payment institutions and e-money institutions) must have completed mapping and testing to remain within impact tolerances for each important business service. The FCA observed that firms have invested in data vaulting, immutable backups, standby data centres, and new processing centres. Impact tolerances have been primarily set as time-bound tolerances, but the FCA recommends using other metrics to complement this (types of customers, values and types of transactions, criticality of transaction, estimated losses). ThryftVerse's operations console must be part of the operational resilience mapping — if the console is unavailable, can the firm still process payments, safeguard funds, and handle complaints within impact tolerances?
2. **NCSC Zero Trust Network Access (ZTNA) guidance — May 2026** — the NCSC published new ZTNA guidance for architects, security practitioners, and technical decision makers. Key points: ZTNA is often deployed but still built on old trust assumptions (network location as primary trust signal); the guidance explains how to design ZTNA aligned with zero trust principles; it covers signals and policy engines, organisational and technical foundations, design requirements, and a reference architecture. ThryftVerse's workforce access must not rely on network location as a primary trust signal — the current shared-token approach is exactly the kind of "old trust assumption" the NCSC warns against.
3. **NCSC ZTNA design blog — May 2026** — "ZTNA is widely deployed, but often still built on old trust assumptions. New NCSC guidance explains how to design ZTNA architectures aligned with zero trust principles." This directly applies to ThryftVerse's admin console: a VPN or network restriction alone is not zero trust. Every request must be verified based on identity, device, context, and policy.
4. **NIST SP 800-63B-4 — final July 2025** — the finalized authentication guidance confirms that manually entered OTP is not phishing-resistant and WebAuthn can be. This reinforces the requirement for WebAuthn/FIDO2 phishing-resistant MFA for all console access (§6.2). The current shared-token approach is below even AAL1.
5. **FCA PS25/12 Supplementary Regime — in effect 7 May 2026** — the safeguarding regime requires daily checks, monthly reporting, and annual audits. The operations console must support these obligations: daily safeguarding reconciliation must be operable from the console, monthly reports must be generated, and annual audit evidence must be retrievable. The current internal-only reconciliation (PAY-10) cannot meet these requirements.
6. **CMA direct enforcement — one year on (April 2026)** — the CMA's direct enforcement regime under the DMCC Act 2024 has been operational for one year with £4.7M in fines. The operations console must support compliance with consumer protection law: refund processing, drip-pricing prevention, fake-review enforcement, and transparent return policies. Operator actions that affect consumer-facing terms must be auditable and policy-controlled.
7. **Deeper codebase verification** — the audit log helper's fire-and-forget behaviour was re-confirmed at `auditLog.ts:38-39` ("This function never throws — errors are logged but do not block the calling operation") and `auditLog.ts:62-72` (catch block only warns). No call sites for `logAdminAction` were found outside its definition. The shared token approach at `index.ts:720-755` was re-confirmed. The payout sweep schema error at `index.ts:28168` (`code` vs `account_code`) was re-confirmed. The one-admin review-and-approve payout path at `index.ts:29518-30015` was re-confirmed.
8. **Deeper operational resilience mapping** — ThryftVerse's operations console is a critical dependency for important business services. If the console is unavailable, can the firm still: process payments, safeguard funds, handle complaints, process returns/refunds, respond to fraud, and meet FCA reporting deadlines? The current architecture has no console at all — all operations are performed via direct API calls with shared tokens. This is an operational resilience risk: there is no fallback, no redundancy, and no separation between the customer-facing application and the operations layer.
9. **Deeper zero-trust analysis** — the current architecture violates multiple NCSC zero-trust principles: (1) network location is implicitly trusted via shared tokens; (2) there is no device posture checking; (3) there is no per-request authorization based on identity/device/context/policy; (4) there is no separation between consumer and workforce identity planes; (5) there is no phishing-resistant authentication for privileged access. The target architecture in §6-7 aligns with NCSC ZTNA guidance.

---

## 1. Executive finding

ThryftVerse has many operational endpoints, but endpoint breadth is not an operations system. Active routes can review and settle payouts, force order state, run reconciliation, alter payout pause behavior, inspect disputes, operate auctions and 1ZE, and retry webhooks. These powers are governed mainly by a coarse admin role plus shared header tokens. There is no demonstrated production workforce application, deny-by-default permission plane, case model, maker-checker workflow, step-up authentication, durable command status or complete tamper-evident audit.

The highest-risk defects are:

1. All active authenticated traffic uses consumer-style application identities whose role vocabulary is only user, seller, moderator and admin.
2. Sensitive routes use a shared x-security-admin-token or x-platform-operator-token. Shared secrets do not identify the human, purpose, device or approval.
3. A scope library exists but no active use was found; admin:* maps broadly and is not a production authorization plane.
4. payout review, approval/rejection and force-state commands can be performed by one admin with no enforced separation of duties.
5. The audit write helper is unused in the inspected codebase and intentionally swallows failures.
6. The audit table is mutable ordinary PostgreSQL data without an append-only trigger, integrity chain, external WORM sink or complete command context.
7. No operator frontend exists in frontend/src/screens; customer mobile is the wrong trust boundary for privileged operations.
8. Extracted DLQ and ops modules include useful ideas but are unregistered, while active monolithic routes remain the production truth.
9. The active scheduled payout sweep contains schema/accounting errors, showing why dangerous commands need preview, evidence, bounded execution and approval.
10. There is no unified case/task/SLA model, so teams cannot prove ownership, reason, evidence, resolution or consumer-harm response.

The target rule is:

> Every privileged action is attributable to one verified workforce identity, authorized for one purpose and resource, constrained by policy, optionally approved by a different qualified person, executed as an idempotent command, and durably audited with its outcome.

## 2. Evidence discipline

### 2.1 Classifications

- **Verified repository fact:** directly observed in the cited file/range.
- **Engineering inference:** risk or architecture implication; validate through threat model and runtime tests.
- **Legal/policy validation required:** retention, workforce monitoring, regulated approvals and access obligations requiring counsel, compliance, HR/security and provider-contract review.

Line numbers are snapshot evidence. Search symbols after code moves.

### 2.2 Active production boundary

backend/api/src/index.ts is the canonical active composition.

- Global authentication is at index.ts:1588-1628.
- Security-admin helpers are at index.ts:720-755.
- Reconciliation/payout-pause ops are at index.ts:11615-12031.
- Payout scheduler and reserve sweeps are at 28114-28336.
- Payout admin queue/review/approve/reject are at 29350-30115.
- Force order state and stuck-payment ops are at 30117-30312.
- Payments/webhook operations are at 30448-33070.

backend/api/src/routes/ops.ts and routes/dlqAdmin.ts are not registered in the inspected index. Their existence must not be reported as active control coverage.

No admin/operator screen was found under frontend/src/screens. The only relevant support surface found is customer-facing. A production console must be a separate workforce web application with a separate origin, identity policy, deployment and telemetry.

## 3. P0 control defect register

| ID | Verified evidence | Risk | Required correction |
|---|---|---|---|
| OPS-01 | backend/api/src/lib/auth.ts:8 and role usages | Roles limited to user/seller/moderator/admin | Separate workforce identity and typed permission model |
| OPS-02 | index.ts:720-755 | ensureSecurityAdminAccess primarily validates shared token and only conditionally rejects role | Always require workforce principal, role/permission, device/session and policy |
| OPS-03 | index.ts:1588-1628 | Current global hook authenticates routes, reducing unauthenticated exposure but coupling ops to consumer auth | Separate workforce audience/issuer and route boundary |
| OPS-04 | backend/api/src/lib/permissionScopes.ts:1-135 | Scope library maps admin:* broadly; no call sites found | Deny-by-default resource/action policy enforced in middleware |
| OPS-05 | index.ts:29518-30015 | Same admin can review and approve/reject payout; reviewedBy falls back to admin_token | Maker-checker with actor inequality and qualification |
| OPS-06 | index.ts:30117 onward | Force order-state mutation exposed as direct admin operation | Policy command, preview, reason, case, approval and journal consistency |
| OPS-07 | backend/api/src/lib/auditLog.ts:36-72 | Helper promises never to throw; failures only warn; no call sites found | Audit is atomic/fail-closed for high-impact commands |
| OPS-08 | backend/api/migrations/124_audit_logs.sql; auditLog.ts:5-34 | Basic audit fields omit session, purpose, approval, before/after, command outcome and integrity | Complete immutable audit envelope and external sink |
| OPS-09 | routes/adminAudit.ts:40-130 | Audit read requires broad admin and the read itself is not audited | Separate audit.read permission and access audit |
| OPS-10 | routes/dlqAdmin.ts:48-101 | If registered, replay/purge are direct admin calls without reason/preview/approval | Safe replay command; destructive purge lifecycle |
| OPS-11 | index.ts:28161-28172 | Active payout sweep uses ledger_accounts.code and credits only | Preview/validation/canary plus canonical balance service |
| OPS-12 | index.ts:11650-11654 | Reconciliation subtask failure is nonfatal | Partial/incomplete status, incident/case and payout policy |
| OPS-13 | index.ts:29615 and 29965 | Attribution can fall back to string admin_token | Never execute without person-level principal ID |
| OPS-14 | no admin frontend under frontend/src/screens | No controlled operator interaction layer | Dedicated console with guarded routes and state coverage |
| OPS-15 | shared x-platform-operator-token on active 1ZE ops routes | Any authenticated role possessing secret may reach local guard | Person-level permission; service credentials only for services |

## 4. Current capability matrix

| Domain | Read capability | Mutation capability | Current control quality | Flagship requirement |
|---|---|---|---|---|
| Payments | Intent/reconciliation reports | manual confirm, refund/retry | Broad admin/shared token; unsafe money semantics | Payments ops permission, command status, maker-checker |
| Payouts | queue/report/pause/stuck | review, approve, reject, force/sweep | One-person execution; transfer labelled paid | Risk queue, destination reveal control, dual approval |
| Orders | status/stranded | force state/refund/release | Direct override | Order case and invariant-aware compensating command |
| Disputes | status/evidence | evidence/decision paths | Partial | Deadline queue, liability/evidence trail |
| Seller onboarding | first-sale review | approve/reject | Persisted reviewer metadata | Qualified reviewer, reason taxonomy, QA sample |
| Trust/safety | fragmented | moderation capabilities | Coarse moderator/admin | Case-linked policy decision and appeal |
| 1ZE | operational endpoints | cluster/reconciliation controls | shared operator token | Treasury/market permission and legal kill switch |
| Auctions | monitoring/states | admin operations | coarse admin | Market-ops role, circuit breakers, surveillance |
| Webhooks | retry sweep | replay | invalid retry in active path | Inbox case, safe replay, provider retrieve |
| DLQ | module has stats | replay/purge | module inactive; unsafe if enabled | Preview, bounded replay, approval, retention |
| Audit | query/statistics route | helper exists | writer unwired/fail-open | Immutable complete audit |
| Support | customer support screen | no workforce case desk | missing | Omnichannel case/identity/evidence tooling |
| IAM | consumer JWT plus roles | shared tokens | insufficient | Workforce IdP, WebAuthn, JIT, device posture |

## 5. Threat and failure model

The console must be designed for:

- stolen admin password/session;
- phishing-resistant authenticator absent or downgraded;
- leaked shared header token;
- compromised workforce device or browser extension;
- malicious insider;
- accidental high-value action;
- two colluding or coerced operators;
- confused deputy across customer and admin audiences;
- stale entitlements after role/team change;
- support impersonation/social engineering;
- mass data export;
- payout destination reveal and change fraud;
- replay of a successful command after response loss;
- partial DB commit or provider unknown outcome;
- operator retry against an already succeeded webhook/job;
- audit database write failure or tampering;
- provider outage and queue surge;
- compromised service account;
- emergency access used without review;
- AI-generated suggestion treated as authoritative action.

No UI confirmation dialog repairs a missing server-side control.

## 6. Target workforce identity architecture

### 6.1 Separate identity plane

Use a dedicated workforce IdP tenant/application and API audience. Consumer access tokens must be cryptographically unacceptable to ops routes even if their database role says admin.

Required workforce principal:

- workforce_user_id, IdP subject and employment/contractor status;
- team, region, legal entity, jurisdiction and data-residency constraints;
- permissions/roles and effective time;
- authentication assurance and last step-up time;
- managed device ID/posture;
- session ID, network zone and risk score;
- training/certification flags for money, safety or regulated tasks;
- delegation/on-call record if applicable.

### 6.2 Authentication

- WebAuthn/FIDO2 phishing-resistant MFA required for all console access.
- New device, unusual network, impossible travel or session-risk changes require reauthentication.
- Step-up required immediately before payout approval, journal adjustment, destination reveal, data export, account recovery, DLQ purge and break-glass.
- Session idle and absolute lifetime are shorter for privileged surfaces.
- No SMS/OTP downgrade for privileged production access.
- Managed device posture and encrypted storage are required for high-impact permissions.

NIST SP 800-63-4, finalized in 2025, defines current authentication assurance guidance; its authenticator guidance explains that manually entered OTP is not phishing-resistant and WebAuthn can be.

### 6.3 Joiner/mover/leaver and access reviews

- HR/identity source provisions baseline team membership.
- Production entitlements are JIT and time-bound, not permanent by default.
- Manager and control-owner approve high-risk grants.
- Leaver disablement propagates within five minutes; active sessions and approvals are revoked.
- Role/team change recalculates entitlements immediately.
- Quarterly certification for normal access; monthly for high-risk money/data permissions.
- Dormant privileged accounts automatically disable.
- Service identities have no interactive login and use workload identity, not shared tokens.

## 7. Authorization and policy

### 7.1 Permission grammar

Use resource.action qualifiers, for example:

- payments.intent.read
- payments.refund.propose
- payments.refund.approve
- payouts.read_masked
- payouts.destination.reveal
- payouts.approve.low_value
- payouts.approve.high_value
- ledger.adjust.propose
- ledger.adjust.approve
- reconciliation.break.resolve
- reconciliation.close
- orders.override.propose
- safety.case.decide
- customer.pii.reveal
- audit.read
- access.manage
- dlq.replay
- dlq.purge
- incident.breakglass

admin:* is prohibited in production human entitlements.

### 7.2 Policy inputs

Authorization evaluates:

- principal/team/qualification;
- action/resource and legal entity;
- amount/currency and risk tier;
- case purpose and reason;
- creator/requester identity;
- whether the principal has seen disqualifying PII;
- device/session assurance;
- time-bound grant;
- approval requirements;
- incident mode;
- data residency and customer vulnerability marker;
- current reconciliation/payout pause state.

Policy is deny-by-default and evaluated server-side on every read and command. UI hiding is usability, not security.

### 7.3 Baseline separation-of-duty matrix

| Command | Proposer | Approver | Executor | Constraints |
|---|---|---|---|---|
| Refund within policy | support/payments ops | automatic policy or payments lead over threshold | service command | proposer cannot alter policy evidence |
| High-value refund | payments ops | separate senior payments approver | service command | different human; fresh step-up |
| Payout approval | payouts ops | separate risk/treasury approver above threshold | payout worker | no self-approval; destination fingerprint |
| Journal adjustment | finance ops | finance controller | ledger service | reversal/repost only |
| Reconciliation close | reconciler | control owner for open material breaks | close service | incomplete imports block |
| Force order correction | support ops | commerce lead if financial effect | order command | linked compensation/journal |
| DLQ replay | service owner | automatic for safe class or second approver for money | worker | dry-run/idempotency check |
| DLQ purge | service owner | security/data owner | retention job | no unresolved/legal-hold records |
| PII reveal/export | case owner | policy/manager for bulk | access gateway | watermark, reason, audit |
| Break-glass | incident commander | pre-authorized emergency policy | named human | short TTL and mandatory after-review |

Actor inequality is enforced by the database/policy service, not UI.

## 8. Privileged command state machine

All high-impact actions become command records:

draft → proposed → awaiting_approval → approved → queued → executing → succeeded

Branches:

- draft/proposed/awaiting_approval → cancelled/rejected/expired
- executing → unknown_outcome → investigating → succeeded/failed/compensated
- queued → superseded when resource version changed
- succeeded → compensated only through a linked new command

Required fields:

command_id, command_type, resource_type/id, expected_resource_version, idempotency_key, request_hash, proposer, case_id, reason_code, freeform_note, before_snapshot_hash, effect_preview, risk_tier, required_approval_policy, approver(s), approval_time, step_up_session, state, executor, provider_operation_id, result/effect hash, error code, created/expires/completed times.

Rules:

- approval binds exact request hash, amount, destination fingerprint and expected version;
- edits after approval invalidate approval;
- duplicate command key returns prior command state;
- lost HTTP response is checked by command ID;
- unknown outcome is never succeeded;
- command executes only if resource version and policy still match;
- terminal records immutable.

## 9. Audit design

### 9.1 Current evidence

backend/api/src/lib/auditLog.ts:36-72 explicitly says logging never throws; failure only emits a warning. Repository search found no caller of logAdminAction outside its definition. routes/adminAudit.ts reads/stats exist, but reads are broad-admin and not self-audited. Migration 124 supplies a partitioned ordinary table without tamper chain, WORM export or append-only trigger.

This is effectively an audit viewer without a trustworthy event source.

### 9.2 Required envelope

Every authentication, authorization, data read/reveal/export, command proposal/approval/execution, policy change, access change and break-glass event records:

- event_id and event_version;
- occurred_at and recorded_at;
- principal type/id, workforce session, IdP subject and impersonation/delegation;
- device ID/posture, source IP/network, user-agent hash;
- action, resource type/id/legal entity;
- case ID, purpose and reason;
- authorization policy ID/version/decision and matched grants;
- approval chain and step-up assurance;
- command/idempotency/request/trace IDs;
- before/after/effect hashes with safely redacted snapshots;
- outcome, error code and unknown flag;
- previous_event_hash and event_hash;
- schema version and retention class.

Do not place raw secrets, payment credentials, government IDs or full message bodies in audit metadata.

### 9.3 Durability and integrity

- High-impact command transaction writes domain state and an audit/outbox record atomically. If that fails, command fails closed.
- Low-risk reads can buffer only if loss budget is explicit and local spool is encrypted/durable.
- Append-only database permissions and triggers reject update/delete.
- Stream to a security-owned, immutable/WORM destination separate from the application database.
- Daily signed checkpoint anchors chain roots; monitoring detects gaps, duplicates, sequence anomalies and export lag.
- Audit access itself is audited and separately permissioned.
- Clock synchronization and source time quality are monitored.
- Retention and legal-hold policy are approved; partition deletion requires governed retention command.

NCSC guidance says security events and administration activities should be logged and monitored; ICO accountability guidance emphasizes least privilege and activity records. These are control references, not proof the proposed design alone satisfies law.

## 10. Case, queue and task model

### 10.1 Why cases are the operating backbone

A row in a payout_requests table is not a work item. A case supplies purpose, ownership, SLA, evidence, communication, decisions and review across domains.

Target entities:

- ops_cases: type, subject, legal entity, severity, consumer-harm score, status, owner/team, SLA, source, policy version.
- ops_case_entities: links to users, orders, listings, payments, payouts, disputes, auctions, devices and provider objects.
- ops_tasks: assigned team/person, skill requirement, state, due time, dependency.
- ops_evidence: source, immutable object reference/hash, sensitivity, retention/legal hold.
- ops_decisions: policy, outcome, reason taxonomy, explanation, decision-maker.
- ops_communications: channel, template/version, consent, delivery result.
- ops_approvals: exact command hash, approver, qualification, outcome, expiry.
- ops_notes: append-only authored notes; corrections linked, never overwrite.
- ops_tags: controlled taxonomy, not arbitrary color labels.

### 10.2 Case state machine

new → triaged → assigned → investigating → awaiting_customer/provider/internal → ready_for_decision → resolved → closed

Branches:

- any nonterminal → escalated
- resolved/closed → reopened with reason
- duplicate → linked_duplicate, never silently deleted

SLA clocks pause only for approved states and retain both wall-clock and business-clock time. Vulnerable-customer and financial-harm cases get explicit priority policy.

### 10.3 Queue assignment

Route by permission, skill, legal entity, language, region, conflict-of-interest, amount, risk and workload. Operators cannot cherry-pick high-value or celebrity cases. Assignment/reassignment is audited; bulk actions require bounded selection and preview.

## 11. Console information architecture

Build a dedicated desktop-first web console:

1. **Work queue:** assigned cases/tasks, SLA, harm/value, dependency, no decorative dashboard cards.
2. **Universal search:** exact identifiers first; fuzzy customer search permission-gated and masked.
3. **Case workspace:** chronological evidence, linked entities, customer contact, decisions and tasks.
4. **Money operations:** payments, refunds, disputes, ledger trace, payouts and reconciliation.
5. **Trust and safety:** reports, seller/listing review, appeals and enforcement history.
6. **Market operations:** auctions, co-own/1ZE and circuit-breaker status, legally scoped.
7. **System operations:** webhook inbox, jobs, DLQ, provider health and deploy/version context.
8. **Audit and access:** read-only investigation, access reviews, break-glass reviews.

Navigation is permission-derived. A route must still deny server-side if manually entered.

## 12. Anti-AI operator interaction specification

The console should look and behave like a serious workbench, not a generated admin template:

- Primary composition is queue + evidence + action rail, not a grid of equal rounded cards.
- Dense but readable tables expose 8–15 useful rows at normal desktop height.
- Flat canvas, hairlines and restrained selection states; at most one dominant non-data panel above fold.
- Customer media is real evidence, not decorative background.
- One icon family; 20–24 px navigation glyphs; transparent hit areas; no grey circles around every action.
- Status uses text and icon, never colour alone.
- Type system uses at most three sizes per workspace.
- Masked data remains masked until a reason-bound reveal; revealed content is visibly watermarked with operator/session.
- Dangerous actions live in a consistent right action rail, show effect preview, and never move between screens.
- Confirmation restates exact effect: “Refund £320.00 to Visa •••• 4242; seller liability decreases £286.40”, not “Are you sure?”
- Success appears only when command status is terminal; unknown gets a persistent Check result action.
- Empty/filter-empty/offline/partial/provider-delayed/permission-denied states are authored.
- Keyboard navigation, focus order, large text, screen reader labels and non-pointer operation are required.
- AI may summarize evidence or suggest next checks, but is visually labelled as a proposal with citations. It cannot approve, execute, change policy or hide source evidence.

### 12.1 Key screen contracts

#### Work queue

Columns: urgency, case type, amount/harm, subject, current state, waiting-on, SLA, assignee. Saved views are versioned team policy; personal filters cannot alter assignment.

#### Money case

Header: truthful status, amount/currency, customer/seller, provider, age, legal entity. Body: state timeline and provider facts; journal trace; reconciliation breaks; communications. Action rail: commands permitted now with policy explanation.

#### Reconciliation run

Header: provider account, entity, currency, business date, imported-through, run completeness. Body: opening/closing equation, break table, ageing. Resolution drawer: evidence comparison, proposed adjustment, approval status.

#### Payout approval

Shows seller identity/KYC tier, amount, source balance journal, destination fingerprint and change age, velocity/risk flags, previous payouts/failures and provider capability. Approver cannot see an enabled button until policy and fresh step-up pass.

#### System job/DLQ

Shows sanitized payload schema, source command, attempts/errors, side-effect ledger, idempotency status and dry-run result. Replay executes as a command; purge is never a row-level convenience button.

## 13. Domain workflow specifications

### 13.1 Refund

Support creates case/request → policy computes eligibility → payments operator proposes exception if needed → separate approver above threshold → idempotent refund operation → provider inquiry/webhook → journal → customer communication → reconciliation.

Operator never types arbitrary terminal status.

### 13.2 Payout

Request enters risk queue → destination and profile evidence → reservation journal → threshold-based approval → payout worker submits → provider/bank state → terminal journal → notification → reconciliation.

Destination changes impose cool-off/reverification policy. Reveal and approval are distinct permissions.

### 13.3 Order correction

Force-state becomes ProposeOrderCorrection. Preview lists inventory, shipment, seller release, refund, commission and notifications. If financial effects exist, linked money commands/journals must succeed or the correction is not terminal.

### 13.4 Seller and listing enforcement

Report → evidence preservation → policy classification → action proposal → decision → notification → appeal. Enforcement history cannot become an unexplained badge. Bulk enforcement has sampling/second approval and rollback plan.

### 13.5 Auction/market intervention

Market pause, bid invalidation, auction cancellation and settlement correction require market-ops permission, surveillance evidence, bounded scope, effect preview and immutable decision. Circuit breakers are automated policy with explicit human override audit.

### 13.6 1ZE/co-own

Treasury/market controls are isolated from ordinary admin. Every supply, parity, custody or redemption operation ties to legal-entity authority, money journal, reconciliation and kill switch. Shared x-platform-operator-token is not acceptable for humans.

### 13.7 Webhook/DLQ replay

Inspect sanitized event → retrieve authoritative provider object → dry-run domain command/posting key → prove prior success absent/present → approve if money-affecting → bounded replay → observe result. Do not recreate webhook signatures or blindly move a job.

## 14. API and schema blueprint

### 14.1 Route boundary

Use a separate hostname and API prefix, such as ops.thryftverse.internal and /ops/v1. Gateway validates workforce issuer/audience and device/session claims. Consumer JWTs are rejected before application handlers.

Core APIs:

- GET /ops/v1/me/effective-permissions
- GET /ops/v1/work-queues/:id/cases
- POST /ops/v1/cases
- POST /ops/v1/cases/:id/assign
- POST /ops/v1/cases/:id/decisions
- POST /ops/v1/commands
- GET /ops/v1/commands/:id
- POST /ops/v1/commands/:id/approve
- POST /ops/v1/commands/:id/cancel
- POST /ops/v1/resources/:type/:id/reveal
- GET /ops/v1/reconciliation-runs/:id
- POST /ops/v1/reconciliation-breaks/:id/resolutions
- GET /ops/v1/audit-events
- POST /ops/v1/breakglass-sessions

Mutation requirements: Idempotency-Key, If-Match/expectedVersion, caseId, reasonCode. High-impact commands return 202 with command status, not fabricated synchronous success.

### 14.2 Authorization schemas

- workforce_principals
- workforce_sessions
- workforce_roles
- workforce_permissions
- workforce_role_permissions
- workforce_grants with scope JSON, effective/expiry
- workforce_qualifications
- access_review_campaigns/items
- breakglass_sessions
- authorization_decisions

Do not copy consumer role into this model.

### 14.3 Commands/approvals/audit schemas

- privileged_commands
- command_approvals
- command_attempts
- command_effects
- immutable_audit_events
- audit_chain_checkpoints
- audit_export_batches

Unique constraints:

- privileged_commands(principal_scope, idempotency_key)
- command_approvals(command_id, approver_id, approval_role)
- prohibit proposer=approver where policy requires separation
- one terminal effect version per command

### 14.4 Migration sequence

1. Add workforce/case/command/audit tables without activating mutations.
2. Integrate IdP and read-only console.
3. Shadow authorization decisions against current admins.
4. Wrap one low-risk domain command with command/audit pipeline.
5. Migrate money commands in risk order.
6. Disable direct legacy admin routes at gateway and application.
7. Rotate/remove shared human tokens.
8. Migrate historical metadata to cases/audit with provenance, not invented attribution.
9. Contract legacy endpoints only after traffic and access logs prove zero use.

## 15. Data protection, privacy and legal policy

### 15.1 Verified guidance

- NIST SP 800-53 Rev. 5 includes separation of duties and least privilege control families.
- NIST SP 800-207 defines zero-trust architecture principles: no implicit trust based solely on network location.
- NIST SP 800-63-4 is current digital-identity guidance.
- NCSC guidance recommends logging and monitoring security events and administrative activity.
- ICO accountability guidance emphasizes least privilege, access controls and records.

### 15.2 Engineering policy

- Default masking for email, phone, address, DOB, identity documents, bank destination and messages.
- Field-level reveal requires active case, purpose and permission; auto-remask after short inactivity.
- Search is rate-limited and anomaly-monitored.
- No bulk export by default. Approved exports are encrypted, watermarked, expiring and download-audited.
- Production data is excluded from lower environments.
- Support notes cannot contain secrets or unnecessary special-category data.
- AI retrieval is case-scoped and redacted; prompts/outputs follow approved retention and never train a third-party model without authorization.

### 15.3 Legal/policy validation required

Counsel, DPO/privacy, HR and security must approve:

- lawful basis and employee-monitoring transparency;
- retention/erasure/legal hold for cases and immutable audit;
- cross-border workforce access and data residency;
- role conflicts and regulated approval requirements;
- customer impersonation policy;
- vulnerable-customer handling;
- law-enforcement/regulatory requests;
- AI use, automated decision constraints and human review;
- payment/e-money operational-resilience and safeguarding evidence if applicable.

## 16. SLOs, observability and incident controls

| Control/service | Initial objective | Page condition |
|---|---|---|
| Workforce auth | 99.99% availability; leaver revoke <5 min | revoke breach or auth bypass |
| Authorization | 100% ops routes covered; decision p99 <50 ms | any unprotected route |
| Audit | 100% high-impact commands; export lag <60 s | gap/hash failure |
| Command status | 99.9% non-provider commands terminal <2 min | stale/unknown age |
| Money approvals | 100% required separation | self-approval attempt/success |
| Queue SLA | ≥99% critical cases acknowledged in policy time | breach burn |
| Data reveal | 100% reason/case/audit | unattributed reveal |
| Reconciliation | 100% complete close by agreed T+1 | incomplete/shortfall |
| Break-glass | 100% reviewed next business day | expired/unreviewed |

Metrics/traces use opaque IDs and dimensions: command_type, policy_id/version, team, legal_entity, risk_tier, state, error_code. Never raw PII or secrets.

Alerts:

- authorization deny spike or permit anomaly;
- privileged action from unmanaged device;
- self-approval attempt;
- bulk reveal/search/export;
- high-value action outside shift/network profile;
- command unknown-outcome age;
- audit gap/hash mismatch/export lag;
- break-glass started/expired/unreviewed;
- dormant entitlement used;
- queue SLA/harm threshold;
- provider/reconciliation degradation.

Incident mode:

- kill switches by domain/action/legal entity;
- read-only console mode;
- revoke sessions/grants;
- freeze payouts/refunds without hiding status;
- named incident commander;
- break-glass with narrow permission/TTL;
- immutable incident timeline and consumer communication plan.

## 17. Verification and chaos programme

### 17.1 Authorization tests

- Consumer JWT, even database admin role, cannot access workforce route.
- Missing permission denies every route and field.
- Legal-entity/region/resource scope is enforced.
- Expired/revoked/JIT grant fails immediately.
- UI-hidden command also denies direct API.
- Proposer cannot approve own command.
- Approval becomes invalid after payload/resource version change.
- Service identity cannot log into console.
- Audit reader cannot execute command.

### 17.2 Command tests

- Same idempotency key/body returns same command; changed body conflicts.
- Response loss after commit is recovered through GET status.
- Executor crash before/after domain commit does not duplicate effect.
- Unknown provider result remains unknown and recoverable.
- Superseded resource version blocks stale approval.
- Compensation creates linked new command, never edits terminal history.

### 17.3 Audit tests

- Every high-impact endpoint creates complete event.
- Audit DB unavailable blocks high-impact command.
- Update/delete of audit event rejected.
- Chain verification catches mutation, omission and reordering.
- External sink outage spools within loss budget and pages.
- Audit query/reveal/export is audited.
- PII/secrets absent from event payload.

### 17.4 Case and UX tests

- loading, populated, empty, filtered-empty, partial, offline, denied, expired approval, unknown and provider-delayed states;
- large text and keyboard-only operation;
- screen-reader order and state;
- destination/PII masking and timed remask;
- queue virtualization and stable selection;
- destructive preview names exact effect;
- no success until terminal command.

### 17.5 Chaos and operational drills

- IdP outage: existing safe read strategy and no insecure fallback.
- Policy service timeout: fail closed for mutation; bounded cached reads only if approved.
- Audit sink/database outage.
- Leaver with active session and pending approval.
- Compromised operator session; bulk revocation and investigation.
- 10x webhook/dispute/refund queue surge.
- Provider outage causing unknown payout/refund.
- Kill executor during money command.
- Rotate all shared tokens and prove no human dependency.
- Break-glass during outage then mandatory review.
- Region/data-residency failover.
- Restore database and verify command/audit consistency.

## 18. Staged rollout

### Stage 0 — contain

- Inventory active admin/ops routes and owners.
- Gateway restrict by network and named accounts without treating network as authorization.
- Disable/feature-gate the riskiest manual terminal and force-state mutations.
- Rotate shared tokens; prohibit human distribution.
- Declare direct production DB mutation emergency-only and logged.

Exit: every current privileged route has an owner, temporary control and retirement path.

### Stage 1 — identity and read-only console

- Workforce IdP, WebAuthn, managed device, separate audience/origin.
- Read-only cases/search with masking and access audit.
- Deny-by-default policy middleware and route registry.

Exit: consumer credentials cannot enter; 100% read routes policy-covered.

### Stage 2 — case/command/audit kernel

- Cases/tasks/evidence; commands/approvals; atomic audit/outbox; external immutable sink.
- Migrate low-risk operations first.

Exit: failure/chain/attribution tests pass and no fallback admin_token.

### Stage 3 — money and destructive operations

- Refund, payout, reconciliation, order correction, webhook/DLQ replay.
- Maker-checker, step-up, preview and unknown outcomes.

Exit: all high-impact legacy routes disabled; live-signs prove provider/domain/audit effects.

### Stage 4 — safety/market/support expansion

- Seller/listing safety, appeals, auctions, 1ZE/co-own and customer communications.
- Qualification-based queues and QA sampling.

Exit: complete case lineage and policy/version evidence.

### Stage 5 — resilience and optimization

- Impact-tolerance mapping, severe-but-plausible exercises, access reviews, anomaly detection and capacity.
- Operator research improves ergonomics only after controls remain intact.

Rollback disables command creation, preserves read/investigation and continues command recovery. It never deletes cases/audit.

## 19. Stack decisions and non-goals

### Decisions

- Dedicated TypeScript web console; do not put privileged operations in React Native customer app.
- Separate workforce IdP application/audience with WebAuthn and device posture.
- Fastify route registry plus typed policy middleware; every route declares permission and sensitivity.
- PostgreSQL for transactional case/command truth.
- Transactional outbox to immutable security-owned audit storage.
- OpenTelemetry-style trace correlation with opaque IDs.
- Policy-as-code may use Cedar/OPA when dynamic scope complexity merits it; avoid a bespoke string wildcard system.
- Search index only for masked/searchable projections; source data remains domain systems.

### Non-goals

- No generic super-admin role.
- No shared token for human attribution.
- No microservice split solely to look enterprise.
- No spreadsheet/email as approval system.
- No direct SQL as normal operations.
- No AI autonomous execution or approval.
- No dashboard of vanity charts before case work.
- No destructive purge for convenience.
- No duplicate business logic in the console.

## 20. Hard acceptance gates

- [ ] Separate workforce issuer/audience; consumer tokens cryptographically rejected.
- [ ] Phishing-resistant MFA and managed-device policy active.
- [ ] All ops routes registered in a machine-verifiable deny-by-default permission inventory.
- [ ] No human entitlement contains admin:*.
- [ ] No shared security/operator token is used by a human.
- [ ] High-impact commands require case, reason, idempotency and expected version.
- [ ] Maker-checker enforces different qualified humans where required.
- [ ] Approval binds exact payload/effect and expires.
- [ ] Unknown outcomes are recoverable and never green.
- [ ] Audit is complete, fail-closed for high-impact commands, append-only and externally anchored.
- [ ] Audit read/reveal/export is permissioned and audited.
- [ ] PII/bank/identity data is masked with reason-bound reveal.
- [ ] Current direct payout/refund/force-state/replay paths are disabled or wrapped.
- [ ] Active versus unregistered route-module behavior is verified in runtime.
- [ ] Console covers loading, empty, filtered-empty, offline, partial, denied and failure.
- [ ] Keyboard, large text and screen-reader validation passes.
- [ ] Leaver revocation, compromised session, audit outage and provider outage drills pass.
- [ ] Legal/privacy/HR/compliance policies are approved.
- [ ] If regulated, operational-resilience mapping and impact-tolerance tests are signed off.

## 21. Primary sources

- [NIST SP 800-53 Rev. 5, release 5.2](https://csrc.nist.gov/Pubs/sp/800/53/r5/upd1/Final)
- [NIST SP 800-207 — Zero Trust Architecture](https://csrc.nist.gov/pubs/sp/800/207/final)
- [NIST SP 800-63-4 — Digital Identity Guidelines](https://www.nist.gov/publications/nist-sp-800-63-4-digital-identity-guidelines)
- [NIST SP 800-63B-4 (final, July 2025)](https://csrc.nist.gov/pubs/sp/800/63/b/4/final) | Finalized authentication guidance, AAL1-3, phishing-resistant authenticators, WebAuthn, syncable authenticators.
- [NIST SP 800-63B — Authenticators and phishing resistance](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/)
- [NCSC — Identity and access management](https://www.ncsc.gov.uk/collection/10-steps/identity-and-access-management)
- [NCSC — Zero Trust Network Access (ZTNA), May 2026](https://www.ncsc.gov.uk/collection/zero-trust/zero-trust-network-access-ztna) | New ZTNA guidance for architects, signals and policy engines, design requirements, reference architecture.
- [NCSC — Zero Trust architecture design principles](https://www.ncsc.gov.uk/collection/zero-trust/architecture-design-principles) | Eight principles for zero trust architecture, know your architecture, users, devices, services and data.
- [NCSC — Designing secure access with ZTNA, May 2026](https://www.ncsc.gov.uk/blogs/designing-secure-access-with-ztna) | ZTNA often built on old trust assumptions, network location not primary trust signal.
- [NCSC — security events should be logged and monitored](https://www.ncsc.gov.uk/collection/technology-assurance/principles-product-design-and-functionality/6-security-events-should-be-logged-and-monitored)
- [NCSC — logging and monitoring HTTP APIs](https://www.ncsc.gov.uk/collection/securing-http-based-apis/6-logging-and-monitoring)
- [NCSC — log and audit administration activities](https://www.ncsc.gov.uk/collection/secure-system-administration/log-and-audit-administration-activities)
- [NCSC — protective monitoring for privileged access workstations](https://www.ncsc.gov.uk/collection/principles-for-secure-paws/protective-monitoring-in-place)
- [CISA — phishing-resistant MFA and hardening guidance](https://www.cisa.gov/resources-tools/resources/enhanced-visibility-and-hardening-guidance-communications-infrastructure)
- [ICO — accountability, records management and security audit framework](https://ico.org.uk/for-organisations/advice-and-services/audits/data-protection-audit-framework/toolkits/accountability/records-management-and-security/)
- [FCA — Operational resilience, updated 14 July 2026](https://www.fca.org.uk/firms/operational-resilience)
- [FCA — Operational resilience insights and observations one year on, 27 March 2026](https://www.fca.org.uk/publications/good-and-poor-practice/operational-resilience-insights-observations-one-year) | One year after transition period, impact tolerances, mapping and testing, data vaulting, immutable backups.
- [FCA — PS25/12 Supplementary Regime, in effect 7 May 2026](https://www.fca.org.uk/publications/policy-statements/ps25-12-changes-safeguarding-regime-payments-and-e-money-firms) | Daily checks, monthly reporting, annual audits, CASS 10A/15.
- [CMA — Direct consumer enforcement one year on, April 2026](https://competitionandmarkets.blog.gov.uk/2026/04/17/direct-consumer-enforcement-one-year-on/) | 14 investigations, £4.7M fines, drip pricing/fake reviews/OCA priorities.

## 22. Final status

**RESEARCH COMPLETE — IMPLEMENTATION BLOCKED BY WORKFORCE IDENTITY, AUTHORIZATION, MAKER-CHECKER, COMMAND, AUDIT, CASE-MANAGEMENT AND RESILIENCE GATES.**

The current repository has useful domain endpoints, but not yet a controlled production operations platform. This dossier defines the path and the evidence required to change that verdict.

### Upgraded status (25 August 2026)

**RESEARCH DEEPENED — IMPLEMENTATION BLOCKERS UNCHANGED.** The FCA's operational resilience framework is now one year post-transition (31 March 2025), with the FCA observing that firms have invested in data vaulting, immutable backups, and standby data centres. ThryftVerse's operations console must be part of the operational resilience mapping — if the console is unavailable, can the firm still process payments, safeguard funds, and handle complaints within impact tolerances? The NCSC's May 2026 ZTNA guidance confirms that network location must not be a primary trust signal — the current shared-token approach is exactly the kind of old trust assumption the NCSC warns against. NIST SP 800-63B-4 (final July 2025) confirms that manually entered OTP is not phishing-resistant and WebAuthn is. The FCA PS25/12 Supplementary Regime (in effect 7 May 2026) requires daily safeguarding checks, monthly reporting, and annual audits — all of which need console support. The CMA's direct enforcement regime (one year, £4.7M in fines) requires consumer-protection compliance in operator actions. The codebase defects (OPS-01 through OPS-15) remain unchanged: shared tokens, no workforce identity, no maker-checker, fire-and-forget audit with no call sites, no operator frontend, and schema errors in the payout sweep. No production workforce may use the current admin/ops mutations until every gate in §20 passes.
