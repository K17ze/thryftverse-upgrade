# ThryftVerse Agentic Help & Support — Flagship Architecture and Research Report

**Research cutoff:** 25 August 2026  
**Repository snapshot:** `f82f74a54be79a1721017380ddd5472d856f1679`  
**Branch reviewed:** `feat/product-detail-contract-media-device-closure`  
**Assessment type:** code-backed product, UX, mobile, backend, AI, operations, safety and regulatory design review  
**Scope:** customer help, knowledge, order support, buyer/seller issues, payments and payouts, trust and safety, moderation appeals, auctions, Co-Own, agent tools, human handoff, operator workflow, evaluation and rollout  
**Implementation status:** research and implementation plan only; no runtime or native-device quality claim

---

## 1. Executive verdict

ThryftVerse does **not currently have an agentic customer-support system**.

It has three useful but disconnected foundations:

1. a small hard-coded Help & Support screen;
2. an order-bound support-ticket CRUD API;
3. a generic OpenAI Responses chat-agent runtime plus a device-local capability broker.

None of these is a support agent. The current product cannot hold a genuine support conversation, retrieve governed policy, inspect an order through support-safe projections, execute a support procedure, route to an operator queue, or hand a conversation to a human with continuity. The optional Intercom mobile adapter is present but has no credentials and no production consumer, so it currently resolves to a no-op.

The right target is not a chatbot placed on top of the five current FAQs. It is a **support operating system with an AI participant**:

```text
customer context
      ↓
support conversation → intent/risk routing → authoritative facts + versioned policy
      ↓                                      ↓
safe answer                         deterministic procedure
      ↓                                      ↓
confirmed resolution ← action receipt ← policy/authorization/idempotency
      │
      └─ uncertainty, user request, sensitive issue or failed procedure
                                      ↓
                         human queue + complete handoff bundle
```

### Recommended product decision

Build a **first-party Thryft Support core** and use a support vendor as a replaceable operator-inbox adapter during the first operational phase.

- ThryftVerse owns authentication, case state, order/listing/payment projections, policy versions, action authorization, evidence, audit and customer UI.
- Intercom or Zendesk may own the initial human inbox, staffing workflows and agent notifications.
- The model never owns policy and never adjudicates money, fraud, counterfeit, account suspension, moderation appeals, auction disputes or Co-Own rights.
- The model may explain, collect facts, search approved knowledge, read support-safe state, draft cases and perform tightly bounded reversible actions.
- A human is always one direct action away. When a user asks for a person, the agent hands off instead of defending its own usefulness.

### Flagship release proposition

> **Get a clear answer from ThryftVerse support, see what was checked, and reach a person without repeating yourself.**

This is a better product promise than “24/7 AI support.” It describes a user outcome, not a technology.

### Production verdict

| Dimension | Current condition | Flagship threshold | Verdict |
|---|---|---|---|
| Help knowledge | Five hard-coded FAQs and substring search | Versioned, audience-aware, cited policy knowledge | Release blocker |
| Conversation | No support message thread | Durable AI/human conversation with full states | Release blocker |
| Customer context | Order ID only on ticket creation | Auth-scoped order, listing, payment, payout, report and account projections | Release blocker |
| Procedures | None | Versioned deterministic procedures with explicit fallbacks | Release blocker |
| Support actions | None | Server-side allowlisted tools with idempotency and approval | Release blocker |
| Human handoff | No queue or operator ownership | Immediate, routed, resumable handoff with full context | Release blocker |
| Operator workflow | None | Queue, assignment, SLA, notes, response, disposition and audit | Release blocker |
| Safety | Generic bot instructions only | Threat model, least privilege, injection resistance and high-risk hard stops | Release blocker |
| Evaluation | No support eval suite | Offline policy/tool evals, shadow mode, canaries and online quality metrics | Release blocker |
| Mobile UX | Search, tickets and email entry exist | Contextual, native, transparent AI/human thread | Foundation only |

**Overall status: NOT READY FOR CUSTOMER-SUPPORT AI DEPLOYMENT.** The codebase has reusable infrastructure, but connecting the current generic bot to Help & Support would create a polished-looking trust failure.

---

## 2. What exists in the repository

### 2.1 Customer-facing help is a local FAQ surface

`frontend/src/screens/HelpSupportScreen.tsx` currently:

- defines five FAQs inside the component;
- searches with `toLowerCase().includes()` over those five entries;
- reads recent support tickets from the local Zustand store;
- routes order issues into existing resolution flows;
- presents email as the general contact path.

This is a reasonable scaffold, but it is not a knowledge system. It has no article IDs, revisions, effective dates, jurisdictions, audience permissions, ranking evidence, analytics feedback or source citations.

### 2.2 Tickets are order-bound status records, not conversations

`frontend/src/services/supportApi.ts` exposes only:

- create ticket;
- list the current user's tickets;
- list tickets for an order;
- update a ticket status.

`frontend/src/screens/SupportTicketDetailScreen.tsx:222-239` renders a static two-step timeline: “Request submitted” followed by “Awaiting review,” “Resolved” or “Closed.” There are no ticket messages, operator replies, internal notes, assignee, priority, queue, disposition, read state, evidence review events or live SLA.

The canonical database definition in `backend/api/src/db/migrations/037_support_tickets.sql` contains:

```text
id, user_id, order_id, topic_id, topic_label, details,
status(open|resolved|closed), created_at, updated_at
```

Migration `041_support_ticket_evidence.sql` only adds `evidence_media_urls`. `order_id` is non-null, so account, payout, listing, moderation, safety, accessibility and general product questions cannot become canonical support cases without pretending they belong to an order.

### 2.3 The optional human-support provider is inactive

`frontend/src/platform/support/SupportProvider.tsx` supports an Intercom adapter and reads four values from Expo configuration. `frontend/app.json` contains none of them. The provider therefore falls back to `none`.

The app is wrapped in `SupportProvider`, but repository search finds no production caller of `useSupport()`, `openMessenger()`, `openHelpCenter()` or support `identifyUser()`. Even if credentials were added, the current Help screen would not open it and the signed-in identity would not be bound to it.

The dependency `@intercom/intercom-react-native` is installed at `^10.6.0`; installation is not configuration, integration or a support operation.

### 2.4 The generic agent runtime is not a support runtime

`backend/api/src/botRuntime/openaiAgent.ts` has valuable provider hygiene: Responses API usage, `store: false`, a hashed `safety_identifier`, timeouts, retries, streaming primitives and usage metadata. However:

- it sends no support tools to the model;
- it has no retrieval from support knowledge;
- it has no ticket, order, payment, report or policy context;
- it has no operator queue or human-review record;
- it is designed to post into group conversations, not own a customer-support case.

The runtime's “confidence” mechanism is unsafe for support. At `openaiAgent.ts:111-112`, provider status `completed` becomes confidence `1.0`. A completed transport response does not prove correctness, policy compliance, retrieval support or resolution. Below-threshold text is wrapped in a “human moderator should review” message, but the runtime still returns `shouldReply: true`; there is no human queue behind the statement. This must not be reused in a support launch.

### 2.5 The client capability broker is not an authorization boundary

`frontend/src/platform/agents/capabilityBroker.ts` defines useful read, draft, publication and financial tiers. Grants are persisted in device AsyncStorage. `frontend/src/platform/agents/agentRuntime.ts` exposes executor registration, but no production code registers executors. Worse, the runtime can return `executed: true` when an executor is absent (`agentRuntime.ts:113`, `:143`, `:202`).

There are no support capabilities such as `support.case.create`, `support.order.read`, `support.return.request` or `support.handoff.create`.

The concept can inform UX, but customer-support authorization must be reimplemented on the server. Device state is not a trust boundary and cannot authorize refunds, account changes, evidence access or private order data.

### 2.6 P0 schema conflict in buyer-protection support

