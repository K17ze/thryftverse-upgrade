/**
 * 1ze At-Par Pricing Engine — Authoritative Non-ML Commerce Logic
 *
 * This module is the authoritative source for 1ze at-par e-money pricing.
 * All calculations are deterministic: 1 1ZE = $1.00 USD at par. Prices are
 * derived from the anchor value, FX rates, and transparent platform fees.
 * No ML model participates in price determination. There is no
 * markup/markdown/PPP token economics model — 1ZE is at-par e-money.
 *
 * Per the authoritative boundaries policy (docs/AUTHORITATIVE_BOUNDARIES.md),
 * 1ze pricing is a High-tier system: the model may provide evidence only;
 * authoritative policy and deterministic code own the action. Fee bounds
 * are enforced by validatePricingProfileInput().
 */
type Queryable = {
  query: <T = Record<string, unknown>>(
    text: string,
    values?: unknown[]
  ) => Promise<{ rows: T[]; rowCount: number | null }>;
};

const PLATFORM_FEE_MIN_BPS = 100;
const PLATFORM_FEE_MAX_BPS = 300;

export const PLATFORM_LOAD_FEE_BPS = 200;
export const PLATFORM_WITHDRAW_FEE_BPS = 200;
export const PLATFORM_CONVERT_FEE_BPS = 150;

export const PRICING_PARAMETER_BOUNDS = {
  platformFeeBps: {
    min: PLATFORM_FEE_MIN_BPS,
    max: PLATFORM_FEE_MAX_BPS,
  },
} as const;

const ROUND_DECIMALS = 6;

function roundTo(value: number, decimals = ROUND_DECIMALS): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toCountryCode(value: string): string {
  return value.trim().toUpperCase();
}

function toCurrencyCode(value: string): string {
  return value.trim().toUpperCase();
}

function parseNumeric(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('Invalid numeric value');
  }

  return parsed;
}

