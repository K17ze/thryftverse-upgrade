/**
 * Unified per-domain cost telemetry (audit item R107).
 *
 * The platform already records cost/usage evidence in several domain ledgers,
 * but each ledger has a different shape and there was no single read model
 * that lets ops answer "what did each AI/promotion domain cost today?".
 *
 * This module is a read-only aggregation over the existing ledgers — it does
 * NOT create new tables and it never estimates spend that was not recorded.
 * Where a ledger carries no cost column the domain reports `costUsd: null`
 * rather than a fabricated number.
 *
 * Domain → ledger map (discovered, not hardcoded convention):
 *
 *   chat_agents        ai_usage_events                      provider-reported
 *                       (migration 068/170)                 tokens + USD micros
 *   agent_runs         agent_runs                           run executions
 *                       (migration 224)                     (tokens + USD micros)
 *   support_agent      support_agent_runs                   support agent turns
 *                       (migration 151)                     (tokens + USD micros)
 *   fraud_scoring      fraud_scoring_ledger                 rule+shadow scorings
 *                       (migration 148)                     (no cost column)
 *   moderation         moderation_results                   provider moderation
 *                       (migration 173)                     calls (no cost col)
 *   promotions         promotion_charges +                  GBP-minor spend +
 *                       promotion_impressions               served units
 *                       (migration 301)
 *   recommendations    recommendation_serves                serve calls + items
 *                       (migration 077)
 *   catalog_extraction catalog_import_extraction_runs       extraction runs +
 *                       (+ legacy catalog_import_           field candidates
 *                       extractions, migration 146/192)
 *   media_enhancement  media_enhancement_jobs +             provider jobs +
 *                       media_enhancement_operations        operations
 *                       (migration 191)
 *   media_embeddings   media_embeddings                     embedding model runs
 *                       (migration 145)
 *   visual_search      visual_search_requests               visual search calls
 *                       (migration 032)
 *
 * Currency truth: ai_usage_events / agent_runs / support_agent_runs record
 * micro-USD (microusd / cost_micros). promotion_charges records GBP minor
 * units (pence) — there is no FX source in the schema, so the endpoint reports
 * it as `costMinor`/`costCurrency: 'GBP'` and leaves `costUsd` null instead of
 * inventing an exchange rate.
 *
 * Every query is a time-windowed aggregate (created_at >= window start), so
 * the read is bounded regardless of ledger size.
 */

import type { QueryResultRow } from 'pg';
import { z } from 'zod';

// Minimal structural queryable — satisfied by both Pool and PoolClient.
type DbQueryable = {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
};

// ── Window ──────────────────────────────────────────────────────────────
//
// Follows the analytics period convention ('7d'/'30d'/'90d' in
// creatorAnalyticsContracts) with a day-grain default — ops spend review is
// a daily ritual, not a per-minute one.

export const COST_TELEMETRY_WINDOWS = ['1d', '7d', '30d'] as const;
export const CostTelemetryWindowSchema = z.enum(COST_TELEMETRY_WINDOWS);
export type CostTelemetryWindow = z.infer<typeof CostTelemetryWindowSchema>;
export const DEFAULT_COST_TELEMETRY_WINDOW: CostTelemetryWindow = '1d';

