// Listing risk-enforcement escape hatches — adversarial-review regression
// coverage for the owner-layer fixes.
//
// Coverage:
//   - the shared transition table: risk_pending is owner-held in every
//     direction; sold/deleted are terminal
//   - executeListingCommand: a command targeting 'active' runs the
//     listing.publish.requested gate — non-allow persists risk_pending
//     (with live-lot cancellation), deny rejects, evaluation errors fail
//     open to allow; a held listing never reaches the evaluator
//   - POST /seller-hub/batch-command 'resume' on a held listing returns a
//     rejected receipt — the pause-then-resume bypass is closed
//   - applyListingFieldPatch: bulk title/description edits run content
//     moderation; 'rejected' refuses the item, other field edits skip it
//   - POST /streaming/sessions/:id/bids refuses a bid when the lot's
//     listing was held mid-stream (LISTING_NOT_BIDDABLE)
//   - the lot-open route re-verifies listing eligibility (a passed lot on
//     a held listing cannot be re-opened)
//   - executeEnforcement visibility_restriction on a listing cancels its
//     non-terminal live lots in the same transaction
//
// Uses node:test with matcher-driven fake pg pools plus ESM load hooks
// substituting the realtime transport and the text-moderation service
// (controllable per test through globalThis).

import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import type { QueryResult, QueryResultRow } from 'pg';

const loaderSource = [
  'export async function load(url, context, nextLoad) {',
  "  if (url.includes('/lib/realtime')) {",
  '    return {',
  '      format: "module",',
  "      source: 'export async function publishRealtimeEvent() { return 0; }',",
  '      shortCircuit: true,',
  '    };',
  '  }',
  "  if (url.includes('/lib/orderChatCards')) {",
  '    return {',
  '      format: "module",',
  "      source: 'export async function emitOrderCommerceCard() { return null; }',",
  '      shortCircuit: true,',
  '    };',
  '  }',
  "  if (url.includes('/lib/moderation/moderationService')) {",
  '    return {',
  '      format: "module",',
  "      source: 'export async function moderateListingText(listingId, text) { const g = globalThis; g.__listingModerationCalls = (g.__listingModerationCalls ?? 0) + 1; g.__listingModerationTexts = g.__listingModerationTexts ?? []; g.__listingModerationTexts.push(text); return g.__listingModerationResult ?? { status: \\'approved\\', confidence: 1, labels: [], provider: \\'test\\', modelVersion: \\'test\\', processingTimeMs: 0 }; } export function listingTextGateAction(status) { if (status === \\'rejected\\') return \\'block\\'; if (status === \\'review\\' || status === \\'failed\\') return \\'hold\\'; return \\'publish\\'; }',",
  '      shortCircuit: true,',
  '    };',
  '  }',
  '  return nextLoad(url, context);',
  '}',
].join('\n');
const loaderUrl =
  'data:text/javascript;base64,' + Buffer.from(loaderSource).toString('base64');
register(loaderUrl, import.meta.url);

const {
  executeListingCommand,
  canListingTransition,
} = await import('../lib/listingCommandService.js');
const { applyListingFieldPatch } = await import('../lib/listingPatch.js');
const { executeEnforcement } = await import('../lib/safetyCaseService.js');
const { registerStreamingRoutes } = await import('../routes/streaming.js');
const { registerSellerHubRoutes } = await import('../routes/sellerHub.js');
const { registerLiveLotEngineRoutes } = await import('../routes/liveLotEngine.js');

// ── Fake pool ────────────────────────────────────────────────────────────

type QueryMatcher = (
  text: string,
  params: unknown[],
) => { rows: QueryResultRow[]; rowCount: number } | undefined;

