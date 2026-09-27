import assert from 'node:assert/strict';
import test from 'node:test';
import type { BotRuntimeContext, AgentConfig } from '../botRuntime/types.js';
import { executeOpenAiAgent } from '../botRuntime/openaiAgent.js';

// ── Scripted DB ───────────────────────────────────────────────────────
// Route SQL to canned rows by substring match and record every call.

interface RecordedQuery { sql: string; params: unknown[] }

function scriptedDb(
  handlers: Array<{ match: RegExp; rows?: Record<string, unknown>[]; rowCount?: number }>,
): {
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }> };
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  return {
    queries,
    db: {
      async query(sql: string, params: unknown[] = []) {
        queries.push({ sql, params });
        for (const h of handlers) {
          if (h.match.test(sql)) {
            return { rows: h.rows ?? [], rowCount: h.rowCount ?? (h.rows ?? []).length };
          }
        }
        return { rows: [], rowCount: 0 };
      },
    },
  };
}

const AGENT_CONFIG: AgentConfig = {
  instructions: 'You are a helpful shopping assistant.',
  model: 'gpt-5.6-terra',
  triggerMode: 'mention',
  responseLength: 'balanced',
  tone: 'focused',
  reasoningEffort: 'low',
  historyLimit: 8,
  starterPrompts: [],
  confidenceThreshold: 0.5,
};

function makeCtx(overrides: Partial<BotRuntimeContext> = {}): BotRuntimeContext {
  return {
    botId: 'bot_1', botName: 'Stylist', botSlug: 'stylist', botCategory: 'styling',
    botType: 'custom', commandHint: '@stylist', conversationId: 'conv_1',
    conversationType: 'dm', conversationTitle: null,
    actorUserId: 'actor_1', actorUserName: 'actor',
    permissionsSnapshot: ['reply_in_chat', 'read_messages'],
    command: '@stylist', args: ['find', 'denim'], messageText: 'find denim jackets',
    agentConfig: AGENT_CONFIG, conversationHistory: [],
    runtimeData: { listings: [], recentMessagesAnalyzed: 0, messagesRequiringReview: 0 },
    runId: 'run_1',
    ...overrides,
  };
}

const CREDENTIAL = { apiKey: 'sk-test', baseUrl: 'https://provider.test/v1' };

// Baseline DB rows shared by the loop tests: tools registry contains
// search_listings (read) plus a gated destructive tool for approval tests.
const TOOL_ROWS = [
  {
    name: 'search_listings', description: 'Search listings',
    input_schema: { type: 'object', properties: { query: { type: 'string' } } },
    risk: 'read', required_permission: null, is_enabled: true, version: '1',
  },
  {
    name: 'delete_account', description: 'Delete the account',
    input_schema: { type: 'object', properties: {} },
    risk: 'destructive', required_permission: null, is_enabled: true, version: '1',
  },
];

function baselineHandlers(extra: Array<{ match: RegExp; rows?: Record<string, unknown>[]; rowCount?: number }> = []) {
  // Extra handlers are prepended so they shadow the baseline defaults —
  // first match wins in scriptedDb.
  return [
    ...extra,
    { match: /FROM agent_run_steps[\s\S]*MAX/, rows: [{ n: 1 }] },
    { match: /agent_memory_settings/, rows: [{ memory_enabled: true, extraction_enabled: true }] },
    { match: /pg_attribute/, rows: [{ exists: false }] },
    { match: /FROM agent_memories/, rows: [{
      id: 'mem_1', user_id: 'actor_1', bot_id: null, kind: 'preference',
      content: 'Prefers UK size 10', source_type: 'explicit',
      source_conversation_id: null, source_run_id: null, status: 'active',
      confidence: 0.8, valid_from: 'x', valid_to: null, use_count: 0,
      last_used_at: null, created_at: '2026-01-01T00:00:00Z', updated_at: 'x',
    }] },
    { match: /UPDATE agent_memories/, rows: [], rowCount: 0 },
    { match: /FROM agent_tools/, rows: TOOL_ROWS },
    { match: /FROM agent_tool_bindings/, rows: [] },
    { match: /FROM agent_approval_requests/, rows: [] },
    { match: /INSERT INTO agent_approval_requests/, rows: [], rowCount: 1 },
    { match: /INSERT INTO agent_run_steps/, rows: [], rowCount: 1 },
    { match: /FROM listings/, rows: [{ id: 'l1', title: 'Denim Jacket', price_gbp: '80', brand: 'Levis', category: 'jackets', condition: 'good', seller_username: 'seller1' }] },
  ];
}

