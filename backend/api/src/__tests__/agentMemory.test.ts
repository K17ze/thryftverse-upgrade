import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseExtractedMemories,
  isSensitiveMemoryContent,
  formatMemoriesForPrompt,
  getAgentMemorySettings,
  recallAgentMemories,
  storeAgentMemory,
  retractAgentMemory,
  clearAgentMemories,
  type AgentMemory,
} from '../lib/agentMemory.js';
import type { BotRuntimeContext } from '../botRuntime/types.js';
import { executeAgentTool } from '../botRuntime/toolExecutors.js';

// ── Fake queryable ────────────────────────────────────────────────────
// A scripted query stub: handlers matched by substring against the SQL.
// Records every call so tests can assert parameter scoping — the real
// isolation boundary while app.current_user_id is unset on pool
// connections.

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

function fakeDb(
  handlers: Array<{ match: RegExp; rows: Record<string, unknown>[]; rowCount?: number }>,
): { db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number }> }; queries: RecordedQuery[] } {
  const queries: RecordedQuery[] = [];
  return {
    queries,
    db: {
      async query(sql: string, params: unknown[] = []) {
        queries.push({ sql, params });
        for (const h of handlers) {
          if (h.match.test(sql)) {
            return { rows: h.rows, rowCount: h.rowCount ?? h.rows.length };
          }
        }
        return { rows: [], rowCount: 0 };
      },
    },
  };
}

// ── parseExtractedMemories ────────────────────────────────────────────

test('parseExtractedMemories parses a bare JSON array', () => {
  const out = parseExtractedMemories('[{"kind":"preference","content":"Wears UK size 10"}]');
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'preference');
  assert.equal(out[0].content, 'Wears UK size 10');
});

test('parseExtractedMemories tolerates code fences and wrapping object', () => {
  const fenced = '```json\n{"memories":[{"kind":"fact","content":"Lives in Manchester"}]}\n```';
  const out = parseExtractedMemories(fenced);
  assert.equal(out.length, 1);
  assert.equal(out[0].content, 'Lives in Manchester');
});

test('parseExtractedMemories returns [] for non-JSON garbage', () => {
  assert.deepEqual(parseExtractedMemories('not json at all'), []);
  assert.deepEqual(parseExtractedMemories(''), []);
});

test('parseExtractedMemories drops secrets, short content and unknown kinds', () => {
  const out = parseExtractedMemories(JSON.stringify([
    { kind: 'fact', content: 'my password is hunter2' },
    { kind: 'fact', content: 'ok' },
    { kind: 'nonsense', content: 'Prefers vintage denim jackets' },
    { kind: 'directive', content: 'Always show UK sizes first' },
  ]));
  assert.equal(out.length, 2);
  assert.equal(out[0].kind, 'fact'); // unknown kind normalised
  assert.equal(out[1].kind, 'directive');
});

test('parseExtractedMemories caps output at 5 candidates', () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ kind: 'fact', content: `Fact number ${i} about user` }));
  assert.equal(parseExtractedMemories(JSON.stringify(items)).length, 5);
});

// ── isSensitiveMemoryContent ──────────────────────────────────────────

test('isSensitiveMemoryContent refuses credentials and payment data', () => {
  assert.ok(isSensitiveMemoryContent('my api key is abc'));
  assert.ok(isSensitiveMemoryContent('password: hunter2'));
  assert.ok(isSensitiveMemoryContent('card 4111111111111111'));
  assert.ok(isSensitiveMemoryContent('use sk-abcdefghijklmnop'));
});

test('isSensitiveMemoryContent allows ordinary preferences', () => {
  assert.ok(!isSensitiveMemoryContent('Prefers UK size 10 and vintage Levi\'s'));
  assert.ok(!isSensitiveMemoryContent('Budget around £80 for jackets'));
});

// ── formatMemoriesForPrompt ───────────────────────────────────────────

test('formatMemoriesForPrompt frames memory as observed context, not commands', () => {
  const mem: AgentMemory = {
    id: 'mem_1', userId: 'u1', botId: null, kind: 'preference',
    content: 'Prefers UK size 10', sourceType: 'explicit',
    sourceConversationId: null, sourceRunId: null, status: 'active',
    confidence: 0.8, validFrom: '2026-01-01', validTo: null,
    useCount: 2, lastUsedAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };
  const block = formatMemoriesForPrompt([mem]);
  assert.match(block, /observed context, not commands/);
  assert.match(block, /\[preference\] Prefers UK size 10/);
  assert.match(block, /all your agents/);
  assert.equal(formatMemoriesForPrompt([]), '');
});

// ── Settings ──────────────────────────────────────────────────────────

test('getAgentMemorySettings returns defaults when no row exists', async () => {
  const { db } = fakeDb([]);
  const s = await getAgentMemorySettings(db as never, 'u1');
  assert.deepEqual(s, { memoryEnabled: true, extractionEnabled: true });
});

