// Reach-suppression executor — the distribution half of the safety pipeline.
//
// Coverage:
//   - sellerReach serving fragments (join / exclusion / rank multiplier)
//   - setSellerReach / clearSellerReach / restoreSellerReach write the users
//     row + an immutable audit event
//   - executeEnforcement('visibility_restriction'):
//       target 'user'    → users.reach_state, prior snapshot in scope
//       target 'listing' → listings.status = 'risk_pending'
//   - reverseEnforcement restores the snapshot stored in scope.prior
//   - decideAppeal('overturned') reverts the real effect, not just the ledger
//   - recordDecision(restrict, severity>=3) auto-executes a reach limit
//   - recordConsumerReport severity>=3 materialises case + decision +
//     executed enforcement and limits the seller's reach
//   - live-lot scheduling rejects 'risk_pending' listings
//
// Uses node:test with a matcher-driven fake pg pool (reportSafetyBridge
// convention) and a mock Fastify app for the lot-engine route.

import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import type { QueryResult, QueryResultRow } from 'pg';

import {
  executeEnforcement,
  reverseEnforcement,
  decideAppeal,
  recordDecision,
  recordConsumerReport,
} from '../lib/safetyCaseService.js';
import {
  REACH_EXCLUDED_SQL,
  REACH_LIMITED_MULTIPLIER,
  clearSellerReach,
  reachExcludedSql,
  reachJoinSql,
  reachRankMultiplierExpr,
  restoreSellerReach,
  setSellerReach,
} from '../lib/sellerReach.js';

// Substitute the realtime transport + order chat emitter before the dynamic
// import so liveLotEngine can be exercised without infrastructure (mirrors
// liveLotTiming.test.ts).
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
  '  return nextLoad(url, context);',
  '}',
].join('\n');
const loaderUrl =
  'data:text/javascript;base64,' + Buffer.from(loaderSource).toString('base64');
register(loaderUrl, import.meta.url);

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

const PRINCIPAL = { id: 'op-1', team: 'trust_safety' };
const SESSION = { id: 'ws-1' };

function enforcementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'enf_1',
    decision_id: 'sdec_1',
    action_type: 'visibility_restriction',
    target_type: 'user',
    target_id: 'user-seller',
    scope: { state: 'limited' },
    executed_at: null,
    reversed_at: null,
    reversed_by: null,
    reversal_reason: null,
    status: 'executed',
    ...overrides,
  };
}

// ── Serving fragments ────────────────────────────────────────────────────

test('serving fragments produce the documented contract', () => {
  assert.equal(reachJoinSql('u', 'l.seller_id'), 'JOIN users u ON u.id = l.seller_id');
  assert.equal(
    reachExcludedSql('u'),
    "AND COALESCE(u.reach_state, 'normal') <> 'suspended'",
  );
  assert.equal(REACH_EXCLUDED_SQL, reachExcludedSql('u'));
  assert.equal(
    reachRankMultiplierExpr('u'),
    "CASE COALESCE(u.reach_state, 'normal') WHEN 'limited' THEN 0.3 WHEN 'suspended' THEN 0.0 ELSE 1.0 END",
  );
  assert.equal(REACH_LIMITED_MULTIPLIER, 0.3);
});

// ── setSellerReach / clearSellerReach / restoreSellerReach ───────────────

test('setSellerReach writes users.reach_state and audits, returning prior', async () => {
  const db = createMockDb((text) => {
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        { reach_state: 'normal', reach_reason: null, reach_set_at: null },
      ]);
    }
    if (/UPDATE users/.test(text)) return empty();
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    if (/INSERT INTO audit_outbox/.test(text)) return empty();
    return empty();
  });

  const prior = await setSellerReach(db as never, {
    userId: 'user-seller',
    state: 'limited',
    reason: 'scam report',
    actor: { principalType: 'system', principalId: null },
  });

  assert.deepEqual(prior, { state: 'normal', reason: null, setAt: null });
  const update = db.calls.find((c) => /UPDATE users/.test(c.text));
  assert.ok(update);
  assert.equal(update!.params[1], 'limited');
  assert.equal(update!.params[2], 'scam report');
  assert.ok(
    db.calls.some((c) => /INSERT INTO immutable_audit_events/.test(c.text)),
    'immutable audit event written',
  );
});

