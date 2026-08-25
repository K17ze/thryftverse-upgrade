# ThryftVerse User-Facing Agentic AI — Flagship Research and Upgrade Report

**Research cutoff:** 25 August 2026

**Repository reviewed:** `cbf8abf1afae0b8b6e5159bbffbc471f9afc0100` on `feat/product-detail-contract-media-device-closure`

**Scope:** user-facing agents, provider connections, agent creation/deployment, chat invocation, permissions, approvals, memory, progress, evidence, runtime durability, security, evaluation, privacy and mobile UX

**Assessment type:** code-backed product/architecture audit plus current primary-source research; no native visual claim

---

## 1. Executive decision

ThryftVerse has more serious AI infrastructure than its current experience suggests. The repository already contains secure local provider storage, live model discovery, a typed capability taxonomy, a local approval broker, an activity ledger, a real server-side OpenAI Responses runtime, streaming code, quotas, cost accounting, deployment snapshots and database audit events.

The problem is **not a lack of AI screens**. The problem is that the product currently exposes several different systems as if they were one coherent agent platform:

1. **Device-local provider connections** store a user's OpenAI, Anthropic, Gemini or custom key and query that provider directly.
2. **Device-local chat assistants** are demo/in-memory agents with local deployment, suggestions, grants and activity.
3. **Server chat bots** are real persisted agents, deployed to group conversations and executed through a platform-managed OpenAI Responses runtime.

Those systems do not share one definition, provider contract, permission contract, run state or audit source. This produces release-blocking contradictions:

- The create-agent UI considers `chat.draft_reply` sufficient to publish, while the backend requires `reply_in_chat`; a user can satisfy the UI and still be rejected by the server.
- The builder lets a user choose a dynamically discovered Anthropic, Gemini or custom model, while the backend accepts only three OpenAI model identifiers and always executes with the server's platform key.
- Chat surfaces can report that a local demo assistant was “connected” in production even though no server deployment occurred and no provider response will be generated.
- The local tool runtime can report `executed: true` when no executor exists.
- Approval is not bound to the arguments later executed; the caller can supply different arguments after the user approved a summary.
- Provider completion is converted into `confidence = 1.0`, even though transport completion says nothing about factual correctness.
- The backend waits for agent generation inside the user's group-message POST. With a 30-second provider timeout and up to two retries, an ordinary send can remain unresolved while agent work runs.
- “Streaming” events exist server-side but no production invocation enables streaming and the mobile client has no consumer for `chat.agent.stream_delta`.
- AI preference switches, memory policy and many action capabilities are declarative or device-only, not enforced by the authoritative runtime.

### Strategic product direction

Do not add more assistant personas, sparkle buttons or autonomous tools yet. Converge the existing pieces into one **trusted agent control plane** and ship a narrow, excellent first proposition:

> **A marketplace copilot that researches and drafts in the user's real workflow, shows its evidence, and only acts through exact, reversible, policy-bound approvals.**

For the first flagship release, optimize for three jobs:

1. **Sell better:** analyze an item, compare evidence, draft a listing and prepare media—never publish without exact review.
2. **Communicate safely:** draft a reply using conversation and listing context—never send without an exact recipient/payload preview.
3. **Resolve commerce questions:** summarize orders, policies and next steps from authoritative ThryftVerse data with receipts and citations.

The correct autonomy posture is **draft-first, evidence-first, bounded action**. Money movement, account/security changes and destructive operations remain in canonical product flows with fresh authorization.

---

## 2. Current architecture: three products wearing one label

```text
                    CURRENT USER MENTAL MODEL
             Connect provider → create agent → use in chat
                                  │
                                  ▼
                 CURRENT IMPLEMENTATION REALITY

  Mobile BYOK                  Mobile demo runtime              Server bot runtime
  ───────────                  ───────────────────              ──────────────────
  SecureStore/process memory   In-memory deployment map         Postgres bot/install rows
  Direct /models probe         Keyword/mock replies in dev      OpenAI Responses API
  OpenAI/Anthropic/Gemini      AsyncStorage grants/ledger       Group conversations only
  No backend credential link   No registered real tools         Quota/cost/audit records
          │                              │                              │
          └────────────── not one run, policy or audit ────────────────┘
```

| Surface | What the user sees | Actual source of truth | Production condition |
|---|---|---|---|
| AI connections | Connect provider, test key, discover models | Device SecureStore or process memory; direct provider request | Live, but not connected to server agents |
| AI preferences | Recommendation/privacy toggles | Component-local state persisted in AsyncStorage | Not an authoritative server policy |
| Create agent | Provider, model, instructions, memory, capabilities | Mapped through a legacy `ChatBot` contract to `/bots` | Publish contract currently conflicts with backend |
| Chat “Add AI Agent” picker | Choose assistant and see “connected” toast | In-memory `chatAgentsApi` registry | Demo-only behavior; can still claim connection in production |
| Group agent management | Connect/remove a persisted agent | Real backend install transaction | Functional foundation |
| Agent response | Assistant message in group chat | Platform OpenAI key via Responses API | Text generation only; no tool loop |
| Agent activity | Actions and approvals | Device-local AsyncStorage, capped at 500 | Not the server audit record |
| Capability approval | Ask/always allow by risk tier | Device-local grants and in-memory pending approvals | Not enforced by backend agent execution |

