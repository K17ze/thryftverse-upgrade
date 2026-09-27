import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COST_TELEMETRY_DOMAINS,
  COST_TELEMETRY_WINDOWS,
  getDomainCostTelemetry,
} from '../lib/costTelemetry.js';

// Contract for audit item R107: the unified per-domain cost telemetry read
// model must only aggregate ledgers that actually exist, every query must be
// time-window bounded, and the ops route must exist behind the workforce
// permission guard. Runs without a DB — the db client is faked and the
// ledger-existence check parses the migration chain.

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(SRC_DIR, 'db', 'migrations');

function migrationTables(): Set<string> {
  const tables = new Set<string>();
  for (const file of readdirSync(MIGRATIONS_DIR)) {
    if (!file.endsWith('.sql') || file.endsWith('_down.sql')) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
      tables.add(m[1]);
    }
  }
  return tables;
}

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

/** Fake DbQueryable: records queries, returns canned aggregate rows. */
function fakeDb(canned: (sql: string) => Record<string, string>): {
  db: {
    query<R>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
  };
  queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  return {
    queries,
    db: {
      query: async <R>(sql: string, params?: unknown[]) => {
        queries.push({ sql, params: params ?? [] });
        return { rows: [canned(sql)] as unknown as R[] };
      },
    },
  };
}

const CANNED: Array<{ match: RegExp; row: Record<string, string> }> = [
  { match: /FROM ai_usage_events/, row: { calls: '7', units: '4200', cost_microusd: '2500000' } },
  { match: /FROM support_agent_runs/, row: { calls: '3', units: '900', cost_microusd: '500000' } },
  { match: /FROM agent_runs/, row: { calls: '11', units: '1500', cost_microusd: '0' } },
  { match: /FROM fraud_scoring_ledger/, row: { calls: '42' } },
  { match: /FROM moderation_results/, row: { calls: '9' } },
  { match: /FROM promotion_charges/, row: { calls: '2', spend_minor: '7500' } },
  { match: /FROM promotion_impressions/, row: { units: '130' } },
  { match: /FROM recommendation_serves/, row: { calls: '200', units: '4800' } },
  { match: /catalog_import_extraction_runs/, row: { calls: '6', units: '55' } },
  { match: /media_enhancement_jobs/, row: { calls: '4', units: '9' } },
  { match: /FROM media_embeddings/, row: { calls: '17' } },
  { match: /FROM visual_search_requests/, row: { calls: '5' } },
];

function cannedRow(sql: string): Record<string, string> {
  const hit = CANNED.find((c) => c.match.test(sql));
  assert.ok(hit, `no canned row for query: ${sql.slice(0, 120)}`);
  return { calls: '0', units: '0', cost_microusd: '0', ...hit.row };
}

describe('cost telemetry domain registry', () => {
  it('every declared domain ledger exists as a table in the migration chain', () => {
    const tables = migrationTables();
    for (const spec of COST_TELEMETRY_DOMAINS) {
      assert.ok(spec.ledgers.length > 0, `${spec.domain} declares no ledger`);
      for (const ledger of spec.ledgers) {
        assert.ok(
          tables.has(ledger),
          `${spec.domain} declares ledger '${ledger}' but no migration creates it`,
        );
      }
    }
  });

  it('covers the audit-listed domains', () => {
    const domains = new Set(COST_TELEMETRY_DOMAINS.map((d) => d.domain));
    for (const domain of [
      'recommendations',
      'visual_search',
      'support_agent',
      'catalog_extraction',
      'fraud_scoring',
      'promotions',
      'chat_agents',
    ]) {
      assert.ok(domains.has(domain), `missing telemetry domain: ${domain}`);
    }
  });
});

describe('getDomainCostTelemetry', () => {
  it('emits one bounded aggregate row per discovered domain', async () => {
    const now = new Date('2026-09-19T12:00:00.000Z');
    const { db, queries } = fakeDb(cannedRow);

    const report = await getDomainCostTelemetry(db, { now });

    assert.equal(report.domains.length, COST_TELEMETRY_DOMAINS.length);
    assert.equal(report.window.name, '1d');
    assert.equal(report.window.start, '2026-09-18T12:00:00.000Z');
    assert.equal(report.window.end, now.toISOString());

    // Every issued statement is time-window bounded with the same $1 bound.
    for (const q of queries) {
      assert.match(q.sql, />= \$1/, `unbounded query: ${q.sql.slice(0, 120)}`);
      assert.deepEqual(q.params, [new Date(now.getTime() - 24 * 60 * 60 * 1000)]);
    }
  });

  it('converts micro-USD ledgers to costUsd and keeps GBP spend native', async () => {
    const { db } = fakeDb(cannedRow);
    const report = await getDomainCostTelemetry(db, {
      window: '7d',
      now: new Date('2026-09-19T12:00:00.000Z'),
    });
    const byDomain = new Map(report.domains.map((d) => [d.domain, d]));

    const chatAgents = byDomain.get('chat_agents')!;
    assert.equal(chatAgents.calls, 7);
    assert.equal(chatAgents.units, 4200);
    assert.equal(chatAgents.unitKind, 'tokens');
    assert.equal(chatAgents.costUsd, 2.5);
    // Micro-USD is reported under costMicrosUsd — micros are NOT minor
    // units, so costMinor stays null for USD ledgers (audit costMinor fix).
    assert.equal(chatAgents.costMicrosUsd, 2_500_000);
    assert.equal(chatAgents.costMinor, null);
    assert.equal(chatAgents.costCurrency, 'USD');

    const support = byDomain.get('support_agent')!;
    assert.equal(support.costUsd, 0.5);
    assert.equal(support.costMicrosUsd, 500_000);
    assert.equal(support.costMinor, null);

    const promotions = byDomain.get('promotions')!;
    assert.equal(promotions.calls, 2);
    assert.equal(promotions.units, 130);
    assert.equal(promotions.costUsd, null); // no FX source — never fabricated
    assert.equal(promotions.costMicrosUsd, null);
    assert.equal(promotions.costMinor, 7500); // true minor units: GBP pence
    assert.equal(promotions.costCurrency, 'GBP');

    const fraud = byDomain.get('fraud_scoring')!;
    assert.equal(fraud.calls, 42);
    assert.equal(fraud.costUsd, null);
    assert.equal(fraud.costCurrency, null);

    assert.equal(report.window.name, '7d');
  });

  it('accepts only the documented window values', () => {
    assert.deepEqual([...COST_TELEMETRY_WINDOWS], ['1d', '7d', '30d']);
  });
});

describe('ops route contract', () => {
  it('registers GET /ops/v1/cost-telemetry behind the ledger.read guard', () => {
    const routeSrc = readFileSync(path.join(SRC_DIR, 'routes', 'opsConsole.ts'), 'utf8');
    assert.match(
      routeSrc,
      /app\.get\('\/ops\/v1\/cost-telemetry'[\s\S]*?requireOpsPermission\(request, reply, 'ledger\.read'\)/,
    );
  });
});
