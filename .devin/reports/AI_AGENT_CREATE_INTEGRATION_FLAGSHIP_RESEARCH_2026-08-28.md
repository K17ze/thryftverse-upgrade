# ThryftVerse AI Agent Creation & Integration

## Flagship product research, codebase diagnosis, and production upgrade blueprint

**Research date:** 28 August 2026  
**Repository:** thryftverse-upgrade  
**Branch audited:** feat/product-detail-contract-media-device-closure  
**Starting commit:** 60aabc49f6233c3a6cf73ec394e0a91f2b0a4d61  
**Scope:** Native frontend, API/backend, persistence, runtime, permissions, provider integrations, deployment, observability, evaluations, security, accessibility, and product psychology  
**Deliverable type:** Research and implementation specification. This report does not change production behavior.

---

## 1. Executive conclusion

The current AI-agent surface feels shallow and overdone because its visual complexity is not backed by equivalent system capability.

The frontend presents a large amount of agent language—providers, models, 32 capabilities, approval modes, memory, readiness, deployment, global pause, and an activity ledger—but the backend is a narrow OpenAI chat-response runtime. Several high-trust controls are discarded during save, operate only on local demo state, or have no server implementation. This creates the most damaging form of “AI-made slop”: not merely generic styling, but **decorative operational depth**.

The current product is actually three partially overlapping systems:

1. A real backend bot runtime using a server-owned OpenAI key and a small legacy permission vocabulary.
2. A newer frontend agent-definition and capability model stored partly in local state.
3. A separate demo agent catalogue and in-memory deployment runtime used by prominent chat controls.

These systems do not share one authoritative definition, deployment state, provider connection, permission policy, run ledger, or lifecycle. The UI therefore cannot truthfully answer basic questions:

- Which provider and credential will execute this agent?
- What exact actions can it perform?
- Which approval policy is actually enforced?
- What version is deployed to this conversation?
- Is it paused on the server?
- What did it do, why, and with whose authority?
- What happens after a timeout or unknown mutation outcome?
- Has this version passed any evaluation?

The correct flagship direction is not “add more settings.” It is:

> Build one server-authoritative, versioned agent system; then expose it through a restrained, evidence-rich native studio organized around purpose, capabilities, control, testing, deployment, and real run health.

### Immediate release position

Do not visually polish the current builder in place and declare the feature upgraded. First remove false claims and unify the execution contract. A more attractive facade over disconnected authority would make the trust problem worse.

### Highest-priority defects

| Priority | Defect | User consequence |
|---|---|---|
| P0 | Frontend publishes chat.draft_reply; backend requires reply_in_chat | The normal publish path is contractually broken |
| P0 | Device-local provider connections do not power the server runtime | “Connected” providers are not real execution integrations |
| P0 | Approval modes are discarded on save | The most consequential safety settings are decorative |
| P0 | “Pause all agents” clears only a frontend Map | Real backend agents may continue after the UI says paused |
| P0 | Chat has separate demo and production deployment systems | Agent state changes depending on which screen the user opens |
| P0 | Backend permissions fail open when a snapshot is empty | Malformed or legacy installs can reply without an explicit grant |
| P0 | Runtime sends no tools to the model | Most displayed capabilities cannot execute |
| P0 | Only the first matching installed agent runs, without deterministic ordering | Multi-agent behavior is nondeterministic and incomplete |
| P1 | Agent execution blocks message creation for provider retries | Chat latency and availability are coupled to model execution |
| P1 | No durable run/idempotency/unknown-outcome model | Retries can duplicate work and ambiguous mutations cannot be reconciled |
| P1 | Deployments do not pin immutable versions | Editing a bot silently changes all live installations |
| P1 | Ordinary group members can deploy or remove agents | Group automation governance is too permissive |

---

## 2. Research method and evidence standard

This report combines:

- Top-down code tracing: route → screen → store → service → API → database → runtime.
- Bottom-up code tracing: schema → route → runtime → event → API client → state → UI.
- A frontend surface audit across directory, creation, provider connection, detail, deployment, chat picker, and ledger.
- A backend audit across CRUD, deployment, runtime invocation, provider calls, permissions, usage accounting, audit events, and migrations.
- Current primary-source research available on 28 August 2026.
- Human-centered AI guidance, agent security standards, and native mobile interaction guidance.

The report distinguishes:

- **Observed:** directly supported by repository code.
- **Verified external capability:** supported by a linked primary source.
- **Recommendation:** a synthesis for ThryftVerse, not a claim that every benchmark product implements it identically.

No supplied reference screenshots were available. No native emulator render was required for this research-only task. Visual conclusions are therefore based on canonical TSX structure, style composition, interaction flow, and the repository’s own flagship design charter. Native comparative capture remains mandatory during implementation.

---

## 3. What exists today

### 3.1 Canonical frontend surfaces

| Surface | Canonical file | Current role |
|---|---|---|
| Agent directory | frontend/src/screens/BotDirectoryScreen.tsx | Browse system and custom bots |
| Your agents | frontend/src/screens/CustomBotsScreen.tsx | List locally stored/API-backed custom bots |
| Create/edit | frontend/src/screens/BotBuilderScreen.tsx | Long-form identity, behavior, model, capability, and memory editor |
| Detail | frontend/src/screens/BotDetailScreen.tsx | Bot summary, permissions, deployment entry |
| Group management | frontend/src/screens/GroupBotManagementScreen.tsx | Real backend deploy/remove flow |
| Connections | frontend/src/screens/AIAgentIntegrationScreen.tsx | Device-local provider key verification and model discovery |
| Activity | frontend/src/screens/AgentLedgerScreen.tsx | Device-local activity list |
| Chat picker | frontend/src/components/chat/ChatAgentPicker.tsx | Demo catalogue picker |
| Agent definition | frontend/src/platform/agents/agentDefinition.ts | Richer frontend-only capability model |
| API bot contract | frontend/src/domain/chat.ts:1-40 | Narrow legacy persisted behavior contract |
| Bot API | frontend/src/services/botsApi.ts | Live CRUD |
| Demo runtime | frontend/src/services/chatAgentsApi.ts | Hard-coded catalogue and in-memory deployment |
| Local broker | frontend/src/platform/agents/capabilityBroker.ts | Device-local grants |
| Local runtime | frontend/src/platform/agents/agentRuntime.ts | Local approval/executor abstraction |

Navigation is fragmented. Settings exposes Agents, Connections, and Your agents separately at frontend/src/screens/SettingsScreen.tsx:817-842. Chat settings separately exposes Your agents and Agent library at frontend/src/screens/ChatSettingsScreen.tsx:87-100. Group chat offers demo agents from the composer, while Group Info manages production bots. There is no coherent Agent Studio mental model.

### 3.2 Canonical backend surfaces

| Layer | Canonical file | Current role |
|---|---|---|
| CRUD | backend/api/src/routes/bots.ts | Create, read, update, delete custom bots |
| Deployment routes | backend/api/src/index.ts:23697-23867 | Install/remove bots in conversations |
| Invocation | backend/api/src/index.ts:22096-22110 | Runs agents synchronously after message creation |
| Runtime orchestration | backend/api/src/botRuntime/index.ts | Matches bots, loads history, invokes provider, persists response |
| Config normalization | backend/api/src/botRuntime/agentConfig.ts | Legacy model and permission validation |
| Provider adapter | backend/api/src/botRuntime/openaiAgent.ts | Direct OpenAI Responses request |
| Types | backend/api/src/botRuntime/types.ts | Narrow OpenAI-only runtime contract |
| Base bot schema | backend/api/src/db/migrations/010_chat_groups_and_bots.sql | chat_bots and installs |
| Agent additions | backend/api/src/db/migrations/029_bots_and_deployments.sql and 056_ai_chat_agents.sql | ownership, runtime mode, permissions, JSON config, snapshots |
| Usage accounting | backend/api/src/db/migrations/068_ai_usage_and_policy_closure.sql | AI usage events |