const WINDOW_MS: Record<CostTelemetryWindow, number> = {
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// ── Result shape ────────────────────────────────────────────────────────

export type CostTelemetryUnitKind =
  | 'tokens'
  | 'impressions'
  | 'served_items'
  | 'field_candidates'
  | 'operations'
  | 'embeddings'
  | 'events';

export interface DomainCostTelemetry {
  /** Product domain the spend/usage belongs to. */
  domain: string;
  /** Ledger table(s) backing this row — for auditability. */
  ledgers: string[];
  /** Ledger entries (calls/runs/charges) inside the window. */
  calls: number;
  /** Domain usage units inside the window (tokens, impressions, …). */
  units: number;
  unitKind: CostTelemetryUnitKind;
  /** USD spend in the window; null when the ledger records no USD cost. */
  costUsd: number | null;
  /** Native minor-unit spend when the ledger is not USD (e.g. GBP pence). */
  costMinor: number | null;
  /** ISO 4217 currency for costMinor; null when the domain has no spend. */
  costCurrency: 'USD' | 'GBP' | null;
  window: { start: string; end: string };
}

export interface CostTelemetryReport {
  window: { name: CostTelemetryWindow; start: string; end: string };
  generatedAt: string;
  domains: DomainCostTelemetry[];
}

// ── Internals ───────────────────────────────────────────────────────────

interface DomainAggregate {
  calls: number;
  units: number;
  costUsd: number | null;
  costMinor: number | null;
  costCurrency: 'USD' | 'GBP' | null;
}

interface DomainSpec {
  domain: string;
  ledgers: string[];
  unitKind: CostTelemetryUnitKind;
  aggregate(db: DbQueryable, since: Date): Promise<DomainAggregate>;
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function microsToUsd(microusd: number): number {
  return Math.round(microusd) / 1_000_000;
}

interface TokenCostRow {
  calls: string;
  units: string;
  cost_microusd: string;
}

/**
 * Shared aggregate for the token+micro-USD ledgers
 * (ai_usage_events / agent_runs / support_agent_runs — same shape, different
 * cost column name).
 */
function tokenCostSpec(
  domain: string,
  table: string,
  costColumn: string,
): DomainSpec {
  return {
    domain,
    ledgers: [table],
    unitKind: 'tokens',
    async aggregate(db, since) {
      const result = await db.query<TokenCostRow>(
        `SELECT COUNT(*)::text AS calls,
                COALESCE(SUM(total_tokens), 0)::text AS units,
                COALESCE(SUM(${costColumn}), 0)::text AS cost_microusd
         FROM ${table}
         WHERE created_at >= $1`,
        [since],
      );
      const row = result.rows[0];
      return {
        calls: toCount(row?.calls),
        units: toCount(row?.units),
        costUsd: microsToUsd(toCount(row?.cost_microusd)),
        costMinor: toCount(row?.cost_microusd),
        costCurrency: 'USD',
      };
    },
  };
}

/** Shared aggregate for count-only ledgers (no usage units, no cost). */
function eventCountSpec(
  domain: string,
  table: string,
  unitKind: CostTelemetryUnitKind,
  timeColumn = 'created_at',
): DomainSpec {
  return {
    domain,
    ledgers: [table],
    unitKind,
    async aggregate(db, since) {
      const result = await db.query<{ calls: string }>(
        `SELECT COUNT(*)::text AS calls
         FROM ${table}
         WHERE ${timeColumn} >= $1`,
        [since],
      );
      const calls = toCount(result.rows[0]?.calls);
      return { calls, units: calls, costUsd: null, costMinor: null, costCurrency: null };
    },
  };
}

const DOMAIN_SPECS: readonly DomainSpec[] = [
  // Provider-reported usage for AI chat agents — the authoritative AI cost
  // ledger (per the migration 068 table comment).
  tokenCostSpec('chat_agents', 'ai_usage_events', 'estimated_cost_microusd'),

  // Agent run executions (all runtime modes). Token/cost columns are only
  // populated on the synchronous invoke path — reported as recorded, never
  // estimated.
  tokenCostSpec('agent_runs', 'agent_runs', 'estimated_cost_microusd'),

  // Support agent turns — cost_micros is provider micro-USD.
  tokenCostSpec('support_agent', 'support_agent_runs', 'cost_micros'),

  // Fraud scoring calls (rule engine + shadow model). No provider cost
  // column — calls are the spend proxy.
  eventCountSpec('fraud_scoring', 'fraud_scoring_ledger', 'events'),

  // Provider moderation calls.
  eventCountSpec('moderation', 'moderation_results', 'events'),

  // Promotions: billed charge rows (calls) + served impressions/clicks
  // (units) + GBP-minor spend. Only 'charged' rows count toward spend —
  // 'insufficient_balance' rows claimed the day but posted no debit.
  {
    domain: 'promotions',
    ledgers: ['promotion_charges', 'promotion_impressions'],
    unitKind: 'impressions',
    async aggregate(db, since) {
      const [charges, events] = await Promise.all([
        db.query<{ calls: string; spend_minor: string }>(
          `SELECT COUNT(*)::text AS calls,
                  COALESCE(SUM(amount_minor) FILTER (WHERE status = 'charged'), 0)::text AS spend_minor
           FROM promotion_charges
           WHERE created_at >= $1`,
          [since],
        ),
        db.query<{ units: string }>(
          `SELECT COUNT(*)::text AS units
           FROM promotion_impressions
           WHERE created_at >= $1`,
          [since],
        ),
      ]);
      return {
        calls: toCount(charges.rows[0]?.calls),
        units: toCount(events.rows[0]?.units),
        costUsd: null,
        costMinor: toCount(charges.rows[0]?.spend_minor),
        costCurrency: 'GBP',
      };
    },
  },

  // Recommendation serves; units are the items actually returned.
  {
    domain: 'recommendations',
    ledgers: ['recommendation_serves'],
    unitKind: 'served_items',
    async aggregate(db, since) {
      const result = await db.query<{ calls: string; units: string }>(
        `SELECT COUNT(*)::text AS calls,
                COALESCE(SUM(result_count), 0)::text AS units
         FROM recommendation_serves
         WHERE created_at >= $1`,
        [since],
      );
      return {
        calls: toCount(result.rows[0]?.calls),
        units: toCount(result.rows[0]?.units),
        costUsd: null,
        costMinor: null,
        costCurrency: null,
      };
    },
  },

  // Catalog extraction runs (canonical table) plus legacy extraction rows
  // recorded before migration 192 — both are real model invocations. Units
  // are the field candidates the runs produced.
  {
    domain: 'catalog_extraction',
    ledgers: ['catalog_import_extraction_runs', 'catalog_import_extractions'],
    unitKind: 'field_candidates',
    async aggregate(db, since) {
      const result = await db.query<{ calls: string; units: string }>(
        `SELECT
           ((SELECT COUNT(*) FROM catalog_import_extraction_runs WHERE created_at >= $1)
            + (SELECT COUNT(*) FROM catalog_import_extractions WHERE created_at >= $1))::text AS calls,
           (SELECT COUNT(*) FROM catalog_import_field_candidates c
             JOIN catalog_import_extraction_runs r ON r.id = c.run_id
             WHERE r.created_at >= $1)::text AS units`,
        [since],
      );
      return {
        calls: toCount(result.rows[0]?.calls),
        units: toCount(result.rows[0]?.units),
        costUsd: null,
        costMinor: null,
        costCurrency: null,
      };
    },
  },

  // Media enhancement provider jobs; units are the operations executed.
  {
    domain: 'media_enhancement',
    ledgers: ['media_enhancement_jobs', 'media_enhancement_operations'],
    unitKind: 'operations',
    async aggregate(db, since) {
      const result = await db.query<{ calls: string; units: string }>(
        `SELECT
           (SELECT COUNT(*) FROM media_enhancement_jobs WHERE created_at >= $1)::text AS calls,
           (SELECT COUNT(*) FROM media_enhancement_operations o
             JOIN media_enhancement_jobs j ON j.id = o.job_id
             WHERE j.created_at >= $1)::text AS units`,
        [since],
      );
      return {
        calls: toCount(result.rows[0]?.calls),
        units: toCount(result.rows[0]?.units),
        costUsd: null,
        costMinor: null,
        costCurrency: null,
      };
    },
  },

  // Embedding model runs (one row per asset × model × preprocessing).
  eventCountSpec('media_embeddings', 'media_embeddings', 'embeddings', 'generated_at'),

  // Visual search requests — the only search usage ledger that exists;
  // text search has no per-request cost ledger today.
  eventCountSpec('visual_search', 'visual_search_requests', 'events'),
];

// Exported so contract tests can verify every declared ledger actually
// exists as a table in the migration chain.
export const COST_TELEMETRY_DOMAINS: ReadonlyArray<{
  domain: string;
  ledgers: readonly string[];
  unitKind: CostTelemetryUnitKind;
}> = DOMAIN_SPECS.map(({ domain, ledgers, unitKind }) => ({ domain, ledgers, unitKind }));

/**
 * Aggregate per-domain spend/call-count/unit-usage over a trailing window
 * ending at `now` (default: last 24h). Read-only; every query is bounded by
 * the window predicate.
 */
export async function getDomainCostTelemetry(
  db: DbQueryable,
  options?: { window?: CostTelemetryWindow; now?: Date },
): Promise<CostTelemetryReport> {
  const window = options?.window ?? DEFAULT_COST_TELEMETRY_WINDOW;
  const now = options?.now ?? new Date();
  const since = new Date(now.getTime() - WINDOW_MS[window]);

  const domains = await Promise.all(
    DOMAIN_SPECS.map(async (spec): Promise<DomainCostTelemetry> => {
      const aggregate = await spec.aggregate(db, since);
      return {
        domain: spec.domain,
        ledgers: [...spec.ledgers],
        calls: aggregate.calls,
        units: aggregate.units,
        unitKind: spec.unitKind,
        costUsd: aggregate.costUsd,
        costMinor: aggregate.costMinor,
        costCurrency: aggregate.costCurrency,
        window: { start: since.toISOString(), end: now.toISOString() },
      };
    }),
  );

  return {
    window: { name: window, start: since.toISOString(), end: now.toISOString() },
    generatedAt: now.toISOString(),
    domains,
  };
}