test('clearSellerReach restores normal and nulls reason/timestamp', async () => {
  const db = createMockDb((text) => {
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        {
          reach_state: 'limited',
          reach_reason: 'scam report',
          reach_set_at: '2026-01-01T00:00:00Z',
        },
      ]);
    }
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  const prior = await clearSellerReach(db as never, {
    userId: 'user-seller',
    actor: { principalType: 'workforce', principalId: 'op-1' },
  });

  assert.equal(prior.state, 'limited');
  const update = db.calls.find(
    (c) => /UPDATE users/.test(c.text) && /reach_state = 'normal'/.test(c.text),
  );
  assert.ok(update, 'reach_state cleared to normal');
});

test('restoreSellerReach writes back the captured snapshot', async () => {
  const db = createMockDb((text) => {
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  await restoreSellerReach(db as never, {
    userId: 'user-seller',
    prior: { state: 'normal', reason: null, setAt: null },
    reason: 'reversal',
    actor: { principalType: 'workforce', principalId: 'op-1' },
  });

  const update = db.calls.find((c) => /UPDATE users/.test(c.text));
  assert.ok(update);
  assert.equal(update!.params[1], 'normal');
});

// ── executeEnforcement: visibility_restriction effects ──────────────────

test('executeEnforcement on a user target sets reach_state and stores prior', async () => {
  const db = createMockDb((text) => {
    if (/SELECT \* FROM enforcement_actions/.test(text)) {
      return rows([enforcementRow({ status: 'pending' })]);
    }
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        { reach_state: 'normal', reach_reason: null, reach_set_at: null },
      ]);
    }
    if (/UPDATE enforcement_actions/.test(text)) {
      return rows([enforcementRow({ status: 'executed', executed_at: 'now' })]);
    }
    if (/FROM safety_decisions/.test(text)) return rows([{ case_id: 'sc_1' }]);
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  const result = await executeEnforcement(db as never, 'enf_1', PRINCIPAL as never, SESSION as never);

  assert.equal(result.status, 'executed');
  const userUpdate = db.calls.find((c) => /UPDATE users/.test(c.text));
  assert.ok(userUpdate, 'users.reach_state written');
  assert.equal(userUpdate!.params[1], 'limited');

  const ledgerUpdate = db.calls.find((c) => /UPDATE enforcement_actions/.test(c.text));
  const scope = JSON.parse(ledgerUpdate!.params[1] as string);
  assert.equal(scope.applied.kind, 'user_reach');
  assert.equal(scope.applied.state, 'limited');
  assert.equal(scope.prior.state, 'normal');
});

test('executeEnforcement on a listing target holds it at risk_pending', async () => {
  const db = createMockDb((text) => {
    if (/SELECT \* FROM enforcement_actions/.test(text)) {
      return rows([enforcementRow({ target_type: 'listing', target_id: 'lst-1', status: 'pending' })]);
    }
    if (/SELECT status FROM listings/.test(text)) {
      return rows([{ status: 'active' }]);
    }
    if (/UPDATE listings/.test(text)) return empty();
    if (/UPDATE enforcement_actions/.test(text)) {
      return rows([
        enforcementRow({ target_type: 'listing', target_id: 'lst-1', status: 'executed' }),
      ]);
    }
    if (/FROM safety_decisions/.test(text)) return rows([{ case_id: 'sc_1' }]);
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  await executeEnforcement(db as never, 'enf_1', PRINCIPAL as never, SESSION as never);

  const listingUpdate = db.calls.find((c) => /UPDATE listings/.test(c.text));
  assert.ok(listingUpdate, 'listing status written');
  assert.match(listingUpdate!.text, /status = 'risk_pending'/);

  const ledgerUpdate = db.calls.find((c) => /UPDATE enforcement_actions/.test(c.text));
  const scope = JSON.parse(ledgerUpdate!.params[1] as string);
  assert.equal(scope.applied.applied, true);
  assert.equal(scope.prior.listing_status, 'active');
});

test('executeEnforcement never resurrects a terminal listing', async () => {
  const db = createMockDb((text) => {
    if (/SELECT \* FROM enforcement_actions/.test(text)) {
      return rows([enforcementRow({ target_type: 'listing', target_id: 'lst-1', status: 'pending' })]);
    }
    if (/SELECT status FROM listings/.test(text)) return rows([{ status: 'sold' }]);
    if (/UPDATE enforcement_actions/.test(text)) {
      return rows([
        enforcementRow({ target_type: 'listing', target_id: 'lst-1', status: 'executed' }),
      ]);
    }
    if (/FROM safety_decisions/.test(text)) return rows([{ case_id: 'sc_1' }]);
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  await executeEnforcement(db as never, 'enf_1', PRINCIPAL as never, SESSION as never);
  assert.ok(
    !db.calls.some((c) => /UPDATE listings/.test(c.text)),
    'sold listing untouched',
  );
});

// ── reverseEnforcement restores prior state ──────────────────────────────

test('reverseEnforcement restores the stored prior reach snapshot', async () => {
  const db = createMockDb((text) => {
    if (/SELECT \* FROM enforcement_actions/.test(text)) {
      return rows([
        enforcementRow({
          scope: {
            state: 'limited',
            applied: { kind: 'user_reach', state: 'limited' },
            prior: { state: 'normal', reason: null, setAt: null },
          },
        }),
      ]);
    }
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        { reach_state: 'limited', reach_reason: 'x', reach_set_at: '2026-01-01' },
      ]);
    }
    if (/UPDATE enforcement_actions/.test(text)) {
      return rows([enforcementRow({ status: 'reversed' })]);
    }
    if (/FROM safety_decisions/.test(text)) return rows([{ case_id: 'sc_1' }]);
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  const result = await reverseEnforcement(
    db as never,
    'enf_1',
    'false positive',
    PRINCIPAL as never,
    SESSION as never,
  );

  assert.equal(result.status, 'reversed');
  const restore = db.calls.find(
    (c) => /UPDATE users/.test(c.text) && /reach_state = \$2/.test(c.text),
  );
  assert.ok(restore, 'prior reach state restored');
  assert.equal(restore!.params[1], 'normal');

  const ledgerUpdate = db.calls.find((c) => /UPDATE enforcement_actions/.test(c.text));
  const scope = JSON.parse(ledgerUpdate!.params[3] as string);
  assert.equal(scope.reversal.restored, true);
  assert.equal(scope.reversal.to, 'normal');
});

test('reverseEnforcement does not downgrade a later operator escalation', async () => {
  const db = createMockDb((text) => {
    if (/SELECT \* FROM enforcement_actions/.test(text)) {
      return rows([
        enforcementRow({
          scope: {
            state: 'limited',
            applied: { kind: 'user_reach', state: 'limited' },
            prior: { state: 'normal', reason: null, setAt: null },
          },
        }),
      ]);
    }
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      // Operator escalated to suspended after this action executed.
      return rows([
        { reach_state: 'suspended', reach_reason: 'hard ban', reach_set_at: '2026-01-02' },
      ]);
    }
    if (/UPDATE enforcement_actions/.test(text)) {
      return rows([enforcementRow({ status: 'reversed' })]);
    }
    if (/FROM safety_decisions/.test(text)) return rows([{ case_id: 'sc_1' }]);
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  await reverseEnforcement(
    db as never,
    'enf_1',
    'reversal attempt',
    PRINCIPAL as never,
    SESSION as never,
  );

  assert.ok(
    !db.calls.some((c) => /UPDATE users/.test(c.text)),
    'suspended state not clobbered',
  );
  const ledgerUpdate = db.calls.find((c) => /UPDATE enforcement_actions/.test(c.text));
  const scope = JSON.parse(ledgerUpdate!.params[3] as string);
  assert.equal(scope.reversal.restored, false);
  assert.equal(scope.reversal.note, 'state_changed_since_apply');
});

// ── decideAppeal reverts real effects on overturn ────────────────────────

test('decideAppeal overturned restores prior reach, not just the ledger', async () => {
  const db = createMockDb((text, params) => {
    if (/UPDATE safety_appeals/.test(text)) {
      return rows([
        {
          id: 'sap_1',
          decision_id: 'sdec_1',
          appellant_id: 'user-seller',
          grounds: 'not a scam',
          new_evidence_ids: [],
          independent_reviewer_id: 'op-2',
          deadline: '2026-02-01',
          status: 'overturned',
          outcome_reason: 'false positive',
          remedy: null,
          created_at: '2026-01-01',
          decided_at: '2026-01-10',
        },
      ]);
    }
    if (/SELECT case_id FROM safety_decisions/.test(text)) {
      return rows([{ case_id: 'sc_1' }]);
    }
    if (/SELECT \* FROM enforcement_actions/.test(text)) {
      return rows([
        enforcementRow({
          scope: {
            state: 'limited',
            applied: { kind: 'user_reach', state: 'limited' },
            prior: { state: 'normal', reason: null, setAt: null },
          },
        }),
      ]);
    }
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        { reach_state: 'limited', reach_reason: 'x', reach_set_at: '2026-01-05' },
      ]);
    }
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  const appeal = await decideAppeal(db as never, 'sap_1', {
    independent_reviewer_id: 'op-2',
    status: 'overturned',
    outcome_reason: 'false positive',
    principal: PRINCIPAL as never,
    session: SESSION as never,
  });

  assert.equal(appeal.status, 'overturned');
  const restore = db.calls.find(
    (c) => /UPDATE users/.test(c.text) && /reach_state = \$2/.test(c.text),
  );
  assert.ok(restore, 'appeal reversal restored prior reach state');
  assert.equal(restore!.params[1], 'normal');
  assert.ok(
    db.calls.some(
      (c) => /UPDATE enforcement_actions/.test(c.text) && /'reversed'/.test(c.text),
    ),
    'enforcement ledger flipped to reversed',
  );
  assert.ok(
    db.calls.some(
      (c) => /UPDATE safety_cases/.test(c.text) && /'reopened'/.test(c.text),
    ),
    'case reopened',
  );
});

// ── recordDecision auto-limit (operator path) ────────────────────────────

test('recordDecision restrict on severity>=3 auto-executes a reach limit', async () => {
  const db = createMockDb((text) => {
    if (/INSERT INTO safety_decisions/.test(text)) {
      return rows([
        {
          id: 'sdec_1',
          case_id: 'sc_1',
          decision: 'restrict',
          policy_rule_id: 'r1',
          policy_version_id: 'policy_v1_uk',
          evidence_ids: [],
          territorial_scope: [],
          duration_kind: 'temporary',
          duration_until: null,
          user_reason_code: 'scam',
          internal_reason: 'scam confirmed',
          automated_means: false,
          model_id: null,
          model_version: null,
          model_confidence: null,
          human_reviewer_id: 'op-1',
          decided_at: '2026-01-10',
        },
      ]);
    }
    if (/FROM safety_cases sc/.test(text) && /safety_notices sn/.test(text)) {
      return rows([{ severity: 3, subject_type: 'listing', subject_id: 'lst-1' }]);
    }
    if (/SELECT seller_id FROM listings/.test(text)) {
      return rows([{ seller_id: 'user-seller' }]);
    }
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        { reach_state: 'normal', reach_reason: null, reach_set_at: null },
      ]);
    }
    if (/INSERT INTO enforcement_actions/.test(text)) return empty();
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  await recordDecision(db as never, 'sc_1', {
    decision: 'restrict',
    policy_rule_id: 'r1',
    policy_version_id: 'policy_v1_uk',
    evidence_ids: [],
    duration_kind: 'temporary',
    user_reason_code: 'scam',
    internal_reason: 'scam confirmed',
    principal: PRINCIPAL as never,
    session: SESSION as never,
  });

  const enfInsert = db.calls.find((c) => /INSERT INTO enforcement_actions/.test(c.text));
  assert.ok(enfInsert, 'auto enforcement action created');
  assert.match(enfInsert!.text, /'visibility_restriction', 'user'/);
  assert.equal(enfInsert!.params[2], 'user-seller');

  const userUpdate = db.calls.find((c) => /UPDATE users/.test(c.text));
  assert.ok(userUpdate, 'reach limited immediately');
  assert.equal(userUpdate!.params[1], 'limited');

  const autoAudit = db.calls.find(
    (c) => /safety_audit_events/.test(c.text) && /auto_executed/.test(c.text),
  );
  assert.ok(autoAudit, 'auto-execution audited on the case');
});

test('recordDecision restrict on severity<3 does not auto-limit', async () => {
  const db = createMockDb((text) => {
    if (/INSERT INTO safety_decisions/.test(text)) {
      return rows([
        {
          id: 'sdec_1',
          case_id: 'sc_1',
          decision: 'restrict',
          policy_rule_id: 'r1',
          policy_version_id: 'policy_v1_uk',
          evidence_ids: [],
          territorial_scope: [],
          duration_kind: 'temporary',
          duration_until: null,
          user_reason_code: 'spam',
          internal_reason: 'spam',
          automated_means: false,
          model_id: null,
          model_version: null,
          model_confidence: null,
          human_reviewer_id: 'op-1',
          decided_at: '2026-01-10',
        },
      ]);
    }
    if (/FROM safety_cases sc/.test(text) && /safety_notices sn/.test(text)) {
      return rows([{ severity: 1, subject_type: 'listing', subject_id: 'lst-1' }]);
    }
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  await recordDecision(db as never, 'sc_1', {
    decision: 'restrict',
    policy_rule_id: 'r1',
    policy_version_id: 'policy_v1_uk',
    evidence_ids: [],
    duration_kind: 'temporary',
    user_reason_code: 'spam',
    internal_reason: 'spam',
    principal: PRINCIPAL as never,
    session: SESSION as never,
  });

  assert.ok(
    !db.calls.some((c) => /INSERT INTO enforcement_actions/.test(c.text)),
    'no auto enforcement below threshold',
  );
  assert.ok(!db.calls.some((c) => /UPDATE users/.test(c.text)), 'reach untouched');
});

// ── recordConsumerReport auto-limit (live intake path) ──────────────────

function noticeRow(params: unknown[]) {
  return rows([
    {
      id: params[0],
      idempotency_key: params[1],
      reporter_id: params[2],
      subject_type: params[3],
      subject_id: params[4],
      subject_snapshot:
        typeof params[5] === 'string' ? JSON.parse(params[5] as string) : params[5],
      basis: params[6],
      reason_code: params[7],
      jurisdiction: params[8],
      urgency: params[9],
      allegation: params[10],
      reporter_status: params[11],
      acknowledgement_state: 'pending',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ]);
}

test('recordConsumerReport severity>=3 limits the seller and returns the chain', async () => {
  const db = createMockDb((text, params) => {
    if (/INSERT INTO listing_reports/.test(text)) return rows([{ id: params[0] }]);
    if (/INSERT INTO safety_notices/.test(text)) return noticeRow(params);
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ severity_class: 3, uk_priority_offence: 'fraud' }]);
    }
    if (/SELECT seller_id FROM listings/.test(text)) {
      return rows([{ seller_id: 'user-seller' }]);
    }
    if (/FROM policy_versions/.test(text)) return rows([{ id: 'policy_v1_uk' }]);
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        { reach_state: 'normal', reach_reason: null, reach_set_at: null },
      ]);
    }
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  const result = await recordConsumerReport(db as never, {
    kind: 'listing',
    reportId: 'rep-1',
    reporterId: 'user-reporter',
    subjectId: 'lst-1',
    reason: 'scam',
  });

  assert.ok(result.autoEnforcement, 'autoEnforcement returned');
  assert.equal(result.autoEnforcement!.applied, true);
  assert.ok(result.autoEnforcement!.actionId);

  assert.ok(
    db.calls.some((c) => /INSERT INTO safety_cases/.test(c.text)),
    'automated case opened for operator review',
  );
  const decision = db.calls.find((c) => /INSERT INTO safety_decisions/.test(c.text));
  assert.ok(decision);
  assert.match(decision!.text, /'restrict'/);
  assert.equal(decision!.params[2], 'auto.reach_limit.severity_gte_3');

  const userUpdate = db.calls.find((c) => /UPDATE users/.test(c.text));
  assert.ok(userUpdate, 'seller reach limited');
  assert.equal(userUpdate!.params[1], 'limited');
});

test('recordConsumerReport below severity 3 files a notice only', async () => {
  const db = createMockDb((text, params) => {
    if (/INSERT INTO listing_reports/.test(text)) return rows([{ id: params[0] }]);
    if (/INSERT INTO safety_notices/.test(text)) return noticeRow(params);
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ severity_class: 1, uk_priority_offence: null }]);
    }
    return empty();
  });

  const result = await recordConsumerReport(db as never, {
    kind: 'listing',
    reportId: 'rep-2',
    reporterId: 'user-reporter',
    subjectId: 'lst-1',
    reason: 'spam',
  });

  assert.equal(result.autoEnforcement, null);
  assert.ok(!db.calls.some((c) => /INSERT INTO safety_cases/.test(c.text)));
  assert.ok(!db.calls.some((c) => /UPDATE users/.test(c.text)));
});

