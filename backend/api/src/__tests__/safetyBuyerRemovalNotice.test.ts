// Buyer removal notices (R87 — DSA illegal-item buyer notice).
//
// When a safety/moderation outcome removes or quarantines a listing for an
// illegal/prohibited-item reason, buyers holding a non-terminal order on
// it are owed the same closure the reporter gets. Coverage:
//   - recordDecision restrict on a listing-subject case with an illegal
//     reason code queries orders and emits one 'safety_outcome'
//     notification per affected buyer, deduped per (case, order)
//   - non-restrictive decisions and non-illegal reason codes never query
//     orders and never notify buyers
//   - executeEnforcement applying a listing hold (risk_pending) notifies
//     buyers when the decision's reason code is illegal content
//   - a hold that did not apply (already held) notifies nobody
//
// Uses node:test with a matcher-driven fake pg pool
// (sellerReachEnforcement.test.ts convention) and a module-loader stub for
// workerRuntime's queueUserNotification — the notification path runs
// post-commit, so emitted notifications land on a global sink the tests
// poll.

import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import type { QueryResult, QueryResultRow } from 'pg';

// Stub the notification queue before the dynamic import so emitted
// notifications are captured instead of hitting the real pipeline
// (workerRuntime's queueUserNotification uses the module-level pool).
const loaderSource = [
  'export async function load(url, context, nextLoad) {',
  "  if (url.includes('/lib/workerRuntime')) {",
  '    return {',
  '      format: "module",',
  "      source: 'globalThis.__noticeSink = globalThis.__noticeSink ?? []; export async function queueUserNotification(input) { globalThis.__noticeSink.push(input); return \"notif_test\"; }',",
  '      shortCircuit: true,',
  '    };',
  '  }',
  '  return nextLoad(url, context);',
  '}',
].join('\n');
const loaderUrl =
  'data:text/javascript;base64,' + Buffer.from(loaderSource).toString('base64');
register(loaderUrl, import.meta.url);

const { executeEnforcement, recordDecision } = await import(
  '../lib/safetyCaseService.js'
);

type QueuedNotice = {
  userId: string;
  title: string;
  body: string;
  eventType?: string;
  idempotencyKey?: string;
  route?: Record<string, unknown>;
};

function noticeSink(): QueuedNotice[] {
  const g = globalThis as { __noticeSink?: QueuedNotice[] };
  g.__noticeSink = g.__noticeSink ?? [];
  return g.__noticeSink;
}

function buyerNotices(): QueuedNotice[] {
  return noticeSink().filter((n) =>
    n.idempotencyKey?.startsWith('safety_buyer_removal:'),
  );
}

// The outcome notifications are fire-and-forget after COMMIT — poll the
// sink/calls until they settle instead of racing the microtask chain.
async function eventually(predicate: () => boolean, tries = 100) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.ok(predicate(), 'expected condition not met in time');
}

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

function decisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sdec_1',
    case_id: 'sc_1',
    decision: 'restrict',
    policy_rule_id: 'r1',
    policy_version_id: 'policy_v1_uk',
    evidence_ids: [],
    territorial_scope: [],
    duration_kind: 'permanent',
    duration_until: null,
    user_reason_code: 'prohibited',
    internal_reason: 'prohibited item confirmed',
    automated_means: false,
    model_id: null,
    model_version: null,
    model_confidence: null,
    human_reviewer_id: 'op-1',
    decided_at: '2026-01-10',
    ...overrides,
  };
}