function createMockDb(matcher: QueryMatcher) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const db = {
    calls,
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[],
    ): Promise<QueryResult<T>> {
      calls.push({ text, params: params ?? [] });
      const result = matcher(text, params ?? []);
      if (result === undefined) {
        return { rows: [] as T[], rowCount: 0 } as QueryResult<T>;
      }
      return result as QueryResult<T>;
    },
    async connect() {
      return {
        query: (text: string, params?: unknown[]) => db.query(text, params),
        release: () => {},
      };
    },
  };
  return db;
}

function rows(r: QueryResultRow[]) {
  return { rows: r, rowCount: r.length };
}

function empty() {
  return { rows: [], rowCount: 0 };
}

function createMockApp() {
  const handlers = new Map<string, (req: unknown, reply: unknown) => unknown>();
  const capture = (method: string) => (p: string, ...rest: unknown[]) => {
    handlers.set(
      `${method} ${p}`,
      rest[rest.length - 1] as (req: unknown, reply: unknown) => unknown,
    );
  };
  return {
    app: {
      post: capture('POST'),
      get: capture('GET'),
      put: capture('PUT'),
      patch: capture('PATCH'),
      delete: capture('DELETE'),
    },
    handlers,
  };
}

function createReply() {
  return {
    statusCode: 200,
    code(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
  };
}

const createApiError = (code: string, message: string) =>
  Object.assign(new Error(message), { code });

// ── Shared transition table ──────────────────────────────────────────────

test('transition table: risk_pending is owner-held, sold/deleted terminal', () => {
  assert.equal(canListingTransition('draft', 'active'), true);
  assert.equal(canListingTransition('paused', 'active'), true);
  assert.equal(canListingTransition('active', 'paused'), true);
  // Resurrection and relist escape hatches are closed.
  assert.equal(canListingTransition('deleted', 'draft'), false);
  assert.equal(canListingTransition('sold', 'draft'), false);
  assert.equal(canListingTransition('sold', 'active'), false);
  // A held listing cannot be moved by the owner in ANY direction.
  assert.equal(canListingTransition('risk_pending', 'active'), false);
  assert.equal(canListingTransition('risk_pending', 'paused'), false);
  assert.equal(canListingTransition('risk_pending', 'draft'), false);
  assert.equal(canListingTransition('risk_pending', 'deleted'), false);
});

// ── executeListingCommand publish gate ───────────────────────────────────

function listingLockMatcher(status: string): QueryMatcher {
  return (text) => {
    if (/FROM listings/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        {
          id: 'l1',
          seller_id: 'seller_1',
          status,
          version: 1,
          price_gbp: '25.00',
        },
      ]);
    }
    return empty();
  };
}

test('resume on a risk_pending listing is rejected before any evaluation', async () => {
  let evaluatorCalled = false;
  const db = createMockDb(listingLockMatcher('risk_pending'));

  const result = await executeListingCommand(
    db as never,
    { type: 'resume', listingId: 'l1', actorId: 'seller_1' },
    undefined,
    {
      evaluatePublishRisk: async () => {
        evaluatorCalled = true;
        return { decisionId: 'rdec_x', ownerDecision: 'allow' };
      },
    },
  );

  assert.equal(result.status, 'rejected');
  assert.match(
    result.status === 'rejected' ? result.reason : '',
    /risk_pending -> active is not allowed/,
  );
  assert.equal(evaluatorCalled, false, 'illegal transitions never reach the gate');
  assert.ok(
    !db.calls.some((c) => /UPDATE listings/.test(c.text)),
    'held listing not mutated',
  );
});

