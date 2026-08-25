/**
 * Concrete IP reputation providers for the ThryftVerse risk decision
 * system (FR-09 — governed provider interface).
 *
 * This module implements three production-grade providers and a factory:
 *
 *  - `SpurIpReputationProvider`   — queries the Spur context API
 *    (https://api.spur.us/v2/context/ip). Includes a 5-minute in-memory
 *    cache to avoid redundant API calls for the same IP.
 *  - `MaxMindIpReputationProvider` — local GeoIP2/GeoLite2 database
 *    lookup via the `maxmind` npm library. No network call.
 *  - `CompositeIpReputationProvider` — queries all configured providers
 *    in parallel and merges results (highest risk wins, flags OR-ed,
 *    most specific geo preserved).
 *  - `createIpReputationProvider(config)` — factory that selects the
 *    right provider based on configuration.
 *
 * Anti-fabrication invariant (AGENTS.md §11):
 *  - The noOp provider (imported from riskDecision.ts) returns `unknown`
 *    for every query — it NEVER fabricates a "clean" reputation.
 *  - A "clean" reputation can only come from a real provider that has
 *    actual data for the IP.
 *  - If a provider API call fails, the provider returns `unknown` — it
 *    never throws and never fabricates a verdict.
 *
 * All providers are idempotent and side-effect-free per the
 * `IpReputationProvider` interface contract.
 *
 * Dependency note:
 *  The `maxmind` npm package is NOT installed by default. To enable the
 *  MaxMind provider, install it:
 *      npm install maxmind
 *  and download a GeoLite2-City / GeoLite2-ASN database from MaxMind.
 *  When the library is not installed, `MaxMindIpReputationProvider`
 *  gracefully degrades to `unknown` verdicts and logs a warning.
 */

import type {
  IpReputationProvider,
  IpReputationVerdict,
} from './riskDecision.js';
import { noOpIpReputationProvider } from './riskDecision.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * The canonical `unknown` verdict. Used whenever a provider cannot produce
 * a real result (API failure, library missing, malformed response). This
 * preserves the anti-fabrication invariant — the system never claims an IP
 * is clean when it has no data.
 */
function unknownVerdict(raw: Record<string, unknown> = {}): IpReputationVerdict {
  return {
    risk: 'unknown',
    isProxy: null,
    isTor: null,
    countryCode: null,
    asn: null,
    isDatacenter: null,
    raw,
  };
}

/**
 * Ordered risk levels from lowest to highest. Used by the composite
 * provider to pick the most severe verdict across providers.
 */
const RISK_ORDER: ReadonlyArray<IpReputationVerdict['risk']> = [
  'clean',
  'low',
  'medium',
  'high',
  'blocklisted',
  // 'unknown' is handled specially — it never overrides a real verdict.
];

/**
 * Return the numeric severity of a risk level. `unknown` is treated as
 * less severe than `clean` so that a real verdict always wins over an
 * unknown one during merging.
 */
function riskSeverity(risk: IpReputationVerdict['risk']): number {
  if (risk === 'unknown') return -1;
  return RISK_ORDER.indexOf(risk);
}

/**
 * Minimal logger interface so providers don't depend on a concrete logger.
 * Matches the structural shape used by `RiskDecisionServiceDependencies`.
 */
interface ProviderLogger {
  warn?: (obj: unknown, msg: string) => void;
  info?: (obj: unknown, msg: string) => void;
}

// ---------------------------------------------------------------------------
// SpurIpReputationProvider
// ---------------------------------------------------------------------------

/**
 * Spur API response shape (subset relevant to reputation mapping).
 *
 * Spur's v2 context endpoint returns an object keyed by the queried IP.
 * We parse defensively with type guards rather than trusting the shape,
 * but this interface documents the fields we look for.
 *
 * Reference: https://api.spur.us/v2/context/ip
 */
interface SpurResponse {
  // Spur returns the IP as a top-level key in the response object.
  [ip: string]: {
    // Risk classification. Spur returns a string category; we map it.
    risks?: {
      // e.g. "tor", "proxy", "vpn", "datacenter", "spam", etc.
      [category: string]: boolean | undefined;
    };
    // Spur's overall risk score 0-100 (higher = riskier).
    risk_score?: number;
    // Infrastructure classification.
    infrastructure?: {
      type?: string; // e.g. "residential", "datacenter", "mobile", "tor"
    };
    // Geo data.
    geo?: {
      country?: string; // ISO-3166-1 alpha-2
    };
    // ASN / organization data.
    as?: {
      number?: number; // ASN number without "AS" prefix
    };
  } | undefined;
}