function enforcementRow(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

// Shared matcher pieces for the safety-case transaction plumbing.
function auditMatchers(text: string) {
  if (/INSERT INTO safety_audit_events/.test(text)) return empty();
  if (/INSERT INTO immutable_audit_events/.test(text)) {
    return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
  }
  if (/INSERT INTO audit_outbox/.test(text)) return empty();
  return undefined;
}

function ordersCalls(db: ReturnType<typeof createMockDb>) {
  return db.calls.filter((c) => /FROM orders\b/i.test(c.text));
}

// ── recordDecision → buyer notices ──────────────────────────────────────

test('recordDecision restrict on an illegal listing subject notifies buyers with non-terminal orders', async () => {
  noticeSink().length = 0;
  const db = createMockDb((text, params) => {
    const audit = auditMatchers(text);
    if (audit) return audit;
    if (/INSERT INTO safety_decisions/.test(text)) return rows([decisionRow()]);
    if (/UPDATE safety_cases/.test(text)) return empty();
    // Subject resolution (in-txn auto-limit check + post-commit notice).
    if (/FROM safety_cases sc/.test(text) && /safety_notices sn/.test(text)) {
      // severity 2 → the auto-limit branch is skipped, keeping the case
      // focused on the buyer-notice path.
      return rows([{ severity: 2, subject_type: 'listing', subject_id: 'lst-1' }]);
    }
    // Reporter-notice resolution.
    if (/SELECT notice_id FROM safety_cases/.test(text)) {
      return rows([{ notice_id: 'sn_1' }]);
    }
    if (/FROM safety_notices WHERE id/.test(text)) {
      return rows([{ reporter_id: 'user-reporter' }]);
    }
    // Illegal-content gate + affected buyers.
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ is_illegal_content: true }]);
    }
    if (/FROM orders\b/i.test(text)) {
      assert.equal(params[0], 'lst-1');
      assert.match(text, /status NOT IN/i);
      return rows([
        { id: 'ord-1', buyer_id: 'buyer-1' },
        { id: 'ord-2', buyer_id: 'buyer-2' },
      ]);
    }
    return empty();
  });

  await recordDecision(db as never, 'sc_1', {
    decision: 'restrict',
    policy_rule_id: 'r1',
    policy_version_id: 'policy_v1_uk',
    evidence_ids: [],
    duration_kind: 'permanent',
    user_reason_code: 'prohibited',
    internal_reason: 'prohibited item confirmed',
    human_reviewer_id: 'op-1',
    principal: PRINCIPAL as never,
    session: SESSION as never,
  });

  // The orders query ran exactly once, scoped to the held listing.
  await eventually(() => ordersCalls(db).length === 1 && buyerNotices().length === 2);
  assert.equal(ordersCalls(db).length, 1);
  assert.equal(ordersCalls(db)[0].params[0], 'lst-1');

  const notices = buyerNotices();
  assert.equal(notices.length, 2);
  const byOrder = new Map(notices.map((n) => [n.idempotencyKey, n]));
  const first = byOrder.get('safety_buyer_removal:sc_1:ord-1');
  const second = byOrder.get('safety_buyer_removal:sc_1:ord-2');
  assert.ok(first, 'ord-1 buyer notified with per-order dedupe key');
  assert.ok(second, 'ord-2 buyer notified with per-order dedupe key');
  assert.equal(first!.userId, 'buyer-1');
  assert.equal(second!.userId, 'buyer-2');
  assert.equal(first!.eventType, 'safety_outcome');
  assert.deepEqual(first!.route, {
    screen: 'OrderDetail',
    params: { orderId: 'ord-1' },
  });
  // Factual copy: removed for a policy breach, next steps point at the
  // order/support flow — no refund promise.
  assert.match(first!.body, /removed/i);
  assert.match(first!.body, /support/i);
  assert.doesNotMatch(first!.body, /refunded/i);

  // The reporter notice still fires on the same canonical path.
  assert.ok(
    noticeSink().some(
      (n) => n.userId === 'user-reporter' && n.idempotencyKey === 'safety_outcome:sc_1',
    ),
    'reporter outcome notice preserved',
  );
});

test('recordDecision no_violation never touches orders or buyers', async () => {
  noticeSink().length = 0;
  const db = createMockDb((text) => {
    const audit = auditMatchers(text);
    if (audit) return audit;
    if (/INSERT INTO safety_decisions/.test(text)) {
      return rows([decisionRow({ decision: 'no_violation' })]);
    }
    if (/UPDATE safety_cases/.test(text)) return empty();
    if (/SELECT notice_id FROM safety_cases/.test(text)) {
      return rows([{ notice_id: 'sn_1' }]);
    }
    if (/FROM safety_notices WHERE id/.test(text)) {
      return rows([{ reporter_id: 'user-reporter' }]);
    }
    return empty();
  });

  await recordDecision(db as never, 'sc_1', {
    decision: 'no_violation',
    policy_rule_id: 'r1',
    policy_version_id: 'policy_v1_uk',
    evidence_ids: [],
    duration_kind: 'permanent',
    user_reason_code: 'prohibited',
    internal_reason: 'report unfounded',
    human_reviewer_id: 'op-1',
    principal: PRINCIPAL as never,
    session: SESSION as never,
  });

  // Give the fire-and-forget reporter notice a chance to land, then assert
  // the buyer path never ran.
  await eventually(() => noticeSink().length === 1);
  assert.equal(ordersCalls(db).length, 0);
  assert.equal(buyerNotices().length, 0);
});

test('recordDecision restrict with a non-illegal reason code does not notify buyers', async () => {
  noticeSink().length = 0;
  const db = createMockDb((text) => {
    const audit = auditMatchers(text);
    if (audit) return audit;
    if (/INSERT INTO safety_decisions/.test(text)) {
      return rows([decisionRow({ user_reason_code: 'spam' })]);
    }
    if (/UPDATE safety_cases/.test(text)) return empty();
    if (/FROM safety_cases sc/.test(text) && /safety_notices sn/.test(text)) {
      return rows([{ severity: 2, subject_type: 'listing', subject_id: 'lst-1' }]);
    }
    if (/SELECT notice_id FROM safety_cases/.test(text)) {
      return rows([{ notice_id: 'sn_1' }]);
    }
    if (/FROM safety_notices WHERE id/.test(text)) {
      return rows([{ reporter_id: 'user-reporter' }]);
    }
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ is_illegal_content: false }]);
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
    internal_reason: 'spam listing',
    human_reviewer_id: 'op-1',
    principal: PRINCIPAL as never,
    session: SESSION as never,
  });

  await eventually(() => noticeSink().length === 1);
  assert.equal(ordersCalls(db).length, 0);
  assert.equal(buyerNotices().length, 0);
});