test('a non-allow publish decision persists risk_pending and cancels live lots', async () => {
  const db = createMockDb((text, params) => {
    if (/FROM listings/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        {
          id: 'l1',
          seller_id: 'seller_1',
          status: 'paused',
          version: 1,
          price_gbp: '25.00',
        },
      ]);
    }
    if (/UPDATE live_lots/.test(text)) {
      return rows([{ id: 'lot-1', session_id: 'sess-1', version: 2 }]);
    }
    return empty();
  });

  const result = await executeListingCommand(
    db as never,
    { type: 'resume', listingId: 'l1', actorId: 'seller_1' },
    undefined,
    {
      evaluatePublishRisk: async () => ({
        decisionId: 'rdec_1',
        ownerDecision: 'manual_review',
      }),
    },
  );

  assert.equal(result.status, 'applied');
  assert.equal(result.newStatus, 'risk_pending', 'held publish reports risk_pending truthfully');

  const listingUpdate = db.calls.find((c) => /UPDATE listings/.test(c.text));
  assert.ok(listingUpdate);
  assert.equal(listingUpdate!.params[1], 'risk_pending');

  const lotCancel = db.calls.find(
    (c) => /UPDATE live_lots/.test(c.text) && /'cancelled'/.test(c.text),
  );
  assert.ok(lotCancel, 'non-terminal live lots cancelled on hold');
  assert.ok(
    db.calls.some((c) => /INSERT INTO live_lot_events/.test(c.text)),
    'lot.cancelled recorded on the engine audit log',
  );
  assert.ok(
    db.calls.some((c) => /INSERT INTO risk_executions/.test(c.text)),
    'execution recorded for the decision',
  );
});

test('a deny publish decision rejects the command outright', async () => {
  const db = createMockDb(listingLockMatcher('paused'));

  const result = await executeListingCommand(
    db as never,
    { type: 'resume', listingId: 'l1', actorId: 'seller_1' },
    undefined,
    {
      evaluatePublishRisk: async () => ({
        decisionId: 'rdec_2',
        ownerDecision: 'deny',
      }),
    },
  );

  assert.equal(result.status, 'rejected');
  assert.equal(
    result.status === 'rejected' ? result.reason : '',
    'risk_publish_denied',
  );
  assert.ok(
    !db.calls.some((c) => /UPDATE listings/.test(c.text)),
    'denied publish mutates nothing',
  );
  assert.ok(
    db.calls.some((c) => /INSERT INTO risk_executions/.test(c.text)),
    'deny enforcement is recorded',
  );
});

test('an evaluation error fails open to allow', async () => {
  const db = createMockDb(listingLockMatcher('paused'));

  const result = await executeListingCommand(
    db as never,
    { type: 'resume', listingId: 'l1', actorId: 'seller_1' },
    undefined,
    {
      evaluatePublishRisk: async () => {
        throw new Error('risk service exploded');
      },
    },
  );

  assert.equal(result.status, 'applied');
  assert.equal(result.newStatus, 'active');
  const listingUpdate = db.calls.find((c) => /UPDATE listings/.test(c.text));
  assert.equal(listingUpdate!.params[1], 'active');
});

// ── Batch resume through the seller-hub route ────────────────────────────

test('batch resume on a held listing returns a rejected receipt', async () => {
  const { app, handlers } = createMockApp();
  const client = {
    queries: [] as { sql: string; params: unknown[] }[],
    async query(sql: string, params: unknown[] = []) {
      client.queries.push({ sql, params });
      if (/FROM listings/.test(sql) && /FOR UPDATE/.test(sql)) {
        return rows([
          {
            id: 'l1',
            seller_id: 'seller_1',
            status: 'risk_pending',
            version: 1,
            price_gbp: '10.00',
          },
        ]);
      }
      return empty();
    },
    release() {},
  };
  const db = {
    async query(sql: string, params: unknown[] = []) {
      if (/FROM listing_batch_jobs/.test(sql)) return empty();
      if (/INSERT INTO listing_batch_jobs/.test(sql)) return empty();
      if (/SELECT id, seller_id FROM listings WHERE id = ANY/.test(sql)) {
        return rows([{ id: 'l1', seller_id: 'seller_1' }]);
      }
      if (/INSERT INTO listing_batch_items/.test(sql)) return empty();
      if (/UPDATE listing_batch_jobs/.test(sql)) return empty();
      return empty();
    },
    async connect() {
      return client;
    },
  };

  registerSellerHubRoutes({ app: app as never, readDb: db as never, db: db as never });

  const handler = handlers.get('POST /seller-hub/batch-command');
  assert.ok(handler);
  const reply = createReply();
  const result = (await handler!(
    {
      authUser: { userId: 'seller_1' },
      id: 'req-1',
      headers: {},
      ip: '127.0.0.1',
      body: {
        idempotencyKey: 'resume-key-1',
        command: 'resume',
        items: [{ listingId: 'l1' }],
      },
    },
    reply,
  )) as {
    ok: boolean;
    results: { listingId: string; state: string; reason?: string }[];
  };

  assert.equal(result.ok, true);
  assert.equal(result.results[0].state, 'rejected');
  assert.match(result.results[0].reason ?? '', /risk_pending -> active/);
  assert.ok(
    !client.queries.some((q) => /UPDATE listings/.test(q.sql)),
    'the pause-then-resume bypass writes nothing',
  );
});