// ── fetch mock ────────────────────────────────────────────────────────

type FetchCall = { url: string; body: Record<string, unknown> };

function mockFetch(payloads: unknown[]): { calls: FetchCall[]; restore: () => void } {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    const payload = payloads[Math.min(i, payloads.length - 1)];
    i += 1;
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> });
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
      body: null,
    } as Response;
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

// ── Tests ─────────────────────────────────────────────────────────────

test('agent executes an allowed read tool and feeds the result back for a second round', async () => {
  const fetchMock = mockFetch([
    {
      id: 'resp_1', model: 'gpt-5.6-terra',
      output: [{ type: 'function_call', call_id: 'call_1', name: 'search_listings', arguments: '{"query":"denim"}' }],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    },
    {
      id: 'resp_2', model: 'gpt-5.6-terra',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'I found a Levi\'s denim jacket for £80.' }] }],
      usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
    },
  ]);
  const { db, queries } = scriptedDb(baselineHandlers());
  try {
    const result = await executeOpenAiAgent(makeCtx(), CREDENTIAL, db as never, 'run_1');

    assert.equal(fetchMock.calls.length, 2, 'expected two model rounds');
    assert.match(result.text, /Levi's denim jacket/);
    assert.equal(result.metadata?.toolRounds, 1);
    assert.deepEqual(result.metadata?.executedTools, ['search_listings']);
    // Usage is accumulated across both rounds.
    const usage = result.metadata?.providerUsage as { totalTokens: number };
    assert.equal(usage.totalTokens, 45);

    // The second request must carry the function_call_output for call_1.
    const round2Input = fetchMock.calls[1].body.input as Array<Record<string, unknown>>;
    const toolOutput = round2Input.find((i) => i.type === 'function_call_output');
    assert.ok(toolOutput, 'expected function_call_output in round-2 input');
    assert.equal(toolOutput.call_id, 'call_1');
    const outputPayload = JSON.parse(String(toolOutput.output)) as { listings?: unknown[] };
    assert.equal(outputPayload.listings?.length, 1);

    // The listings query ran in the actor's scope context (real execution,
    // not a stub) — verify the search actually hit the DB.
    assert.ok(queries.some((q) => /FROM listings/.test(q.sql)));

    // Run steps were recorded: retrieval + model_call + tool_call.
    const stepInserts = queries.filter((q) => /INSERT INTO agent_run_steps/.test(q.sql));
    const stepTypes = stepInserts.map((q) => q.params[3]);
    assert.ok(stepTypes.includes('retrieval'));
    assert.ok(stepTypes.includes('model_call'));
    assert.ok(stepTypes.includes('tool_call'));
  } finally {
    fetchMock.restore();
  }
});

test('a destructive tool call parks the run on a durable approval request', async () => {
  const fetchMock = mockFetch([
    {
      id: 'resp_1', model: 'gpt-5.6-terra',
      output: [{ type: 'function_call', call_id: 'call_9', name: 'delete_account', arguments: '{}' }],
      usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
    },
  ]);
  const { db, queries } = scriptedDb(baselineHandlers());
  try {
    const result = await executeOpenAiAgent(makeCtx(), CREDENTIAL, db as never, 'run_1');

    assert.equal(result.metadata?.waitingForApproval, true);
    assert.equal(result.needsHumanReview, true);
    assert.deepEqual(result.metadata?.pendingApprovals, ['delete_account']);
    assert.equal(fetchMock.calls.length, 1, 'no second round while waiting');
    assert.ok(
      queries.some((q) => /INSERT INTO agent_approval_requests/.test(q.sql)),
      'expected a durable approval row',
    );
  } finally {
    fetchMock.restore();
  }
});