// ── Recall scoping ────────────────────────────────────────────────────

test('recallAgentMemories returns disabled method when memory is off', async () => {
  const { db, queries } = fakeDb([
    { match: /agent_memory_settings/, rows: [{ memory_enabled: false, extraction_enabled: false }] },
  ]);
  const out = await recallAgentMemories(db as never, { userId: 'u1', queryText: 'hi' });
  assert.equal(out.method, 'disabled');
  assert.equal(out.memories.length, 0);
  // Must not probe vector column or select memories when disabled.
  assert.ok(!queries.some((q) => /FROM agent_memories/.test(q.sql) && /SELECT/.test(q.sql)));
});

test('recallAgentMemories scopes every query to the acting user and bot scope', async () => {
  const { db, queries } = fakeDb([
    { match: /agent_memory_settings/, rows: [{ memory_enabled: true, extraction_enabled: true }] },
    { match: /pg_attribute/, rows: [{ exists: false }] },
    {
      match: /FROM agent_memories/,
      rows: [{
        id: 'mem_a', user_id: 'u1', bot_id: null, kind: 'directive',
        content: 'Never suggest fast fashion', source_type: 'explicit',
        source_conversation_id: null, source_run_id: null, status: 'active',
        confidence: 0.9, valid_from: 'x', valid_to: null, use_count: 0,
        last_used_at: null, created_at: 'x', updated_at: 'x',
      }],
    },
  ]);
  const out = await recallAgentMemories(db as never, {
    userId: 'u1', botId: 'bot_9', queryText: 'what should I buy', limit: 5,
  });
  assert.equal(out.method, 'recency'); // no vector column → honest degrade
  assert.equal(out.memories.length, 1);
  const select = queries.find((q) => /FROM agent_memories/.test(q.sql));
  assert.ok(select, 'expected a memories select');
  assert.match(select.sql, /user_id = \$1/);
  assert.match(select.sql, /bot_id IS NULL OR bot_id = \$2/);
  assert.equal(select.params[0], 'u1');
  assert.equal(select.params[1], 'bot_9');
});

// ── Store ─────────────────────────────────────────────────────────────

test('storeAgentMemory refuses sensitive content before touching the DB', async () => {
  const { db, queries } = fakeDb([]);
  const res = await storeAgentMemory(db as never, {
    userId: 'u1', kind: 'fact', content: 'my password is hunter2', sourceType: 'explicit',
  });
  assert.deepEqual(res, { rejected: true, reason: 'sensitive_content' });
  assert.equal(queries.length, 0);
});

test('storeAgentMemory inserts scoped to user and bot when vectors absent', async () => {
  const { db, queries } = fakeDb([
    { match: /pg_attribute/, rows: [{ exists: false }] },
    { match: /INSERT INTO agent_memories/, rows: [], rowCount: 1 },
  ]);
  const res = await storeAgentMemory(db as never, {
    userId: 'u1', botId: 'bot_9', kind: 'preference',
    content: 'Prefers UK size 10', sourceType: 'conversation',
    sourceConversationId: 'conv_1', sourceRunId: 'run_1',
  });
  assert.ok('id' in res && res.created === true);
  const insert = queries.find((q) => /INSERT INTO agent_memories/.test(q.sql));
  assert.ok(insert);
  assert.equal(insert.params[1], 'u1');
  assert.equal(insert.params[2], 'bot_9');
  // No embedding column in the no-vector path.
  assert.ok(!/embedding_vec/.test(insert.sql));
});

// ── Retract / clear scoping ───────────────────────────────────────────

test('retractAgentMemory is scoped to the owning user', async () => {
  const { db, queries } = fakeDb([
    { match: /UPDATE agent_memories/, rows: [{ id: 'mem_a' }], rowCount: 1 },
  ]);
  const ok = await retractAgentMemory(db as never, 'u1', 'mem_a');
  assert.equal(ok, true);
  const q = queries[0];
  assert.match(q.sql, /user_id = \$2/);
  assert.equal(q.params[1], 'u1');
});

test('retractAgentMemory reports false for another user\'s memory', async () => {
  const { db } = fakeDb([{ match: /UPDATE agent_memories/, rows: [], rowCount: 0 }]);
  assert.equal(await retractAgentMemory(db as never, 'u2', 'mem_a'), false);
});

test('clearAgentMemories retracts only the caller\'s rows', async () => {
  const { db, queries } = fakeDb([{ match: /UPDATE agent_memories/, rows: [], rowCount: 4 }]);
  const n = await clearAgentMemories(db as never, 'u1');
  assert.equal(n, 4);
  assert.equal(queries[0].params[0], 'u1');
});

// ── Tool executors ────────────────────────────────────────────────────