// ── Bulk text edits are moderated ────────────────────────────────────────

const moderationGlobals = globalThis as {
  __listingModerationCalls?: number;
  __listingModerationTexts?: string[];
  __listingModerationResult?: { status: string; labels: unknown[] };
};

function editLockDb(): ReturnType<typeof createMockDb> {
  return createMockDb((text) => {
    if (/FROM listings/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        {
          id: 'l1',
          seller_id: 'seller_1',
          price_gbp: '10.00',
          status: 'active',
          title: 'Vintage jacket',
          description: 'Gently used vintage jacket',
        },
      ]);
    }
    if (/INSERT INTO listing_price_events/.test(text)) return rows([{ id: 7 }]);
    if (/INSERT INTO domain_outbox/.test(text)) return rows([{ id: 'evt_1' }]);
    return empty();
  });
}

test('bulk edit of title/description runs moderation on the merged text', async () => {
  moderationGlobals.__listingModerationResult = undefined;
  moderationGlobals.__listingModerationCalls = 0;
  moderationGlobals.__listingModerationTexts = [];
  const db = editLockDb();

  const result = await applyListingFieldPatch(db as never, {
    listingId: 'l1',
    patch: { title: 'Rare vintage jacket' },
    actorId: 'seller_1',
  });

  assert.equal(result.status, 'applied');
  assert.deepEqual(
    result.status === 'applied' ? result.appliedFields : [],
    ['title'],
  );
  assert.equal(moderationGlobals.__listingModerationCalls, 1);
  // The merged text pairs the new title with the locked current description.
  assert.equal(
    moderationGlobals.__listingModerationTexts![0],
    'Rare vintage jacket\nGently used vintage jacket',
  );
});

test('bulk edit is rejected when moderation rejects the text', async () => {
  moderationGlobals.__listingModerationResult = {
    status: 'rejected',
    labels: [{ name: 'prohibited', confidence: 0.99, category: 'illegal' }],
  };
  const db = editLockDb();

  const result = await applyListingFieldPatch(db as never, {
    listingId: 'l1',
    patch: { description: 'textbook counterfeit replica guaranteed' },
    actorId: 'seller_1',
  });

  assert.equal(result.status, 'rejected');
  assert.equal(
    result.status === 'rejected' ? result.reason : '',
    'moderation_rejected',
  );
  assert.ok(
    !db.calls.some((c) => /UPDATE listings SET/.test(c.text)),
    'rejected text is never written',
  );
});

test('bulk edits that do not touch text skip moderation entirely', async () => {
  moderationGlobals.__listingModerationResult = undefined;
  moderationGlobals.__listingModerationCalls = 0;
  const db = editLockDb();

  const result = await applyListingFieldPatch(db as never, {
    listingId: 'l1',
    patch: { priceGbp: 20 },
    actorId: 'seller_1',
  });

  assert.equal(result.status, 'applied');
  assert.equal(moderationGlobals.__listingModerationCalls, 0);
});