test('recordConsumerReport never downgrades a suspended seller to limited', async () => {
  const db = createMockDb((text, params) => {
    if (/INSERT INTO listing_reports/.test(text)) return rows([{ id: params[0] }]);
    if (/INSERT INTO safety_notices/.test(text)) return noticeRow(params);
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ severity_class: 4, uk_priority_offence: 'child_sexual_abuse' }]);
    }
    if (/SELECT seller_id FROM listings/.test(text)) {
      return rows([{ seller_id: 'user-seller' }]);
    }
    if (/FROM policy_versions/.test(text)) return rows([{ id: 'policy_v1_uk' }]);
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        { reach_state: 'suspended', reach_reason: 'hard ban', reach_set_at: '2026-01-01' },
      ]);
    }
    return empty();
  });

  const result = await recordConsumerReport(db as never, {
    kind: 'listing',
    reportId: 'rep-3',
    reporterId: 'user-reporter',
    subjectId: 'lst-1',
    reason: 'minor_safety',
  });

  assert.equal(result.autoEnforcement!.applied, false);
  assert.equal(result.autoEnforcement!.skipReason, 'reach_state_suspended');
  assert.ok(
    !db.calls.some((c) => /UPDATE users/.test(c.text)),
    'suspended state untouched',
  );
});