The architecture therefore violates the most important psychological requirement: a stable mental model. A user cannot accurately predict which provider will run, where context goes, what “connected” means, whether a permission is authoritative, or where to inspect the complete record.

---

## 3. What is already strong and should be preserved

This is not a rebuild-from-zero recommendation. Preserve these foundations:

### 3.1 Truth-oriented provider setup

`frontend/src/services/aiProviderApi.ts` uses SecureStore when available, avoids plaintext fallback storage, tests credentials with a minimal live provider request and discovers models dynamically. Capability metadata defaults conservatively when the provider does not supply evidence. That is substantially better than a fabricated model catalogue.

### 3.2 Real server runtime and provider hygiene

`backend/api/src/botRuntime/openaiAgent.ts` uses the Responses API, sets `store: false`, supplies a hashed safety identifier, caps output tokens, implements timeouts/retries and records provider request IDs, latency and token usage. Keep this code-first direction. OpenAI's June 2026 lifecycle update says Agent Builder is being wound down in favor of the Agents SDK or code-based workflows, reinforcing this choice. [OpenAI AgentKit lifecycle notice](https://openai.com/index/introducing-agentkit/)

### 3.3 Transactional group deployment

The group deployment endpoints snapshot permissions/configuration, write the install and system message in one database transaction, write audit events and publish realtime deployment events. This is the right shape for authoritative state.

### 3.4 Cost and quota controls

`backend/api/src/lib/aiUsage.ts` reserves per-user and per-conversation hourly quota and records token/cost usage. Keep it, then extend it from response-level accounting to run-, step-, tool- and tenant-level budgets.

### 3.5 A usable risk vocabulary

`frontend/src/platform/agents/capabilityBroker.ts` distinguishes read, draft, external and money/security capabilities, and refuses persistent auto-approval for Tier D. The concept is good. Move enforcement server-side, narrow the scopes and bind decisions to exact operations.

### 3.6 Restrained visual intent

The agent surfaces generally use flat lists, hairlines, transparent hit areas and real product tokens rather than purple gradients, floating orbs and glass cards. The direction matches the repository's anti-AI design charter. The next pass should improve product composition and reduce configuration verbosity, not decorate it.

---

## 4. Release blockers — fix before exposing agentic action

### P0-1 — Publishing an agent is contractually impossible through the current builder

Evidence:

- `frontend/src/screens/BotBuilderScreen.tsx:221` enables publish when `chat.draft_reply` is selected.
- `frontend/src/screens/BotBuilderScreen.tsx:291` sends capability names such as `chat.draft_reply` as backend permissions.
- Per-capability approval modes selected in the builder are discarded during serialization; only enabled names are sent.
- `backend/api/src/botRuntime/agentConfig.ts:58` rejects a published agent unless permissions contain `reply_in_chat`.

Required upgrade:

- Define one shared, versioned agent contract package used by mobile, API validation, persistence and runtime.
- Separate **product capabilities** (`chat.draft_reply`, `listing.publish`) from **runtime data permissions** (`chat.messages.read`) and **execution policies** (`approval_required`). Do not overload one string array for all three.
- Add contract tests that create, read, update, publish, deploy and invoke the same definition end-to-end.
- Reject unsupported combinations in the UI before submission using the server-returned capability catalogue, not duplicated client enums.

Acceptance: a definition serialized by the canonical client schema passes the canonical server schema unchanged; a published test agent can be deployed and invoked against a live endpoint.

### P0-2 — Provider selection is visually real but operationally disconnected

Evidence:

- The builder discovers models from locally connected OpenAI, Anthropic, Gemini and custom providers.
- It casts an arbitrary discovered model through the legacy OpenAI union at `BotBuilderScreen.tsx:275`.
- The backend schema accepts only `gpt-5.6-sol`, `gpt-5.6-terra` and `gpt-5.6-luna`.
- Server execution always uses the platform `OPENAI_API_KEY`; the locally stored user key never reaches or authorizes that runtime.

Required upgrade:

- Choose and label two honest modes:
  - **ThryftVerse managed:** backend model router, platform credentials, published SLO/data policy.
  - **Private provider connection:** either a genuine device-run agent with a signed backend tool proxy, or a server vault connection with explicit consent, KMS/HSM encryption, rotation and retention disclosure.
- Do not present Anthropic/Gemini/custom selection for a server agent until that provider is supported end-to-end.
- Hide provider-specific model IDs behind evaluated internal tiers (`fast`, `balanced`, `frontier`) for normal users; expose advanced pinning only where needed.
- Add a preflight endpoint returning runtime, model snapshot, supported tools, data region, retention policy and readiness.

Acceptance: the runtime receipt for every response names the same provider/model mode the user selected, and unsupported modes cannot be published.

### P0-3 — Two agent deployment systems create false success

Evidence:

- `ChatScreen`, `GroupChatScreen` and `NewMessageScreen` use the local `chatAgentsApi` picker path.
- `chatAgentsApi.deployAgent` only mutates an in-memory map but records runtime as `provider` when demo mode is off.
- The UI immediately emits “connected” success.
- Real deployment exists separately through `deployBotToConversationOnApi` in `BotDetailScreen` and `GroupBotManagementScreen`.

Required upgrade:

- Remove the local deployment path from production navigation.
- Make the in-chat picker query the server's deployable-agent projection and call the real deployment mutation.
- Preserve demo agents only in an explicit developer fixture build with a persistent “Demo” environment marker.
- Use server-returned install status and realtime confirmation before showing success.
- Make DM support explicit: either implement it fully or do not claim “Direct and group chats.”

Acceptance: there is one deploy command, one installed-agent query, one cache invalidation path and one success receipt across every entry point.

### P0-4 — The tool runtime can fabricate execution

Evidence:

- No production code registers a tool executor; `registerToolExecutor` appears only as an exported primitive.
- `frontend/src/platform/agents/agentRuntime.ts:113`, `:143` and `:202` return `executed: true` when no executor/arguments exist.
- `resolveAndExecute` accepts fresh arguments from the caller after approval rather than executing an immutable copy of what was approved.

Required upgrade:

- Fail closed with `executor_unavailable` when the declared tool is absent.
- Move policy and execution to the trusted backend; the mobile broker becomes a presentation/client state layer.
- Persist the pending tool call with canonical JSON, schema version and cryptographic argument hash.
- Bind approval to user, account, agent version, run, tool, target, exact arguments, expiry and permitted execution count.
- Revalidate authentication, authorization, resource state and policy immediately before execution.
- Add idempotency and `unknown_outcome` reconciliation for every side effect.

OpenAI's current human-in-the-loop design pauses the run with the exact parsed tool input and resumes the same serialized run state; malformed calls fail closed. [OpenAI Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)

### P0-5 — “Confidence” is a fabricated trust signal

Evidence:

- `backend/api/src/botRuntime/openaiAgent.ts:112` assigns `confidence = 1.0` when the provider status is `completed`.
- The score is reduced by regular-expression detection of refusals, hedging and short text.
- The result is displayed/stored as response confidence and can trigger a “human review” wrapper.

Provider completion means generation finished; it does not validate truth, evidence, safety or task completion. The current value is uncalibrated and must not be presented as epistemic confidence.

Required upgrade:

- Remove the percentage from user-visible metadata and stop calling it confidence.
- Replace it with independently measurable signals: source coverage, validator result, policy result, tool receipt, contradiction count and outcome verification.
- Use labels such as **Supported**, **Mixed evidence**, **Unverified** or **Action failed**, each tied to a concrete validator.
- Build calibration/evaluation datasets before any numeric certainty display.