test('an approved tool call executes on resume — matching tool+args', async () => {
  const fetchMock = mockFetch([
    {
      id: 'resp_1', model: 'gpt-5.6-terra',
      output: [{ type: 'function_call', call_id: 'call_9', name: 'delete_account', arguments: '{}' }],
      usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
    },
    {
      id: 'resp_2', model: 'gpt-5.6-terra',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Done.' }] }],
      usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
    },
  ]);
  const { db, queries } = scriptedDb(baselineHandlers([
    // The approval the user granted — matches tool+canonical args.
    {
      match: /FROM agent_approval_requests/,
      rows: [{
        tool_name: 'delete_account', tool_arguments: {}, edited_arguments: null,
        status: 'approved',
      }],
    },
  ]));
  try {
    const result = await executeOpenAiAgent(makeCtx(), CREDENTIAL, db as never, 'run_1');
    // The destructive call was policy-allowed by the approval and executed —
    // executor returns honest failure (no executor registered) which is fed
    // back to the model rather than crashing.
    assert.equal(result.text, 'Done.');
    assert.equal(result.metadata?.toolRounds, 1);
    assert.deepEqual(result.metadata?.executedTools, ['delete_account']);
    assert.ok(!queries.some((q) => /INSERT INTO agent_approval_requests/.test(q.sql)));
  } finally {
    fetchMock.restore();
  }
});

test('a rejected tool call is denied on resume — no approval re-prompt loop', async () => {
  const fetchMock = mockFetch([
    {
      id: 'resp_1', model: 'gpt-5.6-terra',
      output: [{ type: 'function_call', call_id: 'call_9', name: 'delete_account', arguments: '{}' }],
      usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
    },
    {
      id: 'resp_2', model: 'gpt-5.6-terra',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Understood, I won\'t do that.' }] }],
      usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
    },
  ]);
  const { db, queries } = scriptedDb(baselineHandlers([
    {
      match: /FROM agent_approval_requests/,
      rows: [{
        tool_name: 'delete_account', tool_arguments: {}, edited_arguments: null,
        status: 'rejected',
      }],
    },
  ]));
  try {
    const result = await executeOpenAiAgent(makeCtx(), CREDENTIAL, db as never, 'run_1');
    assert.match(result.text, /won't do that/);
    assert.ok(
      !queries.some((q) => /INSERT INTO agent_approval_requests/.test(q.sql)),
      'a rejected call must never create another approval request',
    );
    // The denial was fed back to the model as a tool output.
    const round2Input = fetchMock.calls[1].body.input as Array<Record<string, unknown>>;
    const toolOutput = round2Input.find((i) => i.type === 'function_call_output');
    assert.match(String(toolOutput?.output), /rejected/);
  } finally {
    fetchMock.restore();
  }
});

test('a denied tool output is honest — the model is told, not deceived', async () => {
  const fetchMock = mockFetch([
    {
      id: 'resp_1', model: 'gpt-5.6-terra',
      // Model proposes a tool that does not exist in the registry.
      output: [{ type: 'function_call', call_id: 'call_x', name: 'wire_money', arguments: '{}' }],
      usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
    },
    {
      id: 'resp_2', model: 'gpt-5.6-terra',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'I cannot do that.' }] }],
      usage: { input_tokens: 5, output_tokens: 3, total_tokens: 8 },
    },
  ]);
  const { db } = scriptedDb(baselineHandlers());
  try {
    const result = await executeOpenAiAgent(makeCtx(), CREDENTIAL, db as never, 'run_1');
    const round2Input = fetchMock.calls[1].body.input as Array<Record<string, unknown>>;
    const toolOutput = round2Input.find((i) => i.type === 'function_call_output');
    assert.match(String(toolOutput?.output), /unknown tool/);
    assert.match(result.text, /cannot do that/);
  } finally {
    fetchMock.restore();
  }
});
