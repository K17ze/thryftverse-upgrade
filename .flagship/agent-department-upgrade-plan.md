# Agent Department — Flagship Upgrade Plan
Date: 2026-09-22 · Branch: feat/product-detail-contract-media-device-closure
Campaign: agentic-capabilities-flagship-2026-09

## Audit verdict (evidence-backed)

### What agents can do TODAY
- Agents are `chat_bots` rows; user-owned via `owner_id` (029), immutable versions
  (222), per-conversation installs, durable `agent_runs` with idempotency (224).
- Runtime: raw OpenAI Responses API `POST /responses`, single-shot, `store:false`,
  history = last N chat messages only (openaiAgent.ts).
- Tool registry + risk-tiered policy + durable approvals exist (225) —
  **BUT tool execution is a stub** (`executeToolStub`, openaiAgent.ts:405
  "actual execution is Phase 6"). Agents cannot act on profiles, listings,
  orders. Single-turn only; no function_call_output round-trip.
- BYOK `provider_connections` vault exists (223, AES-256-GCM, SSRF-guarded
  verify) but **cannot be bound to a bot via API** (provider_connection_id
  unsettable; PATCH /bots lacks the field).
- Permissions enforced: `reply_in_chat`, `read_messages` only. Builder's rich
  capability taxonomy is UI-only.
- External agents cannot authenticate: `api_keys`/`authenticateApiKey` dead code.
- Approvals leave runs marked `succeeded` (waiting_for_approval never written);
  `agent_run_steps` never written; streaming path unreachable.
- Support agent pipeline never enqueued (worker unregistered) + unmetered usage.

### RAG / per-user memory — DOES NOT EXIST
- No memory store, no per-user embeddings, no RAG over user-private data.
- Only retrieval: support KB lexical FTS (public articles, citations);
  media_embeddings emits ZERO vectors (placeholder encoder,
  PLACEHOLDER_DIMENSIONS=512); Meilisearch hybrid needs external embedder config.
- `agent_run_steps.step_type` already reserves 'retrieval' — unused.

### 2026 flagship standard (live research, 2026-09-22)
- Memory ≠ RAG: typed records (facts/preferences/episodes/directives) with
  kind-priority + temporal-validity + provenance ranking, not doc chunks.
- Mem0 pattern: extraction → similarity CRUD decision → vector store scoped
  user/agent. Zep pattern: valid_from/valid_to temporal truth.
- ChatGPT controls (regulatory trend, arxiv 2512.00742): memory must be
  user-visible, editable, retractable, globally toggleable, GDPR-erased.
- Tool governance: allow/deny/require_approval + scoped creds + deny-by-default;
  approvals = durable signed-ish receipts (AP2 mandate model direction).
- pgvector: global HNSW + user_id pre-filter is correct at our scale (mem0's
  70x-seq-scan pitfall applies at 1TB+ multi-tenant tables, not per-user corpora);
  honest degradation when extension/key absent (matches repo convention).

## Implementation waves (this session)

### Wave A — make existing machinery real (P0)
- A1. Tool executor `botRuntime/toolExecutors.ts`: real impls of seeded tools
  (search_listings, get_listing_details, check_price_history, read_conversation,
  draft_reply) + new actor-scoped reads (get_my_listings, get_my_orders) +
  memory tools. Deny-by-default registry keyed by name.
- A2. Multi-turn tool loop in openaiAgent.ts: execute allowed calls → append
  function_call + function_call_output items → re-invoke (max 4 rounds) →
  write agent_run_steps spans (model_call/tool_call/approval/retrieval).
- A3. Run status fix: waiting_for_approval written; approve-resume accepts it.
- A4. BYOK binding: providerConnectionId on POST/PATCH /bots with ownership +
  provider-compat validation (reject non-Responses-compatible honestly).
- A5. Support pipeline: register worker + queue + enqueue on message; meter
  usage into ai_usage_events.
  DONE: `support_agent_turns` queue + DLQ in queues.ts (mainQueues/dlqQueues/
  QUEUE_DLQ_MAP, worker w/ dynamic-import fallback, closeBackgroundQueues);
  handler registered in workers/index.ts; enqueue on customer message when
  ownership_state='ai_active' (idempotent jobId=support-turn:<msgId>,
  best-effort enqueue). Metering: support_agent_runs rows (tokens, latency_ms,
  cost_micros, validator outcomes, knowledge version ids) on handoff /
  provider-failure / success paths — ai_usage_events can't be used because
  its conversation_id FK references chat_conversations, not
  support_conversations; costTelemetry already reads support_agent_runs.