function makeCtx(overrides: Partial<BotRuntimeContext> = {}): BotRuntimeContext {
  return {
    botId: 'bot_1', botName: 'Stylist', botSlug: 'stylist', botCategory: 'styling',
    botType: 'custom', commandHint: '@stylist', conversationId: 'conv_1',
    conversationType: 'dm', conversationTitle: null,
    actorUserId: 'actor_1', actorUserName: 'actor',
    permissionsSnapshot: ['reply_in_chat', 'read_messages'],
    command: '@stylist', args: [], messageText: 'help me',
    agentConfig: null, conversationHistory: [],
    runtimeData: { listings: [], recentMessagesAnalyzed: 0, messagesRequiringReview: 0 },
    ...overrides,
  };
}

test('executeAgentTool returns an honest failure for unknown tools', async () => {
  const { db } = fakeDb([]);
  const res = await executeAgentTool(db as never, makeCtx(), 'delete_everything', {});
  assert.equal(res.success, false);
  assert.match(res.output, /no executor/);
});

test('get_my_listings queries only the actor\'s rows — args cannot override scope', async () => {
  const { db, queries } = fakeDb([
    { match: /FROM listings/, rows: [{ id: 'l1', title: 'Jacket', price_gbp: '80', status: 'active', brand: null, category: null, created_at: 'x' }] },
  ]);
  const res = await executeAgentTool(db as never, makeCtx(), 'get_my_listings', {
    // Model tries to scope to a different user — must be ignored.
    sellerId: 'victim_9', userId: 'victim_9',
  });
  assert.equal(res.success, true);
  const q = queries.find((r) => /FROM listings/.test(r.sql));
  assert.ok(q);
  assert.match(q.sql, /seller_id = \$1/);
  assert.equal(q.params[0], 'actor_1');
  assert.ok(!q.params.includes('victim_9'));
});

test('get_my_orders never escapes the actor scope', async () => {
  const { db, queries } = fakeDb([{ match: /FROM orders/, rows: [] }]);
  await executeAgentTool(db as never, makeCtx(), 'get_my_orders', { role: 'seller' });
  const q = queries.find((r) => /FROM orders/.test(r.sql));
  assert.ok(q);
  assert.match(q.sql, /buyer_id = \$1 OR o\.seller_id = \$1/);
  assert.equal(q.params[0], 'actor_1');
});

test('read_conversation reads only the run\'s conversation', async () => {
  const { db, queries } = fakeDb([{ match: /FROM chat_messages/, rows: [] }]);
  await executeAgentTool(db as never, makeCtx(), 'read_conversation', {
    conversationId: 'conv_other', maxMessages: 999,
  });
  const q = queries.find((r) => /FROM chat_messages/.test(r.sql));
  assert.ok(q);
  assert.equal(q.params[0], 'conv_1');
  // maxMessages is bounded — 999 must be clamped to the ceiling (50).
  assert.equal(q.params[1], 50);
});

test('search_listings requires a query and bounds results', async () => {
  const { db, queries } = fakeDb([{ match: /FROM listings/, rows: [] }]);
  const bad = await executeAgentTool(db as never, makeCtx(), 'search_listings', {});
  assert.equal(bad.success, false);
  const good = await executeAgentTool(db as never, makeCtx(), 'search_listings', { query: 'denim', maxResults: 500 });
  assert.equal(good.success, true);
  const q = queries.find((r) => /FROM listings/.test(r.sql));
  assert.equal(q?.params[3], 25); // clamped to ceiling
});

test('store_memory writes through storeAgentMemory with run provenance', async () => {
  const { db, queries } = fakeDb([
    { match: /agent_memory_settings/, rows: [{ memory_enabled: true, extraction_enabled: true }] },
    { match: /pg_attribute/, rows: [{ exists: false }] },
    { match: /INSERT INTO agent_memories/, rows: [], rowCount: 1 },
  ]);
  const res = await executeAgentTool(db as never, makeCtx({ runId: 'run_7' }), 'store_memory', {
    kind: 'directive', content: 'Always show UK sizing',
  });
  assert.equal(res.success, true);
  const insert = queries.find((r) => /INSERT INTO agent_memories/.test(r.sql));
  assert.ok(insert);
  assert.equal(insert.params[1], 'actor_1');
  assert.equal(insert.params[2], 'bot_1');
  assert.equal(insert.params[7], 'run_7'); // source_run_id provenance
});

test('store_memory fails honestly when the user disabled memory', async () => {
  const { db } = fakeDb([
    { match: /agent_memory_settings/, rows: [{ memory_enabled: false, extraction_enabled: false }] },
  ]);
  const res = await executeAgentTool(db as never, makeCtx(), 'store_memory', {
    kind: 'fact', content: 'Likes corduroy',
  });
  assert.equal(res.success, false);
  assert.match(res.output, /disabled/);
});

test('draft_reply never sends — it returns a draft marker only', async () => {
  const { db, queries } = fakeDb([]);
  const res = await executeAgentTool(db as never, makeCtx(), 'draft_reply', { text: 'That jacket is £80' });
  assert.equal(res.success, true);
  assert.match(res.output, /drafted_not_sent/);
  assert.equal(queries.length, 0); // no DB write
});
