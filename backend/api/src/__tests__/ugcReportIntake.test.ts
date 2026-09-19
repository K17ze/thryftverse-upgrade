// UGC / live-chat report intake — the store-compliance report surfaces added
// for Apple 1.2 (all UGC must be reportable).
//
// Coverage:
//   - kind 'live_chat' persists to live_chat_reports and files a safety
//     notice with subject_type 'message' (the CHECK-constrained vocabulary —
//     'live_chat' is not an allowed notice subject type)
//   - severity>=3 live-chat reports auto-limit the *message author*, resolved
//     through live_shopping_chat_messages
//   - kind 'ugc' persists to ugc_reports with the concrete surface in
//     subject_type; media surfaces (look/poster) file the notice as 'media',
//     text surfaces (comments, listing Q&A) file as 'message'
//   - UGC auto-limit targets the content author from the report snapshot
//   - idempotent replays resolve the original report row
//   - the chat report reason aliases still map (scam_fraud → scam, …)
//
// Uses node:test with a matcher-driven fake pg pool — the same convention as
// sellerReachEnforcement.test.ts / reportSafetyBridge tests.

import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResult, QueryResultRow } from 'pg';

import {
  mapConsumerReportReasonToSafetyCode,
  recordConsumerReport,
} from '../lib/safetyCaseService.js';

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

// ── Reason aliases (shared with the chat report enum) ────────────────────

test('chat report reason aliases map onto the seeded safety taxonomy', () => {
  assert.equal(mapConsumerReportReasonToSafetyCode('scam_fraud'), 'scam');
  assert.equal(mapConsumerReportReasonToSafetyCode('inappropriate_content'), 'inappropriate');
  assert.equal(mapConsumerReportReasonToSafetyCode('off_platform_payment'), 'off_platform');
  assert.equal(mapConsumerReportReasonToSafetyCode('harassment'), 'harassment');
  assert.equal(mapConsumerReportReasonToSafetyCode('anything_unmapped'), 'other');
});

// ── live_chat intake ─────────────────────────────────────────────────────

test('live_chat report persists the row and files the notice as a message', async () => {
  const db = createMockDb((text, params) => {
    if (/INSERT INTO live_chat_reports/.test(text)) return rows([{ id: params[0] }]);
    if (/INSERT INTO safety_notices/.test(text)) return noticeRow(params);
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ severity_class: 1, uk_priority_offence: null }]);
    }
    return empty();
  });

  const result = await recordConsumerReport(db as never, {
    kind: 'live_chat',
    reportId: 'lc-rep-1',
    reporterId: 'user-reporter',
    subjectId: 'lcm-1',
    reason: 'harassment',
    details: 'abusive message',
    idempotencyKey: 'rpt_live_sess-1_lcm-1',
    subjectSnapshot: { sessionId: 'sess-1', authorUserId: 'user-author' },
  });

  assert.equal(result.reportId, 'lc-rep-1');
  assert.equal(result.duplicated, false);

  const insert = db.calls.find((c) => /INSERT INTO live_chat_reports/.test(c.text));
  assert.ok(insert, 'report row persisted');
  assert.equal(insert!.params[1], 'sess-1', 'session id from snapshot');
  assert.equal(insert!.params[2], 'lcm-1', 'message id');
  assert.equal(insert!.params[3], 'user-author', 'author id from snapshot');

  const notice = db.calls.find((c) => /INSERT INTO safety_notices/.test(c.text));
  assert.ok(notice, 'safety notice filed');
  assert.equal(notice!.params[3], 'message', 'notice subject_type is an allowed value');
  const snapshot = JSON.parse(notice!.params[5] as string);
  assert.equal(snapshot.sessionId, 'sess-1', 'live-chat context preserved in snapshot');
});

test('severity>=3 live-chat report auto-limits the message author', async () => {
  const db = createMockDb((text, params) => {
    if (/INSERT INTO live_chat_reports/.test(text)) return rows([{ id: params[0] }]);
    if (/INSERT INTO safety_notices/.test(text)) return noticeRow(params);
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ severity_class: 3, uk_priority_offence: null }]);
    }
    if (/FROM live_shopping_chat_messages/.test(text)) {
      return rows([{ user_id: 'user-author' }]);
    }
    if (/FROM policy_versions/.test(text)) return rows([{ id: 'policy_v1' }]);
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([{ reach_state: 'normal', reach_reason: null, reach_set_at: null }]);
    }
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  const result = await recordConsumerReport(db as never, {
    kind: 'live_chat',
    reportId: 'lc-rep-2',
    reporterId: 'user-reporter',
    subjectId: 'lcm-2',
    reason: 'scam',
    subjectSnapshot: { sessionId: 'sess-1', authorUserId: 'user-author' },
  });

  assert.ok(result.autoEnforcement, 'autoEnforcement chain returned');
  assert.equal(result.autoEnforcement!.applied, true);

  const userUpdate = db.calls.find((c) => /UPDATE users/.test(c.text));
  assert.ok(userUpdate, 'author reach limited');
  assert.equal(userUpdate!.params[0], 'user-author', 'enforcement targets the author');
  assert.equal(userUpdate!.params[1], 'limited');
});