// ── live-lot eligibility: risk_pending excluded ──────────────────────────

test('scheduling a lot on a risk_pending listing is rejected', async () => {
  const handlers = new Map<string, (req: unknown, reply: unknown) => unknown>();
  // Fastify registers handlers as either (path, handler) or
  // (path, opts, handler) — capture whichever argument is the function.
  // Keyed by method+path: GET and POST share '/sessions/:sessionId/lots'.
  const capture = (method: string) => (p: string, ...rest: unknown[]) => {
    handlers.set(
      `${method} ${p}`,
      rest[rest.length - 1] as (req: unknown, reply: unknown) => unknown,
    );
  };
  const app = {
    post: capture('POST'),
    get: capture('GET'),
    put: capture('PUT'),
    patch: capture('PATCH'),
    delete: capture('DELETE'),
  };

  const db = createMockDb((text) => {
    if (/FROM live_shopping_sessions/.test(text)) {
      return rows([
        { id: 'sess-1', title: 'Live', host_user_id: 'host-1', status: 'live' },
      ]);
    }
    if (/FROM listings/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([
        {
          id: 'lst-1',
          seller_id: 'host-1',
          title: 't',
          description: 'd',
          condition: null,
          category: null,
          brand: null,
          size: null,
          price_gbp: '10',
          image_url: null,
          status: 'risk_pending',
        },
      ]);
    }
    return empty();
  });

  registerLiveLotEngineRoutes({
    app: app as never,
    db: db as never,
    resolveAuthenticatedUserId: () => 'host-1',
    createApiError: ((code: string, message: string) =>
      Object.assign(new Error(message), { code })) as never,
    calculateCommercePlatformChargeGbp: () => 0,
  });

  const handler = handlers.get('POST /streaming/sessions/:sessionId/lots');
  assert.ok(handler, 'schedule route registered');
  const reply = { code(c: number) { this._c = c; return this; }, _c: 200 };
  const result = await handler!(
    {
      params: { sessionId: 'sess-1' },
      body: { listingId: 'lst-1', lotNumber: 1 },
      authUser: { userId: 'host-1' },
      log: { warn() {}, error() {} },
    },
    reply as never,
  );

  assert.equal((reply as { _c: number })._c, 409);
  assert.equal((result as { code: string }).code, 'LISTING_NOT_ELIGIBLE');
  assert.ok(
    !db.calls.some((c) => /INSERT INTO live_lots/.test(c.text)),
    'no lot scheduled on a held listing',
  );
});