### Wave B — per-user agent memory (P0, the "RAG for each user" answer)
- B1. Migration 339_agent_memory.sql (+_down): agent_memory_settings,
  agent_memories (kind/provenance/temporal validity/status/use_count),
  feature-detected vector(1536) + HNSW, audit event types, memory + actor-read
  tools seeded into agent_tools.
- B2. lib/textEmbeddings.ts: OpenAI /embeddings text-embedding-3-small,
  honest unavailability, timeout, no-store semantics.
- B3. lib/agentMemory.ts: recall (kind→recency→similarity, honest degrade),
  store w/ dedupe (vector sim or normalized-text match), retract, list,
  settings, GDPR erasure hook, injection formatter.
- B4. Extraction: post-run enqueue agent-memory-extract → conservative
  LLM extraction → CRUD upsert. Skipped when provider unavailable.
- B5. Routes: GET/DELETE /agent-memory, PATCH /agent-memory/:id (retract),
  GET/PATCH /agent-memory/settings — actor-scoped, own-data only.
- B6. userErasure.ts: add agent_memories + settings to cascade list.

### Wave C — frontend (P1) — COMPLETE
- C1. AgentMemoryScreen: view/forget/toggle memories (ChatGPT-standard controls),
  wired via new agentMemoryApi service. Entry from Agent Studio. DONE.
- C2. AgentLedger: fetchRunTraceFromApi wired — run rows expand inline to a
  trace panel showing model/tool/approval/retrieval steps with status and
  latency. DONE.
- C3. BotBuilder: provider-connection picker (BYOK bind) in Model step —
  "managed by ThryftVerse" vs user-owned masked connections, persisted on
  create + update, honest unsupported-provider states. DONE.
- C4. Copy fix: agents.activitySub rewritten as server-backed execution
  records across all 13 locales. DONE.

### Wave D — RLS actor-context hardening (P0 security) — COMPLETE
- db/pool.ts: withActorContext(pool, userId, fn) — acquires a client, BEGIN,
  SET LOCAL app.current_user_id, runs fn, COMMIT/ROLLBACK, release. SET LOCAL
  is transaction-scoped so actor context cannot leak between pooled
  connections. Falls back to direct execution for non-Pool queryables
  (mocked test DBs, already-transaction-bound clients).
- botRuntime/toolExecutors.ts: every agent tool executor (listings, orders,
  conversation reads, memory recall/store/forget) now runs inside the actor
  context — RLS sees the real user, explicit WHERE predicates retained as
  defense in depth.
- botRuntime/openaiAgent.ts: pre-invocation memory recall wrapped in
  withActorContext.
- botRuntime/index.ts: post-run extractRunMemories wrapped in
  withActorContext (worker path).
- Anonymous/unauthenticated calls never enter the actor context (run.actor_user_id
  required; no context set → RLS default-deny holds).

### Deferred (documented, not this wave)
- Agent-scoped auth for EXTERNAL agents (AP2-mandate-style delegated tokens) —
  needs product decision; api_keys revival tracked.
- Anthropic/Gemini inference adapters for BYOK (honest rejection meanwhile).
- Conversational-search true semantic RAG (needs real embedder decision).
- Request-level actor context for non-agent routes — withActorContext exists;
  rolling it across every authed route is a separate sweep (route files would
  need a per-request wrapper, e.g. Fastify preHandler establishing context on
  a checked-out client for the request's queries).

## Verification
- node:test suites: botRuntime, agentUpgrade, bots, + new agentLoop and
  agentMemory tests — 78/78 agent-area tests pass (post-RLS-hardening).
- tsc --noEmit backend + frontend clean (post-C2/C3/D).
- Full unit suite: 1573 tests, 1570 pass, 2 pre-existing failures
  (searchReindexLease SQL-shape assertions; upload-finalization 180s
  timeout) — unrelated to touched files.
- git diff --check clean.
- NOT run: migration 339 execution (no local PostgreSQL), Redis-backed
  queue smoke (no local Redis), PgBouncer transaction-pooling check —
  flagged for staging verification.

## Remaining follow-ups
- Deploy-time: run migration 339, smoke-test support_agent_turns queue,
  verify SET LOCAL behavior under PgBouncer transaction pooling (SET LOCAL
  is transaction-scoped → safe by construction, but confirm pool mode).
- Route-level actor-context sweep for non-agent endpoints (see Wave D note).
