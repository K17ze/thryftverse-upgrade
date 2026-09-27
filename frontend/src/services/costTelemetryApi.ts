import { fetchJson, ApiRequestError, parseApiError } from '../lib/apiClient';

// ────────────────────────────────────────────────────────────────────────────
// Per-domain cost telemetry (audit item R107).
//
// Wraps `GET /ops/v1/cost-telemetry` (backend routes/opsConsole.ts), which
// aggregates the existing AI/promotion cost ledgers into one per-domain read
// model: calls, usage units and spend over a trailing window.
//
// The endpoint is workforce-gated server-side (`ledger.read` permission on a
// thryftverse-ops token) — consumer sessions receive 401/403. This module only
// declares the typed shapes; it is intended for ops-facing surfaces.
// ────────────────────────────────────────────────────────────────────────────

/** Trailing window the server aggregates over. Server default: '1d'. */
export type CostTelemetryWindow = '1d' | '7d' | '30d';

export type CostTelemetryUnitKind =
  | 'tokens'
  | 'impressions'
  | 'served_items'
  | 'field_candidates'
  | 'operations'
  | 'embeddings'
  | 'events';

export interface DomainCostTelemetry {
  /** Product domain, e.g. 'chat_agents' | 'support_agent' | 'promotions'. */
  domain: string;
  /** Ledger table(s) backing this row. */
  ledgers: string[];
  /** Ledger entries (calls/runs/charges) inside the window. */
  calls: number;
  /** Domain usage units inside the window — meaning given by `unitKind`. */
  units: number;
  unitKind: CostTelemetryUnitKind;
  /** USD spend; null when the domain's ledger records no USD cost. */
  costUsd: number | null;
  /**
   * Raw micro-USD spend for USD micros ledgers (1 USD = 1e6 micros) —
   * the precision-preserving counterpart of costUsd, NOT a minor unit.
   */
  costMicrosUsd: number | null;
  /**
   * Native ISO-4217 minor-unit spend for non-USD ledgers (GBP pence =
   * promotions). Null on USD domains — their raw precision is costMicrosUsd.
   */
  costMinor: number | null;
  costCurrency: 'USD' | 'GBP' | null;
  window: { start: string; end: string };
}

export interface CostTelemetryReport {
  window: { name: CostTelemetryWindow; start: string; end: string };
  generatedAt: string;
  domains: DomainCostTelemetry[];
}

interface CostTelemetryResponse extends CostTelemetryReport {
  ok: boolean;
}

/**
 * Raised when the cost-telemetry endpoint returns a non-2xx response (e.g.
 * 401 without a workforce token, 403 without the `ledger.read` grant).
 */
export class CostTelemetryError extends Error {
  readonly status: number | undefined;
  readonly code: string | null;
  readonly isNetworkError: boolean;

  constructor(cause: unknown, fallback = 'Cost telemetry request failed') {
    const parsed = parseApiError(cause, fallback);
    super(parsed.message);
    this.name = 'CostTelemetryError';
    this.status = parsed.status;
    this.code = parsed.code;
    this.isNetworkError = parsed.isNetworkError;
  }
}

/** GET /ops/v1/cost-telemetry — per-domain spend/usage over `window`. */
export async function fetchCostTelemetry(
  window?: CostTelemetryWindow
): Promise<CostTelemetryReport> {
  try {
    const query = window ? `?window=${encodeURIComponent(window)}` : '';
    const payload = await fetchJson<CostTelemetryResponse>(
      `/ops/v1/cost-telemetry${query}`
    );
    return {
      window: payload.window,
      generatedAt: payload.generatedAt,
      domains: Array.isArray(payload.domains) ? payload.domains : [],
    };
  } catch (cause) {
    throw cause instanceof CostTelemetryError ? cause : new CostTelemetryError(cause);
  }
}

export { ApiRequestError };