// ── Bulk text edits fail closed on review/failed (moderation hold) ───────

function editLockDbWithLiveLot(): ReturnType<typeof createMockDb> {
  return createMockDb((text) => {
    if (/FROM listings/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        {
          id: 'l1',
          seller_id: 'seller_1',
          price_gbp: '10.00',
          status: 'active',
          title: 'Vintage jacket',
          description: 'Gently used vintage jacket',
        },
      ]);
    }
    if (/UPDATE live_lots/.test(text)) {
      return rows([{ id: 'lot-1', session_id: 'sess-1', version: 2 }]);
    }
    return empty();
  });
}

for (const heldStatus of ['review', 'failed'] as const) {
  test(`bulk edit with a '${heldStatus}' verdict holds a live listing at risk_pending`, async () => {
    moderationGlobals.__listingModerationResult = {
      status: heldStatus,
      labels: [{ name: 'borderline', confidence: 0.5, category: 'other' }],
    };
    const db = editLockDbWithLiveLot();

    const result = await applyListingFieldPatch(db as never, {
      listingId: 'l1',
      patch: { title: 'Rare vintage jacket — check photos' },
      actorId: 'seller_1',
    });

    assert.equal(result.status, 'applied');
    assert.equal(
      result.status === 'applied' ? result.newStatus : undefined,
      'risk_pending',
      'a held verdict on a live listing must land it at risk_pending',
    );

    const listingUpdate = db.calls.find((c) => /UPDATE listings SET/.test(c.text));
    assert.ok(listingUpdate, 'the field patch is still written');
    assert.ok(
      /status = \$/.test(listingUpdate!.text),
      'the UPDATE must rewrite status alongside the field patch',
    );
    assert.ok(
      listingUpdate!.params.includes('risk_pending'),
      'the patched status value is risk_pending',
    );

    const lotCancel = db.calls.find(
      (c) => /UPDATE live_lots/.test(c.text) && /'cancelled'/.test(c.text),
    );
    assert.ok(lotCancel, 'non-terminal live lots cancelled on the hold');
    assert.ok(
      db.calls.some((c) => /INSERT INTO live_lot_events/.test(c.text)),
      'lot.cancelled recorded on the engine audit log',
    );
  });
}

test('a held verdict on a non-public listing applies the patch without a status write', async () => {
  moderationGlobals.__listingModerationResult = {
    status: 'review',
    labels: [{ name: 'borderline', confidence: 0.5, category: 'other' }],
  };
  const db = createMockDb((text) => {
    if (/FROM listings/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        {
          id: 'l1',
          seller_id: 'seller_1',
          price_gbp: '10.00',
          status: 'paused',
          title: 'Vintage jacket',
          description: 'Gently used vintage jacket',
        },
      ]);
    }
    return empty();
  });

  const result = await applyListingFieldPatch(db as never, {
    listingId: 'l1',
    patch: { description: 'Updated description for the paused listing' },
    actorId: 'seller_1',
  });

  assert.equal(result.status, 'applied');
  assert.equal(
    result.status === 'applied' ? result.newStatus : undefined,
    undefined,
    'a non-public listing is already unservable — no hold write needed',
  );
  const listingUpdate = db.calls.find((c) => /UPDATE listings SET/.test(c.text));
  assert.ok(listingUpdate);
  assert.ok(
    !/status = \$/.test(listingUpdate!.text),
    'no status write on a listing that is not publicly servable',
  );
  assert.ok(
    !db.calls.some((c) => /UPDATE live_lots/.test(c.text)),
    'no lot churn on a non-public hold',
  );
});

// ── Bid path refuses lots on held listings ───────────────────────────────