const SPUR_API_BASE = 'https://api.spur.us/v2/context/ip';
const SPUR_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Spur IP reputation provider.
 *
 * Queries the Spur context API for each IP and maps the response to an
 * `IpReputationVerdict`. Includes a simple in-memory cache (TTL 5 minutes)
 * to avoid redundant API calls for the same IP within the TTL window.
 *
 * On any error (network, auth, parse), returns `unknown` — never throws.
 */
export class SpurIpReputationProvider implements IpReputationProvider {
  readonly name = 'spur';

  private readonly apiKey: string;
  private readonly logger: ProviderLogger | undefined;
  private readonly cache = new Map<string, { verdict: IpReputationVerdict; expiresAt: number }>();

  constructor(apiKey: string, logger?: ProviderLogger) {
    this.apiKey = apiKey;
    this.logger = logger;
  }

  async query(ip: string): Promise<IpReputationVerdict> {
    // Cache lookup
    const cached = this.cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.verdict;
    }

    const verdict = await this.queryRemote(ip);
    // Cache even unknown verdicts to avoid hammering the API on repeated
    // failures — the TTL applies uniformly.
    this.cache.set(ip, { verdict, expiresAt: Date.now() + SPUR_CACHE_TTL_MS });
    return verdict;
  }

  private async queryRemote(ip: string): Promise<IpReputationVerdict> {
    try {
      const response = await fetch(`${SPUR_API_BASE}/${encodeURIComponent(ip)}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Token': this.apiKey,
        },
      });

      if (!response.ok) {
        this.logger?.warn?.(
          { ip, status: response.status, provider: 'spur' },
          'Spur API returned non-OK status',
        );
        return unknownVerdict({ provider: 'spur', httpStatus: response.status });
      }

      const body: unknown = await response.json();
      const parsed = this.parseSpurResponse(body, ip);
      return parsed;
    } catch (err) {
      this.logger?.warn?.(
        { err, ip, provider: 'spur' },
        'Spur API query failed',
      );
      return unknownVerdict({ provider: 'spur', error: String(err) });
    }
  }

  /**
   * Defensively parse the Spur response using type guards. Never throws —
   * any structural mismatch yields `unknown`.
   */
  private parseSpurResponse(body: unknown, ip: string): IpReputationVerdict {
    if (typeof body !== 'object' || body === null) {
      return unknownVerdict({ provider: 'spur', reason: 'non-object response' });
    }

    const root = body as SpurResponse;
    const entry = root[ip];
    if (typeof entry !== 'object' || entry === null) {
      return unknownVerdict({ provider: 'spur', reason: 'no entry for ip' });
    }

    const risks = entry.risks;
    const riskScore = typeof entry.risk_score === 'number' ? entry.risk_score : null;
    const infraType = entry.infrastructure?.type ?? null;
    const countryCode = entry.geo?.country ?? null;
    const asnNumber = entry.as?.number ?? null;

    // Map Spur risk signals.
    const isTor = this.readRiskFlag(risks, 'tor');
    const isProxy = this.readRiskFlag(risks, 'proxy') || this.readRiskFlag(risks, 'vpn');
    const isDatacenter = infraType === 'datacenter' || this.readRiskFlag(risks, 'datacenter');

    // Map overall risk level. Prefer the explicit risk_score when present;
    // otherwise infer from the presence of risk flags.
    const risk = this.mapRiskLevel(riskScore, { isTor, isProxy, isDatacenter });

    return {
      risk,
      isProxy,
      isTor,
      countryCode: typeof countryCode === 'string' ? countryCode : null,
      asn: typeof asnNumber === 'number' ? String(asnNumber) : null,
      isDatacenter,
      raw: body as Record<string, unknown>,
    };
  }

  /**
   * Read a boolean risk flag from the Spur `risks` object, defaulting to
   * `null` (unknown) when absent.
   */
  private readRiskFlag(
    risks: Record<string, boolean | undefined> | undefined,
    category: string,
  ): boolean | null {
    if (!risks || typeof risks !== 'object') {
      return null;
    }
    const value = risks[category];
    return typeof value === 'boolean' ? value : null;
  }

  /**
   * Map Spur's risk score (0-100) and boolean flags to our risk enum.
   * When a numeric score is present it takes precedence; otherwise we
   * infer from the flags.
   */
  private mapRiskLevel(
    riskScore: number | null,
    flags: { isTor: boolean | null; isProxy: boolean | null; isDatacenter: boolean | null },
  ): IpReputationVerdict['risk'] {
    if (riskScore !== null) {
      if (riskScore >= 90) return 'blocklisted';
      if (riskScore >= 70) return 'high';
      if (riskScore >= 40) return 'medium';
      if (riskScore >= 15) return 'low';
      return 'clean';
    }

    // No numeric score — infer from flags. A Tor exit or proxy is at
    // least medium; datacenter alone is low; otherwise clean only if we
    // actually have data (which we do, since we got a response).
    if (flags.isTor === true) return 'high';
    if (flags.isProxy === true) return 'medium';
    if (flags.isDatacenter === true) return 'low';
    return 'clean';
  }
}

// ---------------------------------------------------------------------------
// MaxMindIpReputationProvider
// ---------------------------------------------------------------------------

/**
 * The shape of the `maxmind` library's lookup result that we consume.
 * We define a structural type so we don't import the package at compile
 * time (it may not be installed). The actual library returns richer
 * objects; we only read the fields we need.
 */
interface MaxMindCityResponse {
  country?: { iso_code?: string };
  traits?: {
    autonomous_system_number?: number;
    is_anonymous_proxy?: boolean;
    is_anycast?: boolean;
    is_hosting_provider?: boolean;
  };
}

interface MaxMindAsnResponse {
  autonomous_system_number?: number;
  autonomous_system_organization?: string;
}

interface MaxMindReader<CityT, AsnT> {
  get(ip: string): CityT | null;
}

interface MaxMindModule {
  open<CityT = MaxMindCityResponse, AsnT = MaxMindAsnResponse>(
    dbPath: string,
    opts?: Record<string, unknown>,
  ): Promise<MaxMindReader<CityT, AsnT>>;
}

/**
 * MaxMind GeoIP2/GeoLite2 IP reputation provider.
 *
 * Performs a local database lookup (no network call) using the `maxmind`
 * npm library. MaxMind provides country, ASN, and basic risk indicators
 * (anonymous proxy, hosting provider).
 *
 * The `maxmind` package is an optional dependency. If it is not installed,
 * the provider gracefully degrades to `unknown` verdicts and logs a
 * warning on first use. This lets the codebase compile and run without
 * the package; operators install it only when they want MaxMind lookups.
 *
 * On any error (missing DB file, corrupt DB, parse failure), returns
 * `unknown` — never throws.
 */
export class MaxMindIpReputationProvider implements IpReputationProvider {
  readonly name = 'maxmind';

  private readonly dbPath: string;
  private readonly logger: ProviderLogger | undefined;
  private readerPromise: Promise<MaxMindReader<MaxMindCityResponse, MaxMindAsnResponse> | null> | null = null;
  private loadFailed = false;

  constructor(dbPath: string, logger?: ProviderLogger) {
    this.dbPath = dbPath;
    this.logger = logger;
  }

  async query(ip: string): Promise<IpReputationVerdict> {
    if (this.loadFailed) {
      return unknownVerdict({ provider: 'maxmind', reason: 'library or db unavailable' });
    }

    const reader = await this.getReader();
    if (reader === null) {
      this.loadFailed = true;
      return unknownVerdict({ provider: 'maxmind', reason: 'library or db unavailable' });
    }

    try {
      const city = reader.get(ip);
      if (city === null || city === undefined) {
        // No data for this IP in the database — honest unknown.
        return unknownVerdict({ provider: 'maxmind', ip, reason: 'no db entry' });
      }

      const countryCode = city.country?.iso_code ?? null;
      const asnNumber = city.traits?.autonomous_system_number ?? null;
      const isProxy = city.traits?.is_anonymous_proxy === true ? true : null;
      const isDatacenter = city.traits?.is_hosting_provider === true ? true : null;

      // MaxMind GeoLite2 does not provide Tor detection or a risk score.
      // We infer a minimal risk level from the available signals. A clean
      // verdict is only returned when we have real data (which we do).
      const risk = this.inferRisk(isProxy, isDatacenter);

      return {
        risk,
        isProxy,
        isTor: null, // MaxMind does not provide Tor exit detection.
        countryCode: typeof countryCode === 'string' ? countryCode : null,
        asn: typeof asnNumber === 'number' ? String(asnNumber) : null,
        isDatacenter,
        raw: city as unknown as Record<string, unknown>,
      };
    } catch (err) {
      this.logger?.warn?.(
        { err, ip, provider: 'maxmind' },
        'MaxMind lookup failed',
      );
      return unknownVerdict({ provider: 'maxmind', error: String(err) });
    }
  }

  /**
   * Lazily load the maxmind reader. The library is imported dynamically so
   * the codebase compiles and runs without the package installed. The
   * import is cached so we only attempt it once.
   */
  private getReader(): Promise<MaxMindReader<MaxMindCityResponse, MaxMindAsnResponse> | null> {
    if (this.readerPromise !== null) {
      return this.readerPromise;
    }

    this.readerPromise = (async () => {
      try {
        // Dynamic import with a non-literal specifier so TypeScript does
        // not statically resolve (and error on) the optional `maxmind`
        // dependency. The cast through `unknown` preserves type safety
        // without resorting to `any`. Fails gracefully at runtime if the
        // package is not installed.
        const moduleName = 'maxmind';
        const mod = (await import(moduleName)) as unknown as MaxMindModule;
        const reader = await mod.open<MaxMindCityResponse, MaxMindAsnResponse>(this.dbPath);
        this.logger?.info?.(
          { dbPath: this.dbPath, provider: 'maxmind' },
          'MaxMind database loaded',
        );
        return reader;
      } catch (err) {
        this.logger?.warn?.(
          { err, dbPath: this.dbPath, provider: 'maxmind' },
          'Failed to load MaxMind database (is the `maxmind` npm package installed and the db path valid?)',
        );
        return null;
      }
    })();

    return this.readerPromise;
  }

  /**
   * Infer a risk level from MaxMind's limited signals. MaxMind does not
   * provide a risk score, so we map anonymous-proxy → high and hosting
   * provider → low. A residential IP with no risk flags is `clean` —
   * but only because we have real data for it.
   */
  private inferRisk(
    isProxy: boolean | null,
    isDatacenter: boolean | null,
  ): IpReputationVerdict['risk'] {
    if (isProxy === true) return 'high';
    if (isDatacenter === true) return 'low';
    return 'clean';
  }
}

// ---------------------------------------------------------------------------
// CompositeIpReputationProvider
// ---------------------------------------------------------------------------

/**
 * Composite IP reputation provider.
 *
 * Queries all configured providers in parallel and merges the results:
 *  - `risk`: the highest severity across all non-`unknown` verdicts.
 *  - `isProxy` / `isTor` / `isDatacenter`: OR-ed — true if any provider
 *    reports true; null only if all providers report null.
 *  - `countryCode` / `asn`: the most specific (first non-null) value,
 *    preferring providers earlier in the list (higher priority).
 *  - `raw`: merged object with each provider's raw response keyed by name.
 *
 * If all providers return `unknown`, the composite returns `unknown` —
 * preserving the anti-fabrication invariant.
 */
export class CompositeIpReputationProvider implements IpReputationProvider {
  readonly name = 'composite';

  private readonly providers: readonly IpReputationProvider[];

  constructor(providers: readonly IpReputationProvider[]) {
    if (providers.length === 0) {
      throw new Error('CompositeIpReputationProvider requires at least one provider');
    }
    this.providers = providers;
  }

  async query(ip: string): Promise<IpReputationVerdict> {
    const verdicts = await Promise.all(
      this.providers.map((p) =>
        p.query(ip).catch((err): IpReputationVerdict => {
          // A provider should never throw (it returns unknown on error),
          // but we defend against it so the composite never fails.
          return unknownVerdict({ provider: p.name, error: String(err) });
        }),
      ),
    );

    return this.merge(verdicts);
  }

  private merge(verdicts: IpReputationVerdict[]): IpReputationVerdict {
    // If every verdict is unknown, the merged result is unknown.
    const real = verdicts.filter((v) => v.risk !== 'unknown');
    if (real.length === 0) {
      return unknownVerdict(this.mergeRaw(verdicts));
    }

    // Highest-severity risk wins.
    const risk = real.reduce<IpReputationVerdict['risk']>((highest, v) => {
      return riskSeverity(v.risk) > riskSeverity(highest) ? v.risk : highest;
    }, real[0]!.risk);

    // OR-ed boolean flags. null only if every provider reports null.
    const isProxy = orNullableFlags(verdicts.map((v) => v.isProxy));
    const isTor = orNullableFlags(verdicts.map((v) => v.isTor));
    const isDatacenter = orNullableFlags(verdicts.map((v) => v.isDatacenter));

    // Most specific geo: first non-null, in provider priority order.
    const countryCode = firstNonNull(verdicts.map((v) => v.countryCode));
    const asn = firstNonNull(verdicts.map((v) => v.asn));

    return {
      risk,
      isProxy,
      isTor,
      countryCode,
      asn,
      isDatacenter,
      raw: this.mergeRaw(verdicts),
    };
  }

  private mergeRaw(verdicts: IpReputationVerdict[]): Record<string, unknown> {
    const merged: Record<string, unknown> = {};
    for (const v of verdicts) {
      // The composite doesn't know individual provider names here, so we
      // key by index to avoid collisions. The raw payloads are kept for
      // audit and are never exposed to end users.
      merged[`provider_${this.providers[verdicts.indexOf(v)]?.name ?? 'unknown'}`] = v.raw;
    }
    return merged;
  }
}

/**
 * OR a list of nullable booleans. Returns `true` if any is true, `false`
 * if none are true but at least one is false, and `null` only if every
 * value is `null` (all unknown).
 */
function orNullableFlags(flags: Array<boolean | null>): boolean | null {
  let hasFalse = false;
  for (const f of flags) {
    if (f === true) return true;
    if (f === false) hasFalse = true;
  }
  return hasFalse ? false : null;
}

/**
 * Return the first non-null value in the list, or null if all are null.
 */
function firstNonNull<T>(values: Array<T | null>): T | null {
  for (const v of values) {
    if (v !== null && v !== undefined) {
      return v;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Configuration consumed by the factory. This mirrors the config entries
 * added to `config.ts` but is defined structurally so the factory can be
 * unit-tested without importing the global config.
 */
export interface IpReputationProviderConfig {
  /** Which provider mode to use. */
  ipReputationProvider: 'spur' | 'maxmind' | 'composite' | 'noop';
  /** Spur API key, required for the spur / composite modes. */
  spurApiKey: string | null;
  /** Filesystem path to the MaxMind GeoLite2/GeoIP2 database. */
  maxmindDbPath: string | null;
}

/**
 * Create the appropriate IP reputation provider from configuration.
 *
 * Selection logic:
 *  - If `ipReputationProvider` is explicitly set, honour it (validating
 *    that the required credentials/path are present).
 *  - Otherwise auto-select: Spur if `spurApiKey` is set, MaxMind if
 *    `maxmindDbPath` is set, composite if both, noop if neither.
 *  - If a provider mode is requested but its credential is missing, fall
 *    back to `noop` and log a warning rather than throwing — the system
 *    must remain operational (degraded) rather than crash.
 */
export function createIpReputationProvider(
  config: IpReputationProviderConfig,
  logger?: ProviderLogger,
): IpReputationProvider {
  const { ipReputationProvider, spurApiKey, maxmindDbPath } = config;

  const spurAvailable = spurApiKey !== null && spurApiKey.length > 0;
  const maxmindAvailable = maxmindDbPath !== null && maxmindDbPath.length > 0;

  // Explicit mode takes precedence.
  switch (ipReputationProvider) {
    case 'noop':
      return noOpIpReputationProvider;

    case 'spur': {
      if (!spurAvailable) {
        logger?.warn?.(
          { mode: 'spur' },
          'IP reputation mode is "spur" but SPUR_API_KEY is not set — falling back to noop',
        );
        return noOpIpReputationProvider;
      }
      return new SpurIpReputationProvider(spurApiKey!, logger);
    }

    case 'maxmind': {
      if (!maxmindAvailable) {
        logger?.warn?.(
          { mode: 'maxmind' },
          'IP reputation mode is "maxmind" but MAXMIND_DB_PATH is not set — falling back to noop',
        );
        return noOpIpReputationProvider;
      }
      return new MaxMindIpReputationProvider(maxmindDbPath!, logger);
    }

    case 'composite': {
      if (!spurAvailable && !maxmindAvailable) {
        logger?.warn?.(
          { mode: 'composite' },
          'IP reputation mode is "composite" but neither SPUR_API_KEY nor MAXMIND_DB_PATH is set — falling back to noop',
        );
        return noOpIpReputationProvider;
      }
      const providers: IpReputationProvider[] = [];
      if (spurAvailable) {
        providers.push(new SpurIpReputationProvider(spurApiKey!, logger));
      }
      if (maxmindAvailable) {
        providers.push(new MaxMindIpReputationProvider(maxmindDbPath!, logger));
      }
      return new CompositeIpReputationProvider(providers);
    }

    default: {
      // Exhaustiveness check — if a new mode is added to the union but
      // not handled here, TypeScript flags it.
      const _exhaustive: never = ipReputationProvider;
      void _exhaustive;
      return noOpIpReputationProvider;
    }
  }
}