// ── executeEnforcement → buyer notices ──────────────────────────────────

test('executeEnforcement holding a listing notifies buyers when the decision reason is illegal', async () => {
  noticeSink().length = 0;
  const db = createMockDb((text) => {
    const audit = auditMatchers(text);
    if (audit) return audit;
    if (/SELECT \* FROM enforcement_actions/.test(text)) {
      return rows([enforcementRow({ status: 'pending' })]);
    }
    if (/SELECT status FROM listings/.test(text)) {
      return rows([{ status: 'active' }]);
    }
    if (/UPDATE listings/.test(text)) return empty();
    if (/UPDATE live_lots/.test(text)) return empty();
    if (/UPDATE enforcement_actions/.test(text)) {
      return rows([
        enforcementRow({
          status: 'executed',
          executed_at: '2026-01-10',
          scope: {
            applied: { kind: 'listing_visibility', applied: true, to: 'risk_pending' },
            prior: { listing_status: 'active' },
          },
        }),
      ]);
    }
    if (/FROM safety_decisions/.test(text)) {
      return rows([
        { case_id: 'sc_1', user_reason_code: 'prohibited', automated_means: false },
      ]);
    }
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ is_illegal_content: true }]);
    }
    if (/FROM orders\b/i.test(text)) {
      return rows([{ id: 'ord-9', buyer_id: 'buyer-9' }]);
    }
    return empty();
  });

  const result = await executeEnforcement(
    db as never,
    'enf_1',
    PRINCIPAL as never,
    SESSION as never,
  );
  assert.equal(result.status, 'executed');

  await eventually(() => buyerNotices().length === 1);
  const notice = buyerNotices()[0];
  assert.equal(notice.userId, 'buyer-9');
  assert.equal(notice.idempotencyKey, 'safety_buyer_removal:sc_1:ord-9');
  assert.equal(notice.eventType, 'safety_outcome');
  assert.deepEqual(notice.route, {
    screen: 'OrderDetail',
    params: { orderId: 'ord-9' },
  });
});

test('executeEnforcement listing hold under a non-illegal decision notifies nobody', async () => {
  noticeSink().length = 0;
  const db = createMockDb((text) => {
    const audit = auditMatchers(text);
    if (audit) return audit;
    if (/SELECT \* FROM enforcement_actions/.test(text)) {
      return rows([enforcementRow({ status: 'pending' })]);
    }
    if (/SELECT status FROM listings/.test(text)) {
      return rows([{ status: 'active' }]);
    }
    if (/UPDATE listings/.test(text)) return empty();
    if (/UPDATE live_lots/.test(text)) return empty();
    if (/UPDATE enforcement_actions/.test(text)) {
      return rows([
        enforcementRow({
          status: 'executed',
          executed_at: '2026-01-10',
          scope: {
            applied: { kind: 'listing_visibility', applied: true, to: 'risk_pending' },
            prior: { listing_status: 'active' },
          },
        }),
      ]);
    }
    if (/FROM safety_decisions/.test(text)) {
      return rows([
        { case_id: 'sc_1', user_reason_code: 'spam', automated_means: false },
      ]);
    }
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ is_illegal_content: false }]);
    }
    return empty();
  });

  await executeEnforcement(db as never, 'enf_1', PRINCIPAL as never, SESSION as never);

  // Nothing async is expected — settle once, then assert silence.
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(ordersCalls(db).length, 0);
  assert.equal(buyerNotices().length, 0);
});

test('executeEnforcement that does not apply a hold notifies nobody', async () => {
  noticeSink().length = 0;
  const db = createMockDb((text) => {
    const audit = auditMatchers(text);
    if (audit) return audit;
    if (/SELECT \* FROM enforcement_actions/.test(text)) {
      return rows([enforcementRow({ status: 'pending' })]);
    }
    // Already held — scope.applied records applied:false, so no notice.
    if (/SELECT status FROM listings/.test(text)) {
      return rows([{ status: 'risk_pending' }]);
    }
    if (/UPDATE enforcement_actions/.test(text)) {
      return rows([
        enforcementRow({
          status: 'executed',
          executed_at: '2026-01-10',
          scope: {
            applied: {
              kind: 'listing_visibility',
              applied: false,
              note: 'already_held',
            },
            prior: { listing_status: 'risk_pending' },
          },
        }),
      ]);
    }
    if (/FROM safety_decisions/.test(text)) {
      return rows([
        { case_id: 'sc_1', user_reason_code: 'prohibited', automated_means: false },
      ]);
    }
    return empty();
  });

  await executeEnforcement(db as never, 'enf_1', PRINCIPAL as never, SESSION as never);

  await new Promise((r) => setTimeout(r, 50));
  assert.equal(ordersCalls(db).length, 0);
  assert.equal(buyerNotices().length, 0);
});