test('live-chat idempotent replay resolves the original report row', async () => {
  const db = createMockDb((text, params) => {
    if (/INSERT INTO live_chat_reports/.test(text)) return empty(); // conflict
    if (/FROM live_chat_reports WHERE idempotency_key/.test(text)) {
      return rows([{ id: 'lc-rep-original' }]);
    }
    if (/INSERT INTO safety_notices/.test(text)) return noticeRow(params);
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ severity_class: 1, uk_priority_offence: null }]);
    }
    return empty();
  });

  const result = await recordConsumerReport(db as never, {
    kind: 'live_chat',
    reportId: 'lc-rep-retry',
    reporterId: 'user-reporter',
    subjectId: 'lcm-1',
    reason: 'spam',
    idempotencyKey: 'rpt_live_sess-1_lcm-1',
    subjectSnapshot: { sessionId: 'sess-1', authorUserId: 'user-author' },
  });

  assert.equal(result.duplicated, true);
  assert.equal(result.reportId, 'lc-rep-original');
  assert.equal(result.autoEnforcement, null, 'replays never re-run enforcement');
});

// ── ugc intake ───────────────────────────────────────────────────────────

test('ugc report persists the polymorphic row and maps media surfaces to notice media', async () => {
  const db = createMockDb((text, params) => {
    if (/INSERT INTO ugc_reports/.test(text)) return rows([{ id: params[0] }]);
    if (/INSERT INTO safety_notices/.test(text)) return noticeRow(params);
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ severity_class: 1, uk_priority_offence: null }]);
    }
    return empty();
  });

  const result = await recordConsumerReport(db as never, {
    kind: 'ugc',
    reportId: 'ugcrpt-1',
    reporterId: 'user-reporter',
    subjectId: 'look-1',
    reason: 'inappropriate',
    idempotencyKey: 'ugcrpt_look_look-1',
    subjectSnapshot: {
      subjectType: 'look',
      authorUserId: 'user-creator',
      parentContextId: null,
    },
  });

  const insert = db.calls.find((c) => /INSERT INTO ugc_reports/.test(c.text));
  assert.ok(insert);
  assert.equal(insert!.params[1], 'look', 'concrete surface persisted');
  assert.equal(insert!.params[2], 'look-1');
  assert.equal(insert!.params[3], 'user-creator');

  const notice = db.calls.find((c) => /INSERT INTO safety_notices/.test(c.text));
  assert.equal(notice!.params[3], 'media', 'look reports file as media');
  assert.equal(result.reportId, 'ugcrpt-1');
});

test('ugc text surfaces file the notice as a message', async () => {
  for (const subjectType of ['look_comment', 'moodboard_comment', 'listing_qa']) {
    const db = createMockDb((text, params) => {
      if (/INSERT INTO ugc_reports/.test(text)) return rows([{ id: params[0] }]);
      if (/INSERT INTO safety_notices/.test(text)) return noticeRow(params);
      if (/FROM safety_reason_codes/.test(text)) {
        return rows([{ severity_class: 1, uk_priority_offence: null }]);
      }
      return empty();
    });

    await recordConsumerReport(db as never, {
      kind: 'ugc',
      reportId: `ugcrpt-${subjectType}`,
      reporterId: 'user-reporter',
      subjectId: 'subj-1',
      reason: 'spam',
      subjectSnapshot: { subjectType, authorUserId: 'user-author' },
    });

    const notice = db.calls.find((c) => /INSERT INTO safety_notices/.test(c.text));
    assert.equal(
      notice!.params[3],
      'message',
      `${subjectType} should file the notice as a message`,
    );
  }
});

test('severity>=3 ugc report auto-limits the content author', async () => {
  const db = createMockDb((text, params) => {
    if (/INSERT INTO ugc_reports/.test(text)) return rows([{ id: params[0] }]);
    if (/INSERT INTO safety_notices/.test(text)) return noticeRow(params);
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ severity_class: 4, uk_priority_offence: 'child_sexual_abuse' }]);
    }
    if (/FROM policy_versions/.test(text)) return rows([{ id: 'policy_v1' }]);
    if (/FROM users/.test(text) && /FOR UPDATE/.test(text)) {
      return rows([{ reach_state: 'normal', reach_reason: null, reach_set_at: null }]);
    }
    if (/INSERT INTO immutable_audit_events/.test(text)) {
      return rows([{ id: 'a1', sequence_number: '1', event_hash: 'h' }]);
    }
    return empty();
  });

  const result = await recordConsumerReport(db as never, {
    kind: 'ugc',
    reportId: 'ugcrpt-2',
    reporterId: 'user-reporter',
    subjectId: 'lc-9',
    reason: 'minor_safety',
    subjectSnapshot: { subjectType: 'look_comment', authorUserId: 'user-commenter' },
  });

  assert.ok(result.autoEnforcement);
  assert.equal(result.autoEnforcement!.applied, true);

  const userUpdate = db.calls.find((c) => /UPDATE users/.test(c.text));
  assert.equal(userUpdate!.params[0], 'user-commenter', 'author reach limited, not the reporter');
});

test('ugc idempotent replay resolves the original report row', async () => {
  const db = createMockDb((text, params) => {
    if (/INSERT INTO ugc_reports/.test(text)) return empty(); // conflict
    if (/FROM ugc_reports WHERE idempotency_key/.test(text)) {
      return rows([{ id: 'ugcrpt-original' }]);
    }
    if (/INSERT INTO safety_notices/.test(text)) return noticeRow(params);
    if (/FROM safety_reason_codes/.test(text)) {
      return rows([{ severity_class: 1, uk_priority_offence: null }]);
    }
    return empty();
  });

  const result = await recordConsumerReport(db as never, {
    kind: 'ugc',
    reportId: 'ugcrpt-retry',
    reporterId: 'user-reporter',
    subjectId: 'look-1',
    reason: 'spam',
    idempotencyKey: 'ugcrpt_look_look-1',
    subjectSnapshot: { subjectType: 'look', authorUserId: 'user-creator' },
  });

  assert.equal(result.duplicated, true);
  assert.equal(result.reportId, 'ugcrpt-original');
  assert.equal(result.autoEnforcement, null);
});