function setupBidRoute(listingStatus: string) {
  const { app, handlers } = createMockApp();
  const client = {
    queries: [] as { sql: string; params: unknown[] }[],
    async query(sql: string, params: unknown[] = []) {
      client.queries.push({ sql, params });
      if (/FROM live_lots/.test(sql) && /FOR UPDATE/.test(sql)) {
        return rows([
          {
            id: 'lot-1',
            session_id: 'sess-1',
            listing_id: 'lst-1',
            lot_number: 1,
            position: 0,
            status: 'open',
            currency: 'GBP',
            start_price_minor: '0',
            reserve_price_minor: null,
            min_increment_minor: '100',
            high_bid_id: null,
            high_bid_minor: '0',
            high_bidder_id: null,
            winner_id: null,
            order_id: null,
            version: 1,
            opens_at: null,
            closes_at: null,
            closed_at: null,
            extension_count: 0,
            seller_id: 'host-1',
            listing_status: listingStatus,
          },
        ]);
      }
      if (/FROM live_shopping_current_lots/.test(sql)) {
        return rows([
          {
            session_id: 'sess-1',
            listing_id: 'lst-1',
            lot_number: 1,
            current_price: '0',
            bid_count: 0,
            updated_at: new Date().toISOString(),
          },
        ]);
      }
      return empty();
    },
    release() {},
  };
  const db = {
    async query(sql: string) {
      if (/live_shopping_sessions/.test(sql)) {
        return rows([
          { id: 'sess-1', title: 'Live', host_user_id: 'host-1', status: 'live' },
        ]);
      }
      return empty();
    },
    async connect() {
      return client;
    },
  };
  registerStreamingRoutes({
    app: app as never,
    db: db as never,
    createApiError: createApiError as never,
    resolveAuthenticatedUserId: (() => 'bidder-1') as never,
  });
  return { handlers, client };
}

test('a bid on a lot whose listing was held mid-stream is refused with 409', async () => {
  const { handlers, client } = setupBidRoute('risk_pending');
  const handler = handlers.get('POST /streaming/sessions/:sessionId/bids');
  assert.ok(handler);
  const reply = createReply();
  const result = (await handler!(
    {
      params: { sessionId: 'sess-1' },
      body: { amount: 60 },
      authUser: { userId: 'bidder-1' },
      log: { warn() {}, error() {} },
    },
    reply,
  )) as { ok: boolean; code?: string };

  assert.equal(reply.statusCode, 409);
  assert.equal(result.code, 'LISTING_NOT_BIDDABLE');
  assert.ok(
    !client.queries.some((q) => /INSERT INTO live_shopping_bids/.test(q.sql)),
    'no bid row lands on a held listing',
  );
});

test('a bid on a live lot with an active listing still lands', async () => {
  const { handlers, client } = setupBidRoute('active');
  const handler = handlers.get('POST /streaming/sessions/:sessionId/bids');
  assert.ok(handler);
  const reply = createReply();
  const result = (await handler!(
    {
      params: { sessionId: 'sess-1' },
      body: { amount: 60 },
      authUser: { userId: 'bidder-1' },
      log: { warn() {}, error() {} },
    },
    reply,
  )) as { ok: boolean };

  assert.equal(reply.statusCode, 201);
  assert.equal(result.ok, true);
  assert.ok(
    client.queries.some((q) => /INSERT INTO live_shopping_bids/.test(q.sql)),
  );
});

// ── Lot open re-verifies listing eligibility ─────────────────────────────