The actual path is:

**BotBuilderScreen → Zustand store → botsApi → POST/PATCH /bots → chat_bots.agent_config and permissions → deploy endpoint → chat_bot_installs → user message → executeBotCommand → OpenAI Responses API → chat_messages, chat_bot_audit_events, ai_usage_events → realtime chat event**

The competing chat path is:

**GroupChat → ChatAgentPicker → hard-coded chatAgentsApi catalogue → in-memory deployedAgentsByConversation → deterministic demo suggestions**

This split is the central product defect.

---

## 4. Capability truth matrix

| Product claim or control | UI state | Persisted/server truth | Verdict |
|---|---|---|---|
| Connect OpenAI, Anthropic, Gemini, or custom provider | Keys verified and stored on device | Server runtime only reads OPENAI_API_KEY and accepts three fixed OpenAI models | Misleading |
| Select dynamically discovered model | Builder accepts discovered IDs | Backend schema rejects most IDs and has no provider reference | Broken contract |
| Always ask / Ask once / Never ask | Configurable per capability | approvalMode is discarded during serialization | Decorative |
| 32 capabilities | Visible and selectable | Runtime recognizes only reply_in_chat/read_messages and sends no tools | Decorative |
| Ready to publish | Based on local fields and chat.draft_reply | Backend requires reply_in_chat and no verified connection | False positive |
| Pause all agents | Immediate global-looking action | Clears only demo in-memory state | False authority |
| Active agent sessions | Count shown in Connections | Counts demo registry only | Incomplete |
| Agent activity ledger | Presented as actions/approvals record | Device-local, clearable, unrelated to backend audit/usage | Incomplete |
| Conversation context setting | Builder stores history count | History access is not governed by the same namespaced grant system | Inconsistent |
| Confidence threshold / human review | Backend heuristic exists | No durable reviewer queue; low-confidence draft still enters chat fallback | Theatre |
| Deployment snapshot | Database stores configuration_snapshot | Runtime reads live bot config instead of snapshot | Non-authoritative |
| Streaming | Runtime code exists | No production caller enables it; unsafe retry semantics if enabled | Dead path |
| Multiple agents | UI can deploy several | Runtime returns after first match with nondeterministic DB order | Incorrect |

This matrix explains the user’s “shallow and overdone” diagnosis precisely: the interface spends visual weight on concepts that do not survive the data path.

---

## 5. Root-cause frontend audit

### 5.1 The builder is a settings questionnaire, not an agent studio

BotBuilderScreen.tsx is a 1,056-line single-scroll form. The primary composition at lines 319-659 includes:

- Navigation title.
- Decorative intro title and explanatory body.
- Identity heading and detail.
- Instructions.
- Trigger behavior.
- Voice and model.
- Capabilities.
- Memory.
- Conversation starters.
- Readiness panel.
- Two competing bottom actions.

All 32 capabilities can appear at once, split into four equally styled groups. Each enabled capability can expand approval chips. Nearly every section repeats a title plus explanatory subtitle. Option grids, outlined rows, chips, panels, and buttons carry similar visual weight.

The result fails both flagship visual checks:

- **Thumbnail test:** the silhouette is repeated form blocks and rounded/outlined controls; no dominant object communicates “this is an agent that does a job.”
- **Squint test:** chrome dominates purpose, evidence, and outcome. The actual agent is invisible.

### 5.2 Why it reads as AI-generated

The issue is not simply “too many cards.” It is a set of authorship failures:

1. **Label-everything disease.** Navigation title, intro, section name, helper copy, field label, and option description repeatedly explain the same concept.
2. **Equal-weight complexity.** Identity, model IDs, context turns, risk tiers, and high-risk grants are visually peers even though their decision stakes differ radically.
3. **Configuration before purpose.** The first meaningful task is naming the agent, not defining what outcome it should produce, for whom, when, and how success is judged.
4. **No live causality.** There is no test run, trace, tool simulation, sample input/output, or evidence that a selected setting changes behavior.
5. **Technical leakage.** Raw provider IDs, model IDs, dotted capability names, and context counts appear without a user-centered task model.
6. **Safety as decoration.** Approval chips look sophisticated, but their value is discarded.
7. **Readiness as copy.** “Ready to publish” is a styled conclusion, not a server-evaluated release gate.
8. **No lifecycle.** Create/edit is treated as one large modal form. Testing, evaluation, deployment, observation, versioning, rollback, and improvement are absent.

### 5.3 The Connections screen is visually verbose and functionally narrow

AIAgentIntegrationScreen.tsx is nearly 1,000 lines. It includes:

- Header title and subtitle.
- Summary title and subtitle.
- Uppercase “AGENT MANAGEMENT.”
- Management rows.
- Uppercase “PROVIDERS.”
- Provider name, description, status, masked key surface, endpoint, validity note, model block, storage note, multiple actions.
- A long security explanation.

Yet the screen performs only client-side key storage, /models-style verification, and model discovery. It does not bind a connection to an agent, define credential ownership, expose scopes, verify inference/tool compatibility, set an environment, show health freshness, or power the backend runtime.

That mismatch causes visual shallowness. A short screen can feel deep if every row is operational. A long screen feels shallow when most copy surrounds a single API-key test.

### 5.4 State completeness is below production quality

Observed missing or collapsed states:

- Direct edit does not fetch an absent bot by ID; it can silently become create.
- No builder loading, missing-agent, offline, conflict, stale-version, partial-save, or unknown-outcome state.
- Provider-list failures become “no providers.”
- Model-discovery failures become an empty list/manual input without diagnosis.
- Save requirements lack inline error ownership.
- Back navigation has no unsaved-change protection.
- No autosave or recoverable draft.
- Integration test has no complete try/finally protection.
- Disconnect lacks confirmation, pending protection, and recovery.
- “Connected” can mean merely that a key exists, not that it is currently authorized.
- Network, quota, provider outage, and authentication errors collapse into “invalid.”
- Detail has a not-found state but no loading/retry.
- Disabled agents have no disable/re-enable control.

### 5.5 Accessibility and scalability defects

Strengths worth retaining include practical touch targets, labels on many icon controls, selected-state exposure, and text accompanying status color.

Required fixes:

- Section headings need header semantics.
- Readiness changes need live announcements.
- Disabled publish must expose the exact blocking reasons.
- Global pause needs state-aware accessibility and should not use a chevron that implies navigation.
- Connection rows need one coherent accessible label containing provider, account, environment, health, and last verification.
- Model and capability lists require virtualization or drill-in, not eager ScrollView rendering.
- Dense chip grids and equal-width action rows need large-text testing.
- Creation CTA and empty states need explicit roles and labels.
- Recreating style sheets inside repeated helper components should be eliminated.

---

## 6. Root-cause backend audit

### 6.1 The persisted contract is too narrow

The frontend API model in frontend/src/domain/chat.ts:1-10 and backend config support approximately:

- Instructions.
- Model.
- Trigger mode.
- Response length.
- Tone.
- Reasoning effort.
- History limit.
- Conversation starters.

It does not contain provider connection identity, tool definitions, approval policy, knowledge, triggers beyond chat, structured output, fallback routing, budgets, retention, version, release status, evaluation result, or deployment environment.

The richer frontend AgentDefinition in frontend/src/platform/agents/agentDefinition.ts is a shadow contract. BotBuilder maps it down to the legacy type, hardcodes long-term memory off, hardcodes reasoning to medium, flattens grants to strings, and loses provider identity. The app therefore has no canonical agent definition.

### 6.2 Provider architecture is internally contradictory

Frontend:

- Stores raw provider keys locally.
- Discovers models directly from OpenAI, Anthropic, Gemini, or a custom endpoint.
- Allows arbitrary discovered model IDs.

Backend:

- Uses a server environment OpenAI key.
- Allows only three fixed OpenAI model strings.
- Has no provider adapter interface beyond OpenAI.
- Has no opaque connection reference or secret vault.
- Forces newly created agents into runtime_mode = ai.

A local credential cannot invisibly power a server runtime. ThryftVerse must choose an honest architecture:

1. **Server execution:** provider credentials or OAuth references are stored in a server-controlled encrypted vault and agents bind to opaque connection IDs.
2. **Device execution:** the agent actually executes on device, with explicit limitations around background work, group participation, reliability, and shared state.

The current hybrid presents the benefits of both while implementing neither.

For the existing group-chat product, server execution is the coherent choice because agents must run when the creator’s device is absent, enforce group authorization centrally, maintain durable state, and emit shared results.

### 6.3 Permissions are not a security boundary

The frontend taxonomy includes 32 namespaced capabilities. The backend accepts arbitrary strings, understands only reply_in_chat and read_messages, and sends no tool schemas to the model. Empty permission snapshots fail open for replies at backend/api/src/botRuntime/index.ts:406-410.

The local Capability Broker stores grants in AsyncStorage. No client-side grant store can authorize server-side access to wallets, offers, profiles, listings, security actions, or messages. Authorization must occur at the resource-owning backend handler at execution time.

Correct rule:

> The model can propose a tool call. The server policy engine decides whether that exact operation, resource, actor, credential, deployment, and version is allowed. A human approval can grant a narrowly scoped continuation. The downstream domain service still enforces authorization.

### 6.4 Runtime execution is not durable

Today agent execution is awaited inside message creation. Provider timeout can reach 30 seconds with retries. There is no durable run record, execution lease, cancellation, dead-letter queue, resumable approval, or unknown-outcome state.

Required run model:

**queued → running → waiting_for_approval / waiting_for_input → succeeded**

From any active state, transitions may reach:

**failed / timed_out / cancelled / unknown_outcome**

The key property is durability. A waiting approval must survive a process restart. A provider timeout after a consequential tool request must not be converted to success or blindly retried. Every mutating action needs an idempotency key and a reconciliation method.

### 6.5 Deployments are not versions

The database writes configuration_snapshot during install, but runtime execution reads the current chat_bots.agent_config. Updating a bot silently changes all installed conversations. There is no immutable release, prompt checksum, model capability snapshot, tool schema version, policy version, evaluation gate, staged rollout, or rollback.

A flagship agent product must separate:

- Mutable draft.
- Immutable published version.
- Deployment pinned to a version.
- Environment-specific connection bindings.
- Rollout and rollback state.

### 6.6 Multi-agent behavior is incorrect

The runtime iterates installed candidates but returns after the first candidate. The database query has no deterministic ordering. A first agent without reply permission can prevent later agents from running. Multiple always-on agents therefore do not form an orchestration system; they form a nondeterministic race decided by database order.

ThryftVerse should initially choose one of two explicit policies:

- **Single active responder per conversation:** enforce uniqueness and make priority clear.
- **Orchestrated multi-agent:** a coordinator chooses delegates and composes a final answer under bounded fan-out.

Do not imply free-form multi-agent collaboration until there is deterministic scheduling, ownership, budget, and result composition.

### 6.7 Existing strengths to preserve

The backend is not empty. Valuable foundations include:

- Custom-agent owner checks.
- Transactional delete and deploy/remove flows.
- Conversation membership authorization.
- Decryption of message history at the runtime boundary.
- OpenAI requests with store: false.
- Hashed safety identifiers.
- Provider timeouts and transient retry handling.
- Quota reservation, token accounting, estimated cost, and DSAR inclusion.
- AI health/readiness infrastructure elsewhere in the API.
- Audit and usage tables.
- BullMQ already present as a dependency.
- OpenTelemetry and Sentry dependencies already present.

The upgrade should consolidate these foundations rather than introduce a disconnected second platform.

---

## 7. Current 2026 market baseline

The market has moved beyond “prompt + model + tool toggles.”

### 7.1 OpenAI

OpenAI’s current durable direction is the Responses API and Agents SDK, with agent definitions, provider/model selection, orchestration, guardrails, state, integrations/observability, evaluation workflows, function tools, MCP/connectors, tool search, programmatic tool calling, conversations, background execution, compaction, streaming, and webhooks.

OpenAI’s visual Agent Builder remains a useful UX study for templates, typed edges, preview/debug, trace grading, autosave, and immutable published versions, but it is now a legacy product scheduled to shut down on 30 November 2026. ThryftVerse should learn from its interaction patterns without anchoring architecture to it.

Sources:

- [Agents SDK overview](https://developers.openai.com/api/docs/guides/agents)
- [Responses API create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
- [MCP and connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- [Guardrails and approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)
- [Agent evaluations](https://developers.openai.com/api/docs/guides/agent-evals)
- [Agent Builder deprecation and workflow concepts](https://developers.openai.com/api/docs/guides/agent-builder)

### 7.2 Anthropic

Anthropic’s current guidance emphasizes the distinction between deterministic workflows and autonomous agents, explicit tool contracts, least privilege, prompt-injection defenses, composable patterns, context engineering, and trajectory-aware evaluation. Plan approval is an important interaction pattern: users can approve a bounded sequence rather than suffer repetitive approval dialogs while still retaining interruption for consequential actions.

Sources:

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Trustworthy agents in practice, April 2026](https://www.anthropic.com/research/trustworthy-agents)
- [Agent evaluations, January 2026](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Tool-use contract](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)
- [Prompt-injection mitigation](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks)

### 7.3 MCP and A2A

The current Model Context Protocol specification is 2026-07-28. It defines a modern tool/data integration boundary with per-request capability negotiation and strengthened authorization guidance. Tasks, Skills, and MCP Apps are extensions, not assumptions every server supports.

MCP and A2A are complementary:

- **MCP:** an agent connects to tools, data, prompts, and interactive extensions.
- **A2A:** opaque agents discover one another through Agent Cards and exchange tasks, status, messages, artifacts, streams, and push updates.

ThryftVerse should not label an HTTP endpoint “MCP” or another bot “A2A” merely because it can send JSON. Protocol identity must come from verified capability discovery and versioned contracts.

Sources:

- [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28)
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP July 2026 release notes](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [A2A concepts](https://a2a-protocol.org/latest/topics/key-concepts/)
- [A2A specification](https://a2a-protocol.org/latest/specification)
- [A2A discovery](https://a2a-protocol.org/latest/topics/agent-discovery/)

### 7.4 Microsoft, Google, LangGraph, CrewAI, Zapier, and n8n

These platforms converge on the same lifecycle:

**define → connect → constrain → test → evaluate → publish → observe → improve**

Common production capabilities include:

- Identity, instructions, examples, success criteria.
- Knowledge and retrieval sources.
- Tools/actions and connected agents.
- Triggers, schedules, and channels.
- Credential and environment binding.
- Durable sessions/checkpoints.
- Human-in-the-loop requests.
- Test panels and trace/activity maps.
- Evaluation datasets and graders.
- Immutable or promotable releases.
- Monitoring, cost, latency, and failure analytics.
- Governance, DLP, roles, and approval.

Primary sources:

- [Copilot Studio documentation](https://learn.microsoft.com/microsoft-copilot-studio)
- [Copilot Studio available tool types](https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/tools-available)
- [Microsoft Agent Framework checkpoints](https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints)
- [Microsoft human in the loop](https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop)
- [Google Agent Engine overview](https://cloud.google.com/vertex-ai/generative-ai/docs/reasoning-engine/overview)
- [Google agent tracing](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/manage/tracing)
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangSmith evaluation](https://docs.langchain.com/langsmith/evaluation)
- [Crew Studio, July 2026](https://crewai.com/blog/crew-studio-automated-agent-builder)
- [Zapier Agents builder, May 2026](https://help.zapier.com/hc/en-us/articles/24393442652557-Build-an-agent-in-Zapier-Agents)
- [n8n reliability controls, May 2026](https://blog.n8n.io/make-ai-agents-more-reliable-and-restrict-the-actions-they-can-take/)
- [n8n execution inspection and replay](https://docs.n8n.io/workflows/executions/all-executions/)

### 7.5 Strategic implication

ThryftVerse does not need to copy an enterprise workflow canvas. It does need to meet the same trust and lifecycle baseline in a native, socially aware form:

- One source of truth.
- Real connections.
- Real permissions.
- Safe testing.
- Versioned publishing.
- Durable runs.
- Observable results.
- Honest failure and uncertainty.

---

## 8. Product psychology: what makes the upgrade feel flagship

### 8.1 Start with the job, not the avatar

The current builder starts with identity and personality. That encourages users to design a character before they have defined a useful system.

The first questions should be:

- What outcome should happen?
- For whom?
- What starts it?
- What information may it use?
- What may it change?
- How will the user know it succeeded?
- When must it stop or ask?

This establishes a correct mental model: the agent is a bounded delegate, not a magical personality.

### 8.2 Progressive commitment, not immediate configuration debt

Users should be able to:

1. Describe the job in natural language or choose a real template.
2. Receive an editable draft.
3. Test with synthetic/read-only data.
4. Connect accounts only when the relevant capability requires them.
5. Grant production scopes only at deployment.

This reduces abandonment and avoids requesting sensitive credentials before value is visible.

### 8.3 Progressive disclosure, not feature removal

Flagship simplicity is not shallow minimalism. The solution is two levels:

- **Core:** purpose, trigger, connected capabilities, autonomy level, test result, publish status.
- **Advanced:** model routing, token/cost limits, retries, structured output, compaction, concurrency, retention, network policy, schema versions.

Experts retain control; ordinary users are not forced to understand every implementation parameter at once.

### 8.4 Calibrated autonomy

Approval should be proportional to consequence:

- Safe reads: automatic when explicitly scoped.
- Draft generation: automatic, never posted without the chosen policy.
- Bounded reversible writes: approve a plan or session.
- Financial, identity, security, publishing, deletion, and irreversible actions: exact-action confirmation.

The user must see the account, objects, before/after state, and reason. Approval copy must be derived from canonical typed arguments, not generated by the agent. This also mitigates “lies in the loop,” where an agent could describe a dangerous action benignly.

### 8.5 Visible causality beats confidence theatre

Users trust operational evidence:

- “Read 3 listings from your saved items.”
- “Compared price, condition, and shipping.”
- “Drafted an offer; nothing was sent.”
- “Waiting for your approval to send £42 to seller X.”
- “Used Agent version 7 and Google Drive connection ‘Work’.”

A heuristic “82% confidence” does not establish truth. Confidence should appear only when calibrated for a defined decision and validated against real outcomes. Otherwise show evidence, citations, policy decisions, and test results.

### 8.6 Reversibility lowers anxiety

Drafts, dry runs, preview, edit-before-approve, checkpoints, version history, rollback, connection revocation, and kill switches make experimentation safe. Users become more willing to adopt useful autonomy when mistakes are bounded and recoverable.

### 8.7 Evidence replaces decorative chrome

Premium agent UI should use:

- Last verified connection health.
- Exact granted scopes.
- Eval pass rate.
- Last successful run.
- Current deployed version.
- Cost and latency.
- Blocked/approved action counts.
- Real trace artifacts.

It should not use:

- Generic intelligence scores.
- Decorative gradients around provider logos.
- A card for every setting.
- Repeated “powered by AI” copy.
- Fabricated online/presence states.
- “Ready” labels unsupported by a server preflight.

### 8.8 Native guidance

Apple’s June 2026 Generative AI guidance emphasizes responsible design, user agency, identifying AI use, refinement/feedback, reversibility, privacy, and useful non-AI fallbacks where appropriate. The People + AI Guidebook similarly emphasizes accurate mental models, staged onboarding, feedback, control, and explanations appropriate to stakes.

Sources:

- [Apple Human Interface Guidelines: Generative AI](https://developer.apple.com/design/human-interface-guidelines/generative-ai)
- [PAIR: Mental models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/)
- [PAIR: Feedback and controls](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/)
- [PAIR: Explainability and trust](https://pair.withgoogle.com/guidebook-v2/chapter/explainability-trust/)

---

## 9. Target product model

An agent should be a versioned deployable system, not a mutable bot profile.

### 9.1 Canonical conceptual model

**Agent**

- Stable identity, owner, collaborators, visibility, lifecycle state.

**Agent draft**

- Mutable working copy.
- Purpose, instructions, examples, model policy, knowledge, tools, triggers, memory, safety, budgets.
- Autosaved with revision checks.

**Agent version**

- Immutable snapshot.
- Prompt checksum.
- Model/provider capability snapshot.
- Tool schema versions.
- Policy version.
- Knowledge binding versions.
- Evaluation result and publisher.

**Deployment**

- Pins an agent version to an environment and target such as conversation, account, channel, or schedule.
- Has status, rollout, connection bindings, runtime limits, and kill switch.

**Run**

- Durable execution instance with trigger, actor, version, deployment, state, steps, usage, artifacts, approvals, and final outcome.

**Connection**

- Opaque reference to a provider/integration credential.
- Owner, tenant, environment, scopes, expiry, health, and revocation.

**Capability grant**

- Typed operation, policy, resource constraint, credential, expiry, and approval mode.

**Approval request**

- Exact canonical action plus bounded continuation token; durable and single use.

**Evaluation suite**

- Versioned cases, graders, baseline, threshold, repeated trials, and publish gate.

### 9.2 Lifecycle state machines

Agent:

**draft → validated → published → active → paused → archived**

Publishing creates an immutable version; edits create a new draft.

Deployment:

**pending → active → suspended → updating → removed**

Run:

**queued → running → waiting_for_approval / waiting_for_input → succeeded**

Alternative terminal states:

**failed / timed_out / cancelled / unknown_outcome**

Connection:

**unverified → healthy → degraded → expired / revoked / failed**

“Connected” should never be inferred solely from secret presence.

---

## 10. Flagship native information architecture

### 10.1 Unify the fragmented entry points

Create one **Agent Studio** destination with four top-level areas:

1. **Agents** — create, edit, status, deployed version, latest run.
2. **Connections** — provider/tool accounts, scopes, health, affected agents.
3. **Runs** — real server-backed activity, approvals, failures, cost.
4. **Governance** — defaults, budgets, data controls, team permissions.

Chat entry points should open the same agent catalogue and deployment state, filtered to the current conversation. Remove the separate demo catalogue.

### 10.2 Agent list

First viewport:

- Search.
- One clear Create agent action.
- Useful rows showing agent name, one-line job, state, deployed targets, and last run health.
- No marketing intro panel.

Row hierarchy:

1. Identity and job.
2. State and deployment evidence.
3. Latest meaningful issue or success.

Avoid provider badges unless provider identity matters to an action. Avoid a card per row; use a flat list, separators, and real icon/media only when meaningful.

States:

- Loading skeleton matching final rows.
- Populated.
- Empty with one focused creation path and 2–3 task templates.
- Filtered empty.
- Offline with cached state clearly marked stale.
- Error with retry.
- Partial health.

### 10.3 Agent overview

The dominant object should be the agent’s job and current operational state:

- “Find comparable listings and draft fair offers.”
- Version 7 active in 3 conversations.
- Last run succeeded 12 minutes ago.
- One connection needs reauthorization.

Primary actions:

- Test.
- Edit draft.
- Pause/resume deployment.

Secondary:

- Versions.
- Duplicate.
- Archive.

The screen should show a compact system map:

**Trigger → Knowledge → Decisions → Actions → Output**

Each node opens its configuration. This creates a mental model without forcing a desktop-style infinite canvas onto a phone.

### 10.4 Creation flow

Use a guided draft, not nine equal-weight sections.

#### Step 1 — Purpose

- “What should this agent accomplish?”
- Intended user/audience.
- Success criteria.
- Real template or natural-language draft.

Example:

“When someone asks for a price check in a group chat, compare active listings and recent sold prices, cite the evidence, and draft a recommendation. Never place an offer.”

The system extracts an editable draft:

- Trigger: mention.
- Reads: conversation, catalogue, sold-price index.
- Writes: none.
- Output: cited recommendation.
- Escalation: say when evidence is insufficient.

#### Step 2 — Capabilities

Group by user intent, not an internal taxonomy:

- Read marketplace data.
- Work with conversations.
- Create drafts.
- Change marketplace state.
- Use external services.

Show a compact summary. Drill into operation-level controls. Do not render 32 rows by default.

#### Step 3 — Control

Offer an autonomy preset with transparent consequences:

- **Suggest only:** no external writes.
- **Ask before changes:** reads automatically, confirms writes.
- **Run a reviewed plan:** user approves a bounded sequence.
- **Custom:** operation-level policies.

Every preset expands into actual grants; it is not a magic global flag.

#### Step 4 — Test

Make Test the main creative workspace:

- Sample chat or trigger.
- Safe synthetic data by default.
- Live-data toggle with explicit scope.
- Timeline trace.
- Draft output.
- Tool calls with arguments/results.
- Policy decisions.
- “Add this run to evaluations.”

#### Step 5 — Publish

Server-computed preflight:

- Connection health.
- Required scopes.
- Tool schema compatibility.
- Budget.
- Evaluation gate.
- Privacy/retention acknowledgement.
- Target and version.

Publish should create an immutable version and then offer a truthful Connect/deploy flow.

### 10.5 Editing structure

Use lifecycle navigation:

- Purpose.
- Behavior.
- Capabilities.
- Control.
- Test.
- Evaluate.
- Deploy.
- Observe.

On mobile, each is a pushed screen from the overview, not one giant modal ScrollView. Keep one dominant work area, at most one non-media panel above the fold, transparent utility controls, and a sticky bottom dock only where a persistent Test/Save action materially helps.

---

## 11. Detailed configuration specification

### 11.1 Purpose and behavior

Core:

- Job statement.
- Intended audience.
- Trigger and channel.
- Success criteria.
- Instructions.
- Clarification behavior.
- Abstention/refusal behavior.
- Human escalation destination.
- Positive examples.
- Negative examples.
- Output style and language.

Advanced:

- Structured output schema.
- Citation requirements.
- Deterministic workflow steps vs model-decided steps.
- System policy attachments.
- Prompt variables with typed inputs.

Do not expose one giant “system prompt” as the only behavior model. Separate job, constraints, examples, and output contract so the system can validate and diff them.

### 11.2 Model policy

Core:

- Provider connection.
- Recommended compatible model.
- Reasoning level.
- Quality/speed/cost intent.
- Fallback enabled.

Advanced:

- Ordered provider/model fallback route.
- Max input/output tokens.
- Max turns.
- Max tool calls.
- Wall-clock timeout.
- Cost per run and daily/monthly budget.
- Parallelism/concurrency.
- Retry/backoff and retryable error classes.
- Streaming behavior.
- Context compaction/summarization.
- Structured-output support requirement.
- Tool-call support requirement.
- Region/data-processing constraint.
- Model deprecation and compatibility status.

Model lists must come from server-authoritative connection capabilities, not unrestricted client discovery. Store a capability snapshot on published versions so behavior is reproducible.

### 11.3 Integrations and tools

Every integration needs:

- Provider/service and connection name.
- Environment.
- Credential owner: creator, service account, deployer, or end user.
- Authentication type.
- Exact available operations.
- Read/write/destructive classification.
- Requested and granted scopes.
- Allowed accounts, projects, folders, domains, conversations, or tenants.
- Tool input/output schemas and versions.
- Rate limits.
- Timeout/retry policy.
- Idempotency support.
- Last successful verification.
- Last failure and remediation.
- Safe dry run.
- Revocation and list of affected deployments.

Tool policy must be operation-specific:

- Blocked.
- Automatic.
- Ask once.
- Ask each time.
- Approve a bounded plan/session.

### 11.4 MCP

Support should include:

- Server identity and verified origin.
- Protocol version.
- Transport.
- Advertised capabilities.
- Authorization issuer, audience, resource, scopes, and client identity.
- Allowlisted or reviewed status.
- Tool/resource/prompt inventory with schemas.
- Change detection when advertised capabilities drift.
- Per-tool risk and policy.
- Outbound network restrictions.
- Health and latency.
- Extension support such as Tasks, Skills, or Apps only when negotiated.

Treat remote tool descriptions, schemas, prompts, and results as untrusted input.

### 11.5 Connected agents / A2A

Only expose after the single-agent runtime is durable.

- Verified Agent Card.
- Protocol version.
- Skills/capabilities.
- Authentication.
- Task input/output.
- Streaming and push support.
- Artifact policy.
- Maximum delegation depth/fan-out.
- Budget inheritance.
- Data boundary.
- Failure/handoff behavior.
- Trace correlation.

The caller should not receive the remote agent’s private prompt or internal memory. It should receive declared capabilities and task artifacts.

### 11.6 Knowledge

- Files and collections.
- Marketplace/catalogue indexes.
- Conversation scopes.
- External drives/databases.
- Retrieval filters.
- Freshness/sync status.
- Citation policy.
- Permission projection from the requesting user.
- Tenant and row-level isolation.
- Chunk/index version.
- Sensitive-data exclusions.
- Failure behavior when sources are unavailable.

Knowledge permission must be evaluated at retrieval time. Publishing an agent must not freeze the creator’s personal access into a group-wide capability.

### 11.7 Memory

- Short-term conversation context.
- User-scoped memory.
- Conversation/group-scoped memory.
- Agent-private working memory.
- Shared organization memory, if allowed.
- Retention duration.
- Sensitive-field exclusions.
- Consent.
- Inspect, correct, export, and delete controls.
- Summarization/compaction strategy.
- Conflict and provenance.

Long-term memory must not be a decorative Boolean. It is a data product with ownership and retention consequences.

### 11.8 Triggers

- Mention.
- Every message, with strong guardrails.
- Manual command.
- Event trigger.
- Schedule.
- Webhook.
- Integration event.
- API invocation.

Each trigger requires:

- Input schema.
- Audience/target.
- Deduplication key.
- Rate limit.
- Quiet hours.
- Concurrency policy.
- Retry behavior.
- Actor identity.
- Permission context.

### 11.9 Safety and control

- Prompt-injection handling.
- Untrusted-content boundaries.
- Moderation/refusal.
- PII and secrets policy.
- Data retention and provider data-use policy.
- Allowed domains/network.
- Tool risk classification.
- Approval rules.
- Human escalation.
- Kill switch.
- Run and fan-out limits.
- Security and policy version.

### 11.10 Test and evaluation

Test trace:

**trigger → model → retrieval → tool/MCP/A2A → guardrail → approval → retry/handoff → artifact**

Every span should show:

- Sanitized input/output.
- Status and duration.
- Model, tokens, and cost.
- Credential actor.
- Tool arguments and typed result.
- Policy decision.
- Evidence/citations.
- Retry/recovery.
- Link to create a regression case.

Evaluation suite:

- Deterministic assertions.
- Schema validation.
- Correct tool selection.
- Argument validation.
- Final-state verification.
- Trajectory grading.
- Safety/permission checks.
- LLM-as-judge rubrics.
- Human review.
- Repeated trials for nondeterminism.
- Baseline-versus-candidate comparison.
- Publish thresholds.

### 11.11 Deployment and observation

Deployment:

- Environment.
- Target.
- Pinned version.
- Connection bindings.
- Rollout percentage.
- Schedule.
- Status.
- Pause/cancel.
- Rollback.

Observation:

- Runs by version/deployment.
- Success/failure/unknown rate.
- Waiting approvals.
- p50/p95 latency and time to first token.
- Tokens and cost.
- Tool error rate.
- Approval rate/rejection rate.
- Citation coverage.
- Eval quality trend.
- Connection health.
- Policy denials.

---

## 12. Backend target architecture

### 12.1 Database model

Recommended tables:

| Table | Core responsibility |
|---|---|
| agents | Stable identity, owner, visibility, lifecycle |
| agent_drafts | Mutable revisioned working state |
| agent_versions | Immutable published definition and checksums |
| provider_connections | Opaque credential identity, owner, environment, health |
| provider_secret_refs | KMS/vault reference only; never model-visible secret |
| agent_tools | Tool bindings and schema versions |
| agent_capability_grants | Operation, policy, constraints, credential, expiry |
| agent_knowledge_sources | Retrieval bindings and access projection |
| agent_memory_policies | Scope, retention, consent, exclusions |
| agent_triggers | Trigger type, input schema, deduplication/rate policy |
| agent_deployments | Target, pinned version, status, rollout, environment |
| agent_runs | Durable run state, trigger, deployment, outcome |
| agent_run_steps | Model/tool/retrieval/guardrail/approval spans |
| agent_approval_requests | Canonical action, continuation, decision, expiry |
| agent_artifacts | Typed run outputs and provenance |
| agent_eval_suites | Versioned evaluation definitions |
| agent_eval_cases | Inputs, expected properties, graders |
| agent_eval_runs | Candidate/baseline results and release decision |
| agent_audit_events | Immutable human/agent/policy/credential action history |

Do not use evolving OpenTelemetry semantic attributes as the database schema. Maintain a stable internal event model and export a mapped projection. OpenTelemetry’s GenAI conventions are useful but still evolving.

Sources:

- [OpenTelemetry GenAI observability update, May 2026](https://opentelemetry.io/blog/2026/genai-observability/)
- [OpenTelemetry GenAI attribute registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)

### 12.2 Canonical API contract

Generate frontend types from a shared OpenAPI/JSON Schema contract. Do not maintain independent model unions.

Minimum API families:

**Agents**

- POST /agents
- GET /agents
- GET /agents/:id
- PATCH /agents/:id/draft with revision precondition
- POST /agents/:id/validate
- POST /agents/:id/publish with idempotency key
- GET /agents/:id/versions
- POST /agents/:id/versions/:versionId/rollback
- POST /agents/:id/archive

**Connections**

- POST /agent-connections
- POST /agent-connections/:id/verify
- GET /agent-connections
- GET /agent-connections/:id/capabilities
- POST /agent-connections/:id/reauthorize
- DELETE /agent-connections/:id with impact preview

**Deployments**

- POST /agent-deployments with idempotency key
- PATCH /agent-deployments/:id
- POST /agent-deployments/:id/pause
- POST /agent-deployments/:id/resume
- DELETE /agent-deployments/:id

**Runs**

- POST /agent-runs for manual/test execution
- GET /agent-runs
- GET /agent-runs/:id
- POST /agent-runs/:id/cancel
- POST /agent-runs/:id/reconcile
- GET /agent-runs/:id/events with resumable sequence

**Approvals**

- GET /agent-approvals
- POST /agent-approvals/:id/approve
- POST /agent-approvals/:id/reject
- POST /agent-approvals/:id/edit-and-approve

**Evaluations**

- CRUD suites and cases.
- Run candidate against suite.
- Compare baseline and candidate.
- Read publish-gate result.

### 12.3 Runtime execution plane

Use BullMQ plus database state:

1. Trigger is validated and deduplicated.
2. Transaction creates agent_run with unique trigger/deployment/version key.
3. Request returns immediately.
4. Worker acquires lease and loads immutable version.
5. Runtime resolves environment-specific connections.
6. Policy engine computes allowed tools and data projection.
7. Model proposes output/tool call.
8. Tool input passes schema, authorization, policy, and injection-boundary checks.
9. Consequential action creates a durable approval checkpoint.
10. Approved action executes with an idempotency key.
11. Result is verified against downstream evidence.
12. Run persists artifacts, usage, audit, and terminal status.
13. Realtime events update chat and Agent Studio.

Recommended uniqueness:

**trigger_message_id + deployment_id + agent_version_id**

Every event needs run_id and monotonic sequence. A reconnecting client can resume without duplicated deltas.

### 12.4 Provider adapter

Interface responsibilities:

- Verify connection.
- Discover compatible models.
- Normalize capabilities.
- Create/continue response.
- Stream events.
- Parse tool calls.
- Normalize usage and errors.
- Cancel where supported.
- Reconcile unknown outcomes where supported.

Provider errors must retain categories:

- Invalid/expired credential.
- Permission/scope denied.
- Model unavailable/deprecated.
- Rate limited.
- Quota exhausted.
- Provider outage.
- Timeout.
- Network failure.
- Invalid request/schema.
- Safety refusal.
- Unknown outcome.

Do not collapse all failures to “invalid.”

### 12.5 Tool registry and policy engine

Each tool needs:

- Stable name/version.
- Description.
- Input/output JSON Schema.
- Risk: read, reversible write, consequential write, destructive.
- Required capability.
- Resource authorizer.
- Idempotency behavior.
- Timeout/retry behavior.
- Result verifier.
- Redaction policy.

Policy decision inputs:

- User/actor.
- Conversation/target.
- Agent and version.
- Deployment.
- Tool and arguments.
- Credential identity.
- Capability grant and constraints.
- Risk.
- Current approval.
- Organization policy.

Decision output:

- allow.
- deny with reason.
- require approval.
- require stronger authentication.
- require canonical product UI handoff.

### 12.6 Security baseline

OWASP’s Agentic Applications risks include goal hijacking, tool misuse, identity/privilege abuse, supply-chain risks, and unsafe code execution. OWASP’s excessive-agency guidance emphasizes minimizing functionality, permissions, and autonomy. NIST’s 2026 agent initiative emphasizes identity, authorization, auditability, interoperability, and agent-specific security.

Required controls:

- Default-deny permissions.
- Downstream authorization even after agent policy allow.
- Encrypted credential vault and tenant isolation.
- OAuth issuer, audience, resource, state, PKCE, and redirect validation.
- No raw credentials in prompts, traces, client payloads, or tool results.
- Egress allowlists and private-network protections.
- MCP registry review and capability drift detection.
- Tool schemas treated as untrusted supply-chain inputs.
- Strict typed boundaries between stages.
- Content/data separated from instructions.
- Idempotency for every consequential mutation.
- Token, cost, time, step, concurrency, and fan-out limits.
- Integrity-protected checkpoints.
- Immutable audit history.
- Dev/staging/production isolation.
- Version signing/checksums.
- Red-team and prompt-injection evaluations.
- Approval UI built from canonical arguments, never agent-generated summaries.

Sources:

- [OWASP Top 10 for Agentic Applications](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)
- [OWASP Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)
- [OWASP Lies in the Loop](https://owasp.org/www-community/attacks/Lies_in_the_Loop)
- [NIST AI Agent Standards Initiative, February 2026](https://www.nist.gov/news-events/news/2026/02/announcing-ai-agent-standards-initiative-interoperable-and-secure)

---

## 13. Exact codebase upgrade map

### 13.1 Frontend files

| File | Required action |
|---|---|
| frontend/src/domain/chat.ts | Replace the narrow handwritten agent config with generated canonical contract types |
| frontend/src/platform/agents/agentDefinition.ts | Merge useful concepts into the canonical schema; remove it as a shadow source of truth |
| frontend/src/screens/BotBuilderScreen.tsx | Re-author as lifecycle screens; preserve as canonical route rather than creating BuilderV2 |
| frontend/src/screens/AIAgentIntegrationScreen.tsx | Replace local key manager with server-backed connection inventory and capability/health detail |
| frontend/src/services/aiProviderApi.ts | Remove production credential authority and direct provider execution; retain only if explicitly supporting device runtime |
| frontend/src/services/botsApi.ts | Migrate to versioned agent, connection, deployment, run, approval, and eval APIs |
| frontend/src/store/useStore.ts | Remove contract flattening and optimistic readiness; use server states and query invalidation |
| frontend/src/services/chatAgentsApi.ts | Remove demo production path and hard-coded deployment registry |
| frontend/src/components/chat/ChatAgentPicker.tsx | Read the same deployable agent catalogue and current deployment state as management screens |
| frontend/src/screens/GroupChatScreen.tsx | Use durable deployment/run events; remove local demo chips/count |
| frontend/src/screens/GroupBotManagementScreen.tsx | Migrate to versioned deployments and role-authorized server state |
| frontend/src/platform/agents/capabilityBroker.ts | Stop treating AsyncStorage grants as authority; replace with server policy/approval projection |
| frontend/src/platform/agents/agentRuntime.ts | Either remove from production or make it an explicit device-runtime implementation |
| frontend/src/services/agentActivityLedger.ts | Replace local ledger with backend runs/audit projection |
| frontend/src/screens/AgentLedgerScreen.tsx | Re-author as Runs with real statuses, approvals, trace, usage, and retry/reconcile actions |
| frontend/src/navigation/linking.ts | Add coherent deep links for agent overview, edit, connections, run, approval, and deployment |

### 13.2 Backend files

| File | Required action |
|---|---|
| backend/api/src/routes/bots.ts | Short-term P0 fixes; then migrate to versioned agent routes |
| backend/api/src/botRuntime/types.ts | Replace fixed OpenAI-only config with generated canonical runtime types |
| backend/api/src/botRuntime/agentConfig.ts | Reconcile capability vocabulary and fail closed |
| backend/api/src/botRuntime/index.ts | Enforce status/version/grants; remove synchronous nondeterministic orchestration |
| backend/api/src/botRuntime/openaiAgent.ts | Keep as one provider adapter; add tools, durable state hooks, normalized errors, and safe streaming |
| backend/api/src/index.ts | Move deployment/command logic into modular routes/services and enqueue runs |
| backend/api/src/lib/aiTruth.ts | Reuse live provider readiness/health semantics for connection and deployment gates |
| backend/api/src/lib/aiUsage.ts | Bind usage to run/deployment/version and reconcile reserved vs actual cost |
| Database migrations | Add canonical tables and constraints; migrate legacy bots without fabricated grants |
| Worker layer | Add durable agent-run processor, approval resume, cancellation, reconciliation, and dead-letter behavior |

### 13.3 Contract incompatibilities that must be fixed first

1. chat.draft_reply vs reply_in_chat.
2. Namespaced capability taxonomy vs two legacy backend strings.
3. Arbitrary provider model IDs vs fixed three-model backend union.
4. Local provider ID placed in runtimeMode and omitted during create.
5. ApprovalMode present in UI but absent in API.
6. confidenceThreshold present in backend type but not coherently authored in frontend.
7. longTermMemory hardcoded false and not persisted.
8. deployment snapshot written but not read.
9. local deployed-agent Map vs chat_bot_installs.
10. local ledger vs chat_bot_audit_events and ai_usage_events.

---

## 14. Phased implementation plan

### Phase 0 — Truth and containment

**Goal:** Stop lying controls and close security defects before expanding capability.

- Reconcile the reply permission vocabulary.
- Fail closed on empty permission snapshots.
- Enforce bot status at runtime.
- Restrict group deploy/remove to owner/admin roles.
- Redact system instructions from every public/system catalogue route.
- Replace or disable frontend claims that are not executable:
  - Anthropic/Gemini/custom runtime.
  - Approval modes.
  - 32 executable capabilities.
  - Global pause.
  - Backend activity ledger.
- Wire strong endpoint validation into the actual request path if custom device endpoints remain.
- Distinguish “stored,” “verified,” “healthy,” “expired,” and “failed.”
- Replace optimistic “Ready to publish” with server preflight.

**Exit gate:** No visible control claims an authority the server does not enforce.

### Phase 1 — One contract and one deployment system

**Goal:** Eliminate split-brain state.

- Define shared schema.
- Generate TypeScript types for frontend/backend.
- Migrate existing custom bots.
- Use one live catalogue everywhere.
- Replace chat demo deployment with backend deployment state.
- Replace local pause/count with server state.
- Bind activity to server runs/audit.
- Add route-level contract tests.

**Exit gate:** Creating, listing, editing, deploying, pausing, and viewing an agent produce the same state on every surface and after restart.

### Phase 2 — Versioned publishing

**Goal:** Make deployment reproducible and reversible.

- Mutable drafts with revision checks.
- Immutable versions.
- Deployment pins version.
- Publish diff.
- Rollback.
- Archive.
- Server validation.
- Prompt/model/tool/policy snapshots.

**Exit gate:** Editing a draft never silently changes a running deployment.

### Phase 3 — Real provider connections

**Goal:** Make integration settings operational.

- Server vault/token references.
- Provider adapters.
- Live health verification.
- Capability-aware model catalogue.
- Scopes, expiry, reauthorization, revocation.
- Environment binding.
- Clear provider error taxonomy.

Ship OpenAI-only honestly before exposing disconnected providers.

**Exit gate:** A published deployment can prove which healthy connection and model capability snapshot it will use.

### Phase 4 — Durable execution

**Goal:** Decouple chat from model latency and make runs recoverable.

- BullMQ worker.
- agent_runs and steps.
- Idempotent trigger uniqueness.
- Cancellation.
- Durable retries.
- Unknown-outcome reconciliation.
- Sequenced streaming.
- Token/time/cost/step budgets.
- Deterministic single/multi-agent policy.

**Exit gate:** Process restart, client retry, or provider timeout cannot fabricate success or duplicate a consequential result.

### Phase 5 — Tools, approvals, and knowledge

**Goal:** Turn capabilities into real controlled actions.

- Typed server tool registry.
- Downstream authorization.
- Operation-level grants.
- Durable approval checkpoints.
- Exact-action native confirmation.
- Idempotent writes and result verification.
- Knowledge sources with user/tenant projection.
- Memory scopes and retention.
- MCP support behind verified protocol/auth controls.

**Exit gate:** Every visible capability maps to an executable typed tool and a tested server policy.

### Phase 6 — Test, evaluate, and observe

**Goal:** Make quality evidence part of authoring.

- Playground with safe synthetic/live modes.
- Unified trace timeline.
- Trace-to-eval case.
- Regression suites and publish gates.
- Run list and drill-down.
- Cost/latency/quality metrics.
- Real backend ledger and approvals inbox.
- Prompt/response capture controls and redaction.

**Exit gate:** Every published version has a traceable validation/evaluation decision and every production run has an honest outcome.

### Phase 7 — Flagship visual convergence

**Goal:** Re-author the native experience after the system model is truthful.

- Agent Studio IA.
- Purpose-first creation.
- Progressive disclosure.
- Compact capability summaries with drill-in.
- Real test sidecar/workspace.
- Native state matrix.
- Accessibility and large-text pass.
- Virtualized long lists.
- Before/after device captures.
- Thumbnail and squint tests.
- Light/dark parity.

**Exit gate:** The screen’s visual hierarchy reflects the runtime lifecycle and operational evidence, not generic settings chrome.

---

## 15. Required test strategy

Existing targeted backend tests passed 32/32 during the audit, but coverage is not a production gate. Some current bot tests duplicate route rules in local helpers instead of exercising real handlers.

Required suites:

### Contract

- Generated frontend/backend schema compatibility.
- Builder serialize/deserialize round trip.
- Capability and approval persistence.
- Model/provider capability compatibility.
- Legacy migration without implicit grants.

### API and database

- Agent CRUD with revision conflicts.
- Publish idempotency.
- Deployment idempotency and authorization.
- Owner/admin/member role matrix.
- Immutable version enforcement.
- Rollback.
- Connection ownership and tenant isolation.
- Audit/usage/run atomicity.

### Runtime

- Trigger deduplication.
- Single-agent ordering.
- Multi-agent deterministic orchestration if supported.
- Disabled/paused/cancelled behavior.
- Process restart and lease recovery.
- Timeout/429/5xx/error taxonomy.
- Unknown outcome.
- Streaming sequence and reconnect.
- Budget enforcement.
- Quota reconciliation.

### Tools and safety

- Default-deny.
- Tool schema validation.
- Resource authorization.
- Approval single-use and expiry.
- Replay prevention.
- Mutating-tool idempotency.
- Prompt injection and exfiltration evals.
- Malicious MCP metadata/tool result tests.
- Credential non-disclosure.
- Approval UI canonical-data tests.

### Frontend

- Direct deep-link edit hydration.
- Offline/cache/stale behavior.
- Unknown save outcome.
- Unsaved changes.
- Connection removal and reauthorization.
- Real deployment consistency across chat and management.
- Pause affects server deployments.
- Run/approval updates.
- Screen reader semantics.
- Dynamic type and large text.
- Reduced motion.
- Long model/capability list performance.

### Evaluation

- Tool selection and arguments.
- Final state.
- Trajectory.
- Refusal/escalation.
- Citation and knowledge permission.
- Repeated stochastic trials.
- Baseline/candidate regression.

---

## 16. Success metrics

Do not measure success by number of settings.

### Product

- Time from intent to first successful safe test.
- Draft-to-publish conversion.
- Percentage publishing with a passing evaluation suite.
- Connection completion and reauthorization success.
- Agent deployment retention after 7/30 days.
- Percentage of runs requiring user correction.

### Quality

- Task success rate by version.
- Correct tool-selection rate.
- Correct argument/final-state rate.
- Citation/evidence coverage.
- Prompt-injection resistance.
- Regression rate after publish.

### Reliability

- Run success/failure/unknown-outcome rates.
- Duplicate side-effect rate: target zero.
- p50/p95 time to first event and completion.
- Worker retry and dead-letter rates.
- Connection health and provider failover rates.

### Trust

- Approval acceptance/rejection/edit rates.
- Reversal/rollback rate.
- User-reported unexpected action rate.
- Permission-denial correctness.
- Percentage of visible trust signals backed by server evidence: target 100%.

### UX

- Useful content above fold.
- Visible rounded-container count.
- Time to identify current deployment state.
- Test-to-fix cycle time.
- Screen-reader task completion.
- Large-text overflow defects: target zero.

---

## 17. Definition of flagship completion

The upgrade is complete only when all statements below are true:

- There is one canonical agent definition shared by frontend and backend.
- Provider connections used in UI are the connections used by runtime.
- Every displayed capability maps to a typed server tool or is clearly unavailable.
- Approval policies persist and are enforced by the server.
- Deployment state is identical across Settings, chat, detail, management, and Runs.
- Pause stops new server runs and communicates what happens to active runs.
- Published versions are immutable and deployments are pinned.
- Runs are durable, cancelable, observable, idempotent, and honest about unknown outcomes.
- The ledger is server-backed and cannot fabricate successful activity.
- Model, connection, tool, knowledge, memory, trigger, budget, and safety policies have truthful state.
- Test traces can become regression cases.
- Publish can be gated on evaluations.
- Every trust signal is backed by data.
- The native builder is purpose-first, progressively disclosed, accessible, and visually verified on device.
- Loading, empty, filtered-empty, offline, error, retry, disabled, submitting, success, partial, permission-denied, stale, conflict, and unknown-outcome states are handled where relevant.
- No demo registry or local grant store remains on the production authority path.

---

## 18. Final recommendation

Do not begin with a visual restyle of BotBuilderScreen.

Begin with a short truth-and-contract sprint:

1. Fix the permission mismatch and fail-closed behavior.
2. Remove the demo/live deployment split.
3. Decide and implement server-authoritative provider connections.
4. Persist operation-level approval policy.
5. Create immutable versions and durable runs.
6. Build the new Agent Studio directly over those real states.

The distinctive ThryftVerse opportunity is not to become a generic enterprise workflow canvas. It is to make delegated intelligence feel native to social commerce: clear jobs, real marketplace context, evidence-backed recommendations, exact permission boundaries, safe offers/listing actions, group-aware governance, and a visible record of what happened.

The flagship visual language follows from that truth:

- Purpose dominates chrome.
- Real marketplace objects dominate generic cards.
- Evidence dominates badges.
- Run state dominates marketing copy.
- Reversibility dominates reassurance paragraphs.
- One coherent lifecycle dominates scattered settings.

That is how the product stops feeling “AI-made”: every visible decision has a reason, every control has authority, every state has evidence, and the composition reflects the real work the agent performs.

---

## 19. Source index

### OpenAI

- [Agents SDK](https://developers.openai.com/api/docs/guides/agents)
- [Responses API](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
- [MCP and connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- [Guardrails and approvals](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals)
- [Agent observability integrations](https://developers.openai.com/api/docs/guides/agents/integrations-observability)
- [Agent evaluations](https://developers.openai.com/api/docs/guides/agent-evals)
- [Agent safety](https://developers.openai.com/api/docs/guides/agent-builder-safety)
- [Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices)
- [Agent Builder deprecation](https://developers.openai.com/api/docs/guides/agent-builder)

### Protocols and interoperability

- [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28)
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [MCP release notes](https://blog.modelcontextprotocol.io/posts/2026-07-28/)
- [A2A specification](https://a2a-protocol.org/latest/specification)
- [A2A concepts](https://a2a-protocol.org/latest/topics/key-concepts/)
- [A2A discovery](https://a2a-protocol.org/latest/topics/agent-discovery/)

### Agent platforms

- [Anthropic trustworthy agents](https://www.anthropic.com/research/trustworthy-agents)
- [Anthropic agent evaluations](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Anthropic effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Microsoft Copilot Studio](https://learn.microsoft.com/microsoft-copilot-studio)
- [Microsoft workflow checkpoints](https://learn.microsoft.com/en-us/agent-framework/workflows/checkpoints)
- [Microsoft human in the loop](https://learn.microsoft.com/en-us/agent-framework/workflows/human-in-the-loop)
- [Google Vertex AI Agent Engine](https://cloud.google.com/vertex-ai/generative-ai/docs/reasoning-engine/overview)
- [Google Agent Engine tracing](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/manage/tracing)
- [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence)
- [LangSmith evaluations](https://docs.langchain.com/langsmith/evaluation)
- [Crew Studio](https://crewai.com/blog/crew-studio-automated-agent-builder)
- [Zapier Agents](https://help.zapier.com/hc/en-us/articles/24393442652557-Build-an-agent-in-Zapier-Agents)
- [n8n reliability controls](https://blog.n8n.io/make-ai-agents-more-reliable-and-restrict-the-actions-they-can-take/)
- [n8n execution replay](https://docs.n8n.io/workflows/executions/all-executions/)

### Human-centered design, governance, and security

- [Apple HIG: Generative AI](https://developer.apple.com/design/human-interface-guidelines/generative-ai)
- [PAIR mental models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/)
- [PAIR feedback and controls](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/)
- [PAIR explainability and trust](https://pair.withgoogle.com/guidebook-v2/chapter/explainability-trust/)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST AI Agent Standards Initiative](https://www.nist.gov/news-events/news/2026/02/announcing-ai-agent-standards-initiative-interoperable-and-secure)
- [OWASP Agentic Applications Top 10](https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)
- [OWASP Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)
- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)
- [OWASP Lies in the Loop](https://owasp.org/www-community/attacks/Lies_in_the_Loop)
- [OpenTelemetry GenAI observability](https://opentelemetry.io/blog/2026/genai-observability/)