Research shows well-calibrated confidence can improve decisions, while miscalibrated confidence increases vulnerability to automation bias. [“Too Sure for Our Own Good,” AAAI 2026](https://ojs.aaai.org/index.php/AAAI/article/view/38798) Explanations alone also do not reliably reduce automation bias and can increase reliance. [Vered et al., Artificial Intelligence 2023](https://www.sciencedirect.com/science/article/pii/S000437022300098X)

### P0-6 — Agent generation blocks the primary chat send request

Evidence:

- The group message route awaits `executeBotCommand` before returning `201`.
- The provider timeout defaults to 30 seconds with up to two retries.
- The user message is already inserted and published, so the client can face an ambiguous send state while background-like agent work is still blocking the request.

Required upgrade:

- Commit and acknowledge the user message independently.
- Append a durable agent-run command to an outbox in the same transaction.
- Execute asynchronously in a worker with a total deadline and cancellation token.
- Stream/push run events by durable sequence and let the client reconnect with its last acknowledged cursor.
- Ensure duplicate message delivery or worker retry cannot duplicate a run or assistant response.

### P0-7 — Group members can expose conversation history without an admin-grade consent boundary

Evidence:

- Deployment calls `ensureGroupConversationAccess`, not `ensureGroupManagementAccess`; ordinary members can connect system agents.
- An agent with `read_messages` receives up to 40 prior user/bot turns.
- The connection UI does not present a just-in-time data disclosure to all affected members.

Required upgrade:

- Restrict deployment and permission changes to group owner/admin policy.
- Post a durable system disclosure naming the AI provider/data classes and provide member-visible removal/report controls.
- Consider explicit group consent for access to history beyond the invoking message.
- Default new group agents to mention-only and current-message context; history access is a separate permission.
- Treat every group message and retrieved artifact as untrusted content for prompt-injection purposes.

### P0-8 — Privacy preferences and memory controls are not authoritative

Evidence:

- `AIPreferencesScreen` persists toggles only to `@thryftverse/ai_prefs`; no runtime reads were found outside that screen.
- `AgentDefinition.memoryPolicy.longTermMemory` is hardcoded false and no durable agent memory implementation consumes the policy.
- Capability grants and the activity ledger are device-local and are not cleared on logout by any production call found in the audit.

Required upgrade:

- Persist AI consent/preferences server-side by account and purpose, with version, region and timestamp.
- Enforce them at every collection and provider-egress point—not merely in UI visibility.
- Split current-run context, chat history, durable user memory and shared/group knowledge.
- Add inspect, correct, forget, export and delete controls with provenance and expiry.
- Clear account-bound local caches/grants on logout and account switch.

### P0-9 — “Human review” publishes the output it claims to hold back

Evidence:

- Low-scored output returns `shouldReply: true` and places the original response in `draftResponse`.
- `buildHumanFallbackText` embeds the original model text below “Draft response (not yet published).”
- The orchestrator then inserts that complete wrapper into `chat_messages` and broadcasts it like any other bot message.
- If streaming is enabled later, raw provider deltas are emitted before the score/review decision exists.

This is not a review queue; it is publication with a warning label.

Required upgrade:

- A review-required result must persist as a private draft artifact with `shouldReply: false`.
- Expose it only to an authorized reviewer, never to all conversation members.
- Stream only into the reviewer's private run surface until the release decision.
- Record reviewer identity, edits, decision and published message ID.
- Remove heuristic “confidence threshold” as the gate; use task/policy validators and explicit workflow rules.

Acceptance: a seeded review-required response produces no public message or public delta before an authorized release mutation.

### P0-10 — Settings exposes three dead navigation controls

Evidence:

- Settings navigates to `AIPreferences` and `AIAgentIntegration`; Connections navigates to `AgentActivity`.
- All three routes exist in navigation types.
- None is registered in `frontend/src/navigation/AppNavigator.tsx`; only `AIPoweredListing` and `AIPhotoEnhancement` are registered in that AI block.

Required upgrade:

- Register the canonical screens with the correct presentation and Back behavior, or remove their settings rows until ready.
- Add a navigation contract test that resolves every visible settings/command-palette destination through the production navigator.
- Do not treat a TypeScript route union as evidence that a route exists.

### P0-11 — Several broader “AI” features become less truthful in production

The agent platform sits beside consumer AI-labelled features whose demo flags are tied to `__DEV__` instead of actual backend capability:

- Smart Sell remains an in-memory simulator but sets `isDemo: false` in production.
- Conversational Search can fall back to client keyword matching while the screen labels the result using a build-time flag rather than the message's actual provenance.
- Photo enhancement production branches can return the unchanged original image with `isDemo: false`.
- AI Quick List infers fields from filenames rather than image recognition.

These are not all agent-runtime defects, but they damage the same user trust contract. The AI truth service should own a per-capability live status (`provider_backed`, `deterministic`, `demo`, `unavailable`) and every result should carry server-issued provenance. Production must fail closed or disclose the actual deterministic behavior; it must never make a mock less visible simply because the build is no longer development.

---

## 5. P1 product-quality gaps

### 5.1 No durable user-facing run

The backend stores messages, usage and audit events, but the user cannot inspect one durable object containing objective, current step, approvals, sources, result and recovery. The mobile pending-approval map disappears on process death. There is no pause, resume, revise, stop or reconcile flow.

Build:

```text
agent_runs
agent_run_events          // append-only and monotonically sequenced
agent_steps
agent_tool_calls
agent_approval_requests
agent_action_receipts
agent_citations
agent_checkpoints
agent_memory_records
agent_notifications
```

Canonical states:

```text
queued → planning → running → waiting_for_user → running
                         ├── paused
                         ├── completed
                         ├── failed
                         ├── cancelled
                         └── unknown_outcome → reconciled
```

Completion means the requested outcome passed verification—not merely that a model returned text.

### 5.2 Streaming is dormant and not resumable

`streamOpenAiAgent` publishes deltas, but normal message and command paths do not set `stream: true`, and the frontend has no `chat.agent.stream_delta` consumer. Even if enabled, the event contains no durable run/step ID or sequence/cursor.

Build semantic events (`search_started`, `source_reviewed`, `draft_ready`, `approval_required`) and use text deltas only inside the current draft step. Do not expose chain-of-thought. OpenAI's current agent products emphasize visible task narration, interruption and takeover; the Agents SDK supports streaming across approval pauses. [ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/), [Agents SDK streaming](https://openai.github.io/openai-agents-js/guides/streaming/)

### 5.3 The backend agent is a text generator, not an action agent

The Responses request defines no tools. Listing research, photo enhancement, search, messages, offers, orders and support already exist elsewhere in the codebase, but none are exposed through a governed server tool registry. The frontend capability catalogue therefore describes future abilities rather than executable behavior.

Start with a tiny typed tool set:

- `catalog.search_readonly`
- `listing.get_own`
- `listing.create_draft`
- `chat.create_reply_draft`
- `order.get_own_status`
- `policy.search_cited`

Do not expose publish, send, offer, purchase, payout or account mutation until the durable approval/receipt path is complete.

### 5.4 The local activity screen is not an audit trail

It is clear, readable and honest about being on-device, but it is mutable, capped, account-agnostic and incomplete. A user can clear it while server bot audits and provider usage remain elsewhere. Rename it **On-device activity** until the authoritative projection exists, then build a server-backed Activity view from immutable run receipts with account-level deletion/retention rules.

### 5.5 Invocation scope and copy disagree

The server automatically evaluates agents only for group messages. Some agent detail copy says an assistant supports “Direct and group chats”; local demo pickers appear in DMs and new-message creation. Either implement a privacy-safe DM runtime or narrow every route, label and entry point to groups.

### 5.6 Agent definitions are not versioned as executable artifacts

Installations snapshot configuration, which is good, but the definition does not carry a canonical schema version, prompt version, provider policy version, tool schema version or evaluation release. Editing a definition must create a new immutable version; deployed conversations should remain on or intentionally migrate from their snapshot.

### 5.7 No agent-specific prompt-injection boundary

The system prompt says not to reveal secrets, but natural-language instruction is not a security boundary. Retrieved conversation history is passed directly to the model. Before tools are enabled, implement structured extraction, least-privilege tool exposure, untrusted-input labels, egress restrictions, tool-output validation and adversarial tests. [OpenAI agent safety](https://developers.openai.com/api/docs/guides/agent-builder-safety), [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)

### 5.8 AI identity is not consistently rendered

Real bot messages can appear as “Member” in the group-chat surface because sender bot IDs are not resolved through the bot catalogue. That is both a usability failure and, for EU users, a transparency risk now that Article 50 applies. Resolve bot identity from the authoritative install projection and render one restrained, persistent AI disclosure on every bot-authored message. Never rely on avatar style or name alone.

### 5.9 Quota and commercial policy are internal-only

The runtime reserves hourly quota before provider execution and does not compensate failed attempts. Users cannot see remaining allowance, expected cost class or why a retry consumed capacity; subscription/entitlement policy is not connected to execution. Define a product budget contract, surface it before invocation where material, record failed-attempt policy separately and bill only according to an explicit published rule.

---

## 6. Flagship UX and psychology

### 6.1 Design for calibrated reliance, not maximum trust

The goal is not to make the agent look confident or human. It is to help the user know when delegation is safe.

- Ask for the user's key judgment before revealing an AI recommendation on high-impact pricing, authenticity or dispute choices.
- Show alternatives, disagreement and missing evidence—not only the preferred answer.
- Use verification prompts only at consequential boundaries; do not turn every read into approval fatigue.
- Keep original evidence beside the generated draft.
- Let users edit the proposed action before approval and make the change visibly take effect.

In a controlled study, cognitive forcing reduced overreliance while explanations alone were unreliable; heavy forcing was less liked, so friction must be risk-adaptive. [Buçinca, Malaya & Gajos, CHI 2021](https://www.eecs.harvard.edu/~kgajos/papers/2021/bucinca2021trust.shtml)

### 6.2 Approvals must communicate consequence, not implementation

Do not ask “Allow `chat.send`?” Ask:

```text
Send this message to Maya?

“I can post tomorrow. Would £82 work?”

Visible to: Maya
Effect: sends immediately; you can delete only for yourself after the server window closes
Data sent to: ThryftVerse chat service

[Edit]                         [Send]
```

Each approval must show target, payload, visibility, data leaving the app, reversibility, expiry and whether it applies once or to a narrow scope. Changed arguments require a new approval.

Human approval is not the only safeguard. Anthropic reported that permission attention falls as prompts accumulate; containment and least privilege should eliminate routine prompts so judgment is reserved for real consequence. [Anthropic containment engineering, 25 May 2026](https://www.anthropic.com/engineering/how-we-contain-claude)

### 6.3 Progress must reduce uncertainty without theater

Use one compact run surface:

```text
Researching recent sold prices · 4 sources reviewed                  Stop
```

Expandable detail can show completed actions and source receipts. Avoid fake percentages, pulsing orbs, simulated typing and token-by-token logs for internal work. Apple recommends concrete status such as “Summarizing key themes,” accurate progress indicators, correction/retry paths and background handling for longer generation. [Apple Generative AI HIG](https://developer.apple.com/design/human-interface-guidelines/generative-ai)

### 6.4 Interruption is a functional state

Support four separate meanings:

- **Pause:** stop before the next safe step.
- **Stop:** cancel model generation and prevent new tool calls.
- **Revise:** change a requirement and supersede the old plan revision.
- **Retract:** explicitly remove a previous requirement.

If an external mutation may already have occurred, stopping cannot display failure or success; it enters `unknown_outcome` until reconciled.

### 6.5 Evidence belongs at the claim

For price research, authenticity, policy and safety guidance:

- inline, tappable citations;
- source title/domain/date and retrieval time;
- distinguish cited from merely consulted sources;
- expose conflicts and unsupported claims;
- open the original source/artifact beside the summary;
- “no evidence found” is not “false.”

OpenAI requires visible clickable citations for web-search results shown to users. [OpenAI web search guidance](https://developers.openai.com/api/docs/guides/tools-web-search)

### 6.6 Memory must be inspectable, scoped and reversible

Do not describe memory anthropomorphically. Show exactly what is stored:

```text
Preferred shipping: Royal Mail tracked
Scope: Selling assistant
Source: Listing draft on 18 Aug
Expires: Never
[Edit] [Forget]
```

Current-run context, conversation history, durable personal memory and group knowledge need separate switches and retention. Never infer or store sensitive traits by default. Credentials, payment data and private-message content never enter fuzzy memory.

### 6.7 Accessibility requirements

- 44pt minimum practical iOS targets and 48dp Android targets.
- Announce semantic state changes, not every streamed token.
- Status/risk never relies on color alone.
- Approvals and failures remain until explicitly resolved.
- Stop/Cancel stays in screen-reader order and reachable at large text.
- Reduced-motion removes pulses and large transitions.
- Agent picker needs an explicit Close control and modal accessibility semantics, not only a backdrop tap.

---

## 7. Anti-AI product and visual policy

Flagship agent UX should look like ThryftVerse doing useful work—not like an AI theme applied to the app.

### Keep

- Assistance embedded at the real object: **Draft listing**, **Compare sold prices**, **Improve photo**, **Draft reply**.
- The listing, message, order, image or comparison as the dominant object.
- One disclosure grammar, one progress grammar, one approval grammar and one source grammar.
- Flat canvas, hairlines and restrained status treatment.
- Human-editable artifacts as the output.

### Remove or avoid

- Universal sparkle buttons and vague “Ask AI” labels.
- Purple gradients, glowing spheres, faux-human agent portraits and decorative neural imagery.
- A card for every step or capability.
- Repeated “AI-powered,” “intelligent” and “agent” labels around an obvious object.
- Theatrical typing, fake determinate progress, congratulatory success copy and excessive haptics.
- Long security/privacy paragraphs inside the primary task flow. Use concise disclosure plus a details page.
- A 40-capability configuration form before the user has experienced value.

### Re-author the builder

The current builder exposes provider, model, trigger, tone, response length, memory and risk groups in one long configuration surface. That is technically expressive but cognitively expensive and prototype-like.

Use progressive disclosure:

1. **Choose the job:** Selling copilot, Reply assistant, Group helper.
2. **Define success:** one sentence plus example tasks.
3. **Preview behavior:** run against a synthetic/private test case.
4. **Review access:** human-language data scope and actions.
5. **Publish:** deployment target and member disclosure.
6. Advanced settings: model tier, context window, trigger and detailed policy.

The user should encounter capability details at the moment they matter, not as a wall of abstract permissions.

---

## 8. Target production architecture

```text
Mobile app
  ├─ starts/observes run with short-lived scoped session
  ├─ renders sequenced semantic events and artifacts
  └─ approves exact parameter-bound actions
            │
            ▼
Agent control plane
  ├─ identity + tenant + policy engine
  ├─ immutable agent/version registry
  ├─ model router + provider/data policy
  ├─ durable workflow/checkpoint engine
  ├─ tool registry + schema/egress enforcement
  ├─ approval service + action receipts
  ├─ memory service + consent/retention
  ├─ trace/eval/cost controls
  └─ incident kill switches
            │
            ├─ first-party domain APIs (preferred)
            ├─ MCP tools/context (allowlisted, untrusted output)
            └─ A2A only across genuine agent trust boundaries
```

### Core invariants

- Server policy is authoritative; mobile state cannot grant a capability.
- Every tool has strict input/output schemas and risk metadata.
- Authorization is rechecked at execution time.
- Credentials are short-lived, audience-bound and unavailable to model-visible memory.
- External content and tool descriptions are untrusted.
- Side effects are checkpointed, idempotent and receipted.
- A timeout after dispatch creates `unknown_outcome`, not false failure/success.
- Runs have duration, step, tool, token and cost ceilings.
- User-visible events are derived from authoritative records, never generated prose.
- Model, prompt, policy and tool versions are pinned to each run.
- Kill switches exist by model, tool, provider, tenant and agent version.

MCP should connect an agent to tools/context; A2A should be reserved for independent agents communicating across an explicit boundary. NIST's 2026 Agent Standards Initiative likewise centers secure identity, authorization and interoperability rather than unconstrained autonomy. [NIST AI Agent Standards Initiative](https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative)

---

## 9. State matrix for every touched agent surface

| State | User treatment | Backend requirement |
|---|---|---|
| Loading | Skeleton matching final geometry | Bounded initial query |
| Ready | Concrete job and supported scope | Versioned capability projection |
| Queued | “Queued” plus cancel | Durable run row |
| Running | One semantic current step; Stop | Sequenced events/heartbeat |
| Waiting for input | Exact question and effect | Durable interruption |
| Waiting for approval | Parameter-bound preview | Expiring approval row/hash |
| Paused | Resume, revise or cancel | Checkpointed safe boundary |
| Partial | Preserve completed artifacts; name missing parts | Per-step result status |
| Offline | Last confirmed state and reconnect action | Cursor-based replay |
| Failed | Plain reason, safe retry/edit route | Typed failure and retry policy |
| Unknown outcome | Warning, Check result, no success | Reconciliation worker/idempotency |
| Completed | Verified artifact/receipt, not celebration | Definition-of-done validator |
| Cancelled | State what did and did not happen | Cancellation receipt |
| Permission denied | Explain scope and allow task revision | Fail-closed policy result |
| Provider unavailable | Preserve draft and offer supported route | Circuit breaker/readiness |

---

## 10. Delivery plan

### Wave 0 — Truth closure and release gating (1–2 weeks)

1. Disable the local chat-agent picker outside explicit demo builds.
2. Make agent labels disclose AI interaction consistently.
3. Replace the publish permission mismatch with one shared contract.
4. Remove fabricated confidence and false `executed: true` states.
5. Stop claiming unsupported DM/provider/memory capability.
6. Decouple group message acknowledgement from agent generation.
7. Restrict group agent deployment to owner/admin pending a consent policy.
8. Turn review-required output into a private draft, never a public wrapper/delta.
9. Register or remove the three dead settings destinations.
10. Make demo/deterministic/provider-backed provenance runtime-derived across every AI-labelled feature.

Exit gate: no visible control claims a capability that a live endpoint cannot verify.

### Wave 1 — One read/draft-only vertical slice (2–4 weeks)

Build one durable **Listing Copilot** run:

```text
select owned listing → inspect real listing/media → search real comps
→ cited comparison → editable title/description/price draft
→ apply to listing draft → undo
```

No publish, send, offer or money tools. Ship the durable run/event schema, model router, trace IDs, citations, offline reconnect, cancel and authoritative activity projection with this slice.

Exit gate: verified end-to-end task success, app-restart recovery and zero fabricated completion across fault injection.

### Wave 2 — Exact approvals and external communication (3–5 weeks)

Add `chat.send` and `listing.publish` only after:

- exact payload-bound approvals;
- fresh authorization;
- idempotency and transactional outbox;
- action receipts and unknown-outcome reconciliation;
- Edit/Deny/Stop/Undo where semantically possible;
- adversarial prompt-injection and approval-substitution tests.

### Wave 3 — Memory and provider choice (3–5 weeks)

- Inspectable account memory with provenance, scope, expiry, correction and deletion.
- Managed provider routing as default.
- Private-provider mode only when its execution/data boundary is real end-to-end.
- Region/retention policy enforcement and provider incident kill switches.

### Wave 4 — Interoperability and advanced automation

- MCP allowlisted connectors after the first-party tool broker is mature.
- Scheduled/background runs with concise milestone notifications.
- A2A only for a demonstrated cross-agent workflow; no internal microservice theater.
- Sandbox/code execution only for a measured use case with separate threat model.

---

## 11. Evaluation, SLOs and repository-management discipline

Large companies do not manage production agents by prompt review alone. Every release must bind code, model, prompt, policy, tool schemas and evaluations into one deployable version.

### Required release artifacts

- Versioned agent definition and migration.
- Capability/data-flow threat model.
- Golden and adversarial trajectory datasets.
- Prompt/tool/policy diffs reviewed by domain, security and privacy owners.
- Canary plan, rollback and kill-switch owner.
- Provider/data-retention inventory.
- User-support and incident playbooks.
- Product analytics with privacy-aware sampling.

### Core metrics

- Verified end-to-end task success.
- Wrong external-action rate.
- Unknown-outcome rate and reconciliation time.
- Tool selection and argument correctness.
- Unnecessary-action rate and maximum loop depth.
- Approval accept/deny/edit/abandon by risk tier.
- Undo/correction rate.
- Source-supported claim coverage and citation correctness.
- Seeded-wrong-answer acceptance rate for automation-bias testing.
- P50/P95 time to first meaningful feedback, completion and blocked time.
- App-restart/offline recovery rate.
- Cost and token budget by completed outcome—not by message.
- Memory inspection/deletion success and sensitive-memory violations.
- Screen-reader completion and large-text overflow.

Evaluate full trajectories, not just final prose. OpenAI's current guidance provides agent evals and trace grading; Anthropic similarly recommends multi-trial evaluation because agent behavior is non-deterministic. [OpenAI agent evals](https://developers.openai.com/api/docs/guides/agent-evals), [OpenAI trace grading](https://developers.openai.com/api/docs/guides/trace-grading), [Anthropic agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### Security gates

Include direct/indirect prompt injection, hidden text, malicious documents, hostile tool output, malicious MCP descriptions, cross-tool exfiltration, replay, approval substitution, expired approval, account switch, memory poisoning, provider fallback mismatch, duplicate webhook/event and ambiguous side-effect tests. Use OWASP AISVS 1.0 and the OWASP Top 10 for Agentic Applications 2026 as current baselines, alongside NIST AI RMF/NIST AI 600-1. [OWASP Agentic Top 10](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/), [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework)

---

## 12. Privacy, transparency and regulatory readiness

This section is product/engineering research, not legal advice.

- Maintain a data-flow inventory per agent, provider, tool and memory class.
- Disclose which data leaves ThryftVerse before transmission.
- Do not equate `store: false` with zero retention; OpenAI documents separate abuse-monitoring and application-state rules. [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
- Provide meaningful human review for consequential decisions; a rubber stamp is not oversight. [UK ICO AI and individual rights guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/artificial-intelligence/guidance-on-ai-and-data-protection/how-do-we-ensure-individual-rights-in-our-ai-systems/)
- EU Article 50 transparency obligations apply from 2 August 2026 and require people to be informed when they interact with AI; relevant generated/manipulated content also needs marking/labeling. [European Commission Article 50 guidance](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations)
- Preserve C2PA or equivalent provenance where generated media supports it; absence of a mark is not evidence of human authorship.

Immediate repository implication: every AI-authored chat message, published listing field or generated/altered media artifact needs stable provenance metadata and a restrained, consistent user disclosure.

---

## 13. Acceptance definition for “flagship”

The feature is not flagship because it streams text, supports many providers or has an activity screen. It is flagship when all of the following are true:

1. A user can accurately explain what the agent can access, where work runs and what it may do.
2. One canonical definition works from create → publish → deploy → invoke → inspect → revoke.
3. A run survives app/background/process failure without losing approvals or duplicating effects.
4. The user can stop, revise and recover at any meaningful stage.
5. Every consequential action has exact approval, authoritative receipt and honest outcome.
6. Every factual/high-stakes claim exposes evidence or says it is unverified.
7. Memory is visible, scoped, correctable and deletable.
8. Security policy remains effective when model output and retrieved content are malicious.
9. Changes cannot ship without version-bound trajectory, safety, privacy, latency and cost gates.
10. The rendered UI is the marketplace product—not an AI dashboard—and passes native accessibility/large-text/reduced-motion checks.

Until P0-1 through P0-11 are closed, the correct release status for user-facing action agents is:

> **PARTIAL — BACKEND CAPABILITY BLOCKER**

The existing platform-managed text agent can remain a tightly scoped internal/beta capability after its confidence, latency, consent and run-state defects are corrected. Tool-using autonomy should remain disabled.

---

## 14. Primary implementation evidence

- `frontend/src/screens/AIAgentIntegrationScreen.tsx`
- `frontend/src/screens/AIPreferencesScreen.tsx`
- `frontend/src/screens/AgentActivityScreen.tsx`
- `frontend/src/screens/BotBuilderScreen.tsx`
- `frontend/src/screens/BotDetailScreen.tsx`
- `frontend/src/screens/GroupBotManagementScreen.tsx`
- `frontend/src/screens/ChatScreen.tsx`
- `frontend/src/components/chat/ChatAgentPicker.tsx`
- `frontend/src/services/aiProviderApi.ts`
- `frontend/src/services/chatAgentsApi.ts`
- `frontend/src/services/botsApi.ts`
- `frontend/src/services/chatApi.ts`
- `frontend/src/services/agentActivityLedger.ts`
- `frontend/src/platform/agents/agentDefinition.ts`
- `frontend/src/platform/agents/capabilityBroker.ts`
- `frontend/src/platform/agents/agentRuntime.ts`
- `backend/api/src/routes/bots.ts`
- `backend/api/src/botRuntime/agentConfig.ts`
- `backend/api/src/botRuntime/openaiAgent.ts`
- `backend/api/src/botRuntime/index.ts`
- `backend/api/src/lib/aiTruth.ts`
- `backend/api/src/lib/aiUsage.ts`
- `backend/api/src/db/migrations/056_ai_chat_agents.sql`
- `backend/api/src/db/migrations/068_ai_usage_and_policy_closure.sql`

## 15. Current-source index

- [Apple Generative AI Human Interface Guidelines, updated June 2026](https://developer.apple.com/design/human-interface-guidelines/generative-ai)
- [OpenAI next evolution of the Agents SDK, April 2026](https://openai.com/index/the-next-evolution-of-the-agents-sdk/)
- [OpenAI Agents SDK human-in-the-loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)
- [OpenAI agent safety](https://developers.openai.com/api/docs/guides/agent-builder-safety)
- [OpenAI agent evals](https://developers.openai.com/api/docs/guides/agent-evals)
- [Anthropic trustworthy agents research, April 2026](https://www.anthropic.com/research/trustworthy-agents)
- [Anthropic containment engineering, May 2026](https://www.anthropic.com/engineering/how-we-contain-claude)
- [NIST AI Agent Standards Initiative, 2026](https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative)
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [MCP July 2026 protocol release](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [A2A protocol 1.0](https://a2a-protocol.org/latest/specification/)
- [EU Article 50 transparency guidance, August 2026](https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations)

## 16. Audit validation and limitations

- Workspace and Git identity were verified before research.
- Findings were traced across route/screen/service/runtime/API/database boundaries and checked against the production navigator.
- Three bounded read-only research streams covered code, user psychology/product practice and platform/security architecture; the main audit independently verified the release-blocking findings.
- `git diff --check` passed for this report.
- TypeScript and automated tests were not run because this pass changes documentation only; the report identifies missing end-to-end contract tests as a material gap.
- No native device/emulator render or live provider/database execution was performed. Visual findings are code/composition based, and runtime conclusions are static code-path conclusions.
- The pre-existing dirty worktree was preserved. This report is the only file created by this task.