test('re-opening a passed lot on a held listing is refused', async () => {
  const { app, handlers } = createMockApp();
  const client = {
    queries: [] as { sql: string; params: unknown[] }[],
    async query(sql: string, params: unknown[] = []) {
      client.queries.push({ sql, params });
      if (/FROM live_lots/.test(sql) && /FOR UPDATE/.test(sql)) {
        return rows([
          {
            id: 'lot-1',
            session_id: 'sess-1',
            listing_id: 'lst-1',
            lot_number: 1,
            position: 0,
            status: 'passed',
            currency: 'GBP',
            start_price_minor: '0',
            reserve_price_minor: null,
            min_increment_minor: '100',
            high_bid_id: null,
            high_bid_minor: '0',
            high_bidder_id: null,
            winner_id: null,
            order_id: null,
            version: 2,
            opens_at: null,
            closes_at: null,
            closed_at: null,
            extension_count: 0,
          },
        ]);
      }
      if (/FROM listings/.test(sql)) {
        return rows([{ status: 'risk_pending' }]);
      }
      return empty();
    },
    release() {},
  };
  const db = {
    async query(sql: string) {
      if (/live_shopping_sessions/.test(sql)) {
        return rows([
          { id: 'sess-1', title: 'Live', host_user_id: 'host-1', status: 'live' },
        ]);
      }
      return empty();
    },
    async connect() {
      return client;
    },
  };

  registerLiveLotEngineRoutes({
    app: app as never,
    db: db as never,
    resolveAuthenticatedUserId: (() => 'host-1') as never,
    createApiError: createApiError as never,
    calculateCommercePlatformChargeGbp: (() => 0) as never,
  });

  const handler = handlers.get(
    'POST /streaming/sessions/:sessionId/lots/:lotId/open',
  );
  assert.ok(handler);
  const reply = createReply();
  const result = (await handler!(
    {
      params: { sessionId: 'sess-1', lotId: 'lot-1' },
      body: { durationSeconds: 60 },
      authUser: { userId: 'host-1' },
      log: { warn() {}, error() {} },
    },
    reply,
  )) as { ok: boolean; code?: string };

  assert.equal(reply.statusCode, 409);
  assert.equal(result.code, 'LISTING_NOT_ELIGIBLE');
  assert.ok(
    !client.queries.some(
      (q) => /UPDATE live_lots/.test(q.sql) && /'open'/.test(q.sql),
    ),
    'held listing never re-opens a bidding window',
  );
});

// ── Enforcement cancels non-terminal live lots ───────────────────────────

test('visibility_restriction on a listing cancels its non-terminal live lots', async () => {
  const enforcement = {
    id: 'enf_1',
    decision_id: 'sdec_1',
    action_type: 'visibility_restriction',
    target_type: 'listing',
    target_id: 'lst-1',
    scope: {},
    executed_at: null,
    reversed_at: null,
    reversed_by: null,
    reversal_reason: null,
    status: 'pending',
  };
  const db = createMockDb((text) => {
    if (/SELECT \* FROM enforcement_actions/.test(text)) {
      return rows([enforcement]);
    }
    if (/SELECT status FROM listings/.test(text)) {
      return rows([{ status: 'active' }]);
    }
    if (/UPDATE live_lots/.test(text)) {
      return rows([{ id: 'lot-1', session_id: 'sess-1', version: 2 }]);
    }
    if (/UPDATE listings/.test(text)) return empty();
    if (/UPDATE enforcement_actions/.test(text)) {
      return rows([{ ...enforcement, status: 'executed' }]);
    }
    if (/FROM safety_decisions/.test(text)) return rows([{ case_id: 'sc_1' }]);
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  const result = await executeEnforcement(
    db as never,
    'enf_1',
    { id: 'op-1', team: 'trust_safety' } as never,
    { id: 'ws-1' } as never,
  );

  assert.equal(result.status, 'executed');
  const lotCancel = db.calls.find(
    (c) => /UPDATE live_lots/.test(c.text) && /'cancelled'/.test(c.text),
  );
  assert.ok(lotCancel, 'open live lots cancelled with the hold');
  assert.match(lotCancel!.text, /'scheduled', 'open', 'closing', 'passed'/);
  const lotEvent = db.calls.find((c) => /INSERT INTO live_lot_events/.test(c.text));
  assert.ok(lotEvent, 'lot.cancelled recorded on the engine audit log');
  assert.match(lotEvent!.text, /'lot\.cancelled'/);
});