The support route in `backend/api/src/routes/supportReviews.ts` uses the canonical columns `topic_id`, `topic_label`, `details` and `evidence_media_urls`.

Two order-protection implementations—`backend/api/src/routes/orders.ts:2103-2177` and duplicated code in `backend/api/src/index.ts:35099-35174`—query or write legacy-looking fields `topic`, `subject`, `body` and a `support_ticket_attachments` table. No migration reviewed creates those columns or that attachment table.

This is a release-blocking contract divergence. On a database built from the canonical migrations, protection-claim history or claim creation is likely to fail at SQL execution. It must be corrected before an AI agent is allowed to discuss or initiate buyer protection; otherwise the assistant can promise a path whose source of truth is broken.

### 2.7 Ticket status semantics are conflated

The customer can mark their own ticket `resolved` or `closed` through the same status vocabulary that would normally represent a support decision. This makes it impossible to distinguish:

- resolved by an operator;
- closed by the requester;
- auto-closed after inactivity;
- withdrawn by the requester;
- rejected or ineligible;
- duplicated or merged;
- closed because an external payment/dispute process took over.

A support case needs an operational state and a resolution disposition. One three-value status cannot carry both.

### 2.8 Current ticket notification routing is not an operator queue

Ticket creation in `supportReviews.ts` notifies the other transaction party. That can be useful for a seller-contact workflow, but it is not support assignment and should not happen for every support topic. Safety, counterfeit, abuse, fraud or payment investigations may need confidentiality. Routing must be policy-specific.

---

## 3. Root-cause diagnosis

The missing feature is not “a bot screen.” It is a missing set of authoritative layers:

```text
data/contracts       no support conversation, events, assignment, policy version or action record
business logic       no case lifecycle, eligibility engine, routing or resolution disposition
async/timing         no durable turn job, handoff workflow, SLA timer or vendor outbox
UI state             no conversation, AI/human ownership, action review or genuine progress state
integration          Intercom inactive; generic agent disconnected from support
architecture         no support control plane or operator operating model
```

The corrective order must follow those ownership boundaries. A conversational UI built first would force the frontend to invent state the backend cannot evidence.

---

## 4. August 2026 benchmark research

### 4.1 Market convergence

The leading support platforms are converging on the same primitives:

| Benchmark | Current 2026 capability | Architectural lesson for ThryftVerse |
|---|---|---|
| Intercom Fin | Governed knowledge sources, audience targeting, procedures, data connectors, escalation rules and human-in-the-loop procedure approvals | Keep knowledge, workflow, audience and escalation as explicit systems, not a single prompt |
| Zendesk AI agents | Generative procedures with parameter collection, conditions, API integrations, CRM actions, knowledge steps and explicit escalation blocks | Represent support jobs as reviewable procedure graphs with declared fallbacks |
| Salesforce Agentforce Service | Dedicated agent identity, sharing-model enforcement, versioned agents, knowledge grounding and Omni-Channel escalation | Give the service agent a least-privilege service identity and version every deployable behavior |
| OpenAI Responses/Agents | Strict function tools, bounded tool choice, tool-call limits, tracing, handoffs and resumable human approval | Use the model as a planner over constrained tools; keep authority and durable state outside it |

Intercom's June 2026 knowledge documentation distinguishes public articles, internal articles, snippets, webpages, PDFs and synced repositories, including which audience can use each source. Its escalation documentation separates data-driven rules, natural-language guidance and post-escalation workflow. Its human-in-the-loop procedure support pauses sensitive work for an operator. These are useful patterns, but ThryftVerse should not surrender marketplace policy authority to a vendor prompt. [Intercom knowledge sources](https://www.intercom.com/help/en/articles/9440354-knowledge-sources-to-power-ai-agents-and-self-serve-support), [escalation rules](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules), [human approvals](https://www.intercom.com/help/en/articles/14468561-human-in-the-loop-approvals-for-fin-procedures)

Zendesk's July 2026 generative procedures expose explicit blocks for questions, parameters, conditions, integrations, knowledge and escalation, and specify that the AI stops after human escalation. Its 21 August 2026 escalation guidance recommends designing escalation strategy and fallback before launch. [Zendesk generative procedures](https://support.zendesk.com/hc/en-us/articles/10473649691418-About-generative-procedures-for-AI-agents), [handoff and handback](https://support.zendesk.com/hc/en-us/articles/4408824482586-Managing-conversation-handoff-and-handback), [escalation strategy](https://support.zendesk.com/hc/en-us/articles/8357756604186-Configuring-escalation-strategies-and-flows-for-AI-agents)

Salesforce binds its Help Agent to a dedicated user whose data access follows the platform's sharing model, versions changes and escalates through service routing. The transferable lesson is not to adopt Salesforce; it is that an agent must have a real identity and permissions that are narrower than the customer or operator. [Salesforce Help Agent configuration](https://help.salesforce.com/s/articleView?id=ai.service_agent_quick_configuration.htm&language=en_US&type=5), [service monitoring](https://help.salesforce.com/s/articleView?id=service.omnichannel_monitor_service_agents.htm&language=en_US&type=5)

### 4.2 What the benchmark does not prove

Vendor feature lists do not prove safe or effective operation in ThryftVerse's marketplace. They do not answer:

- whether a policy answer is legally correct in a given jurisdiction;
- whether a refund or cancellation is eligible in the live order state;
- whether an AI-created ticket is routed to a staffed queue;
- whether uploaded screenshots contain prompt injection or sensitive data;
- whether “resolution rate” includes reopened or silently abandoned conversations;
- whether a vendor integration preserves ThryftVerse's audit, deletion and residency requirements.

The implementation must be validated against ThryftVerse cases and policies, not vendor demos.

---

## 5. Product psychology: what makes support feel flagship

Support quality is experienced under stress. The user usually arrives after losing money, time, access, trust or control. A support experience therefore succeeds through **certainty, agency and continuity**, not decoration.

### 5.1 Certainty

The first useful response should state what is known, what was checked and what happens next. Do not display a pseudo-confidence percentage. Display evidence:

```text
Your parcel has not received a carrier scan since 21 Aug.
The delivery window ended yesterday.
You can ask the seller for an update now; buyer-protection review becomes available on 27 Aug.

Checked: order status · carrier events · buyer-protection policy (effective 2 Aug 2026)
```

This converts a probabilistic language system into an evidence-mediated experience.

### 5.2 Agency

The user needs visible exits and corrections:

- “Talk to a person” is always available;
- incorrect order/context can be changed;
- the user can inspect and edit a case draft before submission;
- mutations show the exact consequence before confirmation;
- an AI answer can be marked unhelpful with a reason;
- a support decision can be appealed through the canonical appeal process.

Microsoft Research's validated human-AI guidelines emphasize setting capability expectations, contextual information, efficient correction, graceful scoping when uncertain, explanations and granular feedback. These principles apply directly to high-stress support. [Microsoft Research human-AI guidelines](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/)

### 5.3 Continuity

The worst handoff is “Please explain your issue again.” A flagship handoff carries:

- customer intent and requested outcome;
- selected order/listing/report/case;
- verified timeline and tool results;
- evidence and upload state;
- policy passages and versions used;
- actions attempted and exact results;
- unresolved question;
- risk/urgency flags;
- language and accessibility preferences.

The human should enter with context, acknowledge ownership and continue in the same thread. A separate email address is not a handoff.

### 5.4 Honest empathy

Do not make the AI perform theatrical emotion. Repeated “I completely understand how frustrating this must be” copy feels synthetic, delays the answer and can be offensive during loss or fraud.

Use a calm sequence:

1. acknowledge the concrete problem once;
2. state what can be checked;
3. check it;
4. present the next safe action;
5. escalate when needed.

### 5.5 Appropriate friction

Friction is harmful when it makes the user retype known information. Friction is protective when it prevents an irreversible action.