export interface OnezeAnchorConfig {
  anchorCurrency: string;
  anchorValue: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface OnezeCountryPricingProfile {
  countryCode: string;
  currency: string;
  fxFeeBps: number;
  loadFeeBps: number;
  withdrawFeeBps: number;
  withdrawalLockHours: number;
  dailyRedeemLimitIze: number;
  weeklyRedeemLimitIze: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

export interface OnezePricingQuote {
  countryCode: string;
  currency: string;
  anchorCurrency: string;
  anchorValueInInr: number;
  fxRateInrToLocal: number;
  source: string;
  updatedAt: string;
  principalRate: number;
  fxRate: number;
  platformFeeBps: number;
  loadFeeBps: number;
  withdrawFeeBps: number;
  principalAmount: number;
  feeAmount: number;
  totalCost: number;
  netRedemption: number;
}

export function calculateAtParPricing(input: {
  anchorValue: number;
  fxRate: number;
  feeBps: number;
  direction?: 'load' | 'withdraw';
  loadFeeBps?: number;
  withdrawFeeBps?: number;
}) {
  const effectiveFeeBps =
    input.direction === 'load' && input.loadFeeBps != null
      ? input.loadFeeBps
      : input.direction === 'withdraw' && input.withdrawFeeBps != null
        ? input.withdrawFeeBps
        : input.feeBps;
  const principalAmount = roundTo(input.anchorValue * input.fxRate);
  const feeAmount = roundTo(principalAmount * (effectiveFeeBps / 10_000));
  return {
    principalAmount,
    feeAmount,
    totalCost: roundTo(principalAmount + feeAmount),
    netRedemption: roundTo(principalAmount - feeAmount),
    rate: input.fxRate,
    feeBps: effectiveFeeBps,
  };
}

export function validatePricingProfileInput(input: {
  platformFeeBps?: number;
  loadFeeBps?: number;
  withdrawFeeBps?: number;
  fxFeeBps?: number;
}): void {
  const platformFeeBps = input.platformFeeBps ?? PLATFORM_LOAD_FEE_BPS;
  if (platformFeeBps < PLATFORM_FEE_MIN_BPS || platformFeeBps > PLATFORM_FEE_MAX_BPS) {
    throw new Error(`platformFeeBps must be between ${PLATFORM_FEE_MIN_BPS} and ${PLATFORM_FEE_MAX_BPS}`);
  }

  const loadFeeBps = input.loadFeeBps ?? PLATFORM_LOAD_FEE_BPS;
  if (loadFeeBps < PLATFORM_FEE_MIN_BPS || loadFeeBps > PLATFORM_FEE_MAX_BPS) {
    throw new Error(`loadFeeBps must be between ${PLATFORM_FEE_MIN_BPS} and ${PLATFORM_FEE_MAX_BPS}`);
  }

  const withdrawFeeBps = input.withdrawFeeBps ?? PLATFORM_WITHDRAW_FEE_BPS;
  if (withdrawFeeBps < PLATFORM_FEE_MIN_BPS || withdrawFeeBps > PLATFORM_FEE_MAX_BPS) {
    throw new Error(`withdrawFeeBps must be between ${PLATFORM_FEE_MIN_BPS} and ${PLATFORM_FEE_MAX_BPS}`);
  }

  const fxFeeBps = input.fxFeeBps ?? PLATFORM_CONVERT_FEE_BPS;
  if (fxFeeBps < PLATFORM_FEE_MIN_BPS || fxFeeBps > PLATFORM_FEE_MAX_BPS) {
    throw new Error(`fxFeeBps must be between ${PLATFORM_FEE_MIN_BPS} and ${PLATFORM_FEE_MAX_BPS}`);
  }
}

export async function pricingTablesAvailable(client: Queryable): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT
        to_regclass('public.oneze_anchor_config') IS NOT NULL
        AND to_regclass('public.oneze_country_pricing_profiles') IS NOT NULL
        AND to_regclass('public.oneze_internal_fx_rates') IS NOT NULL
        AND to_regclass('public.oneze_wallet_segments') IS NOT NULL
        AND to_regclass('public.oneze_conversion_events') IS NOT NULL AS exists
    `
  );

  return Boolean(result.rows[0]?.exists);
}

export async function getOnezeAnchorConfig(client: Queryable): Promise<OnezeAnchorConfig> {
  const result = await client.query<{
    anchor_currency: string;
    anchor_value: string;
    notes: string | null;
    metadata: Record<string, unknown>;
    updated_at: string;
  }>(
    `
      SELECT
        anchor_currency,
        anchor_value::text,
        notes,
        metadata,
        updated_at::text
      FROM oneze_anchor_config
      WHERE id = 1
      LIMIT 1
    `
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('1ze anchor configuration is missing');
  }

  return {
    anchorCurrency: row.anchor_currency,
    anchorValue: Number(row.anchor_value),
    notes: row.notes,
    metadata: row.metadata,
    updatedAt: row.updated_at,
  };
}

export async function setOnezeAnchorConfig(
  client: Queryable,
  input: {
    anchorCurrency?: string;
    anchorValue: number;
    notes?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<OnezeAnchorConfig> {
  if (!Number.isFinite(input.anchorValue) || input.anchorValue <= 0) {
    throw new Error('anchorValue must be a positive number');
  }

  const anchorCurrency = toCurrencyCode(input.anchorCurrency ?? 'USD');

  await client.query(
    `
      INSERT INTO oneze_anchor_config (
        id,
        anchor_currency,
        anchor_value,
        notes,
        metadata,
        updated_at
      )
      VALUES (1, $1, $2, $3, $4::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE
        SET
          anchor_currency = EXCLUDED.anchor_currency,
          anchor_value = EXCLUDED.anchor_value,
          notes = EXCLUDED.notes,
          metadata = oneze_anchor_config.metadata || EXCLUDED.metadata,
          updated_at = NOW()
    `,
    [anchorCurrency, input.anchorValue, input.notes ?? null, JSON.stringify(input.metadata ?? {})]
  );

  return getOnezeAnchorConfig(client);
}

async function mapCountryProfileRow(row: {
  country_code: string;
  currency: string;
  fx_fee_bps: number;
  load_fee_bps: number;
  withdraw_fee_bps: number;
  withdrawal_lock_hours: number;
  daily_redeem_limit_ize: string | number;
  weekly_redeem_limit_ize: string | number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  updated_at: string;
}): Promise<OnezeCountryPricingProfile> {
  return {
    countryCode: row.country_code,
    currency: row.currency,
    fxFeeBps: row.fx_fee_bps,
    loadFeeBps: row.load_fee_bps,
    withdrawFeeBps: row.withdraw_fee_bps,
    withdrawalLockHours: row.withdrawal_lock_hours,
    dailyRedeemLimitIze: parseNumeric(row.daily_redeem_limit_ize),
    weeklyRedeemLimitIze: parseNumeric(row.weekly_redeem_limit_ize),
    isActive: row.is_active,
    metadata: row.metadata,
    updatedAt: row.updated_at,
  };
}

export async function getCountryPricingProfile(
  client: Queryable,
  countryCode: string
): Promise<OnezeCountryPricingProfile | null> {
  const normalizedCountry = toCountryCode(countryCode);

  const result = await client.query<{
    country_code: string;
    currency: string;
    fx_fee_bps: number;
    load_fee_bps: number;
    withdraw_fee_bps: number;
    withdrawal_lock_hours: number;
    daily_redeem_limit_ize: string | number;
    weekly_redeem_limit_ize: string | number;
    is_active: boolean;
    metadata: Record<string, unknown>;
    updated_at: string;
  }>(
    `
      SELECT
        country_code,
        currency,
        fx_fee_bps,
        load_fee_bps,
        withdraw_fee_bps,
        withdrawal_lock_hours,
        daily_redeem_limit_ize::text,
        weekly_redeem_limit_ize::text,
        is_active,
        metadata,
        updated_at::text
      FROM oneze_country_pricing_profiles
      WHERE country_code = $1
      LIMIT 1
    `,
    [normalizedCountry]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapCountryProfileRow(row);
}

export async function getCountryPricingProfileByCurrency(
  client: Queryable,
  currency: string
): Promise<OnezeCountryPricingProfile | null> {
  const normalizedCurrency = toCurrencyCode(currency);

  const result = await client.query<{
    country_code: string;
    currency: string;
    fx_fee_bps: number;
    load_fee_bps: number;
    withdraw_fee_bps: number;
    withdrawal_lock_hours: number;
    daily_redeem_limit_ize: string | number;
    weekly_redeem_limit_ize: string | number;
    is_active: boolean;
    metadata: Record<string, unknown>;
    updated_at: string;
  }>(
    `
      SELECT
        country_code,
        currency,
        fx_fee_bps,
        load_fee_bps,
        withdraw_fee_bps,
        withdrawal_lock_hours,
        daily_redeem_limit_ize::text,
        weekly_redeem_limit_ize::text,
        is_active,
        metadata,
        updated_at::text
      FROM oneze_country_pricing_profiles
      WHERE currency = $1
        AND is_active = TRUE
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [normalizedCurrency]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return mapCountryProfileRow(row);
}

export async function upsertCountryPricingProfile(
  client: Queryable,
  input: {
    countryCode: string;
    currency: string;
    fxFeeBps?: number;
    loadFeeBps?: number;
    withdrawFeeBps?: number;
    withdrawalLockHours?: number;
    dailyRedeemLimitIze?: number;
    weeklyRedeemLimitIze?: number;
    isActive?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<OnezeCountryPricingProfile> {
  validatePricingProfileInput(input);

  const normalizedCountry = toCountryCode(input.countryCode);
  const normalizedCurrency = toCurrencyCode(input.currency);
  const fxFeeBps = input.fxFeeBps ?? PLATFORM_LOAD_FEE_BPS;
  const loadFeeBps = input.loadFeeBps ?? PLATFORM_LOAD_FEE_BPS;
  const withdrawFeeBps = input.withdrawFeeBps ?? PLATFORM_WITHDRAW_FEE_BPS;

  await client.query(
    `
      INSERT INTO oneze_country_pricing_profiles (
        country_code,
        currency,
        fx_fee_bps,
        load_fee_bps,
        withdraw_fee_bps,
        withdrawal_lock_hours,
        daily_redeem_limit_ize,
        weekly_redeem_limit_ize,
        is_active,
        metadata,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW())
      ON CONFLICT (country_code)
      DO UPDATE
        SET
          currency = EXCLUDED.currency,
          fx_fee_bps = EXCLUDED.fx_fee_bps,
          load_fee_bps = EXCLUDED.load_fee_bps,
          withdraw_fee_bps = EXCLUDED.withdraw_fee_bps,
          withdrawal_lock_hours = EXCLUDED.withdrawal_lock_hours,
          daily_redeem_limit_ize = EXCLUDED.daily_redeem_limit_ize,
          weekly_redeem_limit_ize = EXCLUDED.weekly_redeem_limit_ize,
          is_active = EXCLUDED.is_active,
          metadata = oneze_country_pricing_profiles.metadata || EXCLUDED.metadata,
          updated_at = NOW()
    `,
    [
      normalizedCountry,
      normalizedCurrency,
      fxFeeBps,
      loadFeeBps,
      withdrawFeeBps,
      input.withdrawalLockHours ?? 168,
      input.dailyRedeemLimitIze ?? 500,
      input.weeklyRedeemLimitIze ?? 2000,
      input.isActive ?? true,
      JSON.stringify(input.metadata ?? {}),
    ]
  );

  const profile = await getCountryPricingProfile(client, normalizedCountry);
  if (!profile) {
    throw new Error('Failed to persist country pricing profile');
  }

  return profile;
}

export async function setInternalFxRate(
  client: Queryable,
  input: {
    baseCurrency: string;
    quoteCurrency: string;
    rate: number;
    source?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const baseCurrency = toCurrencyCode(input.baseCurrency);
  const quoteCurrency = toCurrencyCode(input.quoteCurrency);

  if (baseCurrency === quoteCurrency) {
    throw new Error('baseCurrency and quoteCurrency must differ');
  }

  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    throw new Error('rate must be a positive number');
  }

  await client.query(
    `
      INSERT INTO oneze_internal_fx_rates (
        base_currency,
        quote_currency,
        rate,
        source,
        metadata,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
      ON CONFLICT (base_currency, quote_currency)
      DO UPDATE
        SET
          rate = EXCLUDED.rate,
          source = EXCLUDED.source,
          metadata = oneze_internal_fx_rates.metadata || EXCLUDED.metadata,
          updated_at = NOW()
    `,
    [
      baseCurrency,
      quoteCurrency,
      input.rate,
      input.source ?? 'operator',
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

export async function resolveInternalFxRate(
  client: Queryable,
  baseCurrency: string,
  quoteCurrency: string
): Promise<{ rate: number; source: string; usedInverse: boolean }> {
  const base = toCurrencyCode(baseCurrency);
  const quote = toCurrencyCode(quoteCurrency);

  if (base === quote) {
    return {
      rate: 1,
      source: 'identity',
      usedInverse: false,
    };
  }

  const direct = await client.query<{ rate: string; source: string }>(
    `
      SELECT rate::text, source
      FROM oneze_internal_fx_rates
      WHERE base_currency = $1
        AND quote_currency = $2
      LIMIT 1
    `,
    [base, quote]
  );

  if (direct.rows[0]) {
    return {
      rate: Number(direct.rows[0].rate),
      source: direct.rows[0].source,
      usedInverse: false,
    };
  }

  const inverse = await client.query<{ rate: string; source: string }>(
    `
      SELECT rate::text, source
      FROM oneze_internal_fx_rates
      WHERE base_currency = $1
        AND quote_currency = $2
      LIMIT 1
    `,
    [quote, base]
  );

  if (!inverse.rows[0]) {
    throw new Error(`Missing internal FX rate for ${base}/${quote}`);
  }

  const inverseRate = Number(inverse.rows[0].rate);
  if (!Number.isFinite(inverseRate) || inverseRate <= 0) {
    throw new Error(`Invalid inverse FX rate for ${quote}/${base}`);
  }

  return {
    rate: roundTo(1 / inverseRate, 8),
    source: `${inverse.rows[0].source}:inverse`,
    usedInverse: true,
  };
}

export async function resolveCountryPricingQuote(
  client: Queryable,
  countryCode: string
): Promise<OnezePricingQuote> {
  const anchor = await getOnezeAnchorConfig(client);
  const profile = await getCountryPricingProfile(client, countryCode);

  if (!profile || !profile.isActive) {
    throw new Error(`Country pricing profile is unavailable for ${toCountryCode(countryCode)}`);
  }

  const fx = await resolveInternalFxRate(client, anchor.anchorCurrency, profile.currency);
  const loadAtPar = calculateAtParPricing({
    anchorValue: anchor.anchorValue,
    fxRate: fx.rate,
    feeBps: profile.fxFeeBps,
    direction: 'load',
    loadFeeBps: profile.loadFeeBps,
  });
  const withdrawAtPar = calculateAtParPricing({
    anchorValue: anchor.anchorValue,
    fxRate: fx.rate,
    feeBps: profile.fxFeeBps,
    direction: 'withdraw',
    withdrawFeeBps: profile.withdrawFeeBps,
  });

  return {
    countryCode: profile.countryCode,
    currency: profile.currency,
    anchorCurrency: anchor.anchorCurrency,
    anchorValueInInr: anchor.anchorValue,
    fxRateInrToLocal: fx.rate,
    source: `internal_pricing:${profile.countryCode}`,
    updatedAt: profile.updatedAt,
    principalRate: 1,
    fxRate: fx.rate,
    platformFeeBps: profile.fxFeeBps,
    loadFeeBps: profile.loadFeeBps,
    withdrawFeeBps: profile.withdrawFeeBps,
    principalAmount: loadAtPar.principalAmount,
    feeAmount: loadAtPar.feeAmount,
    totalCost: loadAtPar.totalCost,
    netRedemption: withdrawAtPar.netRedemption,
  };
}

export async function resolveCountryPricingQuoteByCurrency(
  client: Queryable,
  currency: string
): Promise<OnezePricingQuote> {
  const profile = await getCountryPricingProfileByCurrency(client, currency);

  if (!profile) {
    throw new Error(`Country pricing profile is unavailable for currency ${toCurrencyCode(currency)}`);
  }

  return resolveCountryPricingQuote(client, profile.countryCode);
}

export async function listCountryPricingQuotes(client: Queryable): Promise<OnezePricingQuote[]> {
  const profilesResult = await client.query<{
    country_code: string;
    currency: string;
    fx_fee_bps: number;
    load_fee_bps: number;
    withdraw_fee_bps: number;
    withdrawal_lock_hours: number;
    daily_redeem_limit_ize: string | number;
    weekly_redeem_limit_ize: string | number;
    is_active: boolean;
    metadata: Record<string, unknown>;
    updated_at: string;
  }>(
    `
      SELECT
        country_code,
        currency,
        fx_fee_bps,
        load_fee_bps,
        withdraw_fee_bps,
        withdrawal_lock_hours,
        daily_redeem_limit_ize::text,
        weekly_redeem_limit_ize::text,
        is_active,
        metadata,
        updated_at::text
      FROM oneze_country_pricing_profiles
      WHERE is_active = TRUE
      ORDER BY country_code ASC
    `
  );

  const profiles = await Promise.all(
    profilesResult.rows.map((row) => mapCountryProfileRow(row))
  );

  const anchor = await getOnezeAnchorConfig(client);

  const quotes: OnezePricingQuote[] = [];
  for (const profile of profiles) {
    const fx = await resolveInternalFxRate(client, anchor.anchorCurrency, profile.currency);
    const loadAtPar = calculateAtParPricing({
      anchorValue: anchor.anchorValue,
      fxRate: fx.rate,
      feeBps: profile.fxFeeBps,
      direction: 'load',
      loadFeeBps: profile.loadFeeBps,
    });
    const withdrawAtPar = calculateAtParPricing({
      anchorValue: anchor.anchorValue,
      fxRate: fx.rate,
      feeBps: profile.fxFeeBps,
      direction: 'withdraw',
      withdrawFeeBps: profile.withdrawFeeBps,
    });

    quotes.push({
      countryCode: profile.countryCode,
      currency: profile.currency,
      anchorCurrency: anchor.anchorCurrency,
      anchorValueInInr: anchor.anchorValue,
      fxRateInrToLocal: fx.rate,
      source: `internal_pricing:${profile.countryCode}`,
      updatedAt: profile.updatedAt,
      principalRate: 1,
      fxRate: fx.rate,
      platformFeeBps: profile.fxFeeBps,
      loadFeeBps: profile.loadFeeBps,
      withdrawFeeBps: profile.withdrawFeeBps,
      principalAmount: loadAtPar.principalAmount,
      feeAmount: loadAtPar.feeAmount,
      totalCost: loadAtPar.totalCost,
      netRedemption: withdrawAtPar.netRedemption,
    });
  }

  return quotes;
}