- Reading an order status: no confirmation.
- Creating a draft case: no confirmation until submission.
- Sending a seller message: exact-recipient and exact-text preview.
- Cancelling an eligible request: consequence preview and confirmation.
- Refund, payout reversal, account restriction or dispute decision: human authority.

### 5.6 Trust calibration, not “trust maximization”

The goal is not to make users trust the agent. It is to help them know when reliance is appropriate. The system should be confident only when authoritative tools and current policy support an answer, otherwise narrow the claim or hand off. This also means deleting the current transport-status “confidence” heuristic.

---

## 6. Anti-AI-made mobile design policy

The support assistant must look like ThryftVerse support, not an AI demo.

### 6.1 Required composition

- Use a native conversation thread on a flat canvas.
- Make the customer's current object—order, listing, payout or report—the dominant context, not an AI avatar.
- Show a small, persistent “AI assistant” disclosure near the conversation title.
- Keep “Talk to a person” as a transparent header action with a 44pt target.
- Use real media from the selected order/listing when it helps recognition.
- Use one compact evidence row beneath an answer, not a card for every source.
- Open canonical action review screens/sheets for mutations; do not let prose substitute for a transaction UI.
- Let human and AI messages have a restrained, consistent authorship treatment; do not simulate a human profile photo for AI.

### 6.2 Prohibited visual patterns

- no sparkle icon as the primary identity;
- no gradient orb, robot mascot, glass panel or pulsing “thinking” halo;
- no carousel of generic prompt chips occupying the first viewport;
- no typing animation that masks queue latency;
- no large “How can I help?” hero before useful content;
- no card-on-card answer, source, status and action stack;
- no green success treatment before the backend has confirmed the outcome;
- no AI-generated stock illustration for empty states;
- no fake operator face, name or online presence;
- no “I'm 98% confident” badge.

### 6.3 First viewport by entry point

**General Help entry**

```text
Help & Support                             Talk to a person
Search or describe the issue

[message composer]

Buying · Selling · Payments · Safety · Account
Recent case or one relevant recent order—not a dashboard of cards
```

**Order entry**

```text
Support                                    Talk to a person
[item image] Vintage leather jacket
Delivered 23 Aug · Order #…

What went wrong?
[message composer]

Delivery issue · Not as described · Return · Payment
```

The order context should be preselected. Do not ask for an order number the authenticated product already knows.

### 6.4 Conversation states

| State | UI treatment |
|---|---|
| Connecting | Preserve thread geometry; show a small inline status, not a modal spinner |
| Retrieving facts | “Checking order and delivery status…” with a cancel/dismiss path |
| Generating answer | No decorative animation; reserve answer space to avoid layout jumps |
| Needs clarification | Ask one discriminating question; avoid interrogatory multi-field forms |
| Action proposed | Render exact action, target, consequence and confirmation |
| Action running | Disable duplicate submission; show truthful progress from execution state |
| Unknown outcome | Warning state: “We couldn't confirm the result” + “Check result” |
| Human queued | Show queue ownership and ETA only when sourced from live staffing/SLA data |
| Human active | AI stops; operator identity and message ownership are explicit |
| Offline | Preserve draft and thread; explain which read data may be stale |
| Failed | Specific failure and safe retry; never silently replace with a generic answer |
| Resolved | Ask whether the issue is actually solved; do not auto-close on sentiment alone |

### 6.5 Accessibility

- Announce “AI assistant” and “support specialist” authorship for each message group.
- Expose tool/action progress through live regions without announcing every streamed token.
- Preserve large-text usability; evidence and action labels must wrap.
- Do not use color alone for AI/human, status or risk.
- Every icon-only control needs a state-aware label.
- Uploaded evidence needs accessible thumbnails, removal labels and progress descriptions.
- Composer, attachment and send order must follow visual and screen-reader order.

---

## 7. Product surface and entry-point architecture

### 7.1 One support conversation, many contextual doors

Do not build separate bots for Buying, Selling, Payments and Safety. Use one customer-facing support identity with contextual routing and specialized procedures.

Entry points:

- Help & Support home;
- Order Detail and Resolution Centre;
- Listing Detail and listing management;
- Payments, Balance and Payout;
- Auction detail/activity;
- Co-Own asset, order and verification surfaces;
- Report confirmation and moderation decision;
- Account security and login recovery;
- Catalogue importer job/error detail;
- Media upload/editor failure states.

Each route starts or resumes a conversation with a signed context envelope. Never rely on the model to infer a raw ID from user text.

```ts
type SupportEntryContext =
  | { kind: 'general' }
  | { kind: 'order'; orderId: string }
  | { kind: 'listing'; listingId: string }
  | { kind: 'payout'; payoutId: string }
  | { kind: 'report'; reportId: string }
  | { kind: 'auction'; auctionId: string }
  | { kind: 'coown_asset'; assetId: string }
  | { kind: 'catalog_import'; importJobId: string }
  | { kind: 'media_job'; mediaJobId: string };
```

The API authenticates and reprojects the referenced object. Client-supplied context is a lookup request, not evidence of access.

### 7.2 Help home

Upgrade the canonical `HelpSupportScreen.tsx`; do not create `HelpSupportV2`.

Responsibilities:

- semantic/lexical article search backed by published knowledge;
- open or resume a support conversation;
- show real recent cases;
- show contextual shortcuts from recent order/payout/import failures;
- offer direct human contact;
- expose DSA reporting and appeals separately from ordinary FAQs.

### 7.3 Conversation screen

A new focused screen is justified because no canonical conversation implementation exists. It should support:

- durable messages from customer, AI, operator and system;
- contextual object header;
- streaming text with reduced-motion behavior;
- evidence citations;
- attachment upload progress/retry;
- action proposals and results;
- human handoff and ownership;
- offline draft;
- push notification return to the exact conversation;
- resume after app restart.

### 7.4 Case detail is not the same as conversation

The case is the structured work record; the conversation is communication. A user can have one conversation associated with multiple cases, and a case may outlive a conversation.

The case detail should show:

- issue and requested outcome;
- operational state;
- owner/team;
- related order/listing/payment;
- evidence;
- decisions and reasons;
- next required actor/action;
- appeal or reopen path;
- conversation link.

Do not reduce a marketplace dispute to chat bubbles.

---

## 8. Support case taxonomy and playbooks

### 8.1 Common informational support

Examples: fees, shipping options, how to sell, listing rules, supported media, account preferences.

Agent authority:

- search published knowledge;
- answer with citations and effective dates;
- link to the exact product route;
- ask one clarification when audience/jurisdiction is ambiguous;
- hand off when policy is absent or contradictory.

### 8.2 Order tracking and delivery

Read tools:

- order projection;
- parcel events;
- seller dispatch state;
- delivery window;
- protection eligibility window.

Safe actions:

- draft/send a context-bound message to seller after exact preview;
- create a delivery issue case;
- request evidence;
- subscribe the user to a real status update.

The model cannot invent carrier scans or a delivery ETA.

### 8.3 Cancellation

A deterministic eligibility service decides whether cancellation can be requested or completed. It must consider order state, payment state, dispatch, seller acceptance rules and jurisdiction.

The model may:

- explain the returned eligibility result;
- collect the reason;
- propose the allowed action.

It must not decide eligibility from prose or policy snippets.

### 8.4 Return, refund and item-not-as-described

The agent may collect structured facts and evidence, show deadlines, create a case and explain the workflow. It must not determine fault or refund amount.

Potential future automation is a policy engine, not model autonomy. A deterministic low-value rule may produce an approved resolution only after legal, finance, fraud and operations owners publish that rule. The model remains the interface.

### 8.5 Counterfeit, prohibited goods and safety

Always create a protected trust-and-safety case. Do not notify the reported party by default. Preserve evidence and chain of custody. The agent may provide immediate safety guidance from an approved article, but final classification, enforcement and redress are human decisions.

### 8.6 Payment and payout

Support-safe projections must exclude card details, bank secrets and unnecessary KYC data. The agent can explain a known payment status or gather an incident. It cannot:

- retry arbitrary charges;
- change payout destination;
- reverse a payout;
- disclose full payment identifiers;
- mark funds settled;
- infer fraud.

### 8.7 Account and security

The assistant can explain secure recovery and start canonical verification. It cannot change email, phone, password, MFA, payout account or identity state through conversational tool calls. Security changes stay in dedicated flows with fresh authentication.

If compromise is suspected, immediately suppress sensitive account facts and hand off to the security queue.

### 8.8 Moderation reports and appeals

The DSA requires clear contact, reporting and complaint mechanisms for platforms, including online marketplaces, and a user must be able to challenge moderation decisions. AI may help collect a notice or explain a decision, but it must not replace the canonical free complaint/appeal path or make the appeal decision. [European Commission DSA user rights](https://digital-strategy.ec.europa.eu/en/factpages/user-rights-under-digital-services-act), [illegal-product marketplace duties](https://digital-strategy.ec.europa.eu/en/policies/dsa-combatting-illegal-products-online)

Required paths:

- report illegal content/product;
- report a policy violation;
- see report receipt and state;
- receive reasoned outcome;
- request internal review;
- see external redress information where applicable.

### 8.9 Auctions and Co-Own

These are high-risk money/rights surfaces. The assistant is limited to:

- explaining authoritative state;
- retrieving published rules;
- collecting a support case;
- showing transaction timeline;
- routing to the correct specialist.

It cannot place/cancel bids, alter settlement, determine ownership rights, value an asset for redress, adjudicate a dispute or execute a transfer.

### 8.10 Catalogue importer and media/editor support

The assistant can inspect import/media job state through privacy-safe projections, explain a specific failure code, link to the failed items and open a case with technical metadata attached. It must not claim it repaired an import or upload until the actual job emits a successful terminal state.

---

## 9. Autonomy and approval matrix

| Tier | Examples | Default execution | Customer confirmation | Human approval |
|---|---|---|---|---|
| S0 — knowledge | Search published help, explain features, link routes | Automatic | No | No |
| S1 — scoped read | Read own order, tracking, ticket, report or payout-safe status | Automatic after auth/context validation | No | No |
| S2 — draft/collect | Draft case, draft seller message, collect evidence checklist | Automatic, not externally committed | Review before submit | No |
| S3 — reversible external | Create case, append message/evidence, request cancellation/return when eligibility service permits | Server policy-bound | Exact action preview | Conditional by procedure |
| S4 — consequential | Refund, credit, payout change/reversal, account restriction, moderation/counterfeit decision | Never model-autonomous | Not sufficient | Required |
| S5 — prohibited conversational action | Password/MFA/payout destination change, bid placement, Co-Own transfer, final legal/financial adjudication | Not exposed as a model tool | Canonical product flow | Canonical authority only |

No “always allow” grant is permitted for S3-S5. The server revalidates policy at execution time even after customer or operator approval.

---

## 10. Agent tool architecture

### 10.1 Design principles

1. Tools are domain APIs, not database access.
2. Every tool has a strict schema and a minimal result projection.
3. Read and write tools use separate registries and credentials.
4. Mutations are serialized; do not enable parallel tool calls for side effects.
5. Every mutation uses an idempotency key and optimistic concurrency/version check.
6. The result records `confirmed`, `rejected`, `failed` or `unknown_outcome`; network ambiguity is never success.
7. Policy engines decide eligibility; the language model explains the returned decision.
8. The model never supplies actor identity or authorization scope.
9. High-risk tools require an operator approval record or are not exposed.
10. Every tool call is linked to conversation, run, agent version and policy version.

### 10.2 Initial read tools

```text
support.get_customer_context
support.get_order_snapshot
support.get_parcel_snapshot
support.get_case_snapshot
support.get_report_snapshot
support.get_payment_status
support.get_payout_status
support.get_listing_snapshot
support.get_auction_snapshot
support.get_coown_snapshot
support.get_import_job_snapshot
support.get_media_job_snapshot
support.search_knowledge
support.evaluate_procedure_eligibility
```

Each response must include source time and redaction metadata. Example:

```json
{
  "orderId": "ord_…",
  "status": "shipped",
  "parcel": {
    "state": "in_transit",
    "lastEventAt": "2026-08-21T14:18:00Z",
    "estimatedDelivery": null
  },
  "supportEligibility": {
    "code": "DELIVERY_WINDOW_OPEN",
    "nextActionAt": "2026-08-27T00:00:00Z",
    "policyVersionId": "pol_…"
  },
  "asOf": "2026-08-25T09:12:03Z",
  "redactions": ["address", "payment_details"]
}
```

### 10.3 Initial mutation tools

```text
support.create_case
support.append_case_message
support.attach_evidence
support.request_human_handoff
support.submit_cancellation_request
support.submit_return_request
support.send_order_message
support.subscribe_case_updates
```

Do not expose `support.issue_refund`, `support.reverse_payout`, `support.suspend_user`, `support.resolve_counterfeit`, `support.decide_appeal`, `auction.place_bid` or `coown.transfer_units` to the customer-facing model.

### 10.4 Immutable action proposal

```ts
interface SupportActionProposal {
  id: string;
  conversationId: string;
  runId: string;
  toolName: string;
  canonicalArguments: unknown;
  argumentsHash: string;
  targetType: string;
  targetId: string;
  consequenceSummary: string;
  policyDecisionId: string;
  resourceVersion: string;
  expiresAt: string;
  state: 'proposed' | 'confirmed' | 'rejected' | 'executing' | 'succeeded' | 'failed' | 'unknown_outcome';
}
```

Confirmation executes the stored canonical arguments. The client cannot approve a summary and then submit different arguments.

### 10.5 Unknown-outcome protocol

If the request leaves ThryftVerse but the response is lost:

1. persist `unknown_outcome`;
2. show “We couldn't confirm the result”;
3. query by idempotency key or provider reference;
4. reconcile to success/failure;
5. prevent blind duplicate execution;
6. route unresolved money outcomes to an operator.

---

## 11. Knowledge and retrieval architecture

### 11.1 Knowledge is a governed product

Do not point the agent at the public internet. Customer support must answer from:

- published public help articles;
- internal operator procedures;
- structured marketplace policy rules;
- live support-safe product state;
- approved incident/status messages.

Each source has an owner, audience, jurisdiction, effective interval and review state.

### 11.2 Proposed schema

```text
support_articles
  id, slug, product_area, owner_team, audience, default_locale, state

support_article_versions
  id, article_id, version, title, body_markdown, jurisdiction,
  effective_from, effective_to, approved_by, approved_at, checksum

support_article_chunks
  id, article_version_id, ordinal, text, search_vector,
  embedding_model, embedding_version, embedding

support_procedures
  id, key, version, jurisdiction, audience, risk_tier,
  definition_json, state, approved_by, effective_from, effective_to

support_policy_decisions
  id, procedure_key, procedure_version, subject_type, subject_id,
  inputs_hash, result_code, explanation_data, created_at
```

### 11.3 Retrieval pipeline

```text
user message + signed context
      ↓
intent, locale, audience, jurisdiction and effective-time filter
      ↓
lexical candidates + semantic candidates
      ↓
permission filter and version filter
      ↓
rerank
      ↓
answer only from returned passages + structured facts
      ↓
citation validator
```

Use PostgreSQL `tsvector`/GIN for the first launch because the codebase already uses that pattern for listing search. Add embeddings only after a real support corpus and evaluation set exist. The repository's media embedding storage is BYTEA-based and explicitly notes that pgvector is not installed; it is unrelated to text support retrieval and should not be reused as if it were ready.

A pragmatic sequence:

1. versioned articles + lexical search + model reranking;
2. hybrid retrieval with an evaluated text embedding model;
3. query decomposition for multi-issue requests;
4. retrieval feedback and content-gap analytics.

### 11.4 Citation contract

Every policy assertion includes:

- article title;
- article/version ID;
- effective date;
- relevant section anchor;
- audience/jurisdiction;
- optional customer-facing “Read policy” link.

If no current source supports the answer, the agent asks a clarifying question or escalates. It does not fill the gap from model memory.

### 11.5 Content operations

Publishing requires:

- named owner;
- reviewer;
- jurisdiction review where needed;
- preview in customer and operator modes;
- retrieval regression test;
- expiry/review date;
- rollback to prior version;
- audit event.

Conversation failures should create content-gap candidates, not silently become new knowledge. Human-approved solved cases may inform drafts; they must not automatically train customer-facing policy.

---

## 12. Conversation, case and event data model

### 12.1 Proposed canonical entities

```text
support_conversations
support_participants
support_messages
support_message_attachments
support_cases
support_case_links
support_case_events
support_assignments
support_sla_policies
support_action_proposals
support_action_executions
support_agent_runs
support_agent_steps
support_agent_citations
support_handoffs
support_feedback
support_vendor_mappings
support_vendor_outbox
```

### 12.2 Conversation ownership state

```text
ai_active
  ├─ safe resolution confirmed ─→ resolved
  ├─ user requests person ──────→ human_queued
  ├─ risk/policy rule ──────────→ human_queued
  └─ procedure/tool failure ────→ human_queued

human_queued ─→ human_active ─→ resolved
                      └────────→ awaiting_customer

resolved ─→ reopened ─→ ai_active or human_queued according to policy
resolved ─→ closed after retention-aware closure policy
```

When `human_active`, the AI cannot send customer-visible messages. It may produce private operator suggestions if a separate copilot permission is enabled.

### 12.3 Case state and disposition

Operational state:

```text
new → triaged → awaiting_customer | queued | in_review | awaiting_external
    → resolved → closed
```

Resolution disposition is separate:

```text
information_provided
customer_withdrew
seller_resolved
refund_approved
refund_denied
return_approved
not_eligible
no_violation
violation_actioned
duplicate
merged
external_dispute
unable_to_resolve
```

This prevents a customer closing a conversation from fabricating an operator resolution.

### 12.4 Event-sourced user timeline

The user-facing timeline is derived from real events:

- case created;
- evidence received/failed scan;
- assigned to queue/operator;
- additional information requested;
- external carrier/payment update;
- decision made with reason and policy version;
- customer notified;
- appeal opened;
- case resolved/closed/reopened.

Internal risk details remain in restricted events; the public projection contains only what the user is entitled to see.

---

## 13. API and backend implementation structure

### 13.1 Contracts

Create a shared, versioned package used by mobile, API and workers:

```text
packages/support-contracts/
  src/context.ts
  src/conversation.ts
  src/case.ts
  src/events.ts
  src/knowledge.ts
  src/actions.ts
  src/operator.ts
  src/errors.ts
```

Do not duplicate status strings in the store, screens and backend routes.

### 13.2 Customer API

```text
GET    /support/bootstrap?contextType=&contextId=
POST   /support/conversations
GET    /support/conversations/:id
POST   /support/conversations/:id/messages
GET    /support/conversations/:id/events
POST   /support/conversations/:id/handoff
POST   /support/conversations/:id/resolve-confirmation

GET    /support/cases
GET    /support/cases/:id
POST   /support/cases/:id/messages
POST   /support/cases/:id/evidence
POST   /support/cases/:id/appeal

GET    /support/actions/:id
POST   /support/actions/:id/confirm
POST   /support/actions/:id/reject
POST   /support/actions/:id/check-result

GET    /support/knowledge/search?q=
GET    /support/knowledge/articles/:slug
```

Message POST should persist and acknowledge quickly, enqueue an agent turn and stream/realtime-publish durable events. Do not hold the request open across multiple model retries.

### 13.3 Operator API

```text
GET    /ops/support/queues
GET    /ops/support/cases
POST   /ops/support/cases/:id/assign
POST   /ops/support/cases/:id/reply
POST   /ops/support/cases/:id/note
POST   /ops/support/cases/:id/request-information
POST   /ops/support/cases/:id/resolve
POST   /ops/support/actions/:id/approve
POST   /ops/support/actions/:id/reject
GET    /ops/support/audit/:caseId
```

Operator auth, role and queue membership must be separate from ordinary user auth. Sensitive queues require additional scopes.

### 13.4 Backend modules

```text
backend/api/src/support/
  contracts/
  conversationService.ts
  caseService.ts
  caseStateMachine.ts
  contextProjectionService.ts
  routingService.ts
  slaService.ts
  handoffService.ts
  knowledgeService.ts
  policyEngine.ts
  actionBroker.ts
  auditService.ts
  vendorAdapter.ts
  tools/
    reads/
    mutations/
  procedures/
  evals/

backend/api/src/workers/handlers/
  supportAgentTurnHandler.ts
  supportVendorSyncHandler.ts
  supportSlaEscalationHandler.ts
  supportKnowledgeIndexHandler.ts
  supportRetentionHandler.ts
```

### 13.5 Transactional boundaries

The following are single transactions:

- create conversation + first message + agent-turn outbox;
- create case + context link + event + assignment/outbox;
- approve action + lock resource version + action execution intent;
- record tool result + event + user notification;
- human handoff + AI ownership revocation + queue assignment + vendor outbox.

External vendor/provider calls use an outbox/inbox state machine, not a database transaction held open over the network.

### 13.6 Correct the current support schema first

Before adding AI tables:

1. choose one canonical claim/ticket schema;
2. fix the legacy `topic/subject/body/support_ticket_attachments` queries;
3. remove duplicated protection route implementations from `index.ts` or make one module canonical;
4. introduce non-order case links instead of nullable foreign-key sprawl;
5. backfill existing tickets into the new case/event model;
6. preserve old API compatibility during one mobile release window;
7. add integration tests against a migration-created database.

---

## 14. Model and runtime design

### 14.1 Use a model router, not one expensive model for every turn

Recommended evaluated roles:

| Role | Candidate | Purpose |
|---|---|---|
| Triage | fast model tier, currently comparable to `gpt-5.6-luna` | intent, language, risk and procedure selection with structured output |
| Primary support | balanced tier, currently comparable to `gpt-5.6-terra` | grounded answer, clarification and tool planning |
| Complex internal summary | frontier tier, currently comparable to `gpt-5.6-sol` | handoff summary or complex multi-document synthesis after risk gating |
| Policy/eligibility | no language model | deterministic code/rules with versioned inputs and outputs |

These are candidates, not automatic choices. Pin evaluated snapshots/config versions for production and re-run the support suite before changing them.

OpenAI's current documentation recommends the Responses API for reasoning and tool workflows, supports custom function tools, tool selection and tool-call limits, and advises exposing only relevant tools. Use strict schemas, `max_tool_calls`, `store: false` unless an approved retention design says otherwise, and `safety_identifier`. [OpenAI Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create), [latest-model guidance](https://developers.openai.com/api/docs/guides/latest-model)

### 14.2 A support turn is a durable workflow

```text
persist customer message
  → classify intent/risk
  → load signed context projection
  → choose one procedure/tool subset
  → retrieve current knowledge
  → generate structured plan
  → validate plan
  → run allowed reads
  → generate cited answer or action proposal
  → validate citations/policy language
  → persist answer + trace
  → publish event
```

The model does not receive the entire tool catalogue. Tool exposure is scoped by authenticated context, procedure and risk.

### 14.3 No model-generated “confidence”

Replace the current heuristic with independent signals:

- current policy passage retrieved;
- citation fully supports claim;
- all required structured fields present;
- live tool returned a terminal state;
- procedure eligibility service succeeded;
- no contradictory source;
- no high-risk routing rule;
- output validator passed.

Customer-facing labels can be “Checked,” “Policy source available,” “Waiting for carrier,” or “Needs specialist review.” They describe evidence, not unverifiable certainty.

### 14.4 Separate customer agent and operator copilot

They have different permissions and failure costs.

- Customer agent: published knowledge, customer-safe projections, low-risk tools, direct handoff.
- Operator copilot: internal procedure search, timeline summary, draft reply, suggested next steps; never sends or executes without the operator unless a separately approved deterministic automation exists.

Do not give the customer-facing agent access to internal notes or fraud signals.

---

## 15. Human escalation and operator experience

### 15.1 Mandatory escalation triggers

Immediate handoff:

- user explicitly asks for a human;
- legal threat, regulator, law-enforcement or media inquiry;
- account compromise or identity/security change;
- self-harm, child safety or credible physical danger;
- payment dispute, chargeback, payout reversal or unknown money outcome;
- counterfeit/prohibited-item final decision;
- harassment, abuse or serious trust-and-safety report;
- moderation appeal;
- auction/Co-Own rights or settlement dispute;
- accessibility need the agent cannot support;
- system detects conflicting policies or missing current policy;
- action validator/authorization fails in a way the customer cannot correct.

Escalate after bounded attempts:

- two materially unsuccessful clarification cycles;
- repeated negative resolution confirmation;
- procedure falls through to no valid step;
- required integration unavailable beyond retry budget;
- attachment cannot be safely processed.

### 15.2 Handoff behavior

1. Acknowledge: “I'll pass this to a support specialist.”
2. Do not argue or force the user through another AI attempt.
3. Gather only missing information that reduces customer effort and is safe to collect.
4. Create/route the case transactionally.
5. Show queue state and response expectation only from real SLA/staffing data.
6. Stop customer-visible AI output.
7. Deliver the handoff bundle to the operator.
8. Preserve one thread when the operator replies.

Intercom and Zendesk both explicitly stop AI responding after human takeover; ThryftVerse should enforce this as an ownership lock, not a prompt instruction. [Intercom workflow handoff](https://www.intercom.com/help/en/articles/10032299-use-fin-ai-agent-in-workflows), [Zendesk handoff](https://support.zendesk.com/hc/en-us/articles/4408824482586-Managing-conversation-handoff-and-handback)

### 15.3 Operator queue

Minimum useful queue columns:

- priority and SLA state;
- issue type;
- customer role;
- context object;
- risk flag;
- last actor/message time;
- assignment;
- language;
- AI/tool failure reason.

The case view should lead with the object and verified timeline, not the AI summary. The summary is secondary and every claim links to its source event.

### 15.4 SLA truth

Do not show “usually within two hours” unless computed from the eligible queue and current staffing policy. Store:

- first-response due time;
- next-response due time;
- resolution target where applicable;
- paused reason;
- breached at;
- policy ID/version.

The customer projection can say “A specialist is reviewing this” without inventing a clock when no reliable prediction exists.

---

## 16. Build versus buy

### 16.1 Options

| Option | Advantages | Risks | Decision |
|---|---|---|---|
| Vendor-only AI + inbox | Fastest demo and staffing setup | Vendor becomes de facto policy/action authority; weak marketplace integration; duplicate source of truth | Reject for core support |
| Fully first-party AI, cases and operator console | Maximum control and consistent data | Highest operational build burden; queue, staffing and reporting take time | Long-term option |
| First-party support core + vendor operator inbox | Canonical marketplace truth with mature human operations | Requires robust bidirectional sync and clear source ownership | Recommended |

### 16.2 Recommended first phase

Use the existing Intercom adapter only after a formal vendor decision. It is an implementation hint, not a sunk-cost mandate.

Recommended boundary:

```text
ThryftVerse owns                         Vendor may own initially
────────────────                         ────────────────────────
customer identity projection             operator inbox presentation
conversation/case IDs and state           workforce notification
commerce facts and policy decisions       assignment convenience
support tools and approvals               macros and scheduling
evidence and audit                         human reply composition
customer mobile UI                        basic workforce analytics
```

Sync through webhooks plus an idempotent outbox. Store vendor conversation/ticket IDs only as mappings. A vendor outage must not lose the customer's message or case.

### 16.3 Vendor evaluation gate

Before configuring production credentials, compare Intercom and Zendesk on:

- React Native SDK quality and accessibility;
- EU/UK data location and subprocessors;
- deletion/export and legal-hold behavior;
- webhook ordering, retries, signing and replay;
- human/AI ownership semantics;
- custom object and private-note support;
- attachment malware scanning;
- operator RBAC/SSO/SCIM;
- audit export;
- outage and rate-limit behavior;
- per-resolution, per-seat and AI pricing;
- ability to disable vendor AI while retaining the inbox;
- contractual use of customer content for model improvement.

Do not install an additional plugin for this report; official vendor documentation and the repository's existing adapter were sufficient. Procurement needs a separate commercial/security review.

---

## 17. Safety, security, privacy and regulatory design

### 17.1 AI disclosure

From 2 August 2026, EU AI Act transparency rules apply to interactive AI systems and require users to be informed when they are interacting with AI rather than a human. The support header and conversation authorship must therefore identify the AI clearly; a disclosure buried in Terms is insufficient product design. [European Commission transparency guidelines](https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems), [31 July 2026 enforcement notice](https://digital-strategy.ec.europa.eu/en/news/commission-starts-enforcing-ai-act-rules-and-new-transparency-requirements-2-august)

### 17.2 Automated decisions

UK ICO guidance states that people affected by significant automated decisions need information, a way to make representations, human intervention and a way to contest the decision. ThryftVerse should avoid customer-support AI making such decisions at all; where deterministic automation is later introduced, those safeguards must be designed into the case record and UI. [ICO agentic AI privacy risks](https://ico.org.uk/about-the-ico/research-reports-impact-and-evaluation/research-and-reports/technology-and-innovation/tech-horizons-and-ico-tech-futures/ico-tech-futures-agentic-ai/data-protection-and-privacy-risks/), [ICO individual rights guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/guidance-on-ai-and-data-protection/how-do-we-ensure-individual-rights-in-our-ai-systems/)

This is architecture guidance, not legal advice. Counsel must assess exact obligations by launch markets and use cases.

### 17.3 Threat model

Threats include:

- direct prompt injection from customer messages;
- indirect injection embedded in listing descriptions, imported catalogues, screenshots, PDFs or URLs;
- tool argument smuggling;
- authorization confused-deputy attacks;
- cross-customer/cross-order data leakage;
- malicious article or internal note poisoning;
- operator overreliance on an incorrect summary;
- exfiltration through citations or tool errors;
- denial of wallet through long loops/tool calls;
- replay of approved mutations;
- vendor webhook forgery/reordering;
- model/provider outage and partial execution;
- sensitive-data persistence in prompts, traces or analytics.

OWASP's Agentic Security Initiative identifies emerging agent/tool risks and recommends threat-model-driven mitigations; NIST's GenAI Profile organizes governance, mapping, measurement and management across the lifecycle. Use both as engineering baselines, not checklists that certify safety. [OWASP agentic threats](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/), [NIST AI RMF and GenAI Profile](https://www.nist.gov/itl/ai-risk-management-framework)

### 17.4 Required controls

- strict allowlisted tools and JSON schemas;
- object-level authorization inside every tool;
- agent service identity with least privilege;
- context projection instead of raw database rows;
- argument hashing and expiring approvals;
- idempotency and resource-version checks;
- output encoding and safe link allowlists;
- attachment content-type validation, malware scanning and metadata stripping;
- prompt-injection classifiers as defense in depth, never as the only boundary;
- explicit separation of instructions from untrusted content;
- maximum turns, tool calls, tokens, wall time and spend per run;
- immutable audit trail;
- provider request IDs and model/config versions;
- PII redaction in logs and traces;
- retention/deletion policies by data class;
- red-team suites for tool abuse and data leakage;
- kill switch by agent version, tool, procedure and region.

### 17.5 Privacy projections

The support agent receives the minimum fields necessary for the current job.

Examples:

- order support does not need full billing address after delivery;
- payout status does not need bank account details;
- a seller should not receive a buyer's private fraud report;
- an operator copilot should not receive protected trust-and-safety notes unless assigned to that queue;
- uploaded identity evidence should not enter general model context.

### 17.6 DSA complaint independence

Illegal-content notices and moderation appeals must remain accessible, free and trackable even if the AI service is unavailable or the user refuses AI. Do not route every “report illegal content” request through a generative conversation. The Commission's August 2026 guidance emphasizes accessible internal complaint mechanisms and reasoned outcomes. [European Commission DSA complaint guidance](https://digital-strategy.ec.europa.eu/en/factpages/tackling-illegal-content-online-digital-services-act)

---

## 18. Evaluation and quality system

### 18.1 Do not launch from manual prompt testing

Build a versioned support evaluation set from:

- published policies and expected answers;
- synthetic boundary cases approved by support/legal/operations;
- anonymized historical tickets when a lawful, reviewed dataset exists;
- real tool state fixtures;
- adversarial/injection cases;
- multilingual and accessibility cases;
- ambiguous and multi-intent requests;
- provider, tool and network failures.

Every example records jurisdiction, role, risk tier, required tools, permitted actions, prohibited claims, expected citations and escalation outcome.

### 18.2 Offline metrics

| Layer | Metric |
|---|---|
| Intent/routing | issue, urgency, risk and queue precision/recall |
| Retrieval | recall@k, current-version recall, audience/jurisdiction leakage |
| Grounding | claim-level citation support and contradiction rate |
| Procedure | correct step selection, required-field completeness and fallback correctness |
| Tools | schema validity, argument accuracy, authorization and state-version correctness |
| Safety | prohibited-action attempt rate, PII leakage, injection success rate |
| Handoff | mandatory-escalation recall and handoff-bundle completeness |
| UX | correction success, duplicate-question rate and customer effort |

### 18.3 Hard launch gates

- 100% of explicit human requests route to a real configured queue in test and canary environments.
- 100% of support mutations enforce server authorization, idempotency and resource version.
- 0 customer-facing tools exist for final refund, payout reversal, restriction, moderation appeal, auction or Co-Own adjudication.
- 0 answers use unpublished, expired, wrong-audience or wrong-jurisdiction articles in the gold suite.
- 0 tool/API unknown outcomes are rendered as success.
- 0 customer-visible “human review” claims exist without a persisted handoff/assignment record.
- Every policy assertion in evaluated high-risk domains has a supporting current citation.
- Every AI version passes cross-user data isolation and prompt-injection tests.
- Human operators can take over and AI output stops deterministically.
- Rollback and kill switches work in a production-like environment.

Thresholds for general answer quality should be set after a labelled baseline, not invented in this report. High-risk invariants above are non-negotiable.

### 18.4 Online metrics

Primary:

- confirmed issue resolution rate;
- first-contact resolution excluding reopened cases;
- customer effort/repeated-information rate;
- time to safe next step;
- human first-response and resolution SLA;
- reopen rate within 7 days;
- escalation appropriateness;
- action failure/unknown-outcome rate;
- CSAT split by AI-only, AI-to-human and human-only.

Guardrails:

- complaint and appeal rate;
- policy correction rate;
- unauthorized tool attempts;
- data-access denials;
- harmful answer incidents;
- abandonment after AI response;
- customers asking for a person more than once;
- vendor sync lag/failure;
- per-resolved-case cost.

Do not optimize “deflection” or “containment” alone. A user who gives up is not a resolved case.

### 18.5 Rollout stages

1. Offline replay only.
2. Operator copilot suggestions, invisible to customers.
3. Shadow customer agent; human answers remain authoritative.
4. Employee/internal dogfood.
5. 1% customer canary for informational intents.
6. Read-only order diagnostics.
7. Case drafting and human handoff.
8. Carefully selected S3 actions after separate evaluation.

Each stage has an automatic rollback threshold and manual incident owner.

---

## 19. Observability, operations and SLOs

### 19.1 Trace model

Every support turn links:

```text
conversation_id
message_id
case_id(s)
run_id
agent_version
model_provider/model_snapshot
prompt/config checksum
knowledge version IDs
procedure version
tool calls and results
policy decision IDs
action proposal/execution IDs
handoff/assignment IDs
latency/token/cost
validator outcomes
```

Traces store redacted structured metadata by default. Raw message/evidence access is role-controlled and retention-limited.

### 19.2 Proposed technical objectives

These are design targets, not claims about the current system:

- customer message durable acknowledgement: p95 under 500 ms;
- first truthful processing status: p95 under 1 s;
- read-tool completion: p95 under 2 s where the source is healthy;
- first useful AI response for simple informational requests: p95 under 8 s;
- handoff record and queue assignment: p95 under 3 s excluding vendor outage;
- vendor outbox delivery: p95 under 30 s with visible degraded state;
- duplicate mutation execution: zero;
- lost acknowledged customer messages: zero.

Human SLA targets must be derived from staffing and queue data, not copied from competitors.

### 19.3 Incident controls

- global AI response kill switch;
- per-tool/per-procedure/per-region disable;
- force-human mode;
- freeze knowledge version;
- vendor bypass/fallback queue;
- provider failover for informational answers only;
- incident banner with approved content;
- replay/reconcile unknown tool outcomes;
- audit export for customer complaint investigation.

---

## 20. Implementation plan

### Phase 0 — truth and contract repair

**Goal:** make the current support foundation internally truthful before adding AI.

- Correct protection claim schema divergence.
- Consolidate duplicated support/protection routes.
- Introduce shared support contracts.
- Separate operational state from resolution disposition.
- Add conversation, message, event and assignment foundations.
- Make general support cases possible without a fake order relation.
- Replace static timeline with real events.
- Configure an actual human queue path or do not promise handoff.
- Remove/rename the current pseudo-confidence signal.
- Make missing tool executors fail closed.

**Exit:** a user and a human operator can exchange durable messages in one case with correct state and audit, without AI.

### Phase 1 — governed knowledge and read-only assistant

**Goal:** answer informational and status questions safely.

- Build article/version/content operations.
- Add lexical search and citations.
- Add authenticated support context projections.
- Implement intent/risk routing.
- Add read-only tool broker.
- Build canonical mobile conversation screen.
- Add AI disclosure, direct human action and full states.
- Create offline eval suite and shadow deployment.

**Exit:** evaluated informational and read-only cases can be answered with current citations; all uncertainty and high-risk cases hand off.

### Phase 2 — procedures, case drafting and hybrid operations

**Goal:** reduce customer effort without expanding adjudication risk.

- Version deterministic procedures.
- Collect structured issue data conversationally.
- Draft/create cases and evidence requests.
- Implement complete handoff bundles.
- Integrate selected vendor inbox via outbox/webhooks.
- Add operator copilot summary/draft behind approval.
- Add truthful SLA/queue projection.

**Exit:** human operators receive routed, context-rich cases and reply in the same customer thread.

### Phase 3 — bounded reversible actions

**Goal:** automate low-risk procedural work.

- Add immutable action proposal/approval.
- Implement eligible cancellation/return request tools.
- Implement safe seller-message tool.
- Add unknown-outcome reconciliation.
- Canary by procedure, market and value threshold.

**Exit:** selected actions complete with authorization, policy evidence, idempotency, receipts and rollback/compensation.

### Phase 4 — optimization, not autonomy theatre

- Hybrid semantic retrieval after measured lexical baseline.
- Multilingual evaluation and localized policy.
- Proactive support from real failure signals, opt-in and non-intrusive.
- Content-gap analytics and operator workflow optimization.
- Evaluate whether first-party operator console economics justify vendor replacement.

High-risk adjudication remains human unless a separately governed deterministic decision system is legally and operationally approved.

### Indicative team shape

For a serious first release:

- 2 backend/platform engineers;
- 1–2 React Native engineers;
- 1 AI/retrieval/evaluation engineer;
- 1 support-operations product owner;
- shared design, security, privacy/legal, QA and data support;
- named support staff for the actual queue.

Without staffed human operations, do not launch a handoff promise. Software cannot substitute for queue ownership.

---

## 21. Concrete repository change map

### Frontend modifications

```text
frontend/src/screens/HelpSupportScreen.tsx
  replace hard-coded FAQ source with knowledge API
  add start/resume conversation and truthful human route

frontend/src/screens/SupportTicketDetailScreen.tsx
  move to real event/case projection; remove static two-node timeline

frontend/src/screens/OrderSupportScreen.tsx
  create/resume contextual support conversation and case draft

frontend/src/services/supportApi.ts
  replace ticket-only contract with versioned conversation/case/action APIs

frontend/src/platform/support/SupportProvider.tsx
  keep as vendor adapter only; bind identity and expose degraded configuration

frontend/src/platform/agents/capabilityBroker.ts
frontend/src/platform/agents/agentRuntime.ts
  do not authorize support actions; fail closed when executor is absent
```

### Focused new frontend modules

```text
frontend/src/screens/SupportConversationScreen.tsx
frontend/src/components/support/SupportContextHeader.tsx
frontend/src/components/support/SupportMessage.tsx
frontend/src/components/support/SupportEvidenceRow.tsx
frontend/src/components/support/SupportActionReview.tsx
frontend/src/components/support/SupportHandoffState.tsx
frontend/src/hooks/useSupportConversation.ts
frontend/src/services/supportConversationApi.ts
```

### Backend modifications

```text
backend/api/src/routes/supportReviews.ts
  migrate to the canonical service; preserve compatibility temporarily

backend/api/src/routes/orders.ts
backend/api/src/index.ts
  remove legacy protection/support schema divergence and duplication

backend/api/src/botRuntime/openaiAgent.ts
  remove fabricated confidence; do not repurpose directly as support authority
```

### Focused new backend modules

Use the structure in §13.4 and additive migrations for conversation, case, knowledge, actions, audit and vendor sync. Avoid one giant `supportAgent.ts` and avoid a framework-heavy abstraction for each individual tool.

---

## 22. Acceptance checklist

### Customer experience

- AI identity is unambiguous.
- A human is reachable in one action and explicit requests always work.
- Known order/listing context is not requested again.
- Answers show what was checked and cite current policy.
- The thread survives restart, offline transitions and human handoff.
- Evidence uploads show progress, failure and retry.
- Actions use exact previews and receipts.
- Unknown outcomes are distinct from success and failure.
- No fake avatar, typing theatre, confidence badge, queue presence or SLA.
- Large text and screen readers preserve the flow.

### Backend and operations

- Canonical support schema passes from clean migrations.
- Protection claims use the same source of truth.
- General and context-specific cases are supported.
- Human operator queue is staffed and monitored.
- AI ownership stops atomically on handoff.
- Tools are allowlisted, scoped, authorized, version-checked and idempotent.
- Knowledge is versioned, permissioned and effective-time filtered.
- Every decision/action has a trace and policy version.
- Vendor sync is signed, idempotent and recoverable.
- Retention, deletion, export and legal-hold paths are tested.

### Evaluation

- Gold and adversarial suites pass launch gates.
- Shadow/canary metrics show no unacceptable regression.
- Human reviewers validate handoff summaries and cited answers.
- High-risk invariants remain at zero violations.
- Rollback and force-human mode are rehearsed.

---

## 23. Final recommendation

ThryftVerse should build agentic support, but it should **not launch by wiring the current generic agent into Help & Support**.

The correct sequence is:

> **repair support truth → build durable human support → govern knowledge → add read-only AI → add procedure-driven case creation → add bounded reversible actions**

The flagship quality bar is not whether the assistant writes naturally. It is whether a customer with a lost parcel, frozen payout, counterfeit concern, moderation appeal or Co-Own dispute can understand reality, take the correct next step and reach an accountable person without repeating themselves.

The central architectural rule is:

> **The model may help navigate the support system. It must never become the system of record, the policy engine, the money authority, or the judge of its own escalation.**

---

## 24. Primary source register

### AI platform and human-AI engineering

- [OpenAI Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
- [OpenAI latest-model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [Microsoft Research: Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/publication/guidelines-for-human-ai-interaction/)
- [NIST AI Risk Management Framework and Generative AI Profile](https://www.nist.gov/itl/ai-risk-management-framework)
- [OWASP Agentic AI Threats and Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/)

### 2026 support-platform architecture benchmarks

- [Intercom: knowledge sources for AI and support](https://www.intercom.com/help/en/articles/9440354-knowledge-sources-to-power-ai-agents-and-self-serve-support) — 23 June 2026
- [Intercom: escalation guidance and rules](https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules)
- [Intercom: Fin in workflows and human handoff](https://www.intercom.com/help/en/articles/10032299-use-fin-ai-agent-in-workflows)
- [Intercom: human-in-the-loop approvals](https://www.intercom.com/help/en/articles/14468561-human-in-the-loop-approvals-for-fin-procedures)
- [Zendesk: generative procedures](https://support.zendesk.com/hc/en-us/articles/10473649691418-About-generative-procedures-for-AI-agents) — edited 7 July 2026
- [Zendesk: conversation handoff and handback](https://support.zendesk.com/hc/en-us/articles/4408824482586-Managing-conversation-handoff-and-handback) — edited 1 May 2026
- [Zendesk: escalation strategies and flows](https://support.zendesk.com/hc/en-us/articles/8357756604186-Configuring-escalation-strategies-and-flows-for-AI-agents) — edited 21 August 2026
- [Salesforce: Help Agent configuration](https://help.salesforce.com/s/articleView?id=ai.service_agent_quick_configuration.htm&language=en_US&type=5)
- [Salesforce: monitor and transfer service agents](https://help.salesforce.com/s/articleView?id=service.omnichannel_monitor_service_agents.htm&language=en_US&type=5)

### Regulation and user rights

- [European Commission: AI Act Article 50 transparency guidelines](https://digital-strategy.ec.europa.eu/en/library/guidelines-transparency-obligations-providers-and-deployers-ai-systems) — published 20 July 2026
- [European Commission: AI Act enforcement and transparency from 2 August](https://digital-strategy.ec.europa.eu/en/news/commission-starts-enforcing-ai-act-rules-and-new-transparency-requirements-2-august) — published 31 July 2026
- [European Commission: DSA user rights](https://digital-strategy.ec.europa.eu/en/factpages/user-rights-under-digital-services-act) — updated 17 July 2026
- [European Commission: DSA reporting and complaint mechanisms](https://digital-strategy.ec.europa.eu/en/factpages/tackling-illegal-content-online-digital-services-act) — updated 17 August 2026
- [European Commission: illegal products and online marketplaces](https://digital-strategy.ec.europa.eu/en/policies/dsa-combatting-illegal-products-online)
- [ICO: agentic AI data-protection and privacy risks](https://ico.org.uk/about-the-ico/research-reports-impact-and-evaluation/research-and-reports/technology-and-innovation/tech-horizons-and-ico-tech-futures/ico-tech-futures-agentic-ai/data-protection-and-privacy-risks/)
- [ICO: individual rights in AI systems](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/guidance-on-ai-and-data-protection/how-do-we-ensure-individual-rights-in-our-ai-systems/)

---

## 25. Validation note

This report distinguishes repository evidence from inference:

- Confirmed: current component/API/migration/runtime structure and missing consumers/configuration.
- Strong inference requiring runtime confirmation: protection endpoints using legacy columns are expected to fail on a clean canonical migrated database.
- Proposed: product design, schemas, APIs, SLOs, team shape and phased architecture.
- Not claimed: native visual validation, vendor procurement approval, legal compliance certification, model quality or staffed operational readiness.

